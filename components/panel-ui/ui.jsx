"use client";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";

// Piezas visuales compartidas por las pantallas de configuración del panel (Tienda web, Envíos…).

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

/** Campo numérico con prefijo ($) o sufijo (km, kg, %). */
export function UnitInput({ prefix, suffix, className, invalid, ...props }) {
  return (
    <div className={cn("relative", className)}>
      {prefix ? <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-default-500">{prefix}</span> : null}
      <input
        inputMode="decimal"
        className={cn(inputClass, prefix && "pl-7", suffix && "pr-10", invalid && inputErrorClass)}
        {...props}
      />
      {suffix ? <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-default-500">{suffix}</span> : null}
    </div>
  );
}
