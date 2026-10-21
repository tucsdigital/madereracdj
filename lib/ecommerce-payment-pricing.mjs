const money = (value) => Math.round(((Number(value) || 0) + Number.EPSILON) * 100) / 100;

/** Build all valid checkout totals from one server-side product/shipping quote. */
export function buildPaymentOptions({
  subtotal,
  productDiscounts,
  netSubtotal,
  shipping,
  transferDiscountRate,
  cashDiscountRate,
  methods = ["mercadopago", "transferencia", "efectivo"],
}) {
  const base = money(netSubtotal);
  const shippingTotal = money(shipping);
  const transferRate = Math.min(0.9, Math.max(0, Number(transferDiscountRate) || 0));
  const cashRate = Math.min(0.9, Math.max(0, Number(cashDiscountRate) || 0));
  const options = {};

  for (const method of methods) {
    if (!["mercadopago", "transferencia", "efectivo"].includes(method)) continue;
    const transferDiscount = method === "transferencia" ? money(base * transferRate) : 0;
    const cashDiscount = method === "efectivo" ? money(base * cashRate) : 0;
    const pricing = {
      subtotal: money(subtotal),
      productDiscounts: money(productDiscounts),
      transferDiscount,
      cashDiscount,
      shipping: shippingTotal,
      total: money(Math.max(0, base - transferDiscount - cashDiscount + shippingTotal)),
    };
    options[method] = {
      paymentMethod: method,
      pricing,
      total: pricing.total,
      transferDiscountRate: transferRate,
      cashDiscountRate: cashRate,
    };
  }

  return options;
}
