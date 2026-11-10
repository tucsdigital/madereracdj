import { NextResponse } from "next/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { getAdminDb, verifyFirebaseToken } from "@/lib/firebase-admin";
import { newToken, sha256 } from "@/lib/documentacion-server";
import { getStatementShareCollection } from "@/lib/erp/cuentas-pagar-compartir-server";

const isDateKey = (value) => {
  const text = String(value || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const date = new Date(`${text}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text;
};

const safeLinkSummary = (snapshot) => {
  const data = snapshot.data() || {};
  return {
    id: snapshot.id,
    filters: data.filters || { scope: "all" },
    createdAt: data.createdAt || null,
    expiresAt: data.expiresAt || null,
    revokedAt: data.revokedAt || null,
  };
};

export async function GET(request) {
  try {
    await verifyFirebaseToken(request.headers.get("authorization"));
    const providerId = String(new URL(request.url).searchParams.get("proveedorId") || "").trim();
    if (!providerId) return NextResponse.json({ ok: false, error: "proveedorId requerido" }, { status: 400 });

    const snapshot = await getStatementShareCollection()
      .where("providerId", "==", providerId)
      .limit(100)
      .get();
    const links = snapshot.docs
      .map(safeLinkSummary)
      .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
    return NextResponse.json({ ok: true, links }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Error al cargar los enlaces" },
      { status: error?.status || 500 }
    );
  }
}

export async function POST(request) {
  try {
    const actor = await verifyFirebaseToken(request.headers.get("authorization"));
    const body = await request.json().catch(() => ({}));
    const providerId = String(body?.proveedorId || "").trim();
    const scope = body?.filters?.scope === "range" ? "range" : "all";
    const expiresDays = Number(body?.expiresDays || 30);

    if (!providerId) return NextResponse.json({ ok: false, error: "proveedorId requerido" }, { status: 400 });
    if (![7, 30, 90].includes(expiresDays)) {
      return NextResponse.json({ ok: false, error: "La vigencia debe ser de 7, 30 o 90 días" }, { status: 400 });
    }

    const filters = scope === "range"
      ? {
          scope,
          from: String(body?.filters?.from || ""),
          to: String(body?.filters?.to || ""),
        }
      : { scope: "all" };
    if (scope === "range" && (!isDateKey(filters.from) || !isDateKey(filters.to) || filters.from > filters.to)) {
      return NextResponse.json({ ok: false, error: "El rango de fechas es inválido" }, { status: 400 });
    }

    const shares = getStatementShareCollection();
    const db = getAdminDb();
    const [providerSnapshot, existingShares] = await Promise.all([
      db.collection("proveedores").doc(providerId).get(),
      shares.where("providerId", "==", providerId).limit(100).get(),
    ]);
    if (!providerSnapshot.exists) return NextResponse.json({ ok: false, error: "Proveedor no encontrado" }, { status: 404 });

    const now = Date.now();
    const activeLinks = existingShares.docs.filter((item) => {
      const data = item.data() || {};
      return !data.revokedAt && (!data.expiresAt || new Date(data.expiresAt).getTime() > now);
    });
    if (activeLinks.length >= 20) {
      return NextResponse.json({ ok: false, error: "Este proveedor ya tiene 20 enlaces activos. Revocá uno antes de crear otro." }, { status: 409 });
    }

    const token = newToken();
    const tokenHash = sha256(token);
    const createdAt = new Date().toISOString();
    const expiresAt = new Date(now + expiresDays * 24 * 60 * 60 * 1000).toISOString();
    await shares.doc(tokenHash).create({
      tokenHash,
      providerId,
      filters,
      createdAt,
      expiresAt,
      revokedAt: null,
      createdByUid: String(actor?.uid || ""),
      createdByEmail: String(actor?.email || ""),
    });

    const origin = new URL(request.url).origin;
    const lang = /^[a-zA-Z-]{2,10}$/.test(String(body?.lang || "")) ? String(body.lang) : "es";
    return NextResponse.json({
      ok: true,
      link: {
        id: tokenHash,
        url: `${origin}/${lang}/cuenta-proveedor/${token}`,
        filters,
        createdAt,
        expiresAt,
      },
    }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error?.message || "No se pudo crear el enlace" },
      { status: error?.status || 500 }
    );
  }
}
