"use client";

import { createContext, useContext, useState, useEffect, useMemo, useRef } from "react";
import { db } from "@/lib/firebase";
import { getObraReferenceDate } from "@/lib/obras-fechas";
import { collection, getDocs, query, where } from "firebase/firestore";
import { useDateRange } from "./date-range-context";

const DashboardDataContext = createContext({
  ventas: [],
  allVentas: [],
  presupuestos: [],
  obras: [],
  productos: [],
  clientes: {},
  loading: true,
});

export const useDashboardData = () => useContext(DashboardDataContext);

const CACHE_MAX_AGE_MS = 2 * 60 * 1000;

export const DashboardDataProvider = ({ children }) => {
  const { isInRange, fechaDesde, fechaHasta } = useDateRange();
  const [data, setData] = useState({
    ventas: [],
    allVentas: [],
    presupuestos: [],
    obras: [],
    productos: [],
    clientes: {},
  });
  const [loading, setLoading] = useState(true);
  const cacheRef = useRef({ key: null, data: null, ts: 0 });

  useEffect(() => {
    const rangeKey = `${fechaDesde}_${fechaHasta}`;
    const cached = cacheRef.current;
    const now = Date.now();
    const useCache = cached.key === rangeKey && cached.data && (now - cached.ts) < CACHE_MAX_AGE_MS;

    if (useCache) {
      setData(cached.data);
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      try {
        setLoading(true);
        const rangeStart = fechaDesde || "0000-01-01";
        const rangeEnd = fechaHasta
          ? `${fechaHasta}T23:59:59.999Z`
          : "9999-12-31T23:59:59.999Z";

        const readRange = async (collectionName, dateFields) => {
          const snapshots = await Promise.all(
            dateFields.map((field) =>
              getDocs(
                query(
                  collection(db, collectionName),
                  where(field, ">=", rangeStart),
                  where(field, "<=", rangeEnd)
                )
              )
            )
          );
          const documentsById = new Map();
          snapshots.forEach((snapshot) => {
            snapshot.docs.forEach((document) => {
              documentsById.set(document.id, {
                ...document.data(),
                id: document.id,
              });
            });
          });
          return Array.from(documentsById.values());
        };

        const [ventas, presupuestos, obras, productosSnap, clientesSnap] = await Promise.all([
          readRange("ventas", ["fechaCreacion", "fecha"]),
          readRange("presupuestos", ["fechaCreacion", "fecha"]),
          readRange("obras", ["fechaCreacion", "fecha", "fechas.inicio"]),
          getDocs(collection(db, "productos")),
          getDocs(collection(db, "clientes")),
        ]);

        const isVentaAnulada = (v) =>
          String(v?.estado || "").toLowerCase() === "anulada" || v?.anulada === true;
        const allVentas = ventas.filter((v) => !isVentaAnulada(v));
        const nextData = {
          ventas: allVentas.filter((v) => isInRange(v.fechaCreacion || v.fecha)),
          allVentas,
          presupuestos: presupuestos.filter((p) => isInRange(p.fechaCreacion || p.fecha)),
          obras: obras.filter((o) => isInRange(getObraReferenceDate(o))),
          productos: productosSnap.docs.map((document) => ({ ...document.data(), id: document.id })),
          clientes: clientesSnap.docs.reduce((acc, document) => {
            acc[document.id] = { id: document.id, ...document.data() };
            return acc;
          }, {}),
        };
        cacheRef.current = { key: rangeKey, data: nextData, ts: Date.now() };
        setData(nextData);
      } catch (error) {
        console.error("Error cargando datos del dashboard:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [isInRange, fechaDesde, fechaHasta]);

  const value = useMemo(
    () => ({ ...data, loading }),
    [data.ventas, data.allVentas, data.presupuestos, data.obras, data.productos, data.clientes, loading]
  );

  return (
    <DashboardDataContext.Provider value={value}>
      {children}
    </DashboardDataContext.Provider>
  );
};
