import { getAdminDb } from "@/lib/firebase-admin";
import { normalizeVenta } from "@/lib/ecommerce-panel";

const TTL_MS = 15000;
const MAX_VENTAS = 5000;
let cache = { at: 0, value: null };

/** Ventas de la tienda online y fechas de alta de sus clientes. Se guarda 15 s en memoria para que filtrar y paginar no relea todo. */
export async function loadEcommerce({ fresh = false } = {}) {
  if (!fresh && cache.value && Date.now() - cache.at < TTL_MS) return cache.value;
  const db = getAdminDb();
  const [ventasSnap, clientesSnap] = await Promise.all([
    db.collection("ventas").where("origen", "==", "ecommerce_externo").limit(MAX_VENTAS).get(),
    db.collection("clientes").where("origen", "==", "ecommerce").select("creadoEn").get(),
  ]);
  const rows = ventasSnap.docs.map((doc) => normalizeVenta(doc.id, doc.data()));
  const altas = clientesSnap.docs.map((doc) => {
    const ms = Date.parse(doc.data()?.creadoEn || "");
    return Number.isFinite(ms) ? ms : 0;
  });
  cache = { at: Date.now(), value: { rows, altas, actualizado: new Date().toISOString(), truncado: ventasSnap.size >= MAX_VENTAS } };
  return cache.value;
}
