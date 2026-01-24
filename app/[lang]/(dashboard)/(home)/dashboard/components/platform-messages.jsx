"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Icon } from "@iconify/react";
import { useDashboardData } from "../context/dashboard-data-context";

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

const PlatformMessages = () => {
  const { allVentas = [], productos, loading } = useDashboardData();
  
  // Filtrar ventas del mes actual
  const ventasMesActual = useMemo(() => {
    if (!allVentas || allVentas.length === 0) return [];
    return allVentas.filter((v) => isCurrentMonth(v.fechaCreacion || v.fecha));
  }, [allVentas]);
  
  const data = { ventas: ventasMesActual, productos };

  const messages = useMemo(() => {
    if (loading) return [];

    const msgs = [];

    // Mensaje basado en ventas
    const totalVentas = data.ventas.length;
    if (totalVentas >= 100) {
      msgs.push({
        type: "celebration",
        icon: "heroicons:party-popper",
        color: "text-yellow-600",
        bgColor: "bg-yellow-50",
        titulo: "¡Felicitaciones! 🎉",
        mensaje: `Tu negocio acaba de superar las ${totalVentas} ventas. ¡Sigue así!`,
      });
    } else if (totalVentas >= 50) {
      msgs.push({
        type: "achievement",
        icon: "heroicons:trophy",
        color: "text-emerald-600",
        bgColor: "bg-emerald-50",
        titulo: "¡Gran logro!",
        mensaje: `Has alcanzado ${totalVentas} ventas. Estás en el camino correcto.`,
      });
    }

    // Mensaje basado en productos
    const productosConImagenes = data.productos.filter(
      (p) => p.imagenes && p.imagenes.length > 0
    );
    const porcentajeConImagenes =
      data.productos.length > 0
        ? (productosConImagenes.length / data.productos.length) * 100
        : 0;

    if (porcentajeConImagenes < 50 && data.productos.length > 0) {
      msgs.push({
        type: "tip",
        icon: "heroicons:light-bulb",
        color: "text-blue-600",
        bgColor: "bg-blue-50",
        titulo: "Tip del día 💡",
        mensaje: "Las tiendas que suben 5 fotos más venden 40% más. ¡Agrega imágenes a tus productos!",
      });
    }

    // Mensaje motivacional genérico si no hay otros
    if (msgs.length === 0) {
      msgs.push({
        type: "motivation",
        icon: "heroicons:rocket-launch",
        color: "text-purple-600",
        bgColor: "bg-purple-50",
        titulo: "¡Sigue creciendo! 🚀",
        mensaje: "Tu negocio está en movimiento. Cada acción cuenta.",
      });
    }

    return msgs.slice(0, 2); // Máximo 2 mensajes
  }, [data, loading]);

  if (loading) {
    return (
      <Card className="relative rounded-3xl shadow-2xl border-0 overflow-hidden bg-gradient-to-br from-lime-50/80 via-green-50/60 to-emerald-50/80 backdrop-blur-xl">
        <div className="absolute inset-0 bg-gradient-to-br from-white/40 via-transparent to-transparent pointer-events-none" />
        <CardHeader className="relative pb-4 pt-6 px-6 border-0 bg-transparent">
          <CardTitle className="text-xl font-bold flex items-center gap-3 text-transparent bg-clip-text bg-gradient-to-r from-lime-600 via-green-600 to-emerald-600">
            <div className="p-2 rounded-2xl bg-gradient-to-br from-lime-200/50 to-green-200/50 shadow-lg">
              <Icon icon="heroicons:chat-bubble-left-right" className="w-6 h-6 text-green-600" />
            </div>
            Mensajes de la plataforma
          </CardTitle>
        </CardHeader>
        <CardContent className="relative pt-2 px-6 pb-6">
          <div className="animate-pulse space-y-3">
            <div className="h-20 bg-white/60 rounded-2xl" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (messages.length === 0) {
    return null;
  }

  return (
    <Card className="relative rounded-3xl shadow-2xl border-0 overflow-hidden bg-gradient-to-br from-lime-50/80 via-green-50/60 to-emerald-50/80 backdrop-blur-xl">
      <div className="absolute inset-0 bg-gradient-to-br from-white/40 via-transparent to-transparent pointer-events-none" />
      <CardHeader className="relative pb-4 pt-6 px-6 border-0 bg-transparent">
        <CardTitle className="text-xl font-bold flex items-center gap-3 text-transparent bg-clip-text bg-gradient-to-r from-lime-600 via-green-600 to-emerald-600">
          <div className="p-2 rounded-2xl bg-gradient-to-br from-lime-200/50 to-green-200/50 shadow-lg">
            <Icon icon="heroicons:chat-bubble-left-right" className="w-6 h-6 text-green-600" />
          </div>
          Mensajes de la plataforma
        </CardTitle>
      </CardHeader>
      <CardContent className="relative pt-2 px-6 pb-6">
        <div className="space-y-4">
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`p-5 rounded-2xl shadow-xl backdrop-blur-sm border-0 transition-all hover:scale-[1.01] ${msg.bgColor}`}
            >
              <div className="flex items-start gap-3">
                <Icon icon={msg.icon} className={`w-5 h-5 ${msg.color} flex-shrink-0 mt-0.5`} />
                <div className="flex-1">
                  <h4 className="text-sm font-semibold text-default-900 mb-1">{msg.titulo}</h4>
                  <p className="text-xs text-default-700 leading-relaxed">{msg.mensaje}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default PlatformMessages;
