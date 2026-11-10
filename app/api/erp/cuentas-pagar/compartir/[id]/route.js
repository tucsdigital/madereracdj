import { NextResponse } from "next/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { verifyFirebaseToken } from "@/lib/firebase-admin";
import { getStatementShareCollection } from "@/lib/erp/cuentas-pagar-compartir-server";

export async function DELETE(request, { params }) {
  try {
    const actor = await verifyFirebaseToken(request.headers.get("authorization"));
    const id = String(params?.id || "").trim();
    if (!/^[a-f0-9]{64}$/.test(id)) {
      return NextResponse.json({ ok: false, error: "ID de enlace inválido" }, { status: 400 });
    }

    const ref = getStatementShareCollection().doc(id);
    const snapshot = await ref.get();
    if (!snapshot.exists) return NextResponse.json({ ok: false, error: "Enlace no encontrado" }, { status: 404 });
    const data = snapshot.data() || {};
    if (!data.revokedAt) {
      await ref.update({
        revokedAt: new Date().toISOString(),
        revokedByUid: String(actor?.uid || ""),
        revokedByEmail: String(actor?.email || ""),
      });
    }
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error?.message || "No se pudo revocar el enlace" },
      { status: error?.status || 500 }
    );
  }
}
