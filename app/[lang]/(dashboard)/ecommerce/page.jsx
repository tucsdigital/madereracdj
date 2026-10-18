"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/provider/auth.provider";
import { Btn, inputClass } from "@/components/panel-ui/ui";
import { PERIODOS } from "@/lib/ecommerce-panel";
import Kpis from "@/components/ecommerce/Kpis";
import VentasTable from "@/components/ecommerce/VentasTable";
import Resumen from "@/components/ecommerce/Resumen";
import VentaSheet from "@/components/ecommerce/VentaSheet";

const TABS = [
  { id: "ventas", label: "Ventas", help: "Los pedidos de la tienda online. Tocá uno para ver su detalle." },
  { id: "resumen", label: "Resumen", help: "Cómo viene la tienda online en el período elegido." },
];
const NO_FILTERS = { q: "", estado: "", pago: "", entrega: "", reponer: false };
const time = (iso) => (iso ? new Date(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }) : "");

export default function EcommercePage() {
  const { user } = useAuth();
  const tiendaUrl = process.env.NEXT_PUBLIC_TIENDA_URL || "";

  const [tab, setTab] = useState("ventas");
  const [periodo, setPeriodo] = useState("30d");
  const [range, setRange] = useState({ desde: "", hasta: "" });
  const [filters, setFilters] = useState(NO_FILTERS);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState({ key: "fecha", dir: "desc" });
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [data, setData] = useState(null);
  const [resumen, setResumen] = useState(null);
  const [loading, setLoading] = useState({ ventas: true, resumen: true });
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);
  const [tick, setTick] = useState(0);
  const freshRef = useRef(false);
  const lastRef = useRef(Date.now());
  const requestRef = useRef({ ventas: 0, resumen: 0 });

  const authFetch = useCallback(async (url) => {
    const token = await user?.getIdToken?.();
    if (!token) throw new Error("Iniciá sesión para ver el ecommerce.");
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.error || "No se pudo completar la acción.");
    }
    return res;
  }, [user]);

  // La búsqueda se aplica al dejar de escribir.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(filters.q.trim()), 300);
    return () => clearTimeout(timer);
  }, [filters.q]);

  const baseParams = useMemo(() => {
    const p = new URLSearchParams({ periodo });
    if (periodo === "custom") { if (range.desde) p.set("desde", range.desde); if (range.hasta) p.set("hasta", range.hasta); }
    return p;
  }, [periodo, range]);

  const listParams = useCallback((extra = {}) => {
    const p = new URLSearchParams(baseParams);
    if (search) p.set("q", search);
    for (const key of ["estado", "pago", "entrega"]) if (filters[key]) p.set(key, filters[key]);
    if (filters.reponer) p.set("reponer", "1");
    p.set("orden", sort.key);
    p.set("dir", sort.dir);
    for (const [k, v] of Object.entries(extra)) p.set(k, String(v));
    return p;
  }, [baseParams, search, filters, sort]);

  useEffect(() => {
    if (!user) return;
    const id = ++requestRef.current.ventas;
    setLoading((l) => ({ ...l, ventas: true }));
    const params = listParams({ pagina: page, limite: limit });
    if (freshRef.current) params.set("fresco", "1");
    authFetch(`/api/ecommerce/ventas?${params}`)
      .then((res) => res.json())
      .then((body) => { if (id === requestRef.current.ventas) { setData(body); setError(""); } })
      .catch((e) => { if (id === requestRef.current.ventas) setError(e.message); })
      .finally(() => { if (id === requestRef.current.ventas) setLoading((l) => ({ ...l, ventas: false })); });
  }, [user, authFetch, listParams, page, limit, tick]);

  useEffect(() => {
    if (!user) return;
    const id = ++requestRef.current.resumen;
    setLoading((l) => ({ ...l, resumen: true }));
    const params = new URLSearchParams(baseParams);
    if (freshRef.current) params.set("fresco", "1");
    authFetch(`/api/ecommerce/resumen?${params}`)
      .then((res) => res.json())
      .then((body) => { if (id === requestRef.current.resumen) setResumen(body); })
      .catch((e) => { if (id === requestRef.current.resumen) setError(e.message); })
      .finally(() => { if (id === requestRef.current.resumen) { setLoading((l) => ({ ...l, resumen: false })); freshRef.current = false; } });
  }, [user, authFetch, baseParams, tick]);

  const refresh = useCallback(() => { freshRef.current = true; lastRef.current = Date.now(); setTick((n) => n + 1); }, []);

  // Al volver a la pestaña se actualizan los datos (como mucho una vez por minuto).
  useEffect(() => {
    const onVisible = () => { if (!document.hidden && Date.now() - lastRef.current > 60000) refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  const changeFilters = (patch) => { setFilters((f) => ({ ...f, ...patch })); setPage(1); };
  const changeSort = (key) => { setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "fecha" || key === "total" ? "desc" : "asc" })); setPage(1); };
  const clearFilters = () => { setFilters(NO_FILTERS); setSearch(""); setPage(1); };
  const changePeriod = (value) => { setPeriodo(value); setPage(1); };

  const exportCsv = async () => {
    try {
      const res = await authFetch(`/api/ecommerce/ventas?${listParams({ formato: "csv" })}`);
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `ecommerce-ventas-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) { setError(e.message); }
  };

  const tabInfo = TABS.find((t) => t.id === tab);
  const busy = loading.ventas || loading.resumen;

  return (
    <div className="w-full space-y-6 pb-16">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold">Ecommerce</h1>
          <p className="truncate text-sm text-default-500">
            {data?.actualizado ? `Actualizado a las ${time(data.actualizado)}` : "Cargando…"}
            {data?.truncado ? " · Se muestran las 5.000 ventas más recientes" : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="Período" className={cn(inputClass, "w-auto min-w-[140px]")} value={periodo} onChange={(e) => changePeriod(e.target.value)}>
            {PERIODOS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          {periodo === "custom" ? (
            <>
              <input type="date" aria-label="Desde" className={cn(inputClass, "w-auto")} value={range.desde} max={range.hasta || undefined} onChange={(e) => { setRange((r) => ({ ...r, desde: e.target.value })); setPage(1); }} />
              <input type="date" aria-label="Hasta" className={cn(inputClass, "w-auto")} value={range.hasta} min={range.desde || undefined} onChange={(e) => { setRange((r) => ({ ...r, hasta: e.target.value })); setPage(1); }} />
            </>
          ) : null}
          <Btn aria-label="Actualizar" onClick={refresh} disabled={busy}><RefreshCw className={cn("h-4 w-4", busy && "animate-spin")} /></Btn>
          <Btn onClick={exportCsv} disabled={!data?.total}><Download className="h-4 w-4" /> Exportar</Btn>
          {tiendaUrl ? <a href={tiendaUrl} target="_blank" rel="noreferrer" className="hidden h-9 items-center rounded-lg px-3 text-sm text-default-600 hover:bg-default-100 sm:inline-flex">Ver tienda ↗</a> : null}
        </div>
      </header>

      {error ? (
        <div role="alert" className="flex items-start justify-between gap-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">
          <span>{error}</span>
          <button type="button" aria-label="Cerrar" className="opacity-60 hover:opacity-100" onClick={() => setError("")}>×</button>
        </div>
      ) : null}

      <Kpis resumen={resumen} loading={loading.resumen} />

      <nav className="flex gap-6 border-b border-border" aria-label="Secciones del ecommerce">
        {TABS.map((t) => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)} aria-current={tab === t.id ? "page" : undefined}
            className={cn("-mb-px border-b-2 pb-3 text-sm transition", tab === t.id ? "border-primary font-semibold text-foreground" : "border-transparent text-default-500 hover:text-foreground")}>
            {t.label}
          </button>
        ))}
      </nav>
      <p className="-mt-3 text-sm text-default-500">{tabInfo.help}</p>

      {tab === "ventas" ? (
        <VentasTable data={data} loading={loading.ventas} filters={filters} onFilters={changeFilters} sort={sort} onSort={changeSort} onPage={setPage} onLimit={(n) => { setLimit(n); setPage(1); }} onOpen={setSelected} onClear={clearFilters} />
      ) : (
        <Resumen resumen={resumen} loading={loading.resumen} />
      )}

      <VentaSheet venta={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
