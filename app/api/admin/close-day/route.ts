/**
 * POST /api/admin/close-day
 * Endpoint admin para cerrar el día y calcular winners
 * En producción, esto debería ejecutarse automáticamente con un cron job
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentDateKey, getYesterdayDateKey, isValidDateKey } from "@/lib/daily/dateKey";
import { dailySpinRepo, dailyWinnerRepo, rewardClaimRepo } from "@/lib/repo";
import { getCurrentUserServer } from "@/lib/auth/currentUser";

// TODO: Implementar verificación de admin
function isAdmin(user: { id: string; email: string }): boolean {
  // Placeholder - implementar según tu sistema de roles
  // Ejemplo: const adminEmails = process.env.ADMIN_EMAILS?.split(',') || [];
  // return adminEmails.includes(user.email);
  return true; // Por ahora permitir a todos (cambiar en producción)
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUserServer(request);
    if (!user || !isAdmin(user)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = await request.json();
    const dateKeyParam = body.dateKey;
    const dateKey = dateKeyParam && isValidDateKey(dateKeyParam) ? dateKeyParam : getYesterdayDateKey();

    // Verificar si ya se computaron winners para este día
    const existing = await dailyWinnerRepo.findByDate(dateKey);
    if (existing) {
      return NextResponse.json({
        success: true,
        message: "Winners ya fueron computados para este día",
        winners: existing,
      });
    }

    // Obtener leaderboard completo del día
    const leaderboard = await dailySpinRepo.getLeaderboard(dateKey, 1000); // Obtener muchos para calcular percentiles

    if (leaderboard.entries.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No hubo jugadores este día",
        winners: null,
      });
    }

    // Calcular winners según reglas:
    // - Top 1: primer lugar
    // - Top 3: primeros 3 lugares
    // - Top 10: primeros 10 lugares
    // - Top 10%: percentil 90+
    const totalPlayers = leaderboard.totalPlayers;
    const top10Percent = Math.max(1, Math.floor(totalPlayers * 0.1));

    const winners = {
      top1: leaderboard.entries.slice(0, 1),
      top3: leaderboard.entries.slice(0, 3),
      top10: leaderboard.entries.slice(0, 10),
      top10Percent: leaderboard.entries.slice(0, top10Percent),
    };

    // Buscar spotlight activo (usuario con rewardType spotlight aprobado)
    const spotlightClaim = await rewardClaimRepo.getActiveSpotlight(dateKey);
    const spotlightUserId = spotlightClaim?.userId;

    // Guardar winners
    const dailyWinner = await dailyWinnerRepo.create({
      dateKey,
      winners: leaderboard.entries.map((entry, index) => ({
        userId: entry.userId,
        score: entry.score,
        position: index + 1,
        rewardType: index === 0 ? "spotlight" : index < 3 ? "badge" : index < 10 ? "perk" : undefined,
      })),
      spotlightUserId,
      computedAt: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      dateKey,
      winners: dailyWinner.winners,
      spotlightUserId,
      stats: {
        totalPlayers,
        top1: winners.top1.length,
        top3: winners.top3.length,
        top10: winners.top10.length,
        top10Percent: winners.top10Percent.length,
      },
    });
  } catch (error) {
    console.error("Error en close-day:", error);
    return NextResponse.json(
      { error: "Error al cerrar el día" },
      { status: 500 }
    );
  }
}
