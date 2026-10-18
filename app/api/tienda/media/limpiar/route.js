import { NextResponse } from "next/server";
import { getAdminDb, verifyFirebaseToken } from "@/lib/firebase-admin";
import { deleteFileFromR2 } from "@/lib/r2-storage";
import { KEY_PREFIX, imageUrlsOf, projectImageUrlsOf } from "@/lib/tienda-media";

export const runtime = "nodejs";

// Sin `confirmar` sólo informa qué imágenes no usa ni el borrador ni lo publicado; con `confirmar: true` las elimina de R2.
export async function POST(request) {
  try {
    await verifyFirebaseToken(request.headers.get("authorization"));
    const body = await request.json().catch(() => ({}));
    const db = getAdminDb();

    const data = (await db.collection("settings").doc("tienda").get()).data() || {};
    const used = new Set([...imageUrlsOf(data.published), ...imageUrlsOf(data.draft)]);
    const projects = await db.collection("obrasTienda").get();
    projects.docs.forEach((doc) => {
      const project = doc.data() || {};
      projectImageUrlsOf(project.published).forEach((url) => used.add(url));
      projectImageUrlsOf(project.draft).forEach((url) => used.add(url));
    });

    const snap = await db.collection("tiendaMedia").get();
    const unused = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      // Sólo se toca el prefijo de la tienda: jamás comprobantes ni asistencia.
      .filter((item) => String(item.key || "").startsWith(KEY_PREFIX) && !used.has(item.url));

    if (body?.confirmar !== true) {
      return NextResponse.json({ unused: unused.map(({ id, key, url, size, at }) => ({ id, key, url, size, at })) });
    }

    let deleted = 0;
    const errors = [];
    for (const item of unused) {
      try {
        await deleteFileFromR2(item.key);
        await db.collection("tiendaMedia").doc(item.id).delete();
        deleted += 1;
      } catch (error) {
        errors.push(`${item.key}: ${error?.message || "error"}`);
      }
    }
    return NextResponse.json({ deleted, errors });
  } catch (error) {
    const status = error?.status || 500;
    return NextResponse.json({ error: status === 401 ? "Iniciá sesión para administrar las imágenes." : error?.message || "No se pudo completar la limpieza." }, { status });
  }
}
