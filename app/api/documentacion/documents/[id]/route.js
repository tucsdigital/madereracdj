import { NextResponse } from "next/server";
import { getAdminDb, verifyFirebaseToken } from "@/lib/firebase-admin";
import { addDocumentoEvent, nowIso } from "@/lib/documentacion-server";
import { DOCUMENTO_ESTADOS, canEditarDocumento, canEmitirDocumento } from "@/lib/documentacion-states";

export async function GET(request, { params }) {
  try {
    const authHeader = request.headers.get("authorization") || "";
    await verifyFirebaseToken(authHeader);

    const id = params?.id;
    const db = getAdminDb();
    const snap = await db.collection("documentos").doc(String(id)).get();
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
    const db = getAdminDb();
    const ref = db.collection("documentos").doc(String(id));
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ ok: false, error: "No encontrado" }, { status: 404 });
    }
    const current = snap.data() || {};
    if (!canEditarDocumento(current)) {
      return NextResponse.json(
        { ok: false, error: "El documento no se puede editar en su estado actual" },
        { status: 409 }
      );
    }

    const body = await request.json();
    const keys = Object.keys(body || {});

    const patch = {};
    if (typeof body?.titulo === "string") patch.titulo = body.titulo.trim();
    if (typeof body?.contentHtml === "string") patch.contentHtml = body.contentHtml;
    if (typeof body?.legalHtml === "string") patch.legalHtml = body.legalHtml;
    if (body?.obra === null) patch.obra = null;
    if (body?.cliente === null) patch.cliente = null;
    if (body?.ubicacion === null) patch.ubicacion = null;
    if (body?.template === null) patch.template = null;
    if (body?.obra && typeof body.obra === "object") {
      patch.obra = {
        id: String(body.obra.id || ""),
        numeroPedido: String(body.obra.numeroPedido || ""),
        tipo: String(body.obra.tipo || ""),
      };
    }
    if (body?.cliente && typeof body.cliente === "object") {
      patch.cliente = {
        id: String(body.cliente.id || ""),
        nombre: String(body.cliente.nombre || ""),
        telefono: String(body.cliente.telefono || ""),
        email: String(body.cliente.email || ""),
        cuit: String(body.cliente.cuit || ""),
        direccion: String(body.cliente.direccion || ""),
        localidad: String(body.cliente.localidad || ""),
        provincia: String(body.cliente.provincia || ""),
        partido: String(body.cliente.partido || ""),
      };
    }
    if (body?.ubicacion && typeof body.ubicacion === "object") {
      patch.ubicacion = {
        direccion: String(body.ubicacion.direccion || ""),
        localidad: String(body.ubicacion.localidad || ""),
        provincia: String(body.ubicacion.provincia || ""),
        partido: String(body.ubicacion.partido || ""),
        barrio: String(body.ubicacion.barrio || ""),
        area: String(body.ubicacion.area || ""),
        lote: String(body.ubicacion.lote || ""),
        descripcion: String(body.ubicacion.descripcion || ""),
      };
    }
    if (body?.template && typeof body.template === "object") {
      patch.template = {
        id: String(body.template.id || ""),
        nombre: String(body.template.nombre || ""),
        version: Number(body.template.version || 1),
      };
    }
    if (body?.responsable && typeof body.responsable === "object") {
      patch.responsable = {
        uid: String(body.responsable.uid || ""),
        email: String(body.responsable.email || ""),
        nombre: String(body.responsable.nombre || ""),
      };
    }

    const now = nowIso();
    patch.updatedAt = now;
    patch.updatedByUid = String(user.uid || "");
    patch.updatedByEmail = String(user.email || "");

    await ref.set(patch, { merge: true });

    await addDocumentoEvent({
      documentoId: ref.id,
      type: "document_updated",
      actorType: "internal",
      actorId: user.uid,
      actorEmail: user.email,
      ip: "",
      userAgent: request.headers.get("user-agent") || "",
      details: { keys },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Error" },
      { status: e?.status || 500 }
    );
  }
}

export async function POST(request, { params }) {
  try {
    const authHeader = request.headers.get("authorization") || "";
    const user = await verifyFirebaseToken(authHeader);
    const url = new URL(request.url);
    const action = url.searchParams.get("action") || "";

    if (action !== "emitir") {
      return NextResponse.json({ ok: false, error: "Acción no válida" }, { status: 400 });
    }

    const id = params?.id;
    const db = getAdminDb();
    const ref = db.collection("documentos").doc(String(id));
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ ok: false, error: "No encontrado" }, { status: 404 });
    }
    const current = snap.data() || {};
    if (!canEmitirDocumento(current)) {
      return NextResponse.json({ ok: false, error: "No se puede emitir" }, { status: 409 });
    }
    const titulo = String(current?.titulo || "").trim();
    const contentHtml = String(current?.contentHtml || "").trim();
    if (!titulo) {
      return NextResponse.json({ ok: false, error: "Título requerido" }, { status: 400 });
    }
    if (!contentHtml) {
      return NextResponse.json({ ok: false, error: "Contenido requerido" }, { status: 400 });
    }

    const now = nowIso();
    await ref.set(
      {
        estado: DOCUMENTO_ESTADOS.EMITIDO,
        emitidoAt: now,
        emitidoByUid: String(user.uid || ""),
        emitidoByEmail: String(user.email || ""),
        updatedAt: now,
        updatedByUid: String(user.uid || ""),
        updatedByEmail: String(user.email || ""),
      },
      { merge: true }
    );

    await addDocumentoEvent({
      documentoId: ref.id,
      type: "document_emitted",
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
