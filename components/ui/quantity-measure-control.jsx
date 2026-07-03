import React, { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { computeQuantityDisplay, computeQuantityFromMeasure } from "@/lib/pricing";

function parseNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  const normalized = String(value).replace(",", ".");
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

function formatNumberAR(value, decimals) {
  const v = Number(value);
  if (!Number.isFinite(v)) return "-";
  return new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(v);
}

function decimalsForUnit(unit) {
  const u = String(unit || "");
  return u === "m²" || u === "m³" || u === "ml" ? 2 : 0;
}

export function MedidaValue({ product, className = "", badgeColor = "secondary" }) {
  const q = useMemo(() => computeQuantityDisplay(product), [product]);
  const decimals = decimalsForUnit(q.unit);
  const valueText = formatNumberAR(q.value, decimals);

  return (
    <div className={`inline-flex items-center justify-center gap-2 ${className}`.trim()}>
      <span className="tabular-nums">{valueText}</span>
      <Badge variant="soft" color={badgeColor} className="px-2 py-0.5 text-[10px]">
        {q.unit}
      </Badge>
    </div>
  );
}

export default function QuantityMeasureControl({
  product,
  cantidad,
  disabled = false,
  onCantidadChange,
  onIncrement,
  onDecrement,
  showMeasureInput = true,
  className = "",
  inputClassName = "",
  badgeColor = "secondary",
  min = 1,
  step = 1,
}) {
  const q = useMemo(() => computeQuantityDisplay(product), [product]);
  const decimals = decimalsForUnit(q.unit);
  const computedMeasureText = formatNumberAR(q.value, decimals);
  const [measureDraft, setMeasureDraft] = useState(computedMeasureText);

  const isMadera = String(product?.categoria ?? "") === "Maderas";
  const unidad = String(product?.unidad ?? product?.unidadMedida ?? "").toUpperCase();
  const allowMeasure = showMeasureInput && isMadera && unidad !== "UNIDAD" && unidad !== "UN" && unidad !== "UNI";

  const handleMeasureChange = (next) => {
    setMeasureDraft(next);
    const parsed = parseNumber(next);
    if (parsed === null) return;
    const nextQty = computeQuantityFromMeasure(product, parsed);
    onCantidadChange?.(nextQty);
  };

  return (
    <div className={`flex items-center gap-2 flex-wrap ${className}`.trim()}>
      <div className="flex items-center bg-white dark:bg-gray-800 border border-default-300 dark:border-gray-700 rounded-lg overflow-hidden shadow-sm">
        <button
          type="button"
          onClick={() =>
            onDecrement
              ? onDecrement()
              : onCantidadChange?.(
                  Math.max(min, Math.ceil(Number(cantidad || 0) - step))
                )
          }
          disabled={disabled || Number(cantidad || 0) <= min}
          className="px-3 py-2 text-default-500 hover:text-default-900 hover:bg-default-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 12H4" />
          </svg>
        </button>

        <input
          type="number"
          min={min}
          step={step}
          value={cantidad === "" ? "" : cantidad}
          onChange={(e) => {
            const parsed = parseNumber(e.target.value);
            if (parsed === null) return;
            onCantidadChange?.(Math.max(min, Math.ceil(parsed)));
          }}
          className={`w-16 text-center text-base md:text-lg font-bold border-0 bg-transparent focus:ring-0 focus:outline-none text-gray-900 dark:text-gray-100 tabular-nums ${inputClassName}`.trim()}
          disabled={disabled}
        />

        <button
          type="button"
          onClick={() =>
            onIncrement
              ? onIncrement()
              : onCantidadChange?.(Math.max(min, Math.ceil(Number(cantidad || 0) + step)))
          }
          disabled={disabled}
          className="px-3 py-2 text-default-500 hover:text-default-900 hover:bg-default-100 dark:hover:bg-gray-700 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>

      {allowMeasure && (
        <div className="relative">
          <input
            type="number"
            min={0}
            step="0.01"
            value={measureDraft}
            onChange={(e) => handleMeasureChange(e.target.value)}
            onBlur={() => setMeasureDraft(computedMeasureText)}
            placeholder="Medida"
            className="h-9 w-[112px] rounded-md border border-default-300 bg-white dark:bg-gray-800 pr-8 pl-2 text-xs focus:border-indigo-500 focus:ring-1 focus:ring-indigo-200 tabular-nums"
            disabled={disabled}
            aria-label="Medida total"
          />
          <span className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 text-[10px] text-default-500">
            {q.unit}
          </span>
        </div>
      )}
    </div>
  );
}
