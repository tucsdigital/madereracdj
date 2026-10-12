import { NextResponse } from "next/server";
export const runtime = "nodejs";

import { verifyFirebaseToken } from "@/lib/firebase-admin";
import { updateComboEngine } from "@/lib/erp/combos-engine";

export async function PUT(request, { params }) {
  try {
    const decoded = await verifyFirebaseToken(request.headers.get("authorization"));
    const body = await request.json().catch(() => ({}));
    const updates = body?.combo || body;
    const comboId = String(params?.id || "").trim();
    if (!comboId) return NextResponse.json({ ok: false, error: "ID de combo requerido." }, { status: 400 });
    const result = await updateComboEngine({
      actor: { uid: String(decoded?.uid || ""), email: String(decoded?.email || "") },
      comboId,
      updates,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error?.message || "No se pudo actualizar el combo" },
      { status: error?.status || (error?.code ? 500 : 400) }
    );
  }
}
