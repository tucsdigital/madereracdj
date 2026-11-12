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
  preparingForPickup: "preparingForPickup",
  readyForPickup: "readyForPickup",
  paymentProofRejected: "paymentProofRejected",
});

const EVENT_LABELS = {
  created: "Nuevo pedido",
  confirmed: "Pedido confirmado",
  cancelled: "Pedido cancelado",
  paymentFailed: "Pago rechazado o cancelado",
  review: "Pedido requiere revisión",
  preparingForPickup: "Pedido en preparación",
  readyForPickup: "Pedido listo para retirar",
  paymentProofRejected: "Comprobante de transferencia observado",
};
const CUSTOMER_EVENT_COPY = {
  created: { subject: "Recibimos tu pedido", heading: "Recibimos tu pedido", intro: "Ya registramos tu pedido y te avisaremos cuando haya novedades." },
  confirmed: { subject: "Pago aprobado", heading: "Tu pago fue aprobado", intro: "El pago se acreditó correctamente. Estamos preparando los próximos pasos de tu pedido." },
  cancelled: { subject: "Pedido cancelado", heading: "Tu pedido fue cancelado", intro: "El pedido indicado fue cancelado." },
  paymentFailed: { subject: "No se pudo confirmar el pago", heading: "No se pudo confirmar el pago", intro: "El pago fue rechazado o cancelado y el pedido no quedó confirmado." },
  review: { subject: "Estamos revisando tu pedido", heading: "Estamos revisando tu pedido", intro: "Nuestro equipo está revisando un detalle y te contactará con novedades." },
  preparingForPickup: { subject: "Estamos preparando tu pedido", heading: "Tu pedido está en preparación", intro: "Estamos preparando tu pedido. Te avisaremos cuando esté listo para retirar; por favor, no te acerques todavía." },
  readyForPickup: { subject: "Tu pedido está listo para retirar", heading: "Tu pedido está listo para retirar", intro: "Preparamos tu pedido. Ya podés pasar por la sucursal indicada." },
  paymentProofRejected: { subject: "Necesitamos revisar tu comprobante", heading: "No pudimos validar el comprobante", intro: "Por favor, revisá las indicaciones y volvé a enviarnos el comprobante desde el estado de tu pedido." },
};
const EVENT_KEYS = Object.values(ORDER_NOTIFICATION_TYPES);
const COLLECTION = "orderAdminEmailEvents";
const RESEND_RECEIPTS_COLLECTION = "resendWebhookReceipts";
const MAX_ATTEMPT_LEASE_MS = 2 * 60 * 1000;
const AUDIENCES = Object.freeze({ team: "team", customer: "customer" });

const clean = (value, limit = 500) => String(value ?? "").trim().slice(0, limit);
const esc = (value) => clean(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const money = (value) => `$ ${Math.max(0, Number(value) || 0).toLocaleString("es-AR")}`;
const amount = (value, fallback = 0) => {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : fallback;
};

function paymentKey(value) {
  const method = clean(value, 60).toLowerCase().replace(/[ -]+/g, "_");
  if (["efectivo", "cash"].includes(method)) return "efectivo";
  if (["transferencia", "transfer", "bank_transfer", "transferencia_bancaria"].includes(method)) return "transferencia";
  if (["mercadopago", "mercado_pago", "mp"].includes(method)) return "mercadopago";
  if (["coordinacion", "coordinar", "coordination"].includes(method)) return "coordinacion";
  return method;
}

function snapshotItems(order) {
  const items = Array.isArray(order?.items) ? order.items : Array.isArray(order?.productos) ? order.productos : [];
  return items.slice(0, 40).map((item) => {
    const quantity = amount(item?.quantity ?? item?.cantidad);
    const unitPrice = amount(item?.price ?? item?.precio);
    return {
      name: clean(item?.name || item?.nombre || "Producto", 140),
      quantity,
      total: amount(item?.total ?? item?.totalPrice, unitPrice * quantity),
    };
  });
}

function snapshotPricing(order, items, method) {
  const source = order?.pricing && typeof order.pricing === "object" ? order.pricing : {};
  const itemsTotal = items.reduce((sum, item) => sum + amount(item.total), 0);
  const legacyPaymentDiscount = amount(order?.descuentoEfectivo ?? order?.discountAmount);
  const subtotal = amount(source.subtotal ?? order?.subtotal, itemsTotal);
  const productDiscounts = amount(source.productDiscounts ?? order?.descuentos ?? order?.descuentoTotal);
  const cashDiscount = amount(
    source.cashDiscount ?? order?.cashDiscount ?? (method === "efectivo" ? legacyPaymentDiscount : 0),
  );
  const transferDiscount = amount(
    source.transferDiscount ?? order?.transferDiscount ?? order?.descuentoTransferencia ?? (method === "transferencia" ? legacyPaymentDiscount : 0),
  );
  const shipping = amount(source.shipping ?? order?.shippingPrice ?? order?.costoEnvio);
  const calculatedTotal = Math.max(0, subtotal - productDiscounts - cashDiscount - transferDiscount + shipping);
  return {
    subtotal,
    productDiscounts,
    cashDiscount,
    transferDiscount,
    shipping,
    total: amount(source.total ?? order?.total, calculatedTotal),
  };
}

function percentLabel(discount, base) {
  if (!(discount > 0) || !(base > 0)) return "";
  const percentage = Math.round((discount / base) * 10000) / 100;
  return `${percentage.toLocaleString("es-AR", { maximumFractionDigits: 2 })} %`;
}

function deliveryLabel(value) {
  const method = clean(value, 60).toLowerCase();
  if (["retiro", "retiro_local", "retiro_en_sucursal", "retira", "retira_en_local", "pickup"].includes(method)) return "Retiro en sucursal";
  if (["cotizar", "a_cotizar", "coordinacion"].includes(method)) return "A coordinar";
  if (["envio", "envío", "domicilio", "delivery"].includes(method)) return "Envío a domicilio";
  return clean(value, 60);
}

function statusLabel(value) {
  const status = clean(value, 80).toLowerCase().replace(/[ -]+/g, "_");
  const labels = {
    pending: "Pendiente", pendiente: "Pendiente", not_started: "Pendiente",
    success: "Aprobado", paid: "Aprobado", approved: "Aprobado", pagado: "Aprobado",
    rejected: "Rechazado", failed: "Fallido", cancelled: "Cancelado", canceled: "Cancelado",
    review: "En revisión", under_review: "En revisión", partial: "Pago parcial", parcial: "Pago parcial",
  };
  return labels[status] || clean(value, 80);
}

function publishedConfig(settings) {
  return normalizeTiendaConfig(settings?.published);
}

function eventId(orderId, type) {
  return crypto.createHash("sha256").update(`${String(orderId)}:${type}`).digest("hex");
}

function normalizeSnapshot(order, type, extras = {}) {
  if (order?.orderNumber && order?.customerName && Array.isArray(order.items)) {
    const safeOrder = { ...order };
    delete safeOrder.paymentProofToken;
    delete safeOrder.paymentProofTokenHash;
    const paymentMethod = paymentKey(order.paymentMethod || order.formaPago);
    const items = snapshotItems(order);
    const pricing = snapshotPricing(order, items, paymentMethod);
    return {
      ...safeOrder,
      type,
      label: EVENT_LABELS[type],
      orderId: clean(extras.orderId || order.orderId, 100),
      status: clean(extras.status || order.status || "pendiente", 80),
      paymentStatus: clean(extras.paymentStatus || order.paymentStatus || order.estadoPago || order.status || "", 80),
      paymentMethod,
      total: pricing.total,
      pricing,
      items,
      pickupWindow: clean(order.rangoHorario || order.deliveryInfo?.rangoHorario || order.envio?.rangoHorario || order.pickupWindow, 120),
      customerEmail: clean(order.customerEmail || order.customerInfo?.email || order.cliente?.email, 254).toLowerCase(),
      cancellationReason: clean(extras.cancellationReason || order.cancellationReason || order.motivoAnulacion || "", 300),
      paymentProofReason: clean(extras.paymentProofReason || order.paymentProofReason || "", 300),
      transferencia: extras.transferencia || order.transferencia || null,
      whatsapp: clean(extras.whatsapp || order.whatsapp || "", 30),
    };
  }
  const customer = order?.customerInfo || order?.cliente || {};
  const delivery = order?.deliveryInfo || {};
  const deliveryMethod = clean(delivery.metodoEntrega || order?.tipoEnvio, 60);
  const isPickup = ["retiro", "retiro_local", "retiro_en_sucursal", "retira", "retira_en_local", "pickup"].includes(deliveryMethod.toLowerCase());
  const pickupStore = delivery.sucursal || order?.sucursal || {};
  const pickupLocation = isPickup
    ? [pickupStore?.nombre || pickupStore?.name, pickupStore?.direccion || pickupStore?.address]
        .map((value) => clean(value, 240)).filter(Boolean).join(" · ")
    : "";
  const items = snapshotItems(order);
  const paymentMethod = paymentKey(order?.paymentMethod || order?.formaPago);
  const pricing = snapshotPricing(order, items, paymentMethod);
  const orderRef = clean(order?.orderId || order?.idExterno || extras.orderId, 100);
  const visibleNumber = clean(order?.ventaNumeroPedido || order?.numeroPedido || extras.orderNumber || orderRef, 100);
  return {
    type,
    label: EVENT_LABELS[type],
    orderId: orderRef,
    orderNumber: visibleNumber,
    status: clean(extras.status || order?.status || order?.estadoPago || "pendiente", 80),
       paymentStatus: clean(extras.paymentStatus || order?.paymentStatus || order?.estadoPago || order?.status || "", 80),
    customerName: clean(customer.nombre || [customer.nombrePila, customer.apellido].filter(Boolean).join(" ") || customer.name, 140) || "Cliente sin nombre",
    customerEmail: clean(customer.email || order?.customerEmail || order?.userId, 254).toLowerCase(),
    paymentMethod: paymentMethod || "No informado",
    createdAt: clean(order?.createdAt || order?.fechaCreacion || new Date().toISOString(), 80),
    total: pricing.total,
    pricing,
    deliveryMethod,
    address: isPickup ? "" : clean(delivery.direccion || order?.direccionEnvio || order?.cliente?.direccion, 240),
    pickupLocation,
    pickupHours: isPickup ? clean(pickupStore?.horario || pickupStore?.horarios || pickupStore?.hours, 160) : "",
    pickupWindow: isPickup ? clean(order?.rangoHorario || delivery?.rangoHorario || order?.pickupWindow, 120) : "",
    items,
    cancellationReason: clean(extras.cancellationReason || order?.cancellationReason || order?.motivoAnulacion || order?.motivo || "", 300),
    paymentProofReason: clean(extras.paymentProofReason || order?.paymentProofReason || "", 300),
    transferencia: extras.transferencia || order?.transferencia || null,
    whatsapp: clean(extras.whatsapp || order?.whatsapp || "", 30),
  };
}

const PAYMENT_LABELS = {
  transferencia: "Transferencia bancaria",
  efectivo: "Efectivo",
  mercadopago: "Mercado Pago",
  mercado_pago: "Mercado Pago",
  mp: "Mercado Pago",
  coordinacion: "A coordinar por WhatsApp",
};

export function buildOrderNotificationEmail(snapshot, audience = "team") {
  const customerCopy = CUSTOMER_EVENT_COPY[snapshot.type] || CUSTOMER_EVENT_COPY.review;
  const customer = audience === "customer";
  const subject = `${customer ? customerCopy.subject : snapshot.label} · ${snapshot.orderNumber}`;
  const items = Array.isArray(snapshot.items) ? snapshot.items : [];
  const paymentMethodKey = paymentKey(snapshot.paymentMethod);
  const paymentMethod = PAYMENT_LABELS[paymentMethodKey] || snapshot.paymentMethod || "No informado";
  const pricing = snapshotPricing(snapshot, items, paymentMethodKey);
  const netSubtotal = Math.max(0, pricing.subtotal - pricing.productDiscounts);
  const paymentDiscount = paymentMethodKey === "efectivo"
    ? pricing.cashDiscount
    : paymentMethodKey === "transferencia"
      ? pricing.transferDiscount
      : 0;
  const paymentDiscountLabel = paymentMethodKey === "efectivo"
    ? "Descuento por pagar en efectivo"
    : "Descuento por pagar con transferencia";
  const paymentDiscountPercent = percentLabel(paymentDiscount, netSubtotal);
  const orderNumber = clean(snapshot.orderNumber, 100);
  const statusLabels = {
    created: "Pedido recibido",
    confirmed: "Pago confirmado",
    cancelled: "Pedido cancelado",
    paymentFailed: "Pago no confirmado",
    review: "En revisión",
    preparingForPickup: "En preparación",
    readyForPickup: "Listo para retirar",
    paymentProofRejected: "Comprobante observado",
  };
  const paymentStatus = snapshot.type === "confirmed"
    ? "Aprobado"
    : snapshot.type === "cancelled"
      ? "Cancelado"
      : snapshot.type === "paymentFailed"
        ? "No confirmado"
        : statusLabel(snapshot.paymentStatus || snapshot.status) || "No informado";
  const statusHeading = statusLabels[snapshot.type] || "Actualización del pedido";
  const detailRows = [
    ["Cliente", snapshot.customerName],
    ...(!customer ? [["Email", snapshot.customerEmail]] : []),
    ["Pago", paymentMethod],
    ["Estado del pago", paymentStatus],
    ...(["preparingForPickup", "readyForPickup"].includes(snapshot.type) ? [["Estado del retiro", statusLabels[snapshot.type]]] : []),
    ["Entrega", deliveryLabel(snapshot.deliveryMethod)],
    ...(snapshot.pickupLocation ? [["Sucursal de retiro", snapshot.pickupLocation]] : []),
    ...(snapshot.type === "readyForPickup" && snapshot.pickupWindow ? [["Franja de retiro", snapshot.pickupWindow]] : []),
    ...(snapshot.pickupHours ? [["Horario habitual de atención", snapshot.pickupHours]] : []),
    ...(!snapshot.pickupLocation && snapshot.address ? [["Dirección de entrega", snapshot.address]] : []),
    ...(snapshot.type === "paymentProofRejected" && snapshot.paymentProofReason ? [["Observación del comprobante", snapshot.paymentProofReason]] : []),
  ].filter(([, value]) => value).map(([label, value], index, rows) => `<tr><td style="padding:10px 12px 10px 0;border-bottom:${index === rows.length - 1 ? "0" : "1px solid #e8e8e5"};color:#686a66;font-size:13px;line-height:19px;vertical-align:top">${esc(label)}</td><td align="right" style="padding:10px 0;border-bottom:${index === rows.length - 1 ? "0" : "1px solid #e8e8e5"};color:#20211f;font-size:13px;font-weight:600;line-height:19px;word-break:break-word;vertical-align:top">${esc(value)}</td></tr>`).join("");
  const lines = items.map((item, index) => `<tr><td style="padding:14px 10px 14px 0;border-bottom:${index === items.length - 1 ? "0" : "1px solid #e8e8e5"};color:#252623;font-size:14px;line-height:20px;vertical-align:top"><strong style="font-weight:600">${esc(item.name)}</strong><br><span style="color:#777a74;font-size:12px">Cantidad: ${esc(item.quantity)}</span></td><td align="right" style="padding:14px 0;border-bottom:${index === items.length - 1 ? "0" : "1px solid #e8e8e5"};color:#252623;font-size:14px;font-weight:600;line-height:20px;white-space:nowrap;vertical-align:top">${money(item.total)}</td></tr>`).join("");
  const textItems = items.map((item) => `• ${item.name} × ${item.quantity} — ${money(item.total)}`).join("\n");
  const pricingRows = [];
  if (pricing.subtotal > 0 || items.length) pricingRows.push(["Subtotal de productos", money(pricing.subtotal)]);
  if (pricing.productDiscounts > 0) pricingRows.push(["Descuentos de productos", `−${money(pricing.productDiscounts)}`, "discount"]);
  if (paymentDiscount > 0) pricingRows.push([`${paymentDiscountLabel} (${paymentDiscountPercent})`, `−${money(paymentDiscount)}`, "discount"]);
  if (pricing.shipping > 0) pricingRows.push(["Envío", money(pricing.shipping)]);
  const pricingTableRows = pricingRows.map(([label, value, tone], index) => `<tr><td style="padding:8px 0;border-bottom:1px solid #e8e8e5;color:${tone === "discount" ? "#4b6253" : "#686a66"};font-size:13px;line-height:19px">${esc(label)}</td><td align="right" style="padding:8px 0;border-bottom:1px solid #e8e8e5;color:${tone === "discount" ? "#344b3b" : "#252623"};font-size:13px;font-weight:600;line-height:19px;white-space:nowrap">${esc(value)}</td></tr>`).join("");
  const mercadoPagoNote = paymentMethodKey === "mercadopago"
    ? pricing.productDiscounts > 0
      ? "Mercado Pago mantiene las promociones aplicadas a los productos y no agrega un descuento adicional por medio de pago."
      : "Mercado Pago utiliza el precio de tienda, sin descuento adicional por medio de pago."
    : "";
  const pricingNote = mercadoPagoNote
    ? `<tr><td colspan="2" style="padding:12px 14px;background:#f5f5f2;color:#686a66;font-size:12px;line-height:18px">${esc(mercadoPagoNote)}</td></tr>`
    : "";
  const bank = snapshot.transferencia || {};
  const bankRows = customer && snapshot.type === "created" && /transfer/i.test(snapshot.paymentMethod || "")
    ? [["Titular", bank.titular], ["Banco", bank.banco], ["Tipo de cuenta", bank.tipoCuenta], ["CBU", bank.cbu], ["Alias", bank.alias], ["CUIT", bank.cuit], ["Instrucciones", bank.instrucciones]]
      .filter(([, value]) => value).map(([label, value], index, rows) => `<tr><td style="padding:9px 12px 9px 0;border-bottom:${index === rows.length - 1 ? "0" : "1px solid #e8e8e5"};color:#686a66;font-size:13px;line-height:19px">${esc(label)}</td><td align="right" style="padding:9px 0;border-bottom:${index === rows.length - 1 ? "0" : "1px solid #e8e8e5"};color:#252623;font-size:13px;font-weight:600;line-height:19px;word-break:break-word">${esc(value)}</td></tr>`).join("")
    : "";
  const reason = customer && snapshot.type === "cancelled" && snapshot.cancellationReason
    ? `<tr><td colspan="2" style="padding:14px 16px;background:#f5f5f2;color:#4b4d49;font-size:13px;line-height:20px">Motivo: ${esc(snapshot.cancellationReason)}</td></tr>`
    : "";
  const whatsappDigits = String(snapshot.whatsapp || "").replace(/\D/g, "");
  const whatsappMessage = paymentMethodKey === "coordinacion"
    ? `Hola, quiero coordinar el pago y la entrega de mi pedido ${orderNumber}.`
    : `Hola, consulto por mi pedido ${orderNumber}.`;
  const whatsappHref = whatsappDigits.length >= 10
    ? `https://wa.me/${whatsappDigits}?text=${encodeURIComponent(whatsappMessage)}`
    : "";
  const uploadBaseRaw = String(process.env.NEXT_PUBLIC_TIENDA_URL || process.env.NEXT_PUBLIC_BASE_URL || "https://caballeromaderas.com").trim().replace(/\/+$/, "");
  const uploadBase = /^https?:\/\//i.test(uploadBaseRaw) ? uploadBaseRaw : "https://caballeromaderas.com";
  const proofUploadHref = customer && snapshot.type === "paymentProofRejected"
    ? `${uploadBase}/checkout/pending?orderId=${encodeURIComponent(snapshot.orderId)}`
    : "";
  const whatsappSupport = whatsappHref
    ? `<table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin:24px 0 0"><tr><td align="center" bgcolor="#20211f" style="border-radius:7px;background:#20211f"><a href="${esc(whatsappHref)}" target="_blank" style="display:inline-block;padding:13px 20px;border:1px solid #20211f;border-radius:7px;color:#ffffff;font-size:13px;font-weight:700;line-height:18px;text-decoration:none">Escribir por WhatsApp</a></td></tr></table><p style="margin:10px 0 0;color:#777a74;font-size:12px;line-height:18px">¿Necesitás ayuda? Estamos para acompañarte.</p>`
    : "";
  const proofUploadAction = proofUploadHref
    ? `<table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin:24px 0 0"><tr><td align="center" bgcolor="#20211f" style="border-radius:7px;background:#20211f"><a href="${esc(proofUploadHref)}" target="_blank" style="display:inline-block;padding:13px 20px;border:1px solid #20211f;border-radius:7px;color:#ffffff;font-size:13px;font-weight:700;line-height:18px;text-decoration:none">Volver al pedido y enviar comprobante</a></td></tr></table>`
    : "";
  const support = customer ? `${proofUploadAction}${whatsappSupport}` : "";
  const textPricing = [
    pricing.subtotal > 0 || items.length ? `Subtotal de productos: ${money(pricing.subtotal)}` : null,
    pricing.productDiscounts > 0 ? `Descuentos de productos: −${money(pricing.productDiscounts)}` : null,
    paymentDiscount > 0 ? `${paymentDiscountLabel} (${paymentDiscountPercent}): −${money(paymentDiscount)}` : null,
    pricing.shipping > 0 ? `Envío: ${money(pricing.shipping)}` : null,
    mercadoPagoNote,
    `Total del pedido: ${money(pricing.total)}`,
  ].filter(Boolean);
  const text = [
    "Maderas Caballero · Tienda online",
    "",
    customer ? customerCopy.heading : snapshot.label,
    `Pedido ${orderNumber}`,
    "",
    customer ? customerCopy.intro : null,
    customer ? null : `Cliente: ${snapshot.customerName}`,
    customer ? null : snapshot.customerEmail && `Email: ${snapshot.customerEmail}`,
    `Pago: ${paymentMethod}`,
    `Estado del pago: ${paymentStatus}`,
    ...(["preparingForPickup", "readyForPickup"].includes(snapshot.type) ? [`Estado del retiro: ${statusLabels[snapshot.type]}`] : []),
    snapshot.deliveryMethod && `Entrega: ${deliveryLabel(snapshot.deliveryMethod)}`,
    snapshot.pickupLocation && `Sucursal de retiro: ${snapshot.pickupLocation}`,
    snapshot.type === "readyForPickup" && snapshot.pickupWindow && `Franja de retiro: ${snapshot.pickupWindow}`,
    snapshot.pickupHours && `Horario habitual de atención: ${snapshot.pickupHours}`,
    !snapshot.pickupLocation && snapshot.address && `Dirección de entrega: ${snapshot.address}`,
    snapshot.cancellationReason && snapshot.type === "cancelled" ? `Motivo: ${snapshot.cancellationReason}` : null,
    snapshot.paymentProofReason && snapshot.type === "paymentProofRejected" ? `Observación del comprobante: ${snapshot.paymentProofReason}` : null,
    proofUploadHref ? `Volvé al pedido para enviar un nuevo comprobante: ${proofUploadHref}` : null,
    "",
    "Productos",
    textItems || "Sin detalle de productos",
    "",
    "Resumen de importes",
    ...textPricing,
    bankRows ? "" : null,
    bankRows ? `Datos para transferencia: ${[bank.titular, bank.banco, bank.tipoCuenta, bank.cbu, bank.alias, bank.cuit, bank.instrucciones].filter(Boolean).join(" · ")}` : null,
    customer && whatsappHref ? `¿Necesitás ayuda? Escribinos por WhatsApp: ${whatsappHref}` : null,
  ].filter((line) => line !== false && line !== null && line !== undefined).join("\n");
  const heading = customer ? customerCopy.heading : snapshot.label;
  const intro = customer ? customerCopy.intro : "Se registró una actualización en el pedido.";
  const footer = customer
    ? "Este aviso se relaciona con tu pedido. Si necesitás ayuda, escribinos."
    : "Aviso automático generado por la tienda. No respondas a este mensaje.";
  const total = pricing.total;
  const preheader = customer ? `${statusHeading} · Pedido ${orderNumber}` : `${snapshot.label} · Pedido ${orderNumber}`;
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting"><title>${esc(subject)}</title></head><body style="margin:0;padding:0;background-color:#f1f2ef;color:#20211f;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%"><div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all">${esc(preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div><table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" bgcolor="#f1f2ef" style="width:100%;border-collapse:collapse;background-color:#f1f2ef"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="640" border="0" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="width:100%;max-width:640px;border:1px solid #e5e6e2;border-collapse:separate;border-spacing:0;border-radius:12px;background-color:#ffffff"><tr><td style="padding:24px 28px 20px;border-bottom:1px solid #e8e8e5"><p style="margin:0;color:#555951;font-size:11px;font-weight:700;letter-spacing:2px;line-height:16px;text-transform:uppercase">Maderas Caballero</p><p style="margin:4px 0 0;color:#858780;font-size:12px;line-height:18px">Tienda online</p></td></tr><tr><td style="padding:28px 28px 8px"><table role="presentation" border="0" cellpadding="0" cellspacing="0"><tr><td style="padding:5px 9px;border-radius:4px;background-color:#edf0eb;color:#405145;font-size:10px;font-weight:700;letter-spacing:1px;line-height:14px;text-transform:uppercase">${esc(statusHeading)}</td></tr></table><h1 style="margin:16px 0 6px;color:#20211f;font-size:27px;font-weight:700;letter-spacing:-.5px;line-height:34px">${esc(heading)}</h1><p style="margin:0;color:#696c66;font-size:14px;line-height:21px">Pedido <strong style="color:#30332f;font-weight:700">${esc(orderNumber)}</strong></p><p style="margin:16px 0 0;color:#555951;font-size:14px;line-height:22px">${esc(intro)}</p></td></tr><tr><td style="padding:20px 28px 0"><table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" bgcolor="#f7f7f5" style="width:100%;border:1px solid #e8e8e5;border-collapse:separate;border-spacing:0;border-radius:8px;background-color:#f7f7f5"><tr><td style="padding:6px 14px"><table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">${detailRows}${reason}</table></td></tr></table></td></tr><tr><td style="padding:25px 28px 0"><h2 style="margin:0 0 8px;color:#20211f;font-size:16px;font-weight:700;line-height:22px">Productos</h2><table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">${lines || `<tr><td style="padding:14px 0;color:#777a74;font-size:13px;line-height:20px">Sin detalle de productos</td></tr>`}</table></td></tr><tr><td style="padding:19px 28px 0"><h2 style="margin:0 0 8px;color:#20211f;font-size:16px;font-weight:700;line-height:22px">Resumen de importes</h2><table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="width:100%;border-top:1px solid #e8e8e5;border-collapse:collapse">${pricingTableRows}${pricingNote}<tr><td style="padding:15px 0 2px;color:#20211f;font-size:15px;font-weight:700;line-height:22px">Total del pedido</td><td align="right" style="padding:15px 0 2px;color:#20211f;font-size:21px;font-weight:700;line-height:26px;white-space:nowrap">${money(total)}</td></tr></table></td></tr>${bankRows ? `<tr><td style="padding:24px 28px 0"><h2 style="margin:0 0 9px;color:#20211f;font-size:16px;font-weight:700;line-height:22px">Datos para transferir</h2><table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" bgcolor="#f7f7f5" style="width:100%;padding:0 14px;border:1px solid #e8e8e5;border-collapse:separate;border-spacing:0;border-radius:8px;background-color:#f7f7f5">${bankRows}</table></td></tr>` : ""}${support ? `<tr><td style="padding:0 28px">${support}</td></tr>` : ""}<tr><td style="padding:26px 28px 25px"><p style="margin:0;padding-top:17px;border-top:1px solid #e8e8e5;color:#858780;font-size:11px;line-height:18px">${esc(footer)}</p></td></tr></table><p style="margin:14px 0 0;color:#8a8c86;font-size:10px;line-height:16px">Maderas Caballero · Tienda online</p></td></tr></table></body></html>`;
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
export async function sendOrderAdminNotification(orderId, type, { fallbackOrder, status, paymentStatus, cancellationReason, paymentProofReason, audience } = {}) {
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
    orderId, status, paymentStatus, cancellationReason, paymentProofReason,
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
