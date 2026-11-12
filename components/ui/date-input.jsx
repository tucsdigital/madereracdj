"use client";

import * as React from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

function isoToDate(iso) {
  if (!iso || typeof iso !== "string") return null;
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!y || !mo || !d) return null;
  const dt = new Date(y, mo - 1, d, 12, 0, 0);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function slashToDate(value) {
  if (!value || typeof value !== "string") return null;
  const m = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  const y = Number(m[3]);
  if (!y || !a || !b) return null;

  let d = null;
  let mo = null;

  if (a > 12 && b <= 12) {
    d = a;
    mo = b;
  } else if (b > 12 && a <= 12) {
    d = b;
    mo = a;
  } else {
    d = a;
    mo = b;
  }

  const dt = new Date(y, mo - 1, d, 12, 0, 0);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function toDateSafe(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (value && typeof value === "object" && typeof value.toDate === "function") {
    const d = value.toDate();
    return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
  }
  if (typeof value === "string") {
    const iso = isoToDate(value);
    if (iso) return iso;
    const slash = slashToDate(value);
    if (slash) return slash;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function dateToIso(dt) {
  if (!(dt instanceof Date) || Number.isNaN(dt.getTime())) return "";
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0);
}

export function DateInput({
  value,
  onChange,
  placeholder = "Elegir fecha",
  className,
  buttonClassName,
  popoverAlign = "start",
  min,
  max,
  disabled,
  id,
  ariaLabel,
  ariaDescribedBy,
  ariaInvalid,
}) {
  const selected = React.useMemo(() => toDateSafe(value), [value]);
  const minDate = React.useMemo(() => toDateSafe(min), [min]);
  const maxDate = React.useMemo(() => toDateSafe(max), [max]);
  const [open, setOpen] = React.useState(false);
  const [today, setToday] = React.useState(getToday);
  const [calendarMonth, setCalendarMonth] = React.useState(getToday);

  const disabledDays = React.useMemo(() => {
    if (!minDate && !maxDate) return undefined;
    return (d) => {
      if (!(d instanceof Date) || Number.isNaN(d.getTime())) return false;
      const dateKey = dateToIso(d);
      if (minDate && dateKey < dateToIso(minDate)) return true;
      if (maxDate && dateKey > dateToIso(maxDate)) return true;
      return false;
    };
  }, [minDate, maxDate]);

  const handleOpenChange = (nextOpen) => {
    if (nextOpen) {
      const currentDate = getToday();
      setToday(currentDate);
      setCalendarMonth(currentDate);
    }
    setOpen(nextOpen);
  };

  const handleSelect = (dt) => {
    if (!dt) return;
    const iso = dateToIso(dt);
    if (!iso) return;
    onChange?.(iso);
  };

  return (
    <div className={cn("w-full", className)}>
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            id={id}
            aria-label={ariaLabel}
            aria-describedby={ariaDescribedBy}
            aria-invalid={ariaInvalid}
            className={cn(
              "w-full justify-start font-normal",
              buttonClassName
            )}
          >
            {selected ? format(selected, "dd/MM/yyyy", { locale: es }) : placeholder}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align={popoverAlign}>
          <Calendar
            mode="single"
            selected={selected || undefined}
            onSelect={handleSelect}
            month={calendarMonth}
            onMonthChange={setCalendarMonth}
            today={today}
            initialFocus
            disabled={disabledDays}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
