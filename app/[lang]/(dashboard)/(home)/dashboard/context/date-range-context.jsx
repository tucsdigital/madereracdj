"use client";

import { createContext, useContext, useState, useCallback } from "react";

const DateRangeContext = createContext({
  fechaDesde: null,
  fechaHasta: null,
  mesSeleccionado: null,
  setMesSeleccionado: () => {},
  isInRange: () => false,
  toDateSafe: () => null,
});

export const useDateRange = () => useContext(DateRangeContext);

const toLocalISODate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const monthRange = (monthDate) => {
  const start = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const today = new Date();
  const isCurrentMonth =
    start.getFullYear() === today.getFullYear() &&
    start.getMonth() === today.getMonth();
  const end = isCurrentMonth
    ? today
    : new Date(start.getFullYear(), start.getMonth() + 1, 0);

  return {
    fechaDesde: toLocalISODate(start),
    fechaHasta: toLocalISODate(end),
  };
};

export const DateRangeProvider = ({ children }) => {
  const [mesSeleccionado, setMesSeleccionadoState] = useState(() =>
    new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  );
  const { fechaDesde, fechaHasta } = monthRange(mesSeleccionado);

  const setMesSeleccionado = useCallback((monthDate) => {
    if (!(monthDate instanceof Date) || Number.isNaN(monthDate.getTime())) return;

    const now = new Date();
    const requestedMonth = new Date(
      monthDate.getFullYear(),
      monthDate.getMonth(),
      1
    );
    const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const selectedMonth = requestedMonth > currentMonth ? currentMonth : requestedMonth;

    setMesSeleccionadoState(selectedMonth);
  }, []);

  const toDateSafe = useCallback((value) => {
    if (!value) return null;
    try {
      if (
        value &&
        typeof value === "object" &&
        "seconds" in value &&
        "nanoseconds" in value
      ) {
        const date = new Date(value.seconds * 1000);
        return Number.isNaN(date.getTime()) ? null : date;
      }
      if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value;
      }
      if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
        const [year, month, day] = value.split("-").map(Number);
        const date = new Date(year, month - 1, day);
        return Number.isNaN(date.getTime()) ? null : date;
      }
      if (typeof value === "string" || typeof value === "number") {
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? null : date;
      }
      if (value && typeof value.toDate === "function") {
        const date = value.toDate();
        return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
      }
      return null;
    } catch {
      return null;
    }
  }, []);

  const isInRange = useCallback(
    (dateValue) => {
      const date = toDateSafe(dateValue);
      const from = toDateSafe(fechaDesde);
      const to = toDateSafe(fechaHasta);
      if (!date || !from || !to) return false;

      const dateDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      const fromDay = new Date(from.getFullYear(), from.getMonth(), from.getDate());
      const toDay = new Date(to.getFullYear(), to.getMonth(), to.getDate());
      return dateDay >= fromDay && dateDay <= toDay;
    },
    [fechaDesde, fechaHasta, toDateSafe]
  );

  return (
    <DateRangeContext.Provider
      value={{
        fechaDesde,
        fechaHasta,
        mesSeleccionado,
        setMesSeleccionado,
        isInRange,
        toDateSafe,
      }}
    >
      {children}
    </DateRangeContext.Provider>
  );
};
