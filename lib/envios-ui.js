// Lógica de presentación del panel de envíos (sin React), para poder probarla.
import { computeShipping, normalizeShippingRules, priceForDistance } from "@/lib/shipping";

const toNumber = (value) => {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const n = typeof value === "number" ? value : parseFloat(String(value).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

export const moneyAr = (value) => `$${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(Math.round(Number(value) || 0))}`;

/** "5 km", "2,5 km" a partir de kilómetros. */
export const kmLabel = (km) => `${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 }).format(Number(km) || 0)} km`;
export const metersToKm = (meters) => (Number(meters) || 0) / 1000;
export const kmToMeters = (km) => Math.round((Number(km) || 0) * 1000);

/** Estado comparable de la configuración: ignora el orden de edición de las tarifas y el formato de los números. */
export function snapshotOf({ locations = [], tiers = [], rules } = {}) {
  return JSON.stringify({
    locations: locations.map((l) => ({
      id: String(l.id || ""),
      nombre: String(l.nombre || "").trim(),
      direccion: String(l.direccion || "").trim(),
      lat: toNumber(l.lat),
      lng: toNumber(l.lng),
      radio: toNumber(l.radio),
    })),
    tiers: tiers
      .map((t) => ({ km: toNumber(t.km), price: toNumber(t.price) }))
      .sort((a, b) => (a.km ?? Infinity) - (b.km ?? Infinity)),
    rules: normalizeShippingRules(rules),
  });
}

/** Tarifas ordenadas por km con el "desde" de cada tramo. Las filas incompletas se omiten. */
export function tierRanges(tiers) {
  const valid = tiers
    .map((t) => ({ km: toNumber(t.km), price: toNumber(t.price) }))
    .filter((t) => t.km !== null && t.km > 0 && t.price !== null)
    .sort((a, b) => a.km - b.km);
  return valid.map((t, i) => ({ fromKm: i === 0 ? 0 : valid[i - 1].km, toKm: t.km, price: t.price }));
}

/** Frase corta que resume las tarifas. */
export function tarifasResumen(tiers) {
  const ranges = tierRanges(tiers);
  if (!ranges.length) return "Todavía no hay tarifas: todos los envíos se cotizan.";
  const prices = ranges.map((r) => r.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const precio = min === max ? moneyAr(min) : `de ${moneyAr(min)} a ${moneyAr(max)}`;
  return `Cubre hasta ${kmLabel(ranges[ranges.length - 1].toKm)} · ${precio}`;
}

/** Ordena las tarifas por km dejando al final las filas que todavía no tienen km. */
export const sortTiers = (tiers) => [...tiers].sort((a, b) => (toNumber(a.km) ?? Infinity) - (toNumber(b.km) ?? Infinity));

/** Datos de tarifas/sucursales ya numéricos para el motor de cálculo. */
export const numericTiers = (tiers) => tiers.map((t) => ({ km: toNumber(t.km), price: toNumber(t.price) })).filter((t) => t.km !== null && t.km > 0 && t.price !== null);
export const numericLocations = (locations) =>
  locations
    .map((l) => ({ ...l, lat: toNumber(l.lat), lng: toNumber(l.lng), radio: toNumber(l.radio) }))
    .filter((l) => l.lat !== null && l.lng !== null && l.radio !== null && l.radio > 0);

/** Qué mostrar cuando se elige una dirección en el mapa. */
export function coverageMessage(result) {
  if (!result || result.status === "invalid") return null;
  const store = result.store?.nombre || "la sucursal más cercana";
  if (result.reason === "sin_sucursales") {
    return { tone: "warn", title: "Agregá una sucursal", detail: "Sin sucursales no se puede calcular la cobertura." };
  }
  if (result.reason === "fuera_de_zona") {
    return { tone: "bad", title: "Fuera de la zona de entrega", detail: `${store} está a ${kmLabel(result.distance)}. Este envío se cotiza aparte.` };
  }
  if (result.reason === "sin_tarifa") {
    return { tone: "warn", title: "Sin tarifa para esta distancia", detail: `${store} está a ${kmLabel(result.distance)}, más lejos que la última tarifa. Se cotiza aparte.` };
  }
  if (result.status === "ok") {
    const price = result.free ? "envío gratis" : `envío desde ${moneyAr(result.price)}`;
    return { tone: "ok", title: "Llegamos a esta dirección", detail: `${store} · a ${kmLabel(result.distance)} · ${price}` };
  }
  return { tone: "warn", title: "Se cotiza aparte", detail: result.message || "" };
}

/** Desglose en palabras de un cálculo de envío para el probador. */
export function describeQuote(result, rules) {
  if (!result) return null;
  const config = normalizeShippingRules(rules);
  if (result.status !== "ok") {
    const reasons = {
      sin_sucursales: "Todavía no hay sucursales cargadas.",
      fuera_de_zona: "La dirección está fuera del radio de cobertura.",
      sin_tarifa: "La distancia supera el último tramo de tarifa.",
      peso_excedido: `El pedido supera el máximo para envío (${result.maxWeightKg ?? config.maxWeightKg} kg).`,
      peso_desconocido: "Falta indicar el peso del pedido.",
    };
    return { quote: true, title: "Se cotiza aparte", lines: [], note: reasons[result.reason] || result.message || "" };
  }
  const lines = [{ label: `Tarifa por distancia (hasta ${kmLabel(result.tierKm)})`, value: moneyAr(result.base) }];
  if (result.weightUnknown) lines.push({ label: "Peso", value: "No informado · sin adicional" });
  if (result.weightExtra > 0) lines.push({ label: `Adicional por peso (hasta ${result.weightBandUpToKg} kg)`, value: `+ ${moneyAr(result.weightExtra)}` });
  if (result.fuel > 0) lines.push({ label: `Recargo por combustible (${config.fuelSurchargePct}%)`, value: `+ ${moneyAr(result.fuel)}` });
  if (result.minimumApplied) lines.push({ label: `Se aplicó el envío mínimo`, value: moneyAr(config.minFee) });
  return {
    quote: false,
    free: result.free,
    total: result.price,
    title: result.free ? "Envío gratis" : moneyAr(result.price),
    lines,
    note: result.free ? `La compra supera ${moneyAr(config.freeShippingMin)}; sin la gratuidad costaría ${moneyAr(result.listPrice)}.` : "",
  };
}

export { computeShipping, priceForDistance };

/** Problemas de un elemento concreto (por posición) agrupados por campo. */
export function issuesByField(issues, scope, index) {
  const result = {};
  for (const issue of issues) {
    if (issue.scope === scope && issue.index === index && issue.field && !result[issue.field]) result[issue.field] = issue.message;
  }
  return result;
}

export const countIssues = (issues, scope) => issues.filter((issue) => issue.scope === scope).length;

// Dentro de un campo el mensaje ya está en contexto: se quita el "Sucursal #1: " del principio.
const stripLabel = (message) => {
  const i = String(message).indexOf(": ");
  const text = i > 0 && i < 60 ? String(message).slice(i + 2) : String(message);
  return text.charAt(0).toUpperCase() + text.slice(1);
};
/** Como `issuesByField`, pero con mensajes cortos para mostrar junto al campo. */
export function inlineIssues(issues, scope, index) {
  const result = issuesByField(issues, scope, index);
  Object.keys(result).forEach((key) => { result[key] = stripLabel(result[key]); });
  return result;
}

export const newStoreId = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `store_${Date.now().toString(36)}`);
