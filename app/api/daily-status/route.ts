/**
 * GET /api/daily-status?dateKey=YYYY-MM-DD
 * Obtiene el estado del ritual diario para un usuario
 * Incluye: si jugó, resultado, leaderboard, posición, winners, spotlight
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentDateKey, getYesterdayDateKey, isValidDateKey } from "@/lib/daily/dateKey";
import { dailySpinRepo, rewardClaimRepo, dailyWinnerRepo } from "@/lib/repo";
import { getCurrentUserServer } from "@/lib/auth/currentUser";
import { DailySpin } from "@/lib/repo/interfaces";
import { getAdminAuth } from "@/lib/firebase-admin";

export async function GET(request: NextRequest) {
  try {
    // Intentar obtener usuario, pero no es obligatorio para ver el leaderboard
    // getCurrentUserServer retorna null si no hay token o si el token es inválido
    // Esto permite acceso público al leaderboard
    let user = null;
    try {
      user = await getCurrentUserServer(request);
    } catch (authError: any) {
      // Si hay un error de autenticación, continuar sin usuario (acceso público)
      console.warn("Error de autenticación (continuando sin usuario):", authError?.message);
      user = null;
    }

    const searchParams = request.nextUrl.searchParams;
    const dateKeyParam = searchParams.get("dateKey");
    const dateKey = dateKeyParam && isValidDateKey(dateKeyParam) ? dateKeyParam : getCurrentDateKey();

    // Obtener leaderboard (público)
    // Ahora el leaderboard ya incluye email y alias guardados
    const leaderboard = await dailySpinRepo.getLeaderboard(dateKey, 10);

    // Obtener información del usuario solo si está autenticado
    let userSpin: DailySpin | null = null;
    let userPosition: number | null = null;
    let percentile: number | null = null;

    if (user) {
      userSpin = await dailySpinRepo.findByUserAndDate(user.id, dateKey);
      console.log(`[daily-status] Usuario: ${user.id}, dateKey: ${dateKey}, userSpin encontrado:`, userSpin ? `Sí (score: ${userSpin.score})` : "No");
      userPosition = userSpin ? await dailySpinRepo.getUserPosition(user.id, dateKey) : null;
      
      // Calcular percentil aproximado
      if (userPosition && leaderboard.totalPlayers > 0) {
        percentile = Math.round(((leaderboard.totalPlayers - userPosition) / leaderboard.totalPlayers) * 100);
      }
    }

    // Obtener winners del día (si ya se computaron)
    const winners = await dailyWinnerRepo.findByDate(dateKey);

    // Obtener spotlight activo
    const spotlight = await rewardClaimRepo.getActiveSpotlight(dateKey);

    // Obtener winners de ayer
    const yesterdayKey = getYesterdayDateKey();
    const yesterdayWinnersData = await dailyWinnerRepo.findByDate(yesterdayKey);
    
    // Obtener datos completos de los winners de ayer (usando campos guardados)
    const yesterdayWinnersWithEmails = yesterdayWinnersData?.winners
      ? await Promise.all(
          yesterdayWinnersData.winners.map(async (winner) => {
            // Obtener el spin para obtener email, alias y tier guardados
            const spin = await dailySpinRepo.findByUserAndDate(winner.userId, yesterdayKey);
            return {
              ...winner,
              email: spin?.email || null,
              alias: spin?.alias || null,
              tier: spin?.tier || "common",
            };
          })
        )
      : null;

    const hasPlayedValue = !!userSpin;
    console.log(`[daily-status] Retornando hasPlayed: ${hasPlayedValue}, userResult:`, userSpin ? { score: userSpin.score, tier: userSpin.tier } : null);
    
    return NextResponse.json({
      dateKey,
      hasPlayed: hasPlayedValue,
      userResult: userSpin
        ? {
            score: userSpin.score || 0,
            tier: userSpin.tier || "common",
            rewardType: userSpin.rewardType || "none",
            rewardMetadata: userSpin.rewardMetadata,
          }
        : null,
      leaderboard: {
        top10: leaderboard.entries,
        totalPlayers: leaderboard.totalPlayers,
      },
      userPosition,
      percentile,
      winners: winners?.winners || null,
      spotlight: spotlight
        ? {
            userId: spotlight.userId,
            contentBlocks: spotlight.contentBlocks,
          }
        : null,
      yesterdayWinners: yesterdayWinnersWithEmails || null,
    });
  } catch (error) {
    console.error("Error en daily-status:", error);
    return NextResponse.json(
      { error: "Error al obtener el estado" },
      { status: 500 }
    );
  }
}
