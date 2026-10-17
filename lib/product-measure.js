// Contrato de medidas comerciales. No inferir cm/mm por la magnitud del número.
// Legacy ventas: M2 usa alto (ancho útil) × largo en m; Pie usa sección en pulgadas y largo en m.
export function decimal(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const raw = String(value ?? "").trim().replace(/\s/g, "");
  const normalized = raw.includes(",") && raw.includes(".")
    ? raw.lastIndexOf(",") > raw.lastIndexOf(".") ? raw.replace(/\./g, "").replace(",", ".") : raw.replace(/,/g, "")
    : raw.replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

export function commercialUnit(product = {}) {
  const raw = String(product.unidadMedida || product.unidad || product.unidadVenta || "").trim().toUpperCase().replace(/²/g, "2").replace(/³/g, "3").replace(/[.\s]/g, "");
  if (["M2", "MT2", "METROCUADRADO", "METROSCUADRADOS"].includes(raw)) return "M2";
  if (["M", "MT", "MTS", "ML", "MTL", "METRO", "METROS", "METROLINEAL", "METROSLINEALES"].includes(raw)) return "ML";
  if (["UN", "UNI", "UNIDAD", "UNIDADES"].includes(raw)) return "Unidad";
  if (["PIE", "PIES", "P3", "P"].includes(raw)) return "Pie";
  return raw || (String(product.categoria).toLowerCase() === "maderas" ? "Pie" : "Unidad");
}

const meters = (value, unit = "m") => {
  const n = decimal(value);
  const factor = { m: 1, cm: 0.01, mm: 0.001, in: 0.0254, pulg: 0.0254 }[String(unit).toLowerCase()];
  return n > 0 && factor ? Math.round(n * factor * 1e9) / 1e9 : null;
};

export function woodSectionInches(product = {}) {
  const thickness = decimal(product.espesor) > 0 ? product.espesor : product.alto;
  const inches = (value, unit) => Math.round((meters(value, unit || "pulg") || 0) / 0.0254 * 1e9) / 1e9;
  return { alto: inches(thickness, product.espesorUnidad), ancho: inches(product.ancho, product.anchoUnidad) };
}

export function getProductMeasure(product = {}) {
  const combo = product.esCombo === true || String(product.tipoProducto).toLowerCase() === "combo" || String(product.categoria).toLowerCase() === "combos" || (Array.isArray(product.componentesCombo) && product.componentesCombo.length > 0);
  const wood = String(product.categoria).trim().toLowerCase() === "maderas" && !combo;
  const unit = combo || !wood ? "Unidad" : commercialUnit(product);
  const length = wood ? meters(product.largo, product.largoUnidad || "m") : null;
  // Ancho explícito de la estructura nueva; alto legacy solo representa ancho útil en M2.
  const widthValue = product.anchoUtil ?? (decimal(product.espesor) > 0 ? product.ancho : (decimal(product.alto) > 0 ? product.alto : product.ancho));
  const width = unit === "M2" ? meters(widthValue, product.anchoUnidad || product.dimensionesUnidad || "m") : null;
  const coverage = decimal(product.rendimientoM2 ?? product.rendimiento);
  const perPiece = unit === "M2" ? coverage > 0 ? coverage : width && length ? width * length : null : unit === "ML" ? length : null;
  const dimensions = [];
  if (length) dimensions.push({ label: "Largo", value: length, unit: "m" });
  if (width) dimensions.push({ label: "Ancho útil", value: width, unit: "m" });
  if (unit === "Pie") {
    if (decimal(product.ancho) > 0) dimensions.push({ label: "Ancho", value: decimal(product.ancho), unit: product.anchoUnidad || "pulg" });
    const thickness = decimal(product.espesor) > 0 ? product.espesor : product.alto;
    if (decimal(thickness) > 0) dimensions.push({ label: "Espesor", value: decimal(thickness), unit: product.espesorUnidad || "pulg" });
  } else if (decimal(product.espesor) > 0) {
    dimensions.push({ label: "Espesor", value: decimal(product.espesor), unit: product.espesorUnidad || "mm" });
  }
  const calculators = [];
  if (unit === "M2" && perPiece) calculators.push({ unit: "M2", symbol: "m²", perPiece });
  if (wood && length) calculators.push({ unit: "ML", symbol: "ml", perPiece: length });
  if (unit === "Pie" && length) {
    const widthMeters = meters(product.ancho, product.anchoUnidad || "pulg");
    if (widthMeters) calculators.push({ unit: "M2", symbol: "m²", perPiece: Math.round(widthMeters * length * 1e9) / 1e9 });
  }
  return { unit, kind: combo ? "combo" : wood ? "wood" : "unit", symbol: unit === "M2" ? "m²" : unit === "ML" ? "ml" : unit === "Pie" ? "pie" : "un", perPiece, dimensions, calculators };
}
