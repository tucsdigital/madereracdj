const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

test("settings devuelve IDs de sucursal y coordenadas numéricas para datos legacy", async () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../lib/settings.js"), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const location = { nombre: "Local", direccion: "Ruta 25", lat: "-34.45", lng: "-58.87", radio: "10000" };
  const module = { exports: {} };
  const mockRequire = (name) => {
    if (name === "@/lib/firebase") return { db: {} };
    if (name === "@/lib/shipping") {
      const shippingSource = fs.readFileSync(path.resolve(__dirname, "../lib/shipping.js"), "utf8");
      const shippingCompiled = ts.transpileModule(shippingSource, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
      const shippingModule = { exports: {} };
      new Function("require", "module", "exports", shippingCompiled)(require, shippingModule, shippingModule.exports);
      return shippingModule.exports;
    }
    if (name === "firebase/firestore") return {
      doc: () => ({}),
      getDoc: async () => ({ exists: () => true, data: () => ({ locations: [location, { ...location, id: 42 }] }) }),
    };
    return require(name);
  };
  new Function("require", "module", "exports", compiled)(mockRequire, module, module.exports);
  const { locations } = await module.exports.obtenerSettingsGeneral();
  assert.equal(locations[0].id, "store_1");
  assert.equal(locations[0].lat, -34.45);
  assert.equal(locations[0].radio, 10000);
  assert.equal(locations[1].id, "42");
});
