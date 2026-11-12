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
