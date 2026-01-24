"use client";

import { useAuth } from "@/provider/auth.provider";
import { Card, CardContent } from "@/components/ui/card";
import { Icon } from "@iconify/react";
import { useEffect, useState, useMemo } from "react";
import { db } from "@/lib/firebase";
import { collection, getDocs } from "firebase/firestore";

const PersonalSpace = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState({ ventas: 0, productos: 0, clientes: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const ventasSnap = await getDocs(collection(db, "ventas"));
        const productosSnap = await getDocs(collection(db, "productos"));
        const clientesSnap = await getDocs(collection(db, "clientes"));

        setStats({
          ventas: ventasSnap.docs.length,
          productos: productosSnap.docs.length,
          clientes: clientesSnap.docs.length,
        });
      } catch (error) {
        console.error("Error cargando estadísticas:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

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
    <Card className="rounded-xl shadow-md border border-default-200/70 overflow-hidden">
      <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-6">
        <div className="flex items-center gap-4">
          {/* Avatar/Logo */}
          <div className="w-16 h-16 rounded-xl bg-primary/20 flex items-center justify-center text-primary text-2xl font-bold border-2 border-primary/30">
            {inicial}
          </div>

          {/* Información */}
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold text-default-900 mb-1 truncate">{nombreNegocio}</h2>
            {!loading && (
              <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full ${estado.bg} border border-default-200`}>
                <Icon icon={estado.icon} className={`w-4 h-4 ${estado.color}`} />
                <span className={`text-xs font-semibold ${estado.color}`}>{estado.label} 🚀</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <CardContent className="p-6 pt-4">
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
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <p className="text-xs text-default-600 mb-1">Ventas</p>
              <p className="text-2xl font-bold text-default-900">{stats.ventas}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-default-600 mb-1">Productos</p>
              <p className="text-2xl font-bold text-default-900">{stats.productos}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-default-600 mb-1">Clientes</p>
              <p className="text-2xl font-bold text-default-900">{stats.clientes}</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default PersonalSpace;
