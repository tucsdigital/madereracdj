"use client";
import { cn } from "@/lib/utils";
import { Field, inputClass, inputErrorClass } from "./ui";

const MENSAJES = [
  ["mensajeGeneral", "Botón flotante de WhatsApp", "Se envía al tocar el botón verde que acompaña a los visitantes."],
  ["mensajeMenu", "Botón “Consultar” del menú", "Se envía al tocar “Consultar” en la barra superior."],
  ["mensajeAsesoria", "Asesoramiento y obras", "Se envía desde las secciones de asesoramiento y de obras a medida."],
];

export default function ContactoForm({ contacto, error, onChange }) {
  const digits = (contacto.whatsapp || "").replace(/\D/g, "");
  return (
    <div className="space-y-6 rounded-xl border border-border bg-card p-6">
      <Field label="WhatsApp" error={error} hint="Con código de país y sin signos. Ej.: 541121781148. Es el mismo número para toda la tienda." htmlFor="contacto-wa">
        <div className="flex gap-2">
          <input id="contacto-wa" inputMode="tel" className={cn(inputClass, error && inputErrorClass)} value={contacto.whatsapp} onChange={(e) => onChange({ whatsapp: e.target.value })} placeholder="541121781148" />
          {digits.length >= 10 && (
            <a href={`https://wa.me/${digits}`} target="_blank" rel="noreferrer"
              className="inline-flex h-10 shrink-0 items-center rounded-lg border border-border px-4 text-sm font-medium hover:bg-default-100">
              Probar
            </a>
          )}
        </div>
      </Field>
      {!digits && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">Sin número, los botones de WhatsApp no se muestran en la tienda.</p>}

      <div className="space-y-4 border-t border-border pt-6">
        <div>
          <h3 className="text-sm font-semibold">Mensajes predeterminados</h3>
          <p className="text-xs text-default-500">Es el texto que ya viene escrito cuando el cliente abre WhatsApp.</p>
        </div>
        {MENSAJES.map(([key, label, help]) => (
          <Field key={key} label={label} hint={help} htmlFor={`contacto-${key}`}>
            <input id={`contacto-${key}`} className={inputClass} value={contacto[key]} onChange={(e) => onChange({ [key]: e.target.value })} />
          </Field>
        ))}
      </div>
    </div>
  );
}
