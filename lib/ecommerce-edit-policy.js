const normalizedPaymentMethod = (venta) =>
  String(venta?.formaPago || venta?.pago || "").trim().toLowerCase().replace(/[\s_-]/g, "");

export const isMercadoPagoSale = (venta) => normalizedPaymentMethod(venta) === "mercadopago";

export const hasApprovedMercadoPagoPayment = (venta) =>
  String(venta?.pagoMercadoPago?.status || "").trim().toLowerCase() === "approved" &&
  /^\d+$/.test(String(venta?.pagoMercadoPago?.paymentId || ""));

export const isApprovedMercadoPagoEcommerceSale = (venta) =>
  (venta?.ecommerceLifecycle === true || String(venta?.origen || "").toLowerCase() === "ecommerce_externo") &&
  isMercadoPagoSale(venta) &&
  hasApprovedMercadoPagoPayment(venta);

/** Protects the confirmed product and payment snapshot while allowing fulfillment edits. */
export function assertApprovedMercadoPagoSaleUnchanged({
  previousSale = {},
  nextSale = {},
  previousPayments = [],
  nextPayments = [],
  paymentDeletion = false,
} = {}) {
  const previousProducts = Array.isArray(previousSale.productos)
    ? previousSale.productos
    : Array.isArray(previousSale.items) ? previousSale.items : [];
  const nextProducts = Array.isArray(nextSale.productos)
    ? nextSale.productos
    : Array.isArray(nextSale.items) ? nextSale.items : [];
  const productsChanged = JSON.stringify(previousProducts) !== JSON.stringify(nextProducts);
  const paymentsChanged = paymentDeletion || JSON.stringify(previousPayments) !== JSON.stringify(nextPayments);
  const financialFields = ["total", "subtotal", "descuentoTotal", "descuentos", "descuentoEfectivo", "costoEnvio", "formaPago", "pago", "metodoPago"];
  const financialFieldsChanged = financialFields.some((field) => {
    const before = previousSale[field] ?? null;
    const after = nextSale[field] ?? before;
    return String(before) !== String(after);
  });
  const gatewayPaymentChanged = JSON.stringify(previousSale.pagoMercadoPago || null) !==
    JSON.stringify(nextSale.pagoMercadoPago ?? previousSale.pagoMercadoPago ?? null);

  if (productsChanged || paymentsChanged || financialFieldsChanged || gatewayPaymentChanged) {
    throw Object.assign(
      new Error("Este pedido ya fue aprobado por Mercado Pago. No se pueden editar sus productos, importes ni registros de pago."),
      { status: 409 },
    );
  }
  return true;
}
