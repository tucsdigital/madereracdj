// Utilidades puras para las imágenes de la tienda web (sin Firebase ni R2), fáciles de probar.

export const MEDIA_FOLDERS = ["banners", "categorias", "secciones"];
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
export const MIN_SIDE_PX = 200;
export const MAX_SIDE_PX = 2400;
export const KEY_PREFIX = "tienda/";

const startsWith = (buffer, bytes, offset = 0) => bytes.every((byte, i) => buffer[offset + i] === byte);

/** Detecta el formato por el contenido real (no por el nombre ni el tipo que declara el navegador). */
export function sniffImage(buffer) {
  if (!buffer || buffer.length < 12) return null;
  if (startsWith(buffer, [0xff, 0xd8, 0xff])) return { mime: "image/jpeg", ext: "jpg" };
  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { mime: "image/png", ext: "png" };
  if (startsWith(buffer, [0x52, 0x49, 0x46, 0x46]) && startsWith(buffer, [0x57, 0x45, 0x42, 0x50], 8)) return { mime: "image/webp", ext: "webp" };
  if (startsWith(buffer, [0x66, 0x74, 0x79, 0x70], 4)) {
    const brand = String.fromCharCode(...buffer.subarray(8, 12));
    if (brand === "avif" || brand === "avis") return { mime: "image/avif", ext: "avif" };
  }
  return null;
}

/** Clave única y predecible en el bucket: tienda/<carpeta>/<fecha>-<código>.<ext> */
export function mediaKey({ folder, ext, now = Date.now(), random = Math.random().toString(36).slice(2, 10) }) {
  if (!MEDIA_FOLDERS.includes(folder)) throw new Error("Carpeta de imágenes no válida.");
  if (!/^[a-z0-9]{2,5}$/.test(ext)) throw new Error("Extensión no válida.");
  const safeRandom = String(random).replace(/[^a-z0-9]/gi, "").slice(0, 12) || "x";
  return `${KEY_PREFIX}${folder}/${now}-${safeRandom}.${ext}`;
}

/** Hosts desde los que la tienda acepta imágenes: el público de R2 configurado. */
export function allowedImageHosts(publicBase) {
  try {
    return publicBase ? [new URL(publicBase).host.toLowerCase()] : [];
  } catch {
    return [];
  }
}

/** Convierte una URL pública de R2 en su clave de bucket; null si no pertenece al bucket de la tienda. */
export function keyFromUrl(url, publicBase) {
  try {
    const base = new URL(publicBase);
    const target = new URL(url);
    if (target.host.toLowerCase() !== base.host.toLowerCase()) return null;
    const basePath = base.pathname.replace(/\/+$/, "");
    if (!target.pathname.startsWith(`${basePath}/`)) return null;
    const key = decodeURIComponent(target.pathname.slice(basePath.length + 1));
    return key.startsWith(KEY_PREFIX) && !key.includes("..") ? key : null;
  } catch {
    return null;
  }
}

/** Todas las URLs de imagen que usa una configuración de tienda. */
export function imageUrlsOf(config) {
  const cfg = config || {};
  const urls = [];
  (cfg.banners || []).forEach((b) => urls.push(b?.imagen, b?.imagenMovil));
  (cfg.categorias || []).forEach((c) => urls.push(c?.imagen));
  return urls.filter(Boolean);
}

export const IMAGE_GUIDE = {
  banners: { ancho: 2400, alto: 1143, proporcion: "21:10", ratio: 21 / 10, texto: "Escritorio: 2400 × 1143 px (21:10)" },
  bannersMovil: { ancho: 1080, alto: 1350, proporcion: "4:5", ratio: 4 / 5, texto: "Móvil: 1080 × 1350 px (4:5)" },
  categorias: { ancho: 1080, alto: 1350, proporcion: "4:5", ratio: 4 / 5, texto: "Categoría: 1080 × 1350 px (4:5, vertical)" },
};

/** Cuánto puede alejarse la proporción de una imagen de la del espacio antes de avisar (20 %). */
export const RATIO_TOLERANCE = 0.2;

/** Devuelve un aviso si la proporción de la imagen se aleja de la esperada; si no, cadena vacía. */
export function ratioWarning(width, height, expected, label = "") {
  if (!(width > 0) || !(height > 0) || !(expected > 0)) return "";
  const diff = Math.abs(width / height - expected) / expected;
  if (diff <= RATIO_TOLERANCE) return "";
  return `Esta imagen tiene otra proporción${label ? ` (ideal ${label})` : ""}. Se va a recortar bastante: dejá lo importante en el centro.`;
}
