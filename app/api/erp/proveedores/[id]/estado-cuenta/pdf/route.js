import { NextResponse } from "next/server";
export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

import { verifyFirebaseToken } from "@/lib/firebase-admin";
import { getStatementForProvider } from "@/lib/erp/cuentas-pagar-compartir-server";
import { construirHtmlEstadoCuentaPdf } from "@/lib/erp/cuentas-pagar-compartir";
import { generatePdfFromHtml } from "@/src/lib/pdf/generate-documento-firmado";

const fileSlug = (value) => String(value || "proveedor")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-|-$/g, "")
  .slice(0, 60) || "proveedor";

export async function GET(request, { params }) {
  try {
    await verifyFirebaseToken(request.headers.get("authorization"));
    const providerId = String(params?.id || "").trim();
    if (!providerId) return NextResponse.json({ ok: false, error: "Proveedor inválido" }, { status: 400 });

    const statement = await getStatementForProvider(providerId);
    if (!statement) return NextResponse.json({ ok: false, error: "Proveedor no encontrado" }, { status: 404 });

    const buffer = await generatePdfFromHtml(construirHtmlEstadoCuentaPdf(statement));
    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(buffer.byteLength),
        "Content-Disposition": `attachment; filename="estado-de-cuenta-${fileSlug(statement.provider.name)}.pdf"`,
        "Cache-Control": "no-store, private",
        "X-Robots-Tag": "noindex, nofollow, noarchive",
      },
    });
  } catch (error) {
    console.error("Error al generar PDF de proveedor:", error);
    return NextResponse.json({ ok: false, error: error?.message || "No se pudo generar el PDF." }, { status: error?.status || 500 });
  }
}
