// Política de stock de la tienda online: vender sin stock, ocultar sin stock y aviso de stock bajo.
// JavaScript puro (sin Firebase) para usarlo en el servidor, en el panel y en las pruebas.
import { isComboProduct } from "@/lib/combos";
import { normalizeStock, STOCK_DEFAULTS } from "@/lib/tienda-config";

export { STOCK_DEFAULTS, POLITICAS_STOCK, LIMITES_STOCK, normalizeStock, stockIssues } from "@/lib/tienda-config";

const strip = (value) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
const isCombo = (p) => p?.esCombo === true || p?.tipoProducto === "combo" || isComboProduct(p);

/**
 * Política que le toca a un producto, campo por campo: producto > subcategoría > categoría > general.
 * Un campo vacío en una regla se hereda del nivel siguiente. Con el ajuste desactivado rige el comportamiento
 * de siempre: solo se vende lo que hay en stock. Los combos nunca se venden sin stock: su disponibilidad
 * depende de sus componentes.
 */
export function resolveStockPolicy(producto, rawCfg) {
  const cfg = normalizeStock(rawCfg);
  const combo = isCombo(producto);
  const off = {
    politica: "solo_stock", tope: 0, plazo: "", umbralBajo: STOCK_DEFAULTS.umbralBajo,
    mostrarCantidad: true, etiqueta: STOCK_DEFAULTS.etiqueta, source: "ninguno", combo,
  };
  if (!cfg.activo || !producto) return off;
  const cat = strip(producto.categoria);
  const sub = strip(producto.subcategoria ?? producto.subCategoria);
  const levels = [
    ["producto", cfg.productos.find((p) => p.id === String(producto.id ?? ""))],
    ["subcategoria", sub && cfg.grupos.find((g) => g.subcategoria && strip(g.categoria) === cat && strip(g.subcategoria) === sub)],
    ["categoria", cfg.grupos.find((g) => !g.subcategoria && strip(g.categoria) === cat)],
    ["general", { politica: cfg.politica, tope: cfg.tope, plazo: cfg.plazo, umbralBajo: cfg.umbralBajo }],
  ].filter(([, rule]) => rule);
  const pick = (field) => levels.find(([, rule]) => rule[field] !== "" && rule[field] !== undefined && rule[field] !== null);
  const politicaLevel = pick("politica");
  let politica = politicaLevel[1].politica;
  if (combo && politica === "bajo_pedido") politica = "solo_stock";
  const tope = politica === "bajo_pedido" ? Number(pick("tope")?.[1].tope) || STOCK_DEFAULTS.tope : 0;
  return {
    politica,
    tope,
    plazo: pick("plazo")?.[1].plazo || "",
    umbralBajo: Number(pick("umbralBajo")?.[1].umbralBajo ?? STOCK_DEFAULTS.umbralBajo),
    mostrarCantidad: cfg.mostrarCantidad,
    etiqueta: cfg.etiqueta,
    source: politicaLevel[0],
    combo,
  };
}

/** Política más el stock real: cuánto se puede comprar como máximo y si el producto se oculta. */
export function stockInfo(producto, rawCfg, stockReal) {
  const policy = resolveStockPolicy(producto, rawCfg);
  const stock = Math.max(0, Math.floor(Number(stockReal) || 0));
  return {
    ...policy,
    stock,
    hidden: policy.politica === "ocultar" && stock <= 0,
    maxQuantity: stock + policy.tope,
    low: stock > 0 && stock <= policy.umbralBajo,
  };
}

/** Lo que recibe la tienda: sin reglas internas, solo lo que necesita para decidir y mostrar. */
export function publicStockPolicy(info) {
  return {
    backorder: info.tope > 0,
    cap: info.tope,
    leadTime: info.plazo,
    lowThreshold: info.umbralBajo,
    showQuantity: info.mostrarCantidad,
    label: info.etiqueta,
  };
}

/** Resumen corto de un cambio de configuración, para el historial. */
export function describeStockChange(before, after) {
  const a = normalizeStock(before);
  const b = normalizeStock(after);
  const parts = [];
  if (a.activo !== b.activo) parts.push(b.activo ? "Reglas activadas" : "Reglas desactivadas");
  if (a.politica !== b.politica) parts.push(`General: ${{ solo_stock: "solo con stock", bajo_pedido: "pedido sin stock", ocultar: "ocultar sin stock" }[b.politica]}`);
  if (a.tope !== b.tope) parts.push(`Tope ${a.tope} → ${b.tope}`);
  if (a.umbralBajo !== b.umbralBajo) parts.push(`Stock bajo ${a.umbralBajo} → ${b.umbralBajo}`);
  if (a.plazo !== b.plazo) parts.push("Plazo de entrega");
  if (a.mostrarCantidad !== b.mostrarCantidad || a.etiqueta !== b.etiqueta) parts.push("Textos");
  if (JSON.stringify(a.grupos) !== JSON.stringify(b.grupos)) parts.push(`Categorías: ${a.grupos.length} → ${b.grupos.length} reglas`);
  if (JSON.stringify(a.productos) !== JSON.stringify(b.productos)) parts.push(`Productos: ${a.productos.length} → ${b.productos.length} excepciones`);
  return parts;
}
