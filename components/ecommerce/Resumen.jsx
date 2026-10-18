"use client";
import { cn } from "@/lib/utils";
import { money, shortDay } from "./format";

function Panel({ title, hint, children, className }) {
  return (
    <section className={cn("rounded-xl border border-border bg-card", className)}>
      <header className="flex items-baseline justify-between gap-3 border-b border-border px-5 py-3.5">
        <h3 className="text-sm font-semibold">{title}</h3>
        {hint ? <span className="text-xs text-default-500">{hint}</span> : null}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

/** Ventas por día: una línea fina con su área, sin ejes ni cuadrículas. Cada día tiene su detalle al pasar el mouse. */
function LineChart({ data }) {
  const max = Math.max(1, ...data.map((d) => d.total));
  const n = data.length;
  if (n === 0 || data.every((d) => d.total === 0)) return <p className="py-10 text-center text-sm text-default-500">Sin ventas pagadas en el período.</p>;
  const x = (i) => (n === 1 ? 50 : (i / (n - 1)) * 100);
  const y = (v) => 36 - (v / max) * 32;
  const line = data.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(2)},${y(d.total).toFixed(2)}`).join(" ");
  return (
    <div>
      <div className="relative h-44 w-full">
        <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="h-full w-full overflow-visible text-foreground" role="img" aria-label="Ventas por día">
          <path d={`${line} L${x(n - 1)},40 L${x(0)},40 Z`} className="fill-current opacity-[0.06]" />
          <path d={line} fill="none" stroke="currentColor" strokeWidth="1.4" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
        <div className="absolute inset-0 flex">
          {data.map((d) => (
            <div key={d.dia} className="h-full flex-1" title={`${shortDay(d.dia)} · ${money(d.total)}`} />
          ))}
        </div>
      </div>
      <div className="mt-2 flex justify-between text-xs tabular-nums text-default-500">
        <span>{shortDay(data[0].dia)}</span>
        <span>Máximo {money(max)}</span>
        <span>{shortDay(data[n - 1].dia)}</span>
      </div>
    </div>
  );
}

function Split({ items }) {
  const total = items.reduce((s, i) => s + i.pedidos, 0);
  if (total === 0) return <p className="text-sm text-default-500">Sin pedidos.</p>;
  const shades = ["bg-foreground", "bg-default-400", "bg-default-300"];
  return (
    <div className="space-y-3">
      <div className="flex h-1.5 overflow-hidden rounded-full bg-default-100">
        {items.map((i, idx) => <span key={i.value} className={shades[idx % shades.length]} style={{ width: `${(i.pedidos / total) * 100}%` }} />)}
      </div>
      <ul className="space-y-1.5 text-sm">
        {items.map((i, idx) => (
          <li key={i.value} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2"><span className={cn("h-2 w-2 rounded-full", shades[idx % shades.length])} />{i.label}</span>
            <span className="tabular-nums text-default-600">{i.pedidos} <span className="text-default-400">· {Math.round((i.pedidos / total) * 100)} %</span></span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Resumen({ resumen, loading }) {
  if (!resumen) return <p className="py-16 text-center text-sm text-default-500">{loading ? "Cargando estadísticas…" : "No hay estadísticas para mostrar."}</p>;
  const r = resumen;
  const maxUnits = Math.max(1, ...r.topProductos.map((p) => p.unidades));
  return (
    <div className={cn("grid gap-4 transition-opacity lg:grid-cols-3", loading && "opacity-60")}>
      <Panel title="Ventas por día" hint="Pedidos pagados" className="lg:col-span-2">
        <LineChart data={r.serie} />
      </Panel>
      <Panel title="Estado" hint="Del período">
        <dl className="space-y-3 text-sm">
          {[["Por cobrar", `${money(r.porCobrar)} · ${r.porCobrarPedidos}`], ["A reponer", r.aReponer], ["Anuladas", r.anuladas], ["Clientes nuevos", r.clientes.nuevos]].map(([label, value]) => (
            <div key={label} className="flex items-center justify-between gap-3 border-b border-border pb-3 last:border-0 last:pb-0">
              <dt className="text-default-500">{label}</dt>
              <dd className="font-medium tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      </Panel>
      <Panel title="Más vendidos" hint="Unidades" className="lg:col-span-2">
        {r.topProductos.length === 0 ? <p className="py-6 text-center text-sm text-default-500">Sin ventas en el período.</p> : (
          <ol className="space-y-3">
            {r.topProductos.map((p, i) => (
              <li key={p.id || p.nombre} className="grid grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 text-sm">
                <span className="text-xs tabular-nums text-default-400">{i + 1}</span>
                <span className="truncate">{p.nombre}</span>
                <span className="text-right tabular-nums"><span className="font-medium">{p.unidades.toLocaleString("es-AR")}</span> <span className="text-default-400">· {money(p.ingresos)}</span></span>
                <span />
                <span className="col-span-2 block h-1 overflow-hidden rounded-full bg-default-100"><span className="block h-full rounded-full bg-foreground" style={{ width: `${(p.unidades / maxUnits) * 100}%` }} /></span>
              </li>
            ))}
          </ol>
        )}
      </Panel>
      <div className="grid gap-4">
        <Panel title="Descuentos registrados" hint="Pedidos pagados · sin anuladas">
          <dl className="space-y-2 text-sm">
            {[["Producto", money(r.descuentos?.producto || 0)], ["Forma de pago", money(r.descuentos?.pago || 0)], ["Total", money(r.descuentos?.total || 0)], ["Pedidos a revisar (no anulados)", r.descuentos?.revisar || 0]].map(([label, value]) => <div key={label} className="flex justify-between gap-3"><dt className="text-default-500">{label}</dt><dd className="tabular-nums">{value}</dd></div>)}
          </dl>
        </Panel>
        <Panel title="Forma de pago"><Split items={r.pagos} /></Panel>
        <Panel title="Entrega"><Split items={r.entregas} /></Panel>
      </div>
    </div>
  );
}
