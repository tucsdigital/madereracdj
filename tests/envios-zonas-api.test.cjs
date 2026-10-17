const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const cache = {};
function loadModule(file, mocks) {
  const load = (name) => {
    if (mocks[name]) return mocks[name];
    if (name === "@/lib/shipping") {
      if (!cache[name]) {
        const out = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, "../lib/shipping.js"), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
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
  const state = { doc: {}, history: [], writes: 0 };
  const shipping = loadModule("../lib/shipping.js", {});
  const mocks = {
    "next/server": { NextResponse },
    "@/lib/settings": {
      obtenerSettingsGeneral: async () => {
        const d = state.doc;
        return {
          locations: d.locations || [],
          shippingTiers: d.shippingTiers || [],
          shippingRules: shipping.normalizeShippingRules(d.shippingRules),
          data: d,
        };
      },
    },
    "@/lib/firebase-admin": {
      verifyFirebaseToken: async (h) => { if (!h) throw Object.assign(new Error("x"), { status: 401 }); return { uid: "u1", email: "admin@ejemplo.com" }; },
      getAdminDb: () => ({
        collection: (name) => ({
          add: async (item) => { state.history.push({ name, item }); },
          doc: () => ({ set: async (value) => { state.writes += 1; state.doc = { ...state.doc, ...value }; } }),
        }),
      }),
    },
  };
  return { state, route: loadModule("../app/api/envios/zonas/route.js", mocks) };
}
const req = (body, auth = "Bearer t") => ({ headers: { get: () => auth || null }, json: async () => body });
const store = { id: "a", nombre: "Central", direccion: "Calle 1", lat: -34.6, lng: -58.4, radio: 5000 };
const tiers = [{ km: 10, price: 10000 }, { km: 20, price: 20000 }];

test("sin nada guardado devuelve listas vacías, versión 0 y avisos en simple", async () => {
  const { route } = setup();
  const res = await route.GET();
  assert.equal(res.status, 200);
  assert.equal(res.body.version, 0);
  assert.deepEqual(res.body.locations, []);
  assert.match(res.body.warnings.join(" "), /Todavía no hay sucursales/);
});

test("guarda sucursales, tarifas y reglas juntas, con historial y versión", async () => {
  const { state, route } = setup();
  const res = await route.PUT(req({ locations: [{ ...store, lat: "-34.6", radio: "5000" }], shippingTiers: [{ km: "20", price: "20000" }, { km: "10", price: "10000" }], shippingRules: { freeShippingMin: "100000" }, baseVersion: 0 }));
  assert.equal(res.status, 200);
  assert.equal(res.body.version, 1);
  assert.deepEqual(res.body.shippingTiers.map((t) => t.km), [10, 20], "las tarifas se guardan ordenadas por km");
  assert.equal(res.body.shippingRules.freeShippingMin, 100000);
  assert.equal(state.doc.locations[0].lat, -34.6);
  assert.equal(state.history.length, 1);
  assert.equal(state.history[0].item.tipo, "envios");
  assert.equal(state.history[0].item.byEmail, "admin@ejemplo.com");
  assert.equal(res.body.savedBy, "admin@ejemplo.com");
});

test("guardar sin cambios reales no escribe ni suma versión", async () => {
  const { state, route } = setup();
  await route.PUT(req({ locations: [store], shippingTiers: tiers, baseVersion: 0 }));
  const writes = state.writes;
  const res = await route.PUT(req({ locations: [store], shippingTiers: [...tiers].reverse(), baseVersion: 1 }));
  assert.equal(res.status, 200);
  assert.equal(res.body.version, 1);
  assert.equal(state.writes, writes);
});

test("los datos incompletos no se guardan y se explican por campo", async () => {
  const { state, route } = setup();
  const res = await route.PUT(req({
    locations: [{ ...store, nombre: "", lat: "", lng: "" }],
    shippingTiers: [{ km: 10, price: 1 }, { km: 10, price: 2 }],
    shippingRules: { fuelSurchargePct: 150 },
  }));
  assert.equal(res.status, 400);
  const fields = res.body.issues.map((i) => `${i.scope}:${i.index}:${i.field}`);
  assert.ok(fields.includes("sucursales:0:nombre"));
  assert.ok(fields.includes("sucursales:0:direccion"));
  assert.ok(fields.includes("tarifas:1:km"));
  assert.ok(fields.includes("reglas:null:fuelSurchargePct"));
  assert.equal(state.writes, 0);
});

test("dos sucursales con el mismo identificador se rechazan", async () => {
  const { route } = setup();
  const res = await route.PUT(req({ locations: [store, { ...store, nombre: "Otra" }], shippingTiers: tiers }));
  assert.equal(res.status, 400);
  assert.match(res.body.errores.join(" "), /mismo identificador/);
});

test("si otra persona guardó antes, no se pisa su trabajo", async () => {
  const { state, route } = setup();
  assert.equal((await route.PUT(req({ locations: [store], shippingTiers: tiers, baseVersion: 0 }))).status, 200);
  const res = await route.PUT(req({ locations: [{ ...store, nombre: "Pisada" }], shippingTiers: tiers, baseVersion: 0 }));
  assert.equal(res.status, 409);
  assert.match(res.body.error, /Recargá/);
  assert.equal(state.doc.locations[0].nombre, "Central");
});

test("un bloque que no se envía se conserva", async () => {
  const { route } = setup();
  await route.PUT(req({ locations: [store], shippingTiers: tiers, shippingRules: { minFee: 5000 }, baseVersion: 0 }));
  const res = await route.PUT(req({ shippingRules: { minFee: 7000 }, baseVersion: 1 }));
  assert.equal(res.status, 200);
  assert.equal(res.body.locations.length, 1);
  assert.equal(res.body.shippingTiers.length, 2);
  assert.equal(res.body.shippingRules.minFee, 7000);
});

test("sin sesión no se puede modificar nada", async () => {
  const { state, route } = setup();
  const res = await route.PUT(req({ locations: [store] }, ""));
  assert.equal(res.status, 401);
  assert.equal(state.writes, 0);
});
