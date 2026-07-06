import { NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/firebase-admin";
import { deleteFileFromR2, uploadFileToR2 } from "@/lib/r2-storage";

function withCors(resp) {
  const headers = new Headers(resp.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "POST,DELETE,OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  return new NextResponse(resp.body, { status: resp.status, headers });
}

async function requireAuth(request) {
  const bearer = String(request.headers.get("Authorization") || "").trim();
  if (!bearer.toLowerCase().startsWith("bearer ")) {
    throw new Error("unauthorized");
  }

  const auth = getAdminAuth();
  await auth.verifyIdToken(bearer.substring(7));
}

export function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

export async function POST(request) {
  try {
    await requireAuth(request);

    const contentType = request.headers.get("content-type") || "";
    if (!contentType.toLowerCase().includes("multipart/form-data")) {
      return withCors(NextResponse.json({ ok: false, error: "content_type_invalid" }, { status: 400 }));
    }

    const form = await request.formData();
    const file = form.get("file");
    const employeeId = String(form.get("employeeId") || "").trim();
    const weekStart = String(form.get("weekStart") || "").trim();
    const dayKey = String(form.get("dayKey") || "").trim();

    if (!employeeId || !weekStart || !dayKey) {
      return withCors(NextResponse.json({ ok: false, error: "payload_invalido" }, { status: 400 }));
    }
    if (!file || typeof file.name !== "string") {
      return withCors(NextResponse.json({ ok: false, error: "archivo_requerido" }, { status: 400 }));
    }

    const allowed = new Set([
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp",
    ]);
    const fileType = String(file.type || "").toLowerCase();
    if (!allowed.has(fileType)) {
      return withCors(NextResponse.json({ ok: false, error: "mime_no_permitido" }, { status: 400 }));
    }

    const size = Number(file.size || 0);
    const maxBytes = 10 * 1024 * 1024;
    if (!Number.isFinite(size) || size <= 0) {
      return withCors(NextResponse.json({ ok: false, error: "archivo_vacio" }, { status: 400 }));
    }
    if (size > maxBytes) {
      return withCors(NextResponse.json({ ok: false, error: "archivo_demasiado_grande" }, { status: 413 }));
    }

    const safeName = file.name.replace(/[^\w.\-]+/g, "_");
    const key = `comprobantes/asistencia/ausentismo/${employeeId}/${weekStart}/${dayKey}/${Date.now()}-${safeName}`;
    const uploaded = await uploadFileToR2({
      key,
      file,
      contentType: fileType,
    });

    return withCors(
      NextResponse.json(
        {
          ok: true,
          adjunto: {
            id: `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
            nombreArchivo: safeName,
            mimeType: fileType,
            size,
            storagePath: key,
            url: uploaded?.url || null,
            uploadedAt: new Date().toISOString(),
          },
        },
        { status: 201 }
      )
    );
  } catch (error) {
    const message = error?.message || "internal_error";
    const status = message === "unauthorized" ? 401 : 500;
    return withCors(NextResponse.json({ ok: false, error: message }, { status }));
  }
}

export async function DELETE(request) {
  try {
    await requireAuth(request);

    const body = await request.json();
    const storagePath = String(body?.storagePath || "").trim();
    if (!storagePath) {
      return withCors(NextResponse.json({ ok: false, error: "storage_path_requerido" }, { status: 400 }));
    }

    await deleteFileFromR2(storagePath);
    return withCors(NextResponse.json({ ok: true }));
  } catch (error) {
    const message = error?.message || "internal_error";
    const status = message === "unauthorized" ? 401 : 500;
    return withCors(NextResponse.json({ ok: false, error: message }, { status }));
  }
}
