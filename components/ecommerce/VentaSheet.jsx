"use client";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Btn } from "@/components/panel-ui/ui";
import { ENTREGAS, PAGOS } from "@/lib/ecommerce-panel";
import { StateChips } from "./VentasTable";
import { formatDate, money } from "./format";
import VentaImportes from "./VentaImportes";

const label = (list, value) => list.find((o) => o.value === value)?.label || (value ? String(value).charAt(0).toUpperCase() + String(value).slice(1) : "") || "—";

function Block({ title, children }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-medium uppercase tracking-wide text-default-500">{title}</h3>
      {children}
    </section>
  );
}
const Row = ({ k, v, strong }) => (
  <div className="flex items-start justify-between gap-4 text-sm">
    <dt className="text-default-500">{k}</dt>
    <dd className={strong ? "font-semibold tabular-nums" : "text-right tabular-nums"}>{v}</dd>
  </div>
);

export default function VentaSheet({ venta, onClose }) {
  const v = venta;
  return (
    <Sheet open={Boolean(v)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent className="flex w-full max-w-none flex-col gap-0 p-0 sm:max-w-md" onOpenAutoFocus={(e) => e.preventDefault()} closeIcon={<span aria-hidden className="text-lg leading-none">×</span>}>
        {v ? (
          <>
            <div className="space-y-2 border-b border-border px-6 py-4 pr-12">
              <SheetTitle className="text-base">{v.numero}</SheetTitle>
              <SheetDescription className="flex flex-wrap items-center gap-2 text-xs">
                {formatDate(v.fecha)} <StateChips row={v} />
              </SheetDescription>
            </div>
            <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
              <Block title="Cliente">
                <p className="text-sm font-medium">{v.cliente.nombre || "Sin nombre"}</p>
                <p className="text-sm text-default-500">{[v.cliente.email, v.cliente.telefono].filter(Boolean).join(" · ")}</p>
              </Block>
              <Block title="Productos">
                <ul className="divide-y divide-border">
                  {v.productos.map((p, i) => (
                    <li key={`${p.id}-${i}`} className="flex items-start justify-between gap-4 py-2.5 text-sm first:pt-0">
                      <div className="min-w-0">
                        <p className="font-medium">{p.nombre}</p>
                         <p className="text-xs text-default-500">{p.cantidad} × {money(p.precio)}{p.sinStock > 0 ? ` · ${p.sinStock} bajo pedido` : ""}</p>
                         {p.descuentoMonto > 0 && <p className="text-xs text-default-500">Descuento de línea: −{money(p.descuentoMonto)}</p>}
                      </div>
                      <span className="shrink-0 tabular-nums">{money(p.total)}</span>
                    </li>
                  ))}
                </ul>
              </Block>
              <Block title="Importes">
                <VentaImportes venta={v} />
              </Block>
              <Block title="Pago y entrega">
                <dl className="space-y-1.5">
                  <Row k="Pago" v={label(PAGOS, v.pago)} />
                  <Row k="Entrega" v={label(ENTREGAS, v.entrega)} />
                  {v.direccion ? <Row k={v.entrega === "retiro" ? "Sucursal" : "Dirección"} v={v.direccion} /> : null}
                  {v.referencia ? <Row k="Referencia" v={v.referencia} /> : null}
                </dl>
              </Block>
            </div>
            <div className="flex justify-end border-t border-border px-6 py-3">
              <Link href={`/ventas/${v.id}`}>
                <Btn variant="primary">Abrir venta <ArrowUpRight className="h-4 w-4" /></Btn>
              </Link>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
