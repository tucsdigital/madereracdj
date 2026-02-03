"use client";

import { createContext, useContext, useState, useEffect, useMemo, useRef } from "react";
import { db } from "@/lib/firebase";
import { collection, getDocs } from "firebase/firestore";
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
  const cacheRef = useRef({ key: null, raw: null, ts: 0 });

  useEffect(() => {
    const rangeKey = `${fechaDesde}_${fechaHasta}`;
    const cached = cacheRef.current;
    const now = Date.now();
    const useCache = cached.key === rangeKey && cached.raw && (now - cached.ts) < CACHE_MAX_AGE_MS;

    const applyFilter = (raw) => {
      const allVentas = raw.ventasSnap.docs.map((doc) => ({ ...doc.data(), id: doc.id }));
      const ventas = allVentas.filter((v) => isInRange(v.fechaCreacion || v.fecha));
      const presupuestos = raw.presupuestosSnap.docs
        .map((doc) => ({ ...doc.data(), id: doc.id }))
        .filter((p) => isInRange(p.fechaCreacion || p.fecha));
      const obras = raw.obrasSnap.docs
        .map((doc) => ({ ...doc.data(), id: doc.id }))
        .filter((o) => isInRange(o.fechaCreacion));
      const productos = raw.productosSnap.docs.map((doc) => ({ ...doc.data(), id: doc.id }));
      const clientesMap = {};
      raw.clientesSnap.docs.forEach((d) => {
        clientesMap[d.id] = { id: d.id, ...d.data() };
      });
      return { ventas, allVentas, presupuestos, obras, productos, clientes: clientesMap };
    };

    if (useCache) {
      setData(applyFilter(cached.raw));
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      try {
        setLoading(true);
        const [ventasSnap, presupuestosSnap, obrasSnap, productosSnap, clientesSnap] = await Promise.all([
          getDocs(collection(db, "ventas")),
          getDocs(collection(db, "presupuestos")),
          getDocs(collection(db, "obras")),
          getDocs(collection(db, "productos")),
          getDocs(collection(db, "clientes")),
        ]);

        const raw = { ventasSnap, presupuestosSnap, obrasSnap, productosSnap, clientesSnap };
        cacheRef.current = { key: rangeKey, raw, ts: Date.now() };
        setData(applyFilter(raw));
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
