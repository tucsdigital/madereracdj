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
const ui = load("@/lib/tienda-web-ui");
const cfg = load("@/lib/tienda-config");

test("el estado de un banner distingue visible, oculto, programado y vencido", () => {
  const now = Date.parse("2025-06-15T15:00:00Z");
  const base = { activo: true, desde: "", hasta: "" };
  assert.equal(ui.bannerEstado(base, now).key, "visible");
  assert.equal(ui.bannerEstado({ ...base, activo: false }, now).key, "oculto");
  assert.equal(ui.bannerEstado({ ...base, desde: "2025-07-01" }, now).key, "programado");
  assert.equal(ui.bannerEstado({ ...base, desde: "2025-07-01" }, now).label, "Desde el 01/07/25");
  assert.equal(ui.bannerEstado({ ...base, hasta: "2025-06-14" }, now).key, "vencido");
  assert.equal(ui.bannerEstado({ ...base, hasta: "2025-06-30" }, now).label, "Hasta el 30/06/25");
});

test("la fecha de hoy es la de Argentina, no la de UTC", () => {
  // 01:30 UTC del 16/06 todavía es 22:30 del 15/06 en Buenos Aires.
  assert.equal(cfg.todayAR(Date.parse("2025-06-16T01:30:00Z")), "2025-06-15");
  const view = cfg.publicTiendaConfig({ banners: [{ id: "b", titulo: "B", imagen: "/a.png", hasta: "2025-06-15" }] }, Date.parse("2025-06-16T01:30:00Z"));
  assert.equal(view.banners.length, 1, "un banner que vence hoy sigue visible hasta medianoche local");
});

test("los destinos se muestran con nombres legibles", () => {
  assert.equal(ui.destinoLabel("/shop"), "Toda la tienda");
  assert.equal(ui.destinoLabel("/shop?filter=specialOffer"), "Ofertas");
  assert.equal(ui.destinoLabel("/shop?category=Revestimientos"), "Categoría Revestimientos");
  assert.equal(ui.destinoLabel("/promo-especial"), "/promo-especial");
  assert.equal(ui.destinoSelect("/obras"), "/obras");
  assert.equal(ui.destinoSelect("/promo-especial"), "otro");
  assert.equal(ui.destinoLabel("/shop?madera=pino"), "Madera Pino");
  assert.equal(ui.destinoLabel("/shop?category=ferretería"), "Categoría Ferretería");
  assert.equal(ui.destinoLabel("/shop?category=Maderas%20Duras"), "Categoría Maderas Duras");
  assert.equal(ui.sameDestino("/shop?category=ferretería", "/shop?category=Ferreter%C3%ADa"), true);
  assert.equal(ui.sameDestino("/shop?category=a", "/shop?category=b"), false);
  assert.equal(ui.destinoSelect("/shop?madera=pino"), "/shop?madera=pino");
});

test("cada sección se resume en una frase simple", () => {
  const s = (regla, limite = 8) => ({ regla, limite });
  assert.equal(ui.reglaResumen(s({ tipo: "oferta" })), "Productos en oferta · hasta 8");
  assert.equal(ui.reglaResumen(s({ tipo: "categoria", valor: "Maderas" }, 4)), "Categoría Maderas · hasta 4");
  assert.equal(ui.reglaResumen(s({ tipo: "categoria", valor: "" })), "Una categoría sin elegir · hasta 8");
  assert.equal(ui.reglaResumen(s({ tipo: "descuento", minDescuento: 20 })), "Descuentos desde 20% · hasta 8");
  assert.equal(ui.reglaResumen(s({ tipo: "manual", productos: ["a"] })), "1 producto elegido · hasta 8");
  assert.equal(ui.reglaResumen(s({ tipo: "manual", productos: ["a", "b"] })), "2 productos elegidos · hasta 8");
});

test("reordenar mueve el elemento y renumera sin perder datos", () => {
  const items = [{ id: "a" }, { id: "b" }, { id: "c" }];
  assert.deepEqual(ui.moveItem(items, 0, 2).map((i) => i.id), ["b", "c", "a"]);
  assert.deepEqual(ui.moveItem(items, 2, 0).map((i) => i.id), ["c", "a", "b"]);
  assert.equal(ui.moveItem(items, 1, 1), items);
  assert.equal(ui.moveItem(items, 5, 0), items);
  assert.deepEqual(ui.renumber(ui.moveItem(items, 0, 2)).map((i) => i.orden), [1, 2, 3]);
});

test("las miniaturas usan la URL de la tienda para rutas propias y nunca http", () => {
  assert.equal(ui.previewUrl("https://media.ejemplo.com/a.webp", ""), "https://media.ejemplo.com/a.webp");
  assert.equal(ui.previewUrl("/images/a.png", "https://tienda.com/"), "https://tienda.com/images/a.png");
  assert.equal(ui.previewUrl("images/a.png", "https://tienda.com"), "https://tienda.com/images/a.png");
  assert.equal(ui.previewUrl("public/images/a.png", "https://tienda.com"), "https://tienda.com/images/a.png");
  assert.equal(ui.previewUrl("http://tienda.com/images/a.png", "https://tienda.com"), "https://tienda.com/images/a.png");
  assert.equal(ui.previewUrl("http://www.tienda.com/images/a.png", "https://tienda.com"), "https://www.tienda.com/images/a.png");
  assert.equal(ui.previewUrl("/images/a.png", ""), null);
  assert.equal(ui.previewUrl("http://inseguro.com/a.png", "https://tienda.com"), null);
  assert.equal(ui.previewUrl("", "https://tienda.com"), null);
});

test("los problemas indican el campo exacto de cada elemento", () => {
  const issues = cfg.tiendaIssues({
    banners: [{ id: "ok", titulo: "OK", enlace: "/shop", imagen: "/a.png" }, { id: "mal", titulo: "", enlace: "javascript:x", imagen: "", desde: "2025-05-10", hasta: "2025-05-01" }],
    secciones: [], categorias: [], contacto: { whatsapp: "12" },
  });
  const second = ui.issuesByField(issues, "banners", 1);
  assert.deepEqual(Object.keys(second).sort(), ["enlace", "fechas", "imagen", "titulo"]);
  assert.deepEqual(ui.issuesByField(issues, "banners", 0), {});
  assert.equal(ui.countIssues(issues, "banners"), 4);
  assert.equal(ui.countIssues(issues, "contacto"), 1);
  assert.equal(issues.find((i) => i.index === 1).id, "mal");
});

test("un elemento nuevo recién creado se puede detectar como incompleto pero no rompe", () => {
  const issues = cfg.tiendaIssues({ banners: [{ id: "n", titulo: "Nuevo banner", enlace: "/shop", imagen: "" }], secciones: [], categorias: [] });
  assert.equal(issues.length, 1);
  assert.match(issues[0].message, /falta la imagen/);
});
