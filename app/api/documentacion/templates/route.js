import { NextResponse } from "next/server";
import { getAdminDb, verifyFirebaseToken } from "@/lib/firebase-admin";
import { addTemplateEvent, nowIso } from "@/lib/documentacion-server";

export async function GET(request) {
  try {
    const authHeader = request.headers.get("authorization") || "";
    await verifyFirebaseToken(authHeader);

    const db = getAdminDb();
    const snap = await db
      .collection("documentacionTemplates")
      .where("archived", "==", false)
      .orderBy("updatedAt", "desc")
      .limit(200)
      .get();

    return NextResponse.json({
      ok: true,
      items: snap.docs.map((d) => ({ id: d.id, ...d.data() })),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Error" },
      { status: e?.status || 500 }
    );
  }
}

export async function POST(request) {
  try {
    const authHeader = request.headers.get("authorization") || "";
    const user = await verifyFirebaseToken(authHeader);
    const body = await request.json();

    const nombre = String(body?.nombre || "").trim();
    const descripcion = String(body?.descripcion || "").trim();
    const bodyHtml = String(body?.bodyHtml || "").trim();
    const legalHtml = String(body?.legalHtml || "").trim();
    const variables = Array.isArray(body?.variables) ? body.variables : [];
    const fields = Array.isArray(body?.fields) ? body.fields : [];

    if (!nombre) {
      return NextResponse.json({ ok: false, error: "Nombre requerido" }, { status: 400 });
    }

    const db = getAdminDb();
    const ref = db.collection("documentacionTemplates").doc();
    const now = nowIso();
    await ref.set({
      nombre,
      descripcion,
      bodyHtml,
      legalHtml,
      variables,
      fields,
      version: 1,
      archived: false,
      createdAt: now,
      createdByUid: user.uid || "",
      createdByEmail: user.email || "",
      updatedAt: now,
      updatedByUid: user.uid || "",
      updatedByEmail: user.email || "",
    });

    await addTemplateEvent({
      templateId: ref.id,
      type: "template_created",
      actorType: "internal",
      actorId: user.uid,
      actorEmail: user.email,
      ip: "",
      userAgent: request.headers.get("user-agent") || "",
      details: { nombre },
    });

    return NextResponse.json({ ok: true, id: ref.id });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Error" },
      { status: e?.status || 500 }
    );
  }
}
