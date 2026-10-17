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
