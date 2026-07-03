import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase-admin";
import {
  getLineItemCodigo,
  getLineItemNombre,
  normalizeLineItemProductoId,
  resolveCanonicalProductoId,
} from "@/lib/erp/producto-id";
import { collectInventoryRequirements } from "@/lib/combos";

const normalizeProductoId = normalizeLineItemProductoId;
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

export async function createVentaEngine({ actor, ventaData, origen = "sistema_ventas" }) {
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
    const currentStored = counterSnap?.exists ? Number(counterSnap.data()?.value) || 0 : 0;
    const current = Math.max(currentStored, Number(seed) || 0);
    const next = current + 1;
    const numeroPedido = `VENTA-${String(next).padStart(5, "0")}`;

    const nowIso = new Date().toISOString();
    const venta = stripUndefined({
      ...ventaData,
      numeroPedido,
      fechaCreacion: ventaData?.fechaCreacion || nowIso,
      vendedor: ventaData?.vendedor || actor?.email || "Usuario no identificado",
      tipo: "venta",
    });

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
    const { requiredById, combosInvalidos } = collectInventoryRequirements({
      lineItems: inventariables,
      productoById: inventariableProductoById,
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
      const delta = -entry.cantidad;
      const nuevoStock = stockActual + delta;
      const stockInsuficiente = stockActual < entry.cantidad;
      const stockNegativoResultante = nuevoStock < 0;

      if (stockInsuficiente) {
        advertenciasStockInsuficiente.push({
          productoId: entry.productoId,
          productoNombre: String(data.nombre || entry.nombre || entry.productoId),
          requerido: entry.cantidad,
          stockAntes: stockActual,
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

export async function updateVentaEngine({ actor, ventaId, ventaData, origen = "sistema_ventas" }) {
  const db = getAdminDb();
  const ref = db.collection("ventas").doc(String(ventaId));

  const result = await db.runTransaction(async (t) => {
    const snap = await t.get(ref);
    if (!snap.exists) throw new Error("Venta no encontrada");
    const prev = snap.data() || {};

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

      const prevQty = prevRequiredById.get(canonicalId) || 0;
      const nextQty = nextRequiredById.get(canonicalId) || 0;
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
      const stockInsuficiente = Number.isFinite(requerido) && stockActual < requerido;
      const stockNegativoResultante = nuevoStock < 0;
      if (stockInsuficiente) {
        advertenciasStockInsuficiente.push({
          productoId: canonicalId,
          productoNombre: String(prod.nombre || canonicalId),
          requerido,
          stockAntes: stockActual,
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

    const ventaDataFixed = stripUndefined({
      ...ventaData,
      productos: remapProductosArray(ventaData?.productos),
      items: remapProductosArray(ventaData?.items),
    });

    const payload = stripUndefined({
      ...ventaDataFixed,
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

    t.update(ref, payload);

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
    if (productosNoEncontrados.length > 0) {
      throw new Error(
        `Producto no encontrado: ${String(productosNoEncontrados[0]?.productoNombre || productosNoEncontrados[0]?.productoId || "")}`
      );
    }
    const { requiredById } = collectInventoryRequirements({
      lineItems: resolvedItems,
      productoById,
    });
    const grouped = groupInventoryRequirements({
      requiredById,
      productoById,
    });

    for (const entry of grouped) {
      const prodRef = db.collection("productos").doc(entry.productoId);
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
