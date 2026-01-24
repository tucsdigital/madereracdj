"use client";

import { useMemo, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Icon } from "@iconify/react";

const CommunityStats = () => {
  // Por ahora usamos datos simulados, pero esto se puede conectar a estadísticas agregadas
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simular carga de datos de comunidad
    // En el futuro esto podría venir de una API o colección agregada
    setTimeout(() => {
      setStats({
        ventasSemana: 2340,
        topPercentil: 20,
        crecimientoPercentil: 68,
      });
      setLoading(false);
    }, 500);
  }, []);

  if (loading || !stats) {
    return (
      <Card className="rounded-xl shadow-md border border-default-200/70">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Comunidad</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-3">
            <div className="h-16 bg-default-200 rounded-lg" />
            <div className="h-16 bg-default-200 rounded-lg" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-xl shadow-md border border-default-200/70">
      <CardHeader className="pb-3 border-b border-default-100/80">
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <Icon icon="heroicons:user-group" className="w-5 h-5 text-primary" />
          Comunidad
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4">
        <div className="space-y-3">
          <div className="p-4 rounded-lg bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200">
            <div className="flex items-center gap-3 mb-2">
              <Icon icon="heroicons:shopping-bag" className="w-5 h-5 text-blue-600" />
              <p className="text-sm font-medium text-default-900">
                Negocios como el tuyo vendieron
              </p>
            </div>
            <p className="text-2xl font-bold text-blue-600">{stats.ventasSemana.toLocaleString()}</p>
            <p className="text-xs text-default-600 mt-1">productos esta semana</p>
          </div>

          <div className="p-4 rounded-lg bg-card border border-default-200">
            <div className="flex items-center gap-3 mb-2">
              <Icon icon="heroicons:trophy" className="w-5 h-5 text-yellow-500" />
              <p className="text-sm font-medium text-default-900">
                Estás en el top {stats.topPercentil}%
              </p>
            </div>
            <p className="text-xs text-default-600">
              de tiendas más activas de la plataforma
            </p>
          </div>

          <div className="p-4 rounded-lg bg-card border border-default-200">
            <div className="flex items-center gap-3 mb-2">
              <Icon icon="heroicons:arrow-trending-up" className="w-5 h-5 text-emerald-600" />
              <p className="text-sm font-medium text-default-900">
                Este mes creciste más que el {stats.crecimientoPercentil}%
              </p>
            </div>
            <p className="text-xs text-default-600">
              de los usuarios de la plataforma
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default CommunityStats;
