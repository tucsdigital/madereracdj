const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const src = fs.readFileSync(path.resolve(__dirname, "../lib/ecommerce-panel.js"), "utf8");
const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const mod = { exports: {} };
new Function("require", "module", "exports", out)(require, mod, mod.exports);
const P = mod.exports;

// 15 de octubre de 2026, 12:00 en Argentina (15:00 UTC).
const NOW = Date.UTC(2026, 9, 15, 15, 0, 0);
const iso = (y, m, d, h = 12) => new Date(Date.UTC(y, m - 1, d, h + 3)).toISOString();
const venta = (id, extra = {}) => P.normalizeVenta(id, {
  numeroPedido: `VENTA-${id}`, fechaCreacion: iso(2026, 10, 14), total: 1000, subtotal: 1000, estadoPago: "pagado", formaPago: "transferencia", tipoEnvio: "retiro_local",
  cliente: { nombre: "Ana Pérez", email: "ana@example.com", telefono: "1122334455" },
  productos: [{ id: "p1", nombre: "Machimbre", cantidad: 2, precio: 500 }], ...extra,
});

test("normaliza una venta de ecommerce con sus estados, pago y entrega", () => {
  const v = venta("1", { formaPago: "mercadopago", tipoEnvio: "domicilio", costoEnvio: 300, direccionEnvio: "Calle 1", localidadEnvio: "Pilar", aReponer: true, productos: [{ id: "p1", nombre: "Tornillos", cantidad: 5, precio: 100, cantidadSinStock: 3 }] });
  assert.deepEqual([v.pago, v.entrega, v.estadoPago, v.anulada, v.aReponer, v.unidades, v.envio], ["mercadopago", "envio", "pagado", false, true, 5, 300]);
  assert.equal(v.productos[0].sinStock, 3);
  assert.equal(v.direccion, "Calle 1, Pilar");
  assert.equal(venta("2", { tipoEnvio: "cotizar" }).entrega, "cotizar");
  assert.equal(venta("3", { anulada: true }).anulada, true);
  assert.equal(venta("4", { estado: "anulada" }).anulada, true);
  assert.equal(venta("5", { estadoPago: "otro" }).estadoPago, "pendiente");
  assert.equal(P.normalizeVenta("abcdefghij", {}).numero, "cdefghij");
  assert.equal(P.normalizeVenta("x", { fechaCreacion: { toDate: () => new Date(iso(2026, 1, 2)) } }).fecha, iso(2026, 1, 2));
});

test("los períodos usan días de Argentina y el período anterior dura lo mismo", () => {
  const hoy = P.periodRange("hoy", {}, NOW);
  assert.equal(hoy.from, Date.UTC(2026, 9, 15, 3));
  assert.equal(hoy.to - hoy.from, 86400000);
  const sem = P.periodRange("7d", {}, NOW);
  assert.equal(sem.to - sem.from, 7 * 86400000);
  assert.deepEqual([sem.prev.to, sem.prev.to - sem.prev.from], [sem.from, 7 * 86400000]);
  assert.equal(P.periodRange("mes", {}, NOW).from, Date.UTC(2026, 9, 1, 3));
  assert.equal(P.periodRange("anio", {}, NOW).from, Date.UTC(2026, 0, 1, 3));
  const todo = P.periodRange("todo", {}, NOW);
  assert.deepEqual([todo.from, todo.prev], [null, null]);
  const custom = P.periodRange("custom", { desde: "2026-10-01", hasta: "2026-10-03" }, NOW);
  assert.equal(custom.to - custom.from, 3 * 86400000);
  assert.equal(P.periodRange("custom", { desde: "2026-10-05", hasta: "2026-10-01" }, NOW).to - P.periodRange("custom", { desde: "2026-10-05", hasta: "2026-10-01" }, NOW).from, 86400000);
  // Un pedido de las 23:30 de Argentina cuenta en su día, no en el siguiente UTC.
  const late = venta("l", { fechaCreacion: new Date(Date.UTC(2026, 9, 15, 2, 30)).toISOString() });
  assert.equal(P.dayKey(late.ms), "2026-10-14");
});

test("filtros: búsqueda sin tildes, estado, pago, entrega, a reponer y fechas", () => {
  const rows = [
    venta("1"),
    venta("2", { estadoPago: "pendiente", formaPago: "mercadopago", cliente: { nombre: "Luis Gómez", email: "luis@x.com" }, productos: [{ id: "p2", nombre: "Deck de pino", cantidad: 1, precio: 900 }] }),
    venta("3", { anulada: true, fechaCreacion: iso(2026, 9, 1) }),
    venta("4", { aReponer: true, tipoEnvio: "domicilio" }),
  ];
  const ids = (f) => P.filterVentas(rows, f).map((r) => r.id);
  assert.deepEqual(ids({}), ["1", "2", "4"]);
  assert.deepEqual(ids({ anuladas: true }), ["1", "2", "3", "4"]);
  assert.deepEqual(ids({ q: "gomez" }), ["2"]);
  assert.deepEqual(ids({ q: "deck pino" }), ["2"]);
  assert.deepEqual(ids({ q: "VENTA-4" }), ["4"]);
  assert.deepEqual(ids({ estadoPago: "pagado" }), ["1", "4"]);
  assert.deepEqual(ids({ estadoPago: "anulada" }), ["3"]);
  assert.deepEqual(ids({ pago: "mercadopago" }), ["2"]);
  assert.deepEqual(ids({ entrega: "envio" }), ["4"]);
  assert.deepEqual(ids({ reponer: true }), ["4"]);
  assert.deepEqual(ids({ from: Date.UTC(2026, 9, 10), to: Date.UTC(2026, 9, 20) }), ["1", "2", "4"]);
});

test("orden ascendente y descendente, y paginación con límite", () => {
  const rows = [venta("1", { total: 300, fechaCreacion: iso(2026, 10, 1) }), venta("2", { total: 100, fechaCreacion: iso(2026, 10, 3) }), venta("3", { total: 200, fechaCreacion: iso(2026, 10, 2) })];
  assert.deepEqual(P.sortVentas(rows, "fecha", "desc").map((r) => r.id), ["2", "3", "1"]);
  assert.deepEqual(P.sortVentas(rows, "fecha", "asc").map((r) => r.id), ["1", "3", "2"]);
  assert.deepEqual(P.sortVentas(rows, "total", "desc").map((r) => r.id), ["1", "3", "2"]);
  assert.deepEqual(P.sortVentas(rows, "numero", "asc").map((r) => r.id), ["1", "2", "3"]);
  assert.deepEqual(P.sortVentas(rows, "inventado", "asc").map((r) => r.id), ["1", "3", "2"]);
  const many = Array.from({ length: 23 }, (_, i) => venta(String(i)));
  const page = P.paginate(many, 3, 10);
  assert.deepEqual([page.items.length, page.total, page.pagina, page.paginas, page.limite], [3, 23, 3, 3, 10]);
  assert.equal(P.paginate(many, 99, 10).pagina, 3);
  assert.equal(P.paginate(many, 1, 7).limite, 25);
  assert.deepEqual([P.paginate([], 1, 25).paginas, P.paginate([], 1, 25).items.length], [1, 0]);
});

test("parseFilters ignora valores inválidos y usa 30 días por defecto", () => {
  const f = P.parseFilters(new URLSearchParams("estado=raro&pago=transferencia&orden=zzz&dir=asc&limite=500&reponer=1&q= hola "), NOW);
  assert.deepEqual([f.periodo, f.estadoPago, f.pago, f.orden, f.dir, f.limite, f.reponer, f.q], ["30d", "", "transferencia", "fecha", "asc", 500, true, "hola"]);
  assert.equal(P.paginate([], 1, f.limite).limite, 25);
});

test("estadísticas: vendido solo de pagados, ticket, por cobrar, anuladas, a reponer y variación", () => {
  const rows = [
    venta("1", { total: 1000 }),
    venta("2", { total: 3000, productos: [{ id: "p2", nombre: "Deck", cantidad: 3, precio: 1000 }] }),
    venta("3", { total: 500, estadoPago: "pendiente", aReponer: true }),
    venta("4", { total: 9999, anulada: true }),
  ];
  const prev = [venta("0", { total: 2000 })];
  const r = P.computeResumen({ rows, prevRows: prev, from: Date.UTC(2026, 9, 13, 3), to: Date.UTC(2026, 9, 16, 3), clientes: { total: 12, nuevos: 2 } });
  assert.deepEqual([r.vendido, r.pedidos, r.pagados, r.ticket, r.porCobrar, r.porCobrarPedidos, r.aReponer, r.anuladas], [4000, 3, 2, 2000, 500, 1, 1, 1]);
  assert.deepEqual(r.variacion, { vendido: 100, pedidos: 200, ticket: 0 });
  assert.deepEqual(r.clientes, { total: 12, nuevos: 2 });
  assert.deepEqual(r.topProductos.map((p) => [p.nombre, p.unidades]), [["Deck", 3], ["Machimbre", 4]].sort((a, b) => b[1] - a[1]));
  assert.equal(r.serie.length, 3);
  assert.deepEqual(r.serie.map((d) => d.total), [0, 4000, 0]);
  assert.deepEqual(r.pagos.map((p) => [p.value, p.pedidos]), [["mercadopago", 0], ["transferencia", 3]]);
  const vacio = P.computeResumen({ rows: [], from: null, to: null });
  assert.deepEqual([vacio.vendido, vacio.ticket, vacio.serie.length, vacio.variacion], [0, 0, 0, null]);
});

test("CSV listo para Excel y a prueba de fórmulas", () => {
  const csv = P.ventasCsv([venta("1", { cliente: { nombre: "=HYPERLINK(\"x\")", email: "a@b.com" }, productos: [{ nombre: "Tabla; 2\"", cantidad: 2, precio: 10 }] })]);
  assert.ok(csv.startsWith("\uFEFFPedido;Fecha;Cliente"));
  const line = csv.split("\r\n")[1];
  assert.ok(line.includes("\"'=HYPERLINK(\"\"x\"\")\""), line);
  assert.ok(line.includes("\"2 x Tabla; 2\"\"\""), line);
  assert.ok(line.includes(";Transferencia;Pagado;Retiro;"));
});

test("descuentos históricos: producto neto y pago no se duplican", () => {
  const v = venta("02094", { subtotal: 100, total: 81, descuentoTotal: 10, descuentos: 10, descuentoEfectivo: 9, formaPago: "efectivo", productos: [{ precio: 90, cantidad: 1 }] });
  assert.deepEqual([v.desc.producto, v.desc.pago, v.desc.total, v.desc.pctPago, v.desc.diferencia, v.desc.revisar], [10, 9, 19, 10, 0, false]);
  assert.equal(v.desc.pagoTipo, "Efectivo");
  const transferencia = venta("03014", { subtotal: 219800, total: 197820, descuentoEfectivo: 21980, productos: [{ precio: 219800, cantidad: 1 }] });
  assert.equal(transferencia.desc.pctPago, 10);
  assert.equal(transferencia.desc.revisar, false);
  assert.equal(venta("sin").desc.pago, 0, "transferencia no implica descuento automático");
});

test("diferencias históricas no se inventan como descuentos y permanecen visibles en anuladas", () => {
  const v = venta("02947", { subtotal: 1671710, total: 1504539, anulada: true, productos: [{ precio: 1671710, cantidad: 1 }] });
  assert.equal(v.desc.total, 0);
  assert.equal(v.desc.diferencia, -167171);
  assert.equal(v.desc.revisar, true);
  assert.equal(P.describeDescuentos(v.desc).length, 0);
  assert.ok(P.ventasCsv([v]).includes('-167171'));
});

test("descuentos por línea, envío, IVA y recargos concilian sin descontar el envío", () => {
  const v = venta("linea", { subtotal: 1000, descuentoTotal: 100, descuentoEfectivo: 90, costoEnvio: 200, ivaMonto: 170.1, transferenciaMonto: 81, total: 1261.1, productos: [{ precio: 500, cantidad: 2, descuento: 10 }] });
  assert.equal(v.productos[0].total, 900);
  assert.equal(v.desc.pctPago, 10);
  assert.equal(v.desc.diferencia, 0);
  assert.equal(v.desc.revisar, false);
  const monto = venta("monto", { subtotal: 1000, total: 900, productos: [{ precio: 500, cantidad: 2, descuentoMonto: 100 }] });
  assert.equal(monto.desc.producto, 100);
  assert.equal(monto.desc.revisar, false);
  assert.equal(venta("redondeo", { total: 1000.5 }).desc.revisar, false);
  assert.equal(venta("incoherente", { descuentoTotal: 100, descuentos: 200 }).desc.revisar, true);
});

test("filtros, CSV y estadísticas conservan descuentos confirmados de pagadas", () => {
  const paid = venta("p", { total: 900, descuentoEfectivo: 100 });
  const pending = venta("a", { total: 900, descuentoEfectivo: 100, estadoPago: "pendiente" });
  const canceled = venta("c", { total: 900, descuentoEfectivo: 100, anulada: true });
  const rows = [paid, pending, canceled, venta("s")];
  assert.equal(P.filterVentas(rows, { descuento: "pago" }).length, 2);
  assert.equal(P.filterVentas(rows, { descuento: "sin" }).length, 1);
  assert.equal(P.computeResumen({ rows }).descuentos.total, 100);
  const filters = P.parseFilters(new URLSearchParams("anuladas=1&descuento=pago"));
  assert.equal(filters.anuladas, true);
  assert.equal(filters.descuento, "pago");
  assert.ok(P.ventasCsv([paid]).includes("Desc. forma de pago"));
});
