const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const cache = {};
function load(name) {
  if (!name.startsWith("@/lib/")) return require(name);
  if (cache[name]) return cache[name];
  const file = path.resolve(__dirname, "..", `${name.slice(2)}.js`);
  const out = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const m = { exports: {} };
  cache[name] = m.exports;
  new Function("require", "module", "exports", out)(load, m, m.exports);
  cache[name] = m.exports;
  return m.exports;
}
const ui = load("@/lib/envios-ui");
const shipping = load("@/lib/shipping");

const local = { id: "a", nombre: "Central", direccion: "Calle 1", lat: -34.6, lng: -58.4, radio: 25000 };
const tiers = [{ km: 10, price: 10000 }, { km: 20, price: 20000 }];

test("el estado comparable ignora el orden de edición y el formato de los números", () => {
  const base = { locations: [local], tiers, rules: {} };
  const typed = {
    locations: [{ ...local, lat: "-34.6", radio: "25000" }],
    tiers: [{ km: "20", price: "20000" }, { km: "10", price: "10000.0" }],
    rules: { maxWeightKg: "100", weightBands: [], freeShippingMin: "0", minFee: "", fuelSurchargePct: "0" },
  };
  assert.equal(ui.snapshotOf(typed), ui.snapshotOf(base));
  assert.notEqual(ui.snapshotOf({ ...base, tiers: [{ km: 10, price: 11000 }, tiers[1]] }), ui.snapshotOf(base));
  assert.notEqual(ui.snapshotOf({ ...base, locations: [{ ...local, nombre: "Otra" }] }), ui.snapshotOf(base));
  assert.notEqual(ui.snapshotOf({ ...base, rules: { freeShippingMin: 50000 } }), ui.snapshotOf(base));
});

test("las distancias se muestran en km legibles", () => {
  assert.equal(ui.kmLabel(5), "5 km");
  assert.equal(ui.kmLabel(2.5), "2,5 km");
  assert.equal(ui.metersToKm(2500), 2.5);
  assert.equal(ui.kmToMeters("2,5".replace(",", ".")), 2500);
  assert.equal(ui.moneyAr(25000), "$25.000");
});

test("las tarifas se resumen en una frase y se ordenan", () => {
  assert.equal(ui.tarifasResumen([]), "Todavía no hay tarifas: todos los envíos se cotizan.");
  assert.equal(ui.tarifasResumen(tiers), "Cubre hasta 20 km · de $10.000 a $20.000");
  assert.equal(ui.tarifasResumen([{ km: "30", price: "5000" }]), "Cubre hasta 30 km · $5.000");
  assert.deepEqual(ui.sortTiers([{ km: "30" }, { km: "" }, { km: "10" }]).map((t) => t.km), ["10", "30", ""]);
  assert.deepEqual(ui.tierRanges([{ km: "20", price: "2" }, { km: "10", price: "1" }, { km: "", price: "9" }]), [
    { fromKm: 0, toKm: 10, price: 1 }, { fromKm: 10, toKm: 20, price: 2 },
  ]);
});

test("el mapa explica la cobertura de una dirección con palabras simples", () => {
  const near = shipping.computeShipping({ locations: [local], tiers, lat: -34.6, lng: -58.28, weightKg: 1 });
  const ok = ui.coverageMessage(near);
  assert.equal(ok.tone, "ok");
  assert.match(ok.detail, /Central · a 1\d(,\d)? km · envío desde \$20\.000/);
  const free = ui.coverageMessage(shipping.computeShipping({ locations: [local], tiers, rules: { freeShippingMin: 100 }, lat: -34.6, lng: -58.28, weightKg: 1, subtotal: 500 }));
  assert.match(free.detail, /envío gratis/);
  const far = ui.coverageMessage(shipping.computeShipping({ locations: [{ ...local, radio: 1000 }], tiers, lat: -34.6, lng: -58.28, weightKg: 1 }));
  assert.equal(far.tone, "bad");
  assert.match(far.title, /Fuera de la zona/);
  const gap = ui.coverageMessage(shipping.computeShipping({ locations: [local], tiers: [{ km: 5, price: 1 }], lat: -34.6, lng: -58.28, weightKg: 1 }));
  assert.match(gap.title, /Sin tarifa/);
  assert.match(ui.coverageMessage(shipping.computeShipping({ locations: [], tiers, lat: 0, lng: 0, weightKg: 1 })).title, /Agregá una sucursal/);
  assert.equal(ui.coverageMessage(null), null);
});

test("el desglose del probador se explica línea por línea", () => {
  const rules = { weightBands: [{ upToKg: 50, extra: 0 }, { upToKg: 300, extra: 8000 }], fuelSurchargePct: 10, minFee: 0, freeShippingMin: 0 };
  const result = shipping.priceForDistance({ distanceKm: 5, tiers, rules, weightKg: 200, subtotal: 0 });
  const quote = ui.describeQuote(result, rules);
  assert.equal(quote.total, 19800);
  assert.equal(quote.title, "$19.800");
  assert.deepEqual(quote.lines.map((l) => l.value), ["$10.000", "+ $8.000", "+ $1.800"]);
  assert.match(quote.lines[1].label, /hasta 300 kg/);
  const heavy = ui.describeQuote(shipping.priceForDistance({ distanceKm: 5, tiers, rules, weightKg: 400 }), rules);
  assert.equal(heavy.quote, true);
  assert.match(heavy.note, /supera el máximo para envío \(300 kg\)/);
  const free = ui.describeQuote(shipping.priceForDistance({ distanceKm: 5, tiers, rules: { freeShippingMin: 1000 }, weightKg: 1, subtotal: 2000 }), { freeShippingMin: 1000 });
  assert.equal(free.title, "Envío gratis");
  assert.match(free.note, /sin la gratuidad costaría \$10\.000/);
  assert.equal(ui.describeQuote(null, {}), null);
});

test("los problemas se ubican por sucursal, tramo y regla", () => {
  const issues = shipping.shippingIssues({
    locations: [local, { id: "b", nombre: "", direccion: "", lat: "", lng: "", radio: 0 }, { id: "c", nombre: "Sin mapa", direccion: "Calle", lat: "", lng: "", radio: 1000 }],
    tiers: [{ km: 10, price: 5 }, { km: 10, price: 6 }, { km: "", price: "" }],
    rules: { fuelSurchargePct: 150, weightBands: [{ upToKg: 50, extra: 0 }, { upToKg: 40, extra: -1 }] },
  });
  assert.deepEqual(Object.keys(ui.issuesByField(issues, "sucursales", 0)), []);
  assert.deepEqual(Object.keys(ui.issuesByField(issues, "sucursales", 1)).sort(), ["direccion", "nombre", "radio"]);
  assert.match(ui.issuesByField(issues, "sucursales", 2).direccion, /elegí una dirección de la lista/);
  assert.match(ui.issuesByField(issues, "tarifas", 1).km, /ya hay otro tramo hasta 10 km/);
  assert.deepEqual(Object.keys(ui.issuesByField(issues, "tarifas", 2)).sort(), ["km", "price"]);
  assert.deepEqual(Object.keys(ui.issuesByField(issues, "reglas", 1)).sort(), ["extra", "upToKg"]);
  assert.equal(ui.countIssues(issues, "reglas"), 3);
  assert.ok(issues.some((i) => i.scope === "reglas" && i.field === "fuelSurchargePct" && i.index === null));
});

test("dentro del campo los mensajes van sin el nombre del elemento", () => {
  const issues = shipping.shippingIssues({
    locations: [{ id: "b", nombre: "", direccion: "", lat: "", lng: "", radio: 0 }, { id: "c", nombre: "Central", direccion: "x", lat: "", lng: "", radio: 1000 }],
    tiers: [{ km: "", price: 5 }],
    rules: { weightBands: [{ upToKg: 0, extra: 0 }] },
  });
  assert.equal(ui.inlineIssues(issues, "sucursales", 0).nombre, "Poné un nombre.");
  assert.match(ui.inlineIssues(issues, "sucursales", 1).direccion, /^Elegí una dirección de la lista/);
  assert.equal(ui.inlineIssues(issues, "tarifas", 0).km, "Indicá hasta cuántos km llega.");
  assert.match(ui.inlineIssues(issues, "reglas", 0).upToKg, /^El límite debe ser mayor a 0/);
  assert.match(ui.issuesByField(issues, "sucursales", 0).nombre, /^Sucursal #1: /, "la lista general sí conserva el nombre");
});

test("una configuración válida no tiene problemas y los avisos hablan en simple", () => {
  assert.deepEqual(shipping.shippingIssues({ locations: [local], tiers, rules: {} }), []);
  const { warnings } = shipping.validateShippingConfig({ locations: [local], tiers: [{ km: 5, price: 1 }], rules: {} });
  assert.match(warnings[0], /Central cubre hasta 25 km, pero la última tarifa llega a 5 km/);
  assert.match(shipping.validateShippingConfig({ locations: [local], tiers: [], rules: {} }).warnings[0], /Todavía no hay tarifas/);
  assert.match(shipping.validateShippingConfig({ locations: [], tiers, rules: {} }).warnings[0], /Todavía no hay sucursales/);
});
