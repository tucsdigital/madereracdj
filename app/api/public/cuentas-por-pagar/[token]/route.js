import { NextResponse } from "next/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { getPublicStatementByToken } from "@/lib/erp/cuentas-pagar-compartir-server";

export async function GET(_request, { params }) {
  try {
    const statement = await getPublicStatementByToken(params?.token);
    if (!statement) {
      return NextResponse.json({ ok: false, error: "Este enlace no está disponible o venció." }, {
        status: 404,
        headers: { "Cache-Control": "no-store, private" },
      });
    }
    return NextResponse.json({ ok: true, statement }, {
      headers: {
        "Cache-Control": "no-store, private",
        "X-Robots-Tag": "noindex, nofollow, noarchive",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch (error) {
    console.error("Error al cargar el estado de cuenta público:", error);
    return NextResponse.json({ ok: false, error: "No se pudo cargar el estado de cuenta." }, {
      status: 500,
      headers: { "Cache-Control": "no-store, private" },
    });
  }
}
