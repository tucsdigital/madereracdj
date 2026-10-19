"use client";
import { cn } from "@/lib/utils";
import { Field, inputClass, inputErrorClass } from "./ui";

const BANCO = [
  ["titular", "Titular de la cuenta", "Nombre o razón social que verá el cliente.", "Maderas Caballero S.A."],
  ["banco", "Banco o billetera", "", "Banco Galicia"],
  ["tipoCuenta", "Tipo de cuenta", "", "Cuenta corriente"],
  ["cuit", "CUIT / CUIL", "11 dígitos, sin guiones.", "30123456789"],
];

export default function TransferenciaForm({ transferencia, efectivo, issues = [], onChange, onEfectivoChange }) {
  const error = (field) => issues.find((i) => i.scope === "transferencia" && i.field === field)?.message;
  return (
    <div className="space-y-6 rounded-xl border border-border bg-card p-6">
      <div className="space-y-3 border-b border-border pb-6">
        <h3 className="text-sm font-semibold">Pago en efectivo</h3>
        <Field label="Descuento por pagar en efectivo (%)" hint="Se aplica sobre el neto de los productos, sin incluir el envío. Usá 0 para no ofrecer descuento." htmlFor="efectivo-descuento">
          <input id="efectivo-descuento" inputMode="decimal" className={cn(inputClass, "max-w-[160px]")} value={efectivo?.descuentoPct ?? 0} onChange={(e) => onEfectivoChange?.({ descuentoPct: e.target.value })} placeholder="0" />
        </Field>
        <p className="text-xs text-default-500">El cliente paga al recibir el pedido o al retirarlo en la sucursal.</p>
      </div>

      <Field label="Descuento por pagar con transferencia (%)" hint="Se aplica sobre el neto de los productos, en el carrito y al finalizar la compra. Usá 0 para no ofrecer descuento." htmlFor="transferencia-descuento">
        <input id="transferencia-descuento" inputMode="decimal" className={cn(inputClass, "max-w-[160px]")} value={transferencia.descuentoPct} onChange={(e) => onChange({ descuentoPct: e.target.value })} placeholder="10" />
      </Field>

      <div className="space-y-4 border-t border-border pt-6">
        <div>
          <h3 className="text-sm font-semibold">Datos bancarios</h3>
          <p className="text-xs text-default-500">Se muestran únicamente a quien termina una compra por transferencia. Dejá vacío lo que no uses.</p>
        </div>
        {BANCO.map(([key, label, hint, placeholder]) => (
          <Field key={key} label={label} hint={hint} error={error(key)} htmlFor={`transferencia-${key}`}>
            <input id={`transferencia-${key}`} className={cn(inputClass, error(key) && inputErrorClass)} value={transferencia[key]} onChange={(e) => onChange({ [key]: e.target.value })} placeholder={placeholder} />
          </Field>
        ))}
        <Field label="CBU / CVU" hint="22 dígitos." error={error("cbu")} htmlFor="transferencia-cbu">
          <input id="transferencia-cbu" inputMode="numeric" className={cn(inputClass, error("cbu") && inputErrorClass)} value={transferencia.cbu} onChange={(e) => onChange({ cbu: e.target.value })} placeholder="0000000000000000000000" />
        </Field>
        <Field label="Alias" hint="Entre 6 y 20 caracteres." error={error("alias")} htmlFor="transferencia-alias">
          <input id="transferencia-alias" className={cn(inputClass, error("alias") && inputErrorClass)} value={transferencia.alias} onChange={(e) => onChange({ alias: e.target.value })} placeholder="maderas.caballero" />
        </Field>
      </div>

      <div className="space-y-4 border-t border-border pt-6">
        <Field label="Plazo de la reserva (horas)" hint="Tiempo que el cliente tiene para transferir y enviar el comprobante." htmlFor="transferencia-plazo">
          <input id="transferencia-plazo" inputMode="numeric" className={cn(inputClass, "max-w-[160px]")} value={transferencia.plazoHoras} onChange={(e) => onChange({ plazoHoras: e.target.value })} placeholder="24" />
        </Field>
        <Field label="Indicaciones adicionales" hint="Opcional. Por ejemplo: “Indicá tu número de pedido en el concepto”." htmlFor="transferencia-instrucciones">
          <textarea id="transferencia-instrucciones" rows={3} className={inputClass} value={transferencia.instrucciones} onChange={(e) => onChange({ instrucciones: e.target.value })} />
        </Field>
      </div>

      {!transferencia.cbu && !transferencia.alias && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">Sin CBU ni alias, el cliente no sabrá a dónde transferir.</p>}
    </div>
  );
}
