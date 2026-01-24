/**
 * POST /api/daily-spin
 * Endpoint para jugar la ruleta diaria
 * Valida que el usuario no haya jugado hoy y genera resultado
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentDateKey } from "@/lib/daily/dateKey";
import { spinRoulette } from "@/lib/game/roulette";
import { dailySpinRepo, rewardClaimRepo } from "@/lib/repo";
import { checkRateLimit, getRateLimitKey } from "@/lib/security/rateLimit";
import { getCurrentUserServer } from "@/lib/auth/currentUser";

export async function POST(request: NextRequest) {
  try {
    // Obtener usuario
    const user = await getCurrentUserServer(request);
    if (!user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const dateKey = getCurrentDateKey();
    const ipAddress = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown";

    // Rate limiting
    const rateLimitKey = getRateLimitKey(user.id, "dailySpin");
    const rateLimit = checkRateLimit(rateLimitKey, 5, 60 * 1000); // 5 requests por minuto
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Demasiadas solicitudes. Intenta más tarde." },
        { status: 429 }
      );
    }

    // Verificar si ya jugó hoy (idempotencia)
    const existingSpin = await dailySpinRepo.findByUserAndDate(user.id, dateKey);
    if (existingSpin) {
      return NextResponse.json(
        {
          error: "Ya jugaste hoy",
          alreadyPlayed: true,
          result: {
            score: existingSpin.score,
            tier: existingSpin.tier,
            rewardType: existingSpin.rewardType,
            rewardMetadata: existingSpin.rewardMetadata,
          },
        },
        { status: 200 }
      );
    }

    // Generar resultado (solo en servidor)
    const result = spinRoulette();

    // Crear registro de spin
    const dailySpin = await dailySpinRepo.create({
      userId: user.id,
      dateKey,
      score: result.score,
      tier: result.tier,
      rewardType: result.rewardType,
      rewardMetadata: result.rewardMetadata,
      ipAddress,
      createdAt: new Date().toISOString(),
    });

    // Crear reward claim si hay premio
    if (result.rewardType !== "none" && result.rewardMetadata) {
      await rewardClaimRepo.create({
        userId: user.id,
        dailySpinId: dailySpin.id!,
        dateKey,
        rewardType: result.rewardType,
        rewardMetadata: result.rewardMetadata,
        status: "pending",
        createdAt: new Date().toISOString(),
      });
    }

    return NextResponse.json({
      success: true,
      result: {
        score: result.score,
        tier: result.tier,
        rewardType: result.rewardType,
        rewardMetadata: result.rewardMetadata,
      },
    });
  } catch (error) {
    console.error("Error en daily-spin:", error);
    return NextResponse.json(
      { error: "Error al procesar la jugada" },
      { status: 500 }
    );
  }
}
