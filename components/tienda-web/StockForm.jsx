"use client";
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, History, Info, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Btn, Chip, Segmented, inputClass } from "@/components/panel-ui/ui";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Card, Tip } from "@/components/tienda-web/PreciosForm";
import { LIMITES_STOCK, POLITICAS_STOCK, normalizeStock, stockInfo } from "@/lib/tienda-stock";

const PAGE = 25;
const when = (iso) => (iso ? new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");
const SOURCE_LABEL = { producto: "Propio", subcategoria: "Subcategoría", categoria: "Categoría", general: "General", ninguno: "Sin reglas" };
const POLICY_SHORT = { solo_stock: "Solo con stock", bajo_pedido: "Sin stock", ocultar: "Ocultar" };

function NumberField({ value, onChange, label, placeholder = "", className }) {
  return (
    <input
      aria-label={label}
      inputMode="numeric"
      className={cn(inputClass, "tabular-nums", className)}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ""))}
      placeholder={placeholder}
    />
  );
}

function PolicySelect({ value, onChange, inherit = true, label = "Política", className }) {
  return (
    <select aria-label={label} className={cn(inputClass, className)} value={value || ""} onChange={(e) => onChange(e.target.value)}>
      {inherit ? <option value="">Heredar</option> : null}
      {Object.entries(POLITICAS_STOCK).map(([key, text]) => <option key={key} value={key}>{text}</option>)}
    </select>
  );
}

function RuleFields({ rule, onChange, inherit = true }) {
  const showTope = rule.politica === "bajo_pedido" || (inherit && !rule.politica);
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <label className="space-y-1 text-xs text-default-500">Política<PolicySelect inherit={inherit} value={rule.politica} onChange={(v) => onChange({ politica: v })} className="mt-1 text-sm text-foreground" /></label>
      <label className="space-y-1 text-xs text-default-500">Tope sin stock<NumberField label="Tope de unidades sin stock" value={rule.tope} onChange={(v) => onChange({ tope: v })} placeholder={showTope ? "Heredar" : "—"} className={cn("mt-1 text-sm text-foreground", !showTope && "opacity-50")} /></label>
      <label className="space-y-1 text-xs text-default-500">Plazo de entrega<input aria-label="Plazo de entrega" className={cn(inputClass, "mt-1 text-sm text-foreground")} value={rule.plazo ?? ""} onChange={(e) => onChange({ plazo: e.target.value })} placeholder="Heredar" maxLength={80} /></label>
      <label className="space-y-1 text-xs text-default-500">Stock bajo desde<NumberField label="Aviso de stock bajo" value={rule.umbralBajo} onChange={(v) => onChange({ umbralBajo: v })} placeholder="Heredar" className="mt-1 text-sm text-foreground" /></label>
    </div>
  );
}

const emptyRule = { politica: "", tope: "", plazo: "", umbralBajo: "" };

export default function StockForm({ stock, onChange, products, productsState, onLoadAll, categories = [], authFetch, onRestore }) {
  const cfg = stock;
  const normalized = useMemo(() => normalizeStock(cfg), [cfg]);
  const preview = useMemo(() => ({ ...normalized, activo: true }), [normalized]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("visibles");
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(0);
  const [openId, setOpenId] = useState(null);
  const [history, setHistory] = useState({ open: false, loading: false, items: null, error: "" });

  const categoryOptions = useMemo(() => [...new Set([...categories, ...products.map((p) => p.categoria).filter(Boolean), "Maderas", "Ferretería"])].sort((a, b) => a.localeCompare(b, "es")), [categories, products]);
  const subcategoryOptions = useMemo(() => {
    const map = {};
    for (const p of products) {
      const c = String(p.categoria || "").trim();
      const s = String(p.subcategoria ?? p.subCategoria ?? "").trim();
      if (c && s) (map[c] ||= new Set()).add(s);
    }
    return map;
  }, [products]);

  const rows = useMemo(() => products.map((p) => {
    const info = stockInfo(p, preview, p.stock);
    return { p, info, rule: normalized.productos.find((x) => x.id === String(p.id)) || null };
  }), [products, preview, normalized.productos]);

  const visible = rows.filter((r) => r.p.estadoTienda === "Activo");
  const counts = {
    sinStock: visible.filter((r) => r.info.stock <= 0).length,
    vendibles: visible.filter((r) => r.info.stock <= 0 && r.info.tope > 0).length,
    bajo: visible.filter((r) => r.info.low).length,
    ocultos: visible.filter((r) => r.info.hidden).length,
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(({ p, info, rule }) => {
      if (filter === "visibles" && p.estadoTienda !== "Activo") return false;
      if (filter === "sin_stock" && info.stock > 0) return false;
      if (filter === "bajo" && !info.low) return false;
      if (filter === "bajo_pedido" && info.politica !== "bajo_pedido") return false;
      if (filter === "excepciones" && !rule) return false;
      if (category && String(p.categoria || "") !== category) return false;
      return !q || `${p.nombre || ""} ${p.codigo || ""}`.toLowerCase().includes(q);
    });
  }, [rows, query, filter, category]);
  useEffect(() => setPage(0), [query, filter, category]);
  const pageRows = filtered.slice(page * PAGE, page * PAGE + PAGE);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));

  // Se edita el texto tal cual se escribe; se normaliza recién al guardar.
  const patch = (data) => onChange({ ...cfg, ...data });
  const setGrupo = (i, data) => patch({ grupos: cfg.grupos.map((g, j) => (j === i ? { ...g, ...data } : g)) });
  const addGrupo = () => patch({ grupos: [...cfg.grupos, { categoria: "", subcategoria: "", ...emptyRule }] });
  const ruleOf = (id) => (cfg.productos || []).find((x) => String(x.id) === String(id)) || null;
  const setRule = (id, data) => {
    const rest = (cfg.productos || []).filter((x) => String(x.id) !== String(id));
    const next = data ? { id: String(id), ...emptyRule, ...ruleOf(id), ...data } : null;
    const empty = next && !next.politica && next.tope === "" && !next.plazo && next.umbralBajo === "";
    patch({ productos: next && !empty ? [...rest, next] : rest });
  };

  const loadHistory = async () => {
    setHistory((h) => ({ ...h, open: !h.open }));
    if (history.items || history.loading || history.open) return;
    setHistory((h) => ({ ...h, loading: true, error: "" }));
    try {
      const data = await authFetch("/api/tienda/precios/historial?bloque=stock");
      setHistory({ open: true, loading: false, items: data.items || [], error: "" });
    } catch (e) {
      setHistory({ open: true, loading: false, items: null, error: e.message });
    }
  };

  const statusOf = ({ info }) => {
    if (info.hidden) return <Chip tone="neutral">Oculto sin stock</Chip>;
    if (info.stock <= 0) return info.tope > 0 ? <Chip tone="ok">Se vende sin stock · hasta {info.tope}</Chip> : <Chip tone="bad">Sin stock</Chip>;
    if (info.low) return <Chip tone="warn">Stock bajo</Chip>;
    return <Chip tone="ok">Disponible</Chip>;
  };

  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-6">
        <section className="rounded-xl border border-border bg-card p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <button type="button" role="switch" aria-checked={cfg.activo} aria-label="Reglas de stock activas" onClick={() => patch({ activo: !cfg.activo })}
                className={cn("relative h-6 w-11 shrink-0 rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40", cfg.activo ? "bg-primary" : "bg-default-300")}>
                <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", cfg.activo ? "left-[22px]" : "left-0.5")} />
              </button>
              <div>
                <p className="text-sm font-semibold">{cfg.activo ? "Reglas activas" : "Reglas desactivadas"}</p>
                <p className="text-xs text-default-500">{cfg.activo ? "La tienda aplica estas reglas." : "Solo se vende lo que hay en stock."}</p>
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-right sm:grid-cols-4">
              {[["Sin stock", counts.sinStock], ["Se venden sin stock", counts.vendibles], ["Stock bajo", counts.bajo], ["Ocultos", counts.ocultos]].map(([label, value]) => (
                <div key={label}><dt className="text-xs text-default-500">{label}</dt><dd className="text-lg font-semibold tabular-nums">{value}</dd></div>
              ))}
            </dl>
          </div>

          <div className="mt-6 space-y-5 border-t border-border pt-6">
            <div>
              <p className="mb-1.5 flex items-center gap-1 text-sm font-medium">Cuando no hay stock <Tip text="Solo con stock: el botón se deshabilita. Pedido sin stock: se puede comprar hasta el tope y se registra como “a reponer”. Ocultar: el producto desaparece de la tienda hasta que haya stock." /></p>
              <Segmented value={cfg.politica} onChange={(v) => patch({ politica: v })} options={Object.entries(POLITICAS_STOCK).map(([value, label]) => ({ value, label }))} className="flex-wrap" />
              {cfg.politica === "bajo_pedido" ? (
                <p className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />Los pedidos sin stock se pagan por transferencia o coordinando con el cliente (no por Mercado Pago), no descuentan inventario y quedan marcados “A reponer” en la venta. Los combos siempre requieren stock.</p>
              ) : null}
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <label className={cn("space-y-1 text-sm font-medium", cfg.politica !== "bajo_pedido" && "opacity-50")}>
                <span className="flex items-center gap-1">Tope sin stock <Tip text={`Unidades que se pueden pedir por encima del stock, por producto (1 a ${LIMITES_STOCK.tope}). Vacío: no se permiten unidades sin stock.`} /></span>
                <NumberField label="Tope general" value={cfg.tope} onChange={(v) => patch({ tope: v })} placeholder="Desactivado" />
              </label>
              <label className={cn("space-y-1 text-sm font-medium", cfg.politica !== "bajo_pedido" && "opacity-50")}>
                <span className="flex items-center gap-1">Plazo de entrega <Tip text="Se muestra al cliente en los productos sin stock. Por ejemplo: “5 a 7 días hábiles”." /></span>
                <input aria-label="Plazo general" className={inputClass} value={cfg.plazo ?? ""} onChange={(e) => patch({ plazo: e.target.value })} placeholder="Sin plazo" maxLength={80} />
              </label>
              <label className="space-y-1 text-sm font-medium">
                <span className="flex items-center gap-1">Stock bajo desde <Tip text="Con esta cantidad o menos la tienda avisa “Quedan N”. Vacío: no se muestra el aviso." /></span>
                <NumberField label="Stock bajo general" value={cfg.umbralBajo} onChange={(v) => patch({ umbralBajo: v })} placeholder="Desactivado" />
              </label>
              <label className="space-y-1 text-sm font-medium">
                <span className="flex items-center gap-1">Etiqueta <Tip text="Texto de la marca que ven los clientes en los productos sin stock. Vacío: oculta la etiqueta." /></span>
                <input aria-label="Etiqueta" className={inputClass} value={cfg.etiqueta ?? ""} onChange={(e) => patch({ etiqueta: e.target.value })} placeholder="Sin etiqueta" maxLength={40} />
              </label>
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4 accent-primary" checked={cfg.mostrarCantidad !== false} onChange={(e) => patch({ mostrarCantidad: e.target.checked })} />
              Mostrar cuántas unidades quedan (si no, “Últimas unidades”)
            </label>
          </div>
        </section>

        <Card title="Por categoría" tip="Pisan al ajuste general, campo por campo. Un campo en “Heredar” usa el del nivel siguiente. Si elegís también subcategoría, esa regla gana." action={<Btn size="sm" onClick={addGrupo}>Agregar</Btn>}>
          {cfg.grupos.length === 0 ? <p className="text-sm text-default-500">Sin reglas. Todo usa el ajuste general.</p> : (
            <ul className="space-y-4">
              {cfg.grupos.map((g, i) => {
                const subs = subcategoryOptions[g.categoria] ? [...subcategoryOptions[g.categoria]].sort((a, b) => a.localeCompare(b, "es")) : [];
                return (
                  <li key={i} className="space-y-3 rounded-lg border border-border p-3">
                    <div className="grid grid-cols-[minmax(0,1fr)_36px] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_36px]">
                      <input aria-label="Categoría" list="stock-categorias" className={cn(inputClass, !g.categoria && "border-amber-400")} placeholder="Categoría" value={g.categoria} onChange={(e) => setGrupo(i, { categoria: e.target.value })} />
                      <input aria-label="Subcategoría (opcional)" list={`stock-sub-${i}`} className={cn(inputClass, "col-span-2 sm:col-span-1 sm:order-none")} placeholder="Todas las subcategorías" value={g.subcategoria} onChange={(e) => setGrupo(i, { subcategoria: e.target.value })} />
                      <datalist id={`stock-sub-${i}`}>{subs.map((s) => <option key={s} value={s} />)}</datalist>
                      <button type="button" aria-label="Quitar regla" onClick={() => patch({ grupos: cfg.grupos.filter((_, j) => j !== i) })} className="row-start-1 col-start-2 flex h-9 w-9 items-center justify-center rounded-lg text-default-500 hover:bg-default-100 hover:text-destructive sm:col-start-3"><X className="h-4 w-4" /></button>
                    </div>
                    <RuleFields rule={g} onChange={(data) => setGrupo(i, data)} />
                  </li>
                );
              })}
            </ul>
          )}
          <datalist id="stock-categorias">{categoryOptions.map((c) => <option key={c} value={c} />)}</datalist>
        </Card>

        <Card title="Productos" tip="Stock en el sistema (sin descontar reservas). Cada producto puede tener su propia política, tope, plazo o aviso de stock bajo.">
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
              <select aria-label="Filtro" className={cn(inputClass, "w-auto min-w-[170px]")} value={filter} onChange={(e) => setFilter(e.target.value)}>
                <option value="visibles">Visibles en la tienda</option>
                <option value="sin_stock">Sin stock</option>
                <option value="bajo">Stock bajo</option>
                <option value="bajo_pedido">Con pedido sin stock</option>
                <option value="excepciones">Con excepción</option>
                <option value="todos">Todos</option>
              </select>
            </div>

            {productsState.loading && !products.length ? <p className="py-8 text-center text-sm text-default-500">Cargando productos…</p> : pageRows.length === 0 ? (
              <div className="py-8 text-center text-sm text-default-500">
                <p>No hay productos para mostrar.</p>
                {!productsState.all && filter !== "visibles" ? <Btn className="mt-3" size="sm" onClick={onLoadAll} disabled={productsState.loading}>Cargar todo el catálogo</Btn> : null}
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full min-w-[760px] text-sm">
                  <thead className="bg-default-50 text-left text-xs text-default-500">
                    <tr>
                      <th className="px-4 py-2.5 font-medium">Producto</th>
                      <th className="px-3 py-2.5 text-right font-medium">Stock</th>
                      <th className="px-3 py-2.5 font-medium">Política</th>
                      <th className="px-3 py-2.5 font-medium">En la tienda</th>
                      <th className="px-3 py-2.5 text-right font-medium">Excepción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {pageRows.map((row) => {
                      const { p, info } = row;
                      const own = ruleOf(p.id);
                      const open = openId === p.id;
                      return (
                        <tr key={p.id} className={cn("align-top", p.estadoTienda !== "Activo" && "opacity-60")}>
                          <td className="max-w-[300px] px-4 py-3">
                            <p className="truncate font-medium">{p.nombre || "Sin nombre"}</p>
                            <p className="truncate text-xs text-default-500">{[p.codigo, p.categoria, p.estadoTienda !== "Activo" ? "Oculto en la tienda" : ""].filter(Boolean).join(" · ")}</p>
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums">{info.stock}</td>
                          <td className="px-3 py-3">
                            <span className="font-medium">{POLICY_SHORT[info.politica]}</span>
                            <span className="block text-xs text-default-400">{SOURCE_LABEL[info.source]}{info.combo ? " · combo" : ""}</span>
                          </td>
                          <td className="px-3 py-3">{statusOf(row)}</td>
                          <td className="px-3 py-3 text-right">
                            <Btn size="sm" variant={own ? "primary" : "secondary"} onClick={() => setOpenId(open ? null : p.id)}>{own ? "Editar" : "Definir"}</Btn>
                            {open ? (
                              <div className="mt-3 w-[300px] space-y-3 rounded-lg border border-border bg-card p-3 text-left shadow-sm sm:ml-auto">
                                <RuleFields rule={{ ...emptyRule, ...own }} onChange={(data) => setRule(p.id, data)} />
                                {own ? <Btn size="sm" variant="ghost" onClick={() => { setRule(p.id, null); setOpenId(null); }}>Quitar excepción</Btn> : null}
                              </div>
                            ) : null}
                          </td>
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
                {pages > 1 ? (<>
                  <Btn size="sm" disabled={page === 0} onClick={() => setPage((n) => n - 1)}>Anterior</Btn>
                  <span className="tabular-nums">{page + 1} / {pages}</span>
                  <Btn size="sm" disabled={page >= pages - 1} onClick={() => setPage((n) => n + 1)}>Siguiente</Btn>
                </>) : null}
              </div>
            </div>
          </div>
        </Card>

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
                      <div className="min-w-0"><p>{item.summary.join(" · ")}</p><p className="text-xs text-default-500">{when(item.at)}{item.by ? ` · ${item.by}` : ""}</p></div>
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
