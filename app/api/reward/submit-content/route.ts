/**
 * POST /api/reward/submit-content
 * Permite a un usuario enviar contenido para su premio de spotlight/editorSlot
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentDateKey } from "@/lib/daily/dateKey";
import { rewardClaimRepo } from "@/lib/repo";
import { validateBlocks, Block, extractYoutubeId } from "@/lib/editor/blocks";
import { getCurrentUserServer } from "@/lib/auth/currentUser";

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUserServer(request);
    if (!user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = await request.json();
    const { dateKey, blocks } = body;

    if (!dateKey || !blocks) {
      return NextResponse.json(
        { error: "dateKey y blocks son requeridos" },
        { status: 400 }
      );
    }

    // Validar bloques
    if (!validateBlocks(blocks)) {
      return NextResponse.json(
        { error: "Bloques inválidos" },
        { status: 400 }
      );
    }

    // Procesar bloques (extraer YouTube IDs, etc.)
    const processedBlocks: Block[] = blocks.map((block: any) => {
      if (block.type === "youtube" && block.videoId) {
        // Intentar extraer ID si viene como URL
        const extractedId = extractYoutubeId(block.videoId);
        if (extractedId) {
          return { ...block, videoId: extractedId };
        }
      }
      return block;
    });

    // Buscar reward claim del usuario para este día
    const claim = await rewardClaimRepo.findByUserAndDate(user.id, dateKey);
    if (!claim) {
      return NextResponse.json(
        { error: "No tienes un premio activo para este día" },
        { status: 404 }
      );
    }

    // Verificar que el premio permita contenido
    if (claim.rewardType !== "spotlight" && claim.rewardType !== "editorSlot") {
      return NextResponse.json(
        { error: "Este premio no permite contenido" },
        { status: 400 }
      );
    }

    // Verificar que no esté usado
    if (claim.status === "used") {
      return NextResponse.json(
        { error: "Este premio ya fue usado" },
        { status: 400 }
      );
    }

    // Verificar si necesita aprobación (tiene links o videos)
    const needsApproval = processedBlocks.some(
      (block) => block.type === "link" || block.type === "youtube"
    );

    // Actualizar claim
    await rewardClaimRepo.update(claim.id!, {
      contentBlocks: processedBlocks,
      status: needsApproval ? "pending" : "claimed",
      approvalStatus: needsApproval ? "pending" : "approved",
    });

    return NextResponse.json({
      success: true,
      needsApproval,
      message: needsApproval
        ? "Tu contenido fue enviado y está pendiente de aprobación"
        : "Tu contenido fue publicado",
    });
  } catch (error) {
    console.error("Error en submit-content:", error);
    return NextResponse.json(
      { error: "Error al enviar contenido" },
      { status: 500 }
    );
  }
}
