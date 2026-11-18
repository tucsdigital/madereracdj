const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

function load(relativePath) {
  const source = fs.readFileSync(path.resolve(__dirname, "..", relativePath), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const compiledModule = { exports: {} };
  new Function("require", "module", "exports", output)(require, compiledModule, compiledModule.exports);
  return compiledModule.exports;
}

const { calcularImportesEdicionVenta } = load("lib/ventas-edicion-precios.js");
const {
  assertApprovedMercadoPagoSaleUnchanged,
  hasApprovedMercadoPagoPayment,
  isApprovedMercadoPagoEcommerceSale,
} = load("lib/ecommerce-edit-policy.js");
const ecommercePanel = load("lib/ecommerce-panel.js");

test("la edición ecommerce conserva el importe confirmado y no aplica el descuento ERP de efectivo", () => {
  const original = {
    origen: "ecommerce_externo",
    formaPago: "efectivo",
    subtotal: 53100,
    descuentoTotal: 0,
    descuentos: 0,
    descuentoEfectivo: 10620,
    total: 53100,
    totalSinEfectivo: 53100,
    totalConEfectivo: 42480,
    costoEnvio: 0,
  };
  const amounts = calcularImportesEdicionVenta({
    esVentaEcommerce: true,
    ventaOriginal: original,
    ventaEdit: { ...original, pagoEnEfectivo: false },
    totalesProductos: { subtotal: 53100, descuentoTotal: 0, total: 53100 },
  });

  assert.equal(amounts.descuentoEfectivo, 10620);
  assert.equal(amounts.total, 42480);
  const normalized = ecommercePanel.normalizeVenta("ecom-1", {
    ...original,
    total: amounts.total,
    descuentoEfectivo: amounts.descuentoEfectivo,
    productos: [{ precio: 53100, cantidad: 1 }],
  });
  assert.equal(normalized.desc.revisar, false);
  assert.equal(normalized.desc.diferencia, 0);
});

test("la edición de una venta nativa recalcula y persiste el descuento ERP de efectivo", () => {
  const amounts = calcularImportesEdicionVenta({
    esVentaEcommerce: false,
    ventaOriginal: { descuentoEfectivo: 10620 },
    ventaEdit: { tipoEnvio: "retiro_local", pagoEnEfectivo: true },
    totalesProductos: { subtotal: 53100, descuentoTotal: 0, total: 53100 },
  });

  assert.equal(amounts.descuentoEfectivo, 5310);
  assert.equal(amounts.total, 47790);
  assert.equal(amounts.descuentos, amounts.descuentoTotal);

  const noCashAmounts = calcularImportesEdicionVenta({
    esVentaEcommerce: false,
    ventaOriginal: { descuentoEfectivo: 10620 },
    ventaEdit: { tipoEnvio: "retiro_local", pagoEnEfectivo: false },
    totalesProductos: { subtotal: 53100, descuentoTotal: 0, total: 53100 },
  });
  assert.equal(noCashAmounts.descuentoEfectivo, 0);
  assert.equal(noCashAmounts.total, 53100);
});

test("editar productos ecommerce recalcula importes desde el nuevo subtotal", () => {
  const original = {
    formaPago: "efectivo",
    subtotal: 1000,
    descuentoTotal: 0,
    descuentoEfectivo: 100,
    total: 900,
    costoEnvio: 20,
    productos: [{ id: "madera", precio: 1000, cantidad: 1 }],
  };
  const edited = {
    ...original,
    tipoEnvio: "envio_domicilio",
    costoEnvio: 75,
    productos: [{ id: "madera", precio: 1500, cantidad: 1 }],
  };
  const amounts = calcularImportesEdicionVenta({
    esVentaEcommerce: true,
    ventaOriginal: original,
    ventaEdit: edited,
    totalesProductos: { subtotal: 1500, descuentoTotal: 0, total: 1500 },
  });
  assert.deepEqual([amounts.subtotal, amounts.descuentoEfectivo, amounts.costoEnvioCalculado, amounts.total], [1500, 150, 75, 1425]);
});

test("Mercado Pago aprobado bloquea cambios de productos, pagos e importes pero permite coordinar la entrega", () => {
  const sale = {
    origen: "ecommerce_externo",
    formaPago: "mercado_pago",
    ecommerceLifecycle: true,
    pagoMercadoPago: { status: "approved", paymentId: "123456" },
    productos: [{ id: "p1", precio: 1000, cantidad: 1 }],
    total: 1000,
    pagos: [{ monto: 1000, metodo: "Mercado Pago" }],
  };
  assert.equal(hasApprovedMercadoPagoPayment(sale), true);
  assert.equal(isApprovedMercadoPagoEcommerceSale(sale), true);
  assert.equal(assertApprovedMercadoPagoSaleUnchanged({ previousSale: sale, nextSale: { ...sale, fechaEntrega: "2026-11-20", rangoHorario: "10 a 13" }, previousPayments: sale.pagos, nextPayments: sale.pagos }), true);

  const changes = [
    { nextSale: { ...sale, productos: [{ id: "p1", precio: 900, cantidad: 1 }] } },
    { nextSale: { ...sale, total: 900 } },
    { nextSale: { ...sale, pagoMercadoPago: { ...sale.pagoMercadoPago, status: "refunded" } } },
    { nextPayments: [] },
    { paymentDeletion: true },
  ];
  for (const change of changes) {
    assert.throws(
      () => assertApprovedMercadoPagoSaleUnchanged({
        previousSale: sale,
        nextSale: change.nextSale || sale,
        previousPayments: sale.pagos,
        nextPayments: change.nextPayments || sale.pagos,
        paymentDeletion: change.paymentDeletion,
      }),
      (error) => error.status === 409 && /Mercado Pago/.test(error.message),
    );
  }
});
