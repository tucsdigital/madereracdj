const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const cargarModulo = (relativePath, mockRequire = require) => {
  const source = fs.readFileSync(path.resolve(__dirname, relativePath), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  new Function("require", "module", "exports", compiled)(mockRequire, mod, mod.exports);
  return mod.exports;
};

const pagos = cargarModulo("../lib/ventas-pagos.js", (name) => {
  if (name === "@/lib/fechas-locales") {
    return {
      fechaLocalActual: () => "2026-01-01",
      normalizarFecha: (value) => String(value || ""),
    };
  }
  return require(name);
});

const { construirListadoDeudores } = cargarModulo("../lib/deudores.js", (name) => {
  if (name === "@/lib/ventas-pagos") return pagos;
  return require(name);
});

test("incluye deuda pendiente y parcial según los pagos y excluye pagadas y anuladas", () => {
  const deudores = construirListadoDeudores([
    { id: "pendiente", total: 120, estadoPago: "pagado", fecha: "2026-01-01" },
    { id: "parcial", total: 200, fecha: "2026-01-02", pagos: [{ monto: 75, fecha: "2026-01-02" }] },
    { id: "pagada", total: 100, pagos: [{ monto: 100 }] },
    { id: "sin-saldo", total: 0 },
    { id: "anulada", total: 300, estado: "anulada" },
  ]);

  assert.deepEqual(deudores.map((venta) => venta.id), ["parcial", "pendiente"]);
  assert.equal(deudores.find((venta) => venta.id === "parcial").resumenPago.saldoPendiente, 125);
  assert.equal(deudores.find((venta) => venta.id === "pendiente").resumenPago.estadoPago, "pendiente");
});

test("calcula el abonado de registros legacy y ordena por fecha descendente", () => {
  const deudores = construirListadoDeudores([
    { id: "vieja", total: 500, montoAbonado: 50, fecha: "2025-01-01" },
    { id: "nueva", total: 500, montoAbonado: 100, fecha: "2025-02-01" },
  ]);

  assert.deepEqual(deudores.map((venta) => venta.id), ["nueva", "vieja"]);
  assert.equal(deudores[0].resumenPago.abonado, 100);
  assert.equal(deudores[0].resumenPago.saldoPendiente, 400);
});
