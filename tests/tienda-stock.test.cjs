const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const cache = {};
function load(name) {
  if (!name.startsWith("@/")) return require(name);
  if (cache[name]) return cache[name].exports;
  const source = fs.readFileSync(path.resolve(__dirname, "..", name.slice(2) + ".js"), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const mod = { exports: {} };
  cache[name] = mod;
  new Function("require", "module", "exports", compiled)(load, mod, mod.exports);
  return mod.exports;
}
const S = load("@/lib/tienda-stock");
const config = load("@/lib/tienda-config");
const combos = load("@/lib/combos");
const { assertOrderAvailability } = load("@/lib/ecommerce-availability");

const tornillo = { id: "t1", nombre: "Tornillos", categoria: "Ferretería", subcategoria: "Tornillos", stock: 0 };
const madera = { id: "m1", nombre: "Machimbre", categoria: "Maderas", subcategoria: "Machimbre", stock: 10 };
const combo = { id: "c1", nombre: "Combo", categoria: "Combos", esCombo: true, tipoProducto: "combo", stock: 3, componentesCombo: [{ productoId: "m1", cantidad: 2 }] };

test("sin reglas activas se vende solo con stock y el aviso de stock bajo es el de siempre", () => {
  const p = S.resolveStockPolicy(tornillo, { activo: false, politica: "bajo_pedido" });
  assert.deepEqual([p.politica, p.tope, p.umbralBajo], ["solo_stock", 0, 5]);
  assert.equal(S.stockInfo(tornillo, null, 0).maxQuantity, 0);
  assert.equal(S.stockInfo(madera, null, 4).low, true);
});

test("pedido sin stock: tope, plazo y cantidad máxima comprable", () => {
  const cfg = { activo: true, politica: "bajo_pedido", tope: 12, plazo: "5 a 7 días" };
  const info = S.stockInfo(tornillo, cfg, 3);
  assert.deepEqual([info.politica, info.tope, info.plazo, info.maxQuantity], ["bajo_pedido", 12, "5 a 7 días", 15]);
  assert.deepEqual(S.publicStockPolicy(info), { backorder: true, cap: 12, leadTime: "5 a 7 días", lowThreshold: 5, showQuantity: true, label: "Bajo pedido" });
});

test("ocultar sin stock solo oculta con stock 0", () => {
  const cfg = { activo: true, politica: "ocultar" };
  assert.equal(S.stockInfo(tornillo, cfg, 0).hidden, true);
  assert.equal(S.stockInfo(tornillo, cfg, 2).hidden, false);
  assert.equal(S.stockInfo(tornillo, { activo: true, politica: "solo_stock" }, 0).hidden, false);
});

test("prioridad producto > subcategoría > categoría > general, campo por campo", () => {
  const cfg = {
    activo: true, politica: "solo_stock", tope: 20, plazo: "General", umbralBajo: 5,
    grupos: [{ categoria: "ferreteria", politica: "bajo_pedido", tope: 8 }, { categoria: "Ferretería", subcategoria: "Tornillos", plazo: "48 hs" }],
    productos: [{ id: "t1", umbralBajo: 1 }],
  };
  const p = S.resolveStockPolicy(tornillo, cfg);
  assert.deepEqual([p.politica, p.tope, p.plazo, p.umbralBajo, p.source], ["bajo_pedido", 8, "48 hs", 1, "categoria"]);
  const other = S.resolveStockPolicy({ ...tornillo, id: "x", subcategoria: "Clavos" }, cfg);
  assert.deepEqual([other.politica, other.tope, other.plazo, other.umbralBajo], ["bajo_pedido", 8, "General", 5]);
  const wood = S.resolveStockPolicy(madera, cfg);
  assert.deepEqual([wood.politica, wood.tope], ["solo_stock", 0]);
  const own = S.resolveStockPolicy(madera, { ...cfg, productos: [{ id: "m1", politica: "bajo_pedido" }] });
  assert.deepEqual([own.politica, own.tope, own.source], ["bajo_pedido", 20, "producto"]);
});

test("los combos nunca se venden sin stock", () => {
  const p = S.resolveStockPolicy(combo, { activo: true, politica: "bajo_pedido" });
  assert.deepEqual([p.politica, p.tope, p.combo], ["solo_stock", 0, true]);
});

test("normalización y validación de la configuración de stock", () => {
  const n = config.normalizeStock({ activo: true, politica: "x", tope: "99999", umbralBajo: "-3", etiqueta: "", grupos: [{ categoria: "A", politica: "ocultar", tope: "" }, { categoria: "a" }, { categoria: "" }], productos: [{ id: "p", tope: "7" }, { id: "p" }] });
  assert.deepEqual([n.politica, n.tope, n.umbralBajo, n.etiqueta], ["solo_stock", 9999, 0, ""]);
  assert.equal(n.grupos.length, 1);
  assert.equal(n.grupos[0].politica, "ocultar");
  assert.deepEqual(n.productos, [{ id: "p", politica: "", tope: 7, plazo: "", umbralBajo: "" }]);
  assert.equal(config.normalizeTiendaConfig({}).stock.activo, false);
  assert.ok(config.tiendaIssues({ stock: { tope: 0 } }).some((i) => i.scope === "stock"));
  assert.equal(config.tiendaIssues({ stock: { tope: "", plazo: "", umbralBajo: "", etiqueta: "" } }).some((i) => i.scope === "stock"), false);
  assert.equal(config.tiendaIssues({ stock: { tope: 5 } }).some((i) => i.scope === "stock"), false);
  assert.equal("stock" in config.publicTiendaConfig({ stock: { activo: true } }), false);
});

test("los campos globales vacíos desactivan su efecto y los ausentes conservan defaults históricos", () => {
  const normalized = config.normalizeStock({ activo: true, politica: "bajo_pedido", tope: "", plazo: "", umbralBajo: "", etiqueta: "" });
  assert.deepEqual([normalized.tope, normalized.plazo, normalized.umbralBajo, normalized.etiqueta], ["", "", "", ""]);
  assert.deepEqual(
    [config.normalizeStock({}).tope, config.normalizeStock({}).umbralBajo, config.normalizeStock({}).etiqueta],
    [20, 5, "Bajo pedido"]
  );

  const info = S.stockInfo(tornillo, normalized, 0);
  assert.deepEqual([info.tope, info.umbralBajo, info.etiqueta, info.low], [0, null, "", false]);
  assert.deepEqual(S.publicStockPolicy(info), { backorder: false, cap: 0, leadTime: "", lowThreshold: null, showQuantity: true, label: "" });
});

test("las unidades sin stock no descuentan ni reservan inventario", () => {
  const byId = new Map([["t1", tornillo], ["m1", madera]]);
  const { requiredById } = combos.collectInventoryRequirements({ lineItems: [{ id: "t1", cantidad: 5, cantidadSinStock: 5 }, { id: "m1", cantidad: 6, cantidadSinStock: 2 }], productoById: byId });
  assert.equal(requiredById.has("t1"), false);
  assert.equal(requiredById.get("m1"), 4);
});

function fakeDb() {
  const empty = { docs: [] };
  return {
    collection: () => ({ doc: () => ({ get: async () => ({ exists: false }) }), where: () => ({ get: async () => empty }) }),
  };
}
const policyFor = (cfg) => (p) => S.resolveStockPolicy(p, cfg);

test("disponibilidad: reparte entre stock y pedido sin stock respetando el tope", async () => {
  const cfg = { activo: true, politica: "bajo_pedido", tope: 10 };
  const products = () => new Map([["t1", { ...tornillo, stock: 3 }], ["m1", madera]]);
  const ok = await assertOrderAvailability(fakeDb(), [{ id: "t1", quantity: 8 }, { id: "m1", quantity: 4 }], products(), { policyFor: policyFor(cfg) });
  assert.deepEqual([ok.get("t1").sinStock, ok.get("m1").sinStock], [5, 0]);
  await assert.rejects(() => assertOrderAvailability(fakeDb(), [{ id: "t1", quantity: 14 }], products(), { policyFor: policyFor(cfg) }), /hasta 13 unidades/);
  await assert.rejects(() => assertOrderAvailability(fakeDb(), [{ id: "t1", quantity: 4 }], products(), { policyFor: policyFor({ activo: false }) }), /Stock insuficiente/);
  await assert.rejects(() => assertOrderAvailability(fakeDb(), [{ id: "t1", quantity: 4 }], products()), /Stock insuficiente/);
});

test("disponibilidad: los combos consumen primero y no admiten pedido sin stock", async () => {
  const cfg = { activo: true, politica: "bajo_pedido", tope: 10 };
  const products = () => new Map([["c1", combo], ["m1", { ...madera, stock: 5 }]]);
  // El combo usa 2 de madera por unidad: 2 combos consumen 4 y quedan 1 para la línea suelta.
  const ok = await assertOrderAvailability(fakeDb(), [{ id: "c1", quantity: 2 }, { id: "m1", quantity: 3 }], products(), { policyFor: policyFor(cfg) });
  assert.deepEqual([ok.get("c1").sinStock, ok.get("m1").sinStock], [0, 2]);
  await assert.rejects(() => assertOrderAvailability(fakeDb(), [{ id: "c1", quantity: 3 }], products(), { policyFor: policyFor(cfg) }), /Stock insuficiente/);
});
