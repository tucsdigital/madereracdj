"use client";

import { useMemo, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Icon } from "@iconify/react";
import { db } from "@/lib/firebase";
import { collection, getDocs } from "firebase/firestore";

const UserProgress = () => {
  const [data, setData] = useState({ productos: [], clientes: [], ventas: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const productosSnap = await getDocs(collection(db, "productos"));
        const clientesSnap = await getDocs(collection(db, "clientes"));
        const ventasSnap = await getDocs(collection(db, "ventas"));

        setData({
          productos: productosSnap.docs.map((d) => d.data()),
          clientes: clientesSnap.docs.map((d) => d.data()),
          ventas: ventasSnap.docs.map((d) => d.data()),
        });
      } catch (error) {
        console.error("Error cargando datos:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const progress = useMemo(() => {
    if (loading) return null;

    const acciones = [
      {
        id: "productos",
        label: "Cargar productos",
        completado: data.productos.length > 0,
        progreso: Math.min(100, (data.productos.length / 10) * 100),
        icon: "heroicons:cube",
        meta: 10,
        actual: data.productos.length,
      },
      {
        id: "clientes",
        label: "Agregar clientes",
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
        completado: data.productos.filter((p) => p.imagenes && p.imagenes.length > 0).length > 0,
        progreso: Math.min(
          100,
          (data.productos.filter((p) => p.imagenes && p.imagenes.length > 0).length / data.productos.length) * 100 || 0
        ),
        icon: "heroicons:photo",
        meta: data.productos.length || 1,
        actual: data.productos.filter((p) => p.imagenes && p.imagenes.length > 0).length,
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
        {/* Nivel general */}
        <div className={`p-4 rounded-lg ${progress.nivelBg} border border-default-200`}>
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

        {/* Próximo paso */}
        {progress.proximoPaso && (
          <div className="p-3 rounded-lg bg-card border border-default-200">
            <p className="text-xs font-medium text-default-600 mb-2">Próximo paso:</p>
            <div className="flex items-center gap-2">
              <Icon icon={progress.proximoPaso.icon} className="w-4 h-4 text-primary" />
              <span className="text-sm text-default-900">{progress.proximoPaso.label}</span>
            </div>
          </div>
        )}

        {/* Lista de acciones */}
        <div className="space-y-2">
          {progress.acciones.map((accion) => (
            <div key={accion.id} className="p-3 rounded-lg bg-card border border-default-200">
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
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default UserProgress;
