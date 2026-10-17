"use client";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import GoogleMapReact from "google-map-react";
import { LocateFixed, Maximize2, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAddressAutocomplete } from "./places";

const DEFAULT_CENTER = { lat: -34.6037, lng: -58.3816 };
const COLORS = { store: "#10b981", selected: "#6d5ae6", pin: "#111827" };
const MAP_STYLES = [
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
];
const TONE = { ok: "bg-emerald-500", warn: "bg-amber-500", bad: "bg-red-500" };

const dotIcon = (gmaps, color) => ({
  url: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24'><circle cx='12' cy='12' r='7.5' fill='${color}' stroke='white' stroke-width='3'/></svg>`)}`,
  scaledSize: new gmaps.Size(24, 24),
  anchor: new gmaps.Point(12, 12),
  labelOrigin: new gmaps.Point(12, -9),
});
const storeLabel = (name) => ({ text: String(name || "Sucursal"), color: "#111827", fontSize: "12px", fontWeight: "600", className: "zona-map-label" });

const boundsOf = (gmaps, locations) => {
  const bounds = new gmaps.LatLngBounds();
  locations.forEach((s) => {
    const dLat = (s.radio || 0) / 111000;
    const dLng = (s.radio || 0) / (111000 * Math.cos((s.lat * Math.PI) / 180) || 1);
    bounds.extend(new gmaps.LatLng(s.lat + dLat, s.lng + dLng));
    bounds.extend(new gmaps.LatLng(s.lat - dLat, s.lng - dLng));
  });
  return bounds;
};

/**
 * Mapa de cobertura. Dibuja las sucursales (círculo suave + punto), resalta la elegida, muestra el pin de prueba
 * y, al editar, un círculo que se puede arrastrar y estirar. Toda la lógica de Google Maps queda acá adentro.
 *
 * Props de datos: `locations` (numéricas), `selectedId`, `draft` ({ key, id, lat, lng, radio }), `pin` ({ lat, lng }),
 * `message` ({ tone, title, detail }). Eventos: `onSelect`, `onPick`, `onDraftChange`, `onClearPin`, `onReady`.
 */
const CoverageMap = forwardRef(function CoverageMap(
  { locations, selectedId, draft, pin, message, onSelect, onPick, onDraftChange, onClearPin, onReady, className },
  ref
) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const [maps, setMaps] = useState(null);
  const [searchEl, setSearchEl] = useState(null);
  const [searchText, setSearchText] = useState("");
  const [locating, setLocating] = useState(false);
  const callbacks = useRef({});
  callbacks.current = { onSelect, onPick, onDraftChange };
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const draftLayer = useRef(null);
  const fitted = useRef(false);

  const draftId = draft?.id ?? null;
  const draftKey = draft ? draft.key : null;
  const hasDraftCoords = Boolean(draft) && Number.isFinite(draft.lat) && Number.isFinite(draft.lng);
  const editing = Boolean(draft);

  const fitAll = () => {
    if (!maps || !locations.length) return;
    maps.map.fitBounds(boundsOf(maps.gmaps, locations), 60);
  };

  useImperativeHandle(ref, () => ({
    fitAll,
    focus(location) {
      if (!maps || !location) return;
      maps.map.fitBounds(boundsOf(maps.gmaps, [location]), 40);
    },
    panTo(lat, lng, zoom) {
      if (!maps) return;
      maps.map.panTo({ lat, lng });
      if (zoom && maps.map.getZoom() < zoom) maps.map.setZoom(zoom);
    },
    reverseGeocode(lat, lng) {
      if (!maps) return Promise.resolve(null);
      return new Promise((resolve) => {
        new maps.gmaps.Geocoder().geocode({ location: { lat, lng } }, (results, status) => {
          resolve(status === "OK" && results?.[0] ? results[0].formatted_address : null);
        });
      });
    },
  }));

  // Encuadra todas las sucursales la primera vez que hay mapa y datos.
  useEffect(() => {
    if (!maps || fitted.current || !locations.length) return;
    fitted.current = true;
    maps.map.fitBounds(boundsOf(maps.gmaps, locations), 60);
  }, [maps, locations]);

  // Sucursales guardadas: círculo suave + punto. La que se está editando la dibuja la capa del borrador.
  useEffect(() => {
    if (!maps) return undefined;
    const { map, gmaps } = maps;
    const created = [];
    locations.forEach((loc) => {
      if (loc.id === draftId) return;
      const selected = loc.id === selectedId;
      const color = selected ? COLORS.selected : COLORS.store;
      const center = { lat: loc.lat, lng: loc.lng };
      created.push(
        new gmaps.Circle({
          map, center, radius: loc.radio, clickable: false,
          strokeColor: color, strokeOpacity: selected ? 0.9 : 0.55, strokeWeight: selected ? 2.5 : 1.5,
          fillColor: color, fillOpacity: selected ? 0.18 : 0.1,
        })
      );
      const marker = new gmaps.Marker({ map, position: center, title: loc.nombre, icon: dotIcon(gmaps, color), label: storeLabel(loc.nombre), zIndex: selected ? 3 : 2 });
      marker.addListener("click", () => callbacks.current.onSelect?.(loc.id));
      created.push(marker);
    });
    return () => created.forEach((o) => o.setMap(null));
  }, [maps, locations, selectedId, draftId]);

  // Borrador de la sucursal que se está editando: se puede arrastrar y estirar desde el mapa.
  useEffect(() => {
    if (!maps || !draftKey || !hasDraftCoords) return undefined;
    const { map, gmaps } = maps;
    const d = draftRef.current;
    const center = { lat: d.lat, lng: d.lng };
    const circle = new gmaps.Circle({
      map, center, radius: d.radio > 0 ? d.radio : 1000, clickable: true, draggable: true, editable: true,
      strokeColor: COLORS.selected, strokeOpacity: 0.95, strokeWeight: 2.5, fillColor: COLORS.selected, fillOpacity: 0.2,
    });
    const marker = new gmaps.Marker({ map, position: center, draggable: true, icon: dotIcon(gmaps, COLORS.selected), zIndex: 5 });
    const emit = () => {
      const c = circle.getCenter();
      callbacks.current.onDraftChange?.({ lat: c.lat(), lng: c.lng(), radio: Math.round(circle.getRadius()) });
    };
    circle.addListener("radius_changed", emit);
    circle.addListener("center_changed", () => { marker.setPosition(circle.getCenter()); emit(); });
    marker.addListener("dragend", () => circle.setCenter(marker.getPosition()));
    draftLayer.current = { circle, marker };
    return () => {
      circle.setMap(null);
      marker.setMap(null);
      draftLayer.current = null;
    };
  }, [maps, draftKey, hasDraftCoords]);

  // Mantiene el círculo del borrador alineado con lo que se escribe en el formulario.
  useEffect(() => {
    const layer = draftLayer.current;
    if (!layer || !draft) return;
    const center = layer.circle.getCenter();
    if (Number.isFinite(draft.lat) && Number.isFinite(draft.lng) && (Math.abs(center.lat() - draft.lat) > 1e-7 || Math.abs(center.lng() - draft.lng) > 1e-7)) {
      layer.circle.setCenter({ lat: draft.lat, lng: draft.lng });
    }
    if (draft.radio > 0 && Math.abs(layer.circle.getRadius() - draft.radio) > 1) layer.circle.setRadius(draft.radio);
  }, [draft?.lat, draft?.lng, draft?.radio]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pin de prueba (arrastrable para afinar la dirección).
  useEffect(() => {
    if (!maps || !pin) return undefined;
    const { map, gmaps } = maps;
    const marker = new gmaps.Marker({ map, position: { lat: pin.lat, lng: pin.lng }, draggable: true, icon: dotIcon(gmaps, COLORS.pin), zIndex: 9 });
    marker.addListener("dragend", () => {
      const p = marker.getPosition();
      callbacks.current.onPick?.(p.lat(), p.lng());
    });
    return () => marker.setMap(null);
  }, [maps, pin?.lat, pin?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  useAddressAutocomplete({
    ready: Boolean(maps),
    gmaps: maps?.gmaps,
    input: searchEl,
    disabled: editing,
    onPlace: (place) => {
      if (!place) return;
      setSearchText(place.address);
      maps.map.panTo({ lat: place.lat, lng: place.lng });
      if (maps.map.getZoom() < 13) maps.map.setZoom(13);
      callbacks.current.onPick?.(place.lat, place.lng);
    },
  });

  const locate = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        maps?.map.panTo({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        callbacks.current.onPick?.(pos.coords.latitude, pos.coords.longitude);
      },
      () => setLocating(false)
    );
  };

  if (!apiKey) {
    return (
      <div className={cn("flex items-center justify-center rounded-xl border border-dashed border-default-300 bg-default-50 p-6 text-center text-sm text-default-500", className)}>
        El mapa no está disponible porque falta configurar Google Maps en el servidor. Podés seguir cargando sucursales con sus coordenadas desde “Más opciones”.
      </div>
    );
  }

  return (
    <div className={cn("relative overflow-hidden rounded-xl border border-border bg-default-100", className)}>
      <GoogleMapReact
        bootstrapURLKeys={{ key: apiKey, libraries: ["places"], language: "es", region: "AR" }}
        yesIWantToUseGoogleMapApiInternals
        defaultCenter={DEFAULT_CENTER}
        defaultZoom={11}
        options={{ fullscreenControl: false, mapTypeControl: false, streetViewControl: false, clickableIcons: false, gestureHandling: "cooperative", styles: MAP_STYLES }}
        onGoogleApiLoaded={({ map, maps: gmaps }) => {
          const api = { map, gmaps };
          setMaps(api);
          onReady?.(api);
        }}
        onClick={({ lat, lng }) => callbacks.current.onPick?.(lat, lng)}
      />

      {!editing && (
        <div className="absolute left-3 right-28 top-3 max-w-sm">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-default-400" />
            <input
              ref={setSearchEl}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Buscar una dirección para ver si llegamos"
              className="h-10 w-full rounded-lg border border-border bg-card pl-9 pr-9 text-sm shadow-md outline-none focus:border-primary"
            />
            {(searchText || pin) && (
              <button type="button" aria-label="Quitar la dirección" className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-default-400 hover:text-default-700"
                onClick={() => { setSearchText(""); onClearPin?.(); }}>
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      )}
      {editing && (
        <div className="absolute left-3 top-3 rounded-lg bg-card px-3 py-2 text-sm shadow-md">
          Hacé clic en el mapa para mover la sucursal, o arrastrá el círculo.
        </div>
      )}

      <div className="absolute right-3 top-3 flex gap-2">
        <button type="button" title="Ver todas las sucursales" aria-label="Ver todas las sucursales" onClick={fitAll}
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-card shadow-md hover:bg-default-100">
          <Maximize2 className="h-4 w-4" />
        </button>
        <button type="button" title="Usar mi ubicación" aria-label="Usar mi ubicación" onClick={locate} disabled={locating}
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-card shadow-md hover:bg-default-100 disabled:opacity-50">
          <LocateFixed className="h-4 w-4" />
        </button>
      </div>

      {message && !editing && (
        <div className="absolute bottom-6 left-3 right-14 max-w-sm rounded-xl border border-border bg-card p-3.5 shadow-lg" role="status">
          <div className="flex items-start gap-3">
            <span className={cn("mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full", TONE[message.tone])} />
            <div className="min-w-0">
              <p className="text-sm font-semibold">{message.title}</p>
              <p className="text-sm text-default-500">{message.detail}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

export default CoverageMap;
