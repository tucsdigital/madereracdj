import { getAdminDb } from "@/lib/firebase-admin";
import { jsonPublico, preflightCorsPublico } from "@/lib/cors-publico";
import { importLegacyProjectsIfEmpty, OBRAS_COLLECTION, sortProjectsByManualOrder } from "@/lib/tienda-obras";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export function OPTIONS(request) {
  return preflightCorsPublico(request);
}

export async function GET(request) {
  try {
    await importLegacyProjectsIfEmpty();
    const db = getAdminDb();
    const [snap, orderSnap] = await Promise.all([
      db.collection(OBRAS_COLLECTION).get(),
      db.collection("settings").doc("tiendaObrasOrden").get(),
    ]);
    const projects = snap.docs.map((doc) => doc.data()?.published).filter((project) => project?.status === "active");
    const items = sortProjectsByManualOrder(projects, orderSnap.data()?.slugs || []);
    return jsonPublico({ items }, { headers: { "Cache-Control": "no-store, max-age=0" } }, request);
  } catch {
    return jsonPublico({ error: "obras_no_disponibles" }, { status: 503 }, request);
  }
}
