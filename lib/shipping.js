// Motor único de envíos: lo usan el checkout, la API de cobertura y el simulador del panel.
// Es una función pura (sin Firebase) para poder probarla y reutilizarla en el navegador.

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const num = (v) => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

export const DEFAULT_MAX_WEIGHT_KG = 100;

export function distanceKm(lat1, lng1, lat2, lng2) {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Reglas por defecto compatibles con el comportamiento anterior (sin recargos, tope de 100 kg). */
export function normalizeShippingRules(raw = {}) {
  const source = raw && typeof raw === "object" ? raw : {};
  const weightBands = (Array.isArray(source.weightBands) ? source.weightBands : [])
    .map((band) => ({ upToKg: num(band?.upToKg), extra: num(band?.extra) ?? 0 }))
    .filter((band) => band.upToKg !== null && band.upToKg > 0 && band.extra >= 0)
    .sort((a, b) => a.upToKg - b.upToKg);
  return {
    maxWeightKg: Math.max(1, num(source.maxWeightKg) ?? DEFAULT_MAX_WEIGHT_KG),
    weightBands,
    freeShippingMin: Math.max(0, num(source.freeShippingMin) ?? 0),
    minFee: Math.max(0, num(source.minFee) ?? 0),
    fuelSurchargePct: Math.min(100, Math.max(0, num(source.fuelSurchargePct) ?? 0)),
  };
}

/** Problemas de las reglas, con el campo exacto (y la franja) donde están. */
function rulesIssues(rules) {
  const issues = [];
  const raw = rules && typeof rules === "object" ? rules : {};
  const bands = Array.isArray(raw.weightBands) ? raw.weightBands : [];
  const add = (index, field, message) => issues.push({ scope: "reglas", index, field, message });
  let previous = 0;
  bands.forEach((band, index) => {
    const upTo = num(band?.upToKg);
    const extra = num(band?.extra);
    if (upTo === null || upTo <= 0) add(index, "upToKg", `Franja de peso #${index + 1}: el límite debe ser mayor a 0`);
    else if (upTo <= previous) add(index, "upToKg", `Franja de peso #${index + 1}: debe superar a la anterior (${previous} kg)`);
    else previous = upTo;
    if (extra === null || extra < 0) add(index, "extra", `Franja de peso #${index + 1}: el adicional no puede ser negativo`);
  });
  const checks = [
    ["maxWeightKg", "El peso máximo debe ser mayor a 0", (v) => v > 0 && v <= 100000],
    ["freeShippingMin", "El monto para envío gratis no puede ser negativo", (v) => v >= 0],
    ["minFee", "El envío mínimo no puede ser negativo", (v) => v >= 0],
    ["fuelSurchargePct", "El recargo debe estar entre 0 y 100 %", (v) => v >= 0 && v <= 100],
  ];
  for (const [key, message, ok] of checks) {
    if (raw[key] === undefined || raw[key] === null || raw[key] === "") continue;
    const value = num(raw[key]);
    if (value === null || !ok(value)) add(null, key, message);
  }
  return issues;
}

/**
 * Todos los problemas bloqueantes de la configuración de envíos, con su ubicación:
 * `scope` (sucursales | tarifas | reglas), posición en la lista y campo. Sirve igual en el servidor y en el panel.
 */
export function shippingIssues({ locations = [], tiers = [], rules = {} } = {}) {
  const issues = [];
  const add = (scope, index, field, message) => issues.push({ scope, index, field, message });

  locations.forEach((location, index) => {
    const name = String(location?.nombre || "").trim();
    const label = name || `Sucursal #${index + 1}`;
    const lat = num(location?.lat);
    const lng = num(location?.lng);
    const radius = num(location?.radio);
    if (!name) add("sucursales", index, "nombre", `${label}: poné un nombre.`);
    if (!String(location?.direccion || "").trim()) add("sucursales", index, "direccion", `${label}: elegí la dirección.`);
    else if (lat === null || lng === null || Math.abs(lat) > 90 || Math.abs(lng) > 180) add("sucursales", index, "direccion", `${label}: elegí una dirección de la lista para ubicarla en el mapa.`);
    if (radius === null || radius <= 0) add("sucursales", index, "radio", `${label}: el radio de cobertura debe ser mayor a 0.`);
  });

  const seenKm = new Set();
  tiers.forEach((tier, index) => {
    const km = num(tier?.km);
    const price = num(tier?.price);
    if (km === null || km <= 0) add("tarifas", index, "km", `Tramo #${index + 1}: indicá hasta cuántos km llega.`);
    else if (seenKm.has(km)) add("tarifas", index, "km", `Tramo #${index + 1}: ya hay otro tramo hasta ${km} km.`);
    else seenKm.add(km);
    if (price === null || price < 0) add("tarifas", index, "price", `Tramo #${index + 1}: indicá el precio.`);
  });

  issues.push(...rulesIssues(rules));
  return issues;
}

/** Errores (texto) de las reglas y avisos de cobertura para mostrar al operador. */
export function validateShippingConfig({ locations = [], tiers = [], rules = {} } = {}) {
  const errors = rulesIssues(rules).map((issue) => issue.message);
  const warnings = [];
  const kms = tiers.map((t) => num(t.km)).filter((km) => km !== null && km > 0);
  const maxTierKm = kms.length ? Math.max(...kms) : 0;
  locations.forEach((location) => {
    const radiusKm = (num(location.radio) || 0) / 1000;
    if (kms.length && radiusKm > maxTierKm) {
      warnings.push(`${location.nombre || "Una sucursal"} cubre hasta ${round2(radiusKm)} km, pero la última tarifa llega a ${maxTierKm} km: más allá se pedirá cotización.`);
    }
  });
  if (!kms.length) warnings.push("Todavía no hay tarifas: todos los envíos se pedirán por cotización.");
  if (!locations.length) warnings.push("Todavía no hay sucursales: no se puede calcular el envío.");
  return { errors, warnings };
}

/** Precio para una distancia conocida. */
export function priceForDistance({ distanceKm: distance, tiers = [], rules, weightKg = null, subtotal = 0 }) {
  const config = normalizeShippingRules(rules);
  const sorted = [...tiers].filter((t) => num(t.km) !== null && num(t.price) !== null).sort((a, b) => a.km - b.km);
  const tier = sorted.find((t) => distance <= t.km);
  if (!tier) return { status: "quote", reason: "sin_tarifa", message: "La distancia supera el último tramo de tarifa." };

  const maxWeight = config.weightBands.length ? config.weightBands[config.weightBands.length - 1].upToKg : config.maxWeightKg;
  const weight = weightKg === null || weightKg === undefined ? null : num(weightKg);
  if (weight === null || weight <= 0) {
    return { status: "quote", reason: "peso_desconocido", message: "Falta el peso del pedido para calcular el envío." };
  }
  if (weight > maxWeight) {
    return { status: "quote", reason: "peso_excedido", message: `El pedido supera el máximo de ${maxWeight} kg para envío.`, maxWeightKg: maxWeight };
  }

  const band = config.weightBands.find((b) => weight <= b.upToKg) || null;
  const base = round2(tier.price);
  const weightExtra = round2(band?.extra ?? 0);
  const fuel = round2((base + weightExtra) * config.fuelSurchargePct / 100);
  const calculated = round2(base + weightExtra + fuel);
  const minimumApplied = calculated < config.minFee;
  const free = config.freeShippingMin > 0 && Number(subtotal) >= config.freeShippingMin;
  return {
    status: "ok",
    tierKm: tier.km,
    base, weightExtra, fuel, minimumApplied, free,
    price: free ? 0 : round2(Math.max(calculated, config.minFee)),
    listPrice: round2(Math.max(calculated, config.minFee)),
    weightBandUpToKg: band?.upToKg ?? null,
  };
}

/** Calcula el envío completo desde coordenadas. Elige, entre las sucursales que cubren la dirección, la más cercana. */
export function computeShipping({ locations = [], tiers = [], rules, lat, lng, weightKg = null, subtotal = 0 }) {
  const latitude = num(lat);
  const longitude = num(lng);
  if (latitude === null || longitude === null || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    return { status: "invalid", reason: "coordenadas_invalidas", message: "Coordenadas inválidas." };
  }
  const stores = locations
    .filter((s) => num(s.lat) !== null && num(s.lng) !== null && num(s.radio) !== null)
    .map((s) => ({ ...s, distance: round2(distanceKm(latitude, longitude, s.lat, s.lng)) }))
    .sort((a, b) => a.distance - b.distance);
  if (!stores.length) return { status: "quote", reason: "sin_sucursales", message: "No hay sucursales configuradas." };

  const covering = stores.filter((s) => s.distance <= s.radio / 1000);
  const store = covering[0] || stores[0];
  const common = { store, distance: store.distance, maxRadiusKm: store.radio / 1000, inRadius: covering.length > 0 };
  if (!covering.length) {
    return { ...common, status: "quote", reason: "fuera_de_zona", message: "La dirección está fuera del radio de cobertura." };
  }
  return { ...common, ...priceForDistance({ distanceKm: store.distance, tiers, rules, weightKg, subtotal }) };
}
