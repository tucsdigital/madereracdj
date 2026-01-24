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

export async function GET(request: NextRequest) {
  try {
    // Intentar obtener usuario, pero no es obligatorio para ver el leaderboard
    const user = await getCurrentUserServer(request);

    const searchParams = request.nextUrl.searchParams;
    const dateKeyParam = searchParams.get("dateKey");
    const dateKey = dateKeyParam && isValidDateKey(dateKeyParam) ? dateKeyParam : getCurrentDateKey();

    // Obtener leaderboard (público)
    const leaderboard = await dailySpinRepo.getLeaderboard(dateKey, 10);

    // Obtener información del usuario solo si está autenticado
    let userSpin: DailySpin | null = null;
    let userPosition: number | null = null;
    let percentile: number | null = null;

    if (user) {
      userSpin = await dailySpinRepo.findByUserAndDate(user.id, dateKey);
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
    const yesterdayWinners = await dailyWinnerRepo.findByDate(yesterdayKey);

    return NextResponse.json({
      dateKey,
      hasPlayed: !!userSpin,
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
      yesterdayWinners: yesterdayWinners?.winners || null,
    });
  } catch (error) {
    console.error("Error en daily-status:", error);
    return NextResponse.json(
      { error: "Error al obtener el estado" },
      { status: 500 }
    );
  }
}
