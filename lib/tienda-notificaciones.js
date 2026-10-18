import crypto from "crypto";
import { Resend } from "resend";
import { getAdminDb } from "@/lib/firebase-admin";
import { normalizeTiendaConfig } from "@/lib/tienda-config";

export const ORDER_NOTIFICATION_TYPES = Object.freeze({
  created: "created",
  confirmed: "confirmed",
  cancelled: "cancelled",
  paymentFailed: "paymentFailed",
  review: "review",
});

const EVENT_LABELS = {
  created: "Nuevo pedido",
  confirmed: "Pedido confirmado",
  cancelled: "Pedido cancelado",
  paymentFailed: "Pago rechazado o cancelado",
  review: "Pedido requiere revisión",
};
const EVENT_KEYS = Object.values(ORDER_NOTIFICATION_TYPES);
const COLLECTION = "orderAdminEmailEvents";
const RESEND_RECEIPTS_COLLECTION = "resendWebhookReceipts";
const MAX_ATTEMPT_LEASE_MS = 2 * 60 * 1000;

const clean = (value, limit = 500) => String(value ?? "").trim().slice(0, limit);
const esc = (value) => clean(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const money = (value) => `$ ${Math.max(0, Number(value) || 0).toLocaleString("es-AR")}`;

function emailConfig(settings) {
  return normalizeTiendaConfig(settings?.published).notificacionesPedidos;
}

function eventId(orderId, type) {
  return crypto.createHash("sha256").update(`${String(orderId)}:${type}`).digest("hex");
}

function normalizeSnapshot(order, type, extras = {}) {
  if (order?.orderNumber && order?.customerName && Array.isArray(order.items)) {
    return {
      ...order,
      type,
      label: EVENT_LABELS[type],
      orderId: clean(extras.orderId || order.orderId, 100),
      status: clean(extras.status || order.status || "pendiente", 80),
      paymentStatus: clean(extras.paymentStatus || order.paymentStatus || "", 80),
    };
  }
  const customer = order?.customerInfo || order?.cliente || {};
  const delivery = order?.deliveryInfo || {};
  const items = Array.isArray(order?.items) ? order.items : Array.isArray(order?.productos) ? order.productos : [];
  const pricing = order?.pricing || {};
  const orderRef = clean(order?.orderId || order?.idExterno || extras.orderId, 100);
  const visibleNumber = clean(order?.ventaNumeroPedido || order?.numeroPedido || extras.orderNumber || orderRef, 100);
  return {
    type,
    label: EVENT_LABELS[type],
    orderId: orderRef,
    orderNumber: visibleNumber,
    status: clean(extras.status || order?.status || order?.estadoPago || "pendiente", 80),
    paymentStatus: clean(extras.paymentStatus || order?.paymentStatus || order?.estadoPago || "", 80),
    customerName: clean(customer.nombre || [customer.nombrePila, customer.apellido].filter(Boolean).join(" ") || customer.name, 140) || "Cliente sin nombre",
    customerEmail: clean(customer.email || order?.userId, 180),
    paymentMethod: clean(order?.paymentMethod || order?.formaPago, 60) || "No informado",
    createdAt: clean(order?.createdAt || order?.fechaCreacion || new Date().toISOString(), 80),
    total: Number(pricing.total ?? order?.total) || 0,
    deliveryMethod: clean(delivery.metodoEntrega || order?.tipoEnvio, 60),
    address: clean(delivery.direccion || order?.direccionEnvio || order?.cliente?.direccion, 240),
    items: items.slice(0, 40).map((item) => ({
      name: clean(item?.name || item?.nombre || "Producto", 140),
      quantity: Number(item?.quantity ?? item?.cantidad) || 0,
      total: (Number(item?.price ?? item?.precio) || 0) * (Number(item?.quantity ?? item?.cantidad) || 0),
    })),
  };
}

function buildEmail(snapshot) {
  const subject = `${snapshot.label} · ${snapshot.orderNumber}`;
  const lines = snapshot.items.map((item) => `<tr><td style="padding:8px 0;border-bottom:1px solid #e5e5e5">${esc(item.name)} × ${esc(item.quantity)}</td><td align="right" style="padding:8px 0;border-bottom:1px solid #e5e5e5">${money(item.total)}</td></tr>`).join("");
  const detailRows = [
    ["Cliente", snapshot.customerName],
    ["Email", snapshot.customerEmail],
    ["Pago", snapshot.paymentMethod],
    ["Estado", snapshot.paymentStatus || snapshot.status],
    ["Entrega", snapshot.deliveryMethod],
    ["Dirección", snapshot.address],
  ].filter(([, value]) => value).map(([label, value]) => `<tr><td style="padding:5px 0;color:#666">${esc(label)}</td><td align="right" style="padding:5px 0">${esc(value)}</td></tr>`).join("");
  const textItems = snapshot.items.map((item) => `- ${item.name} × ${item.quantity} — ${money(item.total)}`).join("\n");
  const text = [snapshot.label, `Pedido: ${snapshot.orderNumber}`, `Cliente: ${snapshot.customerName}`, snapshot.customerEmail && `Email: ${snapshot.customerEmail}`, `Pago: ${snapshot.paymentMethod}`, `Estado: ${snapshot.paymentStatus || snapshot.status}`, snapshot.deliveryMethod && `Entrega: ${snapshot.deliveryMethod}`, snapshot.address && `Dirección: ${snapshot.address}`, "", "Productos:", textItems || "Sin detalle de productos", "", `Total: ${money(snapshot.total)}`].filter((line) => line !== false && line !== null && line !== undefined).join("\n");
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;background:#f5f5f5;font:15px Arial,sans-serif;color:#111"><main style="max-width:600px;margin:24px auto;padding:28px;background:#fff;border-radius:18px"><p style="margin:0;color:#777;font-size:12px;letter-spacing:.15em;text-transform:uppercase">Maderas Caballero · Tienda online</p><h1 style="margin:12px 0 4px;font-size:26px">${esc(snapshot.label)}</h1><p style="margin:0 0 24px;color:#666">Pedido ${esc(snapshot.orderNumber)}</p><table style="width:100%;border-collapse:collapse">${detailRows}</table><h2 style="margin:26px 0 10px;font-size:16px">Productos</h2><table style="width:100%;border-collapse:collapse">${lines || "<tr><td>Sin detalle de productos</td></tr>"}</table><p style="margin:20px 0 0;text-align:right;font-size:20px;font-weight:bold">Total: ${money(snapshot.total)}</p><p style="margin:24px 0 0;color:#777;font-size:12px">Aviso automático generado por la tienda. No respondas a este mensaje.</p></main></body></html>`;
  return { subject, text, html };
}

function mailConfig() {
  const apiKey = String(process.env.RESEND_API_KEY || "").trim();
  const sender = String(process.env.RESEND_FROM_EMAIL || process.env.RESEND_FROM || "").trim();
  if (!apiKey || !sender) throw new Error("Falta configurar RESEND_API_KEY y RESEND_FROM_EMAIL/RESEND_FROM en el servidor del sistema.");
  const brand = String(process.env.NEXT_PUBLIC_BRAND_NAME || "Maderas Caballero").trim();
  return { client: new Resend(apiKey), from: sender.includes("<") ? sender : `${brand} <${sender}>` };
}

export async function sendOrderAdminTestEmail(recipients) {
  const normalized = [...new Set((Array.isArray(recipients) ? recipients : []).map((value) => clean(value, 254).toLowerCase()).filter(Boolean))];
  if (normalized.length > 10) throw new Error("Podés indicar hasta 10 destinatarios para la prueba.");
  if (!normalized.length || normalized.some((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    throw new Error("Ingresá al menos un destinatario válido antes de enviar la prueba.");
  }
  const { client, from } = mailConfig();
  const result = await client.emails.send({
    from,
    to: normalized,
    subject: "Prueba de notificaciones · Maderas Caballero",
    text: "La configuración de avisos de pedidos está conectada correctamente.",
    html: "<div style=\"font:16px Arial,sans-serif;color:#111\"><h2>Prueba de notificaciones</h2><p>La configuración de avisos de pedidos está conectada correctamente.</p></div>",
  }, { idempotencyKey: `tienda-admin-test-${crypto.randomUUID()}` });
  if (result.error) throw new Error(result.error.message || "El proveedor no pudo enviar el correo de prueba.");
  return { ok: true, id: result.data?.id || null, recipients: normalized };
}

async function loadOrder(db, orderId, fallbackOrder) {
  const direct = await db.collection("orders").doc(String(orderId)).get();
  if (direct.exists) return { id: direct.id, ...direct.data() };
  const matches = await db.collection("orders").where("orderId", "==", String(orderId)).limit(1).get();
  if (!matches.empty) return { id: matches.docs[0].id, ...matches.docs[0].data() };
  return fallbackOrder ? { ...fallbackOrder, orderId: fallbackOrder.orderId || String(orderId) } : null;
}

export async function sendOrderAdminNotification(orderId, type, { fallbackOrder, status, paymentStatus } = {}) {
  if (!EVENT_KEYS.includes(type)) throw new Error("Tipo de aviso de pedido inválido.");
  const db = getAdminDb();
  const settings = (await db.collection("settings").doc("tienda").get()).data() || {};
  const config = emailConfig(settings);
  if (!config.enabled || !config.events[type] || !config.recipients.length) return { ok: true, skipped: true, reason: "disabled" };

  const order = await loadOrder(db, orderId, fallbackOrder);
  if (!order) throw new Error("No se encontró el pedido para generar el aviso.");
  const snapshot = normalizeSnapshot(order, type, { orderId, status, paymentStatus });
  const id = eventId(orderId, type);
  const ref = db.collection(COLLECTION).doc(id);
  const now = new Date().toISOString();
  let attempt = 0;
  let claimStatus = "";
  const claimed = await db.runTransaction(async (transaction) => {
    const current = await transaction.get(ref);
    const previous = current.data() || {};
    if (previous.status === "sent") { claimStatus = "sent"; return false; }
    if (previous.status === "sending" && Date.now() - Date.parse(previous.sendingAt || "") < MAX_ATTEMPT_LEASE_MS) {
      claimStatus = "sending";
      return false;
    }
    attempt = (Number(previous.attempts) || 0) + 1;
    transaction.set(ref, {
      orderId: String(orderId),
      type,
      label: EVENT_LABELS[type],
      status: "sending",
      deliveryStatus: "pending",
      recipients: config.recipients,
      orderSnapshot: previous.orderSnapshot || snapshot,
      attempts: attempt,
      sendingAt: now,
      updatedAt: now,
      ...(previous.createdAt ? {} : { createdAt: now }),
      error: null,
    }, { merge: true });
    return true;
  });
  if (!claimed) return { ok: claimStatus === "sent", skipped: true, status: claimStatus };

  try {
    const { client, from } = mailConfig();
    const template = buildEmail(snapshot);
    const result = await client.emails.send({ from, to: config.recipients, ...template }, { idempotencyKey: `admin-order-${id}` });
    if (result.error) throw new Error(result.error.message || "El proveedor no pudo enviar el aviso.");
    await ref.set({ status: "sent", deliveryStatus: "accepted", deliveryError: null, resendId: result.data?.id || null, sentAt: new Date().toISOString(), updatedAt: new Date().toISOString(), error: null }, { merge: true });
    return { ok: true, id: result.data?.id || null };
  } catch (error) {
    await ref.set({ status: "failed", deliveryStatus: "send_failed", error: clean(error?.message || "No se pudo enviar el aviso.", 500), updatedAt: new Date().toISOString() }, { merge: true });
    throw error;
  }
}

export async function getOrderAdminNotificationEvents(limit = 25) {
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 25));
  const snapshot = await getAdminDb().collection(COLLECTION).orderBy("updatedAt", "desc").limit(safeLimit).get();
  return snapshot.docs.map((document) => {
    const data = document.data() || {};
    return {
      id: document.id,
      orderId: data.orderId || "",
      orderNumber: data.orderSnapshot?.orderNumber || "",
      type: data.type || "",
      label: data.label || EVENT_LABELS[data.type] || "Aviso de pedido",
      status: data.status || "pending",
      recipients: Array.isArray(data.recipients) ? data.recipients : [],
      attempts: Number(data.attempts) || 0,
      error: data.error || "",
      deliveryStatus: data.deliveryStatus || "",
      deliveryError: data.deliveryError || "",
      deliveryEventAt: data.deliveryEventAt || null,
      updatedAt: data.updatedAt || data.createdAt || null,
      sentAt: data.sentAt || null,
      resendId: data.resendId || null,
    };
  });
}

const RESEND_DELIVERY_STATES = {
  "email.sent": "accepted",
  "email.delivered": "delivered",
  "email.delivery_delayed": "delayed",
  "email.bounced": "bounced",
  "email.complained": "complained",
  "email.failed": "provider_failed",
  "email.suppressed": "suppressed",
};

/** Guarda de forma idempotente los recibos firmados de entrega de Resend. */
export async function recordOrderAdminDeliveryEvent(event, webhookId) {
  const deliveryStatus = RESEND_DELIVERY_STATES[event?.type];
  const emailId = clean(event?.data?.email_id, 200);
  if (!deliveryStatus || !emailId || !webhookId) return { matched: false, ignored: true };

  const db = getAdminDb();
  const matches = await db.collection(COLLECTION).where("resendId", "==", emailId).limit(1).get();
  if (matches.empty) return { matched: false };

  const notificationRef = matches.docs[0].ref;
  const receiptId = crypto.createHash("sha256").update(String(webhookId)).digest("hex");
  const receiptRef = db.collection(RESEND_RECEIPTS_COLLECTION).doc(receiptId);
  const eventAt = new Date(event.created_at || Date.now());
  const eventAtIso = Number.isNaN(eventAt.getTime()) ? new Date().toISOString() : eventAt.toISOString();
  const deliveryError = clean(event?.data?.bounce?.message || event?.data?.failed?.reason || event?.data?.suppressed?.message || "", 500);
  let recorded = false;
  let duplicate = false;

  await db.runTransaction(async (transaction) => {
    const [receipt, notification] = await Promise.all([transaction.get(receiptRef), transaction.get(notificationRef)]);
    if (receipt.exists) { duplicate = true; return; }
    if (!notification.exists) return;
    const current = notification.data() || {};
    const currentAt = Date.parse(current.deliveryEventAt || "");
    transaction.create(receiptRef, { type: event.type, resendId: emailId, receivedAt: new Date().toISOString() });
    if (Number.isFinite(currentAt) && currentAt > eventAt.getTime()) {
      recorded = true;
      return;
    }
    transaction.set(notificationRef, {
      deliveryStatus,
      deliveryEventAt: eventAtIso,
      deliveryError: deliveryError || null,
      updatedAt: new Date().toISOString(),
    }, { merge: true });
    recorded = true;
  });

  return { matched: recorded, duplicate };
}

export async function retryOrderAdminNotification(id) {
  const ref = getAdminDb().collection(COLLECTION).doc(String(id));
  const snapshot = await ref.get();
  if (!snapshot.exists) throw Object.assign(new Error("No se encontró el aviso."), { status: 404 });
  const event = snapshot.data() || {};
  if (event.status === "sent") return { ok: true, alreadySent: true };
  return sendOrderAdminNotification(event.orderId, event.type, { fallbackOrder: event.orderSnapshot });
}
