import { getAdminDb } from "@/lib/firebase-admin";
import { normalizePrecios } from "@/lib/tienda-config";

const TTL_MS = 15000;
let cache = { at: 0, value: null };

/** Ajuste de precios publicado desde /tienda-web (o null si no hay). Se guarda 15 s en memoria para no leer en cada pedido. */
export async function getPublishedPrecios({ fresh = false } = {}) {
  if (!fresh && cache.value !== undefined && Date.now() - cache.at < TTL_MS) return cache.value;
  try {
    const data = (await getAdminDb().collection("settings").doc("tienda").get()).data();
    const precios = data?.published?.precios ? normalizePrecios(data.published.precios) : null;
    cache = { at: Date.now(), value: precios?.activo ? precios : null };
  } catch (error) {
    // Sin configuración legible se muestran los precios originales; un error aquí no debe frenar la tienda.
    console.error("No se pudo leer el ajuste de precios:", error?.message);
    return cache.value ?? null;
  }
  return cache.value;
}

export function invalidatePreciosCache() {
  cache = { at: 0, value: null };
}
