/**
 * Utilities for product pricing calculations across the app.
 * Centralizes logic for different wood subcategories (machimbre/deck) vs normal items.
 */

/**
 * Returns true when a product belongs to the machimbre/deck family.
 * Accepts either `subcategoria` or `subCategoria` as source field.
 * @param {object} product
 * @returns {boolean}
 */
export function isMachimbreOrDeck(product = {}) {
  const sub = String(product.subcategoria ?? product.subCategoria ?? "").toLowerCase();
  if (sub === "machimbre" || sub === "deck") return true;
  const name = String(product.nombre ?? product.descripcion ?? "").toLowerCase();
  if (name.includes("machimbre") || name.includes("deck")) return true;
  return false;
}

/**
 * Numeric safe cast helper.
 * @param {any} v
 * @returns {number}
 */
export function n(v) {
  const num = Number(v);
  return Number.isFinite(num) ? num : 0;
}

/**
 * Computes the line base amount before discount for a product.
 * - For machimbre/deck: base is the `precio` directly (already includes quantity)
 * - For the rest: base is `precio * cantidad`
 * @param {object} product
 * @returns {number}
 */
export function computeLineBase(product = {}) {
  const price = n(product.precio);
  if (isMachimbreOrDeck(product)) return price;
  const qty = Math.max(1, n(product.cantidad));
  return price * qty;
}

/**
 * Computes the line subtotal (after discount) rounded to nearest integer.
 * @param {object} product
 * @returns {number}
 */
export function computeLineSubtotal(product = {}) {
  const base = computeLineBase(product);
  const discountPct = Math.max(0, n(product.descuento));
  const subtotal = base * (1 - discountPct / 100);
  return Math.round(subtotal);
}

/**
 * Computes aggregated totals for a list of products.
 * @param {Array<object>} products
 * @returns {{subtotal:number, descuentoTotal:number, total:number}}
 */
export function computeTotals(products = []) {
  let subtotal = 0;
  let descuentoTotal = 0;
  for (const p of products) {
    const base = computeLineBase(p);
    subtotal += base;
    descuentoTotal += base * (Math.max(0, n(p.descuento)) / 100);
  }
  const total = subtotal - descuentoTotal;
  return {
    subtotal: Math.round(subtotal),
    descuentoTotal: Math.round(descuentoTotal),
    total: Math.round(total),
  };
}


