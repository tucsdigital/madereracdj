import { NextResponse } from "next/server";
export const runtime = "nodejs";

import { getAdminDb, verifyFirebaseToken } from "@/lib/firebase-admin";
import { newToken, nowIso, sha256 } from "@/lib/documentacion-server";

export async function POST(request, { params }) {
  try {
    const authHeader = request.headers.get("authorization") || "";
    await verifyFirebaseToken(authHeader);

    const id = String(params?.id || "").trim();
    if (!id) {
      return NextResponse.json({ ok: false, error: "ID inválido" }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const rotate = Boolean(body?.rotate ?? false);
    const db = getAdminDb();
    const ref = db.collection("liquidacionesAsistencia").doc(id);
    const snap = await ref.get();

    if (!snap.exists) {
      return NextResponse.json({ ok: false, error: "No encontrado" }, { status: 404 });
    }

    const current = snap.data() || {};
    const currentTokenPlain = String(current?.public?.token || "").trim();
    const shouldCreateNew = rotate || !current?.public?.tokenHash || !currentTokenPlain;
    const tokenPlain = shouldCreateNew ? newToken() : currentTokenPlain;
    const tokenHash = shouldCreateNew ? sha256(tokenPlain) : String(current?.public?.tokenHash || "");
    const prevHashes = Array.isArray(current?.public?.tokenHashes) ? current.public.tokenHashes : [];
    const tokenHashes = Array.from(new Set([...(prevHashes || []), tokenHash].filter(Boolean)));
    const now = nowIso();

    await ref.set(
      {
        public: {
          ...(current.public || {}),
          token: tokenPlain,
          tokenHash,
          tokenHashes,
          tokenCreatedAt: current?.public?.tokenCreatedAt || now,
          tokenRotatedAt: shouldCreateNew && current?.public?.tokenHash ? now : (current?.public?.tokenRotatedAt || null),
          lastLinkGeneratedAt: now,
        },
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true, token: tokenPlain, reused: !shouldCreateNew });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Error" },
      { status: e?.status || 500 }
    );
  }
}
