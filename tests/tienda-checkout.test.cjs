const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

function compile(file, load) {
  const source = fs.readFileSync(path.resolve(__dirname, "..", file), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const compiledModule = { exports: {} };
  new Function("require", "module", "exports", output)(load, compiledModule, compiledModule.exports);
  return compiledModule.exports;
}

test("el checkout usa el plazo publicado de reserva y conserva el default", async () => {
  let published = {};
  const load = (name) => {
    if (name === "@/lib/firebase-admin") return { getAdminDb: () => ({ collection: () => ({ doc: () => ({ get: async () => ({ data: () => ({ published, draft: { checkout: { reservaStockMercadoPagoMinutos: 30 } } }) }) }) }) }) };
    if (name === "@/lib/tienda-config") return compile("lib/tienda-config.js", load);
    return require(name);
  };
  const checkout = compile("lib/tienda-checkout.js", load);
  assert.equal((await checkout.getPublishedCheckoutSettings()).reservaStockMercadoPagoMinutos, 10);
  published = { checkout: { reservaStockMercadoPagoMinutos: 7 } };
  assert.equal((await checkout.getPublishedCheckoutSettings()).reservaStockMercadoPagoMinutos, 7);
});
