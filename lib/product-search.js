export function parseDimensionQuery(rawValue) {
  const normalized = String(rawValue || "")
    .toLowerCase()
    .replace(/,/g, ".")
    .replace(/×/g, "x")
    .trim();

  if (!normalized || !/[x]/i.test(normalized)) return null;
  const tokens = normalized.split(/\s*x\s*/i).filter(Boolean);
  if (tokens.length !== 2 && tokens.length !== 3) return null;

  const values = tokens.map((token) => {
    const fraction = token.match(/^\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*$/);
    if (fraction) {
      const numerator = Number(fraction[1]);
      const denominator = Number(fraction[2]);
      return denominator > 0 ? numerator / denominator : NaN;
    }
    return Number(token.trim());
  });

  if (values.some((value) => !Number.isFinite(value) || value <= 0)) return null;
  return values.map((value) => Math.round(value * 100) / 100);
}

export function normalizeDimensionQuery(rawValue) {
  const values = parseDimensionQuery(rawValue);
  return values ? values.map((value) => String(value)).join(" × ") : "";
}

export function dimensionSearchVariants(dimensions) {
  if (!Array.isArray(dimensions) || (dimensions.length !== 2 && dimensions.length !== 3)) return [];
  const [first, second, third] = dimensions;
  const variants = dimensions.length === 3
    ? [
        { alto: first, ancho: second, largo: third },
        { alto: second, ancho: first, largo: third },
      ]
    : [
        { alto: first, ancho: second },
        { alto: first, largo: second },
        { ancho: first, largo: second },
      ];
  return variants;
}
