import { preflightCorsPublico, jsonPublico } from "@/lib/cors-publico";
import { getAdminDb } from "@/lib/firebase-admin";
import { publicTiendaConfig, TIENDA_DEFAULTS } from "@/lib/tienda-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export function OPTIONS(request) {
  return preflightCorsPublico(request);
}

// Contenido publicado de la tienda web. Si todavía no se publicó nada, devuelve los valores por defecto.
export async function GET(request) {
  try {
    const snap = await getAdminDb().collection("settings").doc("tienda").get();
    const stored = snap.data() || {};
    const published = stored.published;
    return jsonPublico(
      { ...publicTiendaConfig(published ?? TIENDA_DEFAULTS), version: Number(stored.version) || 0 },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
      request
    );
  } catch {
    // La tienda tiene respaldo local; un error aquí no debe romper la página.
    return jsonPublico({ error: "contenido_no_disponible" }, { status: 503 }, request);
  }
}
