const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const configCache = {};
function loadRoute() {
  const mocks = {
    "@/lib/cors-publico": {
      jsonPublico: (body, init = {}, request) => ({ status: init.status || 200, body, headers: init.headers || {}, request }),
      preflightCorsPublico: () => ({ status: 204 }),
    },
    "@/lib/firebase-admin": {
      getAdminDb: () => ({
        collection: () => ({
          doc: () => ({ get: async () => ({ data: () => ({
            version: 8,
            published: {
              obrasInicio: {
                hero: { titleLine1: "Contenido actualizado" },
                workTypes: { items: [] },
              },
            },
          }) }) }),
        }),
      }),
    },
  };
  const load = (name) => {
    if (mocks[name]) return mocks[name];
    if (name === "@/lib/tienda-config") {
      if (!configCache[name]) {
        const source = fs.readFileSync(path.resolve(__dirname, "../lib/tienda-config.js"), "utf8");
        const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
        const module = { exports: {} };
        new Function("require", "module", "exports", output)(load, module, module.exports);
        configCache[name] = module.exports;
      }
      return configCache[name];
    }
    return require(name);
  };
  const source = fs.readFileSync(path.resolve(__dirname, "../app/api/tienda/contenido/route.js"), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", output)(load, module, module.exports);
  return module.exports;
}

test("la API pública de contenido devuelve la última publicación de Obras y prohíbe caché", async () => {
  const route = loadRoute();
  const response = await route.GET({ headers: { get: () => "https://maderascaballero.vercel.app" } });

  assert.equal(response.status, 200);
  assert.equal(response.body.version, 8);
  assert.equal(response.body.obrasInicio.hero.titleLine1, "Contenido actualizado");
  assert.deepEqual(response.body.obrasInicio.workTypes.items, []);
  assert.equal(response.headers["Cache-Control"], "no-store, max-age=0");
});
