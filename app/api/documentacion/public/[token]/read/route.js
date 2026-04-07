import { NextResponse } from "next/server";
export const runtime = "nodejs";
import { addDocumentoEvent, findDocumentoByPublicTokenHash, getRequestIp, nowIso, sha256 } from "@/lib/documentacion-server";
import { DOCUMENTO_ESTADOS, nextEstadoAfterRead } from "@/lib/documentacion-states";

const isExpired = (expiresAt) => {
  if (!expiresAt) return false;
  const ms = Date.parse(String(expiresAt));
  if (!Number.isFinite(ms)) return false;
  return ms < Date.now();
};

export async function POST(request, { params }) {
  try {
    const token = String(params?.token || "");
    if (!token) {
      return NextResponse.json({ ok: false, error: "Token inválido" }, { status: 400 });
    }
    const tokenHash = sha256(token);
    const body = await request.json().catch(() => ({}));
    const confirmado = Boolean(body?.confirmado);
    if (!confirmado) {
      return NextResponse.json({ ok: false, error: "Confirmación requerida" }, { status: 400 });
    }

    const docSnap = await findDocumentoByPublicTokenHash(tokenHash);
    if (!docSnap) return NextResponse.json({ ok: false, error: "No encontrado" }, { status: 404 });
    const data = docSnap.data() || {};

    if (data?.estado === DOCUMENTO_ESTADOS.ANULADO) {
      return NextResponse.json({ ok: false, error: "Anulado" }, { status: 410 });
    }
    if (data?.estado === DOCUMENTO_ESTADOS.VENCIDO || isExpired(data?.public?.expiresAt)) {
      return NextResponse.json({ ok: false, error: "Vencido" }, { status: 410 });
    }
    if (data?.estado === DOCUMENTO_ESTADOS.FIRMADO) {
      return NextResponse.json({ ok: true, estado: DOCUMENTO_ESTADOS.FIRMADO });
    }

    const now = nowIso();
    const ip = getRequestIp(request);
    const userAgent = request.headers.get("user-agent") || "";
    const nextEstado = nextEstadoAfterRead(data);

    await docSnap.ref.set(
      {
        estado: nextEstado,
        public: {
          ...(data.public || {}),
          readConfirmedAt: data?.public?.readConfirmedAt || now,
        },
        updatedAt: now,
      },
      { merge: true }
    );

    await addDocumentoEvent({
      documentoId: docSnap.id,
      type: "public_read_confirmed",
      actorType: "public",
      actorId: "",
      actorEmail: "",
      ip,
      userAgent,
      details: {},
    });

    return NextResponse.json({ ok: true, estado: nextEstado });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e?.message || "Error" }, { status: 500 });
  }
}
