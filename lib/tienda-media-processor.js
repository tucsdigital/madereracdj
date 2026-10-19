import { getAdminDb } from "@/lib/firebase-admin";
import { deleteFileFromR2, uploadFileToR2 } from "@/lib/r2-storage";
import { MAX_SIDE_PX, MEDIA_FOLDERS, MIN_SIDE_PX, mediaKey, sniffImage } from "@/lib/tienda-media";

const httpError = (message, status) => Object.assign(new Error(message), { status });

/** Valida el contenido, aplica las reglas editoriales y registra la imagen definitiva en R2. */
export async function processAndStoreTiendaMedia({ actor, folder, original, originalName = "" }) {
  if (!MEDIA_FOLDERS.includes(folder)) throw httpError("Carpeta de imágenes no válida.", 400);
  const sniffed = sniffImage(original);
  if (!sniffed) throw httpError("Formato no permitido. Usá JPG, PNG, WebP o AVIF.", 415);

  let body = original;
  let mime = sniffed.mime;
  let ext = sniffed.ext;
  let width = null;
  let height = null;
  let sourceWidth = null;
  let sourceHeight = null;
  let optimized = false;
  let sharp = null;

  try {
    ({ default: sharp } = await import("sharp"));
  } catch (error) {
    if (folder === "productos") {
      throw httpError("El procesamiento de imágenes cuadradas no está disponible en este servidor.", 503);
    }
    console.error("tienda/media: sharp no disponible, se sube sin optimizar", error?.message);
  }

  if (sharp) {
    let output;
    try {
      const image = sharp(original, { limitInputPixels: 50_000_000 });
      const meta = await image.metadata();
      if (!meta.width || !meta.height) throw new Error("sin dimensiones");
      if (folder === "productos" && Math.min(meta.width, meta.height) < 1200) {
        throw httpError("Para productos, la imagen debe tener al menos 1200 px en cada lado antes del recorte.", 400);
      }
      if (Math.min(meta.width, meta.height) < MIN_SIDE_PX) {
        throw httpError(`La imagen es muy chica (mínimo ${MIN_SIDE_PX} px de lado).`, 400);
      }
      sourceWidth = meta.width;
      sourceHeight = meta.height;
      const oriented = image.rotate();
      const resized = folder === "productos"
        ? oriented.resize({ width: 1200, height: 1200, fit: "cover", position: "centre", withoutEnlargement: true })
        : oriented.resize({ width: MAX_SIDE_PX, height: MAX_SIDE_PX, fit: "inside", withoutEnlargement: true });
      output = await resized.webp({ quality: 82 }).toBuffer({ resolveWithObject: true });
    } catch (error) {
      if (error?.status) throw error;
      throw httpError("No se pudo leer la imagen: está dañada o es demasiado grande.", 400);
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
    sourceWidth,
    sourceHeight,
    optimized,
    originalName: String(originalName || "").slice(0, 120),
    byEmail: String(actor?.email || ""),
    byUid: String(actor?.uid || ""),
    at: new Date().toISOString(),
  };

  try {
    const ref = await getAdminDb().collection("tiendaMedia").add(item);
    return { item: { id: ref.id, ...item } };
  } catch (error) {
    await deleteFileFromR2(uploaded.key).catch(() => {});
    throw error;
  }
}
