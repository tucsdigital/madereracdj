"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/provider/auth.provider";
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
import { Btn } from "@/components/panel-ui/ui";
import CoverageMap from "@/components/envios-zonas/CoverageMap";
import { usePacStyles } from "@/components/envios-zonas/places";
import { SucursalForm, SucursalesList } from "@/components/envios-zonas/SucursalesPanel";
import { ProbadorPanel, ReglasPanel, TarifasPanel } from "@/components/envios-zonas/Panels";
import { computeShipping, normalizeShippingRules, shippingIssues, validateShippingConfig } from "@/lib/shipping";
import { countIssues, coverageMessage, newStoreId, numericLocations, numericTiers, snapshotOf } from "@/lib/envios-ui";

const TABS = [
  { id: "tarifas", label: "Tarifas" },
  { id: "reglas", label: "Reglas" },
  { id: "probar", label: "Probar" },
];

const toNum = (v) => {
  const n = parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
const when = (iso) => (iso ? new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");

// Los campos del panel guardan texto tal como se escribe; el servidor y el motor trabajan con números.
const rulesToForm = (raw) => {
  const r = normalizeShippingRules(raw);
  return {
    maxWeightKg: String(r.maxWeightKg),
    freeShippingMin: String(r.freeShippingMin),
    minFee: String(r.minFee),
    fuelSurchargePct: String(r.fuelSurchargePct),
    weightBands: r.weightBands.map((b) => ({ upToKg: String(b.upToKg), extra: String(b.extra) })),
  };
};
const fromApi = (data) => ({
  locations: (data.locations || []).map((l) => ({ ...l })),
  tiers: (data.shippingTiers || []).map((t) => ({ km: String(t.km), price: String(t.price) })),
  rules: rulesToForm(data.shippingRules),
});

export default function ZonasEnvioPage() {
  const { user } = useAuth();
  usePacStyles();

  const [config, setConfig] = useState(null);
  const [saved, setSaved] = useState("");
  const [meta, setMeta] = useState({ version: 0, savedAt: null });
  const [loadError, setLoadError] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [tab, setTab] = useState("tarifas");
  const [pin, setPin] = useState(null);
  const [probe, setProbe] = useState({ weight: "", subtotal: "", distance: "" });
  const [mapsApi, setMapsApi] = useState(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);
  const [showProblems, setShowProblems] = useState(false);
  const [serverIssues, setServerIssues] = useState([]);
  const [confirm, setConfirm] = useState(null);
  const mapRef = useRef(null);
  const loadedFor = useRef(null);

  const apply = useCallback((data) => {
    const next = fromApi(data);
    setConfig(next);
    setSaved(snapshotOf(next));
    setMeta({ version: data.version || 0, savedAt: data.savedAt || null });
  }, []);

  useEffect(() => {
    if (!user) return;
    // Se carga una sola vez por usuario: un cambio de referencia de `user` no debe pisar lo que se está editando.
    const who = user.uid ?? "usuario";
    if (loadedFor.current === who) return;
    loadedFor.current = who;
    fetch("/api/envios/zonas").then((r) => r.json()).then((d) => (d.error ? Promise.reject(new Error(d.error)) : apply(d))).catch((e) => setLoadError(e.message));
  }, [user, apply]);

  const dirty = useMemo(() => Boolean(config) && snapshotOf(config) !== saved, [config, saved]);
  const issues = useMemo(() => (config ? shippingIssues({ locations: config.locations, tiers: config.tiers, rules: config.rules }) : []), [config]);
  const warnings = useMemo(
    () => (config ? validateShippingConfig({ locations: numericLocations(config.locations), tiers: numericTiers(config.tiers), rules: config.rules }).warnings : []),
    [config]
  );
  const mapLocations = useMemo(() => (config ? numericLocations(config.locations) : []), [config]);

  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  useEffect(() => {
    if (!notice || notice.type !== "ok") return undefined;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  // Resultado de la dirección elegida en el mapa, con lo que se ve en pantalla (guardado o no).
  const pinMessage = useMemo(() => {
    if (!pin || !config) return null;
    return coverageMessage(
      computeShipping({ locations: mapLocations, tiers: numericTiers(config.tiers), rules: config.rules, lat: pin.lat, lng: pin.lng, weightKg: toNum(probe.weight) || 1, subtotal: toNum(probe.subtotal) || 0 })
    );
  }, [pin, config, mapLocations, probe.weight, probe.subtotal]);

  const patch = (key, value) => setConfig((prev) => ({ ...prev, [key]: typeof value === "function" ? value(prev[key]) : value }));

  /* Sucursales */
  const locationById = (id) => config.locations.find((l) => l.id === id);
  const select = (id) => {
    setSelectedId(id);
    const loc = numericLocations(config.locations).find((l) => l.id === id);
    if (loc) mapRef.current?.focus(loc);
  };
  const startNew = () => {
    setSelectedId(null);
    setDraft({ key: `new-${Date.now()}`, id: null, nombre: "", direccion: "", lat: "", lng: "", radio: 5000 });
  };
  const startEdit = (id) => {
    const loc = locationById(id);
    if (!loc) return;
    setSelectedId(id);
    setDraft({ key: id, id, nombre: loc.nombre || "", direccion: loc.direccion || "", lat: loc.lat ?? "", lng: loc.lng ?? "", radio: loc.radio ?? 5000 });
    const numeric = numericLocations([loc])[0];
    if (numeric) mapRef.current?.focus(numeric);
  };
  const changeDraft = useCallback((changes) => setDraft((d) => (d ? { ...d, ...changes } : d)), []);
  const finishDraft = () => {
    const item = { nombre: draft.nombre.trim(), direccion: draft.direccion.trim(), lat: toNum(draft.lat), lng: toNum(draft.lng), radio: toNum(draft.radio) };
    const id = draft.id || newStoreId();
    patch("locations", (list) => (draft.id ? list.map((l) => (l.id === draft.id ? { ...l, ...item } : l)) : [...list, { id, ...item }]));
    setSelectedId(id);
    setDraft(null);
  };
  const askDelete = (id) => {
    const loc = locationById(id);
    setConfirm({
      title: `¿Eliminar ${loc?.nombre ? `“${loc.nombre}”` : "la sucursal"}?`,
      description: "Se quita de la lista cuando guardes los cambios. Hasta entonces podés descartar y volver atrás.",
      action: "Eliminar",
      run: () => {
        patch("locations", (list) => list.filter((l) => l.id !== id));
        setDraft(null);
        setSelectedId((current) => (current === id ? null : current));
      },
    });
  };

  const pickOnMap = useCallback((lat, lng) => {
    if (draft) {
      changeDraft({ lat, lng });
      const key = draft.key;
      mapRef.current?.reverseGeocode(lat, lng).then((address) => {
        if (address) setDraft((d) => (d && d.key === key ? { ...d, direccion: address } : d));
      });
      return;
    }
    setPin({ lat, lng });
  }, [draft, changeDraft]);

  /* Guardado manual */
  const goTo = (issue) => {
    if (issue.scope === "sucursales") {
      const loc = config.locations[issue.index];
      if (loc) startEdit(loc.id);
    } else {
      setTab(issue.scope);
    }
  };

  const save = async () => {
    if (draft) {
      setNotice({ type: "error", text: "Terminá de editar la sucursal con el botón “Listo” antes de guardar." });
      return;
    }
    if (issues.length) {
      setServerIssues([]);
      setShowProblems(true);
      setNotice(null);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    const token = await user?.getIdToken?.();
    if (!token) { setNotice({ type: "error", text: "Iniciá sesión para guardar los cambios." }); return; }
    setSaving(true);
    setNotice(null);
    try {
      const res = await fetch("/api/envios/zonas", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          locations: config.locations.map((l) => ({ id: l.id, nombre: l.nombre, direccion: l.direccion, lat: toNum(l.lat), lng: toNum(l.lng), radio: toNum(l.radio) })),
          shippingTiers: config.tiers.map((t) => ({ km: toNum(t.km), price: toNum(t.price) })),
          shippingRules: normalizeShippingRules(config.rules),
          baseVersion: meta.version,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (Array.isArray(data.issues) && data.issues.length) { setServerIssues(data.issues); setShowProblems(true); }
        throw new Error(data.error || "No se pudieron guardar los cambios.");
      }
      apply(data);
      setShowProblems(false);
      setServerIssues([]);
      setNotice({ type: "ok", text: "Cambios guardados. La tienda usará las nuevas zonas y tarifas enseguida." });
    } catch (e) {
      setNotice({ type: "error", text: e.message });
    } finally {
      setSaving(false);
    }
  };

  const discard = () => setConfirm({
    title: "¿Descartar los cambios?",
    description: "Vas a volver a lo último que guardaste. Se pierden los cambios hechos desde entonces.",
    action: "Descartar",
    run: () => {
      fetch("/api/envios/zonas").then((r) => r.json()).then((d) => { apply(d); setDraft(null); setSelectedId(null); setShowProblems(false); setPin(null); });
    },
  });

  if (!config) {
    return <div className="p-6 text-sm text-default-600">{loadError ? <span className="text-destructive">{loadError}</span> : "Cargando…"}</div>;
  }

  const shownIssues = serverIssues.length ? serverIssues : issues;
  const drawnDraft = draft ? { key: draft.key, id: draft.id || "__nuevo__", lat: toNum(draft.lat), lng: toNum(draft.lng), radio: toNum(draft.radio) } : null;
  const problemsPerLocation = config.locations.map((_, i) => issues.filter((x) => x.scope === "sucursales" && x.index === i).length);

  return (
    <div className="mx-auto w-full space-y-6 pb-20">
      <header className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold">Envíos y cobertura</h1>
          <p className="flex items-center gap-1.5 truncate text-sm text-default-500">
            {dirty ? (<><span className="h-2 w-2 rounded-full bg-amber-500" /> Tenés cambios sin guardar</>) : meta.savedAt ? `Guardado el ${when(meta.savedAt)}` : "Sin cambios"}
          </p>
        </div>
        <Btn variant="primary" disabled={!dirty || saving} onClick={save}>{saving ? "Guardando…" : "Guardar cambios"}</Btn>
      </header>

      {notice && (
        <div role="status" className={cn("flex items-start justify-between gap-3 rounded-lg px-4 py-3 text-sm", notice.type === "ok" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800")}>
          <span>{notice.text}</span>
          <button type="button" aria-label="Cerrar" className="opacity-60 hover:opacity-100" onClick={() => setNotice(null)}>×</button>
        </div>
      )}

      {showProblems && shownIssues.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50/60 p-4">
          <p className="mb-2 text-sm font-medium text-red-800">Para poder guardar, corregí esto:</p>
          <ul className="space-y-1">
            {shownIssues.map((issue, i) => (
              <li key={`${issue.scope}-${i}`} className="flex items-center justify-between gap-3 text-sm text-red-900">
                <span>{issue.message}</span>
                <button type="button" onClick={() => goTo(issue)} className="shrink-0 font-medium underline underline-offset-4">Ir</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <CoverageMap
          ref={mapRef}
          className="h-[420px] lg:h-[600px]"
          locations={mapLocations}
          selectedId={selectedId}
          draft={drawnDraft}
          pin={pin}
          message={pinMessage}
          onSelect={(id) => (draft ? null : select(id))}
          onPick={pickOnMap}
          onDraftChange={changeDraft}
          onClearPin={() => setPin(null)}
          onReady={setMapsApi}
        />
        <div className={cn("rounded-xl border border-border bg-card lg:h-[600px]", draft ? "h-[560px] overflow-hidden" : "max-h-[560px] overflow-y-auto lg:max-h-none lg:overflow-hidden")}>
          {draft ? (
            <SucursalForm
              key={draft.key}
              draft={draft}
              isNew={!draft.id}
              mapsReady={Boolean(mapsApi)}
              gmaps={mapsApi?.gmaps}
              onChange={changeDraft}
              onLocate={(lat, lng) => mapRef.current?.panTo(lat, lng, 15)}
              onDone={finishDraft}
              onCancel={() => setDraft(null)}
              onDelete={draft.id ? () => askDelete(draft.id) : undefined}
            />
          ) : (
            <SucursalesList
              locations={config.locations}
              selectedId={selectedId}
              problems={problemsPerLocation}
              onSelect={select}
              onAdd={startNew}
              onEdit={startEdit}
              onFocus={select}
              onDelete={askDelete}
            />
          )}
        </div>
      </div>

      <section>
        <nav className="flex gap-6 border-b border-border" aria-label="Tarifas y reglas">
          {TABS.map((t) => {
            const problems = t.id === "probar" ? 0 : countIssues(issues, t.id);
            const warn = t.id === "tarifas" && warnings.length > 0;
            return (
              <button key={t.id} type="button" onClick={() => setTab(t.id)} aria-current={tab === t.id ? "page" : undefined}
                className={cn("-mb-px flex items-center gap-2 border-b-2 pb-3 text-sm transition", tab === t.id ? "border-primary font-semibold text-foreground" : "border-transparent text-default-500 hover:text-foreground")}>
                {t.label}
                {problems > 0 ? <span className="h-2 w-2 rounded-full bg-destructive" aria-label="Hay algo para corregir" /> : warn ? <span className="h-2 w-2 rounded-full bg-amber-500" aria-label="Hay avisos" /> : null}
              </button>
            );
          })}
        </nav>
        <div className="mt-5 rounded-xl border border-border bg-card p-5 sm:p-6">
          {tab === "tarifas" && <TarifasPanel tiers={config.tiers} warnings={warnings} issues={issues} onChange={(tiers) => patch("tiers", tiers)} />}
          {tab === "reglas" && <ReglasPanel rules={config.rules} issues={issues} onChange={(changes) => patch("rules", (rules) => ({ ...rules, ...changes }))} />}
          {tab === "probar" && (
            <ProbadorPanel pin={pin} locations={config.locations} tiers={config.tiers} rules={config.rules} probe={probe}
              onProbeChange={(changes) => setProbe((p) => ({ ...p, ...changes }))} onClearPin={() => setPin(null)} />
          )}
        </div>
      </section>

      {dirty && (
        <div className="fixed inset-x-4 bottom-4 z-30 mx-auto flex w-fit max-w-full items-center gap-3 rounded-xl border border-border bg-card px-4 py-2.5 shadow-lg" role="region" aria-label="Cambios sin guardar">
          <span className="hidden items-center gap-2 text-sm sm:flex"><span className="h-2 w-2 rounded-full bg-amber-500" /> Tenés cambios sin guardar</span>
          <Btn variant="ghost" size="sm" onClick={discard}>Descartar</Btn>
          <Btn variant="primary" size="sm" disabled={saving} onClick={save}>{saving ? "Guardando…" : "Guardar cambios"}</Btn>
        </div>
      )}

      <AlertDialog open={Boolean(confirm)} onOpenChange={(open) => { if (!open) setConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirm?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { const run = confirm?.run; setConfirm(null); run?.(); }}>{confirm?.action}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
