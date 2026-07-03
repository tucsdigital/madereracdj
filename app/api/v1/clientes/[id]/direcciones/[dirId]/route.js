import { NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";

function withCors(resp) {
  const headers = new Headers(resp.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "PUT,OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type,X-Api-Key,X-Request-Timestamp,X-Request-Hash,X-Request-Signature");
  return new NextResponse(resp.body, { status: resp.status, headers });
}

export function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

export async function PUT(request, { params }) {
  try {
    const clienteId = String(params?.id || "").trim();
    const dirId = String(params?.dirId || "").trim();
    if (!clienteId || !dirId) {
      return withCors(NextResponse.json({ error: "clienteId_y_dirId_requeridos" }, { status: 400 }));
    }
    const contentType = request.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      return withCors(NextResponse.json({ error: "content_type_invalid" }, { status: 400 }));
    }

    const rawBody = await request.text();
    const headers = request.headers || new Headers();
    const apiKeyHeader = String(headers.get("X-Api-Key") || "").trim();
    const tsHeader = String(headers.get("X-Request-Timestamp") || "").trim();
    const hashHeader = String(headers.get("X-Request-Hash") || "").trim();
    const sigHeader = String(headers.get("X-Request-Signature") || "").trim();
    const expectedApiKey = String(process.env.EXTERNAL_API_API_KEY || "").trim();
    const sharedSecret = String(process.env.EXTERNAL_API_SHARED_SECRET || "").trim();
    if (!apiKeyHeader || !expectedApiKey || apiKeyHeader !== expectedApiKey) {
      return withCors(NextResponse.json({ error: "invalid_api_key" }, { status: 401 }));
    }
    if (hashHeader !== "HMAC-SHA256") {
      return withCors(NextResponse.json({ error: "invalid_hash_algo" }, { status: 400 }));
    }
    const ts = Number(tsHeader);
    if (!Number.isFinite(ts)) {
      return withCors(NextResponse.json({ error: "invalid_timestamp" }, { status: 400 }));
    }
    if (Math.abs(Date.now() - ts) > 300000) {
      return withCors(NextResponse.json({ error: "timestamp_out_of_window" }, { status: 401 }));
    }
    if (!sharedSecret) {
      return withCors(NextResponse.json({ error: "server_not_configured" }, { status: 500 }));
    }
    const computed = crypto.createHmac("sha256", sharedSecret).update(`${tsHeader}:${rawBody}`).digest("hex");
    const equalLen = computed.length === sigHeader.length;
    const validSig = equalLen && crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(sigHeader));
    if (!validSig) {
      return withCors(NextResponse.json({ error: "invalid_signature" }, { status: 401 }));
    }

    const body = JSON.parse(rawBody || "{}");
    const direccion = String(body?.direccion || "").trim();
    const ciudad = String(body?.ciudad || "").trim();
    const codigoPostal = String(body?.codigoPostal || "").trim();
    const metodoEntrega = String(body?.metodoEntrega || "").trim();
    const lat = Number(body?.lat);
    const lng = Number(body?.lng);
    const esFavorita = body?.esFavorita != null ? Boolean(body.esFavorita) : undefined;

    const ref = doc(db, `clientes/${clienteId}/direcciones`, dirId);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      return withCors(NextResponse.json({ error: "direccion_no_encontrada" }, { status: 404 }));
    }

    const nowIso = new Date().toISOString();
    const payload = {
      ...(direccion && { direccion }),
      ...(ciudad && { ciudad }),
      ...(codigoPostal && { codigoPostal }),
      ...(metodoEntrega && { metodoEntrega }),
      ...(Number.isFinite(lat) && { lat }),
      ...(Number.isFinite(lng) && { lng }),
      ...(esFavorita !== undefined && { esFavorita }),
      actualizadoEn: nowIso,
    };

    await setDoc(ref, payload, { merge: true });
    const updated = (await getDoc(ref)).data() || {};
    return withCors(NextResponse.json({ id: dirId, ...updated }, { status: 200 }));
  } catch (err) {
    return withCors(NextResponse.json({ error: err.message || "internal_error" }, { status: 500 }));
  }
}
