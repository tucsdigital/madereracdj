"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Icon } from "@iconify/react";
import { db } from "@/lib/firebase";
import { collection, query, orderBy, limit, onSnapshot } from "firebase/firestore";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

const LiveActivityFeed = () => {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Obtener las últimas ventas, presupuestos y productos recientes
    const activities = [];

    // Ventas recientes
    const ventasQuery = query(
      collection(db, "ventas"),
      orderBy("fechaCreacion", "desc"),
      limit(5)
    );

    const unsubscribeVentas = onSnapshot(ventasQuery, (snapshot) => {
      const ventas = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        type: "venta",
      }));

      // Presupuestos recientes
      const presupuestosQuery = query(
        collection(db, "presupuestos"),
        orderBy("fechaCreacion", "desc"),
        limit(5)
      );

      const unsubscribePresupuestos = onSnapshot(presupuestosQuery, (snapshot) => {
        const presupuestos = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
          type: "presupuesto",
        }));

        // Productos recientes (últimos agregados)
        const productosQuery = query(
          collection(db, "productos"),
          orderBy("fechaCreacion", "desc"),
          limit(3)
        );

        const unsubscribeProductos = onSnapshot(productosQuery, (snapshot) => {
          const productos = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
            type: "producto",
          }));

          // Combinar y ordenar por fecha
          const allActivities = [
            ...ventas.map((v) => ({
              ...v,
              timestamp: v.fechaCreacion || v.fecha,
              message: `Nueva venta #${v.numeroPedido || v.id.slice(-6)}`,
              icon: "heroicons:shopping-cart",
              color: "text-emerald-600",
              bgColor: "bg-emerald-50",
            })),
            ...presupuestos.map((p) => ({
              ...p,
              timestamp: p.fechaCreacion || p.fecha,
              message: `Nuevo presupuesto #${p.numeroPedido || p.id.slice(-6)}`,
              icon: "heroicons:document-text",
              color: "text-blue-600",
              bgColor: "bg-blue-50",
            })),
            ...productos.map((pr) => ({
              ...pr,
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
          setLoading(false);
        });
      });
    });

    return () => {
      unsubscribeVentas();
    };
  }, []);

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
      <Card className="rounded-xl shadow-md border border-default-200/70">
        <CardHeader>
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <Icon icon="heroicons:bolt" className="w-5 h-5 text-yellow-500" />
            ¿Qué está pasando ahora?
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-default-200" />
                <div className="flex-1">
                  <div className="h-4 w-3/4 bg-default-200 rounded mb-2" />
                  <div className="h-3 w-1/2 bg-default-200 rounded" />
                </div>
              </div>
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
          <Icon icon="heroicons:bolt" className="w-5 h-5 text-yellow-500 animate-pulse" />
          ¿Qué está pasando ahora?
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4">
        {activities.length === 0 ? (
          <div className="text-center py-8 text-default-500">
            <Icon icon="heroicons:inbox" className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>No hay actividad reciente</p>
          </div>
        ) : (
          <div className="space-y-3">
            {activities.map((activity, idx) => (
              <div
                key={`${activity.type}-${activity.id}-${idx}`}
                className="flex items-start gap-3 p-3 rounded-lg hover:bg-default-50 transition-colors border border-transparent hover:border-default-200"
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
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default LiveActivityFeed;
