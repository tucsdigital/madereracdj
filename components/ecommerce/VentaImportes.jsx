import { describeDescuentos } from "@/lib/ecommerce-panel";
import { money } from "./format";

export default function VentaImportes({ venta: v }) {
  const d = v.desc;
  const row = (label, value) => <div key={label} className="flex justify-between gap-4"><dt className="text-default-500">{label}</dt><dd className="text-right tabular-nums">{value}</dd></div>;
  return <div className="space-y-3 text-sm">
    <dl className="space-y-2">
      {row("Subtotal de productos", money(v.subtotal))}
      {describeDescuentos(d).map((part) => row(`Descuento ${part.label.toLowerCase()}${part.pct != null ? ` (${part.pct.toLocaleString("es-AR")} %)` : ""}`, `−${money(part.monto)}`))}
      {d.total === 0 && row("Descuentos registrados", "Sin descuento registrado")}
      {d.iva !== 0 && row("IVA registrado", money(d.iva))}
      {d.recargo !== 0 && row("Recargo por transferencia", money(d.recargo))}
      {row("Envío", v.envio > 0 ? money(v.envio) : v.entrega === "cotizar" ? "A cotizar · no incluido" : v.entrega === "retiro" ? "Retiro en local" : "Sin cargo registrado")}
      {d.diferencia !== 0 && row(Math.abs(d.diferencia) <= 1 ? "Ajuste de redondeo" : "Diferencia sin conciliar", `${d.diferencia < 0 ? "−" : "+"}${money(Math.abs(d.diferencia))}`)}
      <div className="flex justify-between gap-4 border-t border-border pt-2 font-semibold"><dt>Total registrado</dt><dd className="tabular-nums">{money(v.total)}</dd></div>
    </dl>
    {d.revisar && <div className="rounded-lg bg-default-100 p-3 text-xs leading-5" role="status"><p className="font-semibold">Importes a revisar</p><ul className="list-inside list-disc">{d.motivos.map((motivo) => <li key={motivo}>{motivo}</li>)}</ul></div>}
    {d.producto > 0 && <p className="text-xs text-default-500">Los precios netos de los productos ya incluyen sus descuentos. El descuento por forma de pago se aplica después, sobre el neto de productos.</p>}
  </div>;
}
