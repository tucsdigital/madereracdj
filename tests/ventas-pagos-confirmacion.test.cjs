const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const source = fs.readFileSync(path.resolve(__dirname, "../lib/ventas-pagos.js"), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const mod = { exports: {} };
const mockRequire = (name) => {
  if (name === "@/lib/fechas-locales") {
    return {
      fechaLocalActual: () => "2026-01-01",
      normalizarFecha: (value) => String(value || ""),
    };
  }
  return require(name);
};
new Function("require", "module", "exports", compiled)(mockRequire, mod, mod.exports);

const { esVentaPagada, getVentaFechaConfirmacion } = mod.exports;

test("fecha la comisión el día del pago que completa la venta, no el de creación ni un sobrepago posterior", () => {
  const venta = {
    fechaCreacion: "2025-12-10",
    total: 100,
    pagos: [
      { monto: 40, fecha: "2026-01-28" },
      { monto: 60, fecha: "2026-02-03" },
      { monto: 10, fecha: "2026-03-01" },
    ],
    fechaPagoConfirmado: "2026-03-01",
  };

  assert.equal(esVentaPagada(venta), true);
  assert.equal(getVentaFechaConfirmacion(venta), "2026-02-03");
});

test("no considera comisionable una venta parcial", () => {
  const venta = { total: 100, pagos: [{ monto: 80, fecha: "2026-02-03" }] };

  assert.equal(esVentaPagada(venta), false);
  assert.equal(getVentaFechaConfirmacion(venta), "");
});

test("usa la fecha guardada para ventas legacy y no inventa una fecha con la fecha de creación", () => {
  assert.equal(
    getVentaFechaConfirmacion({ total: 100, montoAbonado: 100, fechaPagoConfirmado: "2026-02-15", fechaCreacion: "2025-10-01" }),
    "2026-02-15"
  );
  assert.equal(getVentaFechaConfirmacion({ total: 100, montoAbonado: 100, fechaCreacion: "2025-10-01" }), "");
});
