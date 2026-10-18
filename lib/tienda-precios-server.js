import { getAdminDb } from "@/lib/firebase-admin";
import { normalizePrecios, normalizeStock } from "@/lib/tienda-config";

const TTL_MS = 15000;
let cache = { at: 0, value: null };

async function readPublished({ fresh = false } = {}) {
  if (!fresh && Date.now() - cache.at < TTL_MS) return cache.value;
  try {
    const data = (await getAdminDb().collection("settings").doc("tienda").get()).data();
    const precios = data?.published?.precios ? normalizePrecios(data.published.precios) : null;
    const stock = data?.published?.stock ? normalizeStock(data.published.stock) : null;
    cache = { at: Date.now(), value: { precios: precios?.activo ? precios : null, stock: stock?.activo ? stock : null } };
  } catch (error) {
    // Sin configuración legible se usan los valores de siempre; un error aquí no debe frenar la tienda.
    console.error("No se pudo leer la configuración de la tienda:", error?.message);
    return cache.value ?? { precios: null, stock: null };
  }
  return cache.value;
}

/** Ajuste de precios publicado desde /tienda-web (o null si no hay). Se guarda 15 s en memoria para no leer en cada pedido. */
export async function getPublishedPrecios(options) {
  return (await readPublished(options)).precios;
}

/** Reglas de venta sin stock publicadas desde /tienda-web (o null si están desactivadas). */
export async function getPublishedStock(options) {
  return (await readPublished(options)).stock;
}

export function invalidatePreciosCache() {
  cache = { at: 0, value: null };
}
