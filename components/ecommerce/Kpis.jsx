"use client";
import { cn } from "@/lib/utils";
import { money, variation } from "./format";

function Cell({ label, value, sub, delta, loading }) {
  return (
    <div className="min-w-0 px-5 py-4">
      <p className="text-xs text-default-500">{label}</p>
      <p className={cn("mt-1 truncate text-2xl font-semibold tabular-nums tracking-tight transition-opacity", loading && "opacity-40")}>{value}</p>
      <p className="mt-0.5 flex items-center gap-2 truncate text-xs text-default-500">
        {delta ? <span className={cn("font-medium tabular-nums", delta.startsWith("+") ? "text-emerald-700" : delta.startsWith("−") ? "text-amber-700" : "")}>{delta}</span> : null}
        <span className="truncate">{sub}</span>
      </p>
    </div>
  );
}

/** Tira de cifras clave del período: una sola fila fina, sin tarjetas separadas. */
export default function Kpis({ resumen, loading }) {
  const r = resumen;
  const v = r?.variacion;
  return (
    <section aria-label="Resumen del período" className="grid grid-cols-2 divide-x divide-y divide-border overflow-hidden rounded-xl border border-border bg-card sm:divide-y-0 lg:grid-cols-4">
      <Cell label="Vendido" loading={loading} value={r ? money(r.vendido) : "—"} delta={variation(v?.vendido)} sub={r && r.porCobrar > 0 ? `Por cobrar ${money(r.porCobrar)}` : "Pedidos pagados"} />
      <Cell label="Pedidos" loading={loading} value={r ? r.pedidos.toLocaleString("es-AR") : "—"} delta={variation(v?.pedidos)} sub={r ? `${r.pagados} pagados${r.aReponer ? ` · ${r.aReponer} a reponer` : ""}` : ""} />
      <Cell label="Ticket promedio" loading={loading} value={r ? money(r.ticket) : "—"} delta={variation(v?.ticket)} sub="Por pedido pagado" />
      <Cell label="Clientes" loading={loading} value={r ? r.clientes.total.toLocaleString("es-AR") : "—"} sub={r ? `${r.clientes.nuevos > 0 ? "+" : ""}${r.clientes.nuevos} en el período` : ""} />
    </section>
  );
}
