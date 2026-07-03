"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import GoogleMapReact from "google-map-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const moneyAr = new Intl.NumberFormat("es-AR");
const kmAr = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });

const ZonasEnvioPage = () => {
  const [locations, setLocations] = useState([]);
  const [center, setCenter] = useState([-34.6037, -58.3816]);
  const [zoom, setZoom] = useState(12);
  const [point, setPoint] = useState(null);
  const [latInput, setLatInput] = useState("");
  const [lngInput, setLngInput] = useState("");
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [formMode, setFormMode] = useState("add");
  const [editId, setEditId] = useState(null);
  const [nombre, setNombre] = useState("");
  const [direccion, setDireccion] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [radio, setRadio] = useState("");
  const [gmapsReady, setGmapsReady] = useState(false);
  const autocompleteRef = useRef(null);
  const autocompleteListenersRef = useRef([]);
  const [direccionInputEl, setDireccionInputEl] = useState(null);
  const [gmMap, setGmMap] = useState(null);
  const [gmaps, setGmaps] = useState(null);
  const circlesRef = useRef([]);
  const [visibility, setVisibility] = useState({});
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState("add");
  const [editingIndex, setEditingIndex] = useState(null);
  const [confirmIdx, setConfirmIdx] = useState(null);
  const [shippingTiers, setShippingTiers] = useState([]);
  const [isAddressSelecting, setIsAddressSelecting] = useState(false);
  const [addressError, setAddressError] = useState("");
  const [tiersDirty, setTiersDirty] = useState(false);
  const [tiersError, setTiersError] = useState("");
  const [simDistanceKm, setSimDistanceKm] = useState("");
  const [loadingConfig, setLoadingConfig] = useState(true);

  useEffect(() => {
    let active = true;
    fetch("/api/envios/zonas")
      .then((r) => r.json())
      .then((d) => {
        if (!active) return;
        const locs = Array.isArray(d?.locations) ? d.locations : [];
        setLocations(locs);
        const tiers = Array.isArray(d?.shippingTiers) ? d.shippingTiers : [];
        setShippingTiers(
          tiers.length
            ? tiers.sort((a, b) => a.km - b.km)
            : [
                { km: 20, price: 25000 },
                { km: 30, price: 30000 },
                { km: 40, price: 35000 },
                { km: 50, price: 45000 },
              ]
        );
        if (locs.length > 0) {
          setCenter([locs[0].lat, locs[0].lng]);
          setZoom(12);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoadingConfig(false);
      });
    return () => {
      active = false;
    };
  }, []);

  // Estilos globales para Google Places dentro de modales (z-index + fondo)
  useEffect(() => {
    const exists = document.querySelector('style[data-gmaps-pac="true"]');
    if (exists) return;
    const style = document.createElement("style");
    style.dataset.gmapsPac = "true";
    style.innerHTML = `
      .pac-container {
        position: absolute !important;
        z-index: 2147483647 !important;
        background: rgba(255,255,255,1) !important;
        color: rgba(17,24,39,1) !important;
        border: 1px solid rgba(229,231,235,1) !important;
        box-shadow: 0 10px 30px rgba(0,0,0,.12) !important;
        backdrop-filter: none !important;
        -webkit-backdrop-filter: none !important;
        mix-blend-mode: normal !important;
        pointer-events: auto !important;
      }
      .pac-item {
        padding: 8px 12px !important;
        background: rgba(255,255,255,1) !important;
        border-color: rgba(243,244,246,1) !important;
      }
      .pac-item:hover {
        background: rgba(243,244,246,1) !important;
      }
    `;
    document.head.appendChild(style);
    return () => {
      // no retiramos el estilo para mantener consistencia al navegar
    };
  }, []);

  // Inicializar/rehacer Autocomplete en cada apertura de modal
  useEffect(() => {
    // limpiar anterior
    const destroy = () => {
      try {
        (autocompleteListenersRef.current || []).forEach((l) => l && l.remove && l.remove());
      } catch {}
      autocompleteListenersRef.current = [];
      autocompleteRef.current = null;
    };
    if (!isModalOpen) {
      destroy();
      return;
    }
    if (!gmapsReady || !direccionInputEl) return;
    const AutocompleteCtor = window.google?.maps?.places?.Autocomplete || gmaps?.places?.Autocomplete;
    if (!AutocompleteCtor) return;
    
    try {
      const ac = new AutocompleteCtor(direccionInputEl, {
        types: ["geocode"],
        fields: ["formatted_address", "geometry"],
      });
      
      const listener = ac.addListener("place_changed", () => {
        setIsAddressSelecting(true);
        setAddressError("");
        
        try {
          const place = ac.getPlace();
          
          if (!place || !place.geometry) {
            setAddressError("No se pudo obtener la ubicación. Por favor, intentá de nuevo.");
            setIsAddressSelecting(false);
            return;
          }
          
          if (place?.formatted_address) {
            setDireccion(place.formatted_address);
          }
          
          const loc = place?.geometry?.location;
          if (loc) {
            const la = loc.lat();
            const lo = loc.lng();
            setLat(String(la));
            setLng(String(lo));
            if (gmMap) {
              gmMap.panTo({ lat: la, lng: lo });
            }
          }
          
          setIsAddressSelecting(false);
        } catch (error) {
          console.error("Error al procesar lugar seleccionado:", error);
          setAddressError("Error al procesar la dirección. Por favor, intentá de nuevo.");
          setIsAddressSelecting(false);
        }
      });
      
      autocompleteRef.current = ac;
      autocompleteListenersRef.current = [listener];
    } catch (error) {
      console.error("Error al inicializar autocomplete:", error);
      setAddressError("Error al inicializar el buscador de direcciones.");
    }
    
    return () => destroy();
  }, [isModalOpen, gmapsReady, direccionInputEl, gmaps, gmMap]);

  useEffect(() => {
    if (!gmMap || !gmaps) return;
    circlesRef.current.forEach((o) => {
      o.circle && o.circle.setMap(null);
      o.marker && o.marker.setMap(null);
    });
    circlesRef.current = [];
    (locations || []).forEach((s, idx) => {
      if (!Number.isFinite(s.lat) || !Number.isFinite(s.lng) || !Number.isFinite(s.radio)) return;
      const center = { lat: s.lat, lng: s.lng };
      const isEditing = editingIndex === idx;
      const circle = new gmaps.Circle({
        map: gmMap,
        center,
        radius: s.radio,
        strokeColor: isEditing ? "#3b82f6" : "#22c55e",
        strokeOpacity: 0.85,
        strokeWeight: isEditing ? 3 : 2,
        fillColor: isEditing ? "#3b82f6" : "#22c55e",
        fillOpacity: isEditing ? 0.25 : 0.15,
        clickable: true,
        draggable: !!isEditing,
        editable: !!isEditing,
      });
      const marker = new gmaps.Marker({
        position: center,
        map: gmMap,
        draggable: !!isEditing,
        title: s.nombre || "Sucursal",
        icon: isEditing ? {
          url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Ccircle cx='12' cy='12' r='8' fill='%233b82f6' stroke='white' stroke-width='2'/%3E%3C/svg%3E",
          scaledSize: new gmaps.Size(24, 24),
          anchor: new gmaps.Point(12, 12)
        } : undefined
      });

      const updateFromCircle = () => {
        const c = circle.getCenter();
        const r = circle.getRadius();
        const la = c?.lat();
        const lo = c?.lng();
        if (!Number.isFinite(la) || !Number.isFinite(lo) || !Number.isFinite(r)) return;
        // Durante edición, actualizar UI local sin persistir hasta Guardar
        if (isEditing) {
          setLat(String(la));
          setLng(String(lo));
          setRadio(String(Math.round(r)));
        }
        marker.setPosition({ lat: la, lng: lo });
      };

      const updateFromMarker = () => {
        const pos = marker.getPosition();
        const la = pos?.lat();
        const lo = pos?.lng();
        if (!Number.isFinite(la) || !Number.isFinite(lo)) return;
        circle.setCenter({ lat: la, lng: lo });
        // Durante edición, actualizar UI local sin persistir hasta Guardar
        if (isEditing) {
          setLat(String(la));
          setLng(String(lo));
        }
      };

      if (isEditing) {
        circle.addListener("radius_changed", updateFromCircle);
        circle.addListener("center_changed", updateFromCircle);
        marker.addListener("dragend", updateFromMarker);
      }
      circle.addListener("click", () => {
        beginEdit(s);
        setEditingIndex(idx);
        setModalMode("edit");
        setIsModalOpen(true);
      });
      marker.addListener("click", () => {
        beginEdit(s);
        setEditingIndex(idx);
        setModalMode("edit");
        setIsModalOpen(true);
      });

      circlesRef.current.push({ circle, marker, idx });
    });
  }, [locations, gmMap, gmaps, formMode, editId, editingIndex]);

  const toggleVisibility = (idx) => {
    const v = { ...visibility, [idx]: !visibility[idx] };
    setVisibility(v);
    if (circlesRef.current[idx]) {
      const obj = circlesRef.current[idx];
      const show = !visibility[idx];
      obj.circle && obj.circle.setMap(show ? gmMap : null);
      obj.marker && obj.marker.setMap(show ? gmMap : null);
    }
  };

  const fitAll = () => {
    if (!gmMap || !gmaps) return;
    if (!locations || locations.length === 0) return;
    const bounds = new gmaps.LatLngBounds();
    locations.forEach((s, idx) => {
      if (!Number.isFinite(s.lat) || !Number.isFinite(s.lng)) return;
      const lat = s.lat;
      const lng = s.lng;
      const r = Number.isFinite(s.radio) ? s.radio : 0;
      const dLat = r / 111000;
      const dLng = r / (111000 * Math.cos((lat * Math.PI) / 180) || 1);
      bounds.extend(new gmaps.LatLng(lat + dLat, lng + dLng));
      bounds.extend(new gmaps.LatLng(lat - dLat, lng - dLng));
    });
    if (!bounds.isEmpty()) {
      gmMap.fitBounds(bounds, 50);
    }
  };

  const handleRadiusSlider = (idx, value) => {
    const r = parseFloat(value);
    if (!Number.isFinite(r)) return;
    if (editingIndex !== idx) {
      const loc = locations[idx];
      if (loc) {
        beginEdit(loc);
        setEditingIndex(idx);
        setModalMode("edit");
        setIsModalOpen(true);
      }
      return;
    }
    setRadio(String(r));
    const obj = circlesRef.current[idx];
    if (obj?.circle) obj.circle.setRadius(r);
  };

  const handleUseMyLocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = [pos.coords.latitude, pos.coords.longitude];
        setPoint(p);
        setCenter(p);
        setZoom(13);
        if (gmMap) {
          gmMap.setCenter({ lat: p[0], lng: p[1] });
          gmMap.setZoom(13);
        }
      },
      () => {}
    );
  };

  const handleValidate = async (lat, lng) => {
    setChecking(true);
    setError("");
    setResult(null);
    try {
      const url = `/api/check-delivery-radius?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`;
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || "Error");
      } else {
        setResult(data);
      }
    } catch (e) {
      setError("Error de red");
    } finally {
      setChecking(false);
    }
  };

  const canValidate = useMemo(() => {
    if (point && Number.isFinite(point[0]) && Number.isFinite(point[1])) return true;
    const la = parseFloat(latInput);
    const lo = parseFloat(lngInput);
    return Number.isFinite(la) && Number.isFinite(lo);
  }, [point, latInput, lngInput]);

  const handleValidateClick = () => {
    let la, lo;
    if (point) {
      [la, lo] = point;
    } else {
      la = parseFloat(latInput);
      lo = parseFloat(lngInput);
    }
    if (Number.isFinite(la) && Number.isFinite(lo)) {
      handleValidate(la, lo);
    } else {
      setError("Por favor, ingresá coordenadas válidas o seleccioná un punto en el mapa.");
    }
  };

  const resetForm = () => {
    setFormMode("add");
    setEditId(null);
    setNombre("");
    setDireccion("");
    setLat("");
    setLng("");
    setRadio("");
    setAddressError("");
    setIsAddressSelecting(false);
  };

  const beginEdit = (loc) => {
    setFormMode("edit");
    setEditId(loc.id || null);
    setNombre(loc.nombre || "");
    setDireccion(loc.direccion || "");
    setLat(String(loc.lat ?? ""));
    setLng(String(loc.lng ?? ""));
    setRadio(String(loc.radio ?? ""));
  };

  const generateId = () => {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
    return "store_" + Date.now();
  };

  const saveSettings = async ({ locations: list, shippingTiers: tiers }) => {
    const res = await fetch("/api/envios/zonas", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locations: list, shippingTiers: tiers }),
    });
    const data = await res.json();
    if (!res.ok) {
      const msg = Array.isArray(data?.errores) && data.errores.length > 0
        ? data.errores.join(" · ")
        : data?.error || "No se pudo guardar la configuración";
      throw new Error(msg);
    }
    setLocations(Array.isArray(data?.locations) ? data.locations : []);
    setShippingTiers(Array.isArray(data?.shippingTiers) ? data.shippingTiers : []);
    setTiersDirty(false);
    return data;
  };

  const tierRanges = useMemo(() => {
    const sorted = [...shippingTiers]
      .map((tier) => ({
        km: Number(tier?.km),
        price: Number(tier?.price),
      }))
      .filter((tier) => Number.isFinite(tier.km) && Number.isFinite(tier.price))
      .sort((a, b) => a.km - b.km);
    return sorted.map((tier, idx) => ({
      fromKm: idx === 0 ? 0 : sorted[idx - 1].km,
      toKm: tier.km,
      price: tier.price,
    }));
  }, [shippingTiers]);

  const tierValidationError = useMemo(() => {
    if (shippingTiers.length === 0) return "Debés cargar al menos un tramo de tarifa.";
    for (let i = 0; i < shippingTiers.length; i++) {
      const km = Number(shippingTiers[i]?.km);
      const price = Number(shippingTiers[i]?.price);
      if (!Number.isFinite(km) || km <= 0) return `El tramo ${i + 1} tiene km inválido.`;
      if (!Number.isFinite(price) || price < 0) return `El tramo ${i + 1} tiene precio inválido.`;
      if (i > 0 && km <= Number(shippingTiers[i - 1]?.km)) {
        return "Los km de los tramos deben estar en orden creciente sin repetir.";
      }
    }
    return "";
  }, [shippingTiers]);

  const simulatedTier = useMemo(() => {
    const d = Number(simDistanceKm);
    if (!Number.isFinite(d) || d < 0) return null;
    const found = tierRanges.find((x) => d <= x.toKm);
    if (!found) return null;
    return { ...found, distanceKm: d };
  }, [simDistanceKm, tierRanges]);

  const handleDelete = async (loc) => {
    try {
      setSaving(true);
      const next = locations.filter((l) => l !== loc);
      await saveSettings({ locations: next, shippingTiers });
      if (editId && (loc.id ? loc.id === editId : false)) resetForm();
    } catch (error) {
      setError(error?.message || "No se pudo eliminar la sucursal.");
    } finally {
      setSaving(false);
    }
  };


  const handleSubmit = async () => {
    // Validación mejorada
    const la = parseFloat(lat);
    const lo = parseFloat(lng);
    const r = parseFloat(radio);
    
    if (!Number.isFinite(la) || !Number.isFinite(lo) || !Number.isFinite(r)) {
      setAddressError("Por favor, completá todos los campos con valores válidos.");
      return false;
    }
    
    if (!nombre.trim()) {
      setAddressError("Por favor, ingresá un nombre para la sucursal.");
      return false;
    }
    
    if (!direccion.trim()) {
      setAddressError("Por favor, ingresá una dirección.");
      return false;
    }
    
    const item = {
      nombre: nombre.trim(),
      direccion: direccion.trim(),
      lat: la,
      lng: lo,
      radio: r,
    };
    
    try {
      setSaving(true);
      setAddressError("");
      
      if (formMode === "edit") {
        const next = locations.map((l) => {
          if (editId && l.id && l.id === editId) return { ...item, id: l.id };
          if (!editId && !l.id && l.nombre === nombre && l.direccion === direccion) return { ...item };
          return l;
        });
        await saveSettings({ locations: next, shippingTiers });
      } else {
        const id = generateId();
        const next = [...locations, { ...item, id }];
        await saveSettings({ locations: next, shippingTiers });
      }
      
      resetForm();
      return true;
    } catch (error) {
      console.error("Error al guardar sucursal:", error);
      setAddressError(error?.message || "Error al guardar la sucursal. Por favor, intentá de nuevo.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="text-2xl font-medium text-default-800">Zonas de Entrega</div>
        <div className="flex gap-2">
          {loadingConfig && <Badge variant="outline">Cargando configuración...</Badge>}
          <Button
            onClick={() => {
              resetForm();
              setModalMode("add");
              setEditingIndex(null);
              setIsModalOpen(true);
              setAddressError("");
              setIsAddressSelecting(false);
              setRadio("5000");
            }}
          >
            Nueva sucursal
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle>Mapa de Cobertura</CardTitle>
              <div className="flex gap-2">
                <Button variant="outline" onClick={fitAll}>Ver todas</Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="h-[520px] rounded-md overflow-hidden border border-border">
              <div style={{ height: "100%", width: "100%" }}>
                <GoogleMapReact
                  bootstrapURLKeys={{
                    key: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY,
                    libraries: ["places"],
                  }}
                  yesIWantToUseGoogleMapApiInternals
                  onGoogleApiLoaded={({ map, maps }) => {
                    setGmMap(map);
                    setGmaps(maps);
                    setGmapsReady(true);
                  }}
                  center={{ lat: center[0], lng: center[1] }}
                  zoom={zoom}
                  onClick={({ lat, lng }) => setPoint([lat, lng])}
                  options={{
                    fullscreenControl: false,
                    mapTypeControl: false,
                    streetViewControl: false,
                  }}
                >
                  {point ? (
                    <div
                      lat={point[0]}
                      lng={point[1]}
                      className="w-3 h-3 bg-blue-600 rounded-full border-2 border-white shadow"
                      title="Tu punto seleccionado"
                    />
                  ) : null}
                  {locations.map((s, i) => (
                    <div
                      key={`label_${i}`}
                      lat={s.lat}
                      lng={s.lng}
                      className="px-2 py-1 bg-white/90 backdrop-blur rounded border text-xs shadow whitespace-nowrap"
                      style={{ transform: "translate(-50%, -120%)" }}
                    >
                      {(s.nombre || "Sucursal")}: {(Number(s.radio) / 1000).toFixed(2)} km
                    </div>
                  ))}
                </GoogleMapReact>
              </div>
            </div>
            <div className="flex flex-col md:flex-row gap-3">
              <Button variant="outline" onClick={handleUseMyLocation}>Usar mi ubicación</Button>
              <div className="flex gap-2 w-full md:w-auto">
                <Input 
                  placeholder="Latitud" 
                  value={latInput} 
                  onChange={(e) => {
                    setLatInput(e.target.value);
                    setError("");
                  }}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleValidateClick();
                    }
                  }}
                />
                <Input 
                  placeholder="Longitud" 
                  value={lngInput} 
                  onChange={(e) => {
                    setLngInput(e.target.value);
                    setError("");
                  }}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleValidateClick();
                    }
                  }}
                />
              </div>
              <Button onClick={handleValidateClick} disabled={!canValidate || checking || locations.length === 0}>
                {checking ? "Validando..." : "Validar cobertura"}
              </Button>
            </div>
            {locations.length === 0 && (
              <div className="text-sm text-default-600">
                Cargá al menos una sucursal con radio para habilitar la validación.
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Resultado</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!result && !error && (
              <div className="text-sm text-default-600">Selecciona un punto en el mapa o ingresa lat/lng y valida la cobertura.</div>
            )}
            {error && (
              <div className="text-sm font-medium text-destructive">{error}</div>
            )}
            {result && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  {result.isInRadius ? (
                    <Badge className="bg-emerald-600">Dentro de cobertura</Badge>
                  ) : (
                    <Badge variant="destructive">Fuera de cobertura</Badge>
                  )}
                  <span className="text-sm text-default-700">a {result.distance} km</span>
                </div>
                {result.isInRadius && result.canShip === false && (
                  <div className="text-sm text-destructive">
                    Excede el peso máximo permitido ({result.maxWeightKg} kg)
                  </div>
                )}
                {!!result.price && result.canShip !== false && (
                  <div className="text-sm text-default-800">
                    Tarifa estimada: <span className="font-semibold">${moneyAr.format(Number(result.price) || 0)}</span>{result.tierKm ? ` (hasta ${result.tierKm} km)` : ""}
                  </div>
                )}
                <div className="space-y-1 text-sm">
                  <div className="text-default-700">Cobertura máxima: {result.maxRadius} km</div>
                  {result.nearestStore && (
                    <>
                      <div className="font-medium text-default-800">{result.nearestStore.nombre}</div>
                      <div className="text-default-600">{result.nearestStore.direccion}</div>
                    </>
                  )}
                </div>
                {Array.isArray(result.availableTiers) && result.availableTiers.length > 0 && (
                  <div className="space-y-2 border rounded-md p-3">
                    <div className="text-xs font-semibold text-default-700">Tramos aplicables por distancia</div>
                    <div className="space-y-1">
                      {result.availableTiers.map((tier, idx) => {
                        const isMatch = Number(result.tierKm) === Number(tier.toKm);
                        return (
                          <div
                            key={`${tier.toKm}_${idx}`}
                            className={`text-xs flex items-center justify-between rounded px-2 py-1 ${isMatch ? "bg-emerald-50 border border-emerald-300" : "bg-default-50"}`}
                          >
                            <span>
                              {kmAr.format(Number(tier.fromKm) || 0)} a {kmAr.format(Number(tier.toKm) || 0)} km
                            </span>
                            <span className="font-medium">${moneyAr.format(Number(tier.price) || 0)}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Tarifas por radio</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  const next = [...shippingTiers, { km: 10, price: 10000 }].sort((a, b) => Number(a.km) - Number(b.km));
                  setShippingTiers(next);
                  setTiersDirty(true);
                  setTiersError("");
                }}
              >
                Agregar tramo
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  const next = [...shippingTiers].sort((a, b) => Number(a.km) - Number(b.km));
                  setShippingTiers(next);
                  setTiersDirty(true);
                  setTiersError("");
                }}
              >
                Ordenar por km
              </Button>
              <Button
                onClick={async () => {
                  if (tierValidationError) {
                    setTiersError(tierValidationError);
                    return;
                  }
                  try {
                    setSaving(true);
                    setTiersError("");
                    await saveSettings({ locations, shippingTiers });
                  } catch (e) {
                    setTiersError(e.message || "No se pudieron guardar las tarifas.");
                  } finally {
                    setSaving(false);
                  }
                }}
                disabled={saving || !tiersDirty}
              >
                {saving ? "Guardando..." : "Guardar tarifas"}
              </Button>
            </div>
            {tierValidationError && (
              <div className="text-sm text-destructive">{tierValidationError}</div>
            )}
            {tiersError && (
              <div className="text-sm text-destructive">{tiersError}</div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="border rounded-md p-3">
                <div className="text-xs text-default-600">Tramos cargados</div>
                <div className="text-xl font-semibold">{shippingTiers.length}</div>
              </div>
              <div className="border rounded-md p-3">
                <div className="text-xs text-default-600">Cobertura tarifaria máx.</div>
                <div className="text-xl font-semibold">
                  {tierRanges.length ? `${kmAr.format(tierRanges[tierRanges.length - 1].toKm)} km` : "0 km"}
                </div>
              </div>
              <div className="border rounded-md p-3">
                <div className="text-xs text-default-600">Precio mínimo</div>
                <div className="text-xl font-semibold">
                  ${tierRanges.length ? moneyAr.format(Math.min(...tierRanges.map((x) => Number(x.price) || 0))) : "0"}
                </div>
              </div>
              <div className="border rounded-md p-3">
                <div className="text-xs text-default-600">Precio máximo</div>
                <div className="text-xl font-semibold">
                  ${tierRanges.length ? moneyAr.format(Math.max(...tierRanges.map((x) => Number(x.price) || 0))) : "0"}
                </div>
              </div>
            </div>
            <div className="border rounded-md p-3 space-y-2">
              <div className="text-sm font-medium">Simulador rápido por distancia</div>
              <div className="flex items-center gap-2">
                <Input
                  className="w-40"
                  placeholder="Ej: 12.5"
                  value={simDistanceKm}
                  onChange={(e) => setSimDistanceKm(e.target.value)}
                />
                <span className="text-sm text-default-600">km</span>
                {simulatedTier ? (
                  <Badge className="bg-emerald-600">
                    ${moneyAr.format(Number(simulatedTier.price) || 0)} para {kmAr.format(simulatedTier.distanceKm)} km
                  </Badge>
                ) : (
                  <Badge variant="outline">Sin tramo aplicable</Badge>
                )}
              </div>
            </div>
            <div className="space-y-2">
              {shippingTiers.map((t, i) => (
                <div key={i} className="grid grid-cols-1 md:grid-cols-12 gap-2 border rounded-md p-3">
                  <div className="md:col-span-3 flex items-center gap-2">
                    <span className="text-sm w-14">Desde</span>
                    <div className="text-sm font-medium">
                      {kmAr.format(i === 0 ? 0 : Number(shippingTiers[i - 1]?.km) || 0)} km
                    </div>
                  </div>
                  <div className="md:col-span-3 flex items-center gap-2">
                    <span className="text-sm w-14">Hasta</span>
                    <Input
                      value={t.km}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        const next = shippingTiers
                          .map((x, idx) => (idx === i ? { ...x, km: Number.isFinite(v) ? v : 0 } : x))
                          .sort((a, b) => a.km - b.km);
                        setShippingTiers(next);
                        setTiersDirty(true);
                        setTiersError("");
                      }}
                      className="w-28"
                      placeholder="km"
                    />
                    <span className="text-sm">km</span>
                  </div>
                  <div className="md:col-span-4 flex items-center gap-2">
                    <span className="text-sm w-14">Precio</span>
                    <Input
                      value={t.price}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        const next = shippingTiers.map((x, idx) => (idx === i ? { ...x, price: Number.isFinite(v) ? v : 0 } : x));
                        setShippingTiers(next);
                        setTiersDirty(true);
                        setTiersError("");
                      }}
                      className="w-32"
                      placeholder="precio"
                    />
                    <span className="text-sm text-default-600">${moneyAr.format(Number(t.price) || 0)}</span>
                  </div>
                  <div className="md:col-span-2 flex md:justify-end">
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        const next = shippingTiers.filter((_, idx) => idx !== i);
                        setShippingTiers(next);
                        setTiersDirty(true);
                        setTiersError("");
                      }}
                    >
                      Quitar
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Administrar sucursales</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm text-default-600">
                Gestioná sucursales con el botón “Nueva sucursal” o editá desde la lista.
              </div>
            </div>
            <ScrollArea className="h-[320px]">
              <div className="space-y-2">
                {locations.map((loc, idx) => (
                  <div key={idx} className="flex items-center gap-3 border border-border rounded-md p-3">
                    <div className="flex-1">
                      <div className="font-medium">{loc.nombre || "Sucursal"}</div>
                      <div className="text-sm text-default-600">{loc.direccion}</div>
                      <div className="text-xs text-default-600">Lat: {loc.lat} Lng: {loc.lng} • Radio: {loc.radio} m</div>
                      <div className="flex items-center gap-3 mt-2">
                        <input
                          type="range"
                          min={50}
                          max={50000}
                          step={50}
                          value={Number(loc.radio) || 0}
                          onChange={(e) => handleRadiusSlider(idx, e.target.value)}
                          className="w-56"
                        />
                        <span className="text-xs text-default-700">{(Number(loc.radio) / 1000).toFixed(2)} km</span>
                        <Button variant={visibility[idx] ? "default" : "outline"} size="sm" onClick={() => toggleVisibility(idx)}>
                          {visibility[idx] ? "Ocultar" : "Mostrar"}
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => { setCenter([loc.lat, loc.lng]); gmMap && gmMap.panTo({ lat: loc.lat, lng: loc.lng }); }}>
                          Enfocar
                        </Button>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={() => {
                          beginEdit(loc);
                          setEditingIndex(idx);
                          setModalMode("edit");
                          setIsModalOpen(true);
                        }}
                        disabled={saving}
                      >
                        Editar
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={() => setConfirmIdx(idx)}
                        disabled={saving}
                      >
                        Eliminar
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={isModalOpen}
        onOpenChange={(open) => {
          if (!open && isAddressSelecting) {
            return;
          }
          
          setIsModalOpen(open);
          if (!open) {
            if (modalMode === "edit") {
              // Restablecer círculos al estado guardado si se cancela
              setLocations((prev) => [...prev]);
            }
            setEditingIndex(null);
            resetForm();
            setAddressError("");
            setIsAddressSelecting(false);
          }
        }}
      >
        <DialogContent
          size="md"
          className="!w-[min(92vw,900px)] md:!w-[800px] max-w-none"
          onInteractOutside={(e) => {
            const tgt = e?.target;
            try {
              const isPac =
                (tgt && typeof tgt.closest === "function" && tgt.closest(".pac-container")) ||
                (tgt && tgt.classList && tgt.classList.contains("pac-item"));
              if (isPac) {
                e.preventDefault();
              }
            } catch {}
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {modalMode === "edit" ? "Editar sucursal" : "Nueva sucursal"}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Completa los datos de la sucursal y guarda los cambios.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <div className="text-xs text-default-600">Nombre</div>
              <Input
                placeholder="Ej: Central"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
              />
            </div>
            <div className="space-y-1 md:col-span-1">
              <div className="text-xs text-default-600 flex items-center gap-1">
                Dirección
                {gmapsReady && (
                  <span className="text-xs text-emerald-600">✓ Buscador activo</span>
                )}
              </div>
              <div className="relative">
                <Input
                  placeholder="Buscar en Google Maps (comenzá a escribir...)"
                  value={direccion}
                  onChange={(e) => {
                    setDireccion(e.target.value);
                    setAddressError("");
                  }}
                  ref={setDireccionInputEl}
                  disabled={isAddressSelecting || !gmapsReady}
                  className={addressError ? "border-destructive" : gmapsReady ? "border-emerald-300 focus:border-emerald-500" : ""}
                />
                {isAddressSelecting && (
                  <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                    <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                  </div>
                )}
                {!gmapsReady && !isAddressSelecting && (
                  <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                    <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                  </div>
                )}
              </div>
              {addressError && (
                <div className="text-xs text-destructive">{addressError}</div>
              )}
              {gmapsReady && !addressError && (
                <div className="text-xs text-emerald-600">Comenzá a escribir y seleccioná una dirección del listado</div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 md:col-span-2">
              <div className="space-y-1">
                <div className="text-xs text-default-600">Latitud</div>
                <Input
                  placeholder="-34.6037"
                  value={lat}
                  onChange={(e) => setLat(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <div className="text-xs text-default-600">Longitud</div>
                <Input
                  placeholder="-58.3816"
                  value={lng}
                  onChange={(e) => setLng(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2 md:col-span-2">
              <div className="flex items-center justify-between">
                <div className="text-xs text-default-600">Radio</div>
                <div className="text-xs text-default-700">
                  {(Number(radio) / 1000).toFixed(2)} km
                </div>
              </div>
              <input
                type="range"
                min={50}
                max={50000}
                step={50}
                value={Number(radio) || 0}
                onChange={(e) => setRadio(e.target.value)}
                className="w-full"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button 
              variant="outline" 
              onClick={() => setIsModalOpen(false)} 
              disabled={saving || isAddressSelecting}
            >
              Cancelar
            </Button>
            <Button
              onClick={async () => {
                const ok = await handleSubmit();
                if (ok) {
                  setIsModalOpen(false);
                  setEditingIndex(null);
                }
              }}
              disabled={saving || isAddressSelecting}
            >
              {saving ? "Guardando..." : modalMode === "edit" ? "Guardar cambios" : "Crear sucursal"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmIdx != null} onOpenChange={(open) => !open && setConfirmIdx(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar sucursal</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. ¿Confirmás eliminar esta sucursal?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                const idx = confirmIdx;
                setConfirmIdx(null);
                if (idx != null && locations[idx]) {
                  await handleDelete(locations[idx]);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ZonasEnvioPage;
