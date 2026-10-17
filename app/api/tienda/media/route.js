import { NextResponse } from "next/server";
import { getAdminDb, verifyFirebaseToken } from "@/lib/firebase-admin";
import { getR2ConfigStatus, uploadFileToR2 } from "@/lib/r2-storage";
import { MAX_SIDE_PX, MAX_UPLOAD_BYTES, MEDIA_FOLDERS, MIN_SIDE_PX, mediaKey, sniffImage } from "@/lib/tienda-media";

export const runtime = "nodejs";

const fail = (error) => {
  const status = error?.status || 500;
  const message = status === 401 ? "Iniciá sesión para administrar las imágenes." : error?.message || "No se pudo procesar la imagen.";
  return NextResponse.json({ error: message }, { status });
};

const storageState = () => {
  const status = getR2ConfigStatus();
  return { ok: status.ok, missing: status.missing, publicBase: status.configured.publicBase };
};

// Estado del almacenamiento y biblioteca de imágenes ya subidas.
export async function GET(request) {
  try {
    await verifyFirebaseToken(request.headers.get("authorization"));
    const snap = await getAdminDb().collection("tiendaMedia").orderBy("at", "desc").limit(120).get();
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return NextResponse.json({ storage: storageState(), items });
  } catch (error) {
    return fail(error);
  }
}

// Sube una imagen a R2: valida, la reduce y convierte a WebP, y registra la URL pública.
export async function POST(request) {
  try {
    const actor = await verifyFirebaseToken(request.headers.get("authorization"));
    const state = storageState();
    if (!state.ok) {
      return NextResponse.json({ error: `Falta configurar R2 en el servidor: ${state.missing.join(", ")}.`, missing: state.missing }, { status: 503 });
    }

    const form = await request.formData();
    const file = form.get("file");
    const folder = String(form.get("folder") || "");
    if (!MEDIA_FOLDERS.includes(folder)) return NextResponse.json({ error: "Carpeta de imágenes no válida." }, { status: 400 });
    if (!file || typeof file.arrayBuffer !== "function") return NextResponse.json({ error: "No se recibió ningún archivo." }, { status: 400 });
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: `La imagen pesa más de ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB.` }, { status: 413 });
    }

    const original = Buffer.from(await file.arrayBuffer());
    const sniffed = sniffImage(original);
    if (!sniffed) {
      return NextResponse.json({ error: "Formato no permitido. Usá JPG, PNG, WebP o AVIF." }, { status: 415 });
    }

    let body = original;
    let mime = sniffed.mime;
    let ext = sniffed.ext;
    let width = null;
    let height = null;
    let optimized = false;
    let sharp = null;
    try {
      ({ default: sharp } = await import("sharp"));
    } catch (error) {
      // Sólo si el procesador de imágenes no está disponible se conserva el archivo ya validado por su contenido.
      console.error("tienda/media: sharp no disponible, se sube sin optimizar", error?.message);
    }
    if (sharp) {
      let output;
      try {
        const image = sharp(original, { limitInputPixels: 50_000_000 });
        const meta = await image.metadata();
        if (!meta.width || !meta.height) throw new Error("sin dimensiones");
        if (Math.min(meta.width, meta.height) < MIN_SIDE_PX) {
          return NextResponse.json({ error: `La imagen es muy chica (mínimo ${MIN_SIDE_PX} px de lado).` }, { status: 400 });
        }
        output = await image
          .rotate()
          .resize({ width: MAX_SIDE_PX, height: MAX_SIDE_PX, fit: "inside", withoutEnlargement: true })
          .webp({ quality: 82 })
          .toBuffer({ resolveWithObject: true });
      } catch {
        // Cabecera válida pero contenido dañado o demasiado grande: no se guarda.
        return NextResponse.json({ error: "No se pudo leer la imagen: está dañada o es demasiado grande." }, { status: 400 });
      }
      body = output.data;
      mime = "image/webp";
      ext = "webp";
      width = output.info.width;
      height = output.info.height;
      optimized = true;
    }

    const key = mediaKey({ folder, ext });
    const uploaded = await uploadFileToR2({
      key,
      file: { arrayBuffer: async () => body },
      contentType: mime,
      cacheControl: "public, max-age=31536000, immutable",
    });

    const item = {
      key: uploaded.key,
      url: uploaded.url,
      folder,
      mime,
      size: body.length,
      width,
      height,
      optimized,
      originalName: String(file.name || "").slice(0, 120),
      byEmail: String(actor?.email || ""),
      byUid: String(actor?.uid || ""),
      at: new Date().toISOString(),
    };
    const ref = await getAdminDb().collection("tiendaMedia").add(item);
    return NextResponse.json({ item: { id: ref.id, ...item } });
  } catch (error) {
    return fail(error);
  }
}
