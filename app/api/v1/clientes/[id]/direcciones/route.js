import { NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/lib/firebase";
import { collection, addDoc, getDocs, query, where } from "firebase/firestore";

function withCors(resp) {
  const headers = new Headers(resp.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type,X-Api-Key,X-Request-Timestamp,X-Request-Hash,X-Request-Signature");
  return new NextResponse(resp.body, { status: resp.status, headers });
}

export function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

function validateHmac(headers, rawBody) {
  const apiKeyHeader = String(headers.get("X-Api-Key") || "").trim();
  const tsHeader = String(headers.get("X-Request-Timestamp") || "").trim();
  const hashHeader = String(headers.get("X-Request-Hash") || "").trim();
  const sigHeader = String(headers.get("X-Request-Signature") || "").trim();
  const expectedApiKey = String(process.env.EXTERNAL_API_API_KEY || "").trim();
  const sharedSecret = String(process.env.EXTERNAL_API_SHARED_SECRET || "").trim();
  if (!apiKeyHeader || !expectedApiKey || apiKeyHeader !== expectedApiKey) {
    return { ok: false, status: 401, error: "invalid_api_key" };
  }
  if (hashHeader !== "HMAC-SHA256") {
    return { ok: false, status: 400, error: "invalid_hash_algo" };
  }
  const ts = Number(tsHeader);
  if (!Number.isFinite(ts)) {
    return { ok: false, status: 400, error: "invalid_timestamp" };
  }
  if (Math.abs(Date.now() - ts) > 300000) {
    return { ok: false, status: 401, error: "timestamp_out_of_window" };
  }
  if (!sharedSecret) {
    return { ok: false, status: 500, error: "server_not_configured" };
  }
  const computed = crypto.createHmac("sha256", sharedSecret).update(`${tsHeader}:${rawBody}`).digest("hex");
  const equalLen = computed.length === sigHeader.length;
  const validSig = equalLen && crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(sigHeader));
  if (!validSig) {
    return { ok: false, status: 401, error: "invalid_signature" };
  }
  return { ok: true };
}

export async function GET(request, { params }) {
  try {
    const clienteId = String(params?.id || "").trim();
    if (!clienteId) return withCors(NextResponse.json({ error: "clienteId_requerido" }, { status: 400 }));
    const headers = request.headers || new Headers();
    const h = validateHmac(headers, "");
    if (!h.ok) return withCors(NextResponse.json({ error: h.error }, { status: h.status }));

    const col = collection(db, `clientes/${clienteId}/direcciones`);
    const snap = await getDocs(query(col));
    const dirs = [];
    snap.forEach((d) => dirs.push({ id: d.id, ...d.data() }));
    return withCors(NextResponse.json(dirs, { status: 200 }));
  } catch (err) {
    return withCors(NextResponse.json({ error: err.message || "internal_error" }, { status: 500 }));
  }
}

export async function POST(request, { params }) {
  try {
    const clienteId = String(params?.id || "").trim();
    if (!clienteId) return withCors(NextResponse.json({ error: "clienteId_requerido" }, { status: 400 }));
    const rawBody = await request.text();
    const headers = request.headers || new Headers();
    const h = validateHmac(headers, rawBody);
    if (!h.ok) return withCors(NextResponse.json({ error: h.error }, { status: h.status }));
    const contentType = headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      return withCors(NextResponse.json({ error: "content_type_invalid" }, { status: 400 }));
    }

    const body = JSON.parse(rawBody || "{}");
    const direccion = String(body?.direccion || "").trim();
    const ciudad = String(body?.ciudad || "").trim();
    const codigoPostal = String(body?.codigoPostal || "").trim();
    const metodoEntrega = String(body?.metodoEntrega || "").trim();
    const lat = Number(body?.lat);
    const lng = Number(body?.lng);
    const esFavorita = Boolean(body?.esFavorita);
    const origen = String(body?.origen || "ecommerce").trim();
    if (!direccion) return withCors(NextResponse.json({ error: "direccion_requerida" }, { status: 400 }));

    const nowIso = new Date().toISOString();
    const payload = {
      direccion,
      ciudad,
      codigoPostal,
      metodoEntrega,
      lat: Number.isFinite(lat) ? lat : null,
      lng: Number.isFinite(lng) ? lng : null,
      esFavorita,
      origen,
      creadoEn: nowIso,
      actualizadoEn: nowIso,
    };
    const col = collection(db, `clientes/${clienteId}/direcciones`);
    const ref = await addDoc(col, payload);
    return withCors(NextResponse.json({ id: ref.id, ...payload }, { status: 201 }));
  } catch (err) {
    return withCors(NextResponse.json({ error: err.message || "internal_error" }, { status: 500 }));
  }
}
