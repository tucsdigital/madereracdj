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
const t = load("@/lib/producto-tipos");
const pricing = load("@/lib/pricing");

const madera = { id: "m1", categoria: "Maderas", unidadMedida: "M2", alto: 0.14, largo: 3.05, precioPorPie: 2510, costo: 1500, stock: 200, tipoMadera: "Pino", imagenes: ["a.jpg"] };
const ferre = { id: "f1", categoria: "Ferretería", unidadMedida: "Unidad", valorVenta: 3000, precioVenta: 2000, valorCompra: 1500, costo: 1500, stock: 5, pack: "Caja x12", discount: { amount: 0, percentage: 0 } };
const combo = { id: "c1", categoria: "Combos", esCombo: true, tipoProducto: "combo", precioVenta: 25000, componentesCombo: [{ productoId: "m1", cantidad: 2 }] };
const formOf = (p, patch = {}, collection) => ({ ...t.productToForm(p, { collection }), ...patch });
const kindOf = (p, c) => t.getProductKind(p, c);

test("el tipo sale de la categoría y de la composición, y las obras tienen el suyo", () => {
  assert.equal(kindOf(madera), "madera");
  assert.equal(kindOf(ferre), "ferreteria");
  assert.equal(kindOf(combo), "combo");
  assert.equal(kindOf({ categoria: "Maderas", esCombo: true }), "combo");
  assert.equal(kindOf({ categoria: "Revestimientos" }), "general");
  assert.equal(kindOf({ categoria: "FERRETERÍA" }), "ferreteria");
  assert.equal(kindOf({ categoria: "Maderas" }, "productos_obras"), "obra");
});

test("cada tipo muestra solo las medidas que le corresponden, con su unidad", () => {
  const keys = (kind, unit) => t.getMeasureFields(kind, unit).map((f) => `${f.key}:${f.suffix}`);
  assert.deepEqual(keys("madera", "Pie"), ["largo:m", "ancho:pulg", "espesor:pulg"]);
  assert.deepEqual(keys("madera", "M2"), ["largo:m", "anchoUtil:m"]);
  assert.deepEqual(keys("madera", "ML"), ["largo:m"]);
  assert.deepEqual(keys("madera", "Unidad"), []);
  assert.deepEqual(keys("ferreteria", "M2"), []);
  assert.deepEqual(keys("combo", "Unidad"), []);
  assert.deepEqual(keys("general", "M2"), ["largo:m", "anchoUtil:m"]);
});

test("los nombres del precio dependen del tipo y de la unidad", () => {
  assert.equal(t.getPriceModel("madera", "Pie").label, "Precio por pie");
  assert.equal(t.getPriceModel("madera", "M2").label, "Precio por m²");
  assert.equal(t.getPriceModel("madera", "ML").label, "Precio por metro lineal");
  assert.equal(t.getPriceModel("madera", "Unidad").label, "Precio por unidad");
  assert.equal(t.getPriceModel("madera", "M2").field, "precioPorPie");
  for (const kind of ["ferreteria", "general", "combo"]) assert.equal(t.getPriceModel(kind, "Unidad").label, "Precio de venta");
  assert.equal(t.getPriceModel("ferreteria", "Unidad").field, "valorVenta");
});

test("ferretería: editar el precio unifica todos los campos de venta (la tienda toma el mayor)", () => {
  const form = formOf(ferre, { precio: "1800" });
  const u = t.buildProductUpdates({ producto: ferre, form, kind: "ferreteria" });
  assert.equal(u.valorVenta, 1800);
  assert.equal(u.precioVenta, 1800);
  const merged = { ...ferre, ...u };
  assert.equal(pricing.getPrecioVentaProducto(merged), 1800, "bajar el precio ya tiene efecto");
  assert.deepEqual(t.detectPriceConflict("ferreteria", ferre).map((v) => v.field).sort(), ["precioVenta", "valorVenta"]);
  assert.equal(t.detectPriceConflict("ferreteria", merged), null);
});

test("ferretería: el costo se guarda en costo y valorCompra; el pack es un número", () => {
  const form = formOf(ferre, { costo: "1700", pack: "12" });
  const u = t.buildProductUpdates({ producto: ferre, form, kind: "ferreteria" });
  assert.equal(u.costo, 1700);
  assert.equal(u.valorCompra, 1700);
  assert.equal(u.pack, "12");
  assert.equal(t.productToForm(ferre).pack, "");
  assert.equal(t.productToForm(ferre).packLegacy, "Caja x12");
  assert.match(t.validateProductForm({ ...form, pack: "Caja x12" }, { kind: "ferreteria" }).errors.pack, /número entero/);
});

test("madera: el precio editable es el precio por pie y recalcula la pieza con el motor de ventas", () => {
  const form = formOf(madera);
  assert.equal(form.precio, "2510");
  assert.equal(form.anchoUtil, "0.14");
  const u = t.buildProductUpdates({ producto: madera, form: { ...form, precio: "3000" }, kind: "madera" });
  assert.equal(u.precioPorPie, 3000);
  assert.equal(u.precioCalculado, Math.round(0.14 * 3.05 * 3000 / 100) * 100);
  assert.equal(u.precioVenta, undefined, "una madera no escribe precio de venta");
  assert.equal(pricing.calcularPreciosProducto({ ...madera, ...u }).precioUnitarioBase, u.precioCalculado);
});

test("madera por m²: el ancho útil se escribe donde lo leen ventas y la tienda, y no queda un espesor viejo", () => {
  const legacy = { ...madera, espesor: 18, ancho: 14 };
  const form = formOf(legacy, { anchoUtil: "0.15" });
  const u = t.buildProductUpdates({ producto: legacy, form, kind: "madera" });
  assert.equal(u.alto, 0.15);
  assert.equal(u.anchoUtil, 0.15);
  assert.equal(u.espesor, null);
  const merged = { ...legacy, ...u };
  const measure = load("@/lib/product-measure").getProductMeasure(merged);
  assert.equal(Math.round(measure.perPiece * 1e4) / 1e4, Math.round(0.15 * 3.05 * 1e4) / 1e4);
});

test("madera por pie: largo en metros, ancho y espesor en pulgadas; espesor y alto quedan iguales", () => {
  const pie = { categoria: "Maderas", unidadMedida: "pie", largo: 3, ancho: 4, alto: 2, precioPorPie: 1000 };
  const form = formOf(pie, { espesor: "2.5" });
  assert.equal(form.unidadMedida, "pie");
  const u = t.buildProductUpdates({ producto: pie, form, kind: "madera" });
  assert.equal(u.alto, 2.5);
  assert.equal(u.espesor, 2.5);
  assert.equal(u.unidadMedida, undefined, "conserva la unidad histórica 'pie'");
  assert.equal(t.computePiecePrice(form, "Pie"), pricing.calcularPreciosProducto({ ...pie, ...u }).precioUnitarioBase);
});

test("el material se guarda en tipoMaterial y tipoMadera para que no gane un valor viejo", () => {
  const u = t.buildProductUpdates({ producto: madera, form: formOf(madera, { tipoMaterial: "Eucalipto" }), kind: "madera" });
  assert.equal(u.tipoMaterial, "Eucalipto");
  assert.equal(u.tipoMadera, "Eucalipto");
});

test("combo: guarda el precio de venta y no pide medidas ni stock", () => {
  const form = formOf(combo, { precio: "27000" });
  const u = t.buildProductUpdates({ producto: combo, form, kind: "combo" });
  assert.equal(u.precioVenta, 27000);
  assert.equal("stock" in u, false);
  assert.equal("largo" in u, false);
  const v = t.validateProductForm({ ...form, descripcion: "<p>Combo</p>", codigo: "C-1", nombre: "Combo", deposito: "d1" }, { kind: "combo" });
  assert.equal(v.valid, true, JSON.stringify(v.errors));
});

test("validación: campos obligatorios por tipo, precio, medidas de maderas y descuento", () => {
  const base = { ...formOf(madera), codigo: 'M-1', nombre: 'Machimbre', descripcion: "<p>Machimbre</p>", subcategoria: "Machimbre", deposito: "d1" };
  assert.equal(t.validateProductForm(base, { kind: "madera" }).valid, true);
  const bad = t.validateProductForm({ ...base, precio: "", largo: "", anchoUtil: "0", nombre: " ", descripcion: "<p><br></p>" }, { kind: "madera" });
  for (const key of ["precio", "largo", "anchoUtil", "nombre", "descripcion"]) assert.ok(bad.errors[key], `falta error en ${key}`);
  assert.match(bad.errors.precio, /precio por m²/);
  const ferreForm = { ...formOf(ferre), descripcion: "<p>x</p>", subcategoria: "Tornillos", deposito: "d1", precio: "1000", costo: "1500" };
  assert.match(t.validateProductForm(ferreForm, { kind: "ferreteria" }).warnings.precio, /menor al costo/);
  assert.equal(t.validateProductForm({ ...ferreForm, discountMode: "percentage", discountValue: "120" }, { kind: "ferreteria" }).errors.discountValue.includes("100"), true);
  assert.ok(t.validateProductForm({ ...ferreForm, discountMode: "amount", discountValue: "1000" }, { kind: "ferreteria" }).errors.discountValue);
  assert.equal(t.validateProductForm({ ...ferreForm, precio: "", subcategoria: "" }, { kind: "ferreteria", blockPriceEdits: true }).errors.precio, undefined, "sin permiso de precios no se exige");
  assert.equal(t.validateProductForm({ ...ferreForm, largo: "" , unidadMedida: "M2"}, { kind: "ferreteria" }).errors.largo, undefined, "medidas opcionales fuera de maderas");
});

test("los usuarios sin permiso de precios no modifican precios ni costos", () => {
  const form = formOf(ferre, { precio: "1", costo: "1", nombre: "Otro nombre" });
  const u = t.buildProductUpdates({ producto: ferre, form, kind: "ferreteria", blockPriceEdits: true });
  assert.equal(u.nombre, "Otro nombre");
  for (const key of ["valorVenta", "precioVenta", "costo", "valorCompra", "precioPorPie"]) assert.equal(key in u, false, key);
});

test("sin cambios no se escribe nada y el contador de cambios cuenta solo lo modificado", () => {
  for (const p of [madera, ferre, combo]) {
    const kind = kindOf(p);
    assert.deepEqual(t.buildProductUpdates({ producto: p, form: t.productToForm(p), kind }), {}, kind);
  }
  const initial = t.productToForm(ferre);
  assert.deepEqual(t.diffForm(initial, { ...initial, nombre: "x", precio: "1", imagenes: ["z.jpg"] }).sort(), ["imagenes", "nombre", "precio"]);
  assert.deepEqual(t.diffForm(initial, initial), []);
});

test("descuento por monto o porcentaje, etiquetas e imágenes se guardan; vista previa del precio en la tienda", () => {
  const form = formOf(ferre, { precio: "3000", discountMode: "percentage", discountValue: "10", newArrival: true, imagenes: ["x.jpg", "y.jpg"] });
  const u = t.buildProductUpdates({ producto: ferre, form, kind: "ferreteria" });
  assert.deepEqual(u.discount, { amount: 0, percentage: 10 });
  assert.equal(u.newArrival, true);
  assert.deepEqual(u.imagenes, ["x.jpg", "y.jpg"]);
  const preview = t.previewStorePrice(form, "ferreteria");
  assert.deepEqual([preview.base, preview.final, preview.discounted], [3000, 2700, true]);
  const wood = t.previewStorePrice(formOf(madera), "madera");
  assert.equal(wood.base, pricing.calcularPreciosProducto(madera).precioUnitarioBase);
});

test("las asignaciones manuales de secciones se normalizan y guardan en el producto", () => {
  const product = { ...ferre, seccionesTiendaIncluidas: ["ofertas"], seccionesTiendaExcluidas: [] };
  const form = t.productToForm(product);
  assert.deepEqual(form.seccionesTiendaIncluidas, ["ofertas"]);
  assert.deepEqual(t.buildProductUpdates({
    producto: product,
    form: { ...form, seccionesTiendaIncluidas: ["ofertas", "destacados"], seccionesTiendaExcluidas: ["nuevos"] },
    kind: "ferreteria",
  }), {
    seccionesTiendaIncluidas: ["ofertas", "destacados"],
    seccionesTiendaExcluidas: ["nuevos"],
  });
  assert.deepEqual(t.productToForm({ ...product, seccionesTiendaIncluidas: ["ofertas", "ofertas", " "] }).seccionesTiendaIncluidas, ["ofertas"]);
});

test("unidades: sin duplicados por mayúsculas o tildes y la unidad de maderas conserva su forma histórica", () => {
  assert.deepEqual(t.uniqueOptions(["pie", "Pie", " Unidad", "unidad", "Caja", ""]), ["Caja", "pie", " Unidad".trim()].sort((a, b) => a.localeCompare(b, "es")));
  assert.equal(t.storedUnit("madera", "Pie", "pie"), "pie");
  assert.equal(t.storedUnit("madera", "M2", "pie"), "M2");
  assert.equal(t.storedUnit("combo", "M2", "pie"), "Unidad");
});

test("informe de precios distintos: lista los productos con valores de venta guardados que no coinciden", () => {
  const items = t.findPriceConflicts([ferre, { ...ferre, id: "f2", valorVenta: 500, precioVenta: 500 }, madera, combo]);
  assert.deepEqual(items.map((i) => i.id), ["f1"]);
  assert.equal(items[0].mayor, 3000);
});
