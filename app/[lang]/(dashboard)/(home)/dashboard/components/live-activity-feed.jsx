"use client";

import { useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Icon } from "@iconify/react";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { useDashboardData } from "../context/dashboard-data-context";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import Link from "next/link";

const LiveActivityFeed = () => {
  const { ventas, presupuestos, productos, loading: dataLoading } = useDashboardData();
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (dataLoading) {
      setLoading(true);
      return;
    }

    try {
      // Combinar y ordenar por fecha
      const allActivities = [
        ...ventas.map((v) => ({
          ...v,
          type: "venta",
          timestamp: v.fechaCreacion || v.fecha,
          message: `Nueva venta #${v.numeroPedido || v.id.slice(-6)}`,
          icon: "heroicons:shopping-cart",
          color: "text-emerald-600",
          bgColor: "bg-emerald-50",
        })),
        ...presupuestos.map((p) => ({
          ...p,
          type: "presupuesto",
          timestamp: p.fechaCreacion || p.fecha,
          message: `Nuevo presupuesto #${p.numeroPedido || p.id.slice(-6)}`,
          icon: "heroicons:document-text",
          color: "text-blue-600",
          bgColor: "bg-blue-50",
        })),
        // Productos recientes (últimos 3 agregados, sin filtrar por fecha)
        ...productos
          .slice(0, 3)
          .map((pr) => ({
            ...pr,
            type: "producto",
            timestamp: pr.fechaCreacion || new Date().toISOString(),
            message: `Producto agregado: ${pr.nombre}`,
            icon: "heroicons:cube",
            color: "text-purple-600",
            bgColor: "bg-purple-50",
          })),
      ]
        .filter((a) => a.timestamp)
        .sort((a, b) => {
          const dateA = new Date(a.timestamp);
          const dateB = new Date(b.timestamp);
          return dateB - dateA;
        })
        .slice(0, 8);

      setActivities(allActivities);
    } catch (error) {
      console.error("Error procesando actividades:", error);
    } finally {
      setLoading(false);
    }
  }, [ventas, presupuestos, productos, dataLoading]);

  const formatTime = (timestamp) => {
    if (!timestamp) return "hace un momento";
    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      return formatDistanceToNow(date, { addSuffix: true, locale: es });
    } catch {
      return "hace un momento";
    }
  };

  if (loading) {
    return (
      <Card className="relative rounded-3xl shadow-2xl border-0 overflow-hidden bg-gradient-to-br from-cyan-50/80 via-blue-50/60 to-indigo-50/80">
        <div className="absolute inset-0 bg-gradient-to-br from-white/40 via-transparent to-transparent pointer-events-none" />
        <CardHeader className="relative pb-4 pt-6 px-6 border-0 bg-transparent">
          <CardTitle className="text-xl font-bold flex items-center gap-3 text-transparent bg-clip-text bg-gradient-to-r from-cyan-600 via-blue-600 to-indigo-600">
            <div className="p-2 rounded-2xl bg-gradient-to-br from-cyan-200/50 to-blue-200/50 shadow-lg">
              <Icon icon="heroicons:bolt" className="w-6 h-6 text-blue-600" />
            </div>
            ¿Qué está pasando ahora?
          </CardTitle>
        </CardHeader>
        <CardContent className="relative pt-2 px-6 pb-6">
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-white/60" />
                <div className="flex-1">
                  <div className="h-4 w-3/4 bg-white/60 rounded mb-2" />
                  <div className="h-3 w-1/2 bg-white/60 rounded" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="relative rounded-3xl shadow-2xl border-0 overflow-hidden bg-gradient-to-br from-cyan-50/80 via-blue-50/60 to-indigo-50/80">
      <div className="absolute inset-0 bg-gradient-to-br from-white/40 via-transparent to-transparent pointer-events-none" />
      <CardHeader className="relative pb-4 pt-6 px-6 border-0 bg-transparent">
        <CardTitle className="text-xl font-bold flex items-center gap-3 text-transparent bg-clip-text bg-gradient-to-r from-cyan-600 via-blue-600 to-indigo-600">
          <div className="p-2 rounded-2xl bg-gradient-to-br from-cyan-200/50 to-blue-200/50 shadow-lg">
            <Icon icon="heroicons:bolt" className="w-6 h-6 text-blue-600" />
          </div>
          ¿Qué está pasando ahora?
        </CardTitle>
      </CardHeader>
      <CardContent className="relative pt-2 px-6 pb-6">
        {activities.length === 0 ? (
          <div className="text-center py-8 text-default-500">
            <Icon icon="heroicons:inbox" className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>No hay actividad reciente</p>
          </div>
        ) : (
          <TooltipProvider delayDuration={200}>
            <div className="space-y-3">
              {activities.map((activity, idx) => {
                const linkHref =
                  activity.type === "venta"
                    ? `/ventas/${activity.id}`
                    : activity.type === "presupuesto"
                    ? `/presupuestos/${activity.id}`
                    : null;

                const tooltipContent = (
                  <div className="space-y-2 text-xs sm:text-sm">
                    {activity.type === "venta" && (
                      <>
                        <div className="font-bold text-sm sm:text-base text-gray-900 dark:text-gray-100">
                          Venta #{activity.numeroPedido || activity.id.slice(-6)}
                        </div>
                        {activity.cliente?.nombre && (
                          <div className="text-gray-700 dark:text-gray-300">
                            <span className="font-medium">Cliente:</span> {activity.cliente.nombre}
                          </div>
                        )}
                        {activity.total && (
                          <div className="font-bold text-base sm:text-lg text-emerald-600 dark:text-emerald-400">
                            ${new Intl.NumberFormat("es-AR").format(Number(activity.total) || 0)}
                          </div>
                        )}
                        {activity.formaPago && (
                          <div className="text-gray-600 dark:text-gray-400 text-xs">
                            <span className="font-medium">Pago:</span> {activity.formaPago}
                          </div>
                        )}
                        {linkHref && (
                          <div className="pt-2 mt-2 border-t border-gray-200/50 dark:border-gray-700/50">
                            <span className="text-emerald-600 dark:text-emerald-400 font-medium text-xs sm:text-sm">
                              Click para ver detalles →
                            </span>
                          </div>
                        )}
                      </>
                    )}
                    {activity.type === "presupuesto" && (
                      <>
                        <div className="font-bold text-sm sm:text-base text-gray-900 dark:text-gray-100">
                          Presupuesto #{activity.numeroPedido || activity.id.slice(-6)}
                        </div>
                        {activity.cliente?.nombre && (
                          <div className="text-gray-700 dark:text-gray-300">
                            <span className="font-medium">Cliente:</span> {activity.cliente.nombre}
                          </div>
                        )}
                        {activity.total && (
                          <div className="font-bold text-base sm:text-lg text-blue-600 dark:text-blue-400">
                            ${new Intl.NumberFormat("es-AR").format(Number(activity.total) || 0)}
                          </div>
                        )}
                        {linkHref && (
                          <div className="pt-2 mt-2 border-t border-gray-200/50 dark:border-gray-700/50">
                            <span className="text-blue-600 dark:text-blue-400 font-medium text-xs sm:text-sm">
                              Click para ver detalles →
                            </span>
                          </div>
                        )}
                      </>
                    )}
                    {activity.type === "producto" && (
                      <>
                        <div className="font-bold text-sm sm:text-base text-gray-900 dark:text-gray-100">
                          {activity.nombre}
                        </div>
                        {activity.categoria && (
                          <div className="text-gray-700 dark:text-gray-300">
                            <span className="font-medium">Categoría:</span> {activity.categoria}
                          </div>
                        )}
                        {activity.precio && (
                          <div className="font-bold text-base sm:text-lg text-purple-600 dark:text-purple-400">
                            ${new Intl.NumberFormat("es-AR").format(Number(activity.precio) || 0)}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );

                const content = (
                  <div
                    className={`flex items-start gap-3 p-3 rounded-2xl transition-all shadow-md backdrop-blur-sm ${
                      linkHref
                        ? "bg-white/60 hover:bg-white/80 hover:shadow-lg cursor-pointer transform hover:scale-[1.01]"
                        : "bg-white/60 hover:bg-white/80"
                    }`}
                  >
                    <div
                      className={`w-10 h-10 rounded-full ${activity.bgColor} flex items-center justify-center flex-shrink-0`}
                    >
                      <Icon icon={activity.icon} className={`w-5 h-5 ${activity.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-default-900">{activity.message}</p>
                      <p className="text-xs text-default-500 mt-1">
                        {formatTime(activity.timestamp)}
                      </p>
                    </div>
                  </div>
                );

                return (
                  <Tooltip key={`${activity.type}-${activity.id}-${idx}`}>
                    <TooltipTrigger asChild>
                      {linkHref ? (
                        <Link href={linkHref} className="block">
                          {content}
                        </Link>
                      ) : (
                        <div>{content}</div>
                      )}
                    </TooltipTrigger>
                    <TooltipContent 
                      side="top" 
                      align="start"
                      sideOffset={8}
                      color="secondary"
                      style={{
                        maxWidth: 'calc(100vw - 4rem)',
                        width: 'auto',
                        minWidth: '200px',
                      }}
                      className="sm:max-w-[320px] md:max-w-[360px]"
                    >
                      {tooltipContent}
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          </TooltipProvider>
        )}
      </CardContent>
    </Card>
  );
};

export default LiveActivityFeed;
