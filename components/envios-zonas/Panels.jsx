"use client";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Btn, Field, Segmented, UnitInput } from "@/components/panel-ui/ui";
import { Switch } from "@/components/ui/switch";
import { computeShipping, priceForDistance } from "@/lib/shipping";
import { describeQuote, inlineIssues, kmLabel, numericLocations, numericTiers, sortTiers, tarifasResumen } from "@/lib/envios-ui";

const toNum = (v) => {
  const n = parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

function Callout({ tone = "warn", children }) {
  const tones = { warn: "bg-amber-50 text-amber-900", bad: "bg-red-50 text-red-900" };
  return <div className={cn("rounded-lg px-4 py-3 text-sm", tones[tone])}>{children}</div>;
}

/* ───────────────────────────── Tarifas ───────────────────────────── */

export function TarifasPanel({ tiers, warnings, issues, onChange }) {
  const update = (index, patch) => onChange(tiers.map((t, i) => (i === index ? { ...t, ...patch } : t)));
  const add = () => {
    const last = sortTiers(tiers).filter((t) => toNum(t.km) !== null).pop();
    onChange([...tiers, { km: last ? String((toNum(last.km) || 0) + 10) : "10", price: last?.price ?? "" }]);
  };
  const remove = (index) => onChange(tiers.filter((_, i) => i !== index));
  const fromKm = (index) => {
    if (index === 0) return 0;
    const prev = toNum(tiers[index - 1]?.km);
    const current = toNum(tiers[index]?.km);
    return prev !== null && current !== null && prev < current ? prev : null;
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold">Cuánto cuesta el envío según la distancia</h3>
        <p className="mt-0.5 text-sm text-default-500">{tarifasResumen(tiers)}</p>
      </div>
      {warnings.length > 0 && (
        <Callout>
          {warnings.map((w) => <p key={w}>{w}</p>)}
        </Callout>
      )}

      {tiers.length === 0 ? (
        <div className="rounded-xl border border-dashed border-default-300 px-6 py-10 text-center">
          <p className="font-medium">Todavía no hay tarifas</p>
          <p className="mt-1 text-sm text-default-500">Mientras tanto, todos los envíos se cotizan aparte.</p>
          <Btn variant="primary" className="mt-4" onClick={add}>Agregar el primer tramo</Btn>
        </div>
      ) : (
        <div className="space-y-2">
          {tiers.map((tier, index) => {
            const errors = inlineIssues(issues, "tarifas", index);
            const from = fromKm(index);
            return (
              <div key={index} className="grid grid-cols-[1fr_1fr_auto] items-start gap-3 rounded-xl border border-border bg-card p-3 sm:grid-cols-[110px_1fr_1fr_auto] sm:items-center">
                <span className="hidden text-sm text-default-500 sm:block">{from === null ? "" : `De ${kmLabel(from)} a`}</span>
                <Field error={errors.km}>
                  <UnitInput suffix="km" placeholder="Hasta" aria-label="Hasta cuántos kilómetros" invalid={Boolean(errors.km)}
                    value={tier.km} onChange={(e) => update(index, { km: e.target.value })} onBlur={() => onChange(sortTiers(tiers))} />
                </Field>
                <Field error={errors.price}>
                  <UnitInput prefix="$" placeholder="Precio" aria-label="Precio del envío" invalid={Boolean(errors.price)}
                    value={tier.price} onChange={(e) => update(index, { price: e.target.value })} />
                </Field>
                <button type="button" aria-label="Quitar tramo" onClick={() => remove(index)}
                  className="mt-1 flex h-8 w-8 items-center justify-center rounded-lg text-default-500 hover:bg-red-50 hover:text-destructive">
                  <X className="h-4 w-4" />
                </button>
              </div>
            );
          })}
          <button type="button" onClick={add}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-default-300 py-3 text-sm font-medium text-default-600 transition hover:bg-default-50">
            <Plus className="h-4 w-4" /> Agregar tramo
          </button>
        </div>
      )}
    </div>
  );
}

/* ───────────────────────────── Reglas ───────────────────────────── */

function Setting({ title, description, children, last }) {
  return (
    <div className={cn("grid gap-3 py-5 sm:grid-cols-[1fr_minmax(0,320px)] sm:gap-8", !last && "border-b border-border")}>
      <div>
        <h4 className="text-sm font-semibold">{title}</h4>
        <p className="mt-0.5 text-sm text-default-500">{description}</p>
      </div>
      <div>{children}</div>
    </div>
  );
}

export function ReglasPanel({ rules, issues, onChange }) {
  const bands = rules.weightBands || [];
  const mode = bands.length > 0 ? "franjas" : "unico";
  const field = (key) => issues.find((i) => i.scope === "reglas" && i.index === null && i.field === key)?.message;
  const updateBand = (index, patch) => onChange({ weightBands: bands.map((b, i) => (i === index ? { ...b, ...patch } : b)) });

  const switchMode = (next) => {
    if (next === mode) return;
    if (next === "franjas") onChange({ weightBands: [{ upToKg: String(rules.maxWeightKg || 100), extra: "0" }] });
    else onChange({ maxWeightKg: String(toNum(bands[bands.length - 1]?.upToKg) || 100), weightBands: [] });
  };

  return (
    <div>
      <Setting title="Envío gratis" description="Desde qué monto de compra no se cobra el envío.">
        <Field error={field("freeShippingMin")} hint="Dejalo en 0 si no querés ofrecer envío gratis.">
          <UnitInput prefix="$" aria-label="Monto desde el que el envío es gratis" invalid={Boolean(field("freeShippingMin"))}
            value={rules.freeShippingMin} onChange={(e) => onChange({ freeShippingMin: e.target.value })} />
        </Field>
      </Setting>

      <Setting title="Envío mínimo" description="Lo menos que se cobra por un envío, aunque la tarifa por distancia sea menor.">
        <Field error={field("minFee")}>
          <UnitInput prefix="$" aria-label="Envío mínimo" invalid={Boolean(field("minFee"))}
            value={rules.minFee} onChange={(e) => onChange({ minFee: e.target.value })} />
        </Field>
      </Setting>

      <Setting title="Recargo por combustible" description="Un porcentaje que se suma a la tarifa.">
        <Field error={field("fuelSurchargePct")}>
          <UnitInput suffix="%" aria-label="Recargo por combustible" invalid={Boolean(field("fuelSurchargePct"))}
            value={rules.fuelSurchargePct} onChange={(e) => onChange({ fuelSurchargePct: e.target.value })} />
        </Field>
      </Setting>

      <Setting last title="Peso del pedido" description="Hasta qué peso se hace el envío. Si el pedido pesa más, se cotiza aparte.">
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-default-50 p-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">Exigir peso para calcular el envío</p>
              <p className="mt-0.5 text-xs leading-5 text-default-500">Desactivado: si falta el peso de algún producto, se usa la tarifa por distancia sin adicional por peso.</p>
            </div>
            <Switch checked={rules.requireWeightForShipping === true} onCheckedChange={(value) => onChange({ requireWeightForShipping: value })} aria-label="Exigir peso para calcular el envío" />
          </div>
          <Segmented value={mode} onChange={switchMode} options={[{ value: "unico", label: "Un máximo" }, { value: "franjas", label: "Por franjas" }]} />
          {mode === "unico" ? (
            <Field error={field("maxWeightKg")} label="Peso máximo">
              <UnitInput suffix="kg" aria-label="Peso máximo" invalid={Boolean(field("maxWeightKg"))}
                value={rules.maxWeightKg} onChange={(e) => onChange({ maxWeightKg: e.target.value })} />
            </Field>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-default-500">Cada franja puede sumar un adicional al precio.</p>
              {bands.map((band, index) => {
                const errors = inlineIssues(issues, "reglas", index);
                return (
                  <div key={index} className="grid grid-cols-[1fr_1fr_auto] items-start gap-2">
                    <Field error={errors.upToKg}>
                      <UnitInput suffix="kg" aria-label="Hasta cuántos kilos" placeholder="Hasta" invalid={Boolean(errors.upToKg)}
                        value={band.upToKg} onChange={(e) => updateBand(index, { upToKg: e.target.value })} />
                    </Field>
                    <Field error={errors.extra}>
                      <UnitInput prefix="+ $" aria-label="Adicional de la franja" placeholder="Adicional" className="[&_input]:pl-9" invalid={Boolean(errors.extra)}
                        value={band.extra} onChange={(e) => updateBand(index, { extra: e.target.value })} />
                    </Field>
                    <button type="button" aria-label="Quitar franja" onClick={() => onChange({ weightBands: bands.filter((_, i) => i !== index) })}
                      className="mt-1 flex h-8 w-8 items-center justify-center rounded-lg text-default-500 hover:bg-red-50 hover:text-destructive">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
              <Btn size="sm" onClick={() => {
                const last = toNum(bands[bands.length - 1]?.upToKg) || 0;
                onChange({ weightBands: [...bands, { upToKg: String(last + 50), extra: "0" }] });
              }}><Plus className="h-4 w-4" /> Agregar franja</Btn>
            </div>
          )}
        </div>
      </Setting>
    </div>
  );
}

/* ───────────────────────────── Probar ───────────────────────────── */

export function ProbadorPanel({ pin, locations, tiers, rules, probe, onProbeChange, onClearPin }) {
  const weight = toNum(probe.weight);
  const subtotal = toNum(probe.subtotal) || 0;
  const manualDistance = toNum(probe.distance);
  const numTiers = numericTiers(tiers);
  const numLocations = numericLocations(locations);

  let result = null;
  let origin = "";
  if (manualDistance !== null && manualDistance >= 0) {
    result = priceForDistance({ distanceKm: manualDistance, tiers: numTiers, rules, weightKg: weight, subtotal });
  } else if (pin) {
    result = computeShipping({ locations: numLocations, tiers: numTiers, rules, lat: pin.lat, lng: pin.lng, weightKg: weight, subtotal });
    if (result.store) origin = `${result.store.nombre} · a ${kmLabel(result.distance)}`;
  }
  const quote = result ? describeQuote(result, rules) : null;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-4">
        <div>
          <h3 className="text-base font-semibold">Probá cuánto costaría un envío</h3>
          <p className="mt-0.5 text-sm text-default-500">Usa las tarifas y reglas que ves en pantalla, aunque todavía no las hayas guardado.</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 text-sm">
          {pin ? (
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-medium">Dirección elegida en el mapa</p>
                <p className="text-default-500">{origin || "Calculando…"}</p>
              </div>
              <Btn size="sm" variant="ghost" onClick={onClearPin}>Quitar</Btn>
            </div>
          ) : (
            <p className="text-default-500">Elegí una dirección en el mapa o ingresá la distancia a mano.</p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Distancia" hint={pin ? "Reemplaza al mapa" : undefined}>
            <UnitInput suffix="km" placeholder="12" value={probe.distance} onChange={(e) => onProbeChange({ distance: e.target.value })} />
          </Field>
          <Field label="Peso">
            <UnitInput suffix="kg" placeholder="Sin peso" value={probe.weight} onChange={(e) => onProbeChange({ weight: e.target.value })} />
          </Field>
          <Field label="Compra">
            <UnitInput prefix="$" placeholder="0" value={probe.subtotal} onChange={(e) => onProbeChange({ subtotal: e.target.value })} />
          </Field>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        {!quote ? (
          <div className="flex h-full min-h-[140px] items-center justify-center text-center text-sm text-default-500">
            El resultado aparece acá.
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-default-500">{quote.quote ? "Resultado" : "El cliente paga"}</p>
              <p className={cn("text-3xl font-semibold", quote.free && "text-emerald-600", quote.quote && "text-amber-600 text-2xl")}>{quote.title}</p>
            </div>
            {quote.lines.length > 0 && (
              <dl className="space-y-1.5 border-t border-border pt-3 text-sm">
                {quote.lines.map((line) => (
                  <div key={line.label} className="flex justify-between gap-4">
                    <dt className="text-default-500">{line.label}</dt>
                    <dd className="font-medium">{line.value}</dd>
                  </div>
                ))}
              </dl>
            )}
            {quote.note && <p className="text-sm text-default-500">{quote.note}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
