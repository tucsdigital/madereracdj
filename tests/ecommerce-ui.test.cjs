const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

const root = path.resolve(__dirname, "..");
const cache = {};
function load(name, from = root) {
  if (!name.startsWith("@/") && !name.startsWith(".")) return require(name);
  const base = name.startsWith("@/") ? path.join(root, name.slice(2)) : path.resolve(from, name);
  const file = [base, base + ".js", base + ".jsx", path.join(base, "index.js")].find((f) => fs.existsSync(f) && fs.statSync(f).isFile());
  if (!file) throw new Error("No se encontró " + name);
  if (cache[file]) return cache[file].exports;
  const source = fs.readFileSync(file, "utf8");
  const compiled = ts.transpileModule(source, { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, allowJs: true } }).outputText;
  const mod = { exports: {} };
  cache[file] = mod;
  new Function("require", "module", "exports", compiled)((n) => load(n, path.dirname(file)), mod, mod.exports);
  return mod.exports;
}

const Kpis = load("@/components/ecommerce/Kpis").default;
const VentasTable = load("@/components/ecommerce/VentasTable").default;
const Resumen = load("@/components/ecommerce/Resumen").default;
const P = load("@/lib/ecommerce-panel");
const VentaImportes = load("@/components/ecommerce/VentaImportes").default;
const html = (el) => renderToStaticMarkup(el);

const row = (id, extra = {}) => P.normalizeVenta(id, {
  numeroPedido: `VENTA-0${id}`, fechaCreacion: "2026-10-14T15:00:00.000Z", total: 12500, estadoPago: "pagado", formaPago: "mercadopago", tipoEnvio: "retiro_local",
  cliente: { nombre: "Ana Pérez", email: "ana@example.com" }, productos: [{ id: "p", nombre: "Machimbre de pino", cantidad: 3, precio: 4000 }, { id: "q", nombre: "Tornillos", cantidad: 1, precio: 500 }], ...extra,
});
const resumen = P.computeResumen({
  rows: [row("1"), row("2", { estadoPago: "pendiente", aReponer: true }), row("3", { fechaCreacion: "2026-10-13T15:00:00.000Z" })],
  prevRows: [row("0", { total: 10000 })], from: Date.UTC(2026, 9, 12, 3), to: Date.UTC(2026, 9, 16, 3), clientes: { total: 40, nuevos: 3 },
});

test("la tira de cifras muestra vendido, pedidos, ticket y clientes con variación", () => {
  const out = html(React.createElement(Kpis, { resumen, loading: false }));
  for (const text of ["Vendido", "$25.000", "Pedidos", "Ticket promedio", "$12.500", "Clientes", "40", "+3 en el período", "+150 %", "Por cobrar $12.500", "1 a reponer"]) assert.ok(out.includes(text), `falta "${text}" en: ${out.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")}`);
  assert.ok(html(React.createElement(Kpis, { resumen: null, loading: true })).includes("—"));
});

const noop = () => {};
const table = (items, overrides = {}) => html(React.createElement(VentasTable, {
  data: { items, total: items.length, pagina: 1, paginas: 1, limite: 25 }, loading: false,
  filters: { q: "", estado: "", pago: "", entrega: "", reponer: false }, onFilters: noop, sort: { key: "fecha", dir: "desc" }, onSort: noop, onPage: noop, onLimit: noop, onOpen: noop, onClear: noop, ...overrides,
}));

test("la tabla muestra las columnas, las filas y el estado de cada pedido", () => {
  const out = table([row("1"), row("2", { estadoPago: "pendiente", aReponer: true }), row("3", { anulada: true })]);
  for (const text of ["Pedido", "Fecha", "Cliente", "Productos", "Pago", "Estado", "Entrega", "Total", "VENTA-01", "Ana Pérez", "Machimbre de pino", "4 u. · +1 más", "Mercado Pago", "Pagado", "Pendiente", "A reponer", "Anulada", "Retiro", "$12.500", "1–3 de 3", "1 / 1"]) assert.ok(out.includes(text), `falta "${text}"`);
  assert.ok(out.includes('aria-label="Ordenar por Fecha"'));
  assert.ok(out.includes('aria-label="Filas por página"'));
});

test("la tabla vacía explica qué pasa y ofrece limpiar los filtros activos", () => {
  const out = table([], { filters: { q: "zzz", estado: "pagado", pago: "", entrega: "", reponer: true } });
  for (const text of ["No hay ventas para mostrar.", "Sin resultados", "“zzz”", "Pagado", "A reponer", "Limpiar"]) assert.ok(out.includes(text), `falta "${text}"`);
  assert.ok(table([], { loading: true }).includes("Cargando ventas…"));
});

test("el resumen muestra más vendidos, estados, pagos y entrega", () => {
  const out = html(React.createElement(Resumen, { resumen, loading: false }));
  for (const text of ["Ventas por día", "Más vendidos", "Machimbre de pino", "Forma de pago", "Mercado Pago", "Entrega", "Retiro", "Por cobrar", "Clientes nuevos", "Máximo $12.500"]) assert.ok(out.includes(text), `falta "${text}"`);
  assert.ok(html(React.createElement(Resumen, { resumen: P.computeResumen({ rows: [] }), loading: false })).includes("Sin ventas pagadas en el período."));
  assert.ok(html(React.createElement(Resumen, { resumen: null, loading: true })).includes("Cargando estadísticas…"));
});

test("preview y detalle comparten descuentos históricos y alertas sin inventar promociones", () => {
  const v = row("descuento", { subtotal: 12500, total: 11250, descuentoEfectivo: 1250, formaPago: "transferencia" });
  const preview = table([v]);
  assert.ok(preview.includes("Transferencia 10 %"));
  assert.ok(preview.includes("−$1.250"));
  const detail = html(React.createElement(VentaImportes, { venta: v }));
  assert.ok(detail.includes("Descuento transferencia (10 %)"));
  assert.ok(detail.includes("$11.250"));
  assert.ok(!detail.includes("Importes a revisar"));
  const old = row("vieja", { subtotal: 12500, total: 11250 });
  const oldDetail = html(React.createElement(VentaImportes, { venta: old }));
  assert.ok(oldDetail.includes("Diferencia sin conciliar"));
  assert.ok(oldDetail.includes("Sin descuento registrado"));
  assert.ok(table([old]).includes("Revisar importes"));
});
