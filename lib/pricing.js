// Motor de precios reutilizable por UI y API

const roundToHundreds = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.round(num / 100) * 100;
};

const toNumberPlain = (value) => {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const raw = String(value).trim();
  if (!raw) return 0;
  let s = raw.replace(/\s+/g, "").replace(/[^\d,.-]/g, "");
  if (!s) return 0;
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  if (hasComma && hasDot) {
    const lastComma = s.lastIndexOf(",");
    const lastDot = s.lastIndexOf(".");
    if (lastComma > lastDot) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      s = s.replace(/,/g, "");
    }
  } else if (hasComma) {
    s = s.replace(",", ".");
  }
  const num = Number(s);
  return Number.isFinite(num) ? num : 0;
};

const toMoneyNumber = (value) => {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return 0;
    const s = String(value);
    if (/^\d{1,3}\.\d{3}$/.test(s)) return value * 1000;
    if (/^\d{1,3}\.\d{1,2}$/.test(s) && value > 0 && value < 1000) {
      const scaled = value * 1000;
      if (Number.isFinite(scaled) && Math.abs(scaled - Math.round(scaled)) < 1e-6) {
        return Math.round(scaled);
      }
      return scaled;
    }
    return value;
  }
  return toNumberPlain(value);
};

export function calcularPrecioCorteMadera({
  alto,
  ancho,
  largo,
  precioPorPie,
  factor = 0.2734,
  redondear = true,
}) {
  const a = toNumberPlain(alto);
  const an = toNumberPlain(ancho);
  const l = toNumberPlain(largo);
  const p = toMoneyNumber(precioPorPie);
  if ([a, an, l, p].some((v) => v <= 0)) return 0;
  const precio = factor * a * an * l * p;
  return redondear ? roundToHundreds(precio) : precio;
}

export function calcularPrecioMachimbre({ alto, largo, cantidad, precioPorPie, redondear = true }) {
  const a = toNumberPlain(alto);
  const l = toNumberPlain(largo);
  const c = Math.max(1, toNumberPlain(cantidad));
  const p = toMoneyNumber(precioPorPie);
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
  const vals = candidates.map(toMoneyNumber).filter((x) => Number.isFinite(x));
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
  const cantidadNum = Math.max(1, toNumberPlain(cantidad));
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
      const pUnitRaw = toMoneyNumber(producto?.precioPorPie);
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
    const unitRaw = toMoneyNumber(producto?.valorVenta ?? producto?.precioVenta);
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
    alto: toNumberPlain(alto),
    espesor: toNumberPlain(alto),
    ancho: toNumberPlain(p.ancho),
    largo: toNumberPlain(p.largo),
    precioPorPie: toMoneyNumber(p.precioPorPie),
    valorVenta: toMoneyNumber(p.valorVenta),
    precioVenta: toMoneyNumber(p.precioVenta ?? p.valorVenta ?? p.precioCalculado),
    categoria: p.categoria ? String(p.categoria) : undefined,
    unidadMedida: unidadTexto,
    unidad: unidadTexto,
  };
}

export const PricingUtils = {
  roundToHundreds,
  toMoneyNumber,
  toNumberPlain,
};

const normalizeCantidad = (p) => {
  const n = toNumberPlain(p?.cantidad ?? p?.qty ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const normalizeUnidad = (p) => {
  const raw = String(p?.unidadMedida ?? p?.unidad ?? p?.unit ?? "").trim();
  const up = raw.toUpperCase();
  if (up === "M²") return "M2";
  if (up === "M³") return "M3";
  return up;
};

const normalizeCategoria = (p) => String(p?.categoria ?? "").trim();

const baseMedidaPorUnidad = (producto) => {
  const categoria = normalizeCategoria(producto);
  const unidad = normalizeUnidad(producto);
  if (categoria !== "Maderas") return { base: 1, unit: "un" };

  const toMeters = (value, otherSide) => {
    const n = toNumberPlain(value);
    if (!Number.isFinite(n) || n <= 0) return null;
    const other = toNumberPlain(otherSide);
    if (Number.isFinite(other) && other > 0 && n <= 20 && other <= 20) return n;
    if (n <= 20 && (!Number.isFinite(other) || other <= 0)) return n;
    if (n >= 1000) return n / 1000;
    if (Number.isFinite(other) && other >= 1000) return n / 1000;
    if (n >= 100) return n / 100;
    return n / 100;
  };

  const altoRawM2 = (toNumberPlain(producto?.alto) || 0) > 0 ? producto?.alto : producto?.ancho;
  const altoM2 = toMeters(altoRawM2, producto?.largo);
  const alto = toMeters(producto?.alto ?? producto?.espesor, producto?.ancho) ?? toNumberPlain(producto?.alto ?? producto?.espesor);
  const ancho = toMeters(producto?.ancho, producto?.alto ?? producto?.espesor) ?? toNumberPlain(producto?.ancho);
  const largo = toMeters(producto?.largo, altoRawM2) ?? toNumberPlain(producto?.largo);

  if (unidad === "M2") {
    const base = (altoM2 || 0) > 0 && largo > 0 ? altoM2 * largo : 1;
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
  const m = toNumberPlain(medidaTotal);
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
  const price = toMoneyNumber(product.precio);
  const qty = Math.max(1, Math.ceil(toNumberPlain(product.cantidad) || 0));
  const categoria = normalizeCategoria(product);
  const unidad = normalizeUnidad(product);
  if (product.precioIncluyeCantidad) return price;
  
  // Para productos de categoría "Eventual", calcular directamente precio × cantidad
  if (product.categoria === "Eventual") {
    return price * qty;
  }

  const computePrecioMaderaEsperado = () => {
    if (categoria !== "Maderas") return 0;
    const precioPorPie = toMoneyNumber(product.precioPorPie);
    if (!(precioPorPie > 0)) return 0;

    const cepilladoAplicado =
      product.cepilladoAplicado === true ||
      product.cepilladoAplicado === "true" ||
      product.cepilladoAplicado === 1 ||
      product.cepilladoAplicado === "1" ||
      product.cepilladoAplicado === "on";
    const calibradoAplicado =
      product.calibradoAplicado === true ||
      product.calibradoAplicado === "true" ||
      product.calibradoAplicado === 1 ||
      product.calibradoAplicado === "1" ||
      product.calibradoAplicado === "on";
    const cepPct = Math.max(0, toNumberPlain(product.cepilladoPorcentaje));
    const calPct = Math.max(0, toNumberPlain(product.calibradoPorcentaje));
    const factor =
      (cepilladoAplicado ? 1 + cepPct / 100 : 1) *
      (calibradoAplicado ? 1 + calPct / 100 : 1);

    const toMeters = (value, otherSide) => {
      const n = toNumberPlain(value);
      if (!Number.isFinite(n) || n <= 0) return null;
      const other = toNumberPlain(otherSide);
      if (Number.isFinite(other) && other > 0 && n <= 20 && other <= 20) return n;
      if (n <= 20 && (!Number.isFinite(other) || other <= 0)) return n;
      if (n >= 1000) return n / 1000;
      if (Number.isFinite(other) && other >= 1000) return n / 1000;
      if (n >= 100) return n / 100;
      return n / 100;
    };

    if (unidad === "M2") {
      const altoRaw = (toNumberPlain(product?.alto) || 0) > 0 ? product?.alto : product?.ancho;
      const alto = toMeters(altoRaw, product?.largo);
      const largo = toMeters(product?.largo, altoRaw);
      if (!(alto > 0) || !(largo > 0)) return 0;
      const base = calcularPrecioMachimbre({
        alto,
        largo,
        cantidad: qty,
        precioPorPie,
        redondear: false,
      });
      return roundToHundreds(base * factor);
    }

    if (unidad === "ML") {
      const largo = toMeters(product?.largo);
      if (!(largo > 0)) return 0;
      const base = largo * precioPorPie * qty;
      return roundToHundreds(base * factor);
    }

    return 0;
  };
  
  // Para machimbre/deck: históricamente algunos ítems guardan `precio` como TOTAL de la línea (ya incluye cantidad),
  // pero otros (ej. "Deck WPC ...") guardan `precio` UNITARIO. Para evitar errores, detectamos el caso comparando
  // contra el cálculo esperado cuando existen dimensiones y `precioPorPie`.
  if (categoria === "Maderas" && (unidad === "M2" || unidad === "ML")) {
    const expected = computePrecioMaderaEsperado();
    if (expected > 0) {
      if (!(price > 0)) return expected;
      const ratio = expected / price;
      if (ratio > 8 || ratio < 1 / 8) return expected;
    }
    return price;
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
  const num = toNumberPlain(cleaned);
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
