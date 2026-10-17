import { preflightCorsPublico, jsonPublico } from "@/lib/cors-publico";
import { getAdminDb } from "@/lib/firebase-admin";
import { publicTiendaConfig, TIENDA_DEFAULTS } from "@/lib/tienda-config";

export const runtime = "nodejs";

export function OPTIONS(request) {
  return preflightCorsPublico(request);
}

// Contenido publicado de la tienda web. Si todavía no se publicó nada, devuelve los valores por defecto.
export async function GET(request) {
  try {
    const snap = await getAdminDb().collection("settings").doc("tienda").get();
    const published = snap.data()?.published;
    return jsonPublico(
      { ...publicTiendaConfig(published ?? TIENDA_DEFAULTS), version: Number(snap.data()?.version) || 0 },
      { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } },
      request
    );
  } catch {
    // La tienda tiene respaldo local; un error aquí no debe romper la página.
    return jsonPublico({ error: "contenido_no_disponible" }, { status: 503 }, request);
  }
}
