"use client";

import { Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Field, inputClass, inputErrorClass } from "./ui";

const MENSAJES = [
  ["mensajeGeneral", "Botón flotante de WhatsApp", "Se envía al tocar el botón verde que acompaña a los visitantes."],
  ["mensajeMenu", "Botón “Consultar” del menú", "Se envía al tocar “Consultar” en la barra superior."],
  ["mensajeAsesoria", "Asesoramiento y obras", "Se envía desde las secciones de asesoramiento y de obras a medida."],
];

export default function ContactoForm({ contacto, issues = [], onChange }) {
  const digits = (contacto.whatsapp || "").replace(/\D/g, "");
  const errorFor = (field) => issues.find((issue) => issue.field === field)?.message;
  const updateRow = (key, index, patch) => onChange({
    [key]: (contacto[key] || []).map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row),
  });

  return (
    <div className="space-y-6 rounded-xl border border-border bg-card p-6">
      <section className="space-y-4">
        <div>
          <h2 className="text-sm font-semibold">Datos de contacto</h2>
          <p className="mt-1 text-xs text-default-500">Se usan en el inicio, las páginas de obras y los formularios de toda la tienda.</p>
        </div>
        <Field label="WhatsApp" error={errorFor("whatsapp")} hint="Con código de país y sin signos." htmlFor="contacto-wa">
          <div className="flex gap-2">
            <input id="contacto-wa" inputMode="tel" className={cn(inputClass, errorFor("whatsapp") && inputErrorClass)} value={contacto.whatsapp} onChange={(e) => onChange({ whatsapp: e.target.value })} placeholder="541121781148" />
            {digits.length >= 10 && <a href={`https://wa.me/${digits}`} target="_blank" rel="noreferrer" className="inline-flex h-10 shrink-0 items-center rounded-lg border border-border px-4 text-sm font-medium hover:bg-default-100">Probar</a>}
          </div>
        </Field>
        {!digits && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">Sin número, los botones de WhatsApp no se muestran en la tienda.</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Teléfono visible" error={errorFor("telefono")} htmlFor="contacto-telefono">
            <input id="contacto-telefono" type="tel" className={cn(inputClass, errorFor("telefono") && inputErrorClass)} value={contacto.telefono} onChange={(e) => onChange({ telefono: e.target.value })} placeholder="011 2178-1148" />
          </Field>
          <Field label="Email" error={errorFor("email")} htmlFor="contacto-email">
            <input id="contacto-email" type="email" className={cn(inputClass, errorFor("email") && inputErrorClass)} value={contacto.email} onChange={(e) => onChange({ email: e.target.value })} placeholder="info@ejemplo.com" />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Dirección" htmlFor="contacto-direccion">
              <input id="contacto-direccion" className={inputClass} value={contacto.direccion} onChange={(e) => onChange({ direccion: e.target.value })} placeholder="Calle, localidad, provincia" />
            </Field>
          </div>
        </div>
      </section>

      <section className="space-y-4 border-t border-border pt-6">
        <div>
          <h2 className="text-sm font-semibold">Sección y formulario de contacto</h2>
          <p className="mt-1 text-xs text-default-500">Estos textos se comparten entre la página principal y todas las obras.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Antetítulo" htmlFor="contacto-eyebrow"><input id="contacto-eyebrow" className={inputClass} value={contacto.eyebrow} onChange={(e) => onChange({ eyebrow: e.target.value })} /></Field>
          <Field label="Título del formulario" htmlFor="contacto-form-title"><input id="contacto-form-title" className={inputClass} value={contacto.formTitle} onChange={(e) => onChange({ formTitle: e.target.value })} /></Field>
          <div className="sm:col-span-2">
            <Field label="Título" htmlFor="contacto-title"><input id="contacto-title" className={inputClass} value={contacto.title} onChange={(e) => onChange({ title: e.target.value })} /></Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Descripción" htmlFor="contacto-description"><textarea id="contacto-description" className={cn(inputClass, "min-h-20 resize-y")} value={contacto.description} onChange={(e) => onChange({ description: e.target.value })} /></Field>
          </div>
        </div>
      </section>

      <section className="space-y-4 border-t border-border pt-6">
        <div className="flex items-center justify-between gap-3">
          <div><h2 className="text-sm font-semibold">Horarios</h2><p className="mt-1 text-xs text-default-500">Se muestran en el contacto global de la tienda.</p></div>
          <button type="button" onClick={() => onChange({ horarios: [...(contacto.horarios || []), { day: "", hours: "" }] })} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium hover:bg-default-100"><Plus className="h-3.5 w-3.5" />Agregar horario</button>
        </div>
        <div className="space-y-3">
          {(contacto.horarios || []).map((row, index) => <div key={`horario-${index}`} className="grid items-end gap-3 sm:grid-cols-[1fr_1.5fr_auto]">
            <Field label="Día" htmlFor={`contacto-dia-${index}`}><input id={`contacto-dia-${index}`} className={inputClass} value={row.day} onChange={(e) => updateRow("horarios", index, { day: e.target.value })} /></Field>
            <Field label="Horario" htmlFor={`contacto-hora-${index}`}><input id={`contacto-hora-${index}`} className={inputClass} value={row.hours} onChange={(e) => updateRow("horarios", index, { hours: e.target.value })} /></Field>
            <button type="button" aria-label="Quitar horario" onClick={() => onChange({ horarios: contacto.horarios.filter((_, rowIndex) => rowIndex !== index) })} className="mb-0.5 flex h-9 w-9 items-center justify-center rounded-lg text-default-500 hover:bg-destructive/10 hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
          </div>)}
        </div>
      </section>

      <section className="space-y-4 border-t border-border pt-6">
        <div className="flex items-center justify-between gap-3">
          <div><h2 className="text-sm font-semibold">Redes y enlaces</h2><p className="mt-1 text-xs text-default-500">Se muestran junto a los datos de contacto en toda la tienda. Usá enlaces HTTPS.</p></div>
          <button type="button" onClick={() => onChange({ redes: [...(contacto.redes || []), { platform: "", url: "" }] })} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium hover:bg-default-100"><Plus className="h-3.5 w-3.5" />Agregar red</button>
        </div>
        <div className="space-y-3">
          {(contacto.redes || []).map((link, index) => <div key={`red-${index}`} className="grid items-end gap-3 sm:grid-cols-[1fr_2fr_auto]">
            <Field label="Red o plataforma" error={errorFor(`red-${index}-platform`)} htmlFor={`contacto-red-nombre-${index}`}><input id={`contacto-red-nombre-${index}`} className={cn(inputClass, errorFor(`red-${index}-platform`) && inputErrorClass)} value={link.platform} onChange={(e) => updateRow("redes", index, { platform: e.target.value })} placeholder="Instagram" /></Field>
            <Field label="URL" error={errorFor(`red-${index}-url`)} htmlFor={`contacto-red-url-${index}`}><input id={`contacto-red-url-${index}`} type="url" className={cn(inputClass, errorFor(`red-${index}-url`) && inputErrorClass)} value={link.url} onChange={(e) => updateRow("redes", index, { url: e.target.value })} placeholder="https://..." /></Field>
            <button type="button" aria-label="Quitar red social" onClick={() => onChange({ redes: contacto.redes.filter((_, rowIndex) => rowIndex !== index) })} className="mb-0.5 flex h-9 w-9 items-center justify-center rounded-lg text-default-500 hover:bg-destructive/10 hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
          </div>)}
        </div>
      </section>

      <section className="space-y-4 border-t border-border pt-6">
        <div>
          <h2 className="text-sm font-semibold">Mensajes predeterminados de WhatsApp</h2>
          <p className="mt-1 text-xs text-default-500">Es el texto que ya viene escrito cuando el cliente abre WhatsApp.</p>
        </div>
        {MENSAJES.map(([key, label, help]) => (
          <Field key={key} label={label} hint={help} htmlFor={`contacto-${key}`}>
            <input id={`contacto-${key}`} className={inputClass} value={contacto[key]} onChange={(e) => onChange({ [key]: e.target.value })} />
          </Field>
        ))}
      </section>
    </div>
  );
}
