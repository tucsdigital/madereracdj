import { NextResponse } from "next/server";
export const runtime = "nodejs";

import { verifyFirebaseToken } from "@/lib/firebase-admin";
import { updateVentaEngine } from "@/lib/erp/ventas-engine";

export async function PUT(request, { params }) {
  try {
    const authHeader = request.headers.get("authorization");
    const decoded = await verifyFirebaseToken(authHeader);
    const body = await request.json().catch(() => ({}));
    const venta = body?.venta || body;

    const actor = {
      uid: String(decoded?.uid || ""),
      email: String(decoded?.email || ""),
    };
    const origen = String(body?.origen || venta?.origen || "ui").trim() || "ui";
    const ventaId = String(params?.id || "").trim();
    if (!ventaId) return NextResponse.json({ ok: false, error: "ventaId requerido" }, { status: 400 });

    const res = await updateVentaEngine({ actor, ventaId, ventaData: venta, origen });
    return NextResponse.json({ ok: true, ventaId: res.id, flags: res.flags }, { status: 200 });
  } catch (err) {
    const status = err?.status || 500;
    return NextResponse.json({ ok: false, error: err?.message || "internal_error" }, { status });
  }
}

