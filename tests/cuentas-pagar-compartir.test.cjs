const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const loadModule = (relativePath, mockRequire = require) => {
  const source = fs.readFileSync(path.resolve(__dirname, relativePath), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  new Function("require", "module", "exports", compiled)(mockRequire, mod, mod.exports);
  return mod.exports;
};

const calculations = loadModule("../lib/erp/cuentas-pagar-calculos.js");
const { construirEstadoCuentaCompartido, construirHtmlEstadoCuentaPdf } = loadModule(
  "../lib/erp/cuentas-pagar-compartir.js",
  (name) => name === "@/lib/erp/cuentas-pagar-calculos" ? calculations : require(name)
);

test("el estado filtrado conserva el saldo actual y limita movimientos visibles al período", () => {
  const statement = construirEstadoCuentaCompartido({
    proveedorId: "prov-1",
    proveedor: { nombre: "Proveedor Uno", cuit: "20-123" , saldoAFavor: 25 },
    now: new Date("2026-03-10T12:00:00.000Z"),
    generatedAt: "2026-03-10T12:00:00.000Z",
    filters: { from: "2026-02-01", to: "2026-02-28" },
    cuentas: [
      {
        id: "cuenta-1",
        tipo: "proveedor",
        proveedorId: "prov-1",
        fecha: "2025-12-01",
        fechaVencimiento: "2026-04-01",
        concepto: "Compra protegida",
        numeroComprobante: "A-100",
        monto: 1000,
        montoPagado: 200,
        responsable: "interno@empresa.com",
        observaciones: "nota interna",
        pagos: [
          { fecha: "2026-01-15", monto: 100, notas: "privado", comprobantes: [{ url: "private-url" }] },
          { fecha: "2026-02-10", monto: 100, metodo: "Transferencia", pagoGlobalProveedor: true, pagoGlobalId: "mov-1" },
        ],
      },
      { id: "otra", tipo: "proveedor", proveedorId: "prov-2", monto: 900, montoPagado: 0, fecha: "2026-02-03" },
    ],
    movimientos: [
      { id: "mov-1", proveedorId: "prov-1", tipo: "pagoGlobal", fecha: "2026-02-10", monto: 100, aplicadoACuentas: 100, actorEmail: "interno@empresa.com" },
      { id: "mov-old", proveedorId: "prov-1", tipo: "saldoAFavor", fecha: "2026-01-03", montoDelta: 25 },
    ],
  });

  assert.equal(statement.isFiltered, true);
  assert.equal(statement.accounts.length, 1);
  assert.equal(statement.accounts[0].id, "cuenta-1");
  assert.equal(statement.accounts[0].payments.length, 1);
  assert.equal(statement.summary.grossBalance, 800);
  assert.equal(statement.summary.creditBalance, 25);
  assert.equal(statement.summary.netBalance, 775);
  assert.equal(statement.movements.length, 1);
  assert.equal(statement.movements[0].id, "mov-1");
  assert.equal(JSON.stringify(statement).includes("interno@empresa.com"), false);
  assert.equal(JSON.stringify(statement).includes("nota interna"), false);
  assert.equal(JSON.stringify(statement).includes("private-url"), false);
});

test("el estado completo conserva cuentas anuladas como historial sin computarlas en deuda", () => {
  const statement = construirEstadoCuentaCompartido({
    proveedorId: "p",
    proveedor: { nombre: "Proveedor" },
    now: new Date("2026-03-10T12:00:00.000Z"),
    cuentas: [
      { id: "active", proveedor: { id: "p", nombre: "Proveedor" }, fecha: "2026-01-01", monto: 300, montoPagado: 100, pagos: [] },
      { id: "void", proveedor: { id: "p", nombre: "Proveedor" }, fecha: "2026-01-02", monto: 900, montoPagado: 0, estadoOperativo: "anulada", pagos: [] },
    ],
  });

  assert.deepEqual(statement.accounts.map((account) => account.id), ["void", "active"]);
  assert.equal(statement.accounts.find((account) => account.id === "void").status, "anulada");
  assert.equal(statement.summary.accountTotal, 300);
  assert.equal(statement.summary.grossBalance, 200);
});

test("la plantilla PDF escapa texto del proveedor y explica que pagos globales no se suman dos veces", () => {
  const html = construirHtmlEstadoCuentaPdf({
    provider: { name: "Proveedor <script>alert(1)</script>", taxId: "" },
    isFiltered: false,
    period: {},
    generatedAt: "2026-03-10T12:00:00.000Z",
    summary: { accountTotal: 0, paidToDate: 0, grossBalance: 0, creditBalance: 0 },
    accounts: [],
    movements: [],
  });

  assert.match(html, /Proveedor &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  assert.match(html, /no deben sumarse nuevamente/);
  assert.match(html, /@page \{ size: A4/);
});
