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
    destacados: "Productos destacados",
    combos: "Combos",
    categoria: r.valor ? `Categoría ${r.valor}` : "Una categoría sin elegir",
    descuento: r.minDescuento ? `Descuentos desde ${r.minDescuento}%` : "Descuento sin definir",
    manual: `${(r.productos || []).length} producto${(r.productos || []).length === 1 ? "" : "s"} elegido${(r.productos || []).length === 1 ? "" : "s"}`,
  }[r.tipo] || "Sin regla";
  return `${base} · hasta ${seccion.limite}`;
}

/** Normaliza el catálogo publicado de /api/precios para evaluar secciones como en la tienda. */
export function normalizeStoreSectionCatalog(data) {
  const items = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : null;
  if (!items) throw new Error("La respuesta del catálogo no tiene un formato válido.");

  return items.flatMap((item) => {
    const product = item?.producto || item || {};
    if ((product.estadoTienda ?? item?.estadoTienda) !== "Activo") return [];

    const pricing = item?.pricing || item || {};
    const discount = product.discount || pricing.discount || {};
    const discountPercentage = Number(discount.percentage ?? product.descuentoPorcentaje ?? pricing.descuentoPorcentaje) || 0;
    const discountAmount = Number(discount.amount ?? product.descuentoMonto ?? pricing.descuentoMonto) || 0;
    const basePrice = Number(pricing.precioUnitarioBase ?? product.precioLista ?? product.precioBase ?? product.valorVenta) || 0;
    const finalPrice = Number(pricing.precioUnitarioFinal ?? product.valorVenta) || basePrice;
    const id = String(product.id ?? item?.id ?? "");
    if (!id || id === "undefined") return [];

    const resolvedDiscount = {
      percentage: discountPercentage,
      amount: discountAmount || Math.max(0, basePrice - finalPrice),
    };
    const categoria = product.categoria || pricing.categoria || "";
    const tipoProducto = product.tipoProducto || (product.esCombo ? "combo" : "");

    return [{
      id,
      estadoTienda: "Activo",
      nombre: product.nombre || product.descripcion || id,
      codigo: product.codigo || "",
      categoria,
      category: categoria,
      subcategoria: product.subcategoria || product.subCategoria || "",
      tipoProducto,
      esCombo: product.esCombo === true || String(tipoProducto).toLowerCase() === "combo",
      specialOffer: product.specialOffer === true || item?.specialOffer === true,
      newArrival: product.newArrival === true || item?.newArrival === true,
      featuredBrand: product.featuredBrand === true || item?.featuredBrand === true,
      seccionesTiendaIncluidas: normalizeSectionIds(product.seccionesTiendaIncluidas ?? item?.seccionesTiendaIncluidas),
      seccionesTiendaExcluidas: normalizeSectionIds(product.seccionesTiendaExcluidas ?? item?.seccionesTiendaExcluidas),
      precio: basePrice || finalPrice,
      price: basePrice || finalPrice,
      descuento: resolvedDiscount,
      discount: resolvedDiscount,
      tipoMadera: product.tipoMadera || product.tipoMaterial || "",
      unidad: product.unidadMedida || product.unidad || "",
      uso: product.uso || product.aplicacion || "",
      imagenes: product.imagenes || product.images || product.imagen || product.srcUrl || "",
    }];
  });
}

const normalizeSectionIds = (value) => Array.isArray(value)
  ? [...new Set(value.map((id) => String(id ?? "").trim()).filter(Boolean))]
  : [];

const normalizedProductValue = (value) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("es");
const numericValue = (value) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const raw = String(value ?? "").trim().replace(/\s/g, "");
  if (!raw) return 0;
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
};

/** El mismo criterio que usa la tienda para decidir si un producto pertenece a una sección. */
export function productMatchesSectionRule(product, rule, { price } = {}) {
  if (!product || !rule) return false;
  const id = String(product.id ?? product.codigo ?? "");
  const category = product.categoria ?? product.category;
  const discount = product.descuento ?? product.discount ?? {};
  const amount = numericValue(discount.amount);
  const percentage = numericValue(discount.percentage);
  const basePrice = numericValue(price ?? product.precio ?? product.price ?? product.precioUnitarioBase);
  const discountPercentage = percentage > 0 ? percentage : amount > 0 && basePrice > 0 ? (amount / basePrice) * 100 : 0;

  switch (rule.tipo) {
    case "oferta": return product.specialOffer === true;
    case "nuevos": return product.newArrival === true;
    case "destacados": return product.featuredBrand === true;
    case "combos": return product.esCombo === true || String(product.tipoProducto ?? "").toLowerCase() === "combo";
    case "categoria": return normalizedProductValue(category) === normalizedProductValue(rule.valor);
    case "descuento": {
      const minimum = Math.max(0, numericValue(rule.minDescuento));
      return discountPercentage > 0 && discountPercentage >= minimum;
    }
    case "manual": return (rule.productos || []).map(String).includes(id);
    default: return false;
  }
}

/** Productos que integran una sección, preservando el orden de la selección manual. */
export function productsForSectionRule(rule, products = []) {
  const list = Array.isArray(products) ? products : [];
  if (rule?.tipo !== "manual") return list.filter((product) => productMatchesSectionRule(product, rule));
  const order = new Map((rule.productos || []).map((id, index) => [String(id), index]));
  return list
    .filter((product) => order.has(String(product.id ?? product.codigo ?? "")))
    .sort((a, b) => (order.get(String(a.id ?? a.codigo ?? "")) ?? 0) - (order.get(String(b.id ?? b.codigo ?? "")) ?? 0));
}

/** Estado de asignación de un producto: la excepción manual prevalece sobre la regla. */
export function isProductAssignedToSection(product, section) {
  if (!product || !section) return false;
  const id = String(section.id ?? "");
  if (id) {
    if (normalizeSectionIds(product.seccionesTiendaExcluidas).includes(id)) return false;
    if (normalizeSectionIds(product.seccionesTiendaIncluidas).includes(id)) return true;
  }
  return productMatchesSectionRule(product, section.regla);
}

/** Actualiza la excepción de una sección sin modificar su regla automática. */
export function updateProductSectionAssignment(product, section, selected) {
  const id = String(section?.id ?? "");
  let includes = normalizeSectionIds(product?.seccionesTiendaIncluidas);
  let excludes = normalizeSectionIds(product?.seccionesTiendaExcluidas);
  if (!id) return { seccionesTiendaIncluidas: includes, seccionesTiendaExcluidas: excludes };

  const matchesRule = productMatchesSectionRule(product, section.regla);
  if (selected) {
    excludes = excludes.filter((value) => value !== id);
    includes = matchesRule ? includes.filter((value) => value !== id) : [...includes.filter((value) => value !== id), id];
  } else {
    includes = includes.filter((value) => value !== id);
    excludes = matchesRule ? [...excludes.filter((value) => value !== id), id] : excludes.filter((value) => value !== id);
  }

  return { seccionesTiendaIncluidas: includes, seccionesTiendaExcluidas: excludes };
}

/** Productos de una sección: primero inclusiones manuales, luego los de la regla, menos exclusiones. */
export function productsForConfiguredSection(section, products = []) {
  const list = Array.isArray(products) ? products : [];
  if (!section) return [];
  const id = String(section.id ?? "");
  const included = new Set(id ? list.flatMap((product) => normalizeSectionIds(product.seccionesTiendaIncluidas).includes(id) ? [String(product.id ?? product.codigo ?? "")] : []) : []);
  const excluded = new Set(id ? list.flatMap((product) => normalizeSectionIds(product.seccionesTiendaExcluidas).includes(id) ? [String(product.id ?? product.codigo ?? "")] : []) : []);
  const explicit = list.filter((product) => {
    const productId = String(product.id ?? product.codigo ?? "");
    return included.has(productId) && !excluded.has(productId);
  });
  const automatic = productsForSectionRule(section.regla, list).filter((product) => {
    const productId = String(product.id ?? product.codigo ?? "");
    return !included.has(productId) && !excluded.has(productId);
  });
  return [...explicit, ...automatic];
}

/** Indica si el producto aparece realmente entre los elementos visibles de una sección activa. */
export function productBelongsToSection(product, section, products = [product]) {
  if (!product || !section || section.activa === false) return false;
  const limit = Math.max(1, Number(section.limite) || 8);
  const id = String(product.id ?? product.codigo ?? "");
  return productsForConfiguredSection(section, products)
    .slice(0, limit)
    .some((candidate) => String(candidate.id ?? candidate.codigo ?? "") === id);
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
  const raw = String(value ?? "").trim().replace(/^`+|`+$/g, "");
  if (!raw) return null;

  try {
    const store = tiendaUrl ? new URL(tiendaUrl) : null;
    if (/^https:\/\//i.test(raw)) return new URL(raw).toString();
    if (/^http:\/\//i.test(raw)) {
      const original = new URL(raw);
      const ownHost = (host) => host.toLowerCase().replace(/^www\./, "");
      if (store && ownHost(original.host) === ownHost(store.host)) {
        original.protocol = "https:";
        return original.toString();
      }
      return null;
    }
    if (!store || store.protocol !== "https:") return null;
    if (raw.startsWith("//")) return new URL(`https:${raw}`).toString();
    // `public/` es una carpeta de build, no forma parte de una URL servida por Next.
    const path = raw.replace(/^\.\//, "").replace(/^public\//i, "");
    return new URL(path.startsWith("/") ? path : `/${path}`, store.origin).toString();
  } catch {
    return null;
  }
}
