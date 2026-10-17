"use client";
import { useEffect, useState } from "react";
import { ArrowLeft, MapPin, MoreHorizontal, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { shippingIssues } from "@/lib/shipping";
import { inlineIssues, kmLabel, kmToMeters, metersToKm } from "@/lib/envios-ui";
import { Btn, Chip, Field, UnitInput, inputClass, inputErrorClass } from "@/components/panel-ui/ui";
import { useAddressAutocomplete } from "./places";

/** Lista de sucursales cargadas (reemplaza al antiguo panel "Resultado"). */
export function SucursalesList({ locations, selectedId, problems, onSelect, onAdd, onEdit, onFocus, onDelete }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-3 px-5 pb-3 pt-5">
        <div>
          <h2 className="text-base font-semibold">Sucursales</h2>
          <p className="text-sm text-default-500">{locations.length === 0 ? "Desde dónde se entrega" : `${locations.length} cargada${locations.length === 1 ? "" : "s"}`}</p>
        </div>
        <Btn size="sm" onClick={onAdd}><Plus className="h-4 w-4" /> Agregar</Btn>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 pb-3">
        {locations.length === 0 ? (
          <div className="mx-2 mt-2 rounded-xl border border-dashed border-default-300 px-5 py-10 text-center">
            <MapPin className="mx-auto h-6 w-6 text-default-400" />
            <p className="mt-3 font-medium">Todavía no hay sucursales</p>
            <p className="mt-1 text-sm text-default-500">Agregá la primera para empezar a calcular zonas y envíos.</p>
            <Btn variant="primary" className="mt-4" onClick={onAdd}>Agregar sucursal</Btn>
          </div>
        ) : (
          locations.map((loc, index) => {
            const selected = loc.id === selectedId;
            return (
              <div key={loc.id} className={cn("group flex items-start gap-1 rounded-xl border p-1 transition", selected ? "border-primary bg-primary/5" : "border-border bg-card hover:bg-default-50")}>
                <button type="button" onClick={() => onSelect(loc.id)} className="min-w-0 flex-1 rounded-lg p-3 text-left">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{loc.nombre || "Sin nombre"}</span>
                    {problems[index] > 0 && <Chip tone="bad">Revisar</Chip>}
                  </div>
                  <p className="mt-0.5 truncate text-sm text-default-500">{loc.direccion || "Sin dirección"}</p>
                  <p className="mt-2 text-xs text-default-500">Cubre hasta {kmLabel(metersToKm(loc.radio))}</p>
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button type="button" aria-label={`Acciones de ${loc.nombre || "la sucursal"}`} className="mt-2 mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-default-500 hover:bg-default-100">
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuItem onSelect={() => onEdit(loc.id)}>Editar</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => onFocus(loc.id)}>Ver en el mapa</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => onDelete(loc.id)}>Eliminar</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

/** Alta y edición de una sucursal. Mientras se edita, el mapa muestra el círculo en vivo. */
export function SucursalForm({ draft, isNew, mapsReady, gmaps, onChange, onLocate, onDone, onCancel, onDelete }) {
  const [addressEl, setAddressEl] = useState(null);
  const [attempted, setAttempted] = useState(false);
  const [message, setMessage] = useState("");

  useAddressAutocomplete({
    ready: mapsReady,
    gmaps,
    input: addressEl,
    onPlace: (place) => {
      if (!place) { setMessage("No se pudo ubicar esa dirección. Probá con otra."); return; }
      setMessage("");
      onChange({ direccion: place.address, lat: place.lat, lng: place.lng });
      onLocate?.(place.lat, place.lng);
    },
  });

  const issues = shippingIssues({ locations: [{ ...draft }] });
  const errors = attempted ? inlineIssues(issues, "sucursales", 0) : {};
  const hasCoords = String(draft.lat ?? "").trim() !== "" && String(draft.lng ?? "").trim() !== "";
  const radioKm = metersToKm(draft.radio);

  // El texto del campo de km se conserva tal cual se escribe ("2," mientras se tipea); se actualiza si cambia desde el deslizador o el mapa.
  const parseKm = (text) => parseFloat(String(text).replace(",", "."));
  const [kmText, setKmText] = useState(radioKm ? String(radioKm).replace(".", ",") : "");
  useEffect(() => {
    if (parseKm(kmText) !== radioKm) setKmText(radioKm ? String(radioKm).replace(".", ",") : "");
  }, [radioKm]); // eslint-disable-line react-hooks/exhaustive-deps

  const done = () => {
    setAttempted(true);
    if (issues.length) return;
    onDone();
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-3">
        <button type="button" onClick={onCancel} aria-label="Volver a la lista" className="flex h-8 w-8 items-center justify-center rounded-lg text-default-600 hover:bg-default-100">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h2 className="text-base font-semibold">{isNew ? "Nueva sucursal" : "Editar sucursal"}</h2>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
        <Field label="Nombre" error={errors.nombre} htmlFor="suc-nombre">
          <input id="suc-nombre" className={cn(inputClass, errors.nombre && inputErrorClass)} value={draft.nombre} placeholder="Ej.: Central" onChange={(e) => onChange({ nombre: e.target.value })} />
        </Field>

        <Field
          label="Dirección"
          htmlFor="suc-direccion"
          error={errors.direccion || message}
          hint={mapsReady ? (hasCoords ? "Ubicada en el mapa." : "Escribí y elegí la dirección de la lista para ubicarla en el mapa.") : undefined}
        >
          <input
            id="suc-direccion"
            ref={setAddressEl}
            className={cn(inputClass, (errors.direccion || message) && inputErrorClass)}
            value={draft.direccion}
            placeholder="Buscar dirección…"
            autoComplete="off"
            onChange={(e) => onChange(mapsReady ? { direccion: e.target.value, lat: "", lng: "" } : { direccion: e.target.value })}
          />
        </Field>

        <Field label="Radio de cobertura" error={errors.radio} htmlFor="suc-radio">
          <div className="flex items-center gap-3">
            <input
              type="range" min={0.5} max={50} step={0.5} value={Math.min(50, Math.max(0.5, radioKm || 0.5))}
              onChange={(e) => onChange({ radio: kmToMeters(e.target.value) })}
              className="h-2 flex-1 cursor-pointer accent-primary" aria-label="Radio de cobertura en kilómetros"
            />
            <UnitInput id="suc-radio" suffix="km" className="w-28" invalid={Boolean(errors.radio)}
              value={kmText} placeholder="5"
              onChange={(e) => {
                setKmText(e.target.value);
                const km = parseKm(e.target.value);
                onChange({ radio: Number.isFinite(km) ? kmToMeters(km) : "" });
              }} />
          </div>
          <p className="mt-1 text-xs text-default-500">Hasta dónde llega esta sucursal. También podés estirar el círculo en el mapa.</p>
        </Field>

        <details className="rounded-lg border border-border px-4 py-3 text-sm" open={!mapsReady || undefined}>
          <summary className="cursor-pointer font-medium">Más opciones</summary>
          <p className="mt-2 text-xs text-default-500">Las coordenadas se completan solas al elegir la dirección. Cargalas a mano solo si no podés usar el buscador.</p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Field label="Latitud" htmlFor="suc-lat">
              <input id="suc-lat" className={inputClass} inputMode="decimal" value={draft.lat} placeholder="-34.6037" onChange={(e) => onChange({ lat: e.target.value })} />
            </Field>
            <Field label="Longitud" htmlFor="suc-lng">
              <input id="suc-lng" className={inputClass} inputMode="decimal" value={draft.lng} placeholder="-58.3816" onChange={(e) => onChange({ lng: e.target.value })} />
            </Field>
          </div>
        </details>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border px-5 py-3">
        {onDelete ? <Btn variant="danger" size="sm" onClick={onDelete}>Eliminar</Btn> : <span />}
        <div className="flex gap-2">
          <Btn variant="ghost" onClick={onCancel}>Cancelar</Btn>
          <Btn variant="primary" onClick={done}>Listo</Btn>
        </div>
      </div>
    </div>
  );
}
