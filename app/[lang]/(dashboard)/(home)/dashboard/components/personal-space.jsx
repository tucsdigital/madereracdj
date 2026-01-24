"use client";

import { useAuth } from "@/provider/auth.provider";
import { Card, CardContent } from "@/components/ui/card";
import { Icon } from "@iconify/react";
import { useMemo } from "react";
import { useDashboardData } from "../context/dashboard-data-context";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import Link from "next/link";

// Helper para filtrar por mes actual
const isCurrentMonth = (dateValue) => {
  if (!dateValue) return false;
  try {
    let date;
    if (dateValue && typeof dateValue === 'object' && 'seconds' in dateValue && 'nanoseconds' in dateValue) {
      date = new Date(dateValue.seconds * 1000);
    } else if (dateValue instanceof Date) {
      date = dateValue;
    } else if (typeof dateValue === "string") {
      date = new Date(dateValue);
    } else {
      return false;
    }
    
    if (isNaN(date.getTime())) return false;
    
    const now = new Date();
    return date.getMonth() === now.getMonth() && 
           date.getFullYear() === now.getFullYear();
  } catch {
    return false;
  }
};

const PersonalSpace = () => {
  const { user } = useAuth();
  const { allVentas = [], loading } = useDashboardData();
  
  // Filtrar ventas del usuario actual del mes actual
  const ventasMesActual = useMemo(() => {
    if (!allVentas || allVentas.length === 0 || !user?.email) return [];
    return allVentas.filter((v) => {
      // Filtrar por usuario (vendedor)
      const esDelUsuario = v.vendedor === user.email;
      if (!esDelUsuario) return false;
      
      // Filtrar por mes actual
      return isCurrentMonth(v.fechaCreacion || v.fecha);
    });
  }, [allVentas, user?.email]);
  
  // Obtener productos y clientes únicos de las ventas del usuario del mes actual
  const productosDelUsuario = useMemo(() => {
    if (!ventasMesActual || ventasMesActual.length === 0) return [];
    const productosIds = new Set();
    ventasMesActual.forEach((v) => {
      const productosVenta = v.productos || v.items || [];
      productosVenta.forEach((p) => {
        if (p.id) productosIds.add(p.id);
      });
    });
    return Array.from(productosIds);
  }, [ventasMesActual]);
  
  const clientesDelUsuario = useMemo(() => {
    if (!ventasMesActual || ventasMesActual.length === 0) return [];
    const clientesIds = new Set();
    ventasMesActual.forEach((v) => {
      if (v.clienteId) clientesIds.add(v.clienteId);
      if (v.cliente?.id) clientesIds.add(v.cliente.id);
      if (v.cliente?.email) clientesIds.add(v.cliente.email);
    });
    return Array.from(clientesIds);
  }, [ventasMesActual]);
  
  const stats = {
    ventas: ventasMesActual.length,
    productos: productosDelUsuario.length,
    clientes: clientesDelUsuario.length,
  };

  // Determinar estado del negocio
  const estado = useMemo(() => {
    if (stats.ventas === 0) {
      return { label: "Comenzando", icon: "heroicons:rocket-launch", color: "text-blue-600", bg: "bg-blue-50" };
    } else if (stats.ventas < 10) {
      return { label: "En crecimiento", icon: "heroicons:chart-bar", color: "text-emerald-600", bg: "bg-emerald-50" };
    } else if (stats.ventas < 50) {
      return { label: "Establecido", icon: "heroicons:building-office", color: "text-purple-600", bg: "bg-purple-50" };
    } else {
      return { label: "Consolidado", icon: "heroicons:trophy", color: "text-yellow-600", bg: "bg-yellow-50" };
    }
  }, [stats.ventas]);

  if (!user) return null;

  const nombreNegocio = user.displayName || user.email?.split("@")[0] || "Tu Negocio";
  const inicial = nombreNegocio[0].toUpperCase();

  return (
    <Card className="relative rounded-3xl shadow-2xl border-0 overflow-hidden bg-gradient-to-br from-rose-50/80 via-pink-50/60 to-orange-50/80 backdrop-blur-xl">
      <div className="absolute inset-0 bg-gradient-to-br from-white/40 via-transparent to-transparent pointer-events-none" />
      <div className="relative bg-gradient-to-r from-rose-100/60 via-pink-100/40 to-orange-100/60 backdrop-blur-sm p-6">
        <div className="flex items-center gap-4">
          {/* Avatar/Logo */}
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-rose-300/50 to-pink-300/50 flex items-center justify-center text-rose-700 text-2xl font-bold shadow-xl border-0 backdrop-blur-sm">
            {inicial}
          </div>

          {/* Información */}
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold text-default-900 mb-1 truncate">{nombreNegocio}</h2>
            {!loading && (
              <div className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-2xl shadow-lg backdrop-blur-sm border-0 ${estado.bg}`}>
                <Icon icon={estado.icon} className={`w-4 h-4 ${estado.color}`} />
                <span className={`text-xs font-bold ${estado.color}`}>{estado.label} 🚀</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <CardContent className="relative p-6 pt-4">
        {loading ? (
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse">
                <div className="h-4 w-16 bg-default-200 rounded mb-2" />
                <div className="h-6 w-12 bg-default-200 rounded" />
              </div>
            ))}
          </div>
        ) : (
          <TooltipProvider delayDuration={200}>
            <div className="grid grid-cols-3 gap-4">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link href="/ventas" className="block text-center cursor-pointer hover:opacity-80 transition-opacity">
                    <p className="text-xs text-default-600 mb-1">Ventas</p>
                    <p className="text-2xl font-bold text-default-900">{stats.ventas}</p>
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="bottom" color="secondary">
                  <div className="space-y-2 text-xs sm:text-sm">
                    <div className="font-bold text-sm sm:text-base text-gray-900 dark:text-gray-100">
                      Ventas de este mes
                    </div>
                    <div className="text-gray-700 dark:text-gray-300">
                      Total de ventas realizadas este mes
                    </div>
                    <div className="pt-2 mt-2 border-t border-gray-200/50 dark:border-gray-700/50">
                      <span className="text-primary dark:text-primary font-medium text-xs sm:text-sm">
                        Click para ver ventas →
                      </span>
                    </div>
                  </div>
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link href="/productos" className="block text-center cursor-pointer hover:opacity-80 transition-opacity">
                    <p className="text-xs text-default-600 mb-1">Productos</p>
                    <p className="text-2xl font-bold text-default-900">{stats.productos}</p>
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="bottom" color="secondary">
                  <div className="space-y-2 text-xs sm:text-sm">
                    <div className="font-bold text-sm sm:text-base text-gray-900 dark:text-gray-100">
                      Productos en ventas
                    </div>
                    <div className="text-gray-700 dark:text-gray-300">
                      Productos únicos usados en tus ventas de este mes
                    </div>
                    <div className="pt-2 mt-2 border-t border-gray-200/50 dark:border-gray-700/50">
                      <span className="text-primary dark:text-primary font-medium text-xs sm:text-sm">
                        Click para ver productos →
                      </span>
                    </div>
                  </div>
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link href="/clientes" className="block text-center cursor-pointer hover:opacity-80 transition-opacity">
                    <p className="text-xs text-default-600 mb-1">Clientes</p>
                    <p className="text-2xl font-bold text-default-900">{stats.clientes}</p>
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="bottom" color="secondary">
                  <div className="space-y-2 text-xs sm:text-sm">
                    <div className="font-bold text-sm sm:text-base text-gray-900 dark:text-gray-100">
                      Clientes atendidos
                    </div>
                    <div className="text-gray-700 dark:text-gray-300">
                      Clientes únicos atendidos en tus ventas de este mes
                    </div>
                    <div className="pt-2 mt-2 border-t border-gray-200/50 dark:border-gray-700/50">
                      <span className="text-primary dark:text-primary font-medium text-xs sm:text-sm">
                        Click para ver clientes →
                      </span>
                    </div>
                  </div>
                </TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>
        )}
      </CardContent>
    </Card>
  );
};

export default PersonalSpace;
