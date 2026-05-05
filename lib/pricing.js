// Motor de precios reutilizable por UI y API

const roundToHundreds = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.round(num / 100) * 100;
};

const toNumber = (value) => {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return 0;
    // Compat: precio guardado como 40.516 (en vez de 40516) por parseo viejo.
    const s = String(value);
    if (/^\d{1,3}\.\d{3}$/.test(s)) return value * 1000;
    // Compat adicional: precios tipo "13.800,00" a veces quedaron guardados como 13.8 (o 13.55 por 13.550,00).
    // Si es un número < 1000 con 1-2 decimales, lo interpretamos como miles y multiplicamos ×1000.
    if (/^\d{1,3}\.\d{1,2}$/.test(s) && value > 0 && value < 1000) {
      const scaled = value * 1000;
      // Evitar artefactos de coma flotante
      if (Number.isFinite(scaled) && Math.abs(scaled - Math.round(scaled)) < 1e-6) {
        return Math.round(scaled);
      }
      return scaled;
    }
    return value;
  }

  const raw = String(value).trim();
  if (!raw) return 0;

  // Quitar símbolos de moneda y espacios, dejar dígitos y separadores comunes
  let s = raw.replace(/\s+/g, "").replace(/[^\d,.-]/g, "");
  if (!s) return 0;

  const hasComma = s.includes(",");
  const hasDot = s.includes(".");

  if (hasComma && hasDot) {
    // El separador decimal suele ser el último que aparece
    const lastComma = s.lastIndexOf(",");
    const lastDot = s.lastIndexOf(".");
    if (lastComma > lastDot) {
      // "14.000,50" => miles="." decimal=","
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      // "14,000.50" => miles="," decimal="."
      s = s.replace(/,/g, "");
    }
  } else if (hasComma) {
    // "14000,50" => decimal=","
    s = s.replace(",", ".");
  }

  const num = Number(s);
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

/** Precio de venta unificado (precioVenta | valorVenta | precioCalculado) */
export function getPrecioVentaProducto(p) {
  if (!p || typeof p !== "object") return 0;
  const candidates = [
    p.precioVenta,
    p.valorVenta,
    p.precioCalculado,
    p.precioUnidad,
    p.precioUnidadVenta,
    p.precioUnidadHerraje,
    p.precioUnidadQuimico,
    p.precioUnidadHerramienta,
  ];
  const vals = candidates.map(toNumber).filter((x) => Number.isFinite(x));
  const best = vals.length ? Math.max(...vals) : 0;
  return Number.isFinite(best) ? best : 0;
}

export function calcularPreciosProducto(producto, {
  cantidad = 1,
  redondear = true,
  modoRedondeo = "total", // "unitario" | "total" | "ninguno"
} = {}) {
  const categoria = String(producto?.categoria || "");
  const unidad = String(producto?.unidadMedida || "");
  const cantidadNum = Math.max(1, toNumber(cantidad));
  const precioDirecto = getPrecioVentaProducto(producto);

  let baseUnitPrice = 0;
  let baseTotalPrice = 0;
  const shouldRound = Boolean(redondear);
  const doRound = (v) => (shouldRound ? roundToHundreds(v) : v);

  // Nueva estructura: si tiene precioVenta, usarlo como precio unitario directo
  if (precioDirecto > 0) {
    baseUnitPrice = doRound(precioDirecto);
    baseTotalPrice = doRound(precioDirecto * cantidadNum);
    return {
      categoria,
      unidad,
      cantidad: cantidadNum,
      precioUnitarioBase: baseUnitPrice,
      precioUnitarioFinal: baseUnitPrice,
      precioTotalBase: baseTotalPrice,
      precioTotalFinal: baseTotalPrice,
    };
  }

  if (categoria === "Maderas") {
    const alto = producto?.espesor ?? producto?.alto;
    if (unidad === "M2") {
      const unitRaw = calcularPrecioMachimbre({
        alto,
        largo: producto?.largo,
        cantidad: 1,
        precioPorPie: producto?.precioPorPie,
        redondear: false,
      });
      const totalRaw = calcularPrecioMachimbre({
        alto,
        largo: producto?.largo,
        cantidad: cantidadNum,
        precioPorPie: producto?.precioPorPie,
        redondear: false,
      });
      const unitRounded = doRound(unitRaw);
      if (modoRedondeo === "unitario") {
        baseUnitPrice = unitRounded;
        baseTotalPrice = doRound(unitRounded * cantidadNum);
      } else if (modoRedondeo === "ninguno") {
        baseUnitPrice = unitRaw;
        baseTotalPrice = totalRaw;
      } else {
        // total (por defecto)
        baseUnitPrice = unitRounded;
        baseTotalPrice = doRound(totalRaw);
      }
    } else if (unidad === "Unidad") {
      const pUnitRaw = toNumber(producto?.precioPorPie);
      const unitRounded = doRound(pUnitRaw);
      if (modoRedondeo === "unitario") {
        baseUnitPrice = unitRounded;
        baseTotalPrice = doRound(unitRounded * cantidadNum);
      } else if (modoRedondeo === "ninguno") {
        baseUnitPrice = pUnitRaw;
        baseTotalPrice = pUnitRaw * cantidadNum;
      } else {
        // total (pero para Unidad, mantener política actual equivalente a unitario por consistencia histórica)
        baseUnitPrice = unitRounded;
        baseTotalPrice = doRound(unitRounded * cantidadNum);
      }
    } else {
      const unitRaw = calcularPrecioCorteMadera({
        alto,
        ancho: producto?.ancho,
        largo: producto?.largo,
        precioPorPie: producto?.precioPorPie,
        redondear: false,
      });
      const totalRaw = unitRaw * cantidadNum;
      const unitRounded = doRound(unitRaw);
      if (modoRedondeo === "unitario") {
        baseUnitPrice = unitRounded;
        baseTotalPrice = doRound(unitRounded * cantidadNum);
      } else if (modoRedondeo === "ninguno") {
        baseUnitPrice = unitRaw;
        baseTotalPrice = totalRaw;
      } else {
        // total
        baseUnitPrice = unitRounded;
        baseTotalPrice = doRound(totalRaw);
      }
    }
  } else {
    const unitRaw = toNumber(producto?.valorVenta ?? producto?.precioVenta);
    const unitRounded = doRound(unitRaw);
    if (modoRedondeo === "unitario") {
      baseUnitPrice = unitRounded;
      baseTotalPrice = doRound(unitRounded * cantidadNum);
    } else if (modoRedondeo === "ninguno") {
      baseUnitPrice = unitRaw;
      baseTotalPrice = unitRaw * cantidadNum;
    } else {
      // total
      baseUnitPrice = unitRounded;
      baseTotalPrice = doRound(unitRaw * cantidadNum);
    }
  }

  const precioUnitarioFinal = baseUnitPrice;
  const precioTotalFinal = baseTotalPrice;

  return {
    categoria,
    unidad,
    cantidad: cantidadNum,
    precioUnitarioBase: baseUnitPrice,
    precioUnitarioFinal,
    precioTotalBase: baseTotalPrice,
    precioTotalFinal,
  };
}

export function normalizarProductoEntrada(p) {
  if (!p || typeof p !== "object") return {};
  const alto = p.espesor ?? p.alto;
  const unidadNormalizada = p.unidadMedida ?? p.unidad ?? p.unit;
  const unidadTexto = unidadNormalizada ? String(unidadNormalizada) : undefined;
  return {
    ...p,
    alto: toNumber(alto),
    espesor: toNumber(alto),
    ancho: toNumber(p.ancho),
    largo: toNumber(p.largo),
    precioPorPie: toNumber(p.precioPorPie),
    valorVenta: toNumber(p.valorVenta),
    precioVenta: toNumber(p.precioVenta ?? p.valorVenta ?? p.precioCalculado),
    categoria: p.categoria ? String(p.categoria) : undefined,
    unidadMedida: unidadTexto,
    unidad: unidadTexto,
  };
}

export const PricingUtils = {
  roundToHundreds,
  toNumber,
};

const normalizeCantidad = (p) => {
  const n = toNumber(p?.cantidad ?? p?.qty ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const normalizeUnidad = (p) =>
  String(p?.unidadMedida ?? p?.unidad ?? p?.unit ?? "").trim().toUpperCase();

const normalizeCategoria = (p) => String(p?.categoria ?? "").trim();

const baseMedidaPorUnidad = (producto) => {
  const categoria = normalizeCategoria(producto);
  const unidad = normalizeUnidad(producto);
  if (categoria !== "Maderas") return { base: 1, unit: "un" };

  const altoM2 = toNumber((toNumber(producto?.alto) || 0) > 0 ? producto?.alto : producto?.ancho);
  const alto = toNumber(producto?.alto ?? producto?.espesor);
  const ancho = toNumber(producto?.ancho);
  const largo = toNumber(producto?.largo);

  if (unidad === "M2") {
    const base = altoM2 > 0 && largo > 0 ? altoM2 * largo : 1;
    return { base, unit: "m²" };
  }
  if (unidad === "ML") {
    const base = largo > 0 ? largo : 1;
    return { base, unit: "ml" };
  }
  if (unidad === "M3") {
    const base = alto > 0 && ancho > 0 && largo > 0 ? alto * ancho * largo : 1;
    return { base, unit: "m³" };
  }

  return { base: 1, unit: "un" };
};

export function computeQuantityDisplay(producto) {
  const cantidad = normalizeCantidad(producto);
  const { base, unit } = baseMedidaPorUnidad(producto);
  const value = (Number.isFinite(base) ? base : 1) * (Number.isFinite(cantidad) ? cantidad : 0);
  return { value: Number.isFinite(value) ? value : 0, unit };
}

export function computeQuantityFromMeasure(producto, medidaTotal) {
  const { base } = baseMedidaPorUnidad(producto);
  const m = toNumber(medidaTotal);
  const b = Number.isFinite(base) && base > 0 ? base : 1;
  const qty = m > 0 ? Math.ceil(m / b) : 0;
  return Number.isFinite(qty) ? qty : 0;
}

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
  const categoria = String(product.categoria ?? "").toLowerCase();
  const unidad = String(product.unidad ?? product.unidadMedida ?? "").trim().toUpperCase();

  // Regla estricta: solo cuando viene explícito en subcategoría y aplica a Maderas/M2.
  // Evita falsos positivos como "Deck WPC ..." (donde "deck" es parte del nombre/categoría comercial).
  if (categoria !== "maderas") return false;
  if (unidad !== "M2") return false;
  return sub === "machimbre" || sub === "deck";
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
 * - For "Eventual" category: base is `precio * cantidad` (direct calculation)
 * - For the rest: base is `precio * cantidad`
 * @param {object} product
 * @returns {number}
 */
export function computeLineBase(product = {}) {
  const price = n(product.precio);
  const qty = Math.max(1, n(product.cantidad));
  const unidad = String(product.unidad ?? product.unidadMedida ?? "").trim().toUpperCase();
  
  // Para productos de categoría "Eventual", calcular directamente precio × cantidad
  if (product.categoria === "Eventual") {
    return price * qty;
  }
  
  // Para machimbre/deck: históricamente algunos ítems guardan `precio` como TOTAL de la línea (ya incluye cantidad),
  // pero otros (ej. "Deck WPC ...") guardan `precio` UNITARIO. Para evitar errores, detectamos el caso comparando
  // contra el cálculo esperado cuando existen dimensiones y `precioPorPie`.
  if (isMachimbreOrDeck(product)) {
    const alto = n(product.alto ?? product.espesor);
    const largo = n(product.largo);
    const precioPorPie = n(product.precioPorPie);

    // Solo si podemos calcular un esperado confiable
    if (alto > 0 && largo > 0 && precioPorPie > 0) {
      const expected = calcularPrecioMachimbre({
        alto,
        largo,
        cantidad: qty,
        precioPorPie,
        redondear: false,
      });
      const expectedRounded = roundToHundreds(expected);
      const closeToExpected =
        Math.abs(price - expected) <= 1 || Math.abs(price - expectedRounded) <= 1;

      // Si el precio almacenado ya es el total de la línea, NO multiplicar por cantidad.
      if (closeToExpected) return price;
    }

    // Por defecto, tratarlo como unitario.
    return price * qty;
  }
  
  // Para el resto: base es precio × cantidad
  return price * qty;
}

const parseDiscountValue = (value) => {
  if (value === null || value === undefined) return NaN;
  if (typeof value === "number") return Number.isFinite(value) ? value : NaN;
  const raw = String(value).trim();
  if (!raw) return NaN;
  const cleaned = raw.replace("%", "");
  const num = toNumber(cleaned);
  return Number.isFinite(num) ? num : NaN;
};

export function getLineDiscountInfo(product = {}) {
  const base = computeLineBase(product);
  const pctDirect = parseDiscountValue(product.descuento);
  const pctAlt = parseDiscountValue(product.descuentoPorcentaje);
  const pctObj = parseDiscountValue(product?.discount?.percentage);
  const montoRaw = parseDiscountValue(product.descuentoMonto);
  const montoObj = parseDiscountValue(product?.discount?.amount);
  const montoFinal = Number.isFinite(montoRaw)
    ? montoRaw
    : Number.isFinite(montoObj)
    ? montoObj
    : NaN;
  const descuentoPct = Number.isFinite(pctDirect)
    ? pctDirect
    : Number.isFinite(pctAlt)
    ? pctAlt
    : Number.isFinite(pctObj)
    ? pctObj
    : Number.isFinite(montoFinal) && base > 0
    ? (montoFinal / base) * 100
    : 0;
  const descuentoMonto = Number.isFinite(montoFinal)
    ? Math.max(0, montoFinal)
    : Math.max(0, base * (descuentoPct / 100));
  const subtotal = base * (1 - descuentoPct / 100);
  return {
    base,
    descuentoPct,
    descuentoMonto,
    subtotal: Math.round(subtotal),
  };
}

/**
 * Computes the line subtotal (after discount) rounded to nearest integer.
 * @param {object} product
 * @returns {number}
 */
export function computeLineSubtotal(product = {}) {
  const info = getLineDiscountInfo(product);
  return info.subtotal;
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
    const info = getLineDiscountInfo(p);
    subtotal += info.base;
    descuentoTotal += info.descuentoMonto;
  }
  const total = subtotal - descuentoTotal;
  return {
    subtotal: Math.round(subtotal),
    descuentoTotal: Math.round(descuentoTotal),
    total: Math.round(total),
  };
}
