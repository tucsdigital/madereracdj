"use client";

import { useMemo, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Icon } from "@iconify/react";
import { db } from "@/lib/firebase";
import { collection, getDocs } from "firebase/firestore";
import Link from "next/link";

const Opportunities = () => {
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

  const opportunities = useMemo(() => {
    if (loading) return [];

    const ops = [];

    // Productos sin imágenes
    const productosSinImagen = data.productos.filter(
      (p) => !p.imagenes || p.imagenes.length === 0
    );
    if (productosSinImagen.length > 0) {
      ops.push({
        id: "productos_imagenes",
        titulo: "Agregar imágenes a tus productos",
        descripcion: `${productosSinImagen.length} productos sin imágenes`,
        beneficio: "+40% más ventas en promedio",
        icon: "heroicons:photo",
        color: "text-blue-600",
        bgColor: "bg-blue-50",
        link: "/productos",
        accion: "Agregar imágenes",
      });
    }

    // Pocos productos
    if (data.productos.length < 10) {
      ops.push({
        id: "mas_productos",
        titulo: "Ampliar tu catálogo",
        descripcion: `Tienes ${data.productos.length} productos`,
        beneficio: "Más opciones = más ventas",
        icon: "heroicons:plus-circle",
        color: "text-emerald-600",
        bgColor: "bg-emerald-50",
        link: "/productos",
        accion: "Agregar productos",
      });
    }

    // Pocos clientes
    if (data.clientes.length < 5) {
      ops.push({
        id: "mas_clientes",
        titulo: "Agregar más clientes",
        descripcion: `Tienes ${data.clientes.length} clientes registrados`,
        beneficio: "Base de clientes más sólida",
        icon: "heroicons:user-plus",
        color: "text-purple-600",
        bgColor: "bg-purple-50",
        link: "/clientes",
        accion: "Agregar clientes",
      });
    }

    // Sin ventas recientes
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const ventasRecientes = data.ventas.filter((v) => {
      const fecha = v.fechaCreacion || v.fecha;
      if (!fecha) return false;
      const fechaVenta = fecha.toDate ? fecha.toDate() : new Date(fecha);
      return fechaVenta >= hoy;
    });

    if (ventasRecientes.length === 0 && data.ventas.length > 0) {
      ops.push({
        id: "nuevas_ventas",
        titulo: "Generar nuevas ventas",
        descripcion: "No hay ventas hoy",
        beneficio: "Mantén el flujo activo",
        icon: "heroicons:shopping-cart",
        color: "text-orange-600",
        bgColor: "bg-orange-50",
        link: "/ventas",
        accion: "Crear venta",
      });
    }

    return ops.slice(0, 3); // Máximo 3 oportunidades
  }, [data, loading]);

  if (loading) {
    return (
      <Card className="rounded-xl shadow-md border border-default-200/70">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Oportunidades</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="animate-pulse p-4 rounded-lg bg-default-100 h-24" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (opportunities.length === 0) {
    return (
      <Card className="rounded-xl shadow-md border border-default-200/70">
        <CardHeader className="pb-3 border-b border-default-100/80">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <Icon icon="heroicons:sparkles" className="w-5 h-5 text-yellow-500" />
            Oportunidades
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="text-center py-6 text-default-500">
            <Icon icon="heroicons:check-circle" className="w-12 h-12 mx-auto mb-2 text-emerald-500 opacity-50" />
            <p className="text-sm">¡Todo está al día! 🎉</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-xl shadow-md border border-default-200/70">
      <CardHeader className="pb-3 border-b border-default-100/80">
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <Icon icon="heroicons:sparkles" className="w-5 h-5 text-yellow-500" />
          Oportunidades
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4">
        <div className="space-y-3">
          {opportunities.map((op) => (
            <Link
              key={op.id}
              href={op.link}
              className="block p-4 rounded-lg border border-default-200 hover:border-primary/50 hover:shadow-md transition-all bg-card group"
            >
              <div className="flex items-start gap-3">
                <div className={`w-10 h-10 rounded-lg ${op.bgColor} flex items-center justify-center flex-shrink-0`}>
                  <Icon icon={op.icon} className={`w-5 h-5 ${op.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-semibold text-default-900 mb-1 group-hover:text-primary transition-colors">
                    {op.titulo}
                  </h4>
                  <p className="text-xs text-default-600 mb-2">{op.descripcion}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-emerald-600">{op.beneficio}</span>
                    <span className="text-xs text-primary font-medium group-hover:underline">
                      {op.accion} →
                    </span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default Opportunities;
