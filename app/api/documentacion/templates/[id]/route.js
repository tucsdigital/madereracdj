import { NextResponse } from "next/server";
import { getAdminDb, verifyFirebaseToken } from "@/lib/firebase-admin";
import { addTemplateEvent, nowIso } from "@/lib/documentacion-server";

export async function GET(request, { params }) {
  try {
    const authHeader = request.headers.get("authorization") || "";
    await verifyFirebaseToken(authHeader);

    const id = params?.id;
    const db = getAdminDb();
    const snap = await db.collection("documentacionTemplates").doc(String(id)).get();
    if (!snap.exists) {
      return NextResponse.json({ ok: false, error: "No encontrado" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, item: { id: snap.id, ...snap.data() } });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Error" },
      { status: e?.status || 500 }
    );
  }
}

export async function PUT(request, { params }) {
  try {
    const authHeader = request.headers.get("authorization") || "";
    const user = await verifyFirebaseToken(authHeader);
    const id = params?.id;
    const body = await request.json();
    const db = getAdminDb();
    const ref = db.collection("documentacionTemplates").doc(String(id));
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ ok: false, error: "No encontrado" }, { status: 404 });
    }

    const current = snap.data() || {};
    const nombre = String(body?.nombre ?? current.nombre ?? "").trim();
    const descripcion = String(body?.descripcion ?? current.descripcion ?? "").trim();
    const bodyHtml = String(body?.bodyHtml ?? current.bodyHtml ?? "");
    const legalHtml = String(body?.legalHtml ?? current.legalHtml ?? "");
    const variables = Array.isArray(body?.variables) ? body.variables : current.variables || [];
    const fields = Array.isArray(body?.fields) ? body.fields : current.fields || [];
    const archived = Boolean(body?.archived ?? current.archived ?? false);

    if (!nombre) {
      return NextResponse.json({ ok: false, error: "Nombre requerido" }, { status: 400 });
    }

    const now = nowIso();
    const nextVersion = Number(current.version || 1) + 1;
    await ref.set(
      {
        nombre,
        descripcion,
        bodyHtml,
        legalHtml,
        variables,
        fields,
        archived,
        version: nextVersion,
        updatedAt: now,
        updatedByUid: user.uid || "",
        updatedByEmail: user.email || "",
      },
      { merge: true }
    );

    await addTemplateEvent({
      templateId: ref.id,
      type: "template_updated",
      actorType: "internal",
      actorId: user.uid,
      actorEmail: user.email,
      ip: "",
      userAgent: request.headers.get("user-agent") || "",
      details: { version: nextVersion },
    });

    return NextResponse.json({ ok: true, id: ref.id, version: nextVersion });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Error" },
      { status: e?.status || 500 }
    );
  }
}

export async function DELETE(request, { params }) {
  try {
    const authHeader = request.headers.get("authorization") || "";
    const user = await verifyFirebaseToken(authHeader);
    const id = params?.id;
    const db = getAdminDb();
    const ref = db.collection("documentacionTemplates").doc(String(id));
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ ok: false, error: "No encontrado" }, { status: 404 });
    }

    const now = nowIso();
    await ref.set(
      {
        archived: true,
        updatedAt: now,
        updatedByUid: user.uid || "",
        updatedByEmail: user.email || "",
      },
      { merge: true }
    );

    await addTemplateEvent({
      templateId: ref.id,
      type: "template_archived",
      actorType: "internal",
      actorId: user.uid,
      actorEmail: user.email,
      ip: "",
      userAgent: request.headers.get("user-agent") || "",
      details: {},
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Error" },
      { status: e?.status || 500 }
    );
  }
}
