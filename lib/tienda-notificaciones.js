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
const CUSTOMER_EVENT_COPY = {
  created: { subject: "Recibimos tu pedido", heading: "Recibimos tu pedido", intro: "Ya registramos tu pedido y te avisaremos cuando haya novedades." },
  confirmed: { subject: "Pago aprobado", heading: "Tu pago fue aprobado", intro: "El pago se acreditó correctamente. Estamos preparando los próximos pasos de tu pedido." },
  cancelled: { subject: "Pedido cancelado", heading: "Tu pedido fue cancelado", intro: "El pedido indicado fue cancelado." },
  paymentFailed: { subject: "No se pudo confirmar el pago", heading: "No se pudo confirmar el pago", intro: "El pago fue rechazado o cancelado y el pedido no quedó confirmado." },
  review: { subject: "Estamos revisando tu pedido", heading: "Estamos revisando tu pedido", intro: "Nuestro equipo está revisando un detalle y te contactará con novedades." },
};
const EVENT_KEYS = Object.values(ORDER_NOTIFICATION_TYPES);
const COLLECTION = "orderAdminEmailEvents";
const RESEND_RECEIPTS_COLLECTION = "resendWebhookReceipts";
const MAX_ATTEMPT_LEASE_MS = 2 * 60 * 1000;
const AUDIENCES = Object.freeze({ team: "team", customer: "customer" });

const clean = (value, limit = 500) => String(value ?? "").trim().slice(0, limit);
const esc = (value) => clean(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const money = (value) => `$ ${Math.max(0, Number(value) || 0).toLocaleString("es-AR")}`;

function publishedConfig(settings) {
  return normalizeTiendaConfig(settings?.published);
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
      customerEmail: clean(order.customerEmail || order.customerInfo?.email || order.cliente?.email, 254).toLowerCase(),
      cancellationReason: clean(extras.cancellationReason || order.cancellationReason || order.motivoAnulacion || "", 300),
      transferencia: extras.transferencia || order.transferencia || null,
      whatsapp: clean(extras.whatsapp || order.whatsapp || "", 30),
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
    customerEmail: clean(customer.email || order?.customerEmail || order?.userId, 254).toLowerCase(),
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
    cancellationReason: clean(extras.cancellationReason || order?.cancellationReason || order?.motivoAnulacion || order?.motivo || "", 300),
    transferencia: extras.transferencia || order?.transferencia || null,
    whatsapp: clean(extras.whatsapp || order?.whatsapp || "", 30),
  };
}

const PAYMENT_LABELS = {
  transferencia: "Transferencia bancaria",
  mercadopago: "Mercado Pago",
  mercado_pago: "Mercado Pago",
  mp: "Mercado Pago",
};

export function buildOrderNotificationEmail(snapshot, audience = "team") {
  const customerCopy = CUSTOMER_EVENT_COPY[snapshot.type] || CUSTOMER_EVENT_COPY.review;
  const customer = audience === "customer";
  const subject = `${customer ? customerCopy.subject : snapshot.label} · ${snapshot.orderNumber}`;
  const items = Array.isArray(snapshot.items) ? snapshot.items : [];
  const lines = items.map((item) => `<tr><td style="padding:8px 0;border-bottom:1px solid #e5e5e5">${esc(item.name)} × ${esc(item.quantity)}</td><td align="right" style="padding:8px 0;border-bottom:1px solid #e5e5e5">${money(item.total)}</td></tr>`).join("");
  const paymentMethod = PAYMENT_LABELS[String(snapshot.paymentMethod || "").toLowerCase()] || snapshot.paymentMethod;
  const paymentStatus = customer
    ? (snapshot.type === "confirmed" ? "Aprobado" : snapshot.type === "cancelled" ? "Cancelado" : snapshot.type === "paymentFailed" ? "No confirmado" : snapshot.type === "review" ? "En revisión" : "Pendiente")
    : snapshot.paymentStatus || snapshot.status;
  const detailRows = [
    ["Cliente", snapshot.customerName],
    ...(!customer ? [["Email", snapshot.customerEmail]] : []),
    ["Pago", paymentMethod],
    ["Estado", paymentStatus],
    ["Entrega", snapshot.deliveryMethod],
    ["Dirección", snapshot.address],
  ].filter(([, value]) => value).map(([label, value]) => `<tr><td style="padding:5px 0;color:#666">${esc(label)}</td><td align="right" style="padding:5px 0">${esc(value)}</td></tr>`).join("");
  const textItems = items.map((item) => `- ${item.name} × ${item.quantity} — ${money(item.total)}`).join("\n");
  const bank = snapshot.transferencia || {};
  const bankRows = customer && snapshot.type === "created" && /transfer/i.test(snapshot.paymentMethod || "")
    ? [["Titular", bank.titular], ["Banco", bank.banco], ["Tipo de cuenta", bank.tipoCuenta], ["CBU", bank.cbu], ["Alias", bank.alias], ["CUIT", bank.cuit], ["Instrucciones", bank.instrucciones]]
      .filter(([, value]) => value).map(([label, value]) => `<tr><td style="padding:5px 0;color:#666">${esc(label)}</td><td align="right" style="padding:5px 0">${esc(value)}</td></tr>`).join("")
    : "";
  const reason = customer && snapshot.type === "cancelled" && snapshot.cancellationReason
    ? `<p style="margin:16px 0 0;color:#555">Motivo: ${esc(snapshot.cancellationReason)}</p>`
    : "";
  const intro = customer ? `<p style="margin:0 0 20px;color:#555">${esc(customerCopy.intro)}</p>` : "";
  const whatsappDigits = String(snapshot.whatsapp || "").replace(/\D/g, "");
  const support = customer && whatsappDigits.length >= 10
    ? `<p style="margin:24px 0 0;color:#555">¿Necesitás ayuda? <a href="https://wa.me/${esc(whatsappDigits)}" style="color:#111">Contactanos por WhatsApp</a>.</p>`
    : "";
  const text = [customer ? customerCopy.heading : snapshot.label, `Pedido: ${snapshot.orderNumber}`, customer ? null : `Cliente: ${snapshot.customerName}`, customer ? null : snapshot.customerEmail && `Email: ${snapshot.customerEmail}`, `Pago: ${paymentMethod}`, `Estado: ${paymentStatus}`, snapshot.deliveryMethod && `Entrega: ${snapshot.deliveryMethod}`, snapshot.address && `Dirección: ${snapshot.address}`, customer ? customerCopy.intro : null, snapshot.cancellationReason && snapshot.type === "cancelled" ? `Motivo: ${snapshot.cancellationReason}` : null, "", "Productos:", textItems || "Sin detalle de productos", "", `Total: ${money(snapshot.total)}`, bankRows ? `Datos para transferencia: ${[bank.titular, bank.banco, bank.tipoCuenta, bank.cbu, bank.alias, bank.cuit, bank.instrucciones].filter(Boolean).join(" · ")}` : null].filter((line) => line !== false && line !== null && line !== undefined).join("\n");
  const heading = customer ? customerCopy.heading : snapshot.label;
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;background:#f5f5f5;font:15px Arial,sans-serif;color:#111"><main style="max-width:600px;margin:24px auto;padding:28px;background:#fff;border-radius:18px"><p style="margin:0;color:#777;font-size:12px;letter-spacing:.15em;text-transform:uppercase">Maderas Caballero · Tienda online</p><h1 style="margin:12px 0 4px;font-size:26px">${esc(heading)}</h1><p style="margin:0 0 20px;color:#666">Pedido ${esc(snapshot.orderNumber)}</p>${intro}<table style="width:100%;border-collapse:collapse">${detailRows}</table>${reason}<h2 style="margin:26px 0 10px;font-size:16px">Productos</h2><table style="width:100%;border-collapse:collapse">${lines || "<tr><td>Sin detalle de productos</td></tr>"}</table><p style="margin:20px 0 0;text-align:right;font-size:20px;font-weight:bold">Total: ${money(snapshot.total)}</p>${bankRows ? `<h2 style="margin:26px 0 10px;font-size:16px">Datos para transferir</h2><table style="width:100%;border-collapse:collapse">${bankRows}</table>` : ""}${support}<p style="margin:24px 0 0;color:#777;font-size:12px">${customer ? "Este aviso se relaciona con tu pedido. Si necesitás ayuda, escribinos." : "Aviso automático generado por la tienda. No respondas a este mensaje."}</p></main></body></html>`;
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

const AUDIENCE_FIELDS = {
  team: {
    status: "status", deliveryStatus: "deliveryStatus", deliveryError: "deliveryError", deliveryEventAt: "deliveryEventAt",
    resendId: "resendId", attempts: "attempts", sendingAt: "sendingAt", sentAt: "sentAt", error: "error",
  },
  customer: {
    status: "customerStatus", deliveryStatus: "customerDeliveryStatus", deliveryError: "customerDeliveryError", deliveryEventAt: "customerDeliveryEventAt",
    resendId: "customerResendId", attempts: "customerAttempts", sendingAt: "customerSendingAt", sentAt: "customerSentAt", error: "customerError",
  },
};

const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || ""));

async function sendAudienceNotification({ db, ref, id, orderId, type, snapshot, audience, recipients }) {
  const fields = AUDIENCE_FIELDS[audience];
  const recipientList = audience === AUDIENCES.team ? recipients : [snapshot.customerEmail].filter(isValidEmail);
  const now = new Date().toISOString();
  if (!recipientList.length) {
    await db.runTransaction(async (transaction) => {
      const current = await transaction.get(ref);
      const previous = current.data() || {};
      if (["sent", "sending"].includes(previous[fields.status])) return;
      transaction.set(ref, {
        orderId: String(orderId), type, label: EVENT_LABELS[type], orderSnapshot: previous.orderSnapshot || snapshot,
        [fields.status]: "skipped", [fields.deliveryStatus]: "suppressed", [fields.error]: null,
        ...(audience === AUDIENCES.team ? { recipients: [] } : { customerEmail: snapshot.customerEmail || "" }),
        updatedAt: now, ...(current.exists ? {} : { createdAt: now }),
      }, { merge: true });
    });
    return { ok: true, skipped: true, audience, reason: "recipient_missing" };
  }

  let attempt = 0;
  let claimStatus = "";
  const claimed = await db.runTransaction(async (transaction) => {
    const current = await transaction.get(ref);
    const previous = current.data() || {};
    const previousStatus = previous[fields.status];
    if (previousStatus === "sent") { claimStatus = "sent"; return false; }
    if (previousStatus === "sending" && Date.now() - Date.parse(previous[fields.sendingAt] || "") < MAX_ATTEMPT_LEASE_MS) {
      claimStatus = "sending";
      return false;
    }
    attempt = (Number(previous[fields.attempts]) || 0) + 1;
    transaction.set(ref, {
      orderId: String(orderId), type, label: EVENT_LABELS[type],
      [fields.status]: "sending", [fields.deliveryStatus]: "pending", [fields.error]: null,
      ...(audience === AUDIENCES.team ? { recipients: recipientList } : { customerEmail: recipientList[0] }),
      orderSnapshot: previous.orderSnapshot || snapshot,
      [fields.attempts]: attempt, [fields.sendingAt]: now, updatedAt: now,
      ...(current.exists ? {} : { createdAt: now }),
    }, { merge: true });
    return true;
  });
  if (!claimed) return { ok: claimStatus === "sent", skipped: true, audience, status: claimStatus };

  try {
    const { client, from } = mailConfig();
    const template = buildOrderNotificationEmail(snapshot, audience);
    const result = await client.emails.send({ from, to: audience === AUDIENCES.team ? recipientList : recipientList[0], ...template }, {
      idempotencyKey: `${audience === AUDIENCES.team ? "admin" : "customer"}-order-${id}`,
    });
    if (result.error) throw new Error(result.error.message || "El proveedor no pudo enviar el aviso.");
    const sentAt = new Date().toISOString();
    await ref.set({
      [fields.status]: "sent", [fields.deliveryStatus]: "accepted", [fields.deliveryError]: null,
      [fields.resendId]: result.data?.id || null, [fields.sentAt]: sentAt, [fields.error]: null, updatedAt: sentAt,
    }, { merge: true });
    return { ok: true, audience, id: result.data?.id || null };
  } catch (error) {
    await ref.set({
      [fields.status]: "failed", [fields.deliveryStatus]: "send_failed",
      [fields.error]: clean(error?.message || "No se pudo enviar el aviso.", 500), updatedAt: new Date().toISOString(),
    }, { merge: true });
    throw error;
  }
}

/** Emite el evento habilitado hacia el equipo y el cliente, con reintentos independientes por canal. */
export async function sendOrderAdminNotification(orderId, type, { fallbackOrder, status, paymentStatus, cancellationReason, audience } = {}) {
  if (!EVENT_KEYS.includes(type)) throw new Error("Tipo de aviso de pedido inválido.");
  if (audience && !Object.values(AUDIENCES).includes(audience)) throw new Error("Destinatario de aviso inválido.");
  const db = getAdminDb();
  const settings = (await db.collection("settings").doc("tienda").get()).data() || {};
  const published = publishedConfig(settings);
  const config = published.notificacionesPedidos;
  if (!config.enabled || !config.events[type]) return { ok: true, skipped: true, reason: "disabled" };

  const order = await loadOrder(db, orderId, fallbackOrder);
  if (!order) throw new Error("No se encontró el pedido para generar el aviso.");
  const snapshot = normalizeSnapshot(order, type, {
    orderId, status, paymentStatus, cancellationReason,
    transferencia: type === "created" ? published.transferencia : null,
    whatsapp: published.contacto.whatsapp,
  });
  const id = eventId(orderId, type);
  const ref = db.collection(COLLECTION).doc(id);
  const audiences = audience ? [audience] : [AUDIENCES.team, AUDIENCES.customer];
  const results = await Promise.allSettled(audiences.map((target) => sendAudienceNotification({
    db, ref, id, orderId, type, snapshot, audience: target,
    recipients: config.recipients,
  })));
  const failed = results.find((result) => result.status === "rejected");
  if (failed) throw failed.reason;
  return { ok: true, channels: results.map((result) => result.value) };
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
      channels: {
        team: {
          status: data.status || "pending", deliveryStatus: data.deliveryStatus || "pending",
          error: data.error || "", deliveryError: data.deliveryError || "", attempts: Number(data.attempts) || 0,
          email: Array.isArray(data.recipients) ? data.recipients.join(", ") : "", sentAt: data.sentAt || null,
        },
        customer: {
          status: data.customerStatus || "skipped", deliveryStatus: data.customerDeliveryStatus || "suppressed",
          error: data.customerError || "", deliveryError: data.customerDeliveryError || "", attempts: Number(data.customerAttempts) || 0,
          email: data.customerEmail || data.orderSnapshot?.customerEmail || "", sentAt: data.customerSentAt || null,
        },
      },
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
  const [teamMatches, customerMatches] = await Promise.all([
    db.collection(COLLECTION).where("resendId", "==", emailId).limit(1).get(),
    db.collection(COLLECTION).where("customerResendId", "==", emailId).limit(1).get(),
  ]);
  const match = teamMatches.docs[0]
    ? { document: teamMatches.docs[0], audience: AUDIENCES.team }
    : customerMatches.docs[0] ? { document: customerMatches.docs[0], audience: AUDIENCES.customer } : null;
  if (!match) return { matched: false };

  const notificationRef = match.document.ref;
  const fields = AUDIENCE_FIELDS[match.audience];
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
    const currentAt = Date.parse(current[fields.deliveryEventAt] || "");
    transaction.create(receiptRef, { type: event.type, resendId: emailId, receivedAt: new Date().toISOString() });
    if (Number.isFinite(currentAt) && currentAt > eventAt.getTime()) {
      recorded = true;
      return;
    }
    transaction.set(notificationRef, {
      [fields.deliveryStatus]: deliveryStatus,
      [fields.deliveryEventAt]: eventAtIso,
      [fields.deliveryError]: deliveryError || null,
      updatedAt: new Date().toISOString(),
    }, { merge: true });
    recorded = true;
  });

  return { matched: recorded, duplicate };
}

export async function retryOrderAdminNotification(id, audience = AUDIENCES.team) {
  if (!Object.values(AUDIENCES).includes(audience)) throw Object.assign(new Error("Destinatario de aviso inválido."), { status: 400 });
  const ref = getAdminDb().collection(COLLECTION).doc(String(id));
  const snapshot = await ref.get();
  if (!snapshot.exists) throw Object.assign(new Error("No se encontró el aviso."), { status: 404 });
  const event = snapshot.data() || {};
  const status = event[AUDIENCE_FIELDS[audience].status];
  if (status === "sent") return { ok: true, alreadySent: true, audience };
  return sendOrderAdminNotification(event.orderId, event.type, { fallbackOrder: event.orderSnapshot, audience });
}
