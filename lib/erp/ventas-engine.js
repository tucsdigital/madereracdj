import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase-admin";
import {
  getLineItemCodigo,
  getLineItemNombre,
  normalizeLineItemProductoId,
  resolveCanonicalProductoId,
} from "@/lib/erp/producto-id";
import {
  collectInventoryRequirements,
  isComboProduct,
  normalizeComboComponents,
} from "@/lib/combos";
import { normalizeVentaPaymentFields } from "@/lib/ventas-pagos";

const normalizeProductoId = normalizeLineItemProductoId;
const isMercadoPagoSale = (venta) => String(venta?.formaPago || venta?.pago || "").trim().toLowerCase().replace(/[\s_-]/g, "") === "mercadopago";
const hasApprovedMercadoPagoPayment = (venta) =>
  String(venta?.pagoMercadoPago?.status || "").toLowerCase() === "approved" && /^\d+$/.test(String(venta?.pagoMercadoPago?.paymentId || ""));
const isNonInventariableItem = (p) => {
  if (!p || typeof p !== "object") return false;
  if (p.noInventariable === true) return true;
  if (p.stockGestionado === false) return true;
  const id = String(p.id || "").trim();
  if (id.startsWith("ejemplo-")) return true;
  return false;
};

const parsePrecio = (p) => {
  const n = Number(p?.precio);
  return Number.isFinite(n) ? n : NaN;
};

const parseCostoProducto = (data) => {
  const candidates = [
    data?.costo,
    data?.valorCompra,
    data?.costoCompra,
    data?.costoUnitario,
    data?.precioCosto,
    data?.costoPromedio,
  ];
  for (const c of candidates) {
    const n = Number(c);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return NaN;
};

const stripUndefined = (value) =>
  JSON.parse(JSON.stringify(value, (_k, v) => (v === undefined ? undefined : v)));

async function resolveCanonicalLineItems({ t, db, lineItems }) {
  const resolvedItems = [];
  const productoById = new Map();
  const productosNoEncontrados = [];

  for (const item of Array.isArray(lineItems) ? lineItems : []) {
    const pid = normalizeProductoId(item);
    if (!pid) continue;

    let canonicalId = pid;
    let productoRef = db.collection("productos").doc(canonicalId);
    let snap = await t.get(productoRef);

    if (!snap?.exists) {
      canonicalId = await resolveCanonicalProductoId({
        t,
        db,
        pid,
        codigo: getLineItemCodigo(item),
        nombre: getLineItemNombre(item),
      });
      if (!canonicalId) {
        productosNoEncontrados.push({
          productoId: pid,
          productoNombre: String(getLineItemNombre(item) || pid),
          codigo: getLineItemCodigo(item) || null,
          motivo: "producto_no_encontrado",
        });
        continue;
      }
      productoRef = db.collection("productos").doc(canonicalId);
      snap = await t.get(productoRef);
      if (!snap?.exists) {
        productosNoEncontrados.push({
          productoId: canonicalId,
          productoNombre: String(getLineItemNombre(item) || canonicalId),
          codigo: getLineItemCodigo(item) || null,
          motivo: "producto_no_encontrado",
        });
        continue;
      }
    }

    productoById.set(canonicalId, snap.data() || {});
    resolvedItems.push({
      ...item,
      originalId: canonicalId,
      id: String(item?.id || "").trim() === pid ? canonicalId : item?.id,
    });
  }

  return { resolvedItems, productoById, productosNoEncontrados };
}

async function hydrateComboComponents({ t, db, lineItems, productoById }) {
  const componentIds = new Set();

  for (const item of Array.isArray(lineItems) ? lineItems : []) {
    const productId = normalizeProductoId(item);
    const producto = productoById.get(productId);
    if (!isComboProduct(item) && !isComboProduct(producto)) continue;

    const snapshotComponents = normalizeComboComponents(item?.componentesCombo);
    const componentes = snapshotComponents.length > 0
      ? snapshotComponents
      : normalizeComboComponents(producto?.componentesCombo);
    componentes.forEach(({ productoId: componentId }) => {
      if (componentId && !productoById.has(componentId)) componentIds.add(componentId);
    });
  }

  const ids = Array.from(componentIds);
  const snapshots = await Promise.all(
    ids.map((id) => t.get(db.collection("productos").doc(id)))
  );
  const missing = [];
  snapshots.forEach((snapshot, index) => {
    if (!snapshot?.exists) {
      missing.push(ids[index]);
      return;
    }
    productoById.set(ids[index], { ...(snapshot.data() || {}), id: snapshot.id });
  });

  if (missing.length > 0) {
    const error = new Error(`No se encontraron componentes del combo: ${missing.join(", ")}`);
    error.status = 400;
    throw error;
  }
}

async function readActiveReservationQuantities({ t, db, productIds, excludeVentaId, excludeOrderId }) {
  const ids = Array.from(new Set((productIds || []).map((id) => String(id).trim()).filter(Boolean)));
  const chunks = [];
  for (let index = 0; index < ids.length; index += 30) chunks.push(ids.slice(index, index + 30));
  const queries = chunks.flatMap((chunk) => [
    db.collection("reservasStock").where("productoId", "in", chunk),
    db.collection("reservasStock").where("componentIds", "array-contains-any", chunk),
  ]);
  const snapshots = await Promise.all(queries.map((query) => t.get(query)));
  const reservationsById = new Map();
  snapshots.forEach((snapshot) => snapshot.docs.forEach((document) => {
    reservationsById.set(document.id, document.data() || {});
  }));

  const reservedByProductId = new Map(ids.map((id) => [id, 0]));
  const now = Date.now();
  reservationsById.forEach((reservation) => {
    if (
      reservation.estado !== "activa" ||
      (excludeVentaId && reservation.ventaId === excludeVentaId) ||
      (excludeOrderId && reservation.orderId === excludeOrderId)
    ) return;
    const expiresAt = reservation.expiresAt?.toDate
      ? reservation.expiresAt.toDate().getTime()
      : Date.parse(reservation.expiresAt || "");
    if (!Number.isFinite(expiresAt) || expiresAt <= now) return;
    const quantity = Number(reservation.cantidad);
    if (!Number.isFinite(quantity) || quantity <= 0) return;
    const recipe = normalizeComboComponents(reservation.componentesReservados);
    if (recipe.length > 0) {
      recipe.forEach((component) => {
        if (reservedByProductId.has(component.productoId)) {
          reservedByProductId.set(
            component.productoId,
            reservedByProductId.get(component.productoId) + quantity * component.cantidad
          );
        }
      });
    } else {
      const productId = String(reservation.productoId || "");
      if (reservedByProductId.has(productId)) {
        reservedByProductId.set(productId, reservedByProductId.get(productId) + quantity);
      }
    }
  });
  return reservedByProductId;
}

function assertCombosConfigured(combosInvalidos = []) {
  if (combosInvalidos.length === 0) return;
  if (combosInvalidos.some((combo) => combo.motivo === "cantidad_combo_invalida")) {
    const error = new Error("La cantidad de cada combo vendido debe ser un número entero mayor que cero.");
    error.status = 400;
    throw error;
  }
  const names = combosInvalidos
    .map((combo) => combo.comboNombre || combo.comboId)
    .filter(Boolean)
    .join(", ");
  const error = new Error(`No se puede procesar un combo sin componentes configurados${names ? `: ${names}` : ""}`);
  error.status = 400;
  throw error;
}

const groupInventoryRequirements = ({ requiredById, productoById }) =>
  Array.from(requiredById.entries()).map(([productoId, cantidad]) => {
    const producto = productoById.get(productoId) || {};
    return {
      productoId,
      cantidad: Number(cantidad) || 0,
      nombre: String(producto?.nombre || productoId),
      codigo: String(producto?.codigo || ""),
    };
  });

const enrichComboLineSnapshots = (lineItems, productoById) =>
  (Array.isArray(lineItems) ? lineItems : []).map((item) => {
    const productId = normalizeProductoId(item);
    const producto = productoById.get(productId);
    if (!isComboProduct(item) && !isComboProduct(producto)) return item;
    const itemComponents = normalizeComboComponents(item?.componentesCombo);
    const componentesCombo = itemComponents.length > 0
      ? itemComponents
      : normalizeComboComponents(producto?.componentesCombo);
    return {
      ...item,
      esCombo: true,
      tipoProducto: "combo",
      componentesCombo,
      versionComposicion:
        Number(item?.versionComposicion) || Number(producto?.versionComposicion) || 1,
    };
  });

const readMaxNumeroPedido = async ({ db, collectionName, prefix }) => {
  try {
    const snap = await db
      .collection(collectionName)
      .orderBy("numeroPedido", "desc")
      .limit(1)
      .get();
    const first = snap.docs[0];
    if (!first) return 0;
    const raw = String(first.data()?.numeroPedido || "");
    if (!raw.startsWith(prefix)) return 0;
    const n = parseInt(raw.slice(prefix.length), 10);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
};

const nextNumeroPedidoTx = async ({ t, db, counterId, prefix, pad, seed }) => {
  const ref = db.collection("counters").doc(counterId);
  const snap = await t.get(ref);
  const currentStored = snap.exists ? Number(snap.data()?.value) || 0 : 0;
  const current = Math.max(currentStored, Number(seed) || 0);
  const next = current + 1;
  t.set(ref, { value: next, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return `${prefix}${String(next).padStart(pad, "0")}`;
};

const buildWarningsFromProductos = ({ productos }) => {
  const productosSinPrecio = [];
  for (const p of Array.isArray(productos) ? productos : []) {
    const precio = parsePrecio(p);
    if (!Number.isFinite(precio) || precio <= 0) {
      const productoId = normalizeProductoId(p);
      productosSinPrecio.push({
        productoId,
        productoNombre: String(p?.nombre || p?.descripcion || productoId || "Producto"),
        precio: Number.isFinite(precio) ? precio : null,
      });
    }
  }
  return { productosSinPrecio };
};

const finalizeFlags = ({ stockNegativo, productosSinPrecio, productosSinCosto, stockInsuficiente }) => {
  const requiereRevision = Boolean(stockNegativo || productosSinPrecio || productosSinCosto || stockInsuficiente);
  return { stockNegativo, productosSinPrecio, productosSinCosto, stockInsuficiente, requiereRevision };
};

export async function createVentaEngine({ actor, ventaData, origen = "sistema_ventas", orderReservationId = null, skipInventory = false }) {
  const db = getAdminDb();
  const seed = await readMaxNumeroPedido({ db, collectionName: "ventas", prefix: "VENTA-" });
  const idemKeyRaw = String(ventaData?.idempotencyKey || "").trim();
  const idemKey = idemKeyRaw ? idemKeyRaw.slice(0, 180) : "";
  const idemRef = idemKey ? db.collection("idempotency").doc(`venta_${idemKey}`) : null;
  const ventaRef = db.collection("ventas").doc();

  const result = await db.runTransaction(async (t) => {
    const counterRef = db.collection("counters").doc("ventas");
    const productos = Array.isArray(ventaData?.productos) ? ventaData.productos : [];
    const productosNoInventariados = productos
      .filter(isNonInventariableItem)
      .map((p) => ({
        productoId: String(p?.originalId || p?.id || "").trim(),
        productoNombre: String(p?.nombre || p?.descripcion || "Producto"),
        motivo: "no_inventariable",
      }));

    const reads = await Promise.all([
      idemRef ? t.get(idemRef) : Promise.resolve(null),
      t.get(counterRef),
      orderReservationId ? t.get(db.collection("reservasStock").where("orderId", "==", String(orderReservationId))) : Promise.resolve(null),
    ]);

    const idemSnap = reads[0];
    if (idemSnap?.exists) {
      const existingVentaId = String(idemSnap.data()?.ventaId || "").trim();
      const existingNumeroPedido = String(idemSnap.data()?.numeroPedido || "").trim();
      if (existingVentaId) {
        return {
          id: existingVentaId,
          numeroPedido: existingNumeroPedido,
          flags: idemSnap.data()?.flags || {},
        };
      }
    }

    const counterSnap = reads[idemRef ? 1 : 0];
    const orderReservations = reads[2]?.docs || [];
    const currentStored = counterSnap?.exists ? Number(counterSnap.data()?.value) || 0 : 0;
    const current = Math.max(currentStored, Number(seed) || 0);
    const next = current + 1;
    const numeroPedido = `VENTA-${String(next).padStart(5, "0")}`;

    const nowIso = new Date().toISOString();
    const ventaBase = stripUndefined({
      ...ventaData,
      ecommerceLifecycle: ventaData?.ecommerceLifecycle === true || String(origen || "").toLowerCase() === "ecommerce_externo",
      origen: ventaData?.origen || origen,
      numeroPedido,
      fechaCreacion: ventaData?.fechaCreacion || nowIso,
      vendedor: ventaData?.vendedor || actor?.email || "Usuario no identificado",
      tipo: "venta",
    });
    const venta = stripUndefined({
      ...ventaBase,
      ...normalizeVentaPaymentFields({
        venta: ventaBase,
        actorEmail: actor?.email || ventaBase?.vendedor || "Sistema",
        defaultFecha: ventaBase?.fechaCreacion || nowIso,
      }),
    });

    const mpEcommerce = venta.ecommerceLifecycle === true && isMercadoPagoSale(venta);
    const approvedMpPayment = !mpEcommerce || hasApprovedMercadoPagoPayment(venta);
    if (mpEcommerce && venta.estadoPago === "pagado" && !approvedMpPayment) {
      throw Object.assign(new Error("El stock de Mercado Pago solo se descuenta con un pago aprobado y verificado."), { status: 409 });
    }
    if (orderReservationId && mpEcommerce && (!approvedMpPayment || venta.estadoPago !== "pagado")) {
      throw Object.assign(new Error("No se puede consumir la reserva de stock sin aprobación de Mercado Pago."), { status: 409 });
    }
    const reserveOnly = venta.ecommerceLifecycle === true && (venta.estadoPago !== "pagado" || !approvedMpPayment) && !skipInventory;

    const inventariablesRaw = productos.filter((p) => !isNonInventariableItem(p));
    const {
      resolvedItems: inventariables,
      productoById: inventariableProductoById,
      productosNoEncontrados,
    } = await resolveCanonicalLineItems({
      t,
      db,
      lineItems: inventariablesRaw,
    });
    let comboHydrationIssue = null;
    try {
      await hydrateComboComponents({
        t,
        db,
        lineItems: inventariables,
        productoById: inventariableProductoById,
      });
    } catch (error) {
      if (!skipInventory) throw error;
      comboHydrationIssue = {
        comboId: "pedido",
        comboNombre: "Pedido con pago aprobado",
        motivo: error.message || "componentes_no_disponibles",
      };
    }
    const { requiredById, combosInvalidos: collectedCombosInvalidos } = collectInventoryRequirements({
      lineItems: inventariables,
      productoById: inventariableProductoById,
    });
    const combosInvalidos = comboHydrationIssue ? [...collectedCombosInvalidos, comboHydrationIssue] : collectedCombosInvalidos;
    if (venta.ecommerceLifecycle && productosNoEncontrados.length && !skipInventory) throw new Error("Un producto del pedido ya no existe");
    if (!skipInventory) assertCombosConfigured(combosInvalidos);
    const reservedByProductId = await readActiveReservationQuantities({
      t,
      db,
      productIds: Array.from(requiredById.keys()),
      excludeOrderId: orderReservationId ? String(orderReservationId) : undefined,
    });
    const grouped = groupInventoryRequirements({
      requiredById,
      productoById: inventariableProductoById,
    });

    const { productosSinPrecio } = buildWarningsFromProductos({ productos: inventariables });
    const advertenciasStockInsuficiente = [];
    const advertenciasStockNegativo = [];
    const advertenciasCosto = [];

    for (const missing of productosNoEncontrados) {
      advertenciasCosto.push({
        productoId: missing.productoId,
        productoNombre: missing.productoNombre,
        costo: null,
      });
    }

    for (const entry of grouped) {
      const productoRef = db.collection("productos").doc(entry.productoId);
      const data = inventariableProductoById.get(entry.productoId) || {};
      const stockActual = Number(data.stock) || 0;
      const stockReservado = Number(reservedByProductId.get(entry.productoId)) || 0;
      const stockDisponible = Math.max(0, stockActual - stockReservado);
      const delta = -entry.cantidad;
      const nuevoStock = stockActual + delta;
      const stockInsuficiente = stockDisponible < entry.cantidad;
      const stockNegativoResultante = nuevoStock < 0;

      if (!skipInventory && (venta.ecommerceLifecycle || stockReservado > 0) && stockInsuficiente) {
        throw Object.assign(new Error(`Stock insuficiente para ${entry.nombre}: disponibles ${stockDisponible}`), { status: 409 });
      }
      if (reserveOnly) {
        // Serializar reservas concurrentes del mismo producto sin alterar existencias físicas.
        t.update(productoRef, { reservaVersion: (Number(data.reservaVersion) || 0) + 1 });
        t.set(db.collection("reservasStock").doc(`${ventaRef.id}_${entry.productoId}`), {
          ventaId: ventaRef.id, productoId: entry.productoId, cantidad: entry.cantidad,
          estado: "activa", expiresAt: venta.reservaExpiresAt, createdAt: nowIso,
        });
        continue;
      }

      if (skipInventory) {
        advertenciasStockInsuficiente.push({
          productoId: entry.productoId,
          productoNombre: String(data.nombre || entry.nombre || entry.productoId),
          requerido: entry.cantidad,
          stockAntes: stockActual,
          stockReservado,
          stockDisponible,
          stockDespues: stockActual,
          motivo: "Pago aprobado; inventario pendiente de conciliación.",
        });
        continue;
      }

      if (stockInsuficiente) {
        advertenciasStockInsuficiente.push({
          productoId: entry.productoId,
          productoNombre: String(data.nombre || entry.nombre || entry.productoId),
          requerido: entry.cantidad,
          stockAntes: stockActual,
          stockReservado,
          stockDisponible,
          stockDespues: nuevoStock,
        });
      }
      if (stockNegativoResultante) {
        advertenciasStockNegativo.push({
          productoId: entry.productoId,
          productoNombre: String(data.nombre || entry.nombre || entry.productoId),
          stockAntes: stockActual,
          stockDespues: nuevoStock,
        });
      }

      const costo = parseCostoProducto(data);
      if (!Number.isFinite(costo) || costo <= 0) {
        advertenciasCosto.push({
          productoId: entry.productoId,
          productoNombre: String(data.nombre || entry.nombre || entry.productoId),
          costo: Number.isFinite(costo) ? costo : null,
        });
      }

      t.update(productoRef, {
        stock: nuevoStock,
        fechaActualizacion: FieldValue.serverTimestamp(),
      });

      const movRef = db.collection("movimientos").doc();
      t.set(movRef, {
        productoId: entry.productoId,
        tipo: "salida",
        cantidad: entry.cantidad,
        usuario: actor?.email || "Sistema",
        usuarioUid: actor?.uid || "",
        usuarioEmail: actor?.email || "",
        fecha: FieldValue.serverTimestamp(),
        referencia: "venta",
        referenciaId: ventaRef.id,
        observaciones: "Salida por venta",
        productoNombre: String(data.nombre || entry.nombre || ""),
        stockAntes: stockActual,
        stockDelta: delta,
        stockDespues: nuevoStock,
        stockInsuficienteAntes: stockInsuficiente,
        stockNegativoDespues: stockNegativoResultante,
        categoria: data.categoria || "Sin categoría",
        origen,
      });
    }

    if (orderReservationId) {
      orderReservations.forEach((reservation) => {
        if (reservation.data()?.estado === "activa") {
          t.update(reservation.ref, { estado: "consumida", ventaId: ventaRef.id, actualizadoEn: nowIso });
        }
      });
    }

    const flags = finalizeFlags({
      stockNegativo: advertenciasStockNegativo.length > 0,
      productosSinPrecio: productosSinPrecio.length > 0,
      productosSinCosto: advertenciasCosto.length > 0,
      stockInsuficiente: advertenciasStockInsuficiente.length > 0,
    });
    if (productosNoInventariados.length > 0) {
      flags.requiereRevision = true;
    }
    if (productosNoEncontrados.length > 0 || combosInvalidos.length > 0) {
      flags.requiereRevision = true;
    }

    t.set(counterRef, { value: next, updatedAt: FieldValue.serverTimestamp() }, { merge: true });

    const ventaConFlags = stripUndefined({
      ...venta,
      inventarioAplicado: !reserveOnly && !skipInventory,
      productos: enrichComboLineSnapshots(venta.productos, inventariableProductoById),
      items: enrichComboLineSnapshots(venta.items, inventariableProductoById),
      stockNegativo: flags.stockNegativo,
      productosSinPrecio: flags.productosSinPrecio,
      productosSinCosto: flags.productosSinCosto,
      requiereRevision: flags.requiereRevision,
      advertencias: {
        stockInsuficiente: advertenciasStockInsuficiente,
        stockNegativo: advertenciasStockNegativo,
        productosSinPrecio,
        productosSinCosto: advertenciasCosto,
        productosNoInventariados,
        productosNoEncontrados,
        combosInvalidos,
      },
      idempotencyKey: idemKey || null,
      version: 1,
      creadoPorUid: actor?.uid || "",
      creadoPorEmail: actor?.email || "",
      creadoEn: FieldValue.serverTimestamp(),
    });

    t.set(ventaRef, ventaConFlags);

    if (idemRef) {
      t.set(idemRef, {
        scope: "venta",
        key: idemKey,
        ventaId: ventaRef.id,
        numeroPedido,
        flags,
        createdAt: FieldValue.serverTimestamp(),
        actorUid: actor?.uid || "",
        actorEmail: actor?.email || "",
      });
    }

    const auditRef = db.collection("auditoria").doc();
    t.set(auditRef, {
      accion: "CREACION_VENTA",
      coleccion: "ventas",
      documentoId: ventaRef.id,
      numeroPedido,
      usuarioId: actor?.uid || "",
      usuarioEmail: actor?.email || "",
      fecha: FieldValue.serverTimestamp(),
      origen,
      flags,
      advertencias: ventaConFlags.advertencias,
    });

    if (ventaConFlags.tipoEnvio && ventaConFlags.tipoEnvio !== "retiro_local") {
      const envioRef = db.collection("envios").doc();
      const productosArr = Array.isArray(ventaConFlags.productos) ? ventaConFlags.productos : [];
      const cantidadTotal = productosArr.reduce((acc, p) => acc + (Number(p?.cantidad) || 0), 0);
      const envio = stripUndefined({
        ventaId: ventaRef.id,
        clienteId: ventaConFlags.clienteId,
        cliente: ventaConFlags.cliente,
        fechaCreacion: nowIso,
        fechaEntrega: ventaConFlags.fechaEntrega,
        estado: "pendiente",
        vendedor: ventaConFlags.vendedor,
        direccionEnvio: ventaConFlags.direccionEnvio,
        localidadEnvio: ventaConFlags.localidadEnvio,
        tipoEnvio: ventaConFlags.tipoEnvio,
        costoEnvio: Number(ventaConFlags.costoEnvio) || 0,
        numeroFactura: ventaConFlags.numeroFactura,
        numeroRemito: ventaConFlags.numeroRemito,
        numeroPedido,
        totalVenta: ventaConFlags.total,
        productos: productosArr,
        cantidadTotal,
        historialEstados: [
          { estado: "pendiente", fecha: nowIso, comentario: "Envío creado automáticamente desde la venta" },
        ],
        observaciones: ventaConFlags.observaciones,
        instruccionesEspeciales: "",
        fechaActualizacion: nowIso,
        creadoPor: "sistema",
      });
      t.set(envioRef, envio);
    }

    return { id: ventaRef.id, numeroPedido, flags };
  });

  return result;
}

/** Reserva inventario para un checkout online sin crear una venta en el ERP. */
export async function reserveEcommerceOrderStock({ orderId, expiresAt }) {
  const id = String(orderId || "").trim();
  const expiry = String(expiresAt || "");
  if (!id || !Number.isFinite(Date.parse(expiry)) || Date.parse(expiry) <= Date.now()) {
    throw Object.assign(new Error("La reserva del pedido no tiene una fecha de vencimiento válida."), { status: 400 });
  }

  const db = getAdminDb();
  const orderRef = db.collection("orders").doc(id);
  return db.runTransaction(async (t) => {
    const [orderSnap, existingReservations] = await Promise.all([
      t.get(orderRef),
      t.get(db.collection("reservasStock").where("orderId", "==", id)),
    ]);
    if (!orderSnap.exists) throw Object.assign(new Error("Pedido no encontrado para reservar inventario."), { status: 404 });
    const order = orderSnap.data() || {};
    if (order.paymentMethod !== "mercadopago" || order.status === "success") {
      throw Object.assign(new Error("El pedido no admite una reserva de pago online."), { status: 409 });
    }

    if (!existingReservations.empty || order.stockReservationStatus === "not_required") {
      const active = order.stockReservationStatus === "not_required" || (
        !existingReservations.empty && existingReservations.docs.every((doc) => {
          const reservation = doc.data() || {};
          return reservation.estado === "activa" && Date.parse(reservation.expiresAt || "") > Date.now();
        })
      );
      if (active) return { reserved: true, expiresAt: order.stockReservationExpiresAt || expiry, alreadyReserved: true };
      throw Object.assign(new Error("La reserva de stock de este pedido venció."), { status: 409, code: "RESERVATION_EXPIRED" });
    }

    const allItems = Array.isArray(order.items) ? order.items : [];
    const inventoryItems = allItems
      .filter((item) => !isNonInventariableItem(item))
      .map((item) => ({ ...item, cantidad: Number(item.cantidad ?? item.quantity) || 0 }));
    const { resolvedItems, productoById, productosNoEncontrados } = await resolveCanonicalLineItems({
      t, db, lineItems: inventoryItems,
    });
    if (productosNoEncontrados.length) {
      throw Object.assign(new Error("Un producto del pedido ya no está disponible para reservar."), { status: 409 });
    }
    await hydrateComboComponents({ t, db, lineItems: resolvedItems, productoById });
    const { requiredById, combosInvalidos } = collectInventoryRequirements({ lineItems: resolvedItems, productoById });
    assertCombosConfigured(combosInvalidos);
    const grouped = groupInventoryRequirements({ requiredById, productoById });
    const reservedByProductId = await readActiveReservationQuantities({
      t, db, productIds: grouped.map((item) => item.productoId), excludeOrderId: id,
    });

    for (const entry of grouped) {
      const producto = productoById.get(entry.productoId) || {};
      const stock = Math.max(0, Number(producto.stock) || 0);
      const reserved = Number(reservedByProductId.get(entry.productoId)) || 0;
      const available = Math.max(0, stock - reserved);
      if (available < entry.cantidad) {
        throw Object.assign(new Error(`Stock insuficiente para ${entry.nombre}: disponibles ${available}`), { status: 409 });
      }
    }

    const createdAt = new Date().toISOString();
    grouped.forEach((entry) => {
      const product = productoById.get(entry.productoId) || {};
      t.update(db.collection("productos").doc(entry.productoId), {
        reservaVersion: (Number(product.reservaVersion) || 0) + 1,
      });
      t.set(db.collection("reservasStock").doc(`${id}_${entry.productoId}`), {
        orderId: id,
        productoId: entry.productoId,
        cantidad: entry.cantidad,
        estado: "activa",
        expiresAt: expiry,
        createdAt,
        tipo: "checkout_mercadopago",
      });
    });
    t.update(orderRef, {
      stockReservationStatus: grouped.length ? "active" : "not_required",
      stockReservationExpiresAt: expiry,
      updatedAt: createdAt,
    });
    return { reserved: true, expiresAt: expiry, items: grouped.length };
  });
}

export async function updateVentaEngine({ actor, ventaId, ventaData, origen = "sistema_ventas" }) {
  const db = getAdminDb();
  const ref = db.collection("ventas").doc(String(ventaId));

  const result = await db.runTransaction(async (t) => {
    const snap = await t.get(ref);
    if (!snap.exists) throw new Error("Venta no encontrada");
    const prev = snap.data() || {};
    const ecommerceLifecycle = prev.ecommerceLifecycle === true || String(prev.origen || "").toLowerCase() === "ecommerce_externo";
    const nextPayment = normalizeVentaPaymentFields({ venta: ventaData, previousVenta: prev, actorEmail: actor?.email });
    const mpEcommerce = ecommerceLifecycle && (isMercadoPagoSale(prev) || isMercadoPagoSale(ventaData));
    const mergedMpPayment = { ...(prev.pagoMercadoPago || {}), ...(ventaData?.pagoMercadoPago || {}) };
    const approvedMpPayment = !mpEcommerce || hasApprovedMercadoPagoPayment(prev) || (
      actor?.email === "mercadopago-webhook" && hasApprovedMercadoPagoPayment({ pagoMercadoPago: mergedMpPayment })
    );
    if (mpEcommerce && nextPayment.estadoPago === "pagado" && !approvedMpPayment) {
      throw Object.assign(new Error("No se puede confirmar ni descontar stock sin aprobación verificada de Mercado Pago."), { status: 409 });
    }
    // El estado previo de inventario nunca autoriza una nueva salida si el pago ya no está aprobado.
    const applyInventory = !ecommerceLifecycle || (nextPayment.estadoPago === "pagado" && approvedMpPayment);

    if (prev?.estado === "anulada" || prev?.anulada === true) {
      throw new Error("No se puede editar una venta anulada");
    }

    const tipoEnvioPrev = String(prev?.tipoEnvio || "retiro_local").trim() || "retiro_local";
    const tipoEnvioNext = String(ventaData?.tipoEnvio || "retiro_local").trim() || "retiro_local";
    const enviosQ = db.collection("envios").where("ventaId", "==", ref.id).limit(5);
    const enviosSnap = await t.get(enviosQ);
    const enviosDocs = enviosSnap?.docs || [];
    const envioExistente = enviosDocs[0] || null;
    const enviosDuplicados = enviosDocs.slice(1);

    const expectedVersionRaw = ventaData?.version;
    const expectedVersion =
      expectedVersionRaw === null || expectedVersionRaw === undefined || expectedVersionRaw === ""
        ? null
        : Number(expectedVersionRaw);
    const prevVersion = Number(prev?.version);
    if (Number.isFinite(prevVersion) && expectedVersion !== null && expectedVersion !== prevVersion) {
      const err = new Error("Conflicto de edición: la venta fue modificada por otro usuario. Recargá y volvé a intentar.");
      err.status = 409;
      throw err;
    }

    const prevProductosRaw = Array.isArray(prev?.productos)
      ? prev.productos
      : Array.isArray(prev?.items)
        ? prev.items
        : [];
    const nextProductosRaw = Array.isArray(ventaData?.productos)
      ? ventaData.productos
      : Array.isArray(ventaData?.items)
        ? ventaData.items
        : [];
    const prevProductos = prevProductosRaw.filter((p) => !isNonInventariableItem(p));
    const nextProductos = nextProductosRaw.filter((p) => !isNonInventariableItem(p));
    const productosNoInventariados = nextProductosRaw
      .filter(isNonInventariableItem)
      .map((p) => ({
        productoId: String(p?.originalId || p?.id || "").trim(),
        productoNombre: String(p?.nombre || p?.descripcion || "Producto"),
        motivo: "no_inventariable",
      }));

    const {
      resolvedItems: prevResolved,
      productoById: prevProductoById,
      productosNoEncontrados: prevProductosNoEncontrados,
    } = await resolveCanonicalLineItems({
      t,
      db,
      lineItems: prevProductos,
    });
    const {
      resolvedItems: nextResolved,
      productoById: nextProductoById,
      productosNoEncontrados: nextProductosNoEncontrados,
    } = await resolveCanonicalLineItems({
      t,
      db,
      lineItems: nextProductos,
    });
    const productoById = new Map([
      ...Array.from(prevProductoById.entries()),
      ...Array.from(nextProductoById.entries()),
    ]);
    await hydrateComboComponents({
      t,
      db,
      lineItems: [...prevResolved, ...nextResolved],
      productoById,
    });
    const {
      requiredById: prevRequiredById,
      combosInvalidos: prevCombosInvalidos,
    } = collectInventoryRequirements({
      lineItems: prevResolved,
      productoById,
    });
    const {
      requiredById: nextRequiredById,
      combosInvalidos: nextCombosInvalidos,
    } = collectInventoryRequirements({
      lineItems: nextResolved,
      productoById,
    });
    assertCombosConfigured(nextCombosInvalidos);
    const reservedByProductId = await readActiveReservationQuantities({
      t,
      db,
      excludeVentaId: ecommerceLifecycle ? ref.id : undefined,
      productIds: Array.from(new Set([
        ...prevRequiredById.keys(),
        ...nextRequiredById.keys(),
      ])),
    });

    const { productosSinPrecio } = buildWarningsFromProductos({ productos: nextResolved });
    const advertenciasStockInsuficiente = [];
    const advertenciasStockNegativo = [];
    const advertenciasCosto = [];
    const productosNoEncontrados = [
      ...prevProductosNoEncontrados,
      ...nextProductosNoEncontrados,
    ];

    const canonicalIds = Array.from(
      new Set([
        ...Array.from(prevRequiredById.keys()),
        ...Array.from(nextRequiredById.keys()),
      ])
    );

    for (const canonicalId of canonicalIds) {
      const prodRef = db.collection("productos").doc(canonicalId);
      const prod = productoById.get(canonicalId) || {};

      const prevQty = prev.inventarioAplicado === false ? 0 : (prevRequiredById.get(canonicalId) || 0);
      const nextQty = applyInventory ? (nextRequiredById.get(canonicalId) || 0) : 0;
      const diff = nextQty - prevQty;
      const delta = -diff;

      const stockActual = Number(prod.stock) || 0;
      const nuevoStock = stockActual + Number(delta);

      const costo = parseCostoProducto(prod);
      if (!Number.isFinite(costo) || costo <= 0) {
        advertenciasCosto.push({
          productoId: canonicalId,
          productoNombre: String(prod.nombre || canonicalId),
          costo: Number.isFinite(costo) ? costo : null,
        });
      }

      const requerido = nextQty;
      const stockReservado = Number(reservedByProductId.get(canonicalId)) || 0;
      const stockDisponibleParaEdicion = Math.max(0, stockActual + prevQty - stockReservado);
      const stockInsuficiente = Number.isFinite(requerido) && stockDisponibleParaEdicion < requerido;
      const stockNegativoResultante = nuevoStock < 0;
      if (applyInventory && ((ecommerceLifecycle && (stockNegativoResultante || stockInsuficiente)) || (stockReservado > 0 && nextQty > prevQty && stockInsuficiente))) {
        throw Object.assign(new Error(`Stock insuficiente para confirmar ${prod.nombre || canonicalId}`), { status: 409 });
      }
      if (ecommerceLifecycle) {
        t.set(db.collection("reservasStock").doc(`${ref.id}_${canonicalId}`), {
          ventaId: ref.id, productoId: canonicalId,
          cantidad: nextRequiredById.get(canonicalId) || 0,
          estado: applyInventory ? "consumida" : "activa",
          expiresAt: prev.reservaExpiresAt,
        }, { merge: true });
      }
      if (stockInsuficiente) {
        advertenciasStockInsuficiente.push({
          productoId: canonicalId,
          productoNombre: String(prod.nombre || canonicalId),
          requerido,
          stockAntes: stockActual + prevQty,
          stockReservado,
          stockDisponible: stockDisponibleParaEdicion,
          stockDespues: nuevoStock,
        });
      }
      if (stockNegativoResultante) {
        advertenciasStockNegativo.push({
          productoId: canonicalId,
          productoNombre: String(prod.nombre || canonicalId),
          stockAntes: stockActual,
          stockDespues: nuevoStock,
        });
      }

      if (delta !== 0) {
        t.update(prodRef, {
          stock: nuevoStock,
          fechaActualizacion: FieldValue.serverTimestamp(),
        });

        const movRef = db.collection("movimientos").doc();
        t.set(movRef, {
          productoId: canonicalId,
          tipo: delta < 0 ? "salida" : "entrada",
          cantidad: Math.abs(Number(delta)),
          usuario: actor?.email || "Sistema",
          usuarioUid: actor?.uid || "",
          usuarioEmail: actor?.email || "",
          fecha: FieldValue.serverTimestamp(),
          referencia: "edicion_venta",
          referenciaId: ref.id,
          observaciones: `Ajuste por edición de venta: ${prevQty} → ${nextQty}`,
          productoNombre: String(prod.nombre || ""),
          stockAntes: stockActual,
          stockDelta: Number(delta),
          stockDespues: nuevoStock,
          stockInsuficienteAntes: stockInsuficiente,
          stockNegativoDespues: stockNegativoResultante,
          categoria: prod.categoria || "Sin categoría",
          origen,
        });
      }
    }

    const flags = finalizeFlags({
      stockNegativo: advertenciasStockNegativo.length > 0,
      productosSinPrecio: productosSinPrecio.length > 0,
      productosSinCosto: advertenciasCosto.length > 0,
      stockInsuficiente: advertenciasStockInsuficiente.length > 0,
    });
    if (productosNoInventariados.length > 0) {
      flags.requiereRevision = true;
    }
    if (productosNoEncontrados.length > 0) {
      flags.requiereRevision = true;
    }
    if (prevCombosInvalidos.length > 0 || nextCombosInvalidos.length > 0) {
      flags.requiereRevision = true;
    }

    const remapProductosArray = (arr) =>
      (Array.isArray(arr) ? arr : []).map((p) => {
        const found = nextResolved.find(
          (item) =>
            String(item?.id || "") === String(p?.id || "") &&
            String(item?.nombre || "") === String(p?.nombre || "")
        );
        if (!found) return p;
        return {
          ...p,
          originalId: found.originalId || p.originalId,
          id:
            String(p?.id || "").trim() === String(normalizeProductoId(p))
              ? found.originalId || p.id
              : p.id,
        };
      });

    const ventaDataFixedBase = stripUndefined({
      ...ventaData,
      ...(mpEcommerce && actor?.email !== "mercadopago-webhook" ? { pagoMercadoPago: prev.pagoMercadoPago } : {}),
      productos: remapProductosArray(ventaData?.productos),
      items: remapProductosArray(ventaData?.items),
    });
    const ventaDataFixed = stripUndefined({
      ...ventaDataFixedBase,
      productos: enrichComboLineSnapshots(ventaDataFixedBase.productos, productoById),
      items: enrichComboLineSnapshots(ventaDataFixedBase.items, productoById),
    });

    const payloadBase = stripUndefined({
      ...ventaDataFixed,
      ecommerceLifecycle,
      inventarioAplicado: applyInventory,
      stockNegativo: flags.stockNegativo,
      productosSinPrecio: flags.productosSinPrecio,
      productosSinCosto: flags.productosSinCosto,
      requiereRevision: flags.requiereRevision,
      advertencias: {
        stockInsuficiente: advertenciasStockInsuficiente,
        stockNegativo: advertenciasStockNegativo,
        productosSinPrecio,
        productosSinCosto: advertenciasCosto,
        productosNoInventariados,
        productosNoEncontrados,
        combosInvalidos: [...prevCombosInvalidos, ...nextCombosInvalidos],
      },
      version: Number.isFinite(prevVersion) ? prevVersion + 1 : 1,
      actualizadoEn: new Date().toISOString(),
      actualizadoPorUid: actor?.uid || "",
      actualizadoPorEmail: actor?.email || "",
    });
    const payload = stripUndefined({
      ...payloadBase,
      ...normalizeVentaPaymentFields({
        venta: payloadBase,
        previousVenta: prev,
        actorEmail: actor?.email || prev?.vendedor || "Sistema",
        defaultFecha: payloadBase?.actualizadoEn || payloadBase?.fechaCreacion || prev?.fechaCreacion,
      }),
    });

    t.update(ref, payload);
    if (ecommerceLifecycle && prev.idExterno) {
      t.set(db.collection("orders").doc(prev.idExterno), {
        status: payload.estadoPago === "pagado" ? "success" : "pending",
        total: payload.total,
        pricing: {
          subtotal: Number(payload.subtotal) || 0,
          productDiscounts: Number(payload.descuentoTotal ?? payload.descuentos) || 0,
          transferDiscount: Number(payload.descuentoEfectivo) || 0,
          shipping: Number(payload.costoEnvio) || 0,
          total: payload.total,
        },
        items: (payload.productos || []).map((item) => ({
          id: item.originalId || item.id, name: item.nombre || "Producto",
          price: Number(item.precio) || 0, quantity: Number(item.cantidad) || 0,
          unidad: item.unidad || "Unidad", image: item.imagen || "",
        })),
        updatedAt: new Date().toISOString(),
      }, { merge: true });
    }

    const nowIso = new Date().toISOString();
    if (tipoEnvioNext !== "retiro_local") {
      const productosArr = Array.isArray(payload?.productos) ? payload.productos : Array.isArray(payload?.items) ? payload.items : [];
      const direccionEnvio =
        payload?.usarDireccionCliente !== false ? String(payload?.cliente?.direccion || "") : String(payload?.direccionEnvio || "");
      const localidadEnvio =
        payload?.usarDireccionCliente !== false ? String(payload?.cliente?.localidad || "") : String(payload?.localidadEnvio || "");
      const cleanEnvio = stripUndefined({
        ventaId: ref.id,
        clienteId: String(payload?.clienteId || ""),
        cliente: payload?.cliente || null,
        fechaCreacion: envioExistente?.data()?.fechaCreacion || nowIso,
        fechaEntrega: payload?.fechaEntrega || null,
        estado: envioExistente?.data()?.estado || "pendiente",
        vendedor: payload?.vendedor || actor?.email || "Sistema",
        direccionEnvio,
        localidadEnvio,
        tipoEnvio: tipoEnvioNext,
        costoEnvio: Number(payload?.costoEnvio) || 0,
        numeroFactura: payload?.numeroFactura || null,
        numeroRemito: payload?.numeroRemito || null,
        numeroPedido: payload?.numeroPedido || payload?.numero || null,
        totalVenta: Number(payload?.total) || 0,
        productos: productosArr,
        cantidadTotal: productosArr.reduce((acc, p) => acc + (Number(p?.cantidad) || 0), 0),
        historialEstados: envioExistente
          ? [
              ...(Array.isArray(envioExistente.data()?.historialEstados) ? envioExistente.data().historialEstados : []),
              { estado: "actualizado", fecha: nowIso, comentario: "Envío actualizado desde edición de venta" },
            ]
          : [{ estado: "pendiente", fecha: nowIso, comentario: "Envío creado desde edición de venta" }],
        observaciones: payload?.observaciones || "",
        instruccionesEspeciales: "",
        fechaActualizacion: nowIso,
        creadoPor: "sistema",
      });
      const envioRef = envioExistente ? envioExistente.ref : db.collection("envios").doc();
      t.set(envioRef, cleanEnvio, { merge: true });
    } else if (tipoEnvioPrev !== "retiro_local" && envioExistente) {
      const prevHist = Array.isArray(envioExistente.data()?.historialEstados) ? envioExistente.data().historialEstados : [];
      t.set(
        envioExistente.ref,
        {
          estado: "cancelado",
          fechaActualizacion: nowIso,
          historialEstados: [...prevHist, { estado: "cancelado", fecha: nowIso, comentario: "Envío cancelado - cambiado a retiro local" }],
        },
        { merge: true }
      );
    }

    if (enviosDuplicados.length > 0) {
      for (const dup of enviosDuplicados) {
        const prevHist = Array.isArray(dup.data()?.historialEstados) ? dup.data().historialEstados : [];
        t.set(
          dup.ref,
          {
            estado: "cancelado",
            fechaActualizacion: nowIso,
            historialEstados: [...prevHist, { estado: "cancelado", fecha: nowIso, comentario: "Envío duplicado - cancelado automáticamente" }],
          },
          { merge: true }
        );
      }
    }

    const auditRef = db.collection("auditoria").doc();
    t.set(auditRef, {
      accion: "EDICION_VENTA",
      coleccion: "ventas",
      documentoId: ref.id,
      numeroPedido: String(payload?.numeroPedido || prev?.numeroPedido || ""),
      usuarioId: actor?.uid || "",
      usuarioEmail: actor?.email || "",
      fecha: FieldValue.serverTimestamp(),
      origen,
      flags,
      advertencias: payload.advertencias,
    });

    return { id: ref.id, flags, version: payload.version };
  });

  return result;
}

export async function anularVentaEngine({ actor, ventaId, motivo, origen = "sistema_ventas" }) {
  const db = getAdminDb();
  const ref = db.collection("ventas").doc(String(ventaId));

  const result = await db.runTransaction(async (t) => {
    const snap = await t.get(ref);
    if (!snap.exists) throw new Error("Venta no encontrada");
    const venta = snap.data() || {};

    if (venta?.estado === "anulada" || venta?.anulada === true) {
      return { id: ref.id, already: true };
    }

    const productosRaw = Array.isArray(venta?.productos)
      ? venta.productos
      : Array.isArray(venta?.items)
        ? venta.items
        : [];
    const productos = productosRaw.filter((p) => !isNonInventariableItem(p));
    const {
      resolvedItems,
      productoById,
      productosNoEncontrados,
    } = await resolveCanonicalLineItems({
      t,
      db,
      lineItems: productos,
    });
    await hydrateComboComponents({
      t,
      db,
      lineItems: resolvedItems,
      productoById,
    });
    if (productosNoEncontrados.length > 0) {
      throw new Error(
        `Producto no encontrado: ${String(productosNoEncontrados[0]?.productoNombre || productosNoEncontrados[0]?.productoId || "")}`
      );
    }
    const { requiredById, combosInvalidos } = collectInventoryRequirements({
      lineItems: resolvedItems,
      productoById,
    });
    assertCombosConfigured(combosInvalidos);
    const grouped = groupInventoryRequirements({
      requiredById,
      productoById,
    });

    for (const entry of grouped) {
      const prodRef = db.collection("productos").doc(entry.productoId);
      if (venta.ecommerceLifecycle) {
        t.set(db.collection("reservasStock").doc(`${ref.id}_${entry.productoId}`), { estado: "liberada" }, { merge: true });
      }
      if (venta.inventarioAplicado === false) continue;
      const prod = productoById.get(entry.productoId) || {};
      const stockActual = Number(prod.stock) || 0;
      const delta = entry.cantidad;
      const nuevoStock = stockActual + delta;

      t.update(prodRef, { stock: nuevoStock, fechaActualizacion: FieldValue.serverTimestamp() });

      const movRef = db.collection("movimientos").doc();
      t.set(movRef, {
        productoId: entry.productoId,
        tipo: "entrada",
        cantidad: entry.cantidad,
        usuario: actor?.email || "Sistema",
        usuarioUid: actor?.uid || "",
        usuarioEmail: actor?.email || "",
        fecha: FieldValue.serverTimestamp(),
        referencia: "anulacion_venta",
        referenciaId: ref.id,
        observaciones: `Reposición por anulación de venta${motivo ? `: ${String(motivo).trim()}` : ""}`,
        productoNombre: String(prod.nombre || entry.nombre || ""),
        stockAntes: stockActual,
        stockDelta: delta,
        stockDespues: nuevoStock,
        categoria: prod.categoria || "Sin categoría",
        origen,
      });
    }

    const nowIso = new Date().toISOString();
    t.update(ref, stripUndefined({
      estado: "anulada",
      anulada: true,
      anuladoEn: nowIso,
      anuladoPorUid: actor?.uid || "",
      anuladoPorEmail: actor?.email || "",
      anulacionMotivo: String(motivo || "").trim(),
      actualizadoEn: nowIso,
    }));
    if (venta.ecommerceLifecycle && venta.idExterno) {
      t.set(db.collection("orders").doc(venta.idExterno), { status: "cancelled", updatedAt: nowIso }, { merge: true });
    }

    const auditRef = db.collection("auditoria").doc();
    t.set(auditRef, {
      accion: "ANULACION_VENTA",
      coleccion: "ventas",
      documentoId: ref.id,
      numeroPedido: String(venta?.numeroPedido || ""),
      usuarioId: actor?.uid || "",
      usuarioEmail: actor?.email || "",
      fecha: FieldValue.serverTimestamp(),
      origen,
      motivo: String(motivo || "").trim(),
    });

    return { id: ref.id, already: false };
  });

  return result;
}
