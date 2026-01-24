"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Icon } from "@iconify/react";
import { db } from "@/lib/firebase";
import { collection, getDocs } from "firebase/firestore";
import { useEffect, useState } from "react";

const BusinessStatus = () => {
  const [data, setData] = useState({ ventas: [], presupuestos: [], productos: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);
        const hoyISO = hoy.toISOString().split("T")[0];

        const ventasSnap = await getDocs(collection(db, "ventas"));
        const presupuestosSnap = await getDocs(collection(db, "presupuestos"));
        const productosSnap = await getDocs(collection(db, "productos"));

        const ventas = ventasSnap.docs.map((doc) => ({ ...doc.data(), id: doc.id }));
        const presupuestos = presupuestosSnap.docs.map((doc) => ({ ...doc.data(), id: doc.id }));
        const productos = productosSnap.docs.map((doc) => ({ ...doc.data(), id: doc.id }));

        setData({ ventas, presupuestos, productos });
      } catch (error) {
        console.error("Error cargando datos:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const status = useMemo(() => {
    if (loading) return null;

    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    // Ventas de hoy
    const ventasHoy = data.ventas.filter((v) => {
      const fecha = v.fechaCreacion || v.fecha;
      if (!fecha) return false;
      const fechaVenta = fecha.toDate ? fecha.toDate() : new Date(fecha);
      return fechaVenta >= hoy;
    });

    // Presupuestos de hoy
    const presupuestosHoy = data.presupuestos.filter((p) => {
      const fecha = p.fechaCreacion || p.fecha;
      if (!fecha) return false;
      const fechaPres = fecha.toDate ? fecha.toDate() : new Date(fecha);
      return fechaPres >= hoy;
    });

    // Calcular totales
    const totalVentasHoy = ventasHoy.reduce((acc, v) => acc + (Number(v.total) || 0), 0);
    const totalVentasMes = data.ventas
      .filter((v) => {
        const fecha = v.fechaCreacion || v.fecha;
        if (!fecha) return false;
        const fechaVenta = fecha.toDate ? fecha.toDate() : new Date(fecha);
        return fechaVenta.getMonth() === hoy.getMonth() && fechaVenta.getFullYear() === hoy.getFullYear();
      })
      .reduce((acc, v) => acc + (Number(v.total) || 0), 0);

    // Determinar estado del negocio
    let nivel = "Inactivo";
    let nivelColor = "text-gray-600";
    let nivelBg = "bg-gray-50";
    let nivelIcon = "heroicons:pause-circle";

    if (ventasHoy.length > 0 || presupuestosHoy.length > 0) {
      nivel = "Activo";
      nivelColor = "text-emerald-600";
      nivelBg = "bg-emerald-50";
      nivelIcon = "heroicons:fire";
    } else if (totalVentasMes > 0) {
      nivel = "Estable";
      nivelColor = "text-blue-600";
      nivelBg = "bg-blue-50";
      nivelIcon = "heroicons:chart-bar";
    }

    // Flujo (basado en ventas del mes)
    let flujo = "Bajo";
    let flujoColor = "text-orange-600";
    let flujoIcon = "heroicons:arrow-trending-down";

    if (totalVentasMes > 100000) {
      flujo = "Excelente";
      flujoColor = "text-emerald-600";
      flujoIcon = "heroicons:arrow-trending-up";
    } else if (totalVentasMes > 50000) {
      flujo = "Bueno";
      flujoColor = "text-blue-600";
      flujoIcon = "heroicons:arrow-trending-up";
    } else if (totalVentasMes > 20000) {
      flujo = "Regular";
      flujoColor = "text-yellow-600";
      flujoIcon = "heroicons:minus";
    }

    // Stock (basado en cantidad de productos)
    const totalProductos = data.productos.length;
    let stock = "Bajo";
    let stockColor = "text-orange-600";
    let stockIcon = "heroicons:exclamation-triangle";

    if (totalProductos > 100) {
      stock = "Excelente";
      stockColor = "text-emerald-600";
      stockIcon = "heroicons:check-circle";
    } else if (totalProductos > 50) {
      stock = "Estable";
      stockColor = "text-blue-600";
      stockIcon = "heroicons:check-circle";
    } else if (totalProductos > 20) {
      stock = "Regular";
      stockColor = "text-yellow-600";
      stockIcon = "heroicons:information-circle";
    }

    // Ingresos
    let ingresos = "Sin movimiento";
    let ingresosColor = "text-gray-600";
    let ingresosIcon = "heroicons:banknotes";

    if (totalVentasHoy > 0) {
      ingresos = "En movimiento";
      ingresosColor = "text-emerald-600";
      ingresosIcon = "heroicons:currency-dollar";
    } else if (totalVentasMes > 0) {
      ingresos = "Estable";
      ingresosColor = "text-blue-600";
    }

    return {
      nivel: { label: nivel, color: nivelColor, bg: nivelBg, icon: nivelIcon },
      flujo: { label: flujo, color: flujoColor, icon: flujoIcon },
      stock: { label: stock, color: stockColor, icon: stockIcon },
      ingresos: { label: ingresos, color: ingresosColor, icon: ingresosIcon },
    };
  }, [data, loading]);

  if (loading || !status) {
    return (
      <Card className="rounded-xl shadow-md border border-default-200/70">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Tu negocio hoy</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="animate-pulse p-4 rounded-lg bg-default-100 h-20" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-xl shadow-md border border-default-200/70">
      <CardHeader className="pb-3 border-b border-default-100/80">
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <Icon icon="heroicons:building-storefront" className="w-5 h-5 text-primary" />
          Tu negocio hoy
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4">
        <div className="grid grid-cols-2 gap-3">
          {/* Nivel */}
          <div className={`p-4 rounded-lg ${status.nivel.bg} border border-default-200`}>
            <div className="flex items-center gap-2 mb-2">
              <Icon icon={status.nivel.icon} className={`w-5 h-5 ${status.nivel.color}`} />
              <span className="text-xs font-medium text-default-600">Nivel</span>
            </div>
            <p className={`text-lg font-bold ${status.nivel.color}`}>{status.nivel.label}</p>
          </div>

          {/* Flujo */}
          <div className="p-4 rounded-lg bg-card border border-default-200">
            <div className="flex items-center gap-2 mb-2">
              <Icon icon={status.flujo.icon} className={`w-5 h-5 ${status.flujo.color}`} />
              <span className="text-xs font-medium text-default-600">Flujo</span>
            </div>
            <p className={`text-lg font-bold ${status.flujo.color}`}>{status.flujo.label}</p>
          </div>

          {/* Stock */}
          <div className="p-4 rounded-lg bg-card border border-default-200">
            <div className="flex items-center gap-2 mb-2">
              <Icon icon={status.stock.icon} className={`w-5 h-5 ${status.stock.color}`} />
              <span className="text-xs font-medium text-default-600">Stock</span>
            </div>
            <p className={`text-lg font-bold ${status.stock.color}`}>{status.stock.label}</p>
          </div>

          {/* Ingresos */}
          <div className="p-4 rounded-lg bg-card border border-default-200">
            <div className="flex items-center gap-2 mb-2">
              <Icon icon={status.ingresos.icon} className={`w-5 h-5 ${status.ingresos.color}`} />
              <span className="text-xs font-medium text-default-600">Ingresos</span>
            </div>
            <p className={`text-lg font-bold ${status.ingresos.color}`}>{status.ingresos.label}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default BusinessStatus;
