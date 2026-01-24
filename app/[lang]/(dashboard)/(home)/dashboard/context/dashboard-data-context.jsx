"use client";

import { createContext, useContext, useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, getDocs } from "firebase/firestore";
import { useDateRange } from "./date-range-context";

const DashboardDataContext = createContext({
  ventas: [], // Ventas filtradas por rango de fechas
  allVentas: [], // Todas las ventas sin filtrar
  presupuestos: [],
  obras: [],
  productos: [],
  clientes: {},
  loading: true,
});

export const useDashboardData = () => useContext(DashboardDataContext);

export const DashboardDataProvider = ({ children }) => {
  const { isInRange } = useDateRange();
  const [data, setData] = useState({
    ventas: [],
    presupuestos: [],
    obras: [],
    productos: [],
    clientes: {},
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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

        // Todas las ventas sin filtrar
        const allVentas = ventasSnap.docs.map((doc) => ({ ...doc.data(), id: doc.id }));
        
        // Ventas filtradas por rango de fechas
        const ventas = allVentas.filter((v) => isInRange(v.fechaCreacion || v.fecha));

        const presupuestos = presupuestosSnap.docs
          .map((doc) => ({ ...doc.data(), id: doc.id }))
          .filter((p) => isInRange(p.fechaCreacion || p.fecha));

        const obras = obrasSnap.docs
          .map((doc) => ({ ...doc.data(), id: doc.id }))
          .filter((o) => isInRange(o.fechaCreacion));

        const productos = productosSnap.docs.map((doc) => ({ ...doc.data(), id: doc.id }));

        const clientesMap = {};
        clientesSnap.docs.forEach((d) => {
          clientesMap[d.id] = { id: d.id, ...d.data() };
        });

        setData({
          ventas,
          allVentas,
          presupuestos,
          obras,
          productos,
          clientes: clientesMap,
        });
      } catch (error) {
        console.error("Error cargando datos del dashboard:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [isInRange]);

  return (
    <DashboardDataContext.Provider value={{ ...data, loading }}>
      {children}
    </DashboardDataContext.Provider>
  );
};
