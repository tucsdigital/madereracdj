import { NextResponse } from "next/server";
export const runtime = "nodejs";

import { nowIso, sha256 } from "@/lib/documentacion-server";
import { buildPublicLiquidacionView, findLiquidacionAsistenciaByPublicTokenHash } from "@/lib/asistencia-liquidaciones-server";

export async function GET(_request, { params }) {
  try {
    const token = String(params?.token || "").trim();
    if (!token) {
      return NextResponse.json({ ok: false, error: "Token inválido" }, { status: 400 });
    }

    const tokenHash = sha256(token);
    const snap = await findLiquidacionAsistenciaByPublicTokenHash(tokenHash);
    if (!snap) {
      return NextResponse.json({ ok: false, error: "No encontrado" }, { status: 404 });
    }

    const data = snap.data() || {};
    const openCount = Number(data?.public?.openCount || 0) + 1;
    const now = nowIso();

    await snap.ref.set(
      {
        public: {
          ...(data.public || {}),
          lastOpenedAt: now,
          openCount,
        },
      },
      { merge: true }
    );

    return NextResponse.json({
      ok: true,
      liquidacion: buildPublicLiquidacionView(
        {
          ...data,
          public: {
            ...(data.public || {}),
            lastOpenedAt: now,
            openCount,
          },
        },
        snap.id
      ),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Error" },
      { status: 500 }
    );
  }
}
