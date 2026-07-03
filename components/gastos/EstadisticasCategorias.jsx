"use client";
import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart3, TrendingUp, DollarSign, PieChart } from "lucide-react";

const EstadisticasCategorias = ({ gastosInternos, categoriasActivas, fechaDesde, fechaHasta }) => {
  // Calcular estadísticas por categoría
  const estadisticas = useMemo(() => {
    const stats = {};
    
    // Inicializar todas las categorías
    categoriasActivas.forEach(cat => {
      stats[cat.id] = {
        categoria: cat,
        total: 0,
        cantidad: 0,
        porcentaje: 0,
      };
    });

    // Calcular totales
    gastosInternos.forEach(gasto => {
      const categoriaId = gasto.categoria;
      const categoriaNombre = gasto.categoriaNombre || gasto.categoria;
      
      // Buscar categoría por ID o nombre
      const categoria = categoriasActivas.find(
        c => c.id === categoriaId || c.nombre === categoriaNombre
      );
      
      if (categoria && stats[categoria.id]) {
        stats[categoria.id].total += Number(gasto.monto) || 0;
        stats[categoria.id].cantidad += 1;
      }
    });

    // Calcular total general
    const totalGeneral = Object.values(stats).reduce((acc, stat) => acc + stat.total, 0);

    // Calcular porcentajes
    Object.keys(stats).forEach(key => {
      stats[key].porcentaje = totalGeneral > 0 
        ? (stats[key].total / totalGeneral) * 100 
        : 0;
    });

    // Ordenar por total descendente
    return Object.values(stats)
      .filter(stat => stat.cantidad > 0)
      .sort((a, b) => b.total - a.total);
  }, [gastosInternos, categoriasActivas]);

  const totalGeneral = estadisticas.reduce((acc, stat) => acc + stat.total, 0);
  const totalGastos = estadisticas.reduce((acc, stat) => acc + stat.cantidad, 0);

  if (estadisticas.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Estadísticas por Categoría
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-gray-500">
            No hay datos para mostrar en el período seleccionado.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Resumen de estadísticas */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-500">Total de Gastos</div>
                <div className="text-2xl font-bold text-green-600">
                  {totalGastos}
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  Registros en el período
                </div>
              </div>
              <TrendingUp className="w-8 h-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-500">Categorías con Gastos</div>
                <div className="text-2xl font-bold text-purple-600">
                  {estadisticas.length}
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  Categorías activas con movimientos
                </div>
              </div>
              <PieChart className="w-8 h-8 text-purple-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabla detallada */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Desglose Detallado por Categoría</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4 font-semibold">Categoría</th>
                  <th className="text-right py-3 px-4 font-semibold">Cantidad</th>
                  <th className="text-right py-3 px-4 font-semibold">Total</th>
                  <th className="text-right py-3 px-4 font-semibold">Porcentaje</th>
                </tr>
              </thead>
              <tbody>
                {estadisticas.map((stat, idx) => (
                  <tr key={stat.categoria.id} className="border-b hover:bg-gray-50">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <Badge className={stat.categoria.color || "bg-gray-100"}>
                          {stat.categoria.nombre}
                        </Badge>
                        {idx === 0 && (
                          <span className="text-xs text-green-600 font-semibold">🏆 Mayor</span>
                        )}
                      </div>
                    </td>
                    <td className="text-right py-3 px-4 font-medium">
                      {stat.cantidad}
                    </td>
                    <td className="text-right py-3 px-4 font-bold text-blue-600">
                      ${stat.total.toLocaleString("es-AR")}
                    </td>
                    <td className="text-right py-3 px-4">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-24 bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-blue-600 h-2 rounded-full"
                            style={{ width: `${stat.porcentaje}%` }}
                          />
                        </div>
                        <span className="text-sm font-medium w-12 text-right">
                          {stat.porcentaje.toFixed(1)}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 font-bold">
                  <td className="py-3 px-4">Total</td>
                  <td className="text-right py-3 px-4">{totalGastos}</td>
                  <td className="text-right py-3 px-4 text-blue-600">
                    ${totalGeneral.toLocaleString("es-AR")}
                  </td>
                  <td className="text-right py-3 px-4">100%</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default EstadisticasCategorias;
