import { NextResponse } from "next/server";
export const runtime = "nodejs";
import { findDocumentoByPublicTokenHash, sha256 } from "@/lib/documentacion-server";
import { DOCUMENTO_ESTADOS } from "@/lib/documentacion-states";

const isExpired = (expiresAt) => {
  if (!expiresAt) return false;
  const ms = Date.parse(String(expiresAt));
  if (!Number.isFinite(ms)) return false;
  return ms < Date.now();
};

export async function GET(request, { params }) {
  try {
    const token = String(params?.token || "");
    if (!token) return NextResponse.json({ ok: false, error: "Token inválido" }, { status: 400 });
    const tokenHash = sha256(token);

    const docSnap = await findDocumentoByPublicTokenHash(tokenHash);
    if (!docSnap) return NextResponse.json({ ok: false, error: "No encontrado" }, { status: 404 });
    const data = docSnap.data() || {};
    if (data?.estado === DOCUMENTO_ESTADOS.ANULADO) {
      return NextResponse.json({ ok: false, error: "Anulado" }, { status: 410 });
    }
    if (data?.estado === DOCUMENTO_ESTADOS.VENCIDO || isExpired(data?.public?.expiresAt)) {
      return NextResponse.json({ ok: false, error: "Vencido" }, { status: 410 });
    }
    const pdfUrl = String(data?.signed?.pdfUrl || "");
    if (!pdfUrl) return NextResponse.json({ ok: false, error: "PDF no disponible" }, { status: 404 });

    return NextResponse.redirect(pdfUrl);
  } catch (e) {
    return NextResponse.json({ ok: false, error: e?.message || "Error" }, { status: 500 });
  }
}
