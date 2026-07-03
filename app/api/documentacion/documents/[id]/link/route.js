import { NextResponse } from "next/server";
export const runtime = "nodejs";
import { getAdminDb, verifyFirebaseToken } from "@/lib/firebase-admin";
import { addDocumentoEvent, getRequestIp, newToken, nowIso, sha256 } from "@/lib/documentacion-server";
import { canGenerarLink } from "@/lib/documentacion-states";

export async function POST(request, { params }) {
  try {
    const authHeader = request.headers.get("authorization") || "";
    const user = await verifyFirebaseToken(authHeader);
    const id = params?.id;
    const body = await request.json().catch(() => ({}));

    const ttlDays = Math.max(1, Math.min(60, Number(body?.ttlDays || 14)));
    const rotate = Boolean(body?.rotate ?? false);

    const db = getAdminDb();
    const ref = db.collection("documentos").doc(String(id));
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ ok: false, error: "No encontrado" }, { status: 404 });
    }
    const current = snap.data() || {};
    if (!canGenerarLink(current)) {
      return NextResponse.json({ ok: false, error: "No se puede generar link" }, { status: 409 });
    }

    const now = nowIso();
    const nextExpiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000).toISOString();
    const currentExpiresAtMs = Date.parse(String(current?.public?.expiresAt || ""));
    const nextExpiresAtMs = Date.parse(String(nextExpiresAt || ""));
    const expiresAt =
      Number.isFinite(currentExpiresAtMs) && Number.isFinite(nextExpiresAtMs) && currentExpiresAtMs > nextExpiresAtMs
        ? String(current?.public?.expiresAt || nextExpiresAt)
        : nextExpiresAt;

    const shouldCreateNew = rotate || !current?.public?.tokenHash;
    const tokenPlain = shouldCreateNew ? newToken() : null;
    const tokenHash = shouldCreateNew ? sha256(tokenPlain) : String(current?.public?.tokenHash || "");
    const prevHashes = Array.isArray(current?.public?.tokenHashes) ? current.public.tokenHashes : [];
    const tokenHashes = Array.from(new Set([...(prevHashes || []), tokenHash].filter(Boolean)));

    await ref.set(
      {
        public: {
          ...(current.public || {}),
          tokenHash,
          tokenHashes,
          tokenCreatedAt: current?.public?.tokenCreatedAt || now,
          tokenRotatedAt: shouldCreateNew && current?.public?.tokenHash ? now : (current?.public?.tokenRotatedAt || null),
          expiresAt,
          lastLinkGeneratedAt: now,
        },
        updatedAt: now,
        updatedByUid: String(user.uid || ""),
        updatedByEmail: String(user.email || ""),
      },
      { merge: true }
    );

    await addDocumentoEvent({
      documentoId: ref.id,
      type: shouldCreateNew ? "public_link_created" : "public_link_reused",
      actorType: "internal",
      actorId: user.uid,
      actorEmail: user.email,
      ip: getRequestIp(request),
      userAgent: request.headers.get("user-agent") || "",
      details: { ttlDays, expiresAt },
    });

    return NextResponse.json({ ok: true, token: tokenPlain, expiresAt });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Error" },
      { status: e?.status || 500 }
    );
  }
}
