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
const P = load("@/lib/tienda-precios");
const pricing = load("@/lib/pricing");
const config = load("@/lib/tienda-config");

const ferre = { id: "f1", categoria: "Ferretería", subcategoria: "Tornillos", unidadMedida: "Unidad", valorVenta: 1000, precioVenta: 1000 };
const combo = { id: "c1", categoria: "Combos", esCombo: true, tipoProducto: "combo", precioVenta: 20000 };
const madera = { id: "m1", categoria: "Maderas", subcategoria: "Machimbre", unidadMedida: "M2", alto: 0.1, largo: 3, precioPorPie: 1000 };
const price = (p) => pricing.calcularPreciosProducto(pricing.normalizarProductoEntrada(p), { cantidad: 1, redondear: false }).precioUnitarioBase;
const priceR = (p) => pricing.calcularPreciosProducto(pricing.normalizarProductoEntrada(p), { cantidad: 1 }).precioUnitarioBase;

test("sin ajuste activo no cambia nada y el producto original no se modifica", () => {
  assert.equal(P.applyStorePricing(ferre, { activo: false, globalPct: 10 }), ferre);
  const out = P.applyStorePricing(ferre, { activo: true, globalPct: 10 });
  assert.equal(price(out), 1100);
  assert.equal(ferre.valorVenta, 1000);
});

test("porcentaje general positivo y negativo, con todos los campos de venta coherentes", () => {
  const up = P.applyStorePricing(ferre, { activo: true, globalPct: 15 });
  assert.equal(up.valorVenta, 1200, "1150 se redondea a $100");
  assert.equal(up.precioVenta, 1200);
  assert.equal(price(P.applyStorePricing(ferre, { activo: true, globalPct: -10 })), 900);
  assert.equal(price(P.applyStorePricing(combo, { activo: true, globalPct: 10 })), 22000);
});

test("redondeo del precio ajustado", () => {
  const p = { ...ferre, valorVenta: 1033, precioVenta: 1033 };
  assert.equal(P.applyStorePricing(p, { activo: true, globalPct: 10, redondeo: 100 }).valorVenta, 1100);
  assert.equal(P.applyStorePricing(p, { activo: true, globalPct: 10, redondeo: 1000 }).valorVenta, 1000);
});

test("prioridad: producto > subcategoría > categoría > general", () => {
  const precios = {
    activo: true, globalPct: 5,
    grupos: [{ categoria: "Ferreteria", pct: 10 }, { categoria: "ferretería", subcategoria: "Tornillos", pct: 20 }],
    productos: [],
  };
  assert.deepEqual(pick(P.resolveAdjustment(ferre, precios)), ["pct", 20, "subcategoria"]);
  assert.deepEqual(pick(P.resolveAdjustment({ ...ferre, subcategoria: "Clavos" }, precios)), ["pct", 10, "categoria"]);
  assert.deepEqual(pick(P.resolveAdjustment(combo, precios)), ["pct", 5, "global"]);
  const own = { ...precios, productos: [{ id: "f1", modo: "pct", valor: 30 }] };
  assert.deepEqual(pick(P.resolveAdjustment(ferre, own)), ["pct", 30, "producto"]);
  const none = { ...precios, productos: [{ id: "f1", modo: "ninguno" }] };
  assert.equal(P.resolveAdjustment(ferre, none).mode, "none");
  assert.equal(price(P.applyStorePricing(ferre, none)), 1000);
  function pick(a) { return [a.mode, a.pct, a.source]; }
});

test("precio fijo: en productos normales y en maderas por tarifa", () => {
  const fijo = (id, valor) => ({ activo: true, globalPct: 50, productos: [{ id, modo: "fijo", valor }] });
  assert.equal(price(P.applyStorePricing(ferre, fijo("f1", 1250))), 1250);
  assert.equal(priceR(P.applyStorePricing(ferre, fijo("f1", 1250))), 1300, "el sistema redondea a $100");
  assert.equal(price(P.applyStorePricing(combo, fijo("c1", 18500))), 18500);
  const wood = P.applyStorePricing(madera, fijo("m1", 400));
  assert.equal(priceR(wood), 400, "la pieza de madera queda en el precio fijo");
  assert.equal(P.resolveAdjustment(ferre, fijo("f1", 0)).mode, "none", "un precio fijo en 0 se ignora");
});

test("maderas: el porcentaje escala la tarifa y la pieza sigue el redondeo a $100", () => {
  assert.equal(priceR(madera), 300);
  const out = P.applyStorePricing(madera, { activo: true, globalPct: 10 });
  assert.equal(out.precioPorPie, 1100);
  assert.equal(priceR(out), 300, "330 se redondea a 300");
  const big = P.applyStorePricing({ ...madera, precioPorPie: 5000 }, { activo: true, globalPct: 10 });
  assert.equal(priceR(big), 1700);
});

test("información para el panel: original, tienda y diferencia", () => {
  const info = P.storePriceInfo(ferre, { activo: false, globalPct: 10 });
  assert.deepEqual([info.original, info.store], [1000, 1000]);
  const live = P.storePriceInfo(ferre, { activo: true, globalPct: 10 });
  assert.deepEqual([live.original, live.store, live.diff, Math.round(live.pct)], [1000, 1100, 100, 10]);
});

test("normalización: límites, duplicados y valores inválidos", () => {
  const n = P.normalizePrecios({ activo: true, globalPct: "1500", redondeo: 7, grupos: [{ categoria: "A", pct: "10,5" }, { categoria: "a", pct: 3 }, { categoria: "", pct: 9 }], productos: [{ id: "x", modo: "fijo", valor: "1.250,50" }, { id: "x", modo: "pct", valor: 1 }, { id: "", modo: "pct", valor: 3 }] });
  assert.equal(n.globalPct, P.PCT_MAX);
  assert.equal(n.redondeo, 100);
  assert.deepEqual(n.grupos, [{ categoria: "A", subcategoria: "", pct: 10.5 }]);
  assert.deepEqual(n.productos, [{ id: "x", modo: "fijo", valor: 1250.5 }]);
  assert.equal(P.normalizePrecios(null).activo, false);
  assert.equal(config.normalizeTiendaConfig({}).precios.activo, false);
  assert.ok(config.tiendaIssues({ precios: { productos: [{ id: "x", modo: "fijo", valor: 0 }] } }).some((i) => i.scope === "precios"));
});

test("la configuración pública no expone el ajuste de precios", () => {
  assert.equal("precios" in config.publicTiendaConfig({ precios: { activo: true, globalPct: 10 } }), false);
});

test("precio principal por tipo: bajar un campo tiene efecto y un valor de relleno no gana", () => {
  assert.equal(pricing.getPrecioVentaProducto({ categoria: "Ferretería", valorVenta: 800, precioVenta: 1200 }), 800);
  assert.equal(pricing.getPrecioVentaProducto({ categoria: "Ferretería", valorVenta: 1, precioVenta: 1200 }), 1200);
  assert.equal(pricing.getPrecioVentaProducto({ esCombo: true, categoria: "Combos", precioVenta: 500, valorVenta: 900 }), 500);
  assert.equal(pricing.getPrecioVentaProducto({ categoria: "Maderas", precioCalculado: 300, precioVenta: 900 }), 300);
  assert.equal(pricing.getPrecioVentaProducto({ categoria: "Ferretería" }), 0);
});

test("informe de precios distintos y resumen del historial", () => {
  const items = P.findSalePriceConflicts([ferre, { ...ferre, id: "f2", valorVenta: 48000, precioVenta: 51200 }, madera]);
  assert.deepEqual(items.map((i) => [i.id, i.current]), [["f2", 48000]]);
  const parts = P.describePreciosChange({ activo: false, globalPct: 0 }, { activo: true, globalPct: 10, grupos: [{ categoria: "A", pct: 5 }] });
  assert.deepEqual(parts, ["Ajuste activado", "General 0% → 10%", "Categorías: 0 → 1 reglas"]);
});
