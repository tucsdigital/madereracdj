import { NextResponse } from "next/server";
export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

import { getPublicStatementByToken } from "@/lib/erp/cuentas-pagar-compartir-server";
import { construirHtmlEstadoCuentaPdf } from "@/lib/erp/cuentas-pagar-compartir";
import { generatePdfFromHtml } from "@/src/lib/pdf/generate-documento-firmado";

const fileSlug = (value) => String(value || "proveedor")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-|-$/g, "")
  .slice(0, 60) || "proveedor";

export async function GET(_request, { params }) {
  try {
    const statement = await getPublicStatementByToken(params?.token);
    if (!statement) {
      return NextResponse.json({ ok: false, error: "Este enlace no está disponible o venció." }, {
        status: 404,
        headers: { "Cache-Control": "no-store, private" },
      });
    }

    const buffer = await generatePdfFromHtml(construirHtmlEstadoCuentaPdf(statement));
    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(buffer.byteLength),
        "Content-Disposition": `attachment; filename="estado-de-cuenta-${fileSlug(statement.provider.name)}.pdf"`,
        "Cache-Control": "no-store, private",
        "X-Robots-Tag": "noindex, nofollow, noarchive",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch (error) {
    console.error("Error al generar el PDF de estado de cuenta:", error);
    return NextResponse.json({ ok: false, error: "No se pudo generar el PDF." }, { status: 500 });
  }
}
