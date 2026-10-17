"use client";
import { useEffect, useRef } from "react";

// El listado de Google Places se dibuja fuera del árbol de React: se le da fondo y prioridad para que se lea bien.
export function usePacStyles() {
  useEffect(() => {
    if (document.querySelector('style[data-gmaps-pac="true"]')) return;
    const style = document.createElement("style");
    style.dataset.gmapsPac = "true";
    style.innerHTML = `
      .pac-container { z-index: 2147483647 !important; background: #fff !important; color: #111827 !important;
        border: 1px solid #e5e7eb !important; border-radius: 10px !important; margin-top: 4px;
        box-shadow: 0 10px 30px rgba(0,0,0,.12) !important; font-family: inherit !important; }
      .pac-item { padding: 8px 12px !important; background: #fff !important; border-color: #f3f4f6 !important; cursor: pointer; }
      .pac-item:hover { background: #f3f4f6 !important; }
      .zona-map-label { text-shadow: 0 0 3px #fff, 0 0 3px #fff, 0 0 3px #fff, 0 0 4px #fff; }
    `;
    document.head.appendChild(style);
  }, []);
}

/**
 * Conecta un <input> con el buscador de direcciones de Google (limitado a Argentina).
 * `onPlace` recibe { address, lat, lng }, o null si la dirección elegida no se pudo ubicar.
 */
export function useAddressAutocomplete({ ready, gmaps, input, onPlace, disabled = false }) {
  const callback = useRef(onPlace);
  callback.current = onPlace;
  useEffect(() => {
    if (!ready || !input || disabled) return undefined;
    const Ctor = window.google?.maps?.places?.Autocomplete || gmaps?.places?.Autocomplete;
    if (!Ctor) return undefined;
    const autocomplete = new Ctor(input, {
      types: ["geocode"],
      fields: ["formatted_address", "geometry"],
      componentRestrictions: { country: "ar" },
    });
    const listener = autocomplete.addListener("place_changed", () => {
      const place = autocomplete.getPlace();
      const location = place?.geometry?.location;
      if (!location) {
        callback.current(null);
        return;
      }
      callback.current({ address: place.formatted_address || input.value, lat: location.lat(), lng: location.lng() });
    });
    return () => {
      listener?.remove?.();
      window.google?.maps?.event?.clearInstanceListeners?.(autocomplete);
    };
  }, [ready, gmaps, input, disabled]);
}
