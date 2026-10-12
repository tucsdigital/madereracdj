import { NextResponse } from "next/server";
export const runtime = "nodejs";

import { verifyFirebaseToken } from "@/lib/firebase-admin";
import { createComboEngine } from "@/lib/erp/combos-engine";

export async function POST(request) {
  try {
    const decoded = await verifyFirebaseToken(request.headers.get("authorization"));
    const body = await request.json().catch(() => ({}));
    const combo = body?.combo || body;
    const result = await createComboEngine({
      actor: { uid: String(decoded?.uid || ""), email: String(decoded?.email || "") },
      comboData: combo,
    });
    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error?.message || "No se pudo crear el combo" },
      { status: error?.status || (error?.code ? 500 : 400) }
    );
  }
}
