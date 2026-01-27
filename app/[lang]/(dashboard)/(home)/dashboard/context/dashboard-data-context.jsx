"use client";

import { createContext, useContext, useState, useEffect, useMemo } from "react";
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

const emptyData = {
  ventas: [],
  allVentas: [],
  presupuestos: [],
  obras: [],
  productos: [],
  clientes: {},
};

export const DashboardDataProvider = ({ children }) => {
  const { isInRange } = useDateRange();
  const [data, setData] = useState(emptyData);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const fetchData = async () => {
      try {
        setLoading(true);

        // Fase 1: ventas + presupuestos (prioridad para KPIs y widgets que solo usan ventas)
        const [ventasSnap, presupuestosSnap] = await Promise.all([
          getDocs(collection(db, "ventas")),
          getDocs(collection(db, "presupuestos")),
        ]);
        if (cancelled) return;

        const allVentas = ventasSnap.docs.map((doc) => ({ ...doc.data(), id: doc.id }));
        const ventas = allVentas.filter((v) => isInRange(v.fechaCreacion || v.fecha));
        const presupuestos = presupuestosSnap.docs
          .map((doc) => ({ ...doc.data(), id: doc.id }))
          .filter((p) => isInRange(p.fechaCreacion || p.fecha));

        setData((prev) => ({ ...prev, ventas, allVentas, presupuestos }));

        // Fase 2: obras, productos, clientes (en paralelo entre sí)
        const [obrasSnap, productosSnap, clientesSnap] = await Promise.all([
          getDocs(collection(db, "obras")),
          getDocs(collection(db, "productos")),
          getDocs(collection(db, "clientes")),
        ]);
        if (cancelled) return;

        const obras = obrasSnap.docs
          .map((doc) => ({ ...doc.data(), id: doc.id }))
          .filter((o) => isInRange(o.fechaCreacion));
        const productos = productosSnap.docs.map((doc) => ({ ...doc.data(), id: doc.id }));
        const clientesMap = {};
        clientesSnap.docs.forEach((d) => {
          clientesMap[d.id] = { id: d.id, ...d.data() };
        });

        setData((prev) => ({ ...prev, obras, productos, clientes: clientesMap }));
      } catch (error) {
        if (!cancelled) console.error("Error cargando datos del dashboard:", error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchData();
    return () => { cancelled = true; };
  }, [isInRange]);

  const value = useMemo(
    () => ({ ...data, loading }),
    [data, loading]
  );

  return (
    <DashboardDataContext.Provider value={value}>
      {children}
    </DashboardDataContext.Provider>
  );
};
