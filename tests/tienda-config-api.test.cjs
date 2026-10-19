const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const cache = {};
function loadModule(file, mocks) {
  const load = (name) => {
    if (mocks[name]) return mocks[name];
    if (name === "@/lib/tienda-config" || name === "@/lib/tienda-media") {
      if (!cache[name]) {
        const src = fs.readFileSync(path.resolve(__dirname, "..", `${name.slice(2)}.js`), "utf8");
        const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
        const m = { exports: {} };
        new Function("require", "module", "exports", out)(load, m, m.exports);
        cache[name] = m.exports;
      }
      return cache[name];
    }
    return require(name);
  };
  const out = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, file), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const m = { exports: {} };
  new Function("require", "module", "exports", out)(load, m, m.exports);
  return m.exports;
}
const NextResponse = { json: (body, init = {}) => ({ status: init.status || 200, body }) };

function setup() {
  const state = { doc: undefined, history: [], writes: 0 };
  const mocks = {
    "next/server": { NextResponse },
    "@/lib/tienda-precios-server": { invalidatePreciosCache() {} },
    "@/lib/firebase-admin": {
      verifyFirebaseToken: async (h) => { if (!h) throw Object.assign(new Error("x"), { status: 401 }); return { uid: "u1", email: "admin@ejemplo.com" }; },
      getAdminDb: () => ({
        collection: (name) => ({
          add: async (item) => { state.history.push({ name, item }); },
          doc: () => ({
            get: async () => ({ data: () => state.doc }),
            set: async (value) => { state.writes += 1; state.doc = { ...(state.doc || {}), ...value }; },
          }),
        }),
      }),
    },
  };
  process.env.R2_PUBLIC_BASE = "https://media.ejemplo.com";
  return { state, route: loadModule("../app/api/tienda/config/route.js", mocks) };
}
const req = (body, auth = "Bearer t") => ({ headers: { get: () => auth || null }, json: async () => body });

test("sin nada guardado devuelve los valores originales y versión 0", async () => {
  const { route } = setup();
  const res = await route.GET(req({}));
  assert.equal(res.status, 200);
  assert.equal(res.body.version, 0);
  assert.equal(res.body.config.banners.length, 3);
  assert.deepEqual(res.body.imageHosts, ["media.ejemplo.com"]);
});

test("guardar publica directamente: no hay borrador y queda historial", async () => {
  const { state, route } = setup();
  const current = (await route.GET(req({}))).body.config;
  const changed = { ...current, contacto: { ...current.contacto, whatsapp: "5491155550000" } };
  const res = await route.PUT(req({ config: changed, baseVersion: 0 }));
  assert.equal(res.status, 200);
  assert.equal(res.body.version, 1);
  assert.equal(state.doc.published.contacto.whatsapp, "5491155550000");
  assert.equal(state.doc.draft, null);
  assert.equal(state.history.length, 1);
  assert.equal(state.history[0].item.before.contacto.whatsapp, "541121781148");
  assert.equal(state.history[0].item.byEmail, "admin@ejemplo.com");
  assert.equal((await route.GET(req({}))).body.config.contacto.whatsapp, "5491155550000");
});

test("los cambios de Inicio de Obras se guardan y vuelven a cargarse desde la configuración publicada", async () => {
  const { state, route } = setup();
  const current = (await route.GET(req({}))).body.config;
  const banners = [
    { id: "banner-secundario", label: "Segundo", href: "/obras", image: "", mobileImage: "", alt: "" },
    { id: "banner-principal", label: "Primero", href: "/obras", image: "", mobileImage: "", alt: "" },
  ];
  const changed = {
    ...current,
    obrasInicio: {
      ...current.obrasInicio,
      hero: { ...current.obrasInicio.hero, titleLine1: "Obras vigentes", slides: banners },
      workTypes: { ...current.obrasInicio.workTypes, items: [] },
    },
  };

  const saved = await route.PUT(req({ config: changed, baseVersion: 0 }));
  assert.equal(saved.status, 200);
  assert.equal(saved.body.config.obrasInicio.hero.titleLine1, "Obras vigentes");
  assert.deepEqual(saved.body.config.obrasInicio.hero.slides.map((slide) => slide.id), ["banner-secundario", "banner-principal"]);
  assert.deepEqual(saved.body.config.obrasInicio.workTypes.items, []);
  assert.equal(state.doc.published.obrasInicio.hero.titleLine1, "Obras vigentes");

  const reloaded = await route.GET(req({}));
  assert.equal(reloaded.body.config.obrasInicio.hero.titleLine1, "Obras vigentes");
  assert.deepEqual(reloaded.body.config.obrasInicio.hero.slides.map((slide) => slide.id), ["banner-secundario", "banner-principal"]);
  assert.deepEqual(reloaded.body.config.obrasInicio.workTypes.items, []);
  assert.equal(reloaded.body.version, 1);
});

test("guardar sin cambios reales no escribe ni suma versión", async () => {
  const { state, route } = setup();
  const current = (await route.GET(req({}))).body.config;
  const res = await route.PUT(req({ config: current, baseVersion: 0 }));
  assert.equal(res.status, 200);
  assert.equal(res.body.version, 0);
  assert.equal(state.writes, 0);
  assert.equal(state.history.length, 0);
});

test("datos inválidos no se guardan y se explican campo por campo", async () => {
  const { state, route } = setup();
  const current = (await route.GET(req({}))).body.config;
  const bad = { ...current, banners: [{ ...current.banners[0], imagen: "https://evil.com/x.webp", enlace: "javascript:x" }] };
  const res = await route.PUT(req({ config: bad, baseVersion: 0 }));
  assert.equal(res.status, 400);
  assert.ok(res.body.issues.some((i) => i.scope === "banners" && i.field === "imagen"));
  assert.ok(res.body.issues.some((i) => i.field === "enlace"));
  assert.equal(state.writes, 0);
});

test("si otra persona guardó antes, no se pisa su trabajo", async () => {
  const { state, route } = setup();
  const current = (await route.GET(req({}))).body.config;
  const first = { ...current, contacto: { ...current.contacto, whatsapp: "5491100000001" } };
  assert.equal((await route.PUT(req({ config: first, baseVersion: 0 }))).status, 200);
  const stale = { ...current, contacto: { ...current.contacto, whatsapp: "5491100000002" } };
  const res = await route.PUT(req({ config: stale, baseVersion: 0 }));
  assert.equal(res.status, 409);
  assert.match(res.body.error, /Recargá/);
  assert.equal(state.doc.published.contacto.whatsapp, "5491100000001");
});

test("sin sesión no se lee ni se guarda", async () => {
  const { state, route } = setup();
  assert.equal((await route.GET(req({}, ""))).status, 401);
  assert.equal((await route.PUT(req({ config: {} }, ""))).status, 401);
  assert.equal(state.writes, 0);
});

test("un borrador viejo de la versión anterior no se muestra ni se publica", async () => {
  const { state, route } = setup();
  state.doc = { draft: { contacto: { whatsapp: "5490000000000" } }, published: undefined, version: 0 };
  assert.equal((await route.GET(req({}))).body.config.contacto.whatsapp, "541121781148");
});
