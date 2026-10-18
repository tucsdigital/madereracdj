import { getAdminDb } from "@/lib/firebase-admin";
import { normalizeProductContent } from "@/lib/tienda-productos-contenido";

const TTL_MS = 15000;
let cache = { at: 0, value: null };

export async function getPublishedProductContent({ fresh = false } = {}) {
  if (!fresh && Date.now() - cache.at < TTL_MS) return cache.value;
  try {
    const data = (await getAdminDb().collection("settings").doc("tiendaProductosContenido").get()).data();
    cache = { at: Date.now(), value: normalizeProductContent(data?.published) };
  } catch (error) {
    console.error("No se pudo leer el contenido editorial de productos:", error?.message);
    return cache.value ?? normalizeProductContent(null);
  }
  return cache.value;
}

export function invalidateProductContentCache() {
  cache = { at: 0, value: null };
}
