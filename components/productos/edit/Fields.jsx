"use client";
import { useState } from "react";
import { AlertCircle, AlertTriangle, Info, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Btn, UnitInput, inputClass, inputErrorClass } from "@/components/panel-ui/ui";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** Ayuda breve junto a una etiqueta: un ícono que explica el campo al pasar el mouse o con el teclado. */
export function Tip({ text, className }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label="Más información"
          className={cn("inline-flex h-5 w-5 items-center justify-center rounded-full text-default-400 transition hover:bg-default-100 hover:text-default-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40", className)}
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs leading-relaxed">{text}</TooltipContent>
    </Tooltip>
  );
}

/** Campo con etiqueta, ayuda en tooltip y mensajes de error, aviso o sugerencia. */
export function FormField({ id, label, tip, required, error, warning, hint, className, children }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      {label ? (
        <div className="flex items-center gap-1">
          <label htmlFor={id} className="text-sm font-medium text-foreground">
            {label}
            {required ? <span className="ml-0.5 text-destructive" aria-hidden="true">*</span> : null}
          </label>
          {tip ? <Tip text={tip} /> : null}
        </div>
      ) : null}
      {children}
      {error ? (
        <p id={`${id}-message`} role="alert" className="flex items-start gap-1.5 text-xs text-destructive">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}
        </p>
      ) : warning ? (
        <p id={`${id}-message`} role="status" className="flex items-start gap-1.5 text-xs text-amber-700">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {warning}
        </p>
      ) : hint ? (
        <p id={`${id}-message`} className="text-xs text-default-500">{hint}</p>
      ) : null}
    </div>
  );
}

const describe = (id, error, warning, hint) => (error || warning || hint ? `${id}-message` : undefined);

export function TextInput({ id, error, warning, hint, className, ...props }) {
  return <input id={id} className={cn(inputClass, error && inputErrorClass, className)} aria-invalid={error ? true : undefined} aria-describedby={describe(id, error, warning, hint)} {...props} />;
}

export function NumberInput({ id, error, warning, hint, prefix, suffix, ...props }) {
  return <UnitInput id={id} prefix={prefix} suffix={suffix} invalid={Boolean(error)} aria-invalid={error ? true : undefined} aria-describedby={describe(id, error, warning, hint)} {...props} />;
}

export function TextArea({ id, error, className, ...props }) {
  return <textarea id={id} className={cn("w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition placeholder:text-default-400 focus:border-primary", error && inputErrorClass, className)} {...props} />;
}

/** Lista desplegable con la opción de sumar un valor nuevo sin salir de la pantalla. */
export function SelectAdd({ id, value, onChange, options, placeholder = "Seleccionar", onAdd, addLabel = "Agregar nuevo", addPlaceholder, disabled, error, warning, hint }) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const list = !value || options.includes(value) ? options : [...options, value];
  const commit = () => {
    const next = draft.trim();
    if (!next) return;
    onAdd?.(next);
    onChange(next);
    setDraft("");
    setAdding(false);
  };
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <select
          id={id}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={describe(id, error, warning, hint)}
          className={cn(inputClass, error && inputErrorClass)}
        >
          <option value="">{placeholder}</option>
          {list.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
        {onAdd ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Btn aria-label={addLabel} disabled={disabled} onClick={() => setAdding((v) => !v)} className="h-10 w-10 px-0">
                {adding ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              </Btn>
            </TooltipTrigger>
            <TooltipContent side="top">{adding ? "Cancelar" : addLabel}</TooltipContent>
          </Tooltip>
        ) : null}
      </div>
      {adding ? (
        <div className="flex gap-2">
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); commit(); }
              if (e.key === "Escape") { setAdding(false); setDraft(""); }
            }}
            placeholder={addPlaceholder}
            className={inputClass}
          />
          <Btn variant="primary" onClick={commit} disabled={!draft.trim()}>Agregar</Btn>
        </div>
      ) : null}
    </div>
  );
}

/** Opción activable con título y explicación (etiquetas de la tienda). */
export function ToggleCard({ checked, onChange, title, description, icon: Icon }) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition focus-within:ring-2 focus-within:ring-primary/30", checked ? "border-primary/50 bg-primary/5" : "border-border bg-card hover:bg-default-50")}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-1 h-4 w-4 accent-primary" />
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-sm font-medium">{Icon ? <Icon className="h-4 w-4 text-default-500" /> : null}{title}</span>
        <span className="mt-0.5 block text-xs text-default-500">{description}</span>
      </span>
    </label>
  );
}
