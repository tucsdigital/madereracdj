"use client";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, History, Info, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Btn, Chip, inputClass } from "@/components/panel-ui/ui";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { PCT_MAX, PCT_MIN, REDONDEOS, findSalePriceConflicts, normalizePrecios, storePriceInfo } from "@/lib/tienda-precios";

const money = (n) => `$${Number(n || 0).toLocaleString("es-AR", { maximumFractionDigits: 2 })}`;
const signed = (n) => `${n > 0 ? "+" : ""}${Number(n.toFixed(2)).toLocaleString("es-AR")}%`;
const when = (iso) => (iso ? new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");
const PAGE = 25;
const SOURCE_LABEL = { producto: "Propio", subcategoria: "Subcategoría", categoria: "Categoría", global: "General", ninguno: "Sin ajuste" };
const QUICK = [-10, -5, 5, 10, 15, 20];

export function Tip({ text }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" aria-label="Más información" className="inline-flex h-5 w-5 items-center justify-center rounded-full text-default-400 hover:bg-default-100 hover:text-default-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
          <Info className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs leading-relaxed">{text}</TooltipContent>
    </Tooltip>
  );
}

function PctInput({ value, onChange, id, className, ariaLabel }) {
  return (
    <div className={cn("relative", className)}>
      <input
        id={id}
        aria-label={ariaLabel}
        inputMode="decimal"
        className={cn(inputClass, "pr-8 text-right tabular-nums")}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0"
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-default-500">%</span>
    </div>
  );
}

export function Card({ title, tip, action, children }) {
  return (
    <section className="rounded-xl border border-border bg-card">
      <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">{title}{tip ? <Tip text={tip} /> : null}</h3>
        {action}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

function ProductRule({ rule, onChange }) {
  const mode = rule?.modo || "regla";
  const set = (patch) => onChange({ modo: mode, valor: "", ...rule, ...patch });
  return (
    <div className="flex items-center gap-1.5">
      <select
        aria-label="Ajuste del producto"
        className={cn(inputClass, "h-8 w-[132px] px-2 text-xs")}
        value={mode}
        onChange={(e) => (e.target.value === "regla" ? onChange(null) : onChange({ modo: e.target.value, valor: e.target.value === "ninguno" ? 0 : rule?.valor ?? "" }))}
      >
        <option value="regla">Según regla</option>
        <option value="pct">% propio</option>
        <option value="fijo">Precio fijo</option>
        <option value="ninguno">Sin ajuste</option>
      </select>
      {mode === "pct" ? <PctInput ariaLabel="Porcentaje propio" className="w-[84px] [&_input]:h-8 [&_input]:text-xs" value={rule.valor} onChange={(v) => set({ valor: v })} /> : null}
      {mode === "fijo" ? (
        <div className="relative w-[110px]">
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-default-500">$</span>
          <input aria-label="Precio fijo" inputMode="decimal" className={cn(inputClass, "h-8 pl-6 text-xs tabular-nums", !(Number(String(rule.valor).replace(",", ".")) > 0) && "border-destructive")} value={rule.valor} onChange={(e) => set({ valor: e.target.value })} placeholder="0" />
        </div>
      ) : null}
    </div>
  );
}

export default function PreciosForm({ precios, onChange, products, productsState, onLoadAll, categories = [], authFetch, onRestore }) {
  const cfg = precios;
  const normalized = useMemo(() => normalizePrecios(cfg), [cfg]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("visibles");
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(0);
  const [history, setHistory] = useState({ open: false, loading: false, items: null, error: "" });
  const [showConflicts, setShowConflicts] = useState(false);

  const preview = useMemo(() => ({ ...normalized, activo: true }), [normalized]);
  const categoryOptions = useMemo(() => [...new Set([...categories, ...products.map((p) => p.categoria).filter(Boolean), "Maderas", "Ferretería", "Combos"])].sort((a, b) => a.localeCompare(b, "es")), [categories, products]);
  const subcategoryOptions = useMemo(() => {
    const map = {};
    for (const p of products) {
      const c = String(p.categoria || "").trim();
      const s = String(p.subcategoria ?? p.subCategoria ?? "").trim();
      if (c && s) (map[c] ||= new Set()).add(s);
    }
    return map;
  }, [products]);

  const rows = useMemo(() => products.map((p) => ({ p, info: storePriceInfo(p, preview), own: normalized.productos.find((x) => x.id === String(p.id)) || null })), [products, preview, normalized.productos]);
  const adjusted = rows.filter((r) => r.info.adj.mode !== "none" && r.p.estadoTienda === "Activo");
  const visibleCount = rows.filter((r) => r.p.estadoTienda === "Activo").length;
  const avgPct = adjusted.length ? adjusted.reduce((s, r) => s + r.info.pct, 0) / adjusted.length : 0;
  const conflicts = useMemo(() => findSalePriceConflicts(products), [products]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(({ p, info, own }) => {
      if (filter === "visibles" && p.estadoTienda !== "Activo") return false;
      if (filter === "ajustados" && info.adj.mode === "none") return false;
      if (filter === "excepciones" && !own) return false;
      if (category && String(p.categoria || "") !== category) return false;
      if (!q) return true;
      return `${p.nombre || ""} ${p.codigo || ""} ${p.descripcion || ""}`.toLowerCase().includes(q);
    });
  }, [rows, query, filter, category]);
  useEffect(() => setPage(0), [query, filter, category]);
  const pageRows = filtered.slice(page * PAGE, page * PAGE + PAGE);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));

  // Se edita el texto tal cual se escribe (por ejemplo "1,"); se normaliza recién al guardar.
  const patch = (data) => onChange({ ...cfg, ...data });
  const setGrupo = (index, data) => patch({ grupos: cfg.grupos.map((g, i) => (i === index ? { ...g, ...data } : g)) });
  const addGrupo = () => patch({ grupos: [...cfg.grupos, { categoria: "", subcategoria: "", pct: "" }] });
  const setRule = (id, rule) => {
    const rest = (cfg.productos || []).filter((x) => String(x.id) !== String(id));
    patch({ productos: rule ? [...rest, { id: String(id), ...rule }] : rest });
  };

  const raw = cfg;

  const loadHistory = async () => {
    setHistory((h) => ({ ...h, open: !h.open }));
    if (history.items || history.loading || history.open) return;
    setHistory((h) => ({ ...h, loading: true, error: "" }));
    try {
      const data = await authFetch("/api/tienda/precios/historial");
      setHistory({ open: true, loading: false, items: data.items || [], error: "" });
    } catch (e) {
      setHistory({ open: true, loading: false, items: null, error: e.message });
    }
  };

  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-6">
        <section className="rounded-xl border border-border bg-card p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                role="switch"
                aria-checked={raw.activo}
                aria-label="Ajuste de precios activo"
                onClick={() => patch({ activo: !raw.activo })}
                className={cn("relative h-6 w-11 shrink-0 rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40", raw.activo ? "bg-primary" : "bg-default-300")}
              >
                <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", raw.activo ? "left-[22px]" : "left-0.5")} />
              </button>
              <div>
                <p className="text-sm font-semibold">{raw.activo ? "Ajuste activo" : "Ajuste desactivado"}</p>
                <p className="text-xs text-default-500">{raw.activo ? "La tienda muestra los precios ajustados." : "La tienda muestra los precios originales."}</p>
              </div>
            </div>
            <dl className="grid grid-cols-3 gap-6 text-right">
              <div><dt className="text-xs text-default-500">Con ajuste</dt><dd className="text-lg font-semibold tabular-nums">{adjusted.length}<span className="text-sm font-normal text-default-400"> / {visibleCount}</span></dd></div>
              <div><dt className="text-xs text-default-500">Promedio</dt><dd className="text-lg font-semibold tabular-nums">{adjusted.length ? signed(avgPct) : "—"}</dd></div>
              <div><dt className="text-xs text-default-500">Excepciones</dt><dd className="text-lg font-semibold tabular-nums">{normalized.productos.length}</dd></div>
            </dl>
          </div>

          <div className="mt-6 grid gap-5 border-t border-border pt-6 sm:grid-cols-[minmax(0,1fr)_200px]">
            <div>
              <label htmlFor="precios-global" className="mb-1.5 flex items-center gap-1 text-sm font-medium">Ajuste general <Tip text={`Se suma (o resta, con signo menos) a todos los productos. Va de ${PCT_MIN}% a +${PCT_MAX}%. Una regla de categoría o de producto lo reemplaza.`} /></label>
              <div className="flex flex-wrap items-center gap-2">
                <PctInput id="precios-global" className="w-[120px]" value={raw.globalPct} onChange={(v) => patch({ globalPct: v })} />
                <div className="flex flex-wrap gap-1.5">
                  {QUICK.map((q) => (
                    <button key={q} type="button" onClick={() => patch({ globalPct: String(q) })} className={cn("h-8 rounded-full border px-3 text-xs font-medium transition", Number(String(raw.globalPct).replace(",", ".")) === q ? "border-primary bg-primary/10 text-foreground" : "border-border text-default-600 hover:bg-default-100")}>
                      {q > 0 ? `+${q}` : q}%
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div>
              <label htmlFor="precios-redondeo" className="mb-1.5 flex items-center gap-1 text-sm font-medium">Redondeo <Tip text="Los precios siempre se redondean a $100, igual que en el sistema. Podés subirlo a $1000. En maderas la pieza siempre se redondea a $100." /></label>
              <select id="precios-redondeo" className={inputClass} value={raw.redondeo} onChange={(e) => patch({ redondeo: Number(e.target.value) })}>
                {REDONDEOS.map((r) => <option key={r} value={r}>A ${r}</option>)}
              </select>
            </div>
          </div>
        </section>

        <Card title="Por categoría" tip="Pisan al ajuste general. Si elegís también subcategoría, esa regla gana sobre la de la categoría." action={<Btn size="sm" onClick={addGrupo}>Agregar</Btn>}>
          {raw.grupos.length === 0 ? (
            <p className="text-sm text-default-500">Sin reglas. Todo usa el ajuste general.</p>
          ) : (
            <ul className="space-y-2.5">
              {raw.grupos.map((g, i) => {
                const subs = subcategoryOptions[g.categoria] ? [...subcategoryOptions[g.categoria]].sort((a, b) => a.localeCompare(b, "es")) : [];
                return (
                  <li key={i} className="grid grid-cols-[minmax(0,1fr)_96px_36px] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_110px_36px]">
                    <input aria-label="Categoría" list="precios-categorias" className={cn(inputClass, "col-span-2 sm:col-span-1", !g.categoria && "border-amber-400")} placeholder="Categoría" value={g.categoria} onChange={(e) => setGrupo(i, { categoria: e.target.value })} />
                    <input aria-label="Subcategoría (opcional)" list={`precios-sub-${i}`} className={cn(inputClass, "col-span-2 sm:col-span-1")} placeholder="Todas las subcategorías" value={g.subcategoria} onChange={(e) => setGrupo(i, { subcategoria: e.target.value })} />
                    <datalist id={`precios-sub-${i}`}>{subs.map((s) => <option key={s} value={s} />)}</datalist>
                    <PctInput ariaLabel="Porcentaje" value={g.pct} onChange={(v) => setGrupo(i, { pct: v })} />
                    <button type="button" aria-label="Quitar regla" onClick={() => patch({ grupos: raw.grupos.filter((_, j) => j !== i) })} className="flex h-9 w-9 items-center justify-center rounded-lg text-default-500 hover:bg-default-100 hover:text-destructive"><X className="h-4 w-4" /></button>
                  </li>
                );
              })}
            </ul>
          )}
          <datalist id="precios-categorias">{categoryOptions.map((c) => <option key={c} value={c} />)}</datalist>
        </Card>

        <Card title="Productos" tip="Original: el precio del sistema (ventas y presupuestos). En tienda: lo que ve el cliente. Un producto puede tener su propio porcentaje, un precio fijo (se redondea a $100) o quedar fuera del ajuste.">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[200px] flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-default-400" />
                <input aria-label="Buscar producto" className={cn(inputClass, "pl-9")} placeholder="Buscar por nombre o código" value={query} onChange={(e) => setQuery(e.target.value)} />
              </div>
              <select aria-label="Categoría" className={cn(inputClass, "w-auto min-w-[150px]")} value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">Todas las categorías</option>
                {categoryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <select aria-label="Filtro" className={cn(inputClass, "w-auto min-w-[150px]")} value={filter} onChange={(e) => setFilter(e.target.value)}>
                <option value="visibles">Visibles en la tienda</option>
                <option value="ajustados">Con ajuste</option>
                <option value="excepciones">Con excepción</option>
                <option value="todos">Todos</option>
              </select>
            </div>

            {productsState.loading && !products.length ? (
              <p className="py-8 text-center text-sm text-default-500">Cargando productos…</p>
            ) : pageRows.length === 0 ? (
              <div className="py-8 text-center text-sm text-default-500">
                <p>No hay productos para mostrar.</p>
                {!productsState.all && filter !== "visibles" ? <Btn className="mt-3" size="sm" onClick={onLoadAll} disabled={productsState.loading}>Cargar todo el catálogo</Btn> : null}
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="bg-default-50 text-left text-xs text-default-500">
                    <tr>
                      <th className="px-4 py-2.5 font-medium">Producto</th>
                      <th className="px-3 py-2.5 text-right font-medium">Original</th>
                      <th className="px-3 py-2.5 font-medium">Ajuste</th>
                      <th className="px-3 py-2.5 text-right font-medium">En tienda</th>
                      <th className="px-3 py-2.5 font-medium">Excepción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {pageRows.map(({ p, info }) => {
                      const ownRule = (cfg.productos || []).find((x) => String(x.id) === String(p.id)) || null;
                      const noPrice = !(info.original > 0);
                      return (
                        <tr key={p.id} className={cn(p.estadoTienda !== "Activo" && "opacity-60")}>
                          <td className="max-w-[320px] px-4 py-3">
                            <p className="truncate font-medium">{p.nombre || "Sin nombre"}</p>
                            <p className="truncate text-xs text-default-500">{[p.codigo, p.categoria, p.estadoTienda !== "Activo" ? "Oculto en la tienda" : ""].filter(Boolean).join(" · ")}</p>
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums text-default-600">{noPrice ? "—" : money(info.original)}</td>
                          <td className="px-3 py-3">
                            {info.adj.mode === "none" ? (
                              <span className="text-xs text-default-400">{SOURCE_LABEL[info.adj.source]}</span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5">
                                <Chip tone={info.diff >= 0 ? "ok" : "warn"}>{info.adj.mode === "fijo" ? "Fijo" : signed(info.adj.pct)}</Chip>
                                <span className="text-xs text-default-400">{SOURCE_LABEL[info.adj.source]}</span>
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums">
                            <span className="font-semibold">{noPrice ? "—" : money(info.store)}</span>
                            {!noPrice && info.diff !== 0 ? <span className={cn("block text-xs", info.diff > 0 ? "text-emerald-700" : "text-amber-700")}>{info.diff > 0 ? "+" : "−"}{money(Math.abs(info.diff))}</span> : null}
                          </td>
                          <td className="px-3 py-3"><ProductRule rule={ownRule} onChange={(rule) => setRule(p.id, rule)} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-default-500">
              <span>{filtered.length} producto{filtered.length === 1 ? "" : "s"}{!productsState.all ? " · solo los visibles en la tienda" : ""}</span>
              <div className="flex items-center gap-2">
                {!productsState.all ? <Btn size="sm" onClick={onLoadAll} disabled={productsState.loading}>{productsState.loading ? "Cargando…" : "Cargar todo el catálogo"}</Btn> : null}
                {pages > 1 ? (
                  <>
                    <Btn size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Anterior</Btn>
                    <span className="tabular-nums">{page + 1} / {pages}</span>
                    <Btn size="sm" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>Siguiente</Btn>
                  </>
                ) : null}
              </div>
            </div>
          </div>
        </Card>

        {conflicts.length > 0 ? (
          <section className="rounded-xl border border-amber-200 bg-amber-50/60">
            <button type="button" onClick={() => setShowConflicts((v) => !v)} className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left text-sm font-medium text-amber-900">
              <span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> {conflicts.length} producto{conflicts.length === 1 ? "" : "s"} con precios de venta distintos guardados</span>
              <ChevronDown className={cn("h-4 w-4 transition", showConflicts && "rotate-180")} />
            </button>
            {showConflicts ? (
              <ul className="space-y-1 border-t border-amber-200 px-5 py-3 text-xs text-amber-900">
                {conflicts.slice(0, 20).map((c) => (
                  <li key={c.id}>
                    <strong>{c.codigo || c.id}</strong> {c.nombre} · se usa {money(c.current)} ({c.values.map((v) => `${v.field} ${money(v.value)}`).join(", ")}). Abrí el producto y guardá el precio para unificarlo.
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ) : null}

        <section className="rounded-xl border border-border bg-card">
          <button type="button" onClick={loadHistory} className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left text-sm font-semibold">
            <span className="flex items-center gap-2"><History className="h-4 w-4 text-default-500" /> Historial</span>
            <ChevronDown className={cn("h-4 w-4 transition", history.open && "rotate-180")} />
          </button>
          {history.open ? (
            <div className="border-t border-border px-5 py-3">
              {history.loading ? <p className="text-sm text-default-500">Cargando…</p> : history.error ? <p className="text-sm text-destructive">{history.error}</p> : !history.items?.length ? <p className="text-sm text-default-500">Todavía no hay cambios.</p> : (
                <ul className="divide-y divide-border">
                  {history.items.map((item) => (
                    <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                      <div className="min-w-0">
                        <p>{item.summary.join(" · ")}</p>
                        <p className="text-xs text-default-500">{when(item.at)}{item.by ? ` · ${item.by}` : ""}</p>
                      </div>
                      <Btn size="sm" onClick={() => onRestore(item.before)}>Volver a esta versión</Btn>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </section>
      </div>
    </TooltipProvider>
  );
}
