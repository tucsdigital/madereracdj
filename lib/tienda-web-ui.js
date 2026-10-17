// Lógica de presentación del panel "Tienda web" (sin React), para poder probarla.
import { todayAR } from "@/lib/tienda-config";

export const DESTINOS = [
  { value: "/shop", label: "Toda la tienda" },
  { value: "/shop?filter=specialOffer", label: "Ofertas" },
  { value: "/shop?filter=newArrival", label: "Nuevos ingresos" },
  { value: "/shop?category=Combos", label: "Combos" },
  { value: "/obras", label: "Obras a medida" },
];
export const DESTINO_OTRO = "otro";
export const MADERAS = ["Pino", "Eucalipto", "Saligna", "Quebracho", "Grandis"];
export const DESTINOS_MADERAS = MADERAS.map((m) => ({ value: `/shop?madera=${m.toLowerCase()}`, label: `Madera ${m}` }));

const safeDecode = (value) => {
  try {
    return decodeURIComponent(String(value || "")).trim();
  } catch {
    return String(value || "").trim();
  }
};
const decode = (value) => safeDecode(value).toLowerCase();
/** Dos enlaces apuntan al mismo lugar aunque difieran en mayúsculas o codificación (ferretería / Ferreter%C3%ADa). */
export const sameDestino = (a, b) => decode(a) === decode(b);

/** Nombre legible del destino de un enlace ("Ofertas", "Tienda", o el propio enlace si es personalizado). */
export function destinoLabel(enlace) {
  const found = [...DESTINOS, ...DESTINOS_MADERAS].find((d) => sameDestino(d.value, enlace));
  if (found) return found.label;
  const category = /^\/shop\?category=(.+)$/.exec(enlace || "");
  if (category) return `Categoría ${safeDecode(category[1]).replace(/^./, (c) => c.toUpperCase())}`;
  return enlace || "Sin destino";
}

/** Valor del selector de destino: uno de la lista o "otro" si es personalizado. */
export const destinoSelect = (enlace) => ([...DESTINOS, ...DESTINOS_MADERAS].some((d) => sameDestino(d.value, enlace)) ? enlace : DESTINO_OTRO);

/** Estado de un banner para mostrar en la lista. */
export function bannerEstado(banner, now = Date.now()) {
  const day = todayAR(now);
  if (!banner.activo) return { key: "oculto", label: "Oculto" };
  if (banner.desde && banner.desde > day) return { key: "programado", label: `Desde el ${formatDay(banner.desde)}` };
  if (banner.hasta && banner.hasta < day) return { key: "vencido", label: "Vencido" };
  if (banner.hasta) return { key: "visible", label: `Hasta el ${formatDay(banner.hasta)}` };
  return { key: "visible", label: "Visible" };
}

export function formatDay(iso) {
  const [y, m, d] = String(iso || "").split("-");
  return y && m && d ? `${d}/${m}/${y.slice(2)}` : "";
}

/** Frase corta que explica qué productos muestra una sección. */
export function reglaResumen(seccion) {
  const r = seccion.regla || {};
  const base = {
    oferta: "Productos en oferta",
    nuevos: "Nuevos ingresos",
    combos: "Combos",
    categoria: r.valor ? `Categoría ${r.valor}` : "Una categoría sin elegir",
    descuento: r.minDescuento ? `Descuentos desde ${r.minDescuento}%` : "Descuento sin definir",
    manual: `${(r.productos || []).length} producto${(r.productos || []).length === 1 ? "" : "s"} elegido${(r.productos || []).length === 1 ? "" : "s"}`,
  }[r.tipo] || "Sin regla";
  return `${base} · hasta ${seccion.limite}`;
}

export const newId = (base) => `${String(base || "item").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${Date.now().toString(36)}`;

/** Reasigna el orden según la posición actual de la lista. */
export const renumber = (items) => items.map((item, index) => ({ ...item, orden: index + 1 }));

/** Mueve un elemento de una posición a otra (arrastrar y soltar). */
export function moveItem(items, from, to) {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return items;
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** Problemas de un elemento concreto (por posición) agrupados por campo. */
export function issuesByField(issues, scope, index) {
  const result = {};
  for (const issue of issues) {
    if (issue.scope === scope && issue.index === index && issue.field && !result[issue.field]) result[issue.field] = issue.message;
  }
  return result;
}

export const countIssues = (issues, scope) => issues.filter((issue) => issue.scope === scope).length;

/** Convierte una URL de imagen a una dirección que el navegador pueda mostrar; null si no se puede. */
export function previewUrl(value, tiendaUrl = "") {
  if (!value) return null;
  if (/^https:\/\//.test(value)) return value;
  if (value.startsWith("/") && tiendaUrl) return `${tiendaUrl.replace(/\/+$/, "")}${value}`;
  return null;
}
