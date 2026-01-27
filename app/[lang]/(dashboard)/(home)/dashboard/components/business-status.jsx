"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Icon } from "@iconify/react";
import { useDashboardData } from "../context/dashboard-data-context";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import Link from "next/link";

const BusinessStatus = () => {
  const { ventas, presupuestos, productos, loading } = useDashboardData();
  const data = { ventas, presupuestos, productos };

  const status = useMemo(() => {
    if (loading) return null;

    // Ventas del rango seleccionado (ya están filtradas por isInRange)
    const ventasHoy = data.ventas;

    // Presupuestos del rango seleccionado (ya están filtrados por isInRange)
    const presupuestosHoy = data.presupuestos;

    // Calcular totales (las ventas ya están filtradas por el rango seleccionado)
    const totalVentasRango = ventasHoy.reduce((acc, v) => acc + (Number(v.total) || 0), 0);

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
    } else if (totalVentasRango > 0) {
      nivel = "Estable";
      nivelColor = "text-blue-600";
      nivelBg = "bg-blue-50";
      nivelIcon = "heroicons:chart-bar";
    }

    // Flujo (basado en ventas del rango seleccionado)
    let flujo = "Bajo";
    let flujoColor = "text-orange-600";
    let flujoIcon = "heroicons:arrow-trending-down";

    if (totalVentasRango > 100000) {
      flujo = "Excelente";
      flujoColor = "text-emerald-600";
      flujoIcon = "heroicons:arrow-trending-up";
    } else if (totalVentasRango > 50000) {
      flujo = "Bueno";
      flujoColor = "text-blue-600";
      flujoIcon = "heroicons:arrow-trending-up";
    } else if (totalVentasRango > 20000) {
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

    if (totalVentasRango > 0) {
      ingresos = "En movimiento";
      ingresosColor = "text-emerald-600";
      ingresosIcon = "heroicons:currency-dollar";
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
      <Card className="relative rounded-3xl shadow-2xl border-0 overflow-hidden bg-gradient-to-br from-emerald-50/80 via-teal-50/60 to-cyan-50/80">
        <div className="absolute inset-0 bg-gradient-to-br from-white/40 via-transparent to-transparent pointer-events-none" />
        <CardHeader className="relative pb-4 pt-6 px-6 border-0 bg-transparent">
          <CardTitle className="text-xl font-bold flex items-center gap-3 text-transparent bg-clip-text bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600">
            <div className="p-2 rounded-2xl bg-gradient-to-br from-emerald-200/50 to-teal-200/50 shadow-lg">
              <Icon icon="heroicons:building-storefront" className="w-6 h-6 text-emerald-600" />
            </div>
            Tu negocio hoy
          </CardTitle>
        </CardHeader>
        <CardContent className="relative pt-2 px-6 pb-6">
          <div className="grid grid-cols-2 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="animate-pulse p-4 rounded-2xl bg-white/60 h-20" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="relative rounded-3xl shadow-2xl border-0 overflow-hidden bg-gradient-to-br from-emerald-50/80 via-teal-50/60 to-cyan-50/80">
      <div className="absolute inset-0 bg-gradient-to-br from-white/40 via-transparent to-transparent pointer-events-none" />
      <CardHeader className="relative pb-4 pt-6 px-6 border-0 bg-transparent">
        <CardTitle className="text-xl font-bold flex items-center gap-3 text-transparent bg-clip-text bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600">
          <div className="p-2 rounded-2xl bg-gradient-to-br from-emerald-200/50 to-teal-200/50 shadow-lg">
            <Icon icon="heroicons:building-storefront" className="w-6 h-6 text-emerald-600" />
          </div>
          Tu negocio hoy
        </CardTitle>
      </CardHeader>
      <CardContent className="relative pt-2 px-6 pb-6">
        <TooltipProvider delayDuration={200}>
          <div className="grid grid-cols-2 gap-4">
            {/* Nivel */}
            <Tooltip>
              <TooltipTrigger asChild>
                <div className={`p-4 rounded-2xl shadow-lg backdrop-blur-sm cursor-help transition-all hover:scale-[1.02] ${status.nivel.bg} border-0`}>
                  <div className="flex items-center gap-2 mb-2">
                    <Icon icon={status.nivel.icon} className={`w-5 h-5 ${status.nivel.color}`} />
                    <span className="text-xs font-medium text-default-600">Nivel</span>
                  </div>
                  <p className={`text-lg font-bold ${status.nivel.color}`}>{status.nivel.label}</p>
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" color="secondary">
                <div className="space-y-2 text-xs sm:text-sm">
                  <div className="font-bold text-sm sm:text-base text-gray-900 dark:text-gray-100">
                    Estado del negocio
                  </div>
                  <div className="text-gray-700 dark:text-gray-300 leading-relaxed">
                    {data.ventas.length > 0 || data.presupuestos.length > 0
                      ? `Tienes ${data.ventas.length} ventas y ${data.presupuestos.length} presupuestos en el período seleccionado`
                      : "No hay actividad en el período seleccionado"}
                  </div>
                </div>
              </TooltipContent>
            </Tooltip>

            {/* Flujo */}
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="p-4 rounded-2xl bg-white/60 shadow-lg backdrop-blur-sm border-0 cursor-help transition-all hover:scale-[1.02]">
                  <div className="flex items-center gap-2 mb-2">
                    <Icon icon={status.flujo.icon} className={`w-5 h-5 ${status.flujo.color}`} />
                    <span className="text-xs font-medium text-default-600">Flujo</span>
                  </div>
                  <p className={`text-lg font-bold ${status.flujo.color}`}>{status.flujo.label}</p>
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" color="secondary">
                <div className="space-y-2 text-xs sm:text-sm">
                  <div className="font-bold text-sm sm:text-base text-gray-900 dark:text-gray-100">
                    Flujo de ingresos
                  </div>
                  <div className="font-bold text-base sm:text-lg text-emerald-600 dark:text-emerald-400">
                    ${new Intl.NumberFormat("es-AR").format(
                      data.ventas.reduce((acc, v) => acc + (Number(v.total) || 0), 0)
                    )}
                  </div>
                  <div className="text-gray-600 dark:text-gray-400 text-xs">
                    Basado en las ventas del rango seleccionado
                  </div>
                </div>
              </TooltipContent>
            </Tooltip>

            {/* Stock */}
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="p-4 rounded-2xl bg-white/60 shadow-lg backdrop-blur-sm border-0 cursor-help transition-all hover:scale-[1.02]">
                  <div className="flex items-center gap-2 mb-2">
                    <Icon icon={status.stock.icon} className={`w-5 h-5 ${status.stock.color}`} />
                    <span className="text-xs font-medium text-default-600">Stock</span>
                  </div>
                  <p className={`text-lg font-bold ${status.stock.color}`}>{status.stock.label}</p>
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" color="secondary">
                <div className="space-y-2 text-xs sm:text-sm">
                  <div className="font-bold text-sm sm:text-base text-gray-900 dark:text-gray-100">
                    Catálogo de productos
                  </div>
                  <div className="font-bold text-base sm:text-lg text-gray-900 dark:text-gray-100">
                    {data.productos.length} productos
                  </div>
                  <div className="pt-2 mt-2 border-t border-gray-200/50 dark:border-gray-700/50">
                    <Link href="/productos" className="text-primary dark:text-primary font-medium text-xs sm:text-sm hover:underline transition-all">
                      Ver productos →
                    </Link>
                  </div>
                </div>
              </TooltipContent>
            </Tooltip>

            {/* Ingresos */}
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="p-4 rounded-2xl bg-white/60 shadow-lg backdrop-blur-sm border-0 cursor-help transition-all hover:scale-[1.02]">
                  <div className="flex items-center gap-2 mb-2">
                    <Icon icon={status.ingresos.icon} className={`w-5 h-5 ${status.ingresos.color}`} />
                    <span className="text-xs font-medium text-default-600">Ingresos</span>
                  </div>
                  <p className={`text-lg font-bold ${status.ingresos.color}`}>{status.ingresos.label}</p>
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" color="secondary">
                <div className="space-y-2 text-xs sm:text-sm">
                  <div className="font-bold text-sm sm:text-base text-gray-900 dark:text-gray-100">
                    Movimiento de ingresos
                  </div>
                  <div className="font-bold text-base sm:text-lg text-emerald-600 dark:text-emerald-400">
                    {(() => {
                      const total = data.ventas.reduce((acc, v) => acc + (Number(v.total) || 0), 0);
                      return total > 0
                        ? `$${new Intl.NumberFormat("es-AR").format(total)}`
                        : "Sin ingresos en el período";
                    })()}
                  </div>
                  <div className="pt-2 mt-2 border-t border-gray-200/50 dark:border-gray-700/50">
                    <Link href="/ventas" className="text-primary dark:text-primary font-medium text-xs sm:text-sm hover:underline transition-all">
                      Ver ventas →
                    </Link>
                  </div>
                </div>
              </TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
      </CardContent>
    </Card>
  );
};

export default BusinessStatus;
