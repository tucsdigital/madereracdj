import { NextResponse } from "next/server";
import { getAdminDb, verifyFirebaseToken } from "@/lib/firebase-admin";
import { OBRAS_COLLECTION, OBRAS_SLUG_PATTERN } from "@/lib/tienda-obras";

export const runtime = "nodejs";

export async function PUT(request) {
  try {
    const actor = await verifyFirebaseToken(request.headers.get("authorization"));
    const body = await request.json().catch(() => ({}));
    if (!Array.isArray(body?.slugs) || body.slugs.length > 500) {
      return NextResponse.json({ error: "La lista de orden no es válida." }, { status: 400 });
    }
    const requested = [...new Set(body.slugs.map((slug) => String(slug || "").trim()).filter((slug) => OBRAS_SLUG_PATTERN.test(slug)))];
    const db = getAdminDb();
    const collectionSnapshot = await db.collection(OBRAS_COLLECTION).get();
    const knownSlugs = collectionSnapshot.docs.map((document) => document.id);
    const knownSet = new Set(knownSlugs);
    const requestedKnown = requested.filter((slug) => knownSet.has(slug));
    const ref = db.collection("settings").doc("tiendaObrasOrden");
    const historyRef = db.collection("settingsHistory").doc();
    const result = await db.runTransaction(async (transaction) => {
      const currentSnapshot = await transaction.get(ref);
      const current = currentSnapshot.data() || {};
      const version = Number(current.version) || 0;
      if (body?.baseVersion !== undefined && Number(body.baseVersion) !== version) {
        throw Object.assign(new Error("Otra persona cambió el orden de las obras. Recargá la lista e intentá de nuevo."), { status: 409 });
      }
      const previous = Array.isArray(current.slugs) ? current.slugs.filter((slug) => knownSet.has(slug)) : [];
      const slugs = [...requestedKnown, ...previous.filter((slug) => !requestedKnown.includes(slug)), ...knownSlugs.filter((slug) => !requestedKnown.includes(slug) && !previous.includes(slug))];
      const now = new Date().toISOString();
      transaction.set(ref, { slugs, version: version + 1, updatedAt: now, updatedBy: String(actor?.email || actor?.uid || "") }, { merge: true });
      transaction.set(historyRef, { tipo: "orden_obras_tienda", at: now, byUid: String(actor?.uid || ""), byEmail: String(actor?.email || ""), before: previous, after: slugs });
      return { slugs, version: version + 1 };
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error?.message || "No se pudo guardar el orden de las obras." }, { status: error?.status || 500 });
  }
}
