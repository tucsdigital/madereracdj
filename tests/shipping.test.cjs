const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const source = fs.readFileSync(path.resolve(__dirname, "../lib/shipping.js"), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const mod = { exports: {} };
new Function("require", "module", "exports", compiled)(require, mod, mod.exports);
const { computeShipping, priceForDistance, validateShippingConfig, normalizeShippingRules } = mod.exports;

const tiers = [{ km: 10, price: 10000 }, { km: 20, price: 20000 }];
const local = { id: "a", nombre: "A", lat: -34.6, lng: -58.4, radio: 25000 };
// ~11 km al este de la sucursal
const point = { lat: -34.6, lng: -58.4 + 0.12 };

test("sin reglas se comporta como antes: tramo por distancia y tope de 100 kg", () => {
  const result = computeShipping({ locations: [local], tiers, lat: point.lat, lng: point.lng, weightKg: 50 });
  assert.equal(result.status, "ok");
  assert.equal(result.price, 20000);
  assert.equal(computeShipping({ locations: [local], tiers, lat: point.lat, lng: point.lng, weightKg: 101 }).reason, "peso_excedido");
});

test("franjas de peso suman un adicional y excederlas pide cotización", () => {
  const rules = { weightBands: [{ upToKg: 50, extra: 0 }, { upToKg: 300, extra: 8000 }] };
  assert.equal(priceForDistance({ distanceKm: 5, tiers, rules, weightKg: 40 }).price, 10000);
  assert.equal(priceForDistance({ distanceKm: 5, tiers, rules, weightKg: 200 }).price, 18000);
  assert.equal(priceForDistance({ distanceKm: 5, tiers, rules, weightKg: 301 }).reason, "peso_excedido");
});

test("recargo porcentual, envío mínimo y envío gratis", () => {
  const rules = { fuelSurchargePct: 10, minFee: 12000, freeShippingMin: 100000 };
  const paid = priceForDistance({ distanceKm: 5, tiers, rules, weightKg: 10, subtotal: 50000 });
  assert.equal(paid.fuel, 1000);
  assert.equal(paid.price, 12000);
  assert.equal(paid.minimumApplied, true);
  const free = priceForDistance({ distanceKm: 5, tiers, rules, weightKg: 10, subtotal: 100000 });
  assert.equal(free.free, true);
  assert.equal(free.price, 0);
  assert.equal(free.listPrice, 12000);
});

test("el peso faltante usa la tarifa base si es opcional y cotiza si se exige", () => {
  const optional = priceForDistance({ distanceKm: 5, tiers, weightKg: null });
  assert.equal(optional.status, "ok");
  assert.equal(optional.price, 10000);
  assert.equal(optional.weightUnknown, true);
  assert.equal(priceForDistance({ distanceKm: 5, tiers, weightKg: null, rules: { requireWeightForShipping: true } }).reason, "peso_desconocido");
});

test("distancia sin tramo y fuera de radio piden cotización", () => {
  assert.equal(priceForDistance({ distanceKm: 50, tiers, weightKg: 10 }).reason, "sin_tarifa");
  const far = computeShipping({ locations: [{ ...local, radio: 5000 }], tiers, lat: point.lat, lng: point.lng, weightKg: 10 });
  assert.equal(far.reason, "fuera_de_zona");
  assert.equal(computeShipping({ locations: [], tiers, lat: 0, lng: 0, weightKg: 1 }).reason, "sin_sucursales");
  assert.equal(computeShipping({ locations: [local], tiers, lat: 999, lng: 0, weightKg: 1 }).status, "invalid");
});

test("elige entre las sucursales que cubren la dirección, no sólo la más cercana", () => {
  const near = { id: "near", nombre: "Cerca", lat: -34.6, lng: -58.45, radio: 1000 };
  const wide = { id: "wide", nombre: "Amplia", lat: -34.6, lng: -58.2, radio: 40000 };
  const result = computeShipping({ locations: [near, wide], tiers, lat: -34.6, lng: -58.4, weightKg: 10 });
  assert.equal(result.store.id, "wide");
  assert.equal(result.inRadius, true);
});

test("la validación rechaza reglas incoherentes y avisa de huecos de cobertura", () => {
  assert.ok(validateShippingConfig({ rules: { weightBands: [{ upToKg: 50, extra: 0 }, { upToKg: 40, extra: 0 }] } }).errors.length);
  assert.ok(validateShippingConfig({ rules: { fuelSurchargePct: 150 } }).errors.length);
  assert.ok(validateShippingConfig({ rules: { minFee: -1 } }).errors.length);
  assert.equal(validateShippingConfig({ tiers, locations: [local], rules: {} }).errors.length, 0);
  assert.ok(validateShippingConfig({ tiers, locations: [local], rules: {} }).warnings.some((w) => /última tarifa llega a/.test(w)));
  assert.equal(normalizeShippingRules(undefined).maxWeightKg, 100);
});
