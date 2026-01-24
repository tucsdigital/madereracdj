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
  yesterdayWinners: any[] | null;
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
      setStatus(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, [getAuthToken]);

  const spin = useCallback(async () => {
    try {
      setSpinning(true);
      setError(null);
      const token = await getAuthToken();
      const headers: HeadersInit = { "Content-Type": "application/json" };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
      const response = await fetch("/api/daily-spin", {
        method: "POST",
        headers,
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.alreadyPlayed) {
          // Ya jugó, actualizar estado
          await fetchStatus();
          return;
        }
        throw new Error(data.error || "Error al jugar");
      }

      // Actualizar estado después de jugar
      await fetchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al jugar");
    } finally {
      setSpinning(false);
    }
  }, [fetchStatus, getAuthToken]);

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
