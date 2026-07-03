"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";

const DateRangeContext = createContext({
  fechaDesde: null,
  fechaHasta: null,
  rangoRapido: "month",
  setFechaDesde: () => {},
  setFechaHasta: () => {},
  setRangoRapido: () => {},
  isInRange: () => false,
  toDateSafe: () => null,
});

export const useDateRange = () => useContext(DateRangeContext);

export const DateRangeProvider = ({ children }) => {
  const hoyISO = new Date().toISOString().split("T")[0];
  const now = new Date();
  const inicioMesISO = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .split("T")[0];
  
  const [fechaDesde, setFechaDesde] = useState(inicioMesISO);
  const [fechaHasta, setFechaHasta] = useState(hoyISO);
  const [rangoRapido, setRangoRapido] = useState("month");

  const toDateSafe = useCallback((value) => {
    if (!value) return null;
    try {
      // Si es un Timestamp de Firebase
      if (value && typeof value === 'object' && 'seconds' in value && 'nanoseconds' in value) {
        const d = new Date(value.seconds * 1000);
        return isNaN(d.getTime()) ? null : d;
      }
      // Si es una instancia de Date
      if (value instanceof Date) return value;
      // Si es un string con formato ISO (incluye T)
      if (typeof value === "string" && value.includes("T")) {
        const d = new Date(value);
        return isNaN(d.getTime()) ? null : d;
      }
      // Si es un string en formato YYYY-MM-DD
      if (typeof value === "string" && value.match(/^\d{4}-\d{2}-\d{2}$/)) {
        const [y, m, d] = value.split("-").map(Number);
        if (!y || !m || !d) return null;
        const dt = new Date(y, m - 1, d);
        return isNaN(dt.getTime()) ? null : dt;
      }
      // Si es un string con otro formato de fecha, intentar parsearlo
      if (typeof value === "string") {
        const d = new Date(value);
        return isNaN(d.getTime()) ? null : d;
      }
      // Si es un número (timestamp en milisegundos)
      if (typeof value === "number") {
        const d = new Date(value);
        return isNaN(d.getTime()) ? null : d;
      }
      return null;
    } catch {
      return null;
    }
  }, []);

  const isInRange = useCallback(
    (dateValue) => {
      const d = toDateSafe(dateValue);
      if (!d) return false;
      const from = toDateSafe(fechaDesde);
      const to = toDateSafe(fechaHasta);
      if (!from || !to) return true;
      const d0 = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const f0 = new Date(from.getFullYear(), from.getMonth(), from.getDate());
      const t0 = new Date(
        to.getFullYear(),
        to.getMonth(),
        to.getDate(),
        23,
        59,
        59
      );
      return d0 >= f0 && d0 <= t0;
    },
    [fechaDesde, fechaHasta, toDateSafe]
  );

  // Rango rápido
  useEffect(() => {
    const today = new Date();
    const to = today.toISOString().split("T")[0];
    let from = inicioMesISO;
    
    if (rangoRapido === "7d") {
      from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0];
    } else if (rangoRapido === "30d") {
      from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0];
    } else if (rangoRapido === "90d") {
      from = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0];
    } else if (rangoRapido === "ytd") {
      const y = new Date().getFullYear();
      from = new Date(y, 0, 1).toISOString().split("T")[0];
    } else if (rangoRapido === "month") {
      const y = today.getFullYear();
      const m = today.getMonth();
      from = new Date(y, m, 1).toISOString().split("T")[0];
    } else if (rangoRapido === "custom") {
      // no cambia fechas
      return;
    }
    setFechaDesde(from);
    setFechaHasta(to);
  }, [rangoRapido, inicioMesISO]);

  return (
    <DateRangeContext.Provider
      value={{
        fechaDesde,
        fechaHasta,
        rangoRapido,
        setFechaDesde,
        setFechaHasta,
        setRangoRapido,
        isInRange,
        toDateSafe,
      }}
    >
      {children}
    </DateRangeContext.Provider>
  );
};
