import { preflightCorsPublico, jsonPublico } from "@/lib/cors-publico";
import { obtenerSettingsGeneral } from "@/lib/settings";

function distanciaKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function OPTIONS(request) {
  return preflightCorsPublico(request);
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const lat = parseFloat(String(searchParams.get("lat") ?? ""));
  const lng = parseFloat(String(searchParams.get("lng") ?? ""));
  const weightKg = parseFloat(String(searchParams.get("weightKg") ?? ""));
  const maxWeightKg = 100;
  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return jsonPublico({ error: "Coordenadas inválidas" }, { status: 400 }, request);
  }

  const { locations, shippingTiers } = await obtenerSettingsGeneral();
  if (!locations || locations.length === 0) {
    return jsonPublico({ error: "No hay tiendas registradas" }, { status: 404 }, request);
  }

  let masCercana = null;
  let menor = Infinity;
  for (const s of locations) {
    if (!Number.isFinite(s.lat) || !Number.isFinite(s.lng) || !Number.isFinite(s.radio)) continue;
    const d = distanciaKm(lat, lng, s.lat, s.lng);
    if (d < menor) {
      menor = d;
      masCercana = { ...s };
    }
  }

  if (!masCercana) {
    return jsonPublico({ error: "No se pudo determinar la tienda más cercana" }, { status: 500 }, request);
  }

  const distance = Math.round(menor * 100) / 100;
  const maxRadius = masCercana.radio / 1000;
  const isInRadius = distance <= maxRadius;
  const canShip = !(Number.isFinite(weightKg) && weightKg > maxWeightKg);

  const nearestStore = {
    nombre: masCercana.nombre,
    direccion: masCercana.direccion,
    lat: masCercana.lat,
    lng: masCercana.lng,
    radio: masCercana.radio,
  };
  if (masCercana.id) nearestStore.id = masCercana.id;

  const sortedTiers = Array.isArray(shippingTiers)
    ? [...shippingTiers]
        .filter((t) => Number.isFinite(t?.km) && Number.isFinite(t?.price))
        .sort((a, b) => a.km - b.km)
    : [];
  const availableTiers = sortedTiers.map((tier, idx) => ({
    index: idx,
    fromKm: idx === 0 ? 0 : sortedTiers[idx - 1].km,
    toKm: tier.km,
    price: tier.price,
  }));

  let price = null;
  let tierKm = null;
  let matchedTier = null;
  if (sortedTiers.length > 0 && isInRadius && canShip) {
    const found = sortedTiers.find((t) => distance <= t.km);
    if (found && Number.isFinite(found.price)) {
      price = found.price;
      tierKm = found.km;
      const fromKm = availableTiers.find((x) => x.toKm === found.km)?.fromKm ?? 0;
      matchedTier = { fromKm, toKm: found.km, price: found.price };
    }
  }

  return jsonPublico(
    {
      isInRadius,
      canShip,
      weightKg: Number.isFinite(weightKg) ? weightKg : null,
      maxWeightKg,
      distance,
      maxRadius,
      price,
      tierKm,
      matchedTier,
      availableTiers,
      nearestStore,
    },
    {},
    request
  );
}
