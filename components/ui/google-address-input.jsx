"use client";

import React, { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";

let googleMapsPromise = null;

function loadGoogleMaps() {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (window.google?.maps?.places) return Promise.resolve(window.google.maps);
  if (googleMapsPromise) return googleMapsPromise;

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) return Promise.resolve(null);

  googleMapsPromise = new Promise((resolve) => {
    const existing = document.querySelector(
      "script[data-google-maps-places], script[src*='maps.googleapis.com/maps/api/js']"
    );
    if (existing) {
      const finish = () => {
        if (window.google?.maps?.places) {
          resolve(window.google.maps);
          return;
        }
        googleMapsPromise = null;
        resolve(null);
      };
      existing.addEventListener("load", finish, { once: true });
      if (window.google?.maps?.places) finish();
      return;
    }

    const script = document.createElement("script");
    script.dataset.googleMapsPlaces = "true";
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&language=es&region=AR`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(window.google?.maps || null);
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });

  return googleMapsPromise;
}

export default function GoogleAddressInput({
  value = "",
  onChange,
  placeholder = "Buscar dirección en Google Maps",
  disabled = false,
  className = "",
  id,
}) {
  const inputRef = useRef(null);
  const autocompleteRef = useRef(null);
  const listenerRef = useRef(null);
  const [mapsReady, setMapsReady] = useState(false);

  useEffect(() => {
    let active = true;
    let retryId;
    const initialize = () => {
      loadGoogleMaps().then((maps) => {
        if (active && maps?.places?.Autocomplete) {
          setMapsReady(true);
          return;
        }
        if (active) retryId = window.setTimeout(initialize, 500);
      });
    };
    initialize();
    return () => {
      active = false;
      if (retryId) window.clearTimeout(retryId);
    };
  }, []);

  useEffect(() => {
    if (!mapsReady || !inputRef.current || autocompleteRef.current) return undefined;

    const autocomplete = new window.google.maps.places.Autocomplete(inputRef.current, {
      types: ["address"],
      componentRestrictions: { country: "ar" },
      fields: ["formatted_address", "geometry", "address_components", "url"],
    });

    const listener = autocomplete.addListener("place_changed", () => {
      const place = autocomplete.getPlace();
      const address = place?.formatted_address || inputRef.current?.value || "";
      const location = place?.geometry?.location;
      const lat = location ? location.lat() : null;
      const lng = location ? location.lng() : null;
      const mapsUrl = lat != null && lng != null
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`
        : place?.url || "";
      const locality = place?.address_components?.find((component) =>
        component.types?.includes("locality") || component.types?.includes("administrative_area_level_2")
      )?.long_name || "";

      onChange?.({ address, locality, lat, lng, mapsUrl, place });
    });

    autocompleteRef.current = autocomplete;
    listenerRef.current = listener;

    return () => {
      listenerRef.current?.remove?.();
      listenerRef.current = null;
      autocompleteRef.current = null;
    };
  }, [mapsReady, onChange]);

  return (
    <Input
      ref={inputRef}
      id={id}
      value={value || ""}
      onChange={(event) => onChange?.({ address: event.target.value, locality: "", lat: null, lng: null, mapsUrl: "" })}
      placeholder={placeholder}
      disabled={disabled}
      className={className}
      autoComplete="off"
    />
  );
}
