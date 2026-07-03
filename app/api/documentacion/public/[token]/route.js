import { NextResponse } from "next/server";
export const runtime = "nodejs";
import { addDocumentoEvent, findDocumentoByPublicTokenHash, getRequestIp, nowIso, sha256 } from "@/lib/documentacion-server";
import { DOCUMENTO_ESTADOS, nextEstadoAfterOpen } from "@/lib/documentacion-states";

const isExpired = (expiresAt) => {
  if (!expiresAt) return false;
  const ms = Date.parse(String(expiresAt));
  if (!Number.isFinite(ms)) return false;
  return ms < Date.now();
};

export async function GET(request, { params }) {
  try {
    const token = String(params?.token || "");
    if (!token) {
      return NextResponse.json({ ok: false, error: "Token inválido" }, { status: 400 });
    }
    const tokenHash = sha256(token);

    const docSnap = await findDocumentoByPublicTokenHash(tokenHash);
    if (!docSnap) {
      return NextResponse.json({ ok: false, error: "No encontrado" }, { status: 404 });
    }

    const data = docSnap.data() || {};
    if (data?.estado === DOCUMENTO_ESTADOS.ANULADO) {
      return NextResponse.json({ ok: false, error: "Anulado" }, { status: 410 });
    }
    if (data?.estado === DOCUMENTO_ESTADOS.VENCIDO || isExpired(data?.public?.expiresAt)) {
      if (data?.estado !== DOCUMENTO_ESTADOS.VENCIDO) {
        await docSnap.ref.set(
          { estado: DOCUMENTO_ESTADOS.VENCIDO, updatedAt: nowIso() },
          { merge: true }
        );
      }
      return NextResponse.json({ ok: false, error: "Vencido" }, { status: 410 });
    }

    const now = nowIso();
    const ip = getRequestIp(request);
    const userAgent = request.headers.get("user-agent") || "";
    const nextEstado = nextEstadoAfterOpen(data);

    await docSnap.ref.set(
      {
        estado: nextEstado,
        public: {
          ...(data.public || {}),
          lastOpenedAt: now,
          openCount: Number(data?.public?.openCount || 0) + 1,
          lastIp: ip,
          lastUserAgent: userAgent,
        },
        updatedAt: now,
      },
      { merge: true }
    );

    await addDocumentoEvent({
      documentoId: docSnap.id,
      type: "public_opened",
      actorType: "public",
      actorId: "",
      actorEmail: "",
      ip,
      userAgent,
      details: {},
    });

    const view = {
      id: docSnap.id,
      numero: data.numero || "",
      titulo: data.titulo || "",
      estado: nextEstado,
      cliente: data.cliente || null,
      obra: data.obra || null,
      ubicacion: data.ubicacion || null,
      contentHtml: data.contentHtml || "",
      legalHtml: data.legalHtml || "",
      public: {
        expiresAt: data?.public?.expiresAt || null,
        readConfirmedAt: data?.public?.readConfirmedAt || null,
        signedAt: data?.public?.signedAt || null,
        rejectedAt: data?.public?.rejectedAt || null,
      },
      signed: {
        pdfReady: Boolean(data?.signed?.pdfUrl),
      },
    };

    return NextResponse.json({ ok: true, document: view });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Error" },
      { status: 500 }
    );
  }
}
