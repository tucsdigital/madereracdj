import { useState, useEffect, useRef } from "react";
import { collection, getDocs, query, where, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";

// Caché en memoria con TTL
const cache = {
  data: null,
  timestamp: 0,
  TTL: 2 * 60 * 1000, // 2 minutos
};

/**
 * Hook optimizado para obtener notificaciones de productos con stock bajo o sin stock
 * - Usa caché para evitar recargas innecesarias
 * - Carga reservas en batch (una sola consulta)
 * - Filtra productos en memoria de forma eficiente
 * - No bloquea la UI durante la carga
 */
export const useStockNotifications = () => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    const fetchStockNotifications = async () => {
      // Verificar caché primero
      const now = Date.now();
      if (cache.data && (now - cache.timestamp) < cache.TTL) {
        if (isMountedRef.current) {
          setNotifications(cache.data);
          setLoading(false);
        }
        return;
      }

      try {
        if (isMountedRef.current) {
          setLoading(true);
          setError(null);
        }

        // Cargar productos y reservas en paralelo
        const [productosSnap, reservasSnap] = await Promise.all([
          getDocs(query(collection(db, "productos"), orderBy("nombre"))),
          getDocs(query(
            collection(db, "reservasStock"),
            where("estado", "==", "activa")
          )),
        ]);

        // Procesar reservas una sola vez y crear mapa
        const reservasMap = new Map();
        const nowTimestamp = Date.now();
        
        reservasSnap.forEach((reservaDoc) => {
          const reserva = reservaDoc.data();
          const productoId = reserva.productoId;
          if (!productoId) return;

          const exp = reserva.expiresAt ? Date.parse(reserva.expiresAt) : 0;
          if (Number.isFinite(exp) && exp > nowTimestamp) {
            const cantidad = Number(reserva.cantidad) || 0;
            reservasMap.set(
              productoId,
              (reservasMap.get(productoId) || 0) + cantidad
            );
          }
        });

        // Procesar productos de forma eficiente
        const productosConProblemas = [];

        productosSnap.forEach((productoDoc) => {
          const productoData = productoDoc.data();
          const productoId = productoDoc.id;

          // Saltar productos sin valor en stock
          if (
            productoData.stock === null ||
            productoData.stock === undefined ||
            productoData.stock === ""
          ) {
            return;
          }

          const stockTotal = Number(productoData.stock) || 0;
          const stockMinimo = Number(productoData.min) || 0;
          const reservadas = reservasMap.get(productoId) || 0;
          const stockDisponible = Math.max(0, stockTotal - reservadas);

          const sinStock = stockDisponible === 0;
          const stockBajo = stockMinimo > 0 && stockDisponible <= stockMinimo;

          // Solo agregar productos con problemas
          if (sinStock || stockBajo) {
            productosConProblemas.push({
              id: productoId,
              nombre: productoData.nombre || "Producto sin nombre",
              stockDisponible,
              stockTotal,
              stockMinimo,
              categoria: productoData.categoria || "",
              unidad:
                productoData.unidadMedida ||
                productoData.unidad ||
                "",
              sinStock,
              stockBajo,
              faltante:
                stockMinimo > 0
                  ? Math.max(0, stockMinimo - stockDisponible)
                  : 0,
            });
          }
        });

        // Ordenar por prioridad
        productosConProblemas.sort((a, b) => {
          if (a.sinStock && !b.sinStock) return -1;
          if (!a.sinStock && b.sinStock) return 1;
          return (b.faltante || 0) - (a.faltante || 0);
        });

        // Actualizar caché
        cache.data = productosConProblemas;
        cache.timestamp = now;

        if (isMountedRef.current) {
          setNotifications(productosConProblemas);
          setLoading(false);
        }
      } catch (err) {
        console.error("Error al obtener notificaciones de stock:", err);
        if (isMountedRef.current) {
          setError(err.message);
          setNotifications([]);
          setLoading(false);
        }
      }
    };

    // Cargar inmediatamente
    fetchStockNotifications();

    // Actualizar cada 3 minutos (más frecuente pero con caché)
    const interval = setInterval(fetchStockNotifications, 3 * 60 * 1000);

    return () => {
      isMountedRef.current = false;
      clearInterval(interval);
    };
  }, []);

  return { notifications, loading, error };
};
