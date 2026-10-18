"use client";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Btn, Chip, inputClass } from "@/components/panel-ui/ui";
import { DESCUENTOS, describeDescuentos, ENTREGAS, ESTADOS, LIMITES, PAGOS } from "@/lib/ecommerce-panel";
import { formatDate, money } from "./format";

const label = (list, value) => list.find((o) => o.value === value)?.label || (value ? String(value).charAt(0).toUpperCase() + String(value).slice(1) : "");
const COLUMNS = [
  { key: "numero", label: "Pedido" },
  { key: "fecha", label: "Fecha" },
  { key: "cliente", label: "Cliente" },
  { key: "productos", label: "Productos", sortable: false },
  { key: "pago", label: "Pago" },
  { key: "estado", label: "Estado" },
  { key: "entrega", label: "Entrega", sortable: false },
  { key: "total", label: "Total", align: "right" },
];

export function StateChips({ row }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {row.anulada ? <Chip tone="bad">Anulada</Chip> : <Chip tone={row.estadoPago === "pagado" ? "ok" : "warn"}>{label(ESTADOS, row.estadoPago)}</Chip>}
      {row.aReponer && !row.anulada ? <Chip>A reponer</Chip> : null}
      {row.desc?.revisar ? <Chip tone="warn">Revisar importes</Chip> : null}
    </span>
  );
}

function SortHead({ column, sort, onSort }) {
  const active = sort.key === column.key;
  const Icon = !active ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
  const align = column.align === "right" ? "justify-end text-right" : "";
  if (column.sortable === false) return <span className={cn("flex", align)}>{column.label}</span>;
  return (
    <button type="button" onClick={() => onSort(column.key)} aria-label={`Ordenar por ${column.label}`} className={cn("-mx-1 flex items-center gap-1 rounded px-1 transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40", align, active && "text-foreground")}>
      {column.label}
      <Icon className={cn("h-3 w-3", !active && "opacity-40")} />
    </button>
  );
}

export default function VentasTable({ data, loading, filters, onFilters, sort, onSort, onPage, onLimit, onOpen, onClear }) {
  const items = data?.items || [];
  const total = data?.total || 0;
  const limit = data?.limite || 25;
  const page = data?.pagina || 1;
  const first = total === 0 ? 0 : (page - 1) * limit + 1;
  const last = Math.min(total, page * limit);
  const active = [
    filters.q && { key: "q", text: `“${filters.q}”` },
    filters.estado && { key: "estado", text: label(ESTADOS, filters.estado) },
    filters.pago && { key: "pago", text: label(PAGOS, filters.pago) },
    filters.entrega && { key: "entrega", text: label(ENTREGAS, filters.entrega) },
    filters.reponer && { key: "reponer", text: "A reponer" },
    filters.anuladas && { key: "anuladas", text: "Mostrar anuladas" },
    filters.descuento && { key: "descuento", text: label(DESCUENTOS, filters.descuento) },
  ].filter(Boolean);
  const select = (key, options, all) => (
    <select aria-label={all} className={cn(inputClass, "w-auto min-w-[140px]")} value={filters[key] || ""} onChange={(e) => onFilters({ [key]: e.target.value })}>
      <option value="">{all}</option>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-default-400" />
          <input aria-label="Buscar" className={cn(inputClass, "pl-9")} placeholder="Buscar por pedido, cliente, email o producto" value={filters.q} onChange={(e) => onFilters({ q: e.target.value })} />
        </div>
        {select("estado", ESTADOS, "Todos los estados")}
        {select("pago", PAGOS, "Todos los pagos")}
        {select("entrega", ENTREGAS, "Toda entrega")}
        {select("descuento", DESCUENTOS, "Todos los descuentos")}
        <label className="flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm">
          <input type="checkbox" className="h-4 w-4 accent-primary" checked={Boolean(filters.anuladas)} onChange={(e) => onFilters({ anuladas: e.target.checked })} />
          Mostrar anuladas
        </label>
        <label className="flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm">
          <input type="checkbox" className="h-4 w-4 accent-primary" checked={filters.reponer} onChange={(e) => onFilters({ reponer: e.target.checked })} />
          A reponer
        </label>
      </div>

      {active.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {active.map((chip) => (
            <button key={chip.key} type="button" onClick={() => onFilters({ [chip.key]: ["reponer", "anuladas"].includes(chip.key) ? false : "" })} className="inline-flex items-center gap-1 rounded-full bg-default-100 py-1 pl-2.5 pr-1.5 text-xs text-default-700 transition hover:bg-default-200" aria-label={`Quitar filtro ${chip.text}`}>
              {chip.text}<X className="h-3 w-3" />
            </button>
          ))}
          <Btn size="sm" variant="ghost" onClick={onClear}>Limpiar</Btn>
        </div>
      ) : null}

      <div className={cn("overflow-x-auto rounded-xl border border-border bg-card transition-opacity", loading && "opacity-60")} aria-busy={loading}>
        <table className="w-full min-w-[900px] text-sm">
          <thead className="border-b border-border bg-default-50 text-left text-xs font-medium text-default-500">
            <tr>
              {COLUMNS.map((c) => <th key={c.key} scope="col" className={cn("whitespace-nowrap px-4 py-3", c.align === "right" && "text-right")}><SortHead column={c} sort={sort} onSort={onSort} /></th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.map((row) => {
              const lead = row.productos[0];
              return (
                <tr key={row.id} tabIndex={0} onClick={() => onOpen(row)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(row); } }} className={cn("cursor-pointer transition-colors hover:bg-default-50 focus-visible:bg-default-50 focus-visible:outline-none", row.anulada && "text-default-400")}>
                  <td className="whitespace-nowrap px-4 py-3 font-medium">{row.numero}</td>
                  <td className="whitespace-nowrap px-4 py-3 tabular-nums text-default-600">{formatDate(row.fecha)}</td>
                  <td className="max-w-[240px] px-4 py-3">
                    <p className="truncate">{row.cliente.nombre || "Sin nombre"}</p>
                    <p className="truncate text-xs text-default-500">{row.cliente.email}</p>
                  </td>
                  <td className="max-w-[260px] px-4 py-3">
                    <p className="truncate">{lead ? lead.nombre : "—"}</p>
                    <p className="text-xs text-default-500">{row.unidades} u.{row.productos.length > 1 ? ` · +${row.productos.length - 1} más` : ""}</p>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-default-600">{label(PAGOS, row.pago) || "—"}</td>
                  <td className="px-4 py-3"><StateChips row={row} /></td>
                  <td className="whitespace-nowrap px-4 py-3 text-default-600">{label(ENTREGAS, row.entrega)}</td>
                  <td className="px-4 py-3 text-right tabular-nums"><p className="whitespace-nowrap font-semibold">{money(row.total)}</p>{describeDescuentos(row.desc).map((part) => <p key={part.key} className="mt-1 text-xs text-default-500">−{money(part.monto)} · {part.label}{part.pct != null ? ` ${part.pct.toLocaleString("es-AR")} %` : ""}</p>)}{Math.abs(row.desc?.diferencia || 0) > 1 && <p className="mt-1 text-xs text-default-500">Diferencia: {money(row.desc.diferencia)}</p>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {items.length === 0 ? (
          <div className="px-4 py-16 text-center text-sm text-default-500">
            {loading ? "Cargando ventas…" : (<><p>No hay ventas para mostrar.</p>{active.length > 0 ? <Btn className="mt-3" size="sm" onClick={onClear}>Limpiar filtros</Btn> : null}</>)}
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-default-500">
        <span className="tabular-nums">{total === 0 ? "Sin resultados" : `${first}–${last} de ${total.toLocaleString("es-AR")}`}</span>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2">
            Filas
            <select aria-label="Filas por página" className={cn(inputClass, "h-8 w-auto px-2 text-xs")} value={limit} onChange={(e) => onLimit(Number(e.target.value))}>
              {LIMITES.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <div className="flex items-center gap-1">
            <Btn size="sm" aria-label="Página anterior" disabled={page <= 1} onClick={() => onPage(page - 1)}><ChevronLeft className="h-4 w-4" /></Btn>
            <span className="min-w-[56px] text-center tabular-nums">{page} / {data?.paginas || 1}</span>
            <Btn size="sm" aria-label="Página siguiente" disabled={page >= (data?.paginas || 1)} onClick={() => onPage(page + 1)}><ChevronRight className="h-4 w-4" /></Btn>
          </div>
        </div>
      </div>
    </section>
  );
}
