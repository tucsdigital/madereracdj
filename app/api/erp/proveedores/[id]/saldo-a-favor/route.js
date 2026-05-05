import { NextResponse } from "next/server";
export const runtime = "nodejs";

import { verifyFirebaseToken } from "@/lib/firebase-admin";
import { quitarSaldoAFavorProveedorEngine } from "@/lib/erp/cuentas-pagar-engine";

export async function POST(request, { params }) {
  try {
    const authHeader = request.headers.get("authorization");
    const decoded = await verifyFirebaseToken(authHeader);
    const body = await request.json().catch(() => ({}));

    const proveedorId = String(params?.id || "").trim();
    if (!proveedorId) return NextResponse.json({ ok: false, error: "proveedorId requerido" }, { status: 400 });

    const actor = { uid: String(decoded?.uid || ""), email: String(decoded?.email || "") };
    const origen = String(body?.origen || "ui_gastos").trim() || "ui_gastos";

    const res = await quitarSaldoAFavorProveedorEngine({
      actor,
      proveedorId,
      monto: body?.monto,
      fecha: body?.fecha,
      metodo: body?.metodo,
      notas: body?.notas,
      origen,
    });

    return NextResponse.json(res, { status: 200 });
  } catch (err) {
    const status = err?.status || 500;
    return NextResponse.json({ ok: false, error: err?.message || "internal_error" }, { status });
  }
}

