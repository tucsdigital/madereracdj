import { NextResponse } from "next/server";
import { getAdminDb, verifyFirebaseToken } from "@/lib/firebase-admin";
import { allowedImageHosts } from "@/lib/tienda-media";
import { normalizeProject, OBRAS_COLLECTION, OBRAS_SLUG_PATTERN, projectIssues } from "@/lib/tienda-obras";

export const runtime = "nodejs";

const fail = (error) => NextResponse.json({ error: error?.status === 401 ? "Iniciá sesión para administrar las obras." : error?.message || "No se pudo guardar la obra." }, { status: error?.status || 500 });

export async function PUT(request, { params }) {
  try {
    const actor = await verifyFirebaseToken(request.headers.get("authorization"));
    const slug = String(params.slug || "").trim().toLowerCase();
    if (!OBRAS_SLUG_PATTERN.test(slug)) return NextResponse.json({ error: "El slug de la obra no es válido." }, { status: 400 });
    const body = await request.json();
    const project = normalizeProject(body?.project, slug);
    const issues = projectIssues(project, allowedImageHosts(process.env.R2_PUBLIC_BASE));
    if (issues.length) return NextResponse.json({ error: "Hay datos que corregir antes de guardar.", issues }, { status: 400 });

    const db = getAdminDb();
    const ref = db.collection(OBRAS_COLLECTION).doc(slug);
    const historyRef = db.collection("settingsHistory").doc();
    const result = await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(ref);
      const current = snap.data() || {};
      const version = Number(current.version) || 0;
      if (Number(body?.baseVersion || 0) !== version) {
        throw Object.assign(new Error("Otra persona modificó esta obra. Recargá antes de guardar."), { status: 409 });
      }
      const now = new Date().toISOString();
      transaction.set(ref, {
        slug,
        draft: project,
        published: current.published || null,
        version: version + 1,
        publishedVersion: Number(current.publishedVersion) || 0,
        updatedAt: now,
        updatedBy: String(actor?.email || actor?.uid || ""),
        publishedAt: current.publishedAt || null,
      }, { merge: true });
      transaction.set(historyRef, {
        tipo: "obra",
        slug,
        at: now,
        byUid: String(actor?.uid || ""),
        byEmail: String(actor?.email || ""),
        before: current.draft || current.published || null,
        after: project,
      });
      return { slug, project, version: version + 1, published: false, updatedAt: now };
    });
    return NextResponse.json(result);
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request, { params }) {
  try {
    const actor = await verifyFirebaseToken(request.headers.get("authorization"));
    const slug = String(params.slug || "").trim().toLowerCase();
    const db = getAdminDb();
    const ref = db.collection(OBRAS_COLLECTION).doc(slug);
    const historyRef = db.collection("settingsHistory").doc();
    const body = await request.json().catch(() => ({}));
    const result = await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(ref);
      if (!snap.exists) throw Object.assign(new Error("No se encontró la obra."), { status: 404 });
      const current = snap.data() || {};
      const version = Number(current.version) || 0;
      if (Number(body?.baseVersion) !== version) throw Object.assign(new Error("La obra cambió mientras la editabas. Recargá antes de publicar."), { status: 409 });
      const project = current.draft || current.published;
      if (!project) throw Object.assign(new Error("La obra no tiene contenido para publicar."), { status: 400 });
      const issues = projectIssues(normalizeProject(project, slug), allowedImageHosts(process.env.R2_PUBLIC_BASE), { forPublish: true });
      if (issues.length) throw Object.assign(new Error(issues.join(" ")), { status: 400 });
      const now = new Date().toISOString();
      transaction.set(ref, {
        published: project,
        publishedVersion: version,
        version: version + 1,
        publishedAt: now,
        publishedBy: String(actor?.email || actor?.uid || ""),
      }, { merge: true });
      transaction.set(historyRef, {
        tipo: "obra_publicada",
        slug,
        at: now,
        byUid: String(actor?.uid || ""),
        byEmail: String(actor?.email || ""),
        before: current.published || null,
        after: project,
      });
      return { slug, project, version: version + 1, published: project.status === "active", publishedAt: now };
    });
    return NextResponse.json(result);
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(request, { params }) {
  try {
    const actor = await verifyFirebaseToken(request.headers.get("authorization"));
    const slug = String(params.slug || "").trim().toLowerCase();
    if (!OBRAS_SLUG_PATTERN.test(slug)) return NextResponse.json({ error: "El slug de la obra no es válido." }, { status: 400 });
    const body = await request.json().catch(() => ({}));
    const db = getAdminDb();
    const ref = db.collection(OBRAS_COLLECTION).doc(slug);
    const historyRef = db.collection("settingsHistory").doc();
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) throw Object.assign(new Error("No se encontró la obra."), { status: 404 });
      const current = snapshot.data() || {};
      const version = Number(current.version) || 0;
      if (Number(body?.baseVersion) !== version) {
        throw Object.assign(new Error("La obra cambió mientras la editabas. Recargá antes de eliminarla."), { status: 409 });
      }
      const at = new Date().toISOString();
      transaction.set(historyRef, {
        tipo: "obra_eliminada",
        slug,
        at,
        byUid: String(actor?.uid || ""),
        byEmail: String(actor?.email || ""),
        before: current,
        after: null,
      });
      transaction.delete(ref);
    });
    return NextResponse.json({ slug, deleted: true });
  } catch (error) {
    return fail(error);
  }
}
