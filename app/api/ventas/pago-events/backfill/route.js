import { NextResponse } from "next/server";
import { getAdminDb, verifyFirebaseToken } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";

const toMs = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return NaN;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return Date.parse(`${raw}T00:00:00-03:00`);
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : NaN;
};

const calcAbonado = (ventaLike) => {
  const pagosArr = Array.isArray(ventaLike?.pagos) ? ventaLike.pagos : [];
  if (pagosArr.length > 0) return pagosArr.reduce((acc, p) => acc + (Number(p?.monto) || 0), 0);
  return Number(ventaLike?.montoAbonado || 0);
};

const findLastPagoMs = (ventaLike) => {
  const pagosArr = Array.isArray(ventaLike?.pagos) ? ventaLike.pagos : [];
  let best = NaN;
  pagosArr.forEach((p) => {
    const ms = toMs(p?.fecha);
    if (Number.isFinite(ms) && (!Number.isFinite(best) || ms > best)) best = ms;
  });
  return best;
};

export async function POST(request) {
  try {
    const authHeader = request.headers.get("authorization") || "";
    const decoded = await verifyFirebaseToken(authHeader);
    if (decoded?.email !== "admin@admin.com") {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const limit = Math.max(1, Math.min(Number(body?.limit) || 200, 2000));
    const dryRun = Boolean(body?.dryRun);

    const startMs = Number.isFinite(toMs(body?.from)) ? toMs(body?.from) : Date.now() - 1000 * 60 * 60 * 24 * 365;
    const endMs = Number.isFinite(toMs(body?.to)) ? toMs(body?.to) : Date.now() + 1000 * 60 * 60 * 24;

    const db = getAdminDb();
    const ventasSnap = await db.collection("ventas").get();
    const ventasAll = ventasSnap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));

    const candidates = ventasAll
      .filter((v) => String(v.estadoPago || "").toLowerCase() === "pagado")
      .filter((v) => {
        const lastPago = findLastPagoMs(v);
        const ms = Number.isFinite(lastPago) ? lastPago : toMs(v.fechaCreacion || v.fecha);
        if (!Number.isFinite(ms)) return false;
        return ms >= startMs && ms < endMs;
      })
      .slice(0, limit);

    let created = 0;
    let skipped = 0;
    const createdIds = [];

    for (const v of candidates) {
      const ventaId = String(v.id || "");
      if (!ventaId) continue;
      const eventsRef = db.collection("ventas").doc(ventaId).collection("pago_events");
      const existing = await eventsRef.where("becamePagado", "==", true).limit(1).get();
      if (!existing.empty) {
        skipped += 1;
        continue;
      }

      const total = Number(v.total) || 0;
      const abonado = calcAbonado(v);
      const lastPago = findLastPagoMs(v);
      const atMs = Number.isFinite(lastPago) ? lastPago : toMs(v.fechaCreacion || v.fecha);
      const atSafeMs = Number.isFinite(atMs) ? atMs : Date.now();
      const payload = {
        type: "backfill_became_pagado",
        ventaId,
        numeroPedido: String(v.numeroPedido || v.numero || ""),
        clienteId: String(v.clienteId || ""),
        clienteNombre: String(v.cliente?.nombre || ""),
        before: { estadoPago: "pendiente_o_parcial", total, abonado, saldo: Math.max(total - abonado, 0) },
        after: { estadoPago: "pagado", total, abonado, saldo: 0 },
        becamePagado: true,
        at: Timestamp.fromMillis(atSafeMs),
        byUid: String(decoded?.uid || ""),
        byEmail: String(decoded?.email || ""),
        source: "api_backfill",
      };

      if (!dryRun) {
        const docRef = await eventsRef.add(payload);
        createdIds.push(docRef.id);
      }
      created += 1;
    }

    return NextResponse.json({
      ok: true,
      dryRun,
      checked: candidates.length,
      created,
      skipped,
      createdIds,
    });
  } catch (e) {
    const status = e?.status || 500;
    return NextResponse.json({ ok: false, error: e?.message || "Error" }, { status });
  }
}
