import { NextResponse } from "next/server";
import { verifyFirebaseToken } from "@/lib/firebase-admin";
import { deleteFileFromR2, downloadMediaUploadFromR2, getR2ConfigStatus } from "@/lib/r2-storage";
import { isMediaUploadKeyForUser, MAX_UPLOAD_BYTES, MEDIA_FOLDERS } from "@/lib/tienda-media";
import { processAndStoreTiendaMedia } from "@/lib/tienda-media-processor";

export const runtime = "nodejs";

function fail(error) {
  const status = error?.status || 500;
  const message = status === 401 ? "Iniciá sesión para administrar las imágenes." : error?.message || "No se pudo completar la imagen.";
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request) {
  let temporaryKey = "";
  try {
    const actor = await verifyFirebaseToken(request.headers.get("authorization"));
    const storage = getR2ConfigStatus();
    if (!storage.ok) {
      return NextResponse.json({ error: `Falta configurar R2 en el servidor: ${storage.missing.join(", ")}.` }, { status: 503 });
    }

    const body = await request.json().catch(() => null);
    const folder = String(body?.folder || "");
    const requestedKey = String(body?.key || "");
    if (!MEDIA_FOLDERS.includes(folder)) return NextResponse.json({ error: "Carpeta de imágenes no válida." }, { status: 400 });
    if (!isMediaUploadKeyForUser(requestedKey, actor?.uid, folder)) {
      return NextResponse.json({ error: "La subida temporal no pertenece a tu sesión." }, { status: 403 });
    }
    temporaryKey = requestedKey;

    const source = await downloadMediaUploadFromR2({ key: temporaryKey, maxBytes: MAX_UPLOAD_BYTES });
    const result = await processAndStoreTiendaMedia({
      actor,
      folder,
      original: source.body,
      originalName: body?.originalName,
    });
    return NextResponse.json(result);
  } catch (error) {
    return fail(error);
  } finally {
    if (temporaryKey) {
      await deleteFileFromR2(temporaryKey).catch((error) => {
        console.warn("No se pudo eliminar una carga temporal de R2:", error?.message);
      });
    }
  }
}
