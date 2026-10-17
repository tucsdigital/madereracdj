import { preflightCorsPublico, jsonPublico } from "@/lib/cors-publico";
import { obtenerSettingsGeneral } from "@/lib/settings";
import { computeShipping } from "@/lib/shipping";

export function OPTIONS(request) {
  return preflightCorsPublico(request);
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const lat = parseFloat(String(searchParams.get("lat") ?? ""));
  const lng = parseFloat(String(searchParams.get("lng") ?? ""));
  const weightKg = parseFloat(String(searchParams.get("weightKg") ?? ""));
  const subtotal = parseFloat(String(searchParams.get("subtotal") ?? ""));
  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return jsonPublico({ error: "Coordenadas inválidas" }, { status: 400 }, request);
  }

  const { locations, shippingTiers, shippingRules } = await obtenerSettingsGeneral();
  if (!locations || locations.length === 0) {
    return jsonPublico({ error: "No hay tiendas registradas" }, { status: 404 }, request);
  }

  // Esta ruta es una estimación; el total final lo fija /api/checkout/quote.
  // Si el cliente no informa el peso, se estima sin tope para no bloquear la vista previa.
  const hasWeight = Number.isFinite(weightKg) && weightKg > 0;
  const result = computeShipping({
    locations, tiers: shippingTiers, rules: shippingRules, lat, lng,
    weightKg: hasWeight ? weightKg : 1,
    subtotal: Number.isFinite(subtotal) ? subtotal : 0,
  });
  if (result.status === "invalid" || !result.store) {
    return jsonPublico({ error: result.message || "No se pudo determinar la tienda más cercana" }, { status: 500 }, request);
  }

  const { store } = result;
  const nearestStore = { nombre: store.nombre, direccion: store.direccion, lat: store.lat, lng: store.lng, radio: store.radio };
  if (store.id) nearestStore.id = store.id;

  const sortedTiers = [...shippingTiers].sort((a, b) => a.km - b.km);
  const availableTiers = sortedTiers.map((tier, idx) => ({
    index: idx,
    fromKm: idx === 0 ? 0 : sortedTiers[idx - 1].km,
    toKm: tier.km,
    price: tier.price,
  }));

  const ok = result.status === "ok";
  const matched = ok ? availableTiers.find((x) => x.toKm === result.tierKm) : null;
  const maxWeightKg = shippingRules.weightBands.length
    ? shippingRules.weightBands[shippingRules.weightBands.length - 1].upToKg
    : shippingRules.maxWeightKg;
  return jsonPublico(
    {
      isInRadius: result.inRadius,
      canShip: result.reason !== "peso_excedido",
      weightKg: hasWeight ? weightKg : null,
      maxWeightKg,
      distance: result.distance,
      maxRadius: result.maxRadiusKm,
      price: ok ? result.price : null,
      listPrice: ok ? result.listPrice : null,
      freeShipping: ok ? result.free : false,
      breakdown: ok ? { base: result.base, weightExtra: result.weightExtra, fuel: result.fuel } : null,
      quoteReason: ok ? null : result.reason,
      tierKm: ok ? result.tierKm : null,
      matchedTier: matched ? { fromKm: matched.fromKm, toKm: matched.toKm, price: matched.price } : null,
      availableTiers,
      nearestStore,
    },
    {},
    request
  );
}
