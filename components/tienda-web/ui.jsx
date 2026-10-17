"use client";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
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

export const inputClass =
  "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none transition placeholder:text-default-400 focus:border-primary disabled:opacity-50";
export const inputErrorClass = "border-destructive focus:border-destructive";

const BTN = {
  primary: "bg-primary text-primary-foreground hover:bg-primary/90",
  secondary: "border border-border bg-card text-foreground hover:bg-default-100",
  ghost: "text-default-600 hover:bg-default-100",
  danger: "text-destructive hover:bg-destructive/10",
};
const BTN_SIZE = { sm: "h-8 px-3 text-xs", md: "h-9 px-4 text-sm" };

export function Btn({ variant = "secondary", size = "md", className, type = "button", ...props }) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-2 rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:pointer-events-none disabled:opacity-40",
        BTN[variant],
        BTN_SIZE[size],
        className
      )}
      {...props}
    />
  );
}

export function Field({ label, hint, error, htmlFor, className, children }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      {label ? <Label htmlFor={htmlFor} className="text-sm font-medium text-foreground">{label}</Label> : null}
      {children}
      {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : hint ? <p className="text-xs text-default-500">{hint}</p> : null}
    </div>
  );
}

const TONES = {
  neutral: "bg-default-100 text-default-600",
  ok: "bg-emerald-50 text-emerald-700",
  warn: "bg-amber-50 text-amber-700",
  bad: "bg-red-50 text-red-700",
};
export function Chip({ tone = "neutral", className, children }) {
  return <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", TONES[tone], className)}>{children}</span>;
}

export function Segmented({ value, onChange, options, className }) {
  return (
    <div role="radiogroup" className={cn("inline-flex rounded-lg border border-border bg-default-100 p-0.5", className)}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn("rounded-md px-3 py-1.5 text-sm transition", value === option.value ? "bg-card font-medium text-foreground shadow-sm" : "text-default-600 hover:text-foreground")}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

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
