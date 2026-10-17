// Precios de la tienda online: ajuste porcentual (o precio fijo) sobre el precio original del sistema.
// JavaScript puro (sin Firebase) para usarlo en el servidor, en el panel y en las pruebas.
import { calcularPreciosProducto, getPrecioVentaProducto, normalizarProductoEntrada, PricingUtils } from "@/lib/pricing";
import { getProductMeasure } from "@/lib/product-measure";

export { PRECIOS_DEFAULTS, PCT_MIN, PCT_MAX, REDONDEOS, LIMITES_PRECIOS, MODOS, normalizePrecios, preciosIssues } from "@/lib/tienda-config";
import { normalizePrecios } from "@/lib/tienda-config";

const strip = (value) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

/** Qué ajuste le toca a un producto y por qué: producto > subcategoría > categoría > general. */
export function resolveAdjustment(producto, rawPrecios) {
  const precios = normalizePrecios(rawPrecios);
  const none = { mode: "none", pct: 0, fixed: 0, source: "ninguno" };
  if (!precios.activo || !producto) return none;
  const own = precios.productos.find((p) => p.id === String(producto.id ?? ""));
  if (own) {
    if (own.modo === "ninguno") return { ...none, source: "producto" };
    if (own.modo === "fijo") return own.valor > 0 ? { mode: "fijo", pct: 0, fixed: own.valor, source: "producto" } : { ...none, source: "producto" };
    return { mode: own.valor === 0 ? "none" : "pct", pct: own.valor, fixed: 0, source: "producto" };
  }
  const cat = strip(producto.categoria);
  const sub = strip(producto.subcategoria ?? producto.subCategoria);
  const bySub = sub && precios.grupos.find((g) => g.subcategoria && strip(g.categoria) === cat && strip(g.subcategoria) === sub);
  if (bySub) return { mode: bySub.pct === 0 ? "none" : "pct", pct: bySub.pct, fixed: 0, source: "subcategoria" };
  const byCat = precios.grupos.find((g) => !g.subcategoria && strip(g.categoria) === cat);
  if (byCat) return { mode: byCat.pct === 0 ? "none" : "pct", pct: byCat.pct, fixed: 0, source: "categoria" };
  if (precios.globalPct !== 0) return { mode: "pct", pct: precios.globalPct, fixed: 0, source: "global" };
  return none;
}

const SALE_FIELDS = ["precioPorPie", "precioCalculado", "valorVenta", "precioVenta", "precioUnidad", "precioUnidadVenta", "precioUnidadHerraje", "precioUnidadQuimico", "precioUnidadHerramienta"];
const roundTo = (value, step) => (step > 0 ? Math.round(value / step) * step : Math.round(value * 100) / 100);

function hasRate(producto) {
  const normalized = normalizarProductoEntrada(producto);
  return getProductMeasure(normalized).kind === "wood" && PricingUtils.toMoneyNumber(normalized.precioPorPie) > 0;
}

/** Devuelve una copia del producto con los precios de la tienda. El producto original no se modifica. */
export function applyStorePricing(producto, rawPrecios) {
  const adj = resolveAdjustment(producto, rawPrecios);
  if (adj.mode === "none") return producto;
  const { redondeo } = normalizePrecios(rawPrecios);
  const rated = hasRate(producto);
  const next = { ...producto };

  if (adj.mode === "fijo" && !rated) {
    for (const key of SALE_FIELDS) if (key !== "precioPorPie" && next[key] != null && next[key] !== "") next[key] = adj.fixed;
    next.valorVenta = adj.fixed;
    next.precioVenta = adj.fixed;
    return next;
  }

  let factor = 1 + adj.pct / 100;
  if (adj.mode === "fijo") {
    const base = calcularPreciosProducto(normalizarProductoEntrada(producto), { cantidad: 1, redondear: false }).precioUnitarioBase;
    if (!(base > 0)) return producto;
    factor = adj.fixed / base;
  }
  for (const key of SALE_FIELDS) {
    const value = PricingUtils.toMoneyNumber(next[key]);
    if (!(value > 0)) continue;
    const scaled = value * factor;
    next[key] = key === "precioPorPie" || adj.mode === "fijo" ? Math.round(scaled * 100) / 100 : roundTo(scaled, redondeo);
  }
  return next;
}

/** Precio original y de tienda de una unidad (en maderas, de una pieza), para mostrarlos en el panel. */
export function storePriceInfo(producto, rawPrecios) {
  const adj = resolveAdjustment(producto, rawPrecios);
  const price = (p) => calcularPreciosProducto(normalizarProductoEntrada(p), { cantidad: 1 }).precioUnitarioBase || 0;
  const original = price(producto);
  const store = adj.mode === "none" ? original : price(applyStorePricing(producto, rawPrecios));
  const diff = store - original;
  return { original, store, diff, pct: original > 0 ? (diff / original) * 100 : 0, adj };
}

/** Productos con precios de venta guardados distintos entre sí (informe de control; no corrige nada). */
export function findSalePriceConflicts(productos) {
  return (Array.isArray(productos) ? productos : []).map((p) => {
    const isCombo = p?.esCombo === true || p?.tipoProducto === "combo";
    const isWood = !isCombo && strip(p?.categoria) === "maderas";
    if (isWood) return null;
    const values = [["valorVenta", p?.valorVenta], ["precioVenta", p?.precioVenta], ["precioCalculado", p?.precioCalculado]]
      .map(([field, raw]) => ({ field, value: PricingUtils.toMoneyNumber(raw) })).filter((v) => v.value > 0);
    if (new Set(values.map((v) => Math.round(v.value * 100))).size < 2) return null;
    return { id: p.id, codigo: p.codigo || "", nombre: p.nombre || "", values, current: getPrecioVentaProducto(p) };
  }).filter(Boolean);
}

/** Resumen corto de un cambio de configuración, para el historial. */
export function describePreciosChange(before, after) {
  const a = normalizePrecios(before);
  const b = normalizePrecios(after);
  const parts = [];
  if (a.activo !== b.activo) parts.push(b.activo ? "Ajuste activado" : "Ajuste desactivado");
  if (a.globalPct !== b.globalPct) parts.push(`General ${a.globalPct}% → ${b.globalPct}%`);
  if (a.redondeo !== b.redondeo) parts.push(`Redondeo ${b.redondeo ? `a $${b.redondeo}` : "sin redondeo"}`);
  if (JSON.stringify(a.grupos) !== JSON.stringify(b.grupos)) parts.push(`Categorías: ${a.grupos.length} → ${b.grupos.length} reglas`);
  if (JSON.stringify(a.productos) !== JSON.stringify(b.productos)) parts.push(`Productos: ${a.productos.length} → ${b.productos.length} excepciones`);
  return parts;
}
