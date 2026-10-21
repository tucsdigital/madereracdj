/** Resolve a Maps destination without treating absent coordinates as 0,0. */
export function buildMapsUrlFallback({
  explicitMapsUrl,
  lat,
  lng,
  direccion,
  localidad,
} = {}) {
  const mapsUrl = String(explicitMapsUrl || "").trim();
  if (mapsUrl) {
    try {
      const parsed = new URL(mapsUrl);
      const host = parsed.hostname.toLowerCase();
      const isGoogleMaps =
        host === "maps.app.goo.gl" ||
        (host === "goo.gl" && parsed.pathname.startsWith("/maps")) ||
        ((host === "google.com" || host.endsWith(".google.com")) &&
          (parsed.pathname.includes("/maps") || host.startsWith("maps.")));
      if (isGoogleMaps && parsed.protocol === "https:") return parsed.toString();
    } catch {
      // Invalid or non-Maps links fall through to precise coordinates/address.
    }
  }

  const hasCoordinates = [lat, lng].every(
    (value) => value !== null && value !== undefined && String(value).trim() !== "",
  );
  if (hasCoordinates) {
    const latNum = Number(lat);
    const lngNum = Number(lng);
    if (
      Number.isFinite(latNum) &&
      Number.isFinite(lngNum) &&
      Math.abs(latNum) <= 90 &&
      Math.abs(lngNum) <= 180
    ) {
      return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${latNum},${lngNum}`)}`;
    }
  }

  const addressText = [String(direccion || "").trim(), String(localidad || "").trim()]
    .filter(Boolean)
    .join(", ");

  if (!addressText) return undefined;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressText)}`;
}
