import { useState, useEffect } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";

/**
 * Hook para obtener notificaciones de productos con stock bajo o sin stock
 * Retorna productos directamente de la colección, no basado en ventas
 */
export const useStockNotifications = () => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchStockNotifications = async () => {
      try {
        setLoading(true);
        setError(null);

        const now = Date.now();
        const productosConProblemas = [];

        // Obtener todos los productos de la colección principal
        const productosQuery = query(collection(db, "productos"));
        const productosSnap = await getDocs(productosQuery);

        // Procesar cada producto
        for (const productoDoc of productosSnap.docs) {
          const productoData = productoDoc.data();
          const productoId = productoDoc.id;
          
          // Saltar productos que no tienen valor en stock (null, undefined, o vacío)
          if (productoData.stock === null || productoData.stock === undefined || productoData.stock === "") {
            continue;
          }
          
          const stockTotal = Number(productoData.stock) || 0;
          const stockMinimo = Number(productoData.min) || 0;

          // Verificar reservas activas
          let reservadas = 0;
          try {
            const reservasQuery = query(
              collection(db, "reservasStock"),
              where("productoId", "==", productoId)
            );
            const reservasSnap = await getDocs(reservasQuery);
            reservasSnap.forEach((reservaDoc) => {
              const reserva = reservaDoc.data();
              if (String(reserva.estado || "").toLowerCase() === "activa") {
                const exp = reserva.expiresAt ? Date.parse(reserva.expiresAt) : 0;
                if (Number.isFinite(exp) && exp > now) {
                  reservadas += Number(reserva.cantidad) || 0;
                }
              }
            });
          } catch (reservaError) {
            console.warn(`Error al obtener reservas para ${productoId}:`, reservaError);
          }

          const stockDisponible = Math.max(0, stockTotal - reservadas);
          const sinStock = stockDisponible === 0;
          const stockBajo = stockMinimo > 0 && stockDisponible <= stockMinimo;

          // Agregar a notificaciones si no tiene stock o tiene stock bajo
          if (sinStock || stockBajo) {
            productosConProblemas.push({
              id: productoId,
              nombre: productoData.nombre || "Producto sin nombre",
              stockDisponible,
              stockTotal,
              stockMinimo,
              categoria: productoData.categoria || "",
              unidad: productoData.unidadMedida || productoData.unidad || "",
              sinStock,
              stockBajo,
              faltante: stockMinimo > 0 ? Math.max(0, stockMinimo - stockDisponible) : 0,
            });
          }
        }

        // Ordenar por prioridad: sin stock primero, luego stock bajo, luego por mayor faltante
        const productosOrdenados = productosConProblemas.sort((a, b) => {
          // Primero los sin stock
          if (a.sinStock && !b.sinStock) return -1;
          if (!a.sinStock && b.sinStock) return 1;
          // Luego por mayor faltante
          return (b.faltante || 0) - (a.faltante || 0);
        });

        setNotifications(productosOrdenados);
      } catch (err) {
        console.error("Error al obtener notificaciones de stock:", err);
        setError(err.message);
        setNotifications([]);
      } finally {
        setLoading(false);
      }
    };

    fetchStockNotifications();

    // Actualizar cada 5 minutos
    const interval = setInterval(fetchStockNotifications, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  return { notifications, loading, error };
};
