import { NextResponse } from "next/server";
import crypto from "crypto";
import { getAdminDb } from "@/lib/firebase-admin";
import { verifyCommerceRequest } from "@/lib/ecommerce-auth";
import { uploadFileToR2 } from "@/lib/r2-storage";

export const runtime = "nodejs";

const MAX_BYTES = 10 * 1024 * 1024;
const allowedTypes = new Set(["application/pdf", "image/jpeg", "image/png"]);

function hasValidFileSignature(type, bytes) {
  if (type === "application/pdf") return bytes.subarray(0, 5).toString("ascii") === "%PDF-";
  if (type === "image/png") return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (type === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  return false;
}

function safeFilename(name) {
  const cleaned = String(name || "comprobante").replace(/[^\w.\-]+/g, "_").slice(-120);
  return cleaned || "comprobante";
}

export async function POST(request, { params }) {
  try {
    const orderId = String(params?.orderId || "").trim();
    if (!/^[a-zA-Z0-9_-]{16,100}$/.test(orderId)) {
      return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
    }

    const contentType = request.headers.get("content-type") || "";
    if (!contentType.toLowerCase().startsWith("multipart/form-data;")) {
      return NextResponse.json({ error: "El formulario del comprobante no es válido." }, { status: 400 });
    }
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > MAX_BYTES + 64 * 1024) {
      return NextResponse.json({ error: "El archivo no puede superar los 10 MB." }, { status: 413 });
    }
    const rawBody = Buffer.from(await request.arrayBuffer());
    verifyCommerceRequest(request, rawBody);
    const form = await new Response(rawBody, { headers: { "Content-Type": contentType } }).formData();
    const file = form.get("file");
    const token = String(form.get("paymentProofToken") || "").trim();
    const comments = String(form.get("comments") || "").trim().slice(0, 500);
    if (!file || typeof file.arrayBuffer !== "function" || !token) {
      return NextResponse.json({ error: "Falta el archivo o la autorización del pedido." }, { status: 400 });
    }
    const mimeType = String(file.type || "").toLowerCase();
    if (!allowedTypes.has(mimeType)) {
      return NextResponse.json({ error: "Adjuntá un PDF, JPG o PNG." }, { status: 400 });
    }
    if (!Number.isFinite(Number(file.size)) || file.size <= 0) {
      return NextResponse.json({ error: "El archivo está vacío." }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "El archivo no puede superar los 10 MB." }, { status: 413 });
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    if (!hasValidFileSignature(mimeType, bytes)) {
      return NextResponse.json({ error: "El contenido del archivo no coincide con su formato." }, { status: 400 });
    }

    const db = getAdminDb();
    const orderRef = db.collection("orders").doc(orderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) return NextResponse.json({ error: "No encontramos el pedido." }, { status: 404 });
    const order = orderSnap.data() || {};
    if (String(order.paymentMethod || "").toLowerCase() !== "transferencia") {
      return NextResponse.json({ error: "El pedido no corresponde a una transferencia." }, { status: 409 });
    }
    if (order.status !== "pending" || order.anulada === true) {
      return NextResponse.json({ error: "Este pedido ya no admite comprobantes." }, { status: 409 });
    }
    const expectedHash = String(order.paymentProofTokenHash || "");
    const suppliedHash = crypto.createHash("sha256").update(token).digest("hex");
    if (!expectedHash || expectedHash.length !== suppliedHash.length || !crypto.timingSafeEqual(Buffer.from(expectedHash), Buffer.from(suppliedHash))) {
      return NextResponse.json({ error: "No se pudo validar el acceso a este pedido." }, { status: 403 });
    }

    const saleId = String(order.ventaId || "").trim();
    if (!saleId) return NextResponse.json({ error: "El pedido todavía no está vinculado a una venta." }, { status: 409 });
    const saleRef = db.collection("ventas").doc(saleId);
    const saleSnap = await saleRef.get();
    if (!saleSnap.exists || String(saleSnap.data()?.idExterno || "") !== orderId) {
      return NextResponse.json({ error: "No se pudo verificar la venta vinculada." }, { status: 409 });
    }

    const evidenceId = crypto.randomUUID();
    const filename = safeFilename(file.name);
    const key = `comprobantes/ventas/${saleId}/${evidenceId}-${filename}`;
    const uploaded = await uploadFileToR2({ key, file, contentType: mimeType });
    const now = new Date().toISOString();
    const evidence = {
      id: evidenceId,
      nombre: filename,
      tipo: mimeType === "application/pdf" ? "pdf" : "imagen",
      mimeType,
      size: Number(file.size),
      url: uploaded?.url || null,
      storagePath: key,
      comments: comments || null,
      recibidoEn: now,
      origen: "transferencia_ecommerce",
      estadoRevision: "pendiente",
    };

    await db.runTransaction(async (transaction) => {
      const [currentOrderSnap, currentSaleSnap] = await Promise.all([
        transaction.get(orderRef),
        transaction.get(saleRef),
      ]);
      if (!currentOrderSnap.exists || !currentSaleSnap.exists) throw Object.assign(new Error("No encontramos el pedido."), { status: 404 });
      const currentOrder = currentOrderSnap.data() || {};
      const currentSale = currentSaleSnap.data() || {};
      if (currentOrder.status !== "pending" || currentOrder.paymentMethod !== "transferencia") {
        throw Object.assign(new Error("Este pedido ya no admite comprobantes."), { status: 409 });
      }
      if (String(currentSale.idExterno || "") !== orderId) throw Object.assign(new Error("La venta vinculada cambió."), { status: 409 });
      const receipts = Array.isArray(currentSale.comprobantesPago) ? currentSale.comprobantesPago : [];
      transaction.set(orderRef.collection("paymentEvidence").doc(evidenceId), evidence);
      transaction.set(orderRef, {
        paymentProofStatus: "received",
        paymentProofEvidenceId: evidenceId,
        paymentProofReceivedAt: now,
        paymentProofReason: null,
        updatedAt: now,
      }, { merge: true });
      transaction.update(saleRef, {
        comprobantesPago: [...receipts, evidence],
        comprobante_recibido: true,
        ultimoComprobante: evidence,
        paymentProofStatus: "received",
        paymentProofEvidenceId: evidenceId,
        paymentProofReceivedAt: now,
        paymentProofReason: null,
        actualizadoEn: now,
      });
    });

    return NextResponse.json({ success: true, id: evidenceId, status: "received" }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error?.message || "No se pudo guardar el comprobante." }, { status: error?.status || 500 });
  }
}
