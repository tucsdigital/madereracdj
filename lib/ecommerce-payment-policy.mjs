export function paymentDecision(order, payment) {
  if (String(payment.orderId) !== String(order.orderId)) throw new Error("El pago no pertenece al pedido");
  if (payment.paymentStatus === "approved") {
    const total = Number(order.pricing?.total ?? order.total);
    const amount = Number(payment.amount);
    if (!Number.isFinite(amount) || !(total > 0) || Math.abs(amount - total) > 0.01 || payment.currency !== "ARS") {
      throw new Error("El importe o la moneda del pago no coincide con el pedido");
    }
  }
  if (["review", "cancelled"].includes(order.status)) return "review";
  if (order.status === "success" && order.paymentId && payment.paymentStatus === "approved" && String(order.paymentId) !== String(payment.paymentId)) return "review";
  if (order.status === "success" && payment.paymentStatus !== "refunded" && payment.paymentStatus !== "charged_back") return "success";
  if (payment.paymentStatus === "approved") return "success";
  if (["refunded", "charged_back"].includes(payment.paymentStatus)) return "review";
  if (["rejected", "cancelled"].includes(payment.paymentStatus)) return "failed";
  return "pending";
}

/** Solo una notificación verificada como aprobada puede iniciar la venta de Mercado Pago. */
export function shouldCreateMercadoPagoSale(order, payment, decision) {
  return payment?.paymentStatus === "approved" && (decision === "success" || order?.status === "cancelled");
}

/** A Mercado Pago order isn't a creation notification until the provider approves payment. */
export function shouldSendCreatedOrderNotification(order) {
  const method = String(order?.paymentMethod || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  return !["mercadopago", "mercado_pago", "mp"].includes(method);
}

/** Reservations remain active while pending, are consumed on approval, and released on failure. */
export function stockReservationDecision(paymentStatus) {
  if (paymentStatus === "approved") return "consumed";
  if (["rejected", "cancelled"].includes(paymentStatus)) return "released";
  return "pending";
}
