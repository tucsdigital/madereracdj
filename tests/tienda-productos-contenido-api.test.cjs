const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

function setup() {
  const state = { doc: null, history: [], writes: 0 };
  const cache = {};
  const mocks = {
    "next/server": { NextResponse: { json: (body, init = {}) => ({ status: init.status || 200, body }) } },
    "@/lib/firebase-admin": {
      verifyFirebaseToken: async (header) => {
        if (!header) throw Object.assign(new Error("Sin sesión"), { status: 401 });
        return { uid: "admin-1", email: "admin@example.com" };
      },
      getAdminDb: () => ({
        collection: (name) => ({ doc: (id) => ({ name, id: id || `history-${state.history.length}` }) }),
        runTransaction: async (callback) => callback({
          get: async () => ({ data: () => state.doc }),
          set: (ref, value, options) => {
            state.writes += 1;
            if (ref.name === "settings") state.doc = { ...(state.doc || {}), ...value };
            else state.history.push({ ref, value, options });
          },
        }),
      }),
    },
    "@/lib/tienda-media": { allowedImageHosts: () => ["media.example.com"] },
    "@/lib/tienda-productos-contenido-server": { invalidateProductContentCache() {} },
  };
  const load = (name) => {
    if (mocks[name]) return mocks[name];
    if (name === "@/lib/tienda-productos-contenido") {
      if (!cache[name]) {
        const source = fs.readFileSync(path.resolve(__dirname, "../lib/tienda-productos-contenido.js"), "utf8");
        const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
        const module = { exports: {} };
        new Function("require", "module", "exports", output)(load, module, module.exports);
        cache[name] = module.exports;
      }
      return cache[name];
    }
    return require(name);
  };
  const source = fs.readFileSync(path.resolve(__dirname, "../app/api/tienda/productos/contenido/admin/route.js"), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", output)(load, module, module.exports);
  return { state, route: module.exports };
}

const request = (body = {}, authorization = "Bearer token") => ({
  headers: { get: () => authorization || null },
  json: async () => body,
});

test("publica contenido con control de versión y auditoría, sin tocar el catálogo", async () => {
  const { state, route } = setup();
  const result = await route.PUT(request({ config: { global: { description: "Texto editorial" } }, baseVersion: 0 }));
  assert.equal(result.status, 200);
  assert.equal(result.body.version, 1);
  assert.equal(state.doc.published.global.description, "Texto editorial");
  assert.equal(state.history.length, 1);
  assert.equal(state.history[0].value.tipo, "tienda_productos_contenido");
  assert.equal(state.history[0].value.byEmail, "admin@example.com");
});

test("rechaza imágenes fuera de la biblioteca, versiones obsoletas y peticiones sin sesión", async () => {
  const { state, route } = setup();
  const invalid = await route.PUT(request({ config: { global: { images: [{ url: "https://attacker.example/pino.webp" }] } }, baseVersion: 0 }));
  assert.equal(invalid.status, 400);
  assert.ok(invalid.body.issues.length);
  assert.equal((await route.PUT(request({ config: { global: { description: "ok" } }, baseVersion: 0 }))).status, 200);
  assert.equal((await route.PUT(request({ config: { global: { description: "stale" } }, baseVersion: 0 }))).status, 409);
  assert.equal((await route.GET(request({}, ""))).status, 401);
  assert.equal(state.doc.published.global.description, "ok");
});
