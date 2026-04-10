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

const toLimit = (value, fallback) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(Math.floor(n), 500));
};

export async function GET(request) {
  try {
    const authHeader = request.headers.get("authorization") || "";
    const decoded = await verifyFirebaseToken(auth);
    if (decoded?.email !== "admin@admin.com") {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(request.url);
    const limit = toLimit(url.searchParams.get("limit"), 100);
    const fromMs = toMs(url.searchParams.get("from"));
    const toMsVal = toMs(url.searchParams.get("to"));

    const db = getAdminDb();
    let q = db.collectionGroup("pago_events").where("becamePagado", "==", true);
    if (Number.isFinite(fromMs)) q = q.where("at", ">=", Timestamp.fromMillis(fromMs));
    if (Number.isFinite(toMsVal)) q = q.where("at", "<", Timestamp.fromMillis(toMsVal));
    q = q.orderBy("at", "desc").limit(limit);

    const snap = await q.get();
    return NextResponse.json({
      ok: true,
      items: snap.docs.map((d) => {
        const data = d.data() || {};
        const at = data?.at;
        const atIso = at?.toDate ? at.toDate().toISOString() : "";
        return { id: d.id, ...data, atIso };
      }),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Error" },
      { status: e?.status || 500 }
    );
  }
}
