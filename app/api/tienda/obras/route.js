import { getAdminDb } from "@/lib/firebase-admin";
import { jsonPublico, preflightCorsPublico } from "@/lib/cors-publico";
import { normalizeProject, OBRAS_COLLECTION } from "@/lib/tienda-obras";
import legacyProjects from "@/lib/legacy-projects.json";

export const runtime = "nodejs";

export function OPTIONS(request) {
  return preflightCorsPublico(request);
}

export async function GET(request) {
  try {
    const snap = await getAdminDb().collection(OBRAS_COLLECTION).get();
    const items = snap.empty
      ? legacyProjects.map((project) => normalizeProject(project, project.slug))
      : snap.docs.map((doc) => doc.data()?.published).filter((project) => project?.status === "active");
    return jsonPublico({ items }, { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" } }, request);
  } catch {
    return jsonPublico({ error: "obras_no_disponibles" }, { status: 503 }, request);
  }
}
