import { NextResponse } from "next/server";
export const runtime = "nodejs";

import { verifyFirebaseToken } from "@/lib/firebase-admin";
import { applyStockMovimientoEngine } from "@/lib/erp/stock-engine";

export async function POST(request) {
  try {
    const authHeader = request.headers.get("authorization");
    const decoded = await verifyFirebaseToken(authHeader);
    const body = await request.json().catch(() => ({}));

    const actor = {
      uid: String(decoded?.uid || ""),
      email: String(decoded?.email || ""),
    };

    const res = await applyStockMovimientoEngine({
      actor,
      productoId: body?.productoId,
      tipo: body?.tipo,
      cantidad: body?.cantidad,
      modoAjuste: body?.modoAjuste,
      stockFinalDeseado: body?.stockFinalDeseado,
      motivo: body?.motivo,
      observaciones: body?.observaciones,
      referencia: body?.referencia,
      referenciaId: body?.referenciaId,
      origen: String(body?.origen || "ui_stock_compras").trim() || "ui_stock_compras",
    });

    return NextResponse.json(res, { status: 200 });
  } catch (err) {
    const status = err?.status || 500;
    return NextResponse.json({ ok: false, error: err?.message || "internal_error" }, { status });
  }
}

