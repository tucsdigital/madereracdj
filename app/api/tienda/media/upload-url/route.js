import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { verifyFirebaseToken } from "@/lib/firebase-admin";
import { createPresignedUploadUrl, getR2ConfigStatus } from "@/lib/r2-storage";
import { MAX_UPLOAD_BYTES, MEDIA_FOLDERS, MEDIA_MIME_EXTENSIONS, mediaUploadKey } from "@/lib/tienda-media";

export const runtime = "nodejs";

const EXPIRES_IN_SECONDS = 15 * 60;

function fail(error) {
  const status = error?.status || 500;
  const message = status === 401 ? "Iniciá sesión para administrar las imágenes." : error?.message || "No se pudo preparar la subida a R2.";
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request) {
  try {
    const actor = await verifyFirebaseToken(request.headers.get("authorization"));
    const storage = getR2ConfigStatus();
    if (!storage.ok) {
      return NextResponse.json({ error: `Falta configurar R2 en el servidor: ${storage.missing.join(", ")}.` }, { status: 503 });
    }

    const body = await request.json().catch(() => null);
    const folder = String(body?.folder || "");
    const size = Number(body?.size);
    const contentType = String(body?.contentType || "").trim().toLowerCase();
    if (!MEDIA_FOLDERS.includes(folder)) return NextResponse.json({ error: "Carpeta de imágenes no válida." }, { status: 400 });
    if (!Number.isSafeInteger(size) || size < 1) return NextResponse.json({ error: "El archivo está vacío o no se pudo leer." }, { status: 400 });
    if (size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: `La imagen pesa más de ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB.` }, { status: 413 });
    }
    const ext = MEDIA_MIME_EXTENSIONS[contentType];
    if (!ext) return NextResponse.json({ error: "Formato no permitido. Usá JPG, PNG, WebP o AVIF." }, { status: 415 });

    const key = mediaUploadKey({
      uid: actor?.uid,
      folder,
      ext,
      random: randomBytes(16).toString("hex"),
    });
    const uploadUrl = await createPresignedUploadUrl({ key, contentType, expiresIn: EXPIRES_IN_SECONDS });
    return NextResponse.json({ uploadUrl, key, expiresIn: EXPIRES_IN_SECONDS, maxBytes: MAX_UPLOAD_BYTES });
  } catch (error) {
    return fail(error);
  }
}
