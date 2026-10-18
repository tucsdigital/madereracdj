const test = require("node:test");
const assert = require("node:assert/strict");
const { paymentDecision, shouldCreateMercadoPagoSale } = require("../lib/ecommerce-payment-policy.mjs");

const order = { orderId: "order_1234567890123456", total: 24500, status: "pending" };

test("solo un pago aprobado y coincidente confirma el pedido", () => {
  assert.equal(paymentDecision(order, {
    orderId: order.orderId,
    paymentId: "998877",
    paymentStatus: "approved",
    amount: 24500,
    currency: "ARS",
  }), "success");
  assert.throws(() => paymentDecision(order, {
    orderId: order.orderId,
    paymentId: "998877",
    paymentStatus: "approved",
    amount: 24501,
    currency: "ARS",
  }), /importe o la moneda/);
});

test("rechazado, cancelado y pendiente nunca se consideran una compra aprobada", () => {
  const payment = { orderId: order.orderId, amount: 24500, currency: "ARS" };
  assert.equal(paymentDecision(order, { ...payment, paymentId: "1", paymentStatus: "rejected" }), "failed");
  assert.equal(paymentDecision(order, { ...payment, paymentId: "2", paymentStatus: "cancelled" }), "failed");
  assert.equal(paymentDecision(order, { ...payment, paymentId: "3", paymentStatus: "in_process" }), "pending");
  for (const paymentStatus of ["pending", "in_process", "rejected", "cancelled"]) {
    assert.equal(shouldCreateMercadoPagoSale(order, { paymentStatus }, "pending"), false);
  }
  assert.equal(shouldCreateMercadoPagoSale(order, { paymentStatus: "approved" }, "success"), true);
});

test("un rechazo tardío no degrada un pago previamente aprobado", () => {
  assert.equal(paymentDecision({ ...order, status: "success", paymentId: "998877" }, {
    orderId: order.orderId,
    paymentId: "998877",
    paymentStatus: "rejected",
  }), "success");
});
