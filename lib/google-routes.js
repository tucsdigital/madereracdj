const ROUTE_CACHE_TTL_MS = 5 * 60 * 1000;
const routeCache = new Map();

const routeError = (message, status = 503) => Object.assign(new Error(message), { status });
const coordinate = (value) => Math.round(Number(value) * 1e5) / 1e5;

function routeCacheKey(origin, destination) {
  return `${coordinate(origin.lat)},${coordinate(origin.lng)}>${coordinate(destination.lat)},${coordinate(destination.lng)}`;
}

async function drivingDistanceMeters(origin, destination) {
  const key = routeCacheKey(origin, destination);
  const cached = routeCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.promise;
  if (cached) routeCache.delete(key);

  const promise = (async () => {
    const apiKey = String(process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "").trim();
    if (!apiKey) throw routeError("No está configurada la clave de Google Routes API para calcular la distancia por automóvil.");
    const response = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "routes.distanceMeters",
      },
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: Number(origin.lat), longitude: Number(origin.lng) } } },
        destination: { location: { latLng: { latitude: Number(destination.lat), longitude: Number(destination.lng) } } },
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_UNAWARE",
        units: "METRIC",
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      const details = await response.json().catch(() => ({}));
      console.error("Google Routes API respondió con error:", response.status, details?.error?.status || "");
      throw routeError("No pudimos calcular la distancia por ruta de automóvil. Intentá nuevamente en unos minutos.");
    }
    const data = await response.json();
    const meters = Number(data?.routes?.[0]?.distanceMeters);
    if (!Number.isFinite(meters) || meters < 0) throw routeError("Google Maps no encontró una ruta de automóvil para esta dirección.", 422);
    return meters;
  })();

  routeCache.set(key, { expiresAt: Date.now() + ROUTE_CACHE_TTL_MS, promise });
  if (routeCache.size > 500) {
    for (const [cacheKey, entry] of routeCache) if (entry.expiresAt <= Date.now()) routeCache.delete(cacheKey);
    if (routeCache.size > 500) routeCache.delete(routeCache.keys().next().value);
  }
  try {
    return await promise;
  } catch (error) {
    routeCache.delete(key);
    throw error;
  }
}

/** Distancia de automóvil en km, indexada por el id de cada sucursal. */
export async function getDrivingDistances({ locations = [], lat, lng }) {
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    throw routeError("Coordenadas inválidas para calcular la ruta.", 400);
  }
  const valid = locations.filter((store) => Number.isFinite(Number(store?.lat)) && Number.isFinite(Number(store?.lng)));
  if (!valid.length) return {};
  const pairs = await Promise.all(valid.map(async (store, index) => {
    const meters = await drivingDistanceMeters(store, { lat: latitude, lng: longitude });
    return [String(store.id || `store_${index + 1}`), Math.round((meters / 1000 + Number.EPSILON) * 100) / 100];
  }));
  return Object.fromEntries(pairs);
}
