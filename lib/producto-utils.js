/**
 * Utilidades para productos con estructura unificada.
 * Compatibilidad: lee precioVenta | valorVenta | precioCalculado; espesor | alto; tipoMaterial | tipoMadera.
 */

/**
 * Parsea un número de forma laxa, manejando formatos con coma o punto decimal.
 * @param {any} value
 * @returns {number}
 */
export function parseNumberLoose(value) {
    if (value === null || value === undefined) return 0;
    if (typeof value === "number") {
      if (!Number.isFinite(value)) return 0;
      // Compat: muchos precios quedaron como 40.516 (en vez de 40516) por parseo viejo tipo "40.516,00" -> 40.516
      // Si el número viene en formato ^\d{1,3}\.\d{3}$ lo interpretamos como miles y multiplicamos ×1000.
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
    } else {
      // solo punto o ninguno => Number lo maneja
    }

    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
}

/**
 * Precio de venta del producto (campo unificado).
 * @param {object} p - Producto
 * @returns {number}
 */
export function getPrecioVenta(p) {
  if (!p || typeof p !== "object") return 0;
  const candidatesRaw = [
    p.precioVenta,
    p.valorVenta,
    p.precioCalculado,
    // Estructura "productos normales" / catálogos viejos
    p.precioUnidad,
    p.precioUnidadVenta,
    p.precioUnidadHerraje,
    p.precioUnidadQuimico,
    p.precioUnidadHerramienta,
  ];

  const values = candidatesRaw.map(parseNumberLoose).filter((n) => Number.isFinite(n));

  // En la base hay casos donde `precioVenta` queda como placeholder (ej. 1)
  // mientras otros campos tienen el valor real. Para evitar mostrar $0,
  // tomamos el mayor valor válido disponible.
  const best = values.length ? Math.max(...values) : 0;
  return Number.isFinite(best) ? best : 0;
}

/**
 * Espesor (tercera dimensión). Reemplaza "alto" en la nueva estructura.
 * @param {object} p - Producto
 * @returns {number|null}
 */
export function getEspesor(p) {
  if (!p || typeof p !== "object") return null;
  const v = p.espesor ?? p.alto;
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Tipo de material. Reemplaza "tipoMadera" en la nueva estructura.
 * @param {object} p - Producto
 * @returns {string}
 */
export function getTipoMaterial(p) {
  if (!p || typeof p !== "object") return "";
  return String(p.tipoMaterial ?? p.tipoMadera ?? "").trim();
}

/**
 * Subcategoría unificada (subcategoria o subCategoria).
 * @param {object} p - Producto
 * @returns {string}
 */
export function getSubcategoria(p) {
  if (!p || typeof p !== "object") return "";
  return String(p.subcategoria ?? p.subCategoria ?? "").trim();
}

/**
 * Medidas en formato "Largo × Ancho × Espesor" (solo partes presentes).
 * @param {object} p - Producto
 * @returns {string} ej. "2000 × 140 × 16" o "140 × 16" o "16"
 */
export function getMedidas(p) {
  if (!p || typeof p !== "object") return "";
  const largo = p.largo != null && p.largo !== "" ? Number(p.largo) : null;
  const ancho = p.ancho != null && p.ancho !== "" ? Number(p.ancho) : null;
  const espesor = p.espesor ?? p.alto;
  const e = espesor != null && espesor !== "" ? Number(espesor) : null;
  const parts = [];
  if (Number.isFinite(largo)) parts.push(largo);
  if (Number.isFinite(ancho)) parts.push(ancho);
  if (Number.isFinite(e)) parts.push(e);
  return parts.length ? parts.join(" × ") : "";
}

/**
 * Valores por defecto para producto recién creado/importado (estado, tienda, imagenes, descuentos).
 */
export const DEFAULTS_PRODUCTO = {
  estado: "Activo",
  estadoTienda: "Inactivo",
  minimoCompra: 1,
  pack: "",
  imagenes: [],
  discount: { amount: 0, percentage: 0 },
  rating: 0,
  freeShipping: false,
  featuredBrand: false,
  newArrival: false,
  specialOffer: false,
};

// --- Utilidades adicionales extraídas de Presupuestos ---

export const normUnidad = (u) => (u || "").toString().trim().toUpperCase();

const toMetersCtx = (v, otherSide) => {
    const n = parseNumberLoose(v);
    if (!Number.isFinite(n) || n <= 0) return null;
    const other = parseNumberLoose(otherSide);

    if (n >= 1000) return n / 1000; // mm
    if (n < 100) return n / 100; // cm
    if (other >= 1000) return n / 1000; // mm por contextooooo
    return n / 100; // cm
};

export const totalM2AltoLargo = (p) => {
    const altoM = toMetersCtx(p?.alto, p?.largo);
    const largoM = toMetersCtx(p?.largo, p?.alto);
    const cant = Number(p?.cantidad) || 1;
    if (!altoM || !largoM) return 0;
    const area = altoM * largoM * cant;
    return Number.isFinite(area) && area > 0 ? area : 0;
};

export const getRendimientoM2 = (p) => {
  if (!p || typeof p !== "object") return null;
  const stored = parseDecimalLoose(p?.rendimiento ?? p?.rendimientoM2);
  if (Number.isFinite(stored) && stored > 0) return Math.round(stored * 10000) / 10000;
  const altoRaw = p?.ancho ?? p?.alto;
  const largoRaw = p?.largo;
  const altoM = toMetersCtx(altoRaw, largoRaw);
  const largoM = toMetersCtx(largoRaw, altoRaw);
  if (!altoM || !largoM) return null;
  const area = altoM * largoM;
  if (!Number.isFinite(area) || area <= 0) return null;
  return Math.round(area * 10000) / 10000;
};

const parseDecimalLoose = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const raw = String(value).trim();
  if (!raw) return null;
  let s = raw.replace(/\s+/g, "").replace(/[^\d,.-]/g, "");
  if (!s) return null;
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
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

const normalizeExternalKg = (value) => {
  const parsed = parseDecimalLoose(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  let kg = parsed;
  if (kg > 100) {
    const gramsToKg = kg / 1000;
    if (!Number.isFinite(gramsToKg) || gramsToKg <= 0 || gramsToKg > 100) return null;
    kg = gramsToKg;
  }
  const rounded = Math.round(kg * 1000) / 1000;
  if (!Number.isFinite(rounded) || rounded <= 0 || rounded > 100) return null;
  return rounded;
};

export const getExternalProductoFields = (p) => {
  if (!p || typeof p !== "object") {
    return {
      largo: null,
      alto: null,
      espesor: null,
      kg: null,
      rendimiento: null,
      minimoCompra: 1,
      minCompra: 1,
      pack: "",
      packSize: "",
    };
  }
  const parseDimensionLoose = (value) => {
    if (value === null || value === undefined || value === "") return null;
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    const raw = String(value).trim();
    if (!raw) return null;
    let s = raw.replace(/\s+/g, "").replace(/[^\d,.-]/g, "");
    if (!s) return null;
    if (s.includes(",") && !s.includes(".")) {
      s = s.replace(",", ".");
    } else if (s.includes(",") && s.includes(".")) {
      const lastComma = s.lastIndexOf(",");
      const lastDot = s.lastIndexOf(".");
      if (lastComma > lastDot) {
        s = s.replace(/\./g, "").replace(",", ".");
      } else {
        s = s.replace(/,/g, "");
      }
    }
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  };
  const largoNum = parseDimensionLoose(p?.largo);
  const altoNum = parseDimensionLoose(p?.ancho ?? p?.alto);
  const espesorNum = getEspesor(p);
  const kgNum = normalizeExternalKg(p?.peso ?? p?.kg ?? p?.external?.kg);
  const rendimiento = getRendimientoM2(p);
  const minimoCompraRaw = p?.minimoCompra ?? p?.minCompra ?? p?.external?.minimoCompra ?? p?.external?.minCompra;
  const minimoCompraParsed = parseNumberLoose(minimoCompraRaw);
  const minimoCompra =
    Number.isFinite(minimoCompraParsed) && minimoCompraParsed >= 0
      ? minimoCompraParsed
      : 1;
  const packRaw = p?.pack ?? p?.packSize ?? p?.external?.pack ?? p?.external?.packSize;
  const pack = String(packRaw ?? "").trim();
  return {
    largo: Number.isFinite(largoNum) && largoNum > 0 ? largoNum : null,
    alto: Number.isFinite(altoNum) && altoNum > 0 ? altoNum : null,
    espesor: Number.isFinite(espesorNum) && espesorNum > 0 ? espesorNum : null,
    kg: Number.isFinite(kgNum) && kgNum > 0 ? kgNum : null,
    rendimiento,
    minimoCompra,
    // Alias de compatibilidad para consumidores externos que esperan otro nombre.
    minCompra: minimoCompra,
    pack,
    // Alias de compatibilidad para integraciones externas antiguas.
    packSize: pack,
  };
};
