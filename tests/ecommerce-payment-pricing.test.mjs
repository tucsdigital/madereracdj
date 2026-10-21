import test from "node:test";
import assert from "node:assert/strict";
import { buildPaymentOptions } from "../lib/ecommerce-payment-pricing.mjs";

test("construye importes de todos los medios en una cotización común", () => {
  const options = buildPaymentOptions({
    subtotal: 10000,
    productDiscounts: 500,
    netSubtotal: 9500,
    shipping: 1200,
    transferDiscountRate: 0.1,
    cashDiscountRate: 0.15,
  });

  assert.equal(options.mercadopago.pricing.total, 10700);
  assert.equal(options.transferencia.pricing.transferDiscount, 950);
  assert.equal(options.transferencia.total, 9750);
  assert.equal(options.efectivo.pricing.cashDiscount, 1425);
  assert.equal(options.efectivo.total, 9275);
});

test("limita los medios permitidos en pedidos con productos bajo pedido", () => {
  const options = buildPaymentOptions({
    subtotal: 3000,
    productDiscounts: 0,
    netSubtotal: 3000,
    shipping: 0,
    transferDiscountRate: 0.05,
    cashDiscountRate: 0.1,
    methods: ["transferencia"],
  });
  assert.deepEqual(Object.keys(options), ["transferencia"]);
  assert.equal(options.transferencia.total, 2850);
});
