"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Icon } from "@iconify/react";
import { useAuth } from "@/provider/auth.provider";
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

const UserProgress = () => {
  const { user } = useAuth();
  const { productos, clientes, allVentas = [], loading } = useDashboardData();
  
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
  
  const data = {
    productos: productosDelUsuario, // IDs únicos de productos usados
    clientes: clientesDelUsuario, // IDs únicos de clientes usados
    ventas: ventasMesActual,
  };

  const progress = useMemo(() => {
    if (loading) return null;

    const acciones = [
      {
        id: "productos",
        label: "Productos en ventas",
        completado: data.productos.length > 0,
        progreso: Math.min(100, (data.productos.length / 10) * 100),
        icon: "heroicons:cube",
        meta: 10,
        actual: data.productos.length,
      },
      {
        id: "clientes",
        label: "Clientes atendidos",
        completado: data.clientes.length > 0,
        progreso: Math.min(100, (data.clientes.length / 5) * 100),
        icon: "heroicons:users",
        meta: 5,
        actual: data.clientes.length,
      },
      {
        id: "ventas",
        label: "Realizar ventas",
        completado: data.ventas.length > 0,
        progreso: Math.min(100, (data.ventas.length / 3) * 100),
        icon: "heroicons:shopping-cart",
        meta: 3,
        actual: data.ventas.length,
      },
      {
        id: "productos_imagenes",
        label: "Productos con imágenes",
        completado: false, // Esta métrica requiere datos completos de productos, no solo IDs
        progreso: 0,
        icon: "heroicons:photo",
        meta: 1,
        actual: 0,
      },
    ];

    const completadas = acciones.filter((a) => a.completado).length;
    const total = acciones.length;
    const porcentajeGeneral = (completadas / total) * 100;

    // Determinar nivel
    let nivel = "Principiante";
    let nivelColor = "text-blue-600";
    let nivelBg = "bg-blue-50";
    let siguienteNivel = "Intermedio";

    if (porcentajeGeneral >= 75) {
      nivel = "Avanzado";
      nivelColor = "text-purple-600";
      nivelBg = "bg-purple-50";
      siguienteNivel = "Experto";
    } else if (porcentajeGeneral >= 50) {
      nivel = "Intermedio";
      nivelColor = "text-emerald-600";
      nivelBg = "bg-emerald-50";
      siguienteNivel = "Avanzado";
    }

    // Próximo paso
    const proximoPaso = acciones.find((a) => !a.completado) || acciones[0];

    return {
      acciones,
      completadas,
      total,
      porcentajeGeneral,
      nivel,
      nivelColor,
      nivelBg,
      siguienteNivel,
      proximoPaso,
    };
  }, [data, loading]);

  if (loading || !progress) {
    return (
      <Card className="rounded-xl shadow-md border border-default-200/70">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Tu progreso</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            <div className="h-20 bg-default-200 rounded-lg" />
            <div className="h-4 bg-default-200 rounded w-3/4" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-xl shadow-md border border-default-200/70">
      <CardHeader className="pb-3 border-b border-default-100/80">
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <Icon icon="heroicons:trophy" className="w-5 h-5 text-yellow-500" />
          Tu progreso
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4 space-y-4">
        <TooltipProvider delayDuration={200}>
          {/* Nivel general */}
          <Tooltip>
            <TooltipTrigger asChild>
              <div className={`p-4 rounded-lg ${progress.nivelBg} border border-default-200 cursor-help`}>
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="text-sm font-medium text-default-600 mb-1">Nivel actual</p>
                    <p className={`text-2xl font-bold ${progress.nivelColor}`}>{progress.nivel}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-default-600 mb-1">Progreso general</p>
                    <p className="text-2xl font-bold text-default-900">{Math.round(progress.porcentajeGeneral)}%</p>
                  </div>
                </div>
                <div className="w-full bg-default-200 rounded-full h-2 mt-3">
                  <div
                    className={`h-2 rounded-full transition-all ${
                      progress.porcentajeGeneral >= 75
                        ? "bg-purple-500"
                        : progress.porcentajeGeneral >= 50
                        ? "bg-emerald-500"
                        : "bg-blue-500"
                    }`}
                    style={{ width: `${progress.porcentajeGeneral}%` }}
                  />
                </div>
                <p className="text-xs text-default-500 mt-2">
                  {progress.completadas} de {progress.total} acciones completadas
                </p>
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" color="secondary">
              <div className="space-y-2 text-xs sm:text-sm">
                <div className="font-bold text-sm sm:text-base text-gray-900 dark:text-gray-100">
                  Tu nivel: {progress.nivel}
                </div>
                <div className="text-gray-700 dark:text-gray-300">
                  Has completado {progress.completadas} de {progress.total} acciones recomendadas
                </div>
                {progress.porcentajeGeneral < 100 && (
                  <div className="pt-2 mt-2 border-t border-gray-200/50 dark:border-gray-700/50">
                    <div className="text-gray-600 dark:text-gray-400">
                      <span className="font-medium">Siguiente nivel:</span> {progress.siguienteNivel}
                    </div>
                    <div className="text-xs mt-1">
                      Te faltan {Math.ceil((100 - progress.porcentajeGeneral) / (100 / progress.total))} acciones para alcanzarlo
                    </div>
                  </div>
                )}
              </div>
            </TooltipContent>
          </Tooltip>

          {/* Próximo paso */}
          {progress.proximoPaso && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="p-3 rounded-lg bg-card border border-default-200 cursor-help">
                  <p className="text-xs font-medium text-default-600 mb-2">Próximo paso:</p>
                  <div className="flex items-center gap-2">
                    <Icon icon={progress.proximoPaso.icon} className="w-4 h-4 text-primary" />
                    <span className="text-sm text-default-900">{progress.proximoPaso.label}</span>
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" color="secondary">
                <div className="space-y-2 text-xs sm:text-sm">
                  <div className="font-bold text-sm sm:text-base text-gray-900 dark:text-gray-100">
                    {progress.proximoPaso.label}
                  </div>
                  <div className="text-gray-700 dark:text-gray-300">
                    {progress.proximoPaso.completado
                      ? `✅ Completado: ${progress.proximoPaso.actual} de ${progress.proximoPaso.meta}`
                      : `Progreso: ${progress.proximoPaso.actual} de ${progress.proximoPaso.meta} (${Math.round(progress.proximoPaso.progreso)}%)`}
                  </div>
                  {!progress.proximoPaso.completado && (
                    <div className="pt-2 mt-2 border-t border-gray-200/50 dark:border-gray-700/50">
                      <div className="text-gray-600 dark:text-gray-400 text-xs">
                        Te faltan {progress.proximoPaso.meta - progress.proximoPaso.actual} para completar esta acción
                      </div>
                      {progress.proximoPaso.id === "productos" && (
                        <Link href="/productos" className="text-primary dark:text-primary font-medium text-xs sm:text-sm hover:underline block mt-1">
                          Agregar productos →
                        </Link>
                      )}
                      {progress.proximoPaso.id === "clientes" && (
                        <Link href="/clientes" className="text-primary dark:text-primary font-medium text-xs sm:text-sm hover:underline block mt-1">
                          Agregar clientes →
                        </Link>
                      )}
                      {progress.proximoPaso.id === "ventas" && (
                        <Link href="/ventas" className="text-primary dark:text-primary font-medium text-xs sm:text-sm hover:underline block mt-1">
                          Crear venta →
                        </Link>
                      )}
                      {progress.proximoPaso.id === "productos_imagenes" && (
                        <Link href="/productos" className="text-primary dark:text-primary font-medium text-xs sm:text-sm hover:underline block mt-1">
                          Agregar imágenes →
                        </Link>
                      )}
                    </div>
                  )}
                </div>
              </TooltipContent>
            </Tooltip>
          )}

          {/* Lista de acciones */}
          <div className="space-y-2">
            {progress.acciones.map((accion) => {
              const linkHref =
                accion.id === "productos" || accion.id === "productos_imagenes"
                  ? "/productos"
                  : accion.id === "clientes"
                  ? "/clientes"
                  : accion.id === "ventas"
                  ? "/ventas"
                  : null;

              const tooltipInfo = (
                <div className="space-y-2 text-xs sm:text-sm">
                  <div className="font-bold text-sm sm:text-base text-gray-900 dark:text-gray-100">
                    {accion.label}
                  </div>
                  <div className="text-gray-700 dark:text-gray-300">
                    {accion.completado ? (
                      <>
                        <span className="font-medium text-emerald-600 dark:text-emerald-400">✅ Completado</span>
                        <br />
                        {accion.id === "productos" && `Has usado ${accion.actual} productos diferentes en tus ventas este mes`}
                        {accion.id === "clientes" && `Has atendido a ${accion.actual} clientes diferentes este mes`}
                        {accion.id === "ventas" && `Has realizado ${accion.actual} ventas este mes`}
                        {accion.id === "productos_imagenes" && `Tienes ${accion.actual} productos con imágenes`}
                      </>
                    ) : (
                      <>
                        Progreso: <span className="font-bold">{accion.actual}</span> de <span className="font-bold">{accion.meta}</span>
                        <br />
                        <span className="text-gray-600 dark:text-gray-400">
                          {Math.round(accion.progreso)}% completado
                        </span>
                        {accion.id === "productos" && (
                          <div className="text-xs text-gray-500 mt-1">
                            Basado en productos únicos usados en tus ventas del mes actual
                          </div>
                        )}
                        {accion.id === "clientes" && (
                          <div className="text-xs text-gray-500 mt-1">
                            Basado en clientes únicos atendidos en tus ventas del mes actual
                          </div>
                        )}
                      </>
                    )}
                  </div>
                  {!accion.completado && (
                    <div className="pt-2 mt-2 border-t border-gray-200/50 dark:border-gray-700/50">
                      <div className="text-gray-600 dark:text-gray-400 text-xs mb-1">
                        Te faltan <span className="font-bold">{accion.meta - accion.actual}</span> para completar
                      </div>
                      {linkHref && (
                        <Link href={linkHref} className="text-primary dark:text-primary font-medium text-xs sm:text-sm hover:underline block">
                          {accion.id === "productos" && "Ver productos →"}
                          {accion.id === "clientes" && "Ver clientes →"}
                          {accion.id === "ventas" && "Crear venta →"}
                          {accion.id === "productos_imagenes" && "Agregar imágenes →"}
                        </Link>
                      )}
                    </div>
                  )}
                </div>
              );

              const content = (
                <div className="p-3 rounded-lg bg-card border border-default-200 hover:border-default-300 transition-colors">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Icon
                        icon={accion.icon}
                        className={`w-4 h-4 ${accion.completado ? "text-emerald-600" : "text-default-400"}`}
                      />
                      <span className="text-sm font-medium text-default-900">{accion.label}</span>
                    </div>
                    {accion.completado ? (
                      <Icon icon="heroicons:check-circle" className="w-5 h-5 text-emerald-600" />
                    ) : (
                      <span className="text-xs text-default-500">
                        {accion.actual} / {accion.meta}
                      </span>
                    )}
                  </div>
                  <div className="w-full bg-default-200 rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full transition-all ${
                        accion.completado ? "bg-emerald-500" : "bg-blue-500"
                      }`}
                      style={{ width: `${Math.min(100, accion.progreso)}%` }}
                    />
                  </div>
                </div>
              );

              return (
                <Tooltip key={accion.id}>
                  <TooltipTrigger asChild>
                    {linkHref && !accion.completado ? (
                      <Link href={linkHref} className="block">
                        {content}
                      </Link>
                    ) : (
                      <div className="cursor-help">{content}</div>
                    )}
                  </TooltipTrigger>
                  <TooltipContent side="top" color="secondary">
                    {tooltipInfo}
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </TooltipProvider>
      </CardContent>
    </Card>
  );
};

export default UserProgress;
