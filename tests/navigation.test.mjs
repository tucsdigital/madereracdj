import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import * as phosphor from "@phosphor-icons/react/dist/ssr";
const require = createRequire(import.meta.url);
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function load(name, from = root) {
  if (name.startsWith("@phosphor-icons/react/dist/ssr")) return phosphor;
  if (!name.startsWith("@/") && !name.startsWith(".")) return require(name);
  const base = name.startsWith("@/") ? path.join(root, name.slice(2)) : path.resolve(from, name);
  const file = [base, `${base}.js`, `${base}.jsx`].find((f) => fs.existsSync(f) && fs.statSync(f).isFile());
  const out = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const mod = { exports: {} };
  new Function("require", "module", "exports", out)((n) => load(n, path.dirname(file)), mod, mod.exports);
  return mod.exports;
}
const { navigationItems, menusConfig } = load("@/config/menus");
const { isMenuActive } = load("@/lib/menu-location");

test("todos los menús comparten rutas existentes e iconos Phosphor únicos", () => {
  assert.deepEqual(menusConfig.mainNav, menusConfig.sidebarNav.modern);
  assert.deepEqual(menusConfig.mainNav, menusConfig.sidebarNav.classic.slice(1));
  const items = navigationItems.flatMap((i) => [i, ...(i.child || [])]);
  assert.equal(new Set(items.map((i) => i.id)).size, items.length);
  assert.equal(new Set(items.map((i) => i.icon)).size, items.length);
  for (const item of items) {
    const svg = renderToStaticMarkup(React.createElement(item.icon));
    assert.ok(svg.includes('<svg'), item.title);
    assert.ok(svg.includes('aria-hidden="true"'));
    if (item.href) {
      const base = path.join(root, "app/[lang]/(dashboard)");
      assert.ok([path.join(base, item.href, "page.jsx"), path.join(base, "(home)", item.href, "page.jsx")].some(fs.existsSync), item.href);
    }
  }
});

test("Envíos y Ecommerce abren rutas correctas sin doble estado activo", () => {
  const envios = navigationItems.find((i) => i.id === "envios");
  const ecommerce = navigationItems.find((i) => i.id === "ecommerce");
  assert.deepEqual(envios.child.map((i) => i.title), ["Lista", "Zona de cobertura"]);
  assert.deepEqual(ecommerce.child.map((i) => i.href), ["/ecommerce", "/tienda-web"]);
  for (const url of ["/envios/zonas", "/en/envios/zonas", "/ar/envios/zonas/"]) {
    assert.equal(isMenuActive(envios, url), true);
    assert.deepEqual(envios.child.map((i) => isMenuActive(i, url)), [false, true]);
  }
  assert.equal(isMenuActive(envios.child[0], "/en/envios/123"), true);
  assert.equal(isMenuActive(ecommerce, "/en/tienda-web"), true);
  assert.equal(isMenuActive(envios, "/en/envios-otro"), false);
});

test("filtra permisos de hijos, oculta grupos vacíos y respeta cobertura deshabilitada", () => {
  const previous = process.env.NEXT_PUBLIC_DELIVERY_ZONES_ENABLED;
  process.env.NEXT_PUBLIC_DELIVERY_ZONES_ENABLED = "false";
  const { filterMenusForUser } = load("@/lib/access-control");
  if (previous === undefined) delete process.env.NEXT_PUBLIC_DELIVERY_ZONES_ENABLED;
  else process.env.NEXT_PUBLIC_DELIVERY_ZONES_ENABLED = previous;
  const result = filterMenusForUser(navigationItems, { role: "operador" });
  assert.equal(result.find((i) => i.id === "envios").child.length, 1);
  const restricted = [{ title: "Grupo", child: [{ title: "Solo admin", href: "/admin", roles: ["admin"] }] }];
  assert.deepEqual(filterMenusForUser(restricted, { role: "operador" }), []);
  assert.equal(filterMenusForUser(restricted, { role: "admin" }).length, 1);
  assert.equal(navigationItems.find((i) => i.id === "envios").child.length, 2, "no muta la configuración");
});

test("menús dinámicos conservan iconos, submenús y orden habilitado", () => {
  const { generateMenusConfig } = load("@/lib/menus-dynamic");
  const result = generateMenusConfig([{ id: "ecommerce", order: 2 }, { id: "envios", order: 1 }, { id: "desconocido" }]);
  assert.deepEqual(result.mainNav.map((i) => i.id), ["envios", "ecommerce"]);
  assert.equal(result.mainNav[1].child[1].href, "/tienda-web");
  assert.equal(generateMenusConfig().mainNav.length, navigationItems.length);
});
