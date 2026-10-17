"use client";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Btn, Field, inputClass, inputErrorClass } from "@/components/panel-ui/ui";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DESTINOS, DESTINOS_MADERAS, DESTINO_OTRO, destinoSelect, sameDestino } from "@/lib/tienda-web-ui";

export { Btn, Chip, Field, Segmented, UnitInput, inputClass, inputErrorClass } from "@/components/panel-ui/ui";

/** Destino de un enlace: opciones comunes, categorías de la tienda y "otro enlace". */
export function DestinoField({ value, onChange, categories = [], error, label = "Al hacer clic lleva a" }) {
  const categoryOptions = categories.map((c) => ({ value: `/shop?category=${encodeURIComponent(c)}`, label: `Categoría ${c}` }));
  const known = [...DESTINOS, ...DESTINOS_MADERAS, ...categoryOptions];
  const matched = known.find((d) => sameDestino(d.value, value));
  const current = matched ? matched.value : DESTINO_OTRO;
  const [custom, setCustom] = useState(!matched && Boolean(value) && destinoSelect(value) === DESTINO_OTRO);
  const showCustom = custom || current === DESTINO_OTRO;
  return (
    <Field label={label} error={error} hint={showCustom ? "Una dirección de la tienda (por ejemplo /obras) o un enlace completo https://…" : undefined}>
      <select
        className={cn(inputClass, error && inputErrorClass)}
        value={showCustom ? DESTINO_OTRO : current}
        onChange={(e) => {
          if (e.target.value === DESTINO_OTRO) { setCustom(true); return; }
          setCustom(false);
          onChange(e.target.value);
        }}
      >
        {DESTINOS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
        <optgroup label="Maderas">
          {DESTINOS_MADERAS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
        </optgroup>
        {categoryOptions.length > 0 && (
          <optgroup label="Categorías">
            {categoryOptions.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
          </optgroup>
        )}
        <option value={DESTINO_OTRO}>Otro enlace…</option>
      </select>
      {showCustom && <input className={cn(inputClass, "mt-2", error && inputErrorClass)} value={value} onChange={(e) => onChange(e.target.value)} placeholder="/shop o https://…" />}
    </Field>
  );
}

/** Panel lateral de edición con acciones de duplicar y eliminar (con confirmación). */
export function EditorSheet({ open, onOpenChange, title, subtitle, children, onDuplicate, onDelete, deleteMessage }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="flex w-full max-w-none flex-col gap-0 p-0 sm:max-w-xl" onOpenAutoFocus={(e) => e.preventDefault()} closeIcon={<span aria-hidden className="text-lg leading-none">×</span>}>
          <div className="border-b border-border px-6 py-4 pr-12">
            <SheetTitle className="text-base">{title}</SheetTitle>
            <SheetDescription className="mt-0.5">{subtitle}</SheetDescription>
          </div>
          <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">{children}</div>
          <div className="flex items-center justify-between gap-2 border-t border-border px-6 py-3">
            <div className="flex gap-1">
              {onDuplicate && <Btn variant="ghost" size="sm" onClick={() => { onDuplicate(); onOpenChange(false); }}>Duplicar</Btn>}
              {onDelete && <Btn variant="danger" size="sm" onClick={() => setConfirming(true)}>Eliminar</Btn>}
            </div>
            <Btn variant="primary" onClick={() => onOpenChange(false)}>Listo</Btn>
          </div>
        </SheetContent>
      </Sheet>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este elemento?</AlertDialogTitle>
            <AlertDialogDescription>{deleteMessage || "Se quita de la tienda cuando guardes los cambios."}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setConfirming(false); onOpenChange(false); onDelete(); }}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
