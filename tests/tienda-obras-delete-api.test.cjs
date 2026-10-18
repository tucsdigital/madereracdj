const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

function setup() {
  const state = { project: { slug: "deck", version: 3, draft: { title: "Deck" }, published: { title: "Deck", status: "active" } }, history: [] };
  const mocks = {
    "next/server": { NextResponse: { json: (body, init = {}) => ({ status: init.status || 200, body }) } },
    "@/lib/firebase-admin": {
      verifyFirebaseToken: async (authorization) => {
        if (!authorization) throw Object.assign(new Error("Falta sesión"), { status: 401 });
        return { uid: "admin-1", email: "admin@example.com" };
      },
      getAdminDb: () => ({
        collection: (name) => ({
          doc: (id) => ({ collection: name, id }),
        }),
        runTransaction: async (callback) => callback({
          get: async (ref) => ({ exists: Boolean(state.project), data: () => state.project }),
          set: (ref, value) => state.history.push({ ref, value }),
          delete: (ref) => { state.project = null; },
        }),
      }),
    },
    "@/lib/tienda-media": { allowedImageHosts: () => [] },
    "@/lib/tienda-obras": {
      normalizeProject: (project) => project,
      OBRAS_COLLECTION: "obrasTienda",
      OBRAS_SLUG_PATTERN: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      projectIssues: () => [],
    },
  };
  const load = (name) => mocks[name] || require(name);
  const source = fs.readFileSync(path.resolve(__dirname, "../app/api/tienda/obras/admin/[slug]/route.js"), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", output)(load, module, module.exports);
  return { state, route: module.exports };
}

const request = (body, authorization = "Bearer token") => ({
  headers: { get: (name) => name === "authorization" ? authorization : null },
  json: async () => body,
});

test("eliminar obra activa guarda auditoría y elimina solo el documento publicado", async () => {
  const { state, route } = setup();
  const result = await route.DELETE(request({ baseVersion: 3 }), { params: { slug: "deck" } });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { slug: "deck", deleted: true });
  assert.equal(state.project, null);
  assert.equal(state.history.length, 1);
  assert.equal(state.history[0].value.tipo, "obra_eliminada");
  assert.equal(state.history[0].value.before.published.status, "active");
  assert.equal(state.history[0].value.after, null);
});

test("no elimina si la versión está obsoleta, el slug es inválido o falta autenticación", async () => {
  const { state, route } = setup();
  assert.equal((await route.DELETE(request({ baseVersion: 2 }), { params: { slug: "deck" } })).status, 409);
  assert.ok(state.project);
  assert.equal((await route.DELETE(request({ baseVersion: 3 }), { params: { slug: "../deck" } })).status, 400);
  assert.equal((await route.DELETE(request({ baseVersion: 3 }, null), { params: { slug: "deck" } })).status, 401);
  assert.ok(state.project);
});
