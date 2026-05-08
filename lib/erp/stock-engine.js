import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase-admin";

const stripUndefined = (value) => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (Array.isArray(value)) {
    const arr = value
      .map((v) => stripUndefined(v))
      .filter((v) => v !== undefined);
    return arr;
  }
  if (typeof value === "object") {
    if (value instanceof FieldValue) {
      return value;
    }
    if (
      typeof value?._toFieldTransform === "function" ||
      typeof value?._toProto === "function" ||
      typeof value?.toDate === "function"
    ) {
      return value;
    }
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      const cleaned = stripUndefined(v);
      if (cleaned !== undefined) out[k] = cleaned;
    }
    return out;
  }
  return value;
};

export async function applyStockMovimientoEngine({
  actor,
  productoId,
  tipo,
  cantidad,
  modoAjuste,
  stockFinalDeseado,
  motivo,
  observaciones,
  referencia,
  referenciaId,
  origen = "ui",
}) {
  const db = getAdminDb();
  const pid = String(productoId || "").trim();
  if (!pid) throw new Error("productoId requerido");

  const tTipo = String(tipo || "").trim().toLowerCase();
  if (!["entrada", "salida", "ajuste"].includes(tTipo)) throw new Error("tipo inválido");

  const refProd = db.collection("productos").doc(pid);

  const result = await db.runTransaction(async (t) => {
    const snap = await t.get(refProd);
    if (!snap.exists) throw new Error("Producto no encontrado");
    const prod = snap.data() || {};
    const stockActual = Number(prod.stock) || 0;

    let delta = 0;
    if (tTipo === "entrada") {
      delta = Math.abs(Number(cantidad) || 0);
    } else if (tTipo === "salida") {
      delta = -Math.abs(Number(cantidad) || 0);
    } else if (tTipo === "ajuste") {
      const mode = String(modoAjuste || "delta").trim().toLowerCase();
      if (mode === "absoluto") {
        const final = Number(stockFinalDeseado);
        if (!Number.isFinite(final)) throw new Error("stockFinalDeseado inválido");
        delta = final - stockActual;
      } else {
        const d = Number(cantidad);
        if (!Number.isFinite(d)) throw new Error("cantidad inválida");
        delta = d;
      }
    }

    const nuevoStock = stockActual + Number(delta);
    const nowTs = FieldValue.serverTimestamp();

    t.update(refProd, { stock: nuevoStock, fechaActualizacion: nowTs });

    const movRef = db.collection("movimientos").doc();
    t.set(movRef, stripUndefined({
      productoId: pid,
      tipo: tTipo,
      cantidad: Math.abs(Number(delta)),
      modoAjuste: tTipo === "ajuste" ? String(modoAjuste || "delta") : null,
      stockAntes: stockActual,
      stockDelta: Number(delta),
      stockDespues: nuevoStock,
      stockNegativoDespues: nuevoStock < 0,
      motivo: String(motivo || "").trim(),
      usuario: actor?.email || "Sistema",
      usuarioUid: actor?.uid || "",
      usuarioEmail: actor?.email || "",
      observaciones: String(observaciones || "").trim(),
      fecha: nowTs,
      categoria: String(prod.categoria || ""),
      nombreProducto: String(prod.nombre || ""),
      referencia: String(referencia || "movimiento_stock"),
      referenciaId: String(referenciaId || ""),
      origen,
    }));

    const auditRef = db.collection("auditoria").doc();
    t.set(auditRef, stripUndefined({
      accion: "MOVIMIENTO_STOCK",
      coleccion: "productos",
      documentoId: pid,
      usuarioId: actor?.uid || "",
      usuarioEmail: actor?.email || "",
      fecha: nowTs,
      origen,
      tipo: tTipo,
      stockAntes: stockActual,
      stockDelta: Number(delta),
      stockDespues: nuevoStock,
      movimientoId: movRef.id,
      motivo: String(motivo || "").trim(),
      observaciones: String(observaciones || "").trim(),
    }));

    return { ok: true, productoId: pid, stockAntes: stockActual, stockDelta: Number(delta), stockDespues: nuevoStock, movimientoId: movRef.id };
  });

  return result;
}
