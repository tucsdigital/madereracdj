"use client";
import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";

const stripUndefined = (value) =>
  JSON.parse(JSON.stringify(value, (_k, v) => (v === undefined ? undefined : v)));

const normalizeProductoId = (p) => String(p?.originalId || p?.id || "").trim();
const normalizeCantidad = (p) => Math.max(0, Math.ceil(Number(p?.cantidad) || 0));
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
      nombre: prev?.nombre || p?.nombre || "",
    });
  }
  return Array.from(grouped.values());
};

const readMaxNumeroPedido = async ({ db, collectionName, prefix }) => {
  try {
    const q = query(collection(db, collectionName), orderBy("numeroPedido", "desc"), limit(1));
    const snap = await getDocs(q);
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
  const ref = doc(db, "counters", counterId);
  const snap = await t.get(ref);
  const currentStored = snap.exists() ? Number(snap.data()?.value) || 0 : 0;
  const current = Math.max(currentStored, Number(seed) || 0);
  const next = current + 1;
  t.set(ref, { value: next, updatedAt: serverTimestamp() }, { merge: true });
  return `${prefix}${String(next).padStart(pad, "0")}`;
};

const buildVentaWarningsFromProductos = ({ productos }) => {
  const missingPrecio = [];
  for (const p of Array.isArray(productos) ? productos : []) {
    const precio = parsePrecio(p);
    if (!Number.isFinite(precio) || precio <= 0) {
      const productoId = normalizeProductoId(p);
      missingPrecio.push({
        productoId,
        productoNombre: String(p?.nombre || p?.descripcion || productoId || "Producto"),
        precio: Number.isFinite(precio) ? precio : null,
      });
    }
  }
  return { missingPrecio };
};

const finalizeFlags = ({ stockNegativo, productosSinPrecio, productosSinCosto, stockInsuficiente }) => {
  const requiereRevision = Boolean(stockNegativo || productosSinPrecio || productosSinCosto || stockInsuficiente);
  return { stockNegativo, productosSinPrecio, productosSinCosto, stockInsuficiente, requiereRevision };
};

export async function createPresupuesto({ db, user, formData }) {
  const presupuestoRef = doc(collection(db, "presupuestos"));
  const seed = await readMaxNumeroPedido({ db, collectionName: "presupuestos", prefix: "PRESU-" });

  const result = await runTransaction(db, async (t) => {
    const numeroPedido = await nextNumeroPedidoTx({
      t,
      db,
      counterId: "presupuestos",
      prefix: "PRESU-",
      pad: 5,
      seed,
    });

    const presupuesto = stripUndefined({
      ...formData,
      numeroPedido,
      fechaCreacion: new Date().toISOString(),
      vendedor: user?.email || "Usuario no identificado",
      tipo: "presupuesto",
    });

    t.set(presupuestoRef, presupuesto);
    return { id: presupuestoRef.id, numeroPedido };
  });

  return result;
}

export async function createVenta({ db, user, formData, origen = "sistema_ventas" }) {
  const ventaRef = doc(collection(db, "ventas"));
  const seed = await readMaxNumeroPedido({ db, collectionName: "ventas", prefix: "VENTA-" });

  const result = await runTransaction(db, async (t) => {
    const numeroPedido = await nextNumeroPedidoTx({
      t,
      db,
      counterId: "ventas",
      prefix: "VENTA-",
      pad: 5,
      seed,
    });

    const venta = stripUndefined({
      ...formData,
      numeroPedido,
      fechaCreacion: new Date().toISOString(),
      vendedor: user?.email || "Usuario no identificado",
      tipo: "venta",
    });

    const productos = Array.isArray(venta?.productos) ? venta.productos : [];
    const grouped = groupProductosById(productos);
    const { missingPrecio } = buildVentaWarningsFromProductos({ productos });
    const advertenciasStockInsuficiente = [];
    const advertenciasStockNegativo = [];
    const advertenciasCosto = [];

    for (const entry of grouped) {
      const productoRef = doc(db, "productos", entry.productoId);
      const snap = await t.get(productoRef);
      if (!snap.exists()) {
        throw new Error(`Producto no encontrado: ${entry.nombre || entry.productoId}`);
      }

      const data = snap.data() || {};
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

      const nowTs = serverTimestamp();
      t.update(productoRef, { stock: nuevoStock, fechaActualizacion: nowTs });

      const movRef = doc(collection(db, "movimientos"));
      t.set(movRef, {
        productoId: entry.productoId,
        tipo: "salida",
        cantidad: entry.cantidad,
        usuario: user?.displayName || user?.email || "Sistema",
        usuarioUid: user?.uid || "",
        usuarioEmail: user?.email || "",
        fecha: nowTs,
        referencia: "venta",
        referenciaId: ventaRef.id,
        observaciones: "Salida por venta",
        productoNombre: data.nombre || entry.nombre || "",
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
      productosSinPrecio: missingPrecio.length > 0,
      productosSinCosto: advertenciasCosto.length > 0,
      stockInsuficiente: advertenciasStockInsuficiente.length > 0,
    });

    const ventaConFlags = {
      ...venta,
      stockNegativo: flags.stockNegativo,
      productosSinPrecio: flags.productosSinPrecio,
      productosSinCosto: flags.productosSinCosto,
      requiereRevision: flags.requiereRevision,
      advertencias: {
        stockInsuficiente: advertenciasStockInsuficiente,
        stockNegativo: advertenciasStockNegativo,
        productosSinPrecio: missingPrecio,
        productosSinCosto: advertenciasCosto,
      },
    };

    t.set(ventaRef, stripUndefined(ventaConFlags));

    const auditoriaRef = doc(collection(db, "auditoria"));
    t.set(auditoriaRef, {
      accion: "CREACION_VENTA",
      coleccion: "ventas",
      documentoId: ventaRef.id,
      numeroPedido,
      usuarioId: user?.uid || "",
      usuarioEmail: user?.email || "",
      fecha: serverTimestamp(),
      origen,
      flags,
      advertencias: ventaConFlags.advertencias,
    });

    if (venta.tipoEnvio && venta.tipoEnvio !== "retiro_local") {
      const envioRef = doc(collection(db, "envios"));
      const productosArr = Array.isArray(venta.productos) ? venta.productos : [];
      const cantidadTotal = productosArr.reduce(
        (acc, p) => acc + (Number(p?.cantidad) || 0),
        0
      );

      const envio = stripUndefined({
        ventaId: ventaRef.id,
        clienteId: venta.clienteId,
        cliente: venta.cliente,
        fechaCreacion: new Date().toISOString(),
        fechaEntrega: venta.fechaEntrega,
        estado: "pendiente",
        vendedor: user?.email || "Usuario no identificado",
        direccionEnvio: venta.direccionEnvio,
        localidadEnvio: venta.localidadEnvio,
        tipoEnvio: venta.tipoEnvio,
        costoEnvio: Number(venta.costoEnvio) || 0,
        numeroFactura: venta.numeroFactura,
        numeroRemito: venta.numeroRemito,
        numeroPedido: numeroPedido,
        totalVenta: venta.total,
        productos: productosArr,
        cantidadTotal,
        historialEstados: [
          {
            estado: "pendiente",
            fecha: new Date().toISOString(),
            comentario: "Envío creado automáticamente desde la venta",
          },
        ],
        observaciones: venta.observaciones,
        instruccionesEspeciales: "",
        fechaActualizacion: new Date().toISOString(),
        creadoPor: "sistema",
      });

      t.set(envioRef, envio);
    }

    return { id: ventaRef.id, numeroPedido };
  });

  return result;
}

export async function updateVenta({ db, user, ventaId, ventaData, origen = "sistema_ventas" }) {
  const ventaRef = doc(db, "ventas", String(ventaId));

  const result = await runTransaction(db, async (t) => {
    const ventaSnap = await t.get(ventaRef);
    if (!ventaSnap.exists()) {
      throw new Error("Venta no encontrada");
    }
    const ventaPrev = ventaSnap.data() || {};
    const prevProductos = Array.isArray(ventaPrev?.productos)
      ? ventaPrev.productos
      : Array.isArray(ventaPrev?.items)
        ? ventaPrev.items
        : [];
    const nextProductos = Array.isArray(ventaData?.productos)
      ? ventaData.productos
      : Array.isArray(ventaData?.items)
        ? ventaData.items
        : [];

    const prevGrouped = new Map();
    for (const p of prevProductos) {
      const productoId = normalizeProductoId(p);
      if (!productoId) continue;
      const qty = normalizeCantidad(p);
      if (qty === 0) continue;
      prevGrouped.set(productoId, (prevGrouped.get(productoId) || 0) + qty);
    }
    const nextGrouped = new Map();
    for (const p of nextProductos) {
      const productoId = normalizeProductoId(p);
      if (!productoId) continue;
      const qty = normalizeCantidad(p);
      if (qty === 0) continue;
      nextGrouped.set(productoId, (nextGrouped.get(productoId) || 0) + qty);
    }

    const allIds = new Set([...prevGrouped.keys(), ...nextGrouped.keys()]);
    const { missingPrecio } = buildVentaWarningsFromProductos({ productos: nextProductos });
    const advertenciasStockInsuficiente = [];
    const advertenciasStockNegativo = [];
    const advertenciasCosto = [];

    for (const productoId of allIds) {
      const prevQty = prevGrouped.get(productoId) || 0;
      const nextQty = nextGrouped.get(productoId) || 0;
      const diff = nextQty - prevQty;
      const delta = -diff;

      const productoRef = doc(db, "productos", productoId);
      const prodSnap = await t.get(productoRef);
      if (!prodSnap.exists()) throw new Error(`Producto ${productoId} no encontrado`);
      const prod = prodSnap.data() || {};
      const stockActual = Number(prod.stock) || 0;
      const nuevoStock = stockActual + Number(delta);

      const costo = parseCostoProducto(prod);
      if (!Number.isFinite(costo) || costo <= 0) {
        advertenciasCosto.push({
          productoId,
          productoNombre: String(prod.nombre || productoId),
          costo: Number.isFinite(costo) ? costo : null,
        });
      }

      const requerido = nextQty;
      const stockInsuficiente = Number.isFinite(requerido) && stockActual < requerido;
      const stockNegativoResultante = nuevoStock < 0;
      if (stockInsuficiente) {
        advertenciasStockInsuficiente.push({
          productoId,
          productoNombre: String(prod.nombre || productoId),
          requerido,
          stockAntes: stockActual,
          stockDespues: nuevoStock,
        });
      }
      if (stockNegativoResultante) {
        advertenciasStockNegativo.push({
          productoId,
          productoNombre: String(prod.nombre || productoId),
          stockAntes: stockActual,
          stockDespues: nuevoStock,
        });
      }

      if (delta !== 0) {
        const nowTs = serverTimestamp();
        t.update(productoRef, { stock: nuevoStock, fechaActualizacion: nowTs });
        const movRef = doc(collection(db, "movimientos"));
        t.set(movRef, {
          productoId,
          tipo: delta < 0 ? "salida" : "entrada",
          cantidad: Math.abs(Number(delta)),
          usuario: user?.displayName || user?.email || "Sistema",
          usuarioUid: user?.uid || "",
          usuarioEmail: user?.email || "",
          fecha: nowTs,
          referencia: "edicion_venta",
          referenciaId: ventaRef.id,
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
      productosSinPrecio: missingPrecio.length > 0,
      productosSinCosto: advertenciasCosto.length > 0,
      stockInsuficiente: advertenciasStockInsuficiente.length > 0,
    });

    const payload = stripUndefined({
      ...ventaData,
      stockNegativo: flags.stockNegativo,
      productosSinPrecio: flags.productosSinPrecio,
      productosSinCosto: flags.productosSinCosto,
      requiereRevision: flags.requiereRevision,
      advertencias: {
        stockInsuficiente: advertenciasStockInsuficiente,
        stockNegativo: advertenciasStockNegativo,
        productosSinPrecio: missingPrecio,
        productosSinCosto: advertenciasCosto,
      },
      actualizadoEn: new Date().toISOString(),
    });

    t.update(ventaRef, payload);

    const auditoriaRef = doc(collection(db, "auditoria"));
    t.set(auditoriaRef, {
      accion: "EDICION_VENTA",
      coleccion: "ventas",
      documentoId: ventaRef.id,
      numeroPedido: String(payload?.numeroPedido || ventaPrev?.numeroPedido || ""),
      usuarioId: user?.uid || "",
      usuarioEmail: user?.email || "",
      fecha: serverTimestamp(),
      origen,
      flags,
      advertencias: payload.advertencias,
    });

    return { id: ventaRef.id, flags };
  });

  return result;
}
