/**
 * IDs de productos: el doc.id de Firestore es la fuente de verdad.
 * Algunos documentos guardan otro valor en el campo `id` (legacy).
 */

export const mapFirestoreDoc = (doc) => {
  const data = typeof doc?.data === "function" ? doc.data() || {} : doc || {};
  const docId = String(doc?.id || "").trim();
  return { ...data, id: docId };
};

/** ID de línea clonada: {baseId}-{timestamp}-{suffix} */
export const extractCompositeBaseId = (pid) => {
  const raw = String(pid || "").trim();
  if (!raw) return "";
  const match = raw.match(/^(.+)-(\d{10,13})-[a-z0-9]{5}$/i);
  return match ? String(match[1]).trim() : "";
};

export const normalizeLineItemProductoId = (p) => {
  const raw = String(p?.originalId || p?.productoId || p?.id || "").trim();
  if (!raw) return "";
  return extractCompositeBaseId(raw) || raw;
};

export const getLineItemCodigo = (p) =>
  String(p?.codigo || p?.codigoProducto || p?.productoCodigo || "").trim();

export const getLineItemNombre = (p) =>
  String(p?.nombre || p?.descripcion || "").trim();

/**
 * Resuelve el doc.id real en `productos` dentro de una transacción.
 * Orden: doc directo → base de ID compuesto → campo legacy `id` → código → nombre.
 */
export async function resolveCanonicalProductoId({ t, db, pid, codigo = "", nombre = "" }) {
  const tried = new Set();
  const tryDocId = async (candidate) => {
    const id = String(candidate || "").trim();
    if (!id || tried.has(id)) return null;
    tried.add(id);
    const snap = await t.get(db.collection("productos").doc(id));
    return snap?.exists ? id : null;
  };

  const direct = await tryDocId(pid);
  if (direct) return direct;

  const compositeBase = extractCompositeBaseId(pid);
  if (compositeBase) {
    const fromComposite = await tryDocId(compositeBase);
    if (fromComposite) return fromComposite;
  }

  const legacyPid = String(pid || "").trim();
  if (legacyPid) {
    const legacyQ = db.collection("productos").where("id", "==", legacyPid).limit(2);
    const legacySnap = await t.get(legacyQ);
    if (legacySnap && !legacySnap.empty && legacySnap.size === 1) {
      return String(legacySnap.docs[0].id);
    }
  }

  const cod = String(codigo || "").trim();
  if (cod) {
    const codQ = db.collection("productos").where("codigo", "==", cod).limit(2);
    const codSnap = await t.get(codQ);
    if (codSnap && !codSnap.empty && codSnap.size === 1) {
      return String(codSnap.docs[0].id);
    }
  }

  const rawNombre = String(nombre || "").trim();
  if (rawNombre) {
    const candidates = Array.from(new Set([rawNombre, rawNombre.toLowerCase(), rawNombre.toUpperCase()]));
    for (const n of candidates) {
      const nameQ = db.collection("productos").where("nombre", "==", n).limit(2);
      const nameSnap = await t.get(nameQ);
      if (nameSnap && !nameSnap.empty && nameSnap.size === 1) {
        return String(nameSnap.docs[0].id);
      }
    }
  }

  return null;
}
