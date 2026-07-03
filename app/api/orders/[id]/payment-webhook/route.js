import { NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/lib/firebase";
import { collection, query, where, limit, getDocs, addDoc, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";

function withCors(resp) {
  const headers = new Headers(resp.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "POST,OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type,Authorization,X-Api-Key,X-Request-Timestamp,X-Request-Hash,X-Request-Signature");
  return new NextResponse(resp.body, { status: resp.status, headers });
}

export function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

export async function POST(request, { params }) {
  try {
    const id = String(params?.id || "").trim();
    if (!id) return withCors(NextResponse.json({ error: "orderId_requerido" }, { status: 400 }));
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
    const paymentId = String(body?.paymentId || "").trim();
    const paymentStatus = String(body?.paymentStatus || "").trim();
    const status = String(body?.status || "").trim();
    const metadata = body?.metadata || {};
    const orderIdMeta = String(metadata?.orderId || "").trim();
    const customerEmailMeta = String(metadata?.customerEmail || "").trim();
    if (!paymentId) return withCors(NextResponse.json({ error: "paymentId_requerido" }, { status: 400 }));
    const nowIso = new Date().toISOString();

    const paymentsQ = query(collection(db, "paymentsWebhooks"), where("paymentId", "==", paymentId), limit(1));
    const paymentsSnap = await getDocs(paymentsQ);
    if (!paymentsSnap.empty) {
      return withCors(NextResponse.json({ success: true, idempotente: true }, { status: 200 }));
    }

    await addDoc(collection(db, "paymentsWebhooks"), {
      paymentId,
      paymentStatus,
      status,
      metadata: { orderId: orderIdMeta || id, customerEmail: customerEmailMeta || null },
      receivedAt: nowIso,
      orderId: id,
      apiKey: apiKeyHeader,
    });

    const ordersQ = query(collection(db, "orders"), where("orderId", "==", id), limit(1));
    const ordersSnap = await getDocs(ordersQ);
    if (ordersSnap.empty) {
      return withCors(NextResponse.json({ success: true, warning: "orden_no_encontrada", orderId: id }, { status: 200 }));
    }
    const orderDoc = ordersSnap.docs[0];
    const orderRef = doc(db, "orders", orderDoc.id);
    const updates = {
      paymentId,
      paymentStatus,
      status,
      updatedAt: nowIso,
    };
    await updateDoc(orderRef, updates);

    if (paymentStatus === "approved" || paymentStatus === "rejected") {
      const reservasQ = query(collection(db, "reservasStock"), where("idempotencyKey", ">=", `${id}:`), where("idempotencyKey", "<", `${id};`));
      const reservasSnap = await getDocs(reservasQ);
      const updatesBatch = [];
      reservasSnap.forEach((d) => {
        const r = d.data();
        if (String(r.estado || "") === "activa") {
          updatesBatch.push(
            updateDoc(
              doc(db, "reservasStock", d.id),
              { estado: paymentStatus === "approved" ? "consumida" : "liberada", actualizadoEn: nowIso }
            )
          );
        }
      });
      await Promise.allSettled(updatesBatch);
    }

    return withCors(NextResponse.json({ success: true }, { status: 200 }));
  } catch (err) {
    return withCors(NextResponse.json({ error: err.message || "internal_error" }, { status: 500 }));
  }
}
