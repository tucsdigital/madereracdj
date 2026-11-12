import { NextResponse } from "next/server";
import { verifyFirebaseToken } from "@/lib/firebase-admin";
import { updateVentaEngine } from "@/lib/erp/ventas-engine";

export const runtime = "nodejs";

export async function DELETE(request, { params }) {
  try {
    const decoded = await verifyFirebaseToken(request.headers.get("authorization"));
    const body = await request.json().catch(() => ({}));
    const ventaId = String(params?.id || "").trim();
    const paymentIndex = body?.paymentIndex;

    if (!ventaId) {
      return NextResponse.json({ ok: false, error: "ventaId requerido." }, { status: 400 });
    }
    if (!Number.isInteger(paymentIndex) || paymentIndex < 0) {
      return NextResponse.json({ ok: false, error: "Índice de pago inválido." }, { status: 400 });
    }

    const result = await updateVentaEngine({
      actor: {
        uid: String(decoded?.uid || ""),
        email: String(decoded?.email || ""),
      },
      ventaId,
      deletePaymentIndex: paymentIndex,
      expectedVersion: body?.version ?? null,
      origen: "ui_ventas_delete_pago",
    });

    return NextResponse.json({ ok: true, ventaId: result.id, version: result.version });
  } catch (error) {
    const status = error?.status || 500;
    return NextResponse.json(
      { ok: false, error: error?.message || "No se pudo eliminar el pago." },
      { status },
    );
  }
}
