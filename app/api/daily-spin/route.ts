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
import { verifyFirebaseToken, getAdminAuth } from "@/lib/firebase-admin";
import { getUserAlias } from "@/lib/daily/userAliases";

export async function POST(request: NextRequest) {
  try {
    // Verificar autenticación directamente (como otros endpoints)
    // Next.js puede normalizar headers, intentar ambos casos
    const authHeader = request.headers.get("authorization") || request.headers.get("Authorization");
    console.log("=== DAILY-SPIN DEBUG ===");
    console.log("Authorization header (lowercase):", request.headers.get("authorization") ? "Presente" : "Ausente");
    console.log("Authorization header (uppercase):", request.headers.get("Authorization") ? "Presente" : "Ausente");
    console.log("AuthHeader final:", authHeader ? `${authHeader.substring(0, 20)}...` : "AUSENTE");
    
    if (!authHeader) {
      console.error("No hay header de autorización");
      return NextResponse.json(
        { error: "No autorizado. Debes iniciar sesión para jugar." },
        { status: 401 }
      );
    }
    
    let decoded: { uid?: string; email?: string } | null = null;
    try {
      console.log("Intentando verificar token...");
      console.log("isDevBypassEnabled:", process.env.NODE_ENV === "development");
      decoded = await verifyFirebaseToken(authHeader);
      console.log("Token verificado exitosamente, decoded:", {
        uid: decoded?.uid,
        email: decoded?.email,
        hasUid: !!decoded?.uid,
      });
    } catch (authError: any) {
      console.error("Error verificando token:", {
        message: authError?.message,
        status: authError?.status,
        code: authError?.code,
        stack: authError?.stack,
      });
      return NextResponse.json(
        { error: "No autorizado. Debes iniciar sesión para jugar." },
        { status: 401 }
      );
    }

    if (!decoded?.uid) {
      console.warn("Token verificado pero sin uid");
      return NextResponse.json(
        { error: "No autorizado. Debes iniciar sesión para jugar." },
        { status: 401 }
      );
    }

    const user = {
      id: decoded.uid,
      email: decoded.email || "",
    };

    console.log("Usuario creado:", user);
    console.log("Continuando con el proceso de spin...");

    const dateKey = getCurrentDateKey();
    console.log("DateKey:", dateKey);
    const ipAddress = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown";

    // Rate limiting
    console.log("Verificando rate limit...");
    const rateLimitKey = getRateLimitKey(user.id, "dailySpin");
    const rateLimit = checkRateLimit(rateLimitKey, 5, 60 * 1000); // 5 requests por minuto
    console.log("Rate limit result:", rateLimit);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Demasiadas solicitudes. Intenta más tarde." },
        { status: 429 }
      );
    }

    // Verificar si ya jugó hoy (idempotencia)
    console.log("Verificando si ya jugó hoy...");
    console.log("Buscando spin para userId:", user.id, "dateKey:", dateKey);
    let existingSpin: any = null;
    try {
      existingSpin = await dailySpinRepo.findByUserAndDate(user.id, dateKey);
      console.log("Existing spin:", existingSpin ? `Encontrado - score: ${existingSpin?.score}` : "No encontrado");
    } catch (dbError: any) {
      console.error("Error buscando spin existente:", dbError?.message);
      throw dbError;
    }
    
    if (existingSpin) {
      console.log("Usuario ya jugó hoy, retornando resultado existente");
      const responseData = {
        success: true,
        alreadyPlayed: true,
        result: {
          score: existingSpin.score || 0,
          tier: existingSpin.tier || "common",
          rewardType: existingSpin.rewardType || "none",
          rewardMetadata: existingSpin.rewardMetadata,
        },
      };
      console.log("Enviando respuesta (ya jugó):", responseData);
      return NextResponse.json(responseData, { status: 200 });
    }

    // Generar resultado (solo en servidor)
    console.log("Generando resultado de ruleta...");
    const result = spinRoulette();
    console.log("Resultado generado:", result);

    // Obtener email del usuario y calcular alias
    // Usar el email del token decodificado (ya disponible en user.email)
    const userEmail = user.email || null;
    const userAlias = userEmail ? getUserAlias(userEmail, user.id) : getUserAlias(null, user.id);
    console.log(`Usuario: ${user.id}, Email: ${userEmail}, Alias: ${userAlias}`);

    // Crear registro de spin
    console.log("Creando registro de spin en Firestore...");
    const dailySpin = await dailySpinRepo.create({
      userId: user.id,
      email: userEmail || undefined,
      alias: userAlias || undefined,
      dateKey,
      score: result.score,
      tier: result.tier,
      rewardType: result.rewardType,
      rewardMetadata: result.rewardMetadata,
      ipAddress,
      createdAt: new Date().toISOString(),
    });
    console.log("Spin creado exitosamente, id:", dailySpin.id);

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

    console.log("Enviando respuesta exitosa...");
    const response = NextResponse.json({
      success: true,
      result: {
        score: result.score,
        tier: result.tier,
        rewardType: result.rewardType,
        rewardMetadata: result.rewardMetadata,
      },
    });
    console.log("Respuesta creada, status:", response.status);
    return response;
  } catch (error: any) {
    console.error("Error en daily-spin:", {
      message: error?.message,
      stack: error?.stack,
      name: error?.name,
    });
    return NextResponse.json(
      { error: "Error al procesar la jugada", details: error?.message },
      { status: 500 }
    );
  }
}
