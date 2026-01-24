"use client";

import { useState, useEffect, useCallback } from "react";
import { getCurrentDateKey } from "@/lib/daily/dateKey";
import { useAuth } from "@/provider/auth.provider";

interface DailyStatus {
  dateKey: string;
  hasPlayed: boolean;
  userResult: {
    score: number;
    tier: string;
    rewardType: string;
    rewardMetadata?: any;
  } | null;
  leaderboard: {
    top10: Array<{
      userId: string;
      score: number;
      position: number;
      tier: string;
      email?: string | null;
      alias?: string | null;
    }>;
    totalPlayers: number;
  };
  userPosition: number | null;
  percentile: number | null;
  winners: any[] | null;
  spotlight: {
    userId: string;
    contentBlocks: any[];
  } | null;
  yesterdayWinners: Array<{
    userId: string;
    score: number;
    position: number;
    rewardType?: string;
    email?: string | null;
    alias?: string | null;
    tier?: string;
  }> | null;
}

export function useDailyRitual() {
  const { user, loading: authLoading } = useAuth();
  const [status, setStatus] = useState<DailyStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [spinning, setSpinning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getAuthToken = useCallback(async () => {
    if (!user) return null;
    try {
      // Verificar que user tenga el método getIdToken (Firebase Auth User)
      const firebaseUser = user as any; // Firebase Auth User tiene getIdToken
      if (firebaseUser && typeof firebaseUser.getIdToken === "function") {
        const token = await firebaseUser.getIdToken();
        return token;
      }
      return null;
    } catch (error) {
      console.error("Error obteniendo token:", error);
      return null;
    }
  }, [user]);

  const fetchStatus = useCallback(async (dateKey?: string) => {
    try {
      setLoading(true);
      const key = dateKey || getCurrentDateKey();
      const token = await getAuthToken();
      const headers: HeadersInit = { "Content-Type": "application/json" };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
      const response = await fetch(`/api/daily-status?dateKey=${key}`, { headers });
      if (!response.ok) throw new Error("Error al cargar estado");
      const data = await response.json();
      console.log("[useDailyRitual] Estado recibido:", { hasPlayed: data.hasPlayed, userResult: data.userResult });
      setStatus(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, [getAuthToken]);

  const spin = useCallback(async () => {
    // Verificar que el usuario esté autenticado antes de intentar jugar
    if (!user) {
      setError("Debes iniciar sesión para jugar");
      return;
    }

    try {
      setSpinning(true);
      setError(null);
      
      console.log("Obteniendo token para usuario:", (user as any)?.uid);
      const token = await getAuthToken();
      
      if (!token) {
        console.error("No se pudo obtener el token");
        setError("No se pudo obtener el token de autenticación. Por favor, inicia sesión nuevamente.");
        return;
      }

      console.log("Token obtenido, enviando request...");
      console.log("Token length:", token.length);
      console.log("Token preview:", token.substring(0, 20) + "...");
      
      const headers: HeadersInit = { 
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      };
      
      console.log("Headers a enviar:", {
        "Content-Type": headers["Content-Type"],
        "Authorization": headers["Authorization"] ? `${headers["Authorization"].substring(0, 20)}...` : "missing"
      });
      
      const response = await fetch("/api/daily-spin", {
        method: "POST",
        headers,
      });

      const data = await response.json();

      if (!response.ok) {
        console.error("Error en respuesta:", data);
        throw new Error(data.error || "Error al jugar");
      }

      // Si ya jugó hoy, actualizar estado y mostrar resultado
      if (data.alreadyPlayed) {
        console.log("Usuario ya jugó hoy, actualizando estado...");
        setSpinning(false); // No mostrar animación si ya jugó
        await fetchStatus();
        return;
      }

      // Mantener la animación visible por al menos 2 segundos para efecto dramático
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Esperar un momento para que Firestore propague el documento recién creado
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Actualizar estado después de jugar (forzar actualización)
      console.log("[useDailyRitual] Actualizando estado después de jugar...");
      await fetchStatus();
      
      // Mantener spinning un poco más para que la transición sea suave
      await new Promise(resolve => setTimeout(resolve, 300));
    } catch (err) {
      console.error("Error en spin:", err);
      setError(err instanceof Error ? err.message : "Error al jugar");
    } finally {
      setSpinning(false);
    }
  }, [fetchStatus, getAuthToken, user]);

  useEffect(() => {
    // Esperar a que la autenticación termine de cargar
    if (!authLoading) {
      fetchStatus();
    }
  }, [fetchStatus, authLoading]);

  return {
    status,
    loading,
    spinning,
    error,
    spin,
    refetch: fetchStatus,
  };
}
