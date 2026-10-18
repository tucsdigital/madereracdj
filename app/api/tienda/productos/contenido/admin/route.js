import { NextResponse } from "next/server";
import { getAdminDb, verifyFirebaseToken } from "@/lib/firebase-admin";
import { allowedImageHosts } from "@/lib/tienda-media";
import { normalizeProductContent, productContentIssues } from "@/lib/tienda-productos-contenido";
import { invalidateProductContentCache } from "@/lib/tienda-productos-contenido-server";

export const runtime = "nodejs";

const ref = () => getAdminDb().collection("settings").doc("tiendaProductosContenido");
const fail = (error) => NextResponse.json({
  error: error?.status === 401 ? "Iniciá sesión para administrar el contenido de productos." : error?.message || "No se pudo guardar el contenido de productos.",
}, { status: error?.status || 500 });

async function state() {
  const data = (await ref().get()).data() || {};
  return {
    config: normalizeProductContent(data.published),
    version: Number(data.version) || 0,
    savedAt: data.publishedAt || null,
    savedBy: data.publishedBy || null,
    imageHosts: allowedImageHosts(process.env.R2_PUBLIC_BASE),
  };
}

export async function GET(request) {
  try {
    await verifyFirebaseToken(request.headers.get("authorization"));
    return NextResponse.json(await state());
  } catch (error) {
    return fail(error);
  }
}

export async function PUT(request) {
  try {
    const actor = await verifyFirebaseToken(request.headers.get("authorization"));
    const body = await request.json().catch(() => ({}));
    const config = normalizeProductContent(body?.config);
    const issues = productContentIssues(config, allowedImageHosts(process.env.R2_PUBLIC_BASE));
    if (issues.length) return NextResponse.json({ error: "Revisá el contenido antes de guardar.", issues }, { status: 400 });

    const db = getAdminDb();
    const document = ref();
    const history = db.collection("settingsHistory").doc();
    const saved = await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(document);
      const current = snapshot.data() || {};
      const version = Number(current.version) || 0;
      if (Number(body?.baseVersion ?? 0) !== version) {
        throw Object.assign(new Error("Otra persona modificó el contenido. Recargá antes de guardar."), { status: 409 });
      }
      const previous = normalizeProductContent(current.published);
      if (JSON.stringify(previous) === JSON.stringify(config)) {
        return { config: previous, version, savedAt: current.publishedAt || null, savedBy: current.publishedBy || null, unchanged: true };
      }
      const at = new Date().toISOString();
      transaction.set(document, {
        published: config,
        version: version + 1,
        publishedAt: at,
        publishedBy: String(actor?.email || actor?.uid || ""),
      }, { merge: true });
      transaction.set(history, {
        tipo: "tienda_productos_contenido",
        at,
        byUid: String(actor?.uid || ""),
        byEmail: String(actor?.email || ""),
        before: previous,
        after: config,
      });
      return { config, version: version + 1, savedAt: at, savedBy: String(actor?.email || actor?.uid || "") };
    });
    invalidateProductContentCache();
    return NextResponse.json({ ...saved, imageHosts: allowedImageHosts(process.env.R2_PUBLIC_BASE) });
  } catch (error) {
    return fail(error);
  }
}
