const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const source = fs.readFileSync(path.resolve(__dirname, "../lib/obras-comisiones.js"), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const mod = { exports: {} };
const mockRequire = (name) => {
  if (name === "@/lib/obras-fechas") {
    return {
      getObraReferenceDate: (obra) => obra?.fechas?.inicio || obra?.fecha || obra?.fechaCreacion || "",
    };
  }
  return require(name);
};
new Function("require", "module", "exports", compiled)(mockRequire, mod, mod.exports);

const {
  OBRAS_COMMISSION_RATE,
  calcularTotalObra,
  esObraComisionable,
  esObraPendienteDeConfirmacion,
  getFechaComisionObra,
} = mod.exports;

test("una obra conserva el mes de comisión al pasar de ejecución a completada", () => {
  const obra = {
    tipo: "obra",
    estado: "en_ejecucion",
    fechas: { inicio: "2026-05-12" },
    fechaModificacion: "2026-06-03T14:00:00.000Z",
    fechaCompletada: "2026-06-03",
  };

  const fechaInicial = getFechaComisionObra(obra);
  obra.estado = "completada";

  assert.equal(fechaInicial, "2026-05-12");
  assert.equal(getFechaComisionObra(obra), "2026-05-12");
  assert.equal(esObraComisionable(obra), true);
});

test("solo confirma obras en ejecución o completadas y distingue las pendientes", () => {
  const enEspera = { tipo: "obra", estado: "pendiente_inicio", fechaCreacion: "2024-01-01" };
  const completada = { tipo: "obra", estado: "completada", fechaCreacion: "2024-01-01" };

  assert.equal(esObraComisionable(enEspera), false);
  assert.equal(esObraPendienteDeConfirmacion(enEspera), true);
  assert.equal(esObraPendienteDeConfirmacion(completada), false);
  assert.equal(esObraPendienteDeConfirmacion({ tipo: "producto", estado: "pendiente_inicio" }), false);
});

test("centraliza total y porcentaje de comisión de obras", () => {
  assert.equal(calcularTotalObra({ productosTotal: 100, materialesTotal: 80, descuentoTotal: 10 }), 170);
  assert.equal(OBRAS_COMMISSION_RATE, 2.5);
});
