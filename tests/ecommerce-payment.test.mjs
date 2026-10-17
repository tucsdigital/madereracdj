import test from "node:test";
import assert from "node:assert/strict";
import { paymentDecision } from "../lib/ecommerce-payment-policy.mjs";

const order = { orderId: "pedido-1", total: 1234.56, status: "pending" };
const payment = { orderId: "pedido-1", amount: 1234.56, currency: "ARS", paymentStatus: "approved" };

test("un pago pendiente puede pasar a aprobado con el mismo identificador", () => {
  assert.equal(paymentDecision(order, { ...payment, paymentStatus: "pending" }), "pending");
  assert.equal(paymentDecision(order, payment), "success");
});
test("rechaza importe, moneda y referencia incorrectos", () => {
  for (const change of [{ amount: 1 }, { amount: null }, { amount: "NaN" }, { currency: "USD" }, { orderId: "otro" }]) {
    assert.throws(() => paymentDecision(order, { ...payment, ...change }));
  }
});
test("un evento atrasado no degrada una compra pagada", () => {
  for (const paymentStatus of ["pending", "rejected", "cancelled"]) {
    assert.equal(paymentDecision({ ...order, status: "success" }, { ...payment, paymentStatus }), "success");
  }
});
test("reembolso y contracargo requieren conciliación; no reponen stock automáticamente", () => {
  for (const paymentStatus of ["refunded", "charged_back"]) {
    assert.equal(paymentDecision({ ...order, status: "success" }, { ...payment, paymentStatus }), "review");
  }
  assert.equal(paymentDecision({ ...order, status: "review" }, payment), "review");
  assert.equal(paymentDecision({ ...order, status: "cancelled" }, payment), "review");
});
test("dos pagos aprobados distintos no se confunden con un reintento", () => {
  assert.equal(paymentDecision({ ...order, status: "success", paymentId: "1" }, { ...payment, paymentId: "2" }), "review");
});
