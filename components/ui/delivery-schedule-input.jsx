"use client";

import React, { useId, useState } from "react";
import { DateInput } from "@/components/ui/date-input";
import { cn } from "@/lib/utils";
import { fechaLocalActual } from "@/lib/fechas-locales";

const SCHEDULE_OPTIONS = [
  { value: "08:00 - 12:00", label: "08:00 a 12:00" },
  { value: "12:00 - 17:00", label: "12:00 a 17:00" },
  { value: "17:00 - 20:00", label: "17:00 a 20:00" },
  { value: "Transcurso del día", label: "Transcurso del día" },
];

function normalizeRange(value) {
  const match = String(value || "").trim().match(/^(\d{1,2})(?::(\d{2}))?\s*[-–]\s*(\d{1,2})(?::(\d{2}))?$/);
  if (!match) return "";
  const [, startHour, startMinute = "00", endHour, endMinute = "00"] = match;
  return `${startHour.padStart(2, "0")}:${startMinute} - ${endHour.padStart(2, "0")}:${endMinute}`;
}

function normalizeScheduleText(value) {
  return String(value || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-AR");
}

export function DeliveryScheduleInput({
  fechaEntrega = "",
  rangoHorario = "",
  onFechaEntregaChange,
  onRangoHorarioChange,
  required = false,
  disabled = false,
  dateError = "",
  timeError = "",
  className,
  description = "Elegí la fecha y la franja horaria prevista.",
}) {
  const generatedId = useId().replace(/:/g, "");
  const idPrefix = `delivery-schedule-${generatedId}`;
  const [customActive, setCustomActive] = useState(false);
  const normalizedRange = normalizeRange(rangoHorario);
  const normalizedScheduleText = normalizeScheduleText(rangoHorario);
  const matchingOption = SCHEDULE_OPTIONS.find((option) =>
    (normalizedRange && normalizeRange(option.value) === normalizedRange) ||
    (normalizedScheduleText && normalizeScheduleText(option.value) === normalizedScheduleText)
  );
  const hasCustomValue = Boolean(String(rangoHorario || "").trim()) && !matchingOption;
  const selectedRange = customActive || hasCustomValue
    ? "custom"
    : matchingOption?.value || "";

  const handleRangeSelect = (event) => {
    const nextValue = event.target.value;
    if (nextValue === "custom") {
      setCustomActive(true);
      if (matchingOption) onRangoHorarioChange?.("");
      return;
    }
    setCustomActive(false);
    onRangoHorarioChange?.(nextValue);
  };

  return (
    <div className={cn("space-y-3", className)}>
      {description ? <p className="text-xs leading-relaxed text-muted-foreground">{description}</p> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="min-w-0 space-y-1.5">
          <label htmlFor={`${idPrefix}-date`} className="block text-sm font-medium text-foreground">
            Fecha {required ? <span aria-hidden="true" className="text-destructive">*</span> : <span className="font-normal text-muted-foreground">(opcional)</span>}
          </label>
          <DateInput
            id={`${idPrefix}-date`}
            ariaLabel="Seleccionar fecha de entrega o retiro"
            ariaDescribedBy={dateError ? `${idPrefix}-date-error` : undefined}
            ariaInvalid={Boolean(dateError)}
            value={fechaEntrega}
            onChange={onFechaEntregaChange}
            min={fechaLocalActual()}
            disabled={disabled}
            buttonClassName={cn(
              "h-10 w-full justify-start border-0 bg-muted/50 text-foreground hover:bg-muted hover:text-foreground focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
              dateError && "ring-2 ring-destructive/40"
            )}
          />
          {dateError ? <p id={`${idPrefix}-date-error`} className="text-xs text-destructive" role="alert">{dateError}</p> : null}
        </div>

        <div className="min-w-0 space-y-1.5">
          <label htmlFor={`${idPrefix}-range`} className="block text-sm font-medium text-foreground">
            Horario {required ? <span aria-hidden="true" className="text-destructive">*</span> : <span className="font-normal text-muted-foreground">(opcional)</span>}
          </label>
          <select
            id={`${idPrefix}-range`}
            value={selectedRange}
            onChange={handleRangeSelect}
            disabled={disabled}
            aria-invalid={Boolean(timeError)}
            aria-describedby={timeError ? `${idPrefix}-range-error` : undefined}
            className={cn(
              "h-10 w-full rounded-md border-0 bg-muted/50 px-3 text-sm text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
              timeError && "ring-2 ring-destructive/40"
            )}
          >
            <option value="">Seleccionar horario...</option>
            {SCHEDULE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
            <option value="custom">Otro horario</option>
          </select>
          {selectedRange === "custom" ? (
            <input
              type="text"
              value={rangoHorario}
              onChange={(event) => onRangoHorarioChange?.(event.target.value)}
              maxLength={120}
              disabled={disabled}
              placeholder="Ej.: 14:00 - 18:00"
              aria-label="Especificar otro horario"
              className={cn(
                "h-10 w-full rounded-md border-0 bg-muted/50 px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
                timeError && "ring-2 ring-destructive/40"
              )}
            />
          ) : null}
          {timeError ? <p id={`${idPrefix}-range-error`} className="text-xs text-destructive" role="alert">{timeError}</p> : null}
        </div>
      </div>
    </div>
  );
}
