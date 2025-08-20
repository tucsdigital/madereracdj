// Motor de precios reutilizable por UI y API

const roundToHundreds = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.round(num / 100) * 100;
};

const toNumber = (value) => {
  if (value === null || value === undefined) return 0;
  const str = String(value).toString().replace(/,/g, ".");
  const num = parseFloat(str);
  return Number.isFinite(num) ? num : 0;
};

export function calcularPrecioCorteMadera({
  alto,
  ancho,
  largo,
  precioPorPie,
  factor = 0.2734,
  redondear = true,
}) {
  const a = toNumber(alto);
  const an = toNumber(ancho);
  const l = toNumber(largo);
  const p = toNumber(precioPorPie);
  if ([a, an, l, p].some((v) => v <= 0)) return 0;
  const precio = factor * a * an * l * p;
  return redondear ? roundToHundreds(precio) : precio;
}

export function calcularPrecioMachimbre({ alto, largo, cantidad, precioPorPie, redondear = true }) {
  const a = toNumber(alto);
  const l = toNumber(largo);
  const c = Math.max(1, toNumber(cantidad));
  const p = toNumber(precioPorPie);
  if ([a, l, c, p].some((v) => v <= 0)) return 0;
  const metrosCuadrados = a * l;
  const precio = metrosCuadrados * p * c;
  return redondear ? roundToHundreds(precio) : precio;
}

export function calcularPreciosProducto(producto, {
  cantidad = 1,
  cepillado = false,
  redondear = true,
} = {}) {
  const categoria = String(producto?.categoria || "");
  const unidad = String(producto?.unidadMedida || "");
  const cantidadNum = Math.max(1, toNumber(cantidad));

  let baseUnitPrice = 0;
  let baseTotalPrice = 0;

  if (categoria === "Maderas") {
    if (unidad === "M2") {
      baseUnitPrice = calcularPrecioMachimbre({
        alto: producto?.alto,
        largo: producto?.largo,
        cantidad: 1,
        precioPorPie: producto?.precioPorPie,
        redondear,
      });
      baseTotalPrice = calcularPrecioMachimbre({
        alto: producto?.alto,
        largo: producto?.largo,
        cantidad: cantidadNum,
        precioPorPie: producto?.precioPorPie,
        redondear,
      });
    } else if (unidad === "Unidad") {
      const pUnit = toNumber(producto?.precioPorPie);
      baseUnitPrice = redondear ? roundToHundreds(pUnit) : pUnit;
      const totalRaw = baseUnitPrice * cantidadNum;
      baseTotalPrice = redondear ? roundToHundreds(totalRaw) : totalRaw;
    } else {
      baseUnitPrice = calcularPrecioCorteMadera({
        alto: producto?.alto,
        ancho: producto?.ancho,
        largo: producto?.largo,
        precioPorPie: producto?.precioPorPie,
        redondear,
      });
      const base = calcularPrecioCorteMadera({
        alto: producto?.alto,
        ancho: producto?.ancho,
        largo: producto?.largo,
        precioPorPie: producto?.precioPorPie,
        redondear,
      });
      const totalRaw = base * cantidadNum;
      baseTotalPrice = redondear ? roundToHundreds(totalRaw) : totalRaw;
    }
  } else {
    const unit = toNumber(producto?.valorVenta);
    baseUnitPrice = unit;
    baseTotalPrice = unit * cantidadNum;
  }

  const aplicaCepillado = categoria === "Maderas" && unidad !== "Unidad";
  const planedUnitRaw = aplicaCepillado ? baseUnitPrice * 1.066 : baseUnitPrice;
  const planedTotalRaw = aplicaCepillado ? baseTotalPrice * 1.066 : baseTotalPrice;
  const precioUnitarioCepillado = redondear ? roundToHundreds(planedUnitRaw) : planedUnitRaw;
  const precioTotalCepillado = redondear ? roundToHundreds(planedTotalRaw) : planedTotalRaw;

  const precioUnitarioFinal = cepillado && aplicaCepillado ? precioUnitarioCepillado : baseUnitPrice;
  const precioTotalFinal = cepillado && aplicaCepillado ? precioTotalCepillado : baseTotalPrice;

  return {
    categoria,
    unidad,
    cantidad: cantidadNum,
    cepilladoAplicado: Boolean(cepillado && aplicaCepillado),
    precioUnitarioBase: baseUnitPrice,
    precioUnitarioCepillado,
    precioUnitarioFinal,
    precioTotalBase: baseTotalPrice,
    precioTotalCepillado,
    precioTotalFinal,
  };
}

export function normalizarProductoEntrada(p) {
  // Permite pasar productos con campos como string o number y normaliza mínimamente
  if (!p || typeof p !== "object") return {};
  return {
    ...p,
    alto: toNumber(p.alto),
    ancho: toNumber(p.ancho),
    largo: toNumber(p.largo),
    precioPorPie: toNumber(p.precioPorPie),
    valorVenta: toNumber(p.valorVenta),
    categoria: p.categoria ? String(p.categoria) : undefined,
    unidadMedida: p.unidadMedida ? String(p.unidadMedida) : undefined,
  };
}

export const PricingUtils = {
  roundToHundreds,
  toNumber,
};

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


