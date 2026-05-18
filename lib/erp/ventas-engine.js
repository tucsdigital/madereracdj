import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase-admin";
import {
  getLineItemCodigo,
  getLineItemNombre,
  normalizeLineItemProductoId,
  resolveCanonicalProductoId,
} from "@/lib/erp/producto-id";

const normalizeProductoId = normalizeLineItemProductoId;
const normalizeCantidad = (p) => Math.max(0, Math.ceil(Number(p?.cantidad) || 0));
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

const groupProductosById = (productos) => {
  const grouped = new Map();
  for (const p of Array.isArray(productos) ? productos : []) {
    const productoId = normalizeProductoId(p);
    if (!productoId) continue;
    const cantidad = normalizeCantidad(p);
    if (cantidad === 0) continue;
    const prev = grouped.get(productoId);
    grouped.set(productoId, {
      productoId,
      cantidad: (prev?.cantidad || 0) + cantidad,
      nombre: prev?.nombre || getLineItemNombre(p),
      codigo: prev?.codigo || getLineItemCodigo(p),
    });
  }
  return Array.from(grouped.values());
};

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
    const inventariables = productos.filter((p) => !isNonInventariableItem(p));
    const grouped = groupProductosById(inventariables);
    const productoRefs = grouped.map((e) => db.collection("productos").doc(e.productoId));

    const reads = await Promise.all([
      idemRef ? t.get(idemRef) : Promise.resolve(null),
      t.get(counterRef),
      ...productoRefs.map((r) => t.get(r)),
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

    const { productosSinPrecio } = buildWarningsFromProductos({ productos });
    const advertenciasStockInsuficiente = [];
    const advertenciasStockNegativo = [];
    const advertenciasCosto = [];

    const productSnaps = reads.slice(idemRef ? 2 : 1);
    const resolvedEntries = [];
    for (let i = 0; i < grouped.length; i += 1) {
      let entry = grouped[i];
      let productoRef = productoRefs[i];
      let snap = productSnaps[i];
      if (!snap?.exists) {
        const canonicalId = await resolveCanonicalProductoId({
          t,
          db,
          pid: entry.productoId,
          codigo: entry.codigo,
          nombre: entry.nombre,
        });
        if (!canonicalId) {
          throw new Error(`Producto no encontrado: ${entry.nombre || entry.productoId}`);
        }
        productoRef = db.collection("productos").doc(canonicalId);
        snap = await t.get(productoRef);
        if (!snap?.exists) {
          throw new Error(`Producto no encontrado: ${entry.nombre || entry.productoId}`);
        }
        entry = { ...entry, productoId: canonicalId };
      }
      resolvedEntries.push({ entry, productoRef, data: snap.data() || {} });
    }

    for (const { entry, productoRef, data } of resolvedEntries) {
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

    const prevGrouped = new Map();
    for (const p of prevProductos) {
      const pid = normalizeProductoId(p);
      if (!pid) continue;
      const qty = normalizeCantidad(p);
      if (qty === 0) continue;
      prevGrouped.set(pid, (prevGrouped.get(pid) || 0) + qty);
    }
    const nextGrouped = new Map();
    for (const p of nextProductos) {
      const pid = normalizeProductoId(p);
      if (!pid) continue;
      const qty = normalizeCantidad(p);
      if (qty === 0) continue;
      nextGrouped.set(pid, (nextGrouped.get(pid) || 0) + qty);
    }

    const { productosSinPrecio } = buildWarningsFromProductos({ productos: nextProductos });
    const advertenciasStockInsuficiente = [];
    const advertenciasStockNegativo = [];
    const advertenciasCosto = [];
    const productosNoEncontrados = [];

    const allIds = new Set([...prevGrouped.keys(), ...nextGrouped.keys()]);
    const ids = Array.from(allIds.values());
    const canonicalByPid = new Map();
    const resolveMemo = new Map();

    const findItemInfoByPid = (pid) => {
      const all = [...(Array.isArray(nextProductosRaw) ? nextProductosRaw : []), ...(Array.isArray(prevProductosRaw) ? prevProductosRaw : [])];
      for (const it of all) {
        const itPid = normalizeProductoId(it);
        if (itPid && itPid === pid) {
          const codigo = String(it?.codigo || it?.codigoProducto || it?.productoCodigo || "").trim();
          const nombre = String(it?.nombre || it?.descripcion || "").trim();
          return { codigo, nombre };
        }
      }
      return { codigo: "", nombre: "" };
    };

    const resolveProductoIdByCodigoONombre = async (pid) => {
      if (resolveMemo.has(pid)) return resolveMemo.get(pid);
      const { codigo, nombre } = findItemInfoByPid(pid);
      const resolved = await resolveCanonicalProductoId({
        t,
        db,
        pid,
        codigo,
        nombre,
      });
      resolveMemo.set(pid, resolved);
      return resolved;
    };

    for (const pid of ids) {
      const directRef = db.collection("productos").doc(pid);
      const directSnap = await t.get(directRef);
      if (directSnap?.exists) {
        canonicalByPid.set(pid, pid);
        continue;
      }

      const resolvedId = await resolveProductoIdByCodigoONombre(pid);
      if (resolvedId) {
        canonicalByPid.set(pid, resolvedId);
        continue;
      }

      const { codigo, nombre } = findItemInfoByPid(pid);
      productosNoEncontrados.push({
        productoId: pid,
        productoNombre: String(nombre || pid),
        codigo: codigo || null,
        motivo: "producto_no_encontrado",
      });
      canonicalByPid.set(pid, null);
    }

    const sumByCanonical = (map) => {
      const out = new Map();
      for (const [pid, qty] of map.entries()) {
        const canonical = canonicalByPid.get(pid);
        if (!canonical) continue;
        out.set(canonical, (out.get(canonical) || 0) + (Number(qty) || 0));
      }
      return out;
    };

    const prevByCanonical = sumByCanonical(prevGrouped);
    const nextByCanonical = sumByCanonical(nextGrouped);
    const canonicalIds = Array.from(new Set([...prevByCanonical.keys(), ...nextByCanonical.keys()]));

    const prodRefs = canonicalIds.map((canonicalId) => db.collection("productos").doc(canonicalId));
    const prodSnaps = await Promise.all(prodRefs.map((r) => t.get(r)));

    for (let i = 0; i < canonicalIds.length; i += 1) {
      const canonicalId = canonicalIds[i];
      const prodRef = prodRefs[i];
      const prodSnap = prodSnaps[i];
      if (!prodSnap?.exists) {
        productosNoEncontrados.push({
          productoId: canonicalId,
          productoNombre: canonicalId,
          motivo: "producto_no_encontrado",
        });
        continue;
      }
      const prod = prodSnap.data() || {};

      const prevQty = prevByCanonical.get(canonicalId) || 0;
      const nextQty = nextByCanonical.get(canonicalId) || 0;
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

    const remapProductosArray = (arr) => {
      if (!Array.isArray(arr)) return arr;
      return arr.map((p) => {
        const pid = normalizeProductoId(p);
        if (!pid) return p;
        const canonical = canonicalByPid.get(pid);
        if (!canonical || canonical === pid) return p;
        const next = { ...p, originalId: canonical };
        if (String(p?.id || "").trim() === pid) {
          next.id = canonical;
        }
        return next;
      });
    };

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
    const grouped = groupProductosById(productos);
    const prodRefs = grouped.map((e) => db.collection("productos").doc(e.productoId));
    const prodSnaps = await Promise.all(prodRefs.map((r) => t.get(r)));

    const resolved = [];
    for (let i = 0; i < grouped.length; i += 1) {
      let entry = grouped[i];
      let prodRef = prodRefs[i];
      let prodSnap = prodSnaps[i];
      if (!prodSnap?.exists) {
        const canonicalId = await resolveCanonicalProductoId({
          t,
          db,
          pid: entry.productoId,
          codigo: entry.codigo,
          nombre: entry.nombre,
        });
        if (!canonicalId) {
          throw new Error(`Producto no encontrado: ${entry.nombre || entry.productoId}`);
        }
        prodRef = db.collection("productos").doc(canonicalId);
        prodSnap = await t.get(prodRef);
        if (!prodSnap?.exists) {
          throw new Error(`Producto no encontrado: ${entry.nombre || entry.productoId}`);
        }
        entry = { ...entry, productoId: canonicalId };
      }
      resolved.push({ entry, prodRef, prod: prodSnap.data() || {} });
    }

    for (const { entry, prodRef, prod } of resolved) {
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
