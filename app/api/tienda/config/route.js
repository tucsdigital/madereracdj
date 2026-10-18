import { NextResponse } from "next/server";
import { getAdminDb, verifyFirebaseToken } from "@/lib/firebase-admin";
import { normalizeTiendaConfig, tiendaIssues, validateTiendaConfig } from "@/lib/tienda-config";
import { allowedImageHosts } from "@/lib/tienda-media";
import { invalidatePreciosCache } from "@/lib/tienda-precios-server";

export const runtime = "nodejs";

const ref = () => getAdminDb().collection("settings").doc("tienda");
const imageHosts = () => allowedImageHosts(process.env.R2_PUBLIC_BASE);

async function estado() {
  const data = (await ref().get()).data() || {};
  const config = normalizeTiendaConfig(data.published);
  return {
    config,
    version: Number(data.version) || 0,
    savedAt: data.publishedAt || null,
    savedBy: data.publishedBy || null,
    imageHosts: imageHosts(),
    warnings: validateTiendaConfig(config, { imageHosts: imageHosts() }).warnings,
  };
}

const fail = (error) => {
  const status = error?.status || 500;
  const message = status === 401 ? "Iniciá sesión para administrar la tienda web." : error?.message || "No se pudo completar la acción.";
  return NextResponse.json({ error: message }, { status });
};

export async function GET(request) {
  try {
    await verifyFirebaseToken(request.headers.get("authorization"));
    return NextResponse.json(await estado());
  } catch (error) {
    return fail(error);
  }
}

// Guarda los cambios y los publica en la tienda. No hay borradores: lo guardado es lo que se muestra.
export async function PUT(request) {
  try {
    const actor = await verifyFirebaseToken(request.headers.get("authorization"));
    const body = await request.json().catch(() => ({}));
    const config = normalizeTiendaConfig(body?.config);

    // Validar contra el cuerpo original para distinguir un campo vacío de uno inválido
    // que la normalización convertiría en vacío.
    const issues = tiendaIssues(body?.config, { imageHosts: imageHosts() });
    if (issues.length) {
      return NextResponse.json({ error: "Hay datos que corregir antes de guardar.", errores: issues.map((i) => i.message), issues }, { status: 400 });
    }

    const current = await estado();
    // Si otra persona guardó mientras tanto, no se pisa su trabajo.
    if (body?.baseVersion !== undefined && Number(body.baseVersion) !== current.version) {
      return NextResponse.json({ error: "Otra persona modificó la tienda web mientras editabas. Recargá la página para ver los cambios." }, { status: 409 });
    }
    if (JSON.stringify(current.config) === JSON.stringify(config)) return NextResponse.json(current);

    const db = getAdminDb();
    const at = new Date().toISOString();
    await db.collection("settingsHistory").add({
      tipo: "tienda", at, byUid: String(actor?.uid || ""), byEmail: String(actor?.email || ""),
      before: current.config, after: config,
    });
    await ref().set({
      published: config, publishedAt: at, publishedBy: String(actor?.email || actor?.uid || ""),
      version: current.version + 1, draft: null, draftUpdatedAt: null, draftBy: null,
    }, { merge: true });
    invalidatePreciosCache();
    return NextResponse.json(await estado());
  } catch (error) {
    return fail(error);
  }
}
