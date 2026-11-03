const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const source = fs.readFileSync(path.resolve(__dirname, "../lib/obra-utils.js"), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const mod = { exports: {} };
const mockRequire = (name) => {
  if (name === "@/lib/fechas-locales") {
    return { formatearFechaLocal: () => "03 de noviembre de 2026" };
  }
  return require(name);
};
new Function("require", "module", "exports", compiled)(mockRequire, mod, mod.exports);

const { generarContenidoImpresion } = mod.exports;

test("la descripción del bloque aparece fuera del contenedor de totales oculto", () => {
  const descripcion = "INCLUYE <F.C.> & C EN CASO DE REQUERIRLO!";
  const html = generarContenidoImpresion(
    {
      id: "presupuesto-test",
      tipo: "presupuesto",
      numeroPedido: "PRES-003",
      fecha: "2026-11-03",
      cliente: { nombre: "Cliente de prueba" },
      bloques: [
        {
          id: "bloque-3",
          nombre: "Presupuesto 3",
          descripcion,
          productos: [
            {
              nombre: "Muelle",
              cantidad: 1,
              unidadMedida: "M2",
              alto: 1,
              largo: 2,
              precio: 1000,
              valorVenta: 500,
            },
          ],
        },
      ],
    },
    null,
    "presupuesto",
    [],
  );

  const descripcionIndex = html.indexOf('<div class="block-description">');
  const totalesOcultosIndex = html.indexOf('<div class="totals-section block-totals">');

  assert.notEqual(descripcionIndex, -1);
  assert.ok(descripcionIndex < totalesOcultosIndex);
  assert.ok(html.includes("INCLUYE &lt;F.C.&gt; &amp; C EN CASO DE REQUERIRLO!"));
  assert.ok(html.includes(".block-totals { display: none; }"));
});
