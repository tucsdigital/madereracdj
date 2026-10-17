const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

// Ejecuta el motor real con un adaptador transaccional en memoria, sin credenciales.
function fixture() {
  let sequence = 0;
  const data = new Map([["productos/pino", { nombre: "Pino", stock: 10, costo: 100 }]]);
  const snapshot = (ref) => ({ id: ref.id, ref, exists: data.has(ref.path), data: () => structuredClone(data.get(ref.path)) });
  function collection(name, filters = []) {
    return {
      doc(id = `auto${++sequence}`) { const ref = { id, path: `${name}/${id}` }; ref.get = async () => snapshot(ref); return ref; },
      where(field, op, value) { return collection(name, [...filters, [field, op, value]]); },
      orderBy() { return this; }, limit() { return this; },
      async get() {
        const docs = [...data.keys()].filter((key) => key.startsWith(`${name}/`)).map((key) => snapshot({ id: key.split("/")[1], path: key })).filter((doc) => filters.every(([field, op, value]) => {
          const actual = doc.data()[field];
          if (op === "==") return actual === value;
          if (op === "in") return value.includes(actual);
          if (op === "array-contains-any") return (actual || []).some((v) => value.includes(v));
          throw new Error(`Operador no implementado: ${op}`);
        }));
        return { docs, empty: !docs.length, size: docs.length };
      },
    };
  }
  const db = {
    collection,
    async runTransaction(fn) {
      const writes = [];
      let writing = false;
      const result = await fn({
        async get(ref) { assert.equal(writing, false, "Firestore no permite lecturas después de escrituras"); return ref.path ? snapshot(ref) : ref.get(); },
        set(ref, value, options) { writing = true; writes.push(() => data.set(ref.path, options?.merge ? { ...data.get(ref.path), ...value } : value)); },
        update(ref, value) { writing = true; writes.push(() => { assert.ok(data.has(ref.path)); data.set(ref.path, { ...data.get(ref.path), ...value }); }); },
        delete(ref) { writing = true; writes.push(() => data.delete(ref.path)); },
      });
      writes.forEach((write) => write());
      return result;
    },
  };
  const cache = {};
  function load(name) {
    if (name === "@/lib/firebase-admin") return { getAdminDb: () => db };
    if (name === "@/lib/settings") return { obtenerSettingsGeneral: async () => ({
      locations: [{ id: "local", nombre: "Local", lat: -34, lng: -58, radio: 10000 }],
      shippingTiers: [{ km: 10, price: 500 }], data: { transferenciaDescuentoPct: 10 },
    }) };
    if (name === "firebase-admin/firestore") return { FieldValue: { serverTimestamp: () => new Date().toISOString() } };
    if (!name.startsWith("@/")) return require(name);
    if (cache[name]) return cache[name].exports;
    const filename = path.resolve(__dirname, "..", name.slice(2) + ".js");
    const source = fs.readFileSync(filename, "utf8");
    const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
    const module = { exports: {} }; cache[name] = module;
    new Function("require", "module", "exports", compiled)(load, module, module.exports);
    return module.exports;
  }
  return { data, engine: load("@/lib/erp/ventas-engine"), quote: load("@/lib/ecommerce-quote").quoteOrder };
}
const actor = { uid: "test", email: "test@example.com" };
function sale(overrides = {}) {
  return { ecommerceLifecycle: true, idExterno: "pedido-test", idempotencyKey: "pedido-test",
    total: 2000, estadoPago: "pendiente", tipoEnvio: "retiro_local", productos: [{ id: "pino", nombre: "Pino", cantidad: 2, precio: 1000 }],
    reservaExpiresAt: new Date(Date.now() + 1800000).toISOString(), ...overrides };
}
test("pedido pendiente reserva sin descontar; pago descuenta una sola vez", async () => {
  const { data, engine } = fixture();
  const created = await engine.createVentaEngine({ actor, ventaData: sale() });
  assert.equal(data.get("productos/pino").stock, 10);
  assert.equal(data.get(`reservasStock/${created.id}_pino`).estado, "activa");
  const duplicate = await engine.createVentaEngine({ actor, ventaData: sale() });
  assert.equal(duplicate.id, created.id);
  let venta = data.get(`ventas/${created.id}`);
  await engine.updateVentaEngine({ actor, ventaId: created.id, ventaData: { ...venta, montoAbonado: 2000 } });
  assert.equal(data.get("productos/pino").stock, 8);
  assert.equal(data.get(`reservasStock/${created.id}_pino`).estado, "consumida");
  venta = data.get(`ventas/${created.id}`);
  await engine.updateVentaEngine({ actor, ventaId: created.id, ventaData: venta });
  assert.equal(data.get("productos/pino").stock, 8);
  assert.equal(data.get("orders/pedido-test").status, "success");
});
test("anular un pedido pendiente libera reserva sin sumar stock", async () => {
  const { data, engine } = fixture();
  const created = await engine.createVentaEngine({ actor, ventaData: sale() });
  await engine.anularVentaEngine({ actor, ventaId: created.id, motivo: "Cancelado" });
  assert.equal(data.get("productos/pino").stock, 10);
  assert.equal(data.get(`reservasStock/${created.id}_pino`).estado, "liberada");
});
test("reservas de otros pedidos impiden sobreventa; vencidas y liberadas no bloquean", async () => {
  const { data, engine } = fixture();
  data.set("reservasStock/otro", { productoId: "pino", cantidad: 9, estado: "activa", expiresAt: new Date(Date.now() + 60000).toISOString() });
  await assert.rejects(engine.createVentaEngine({ actor, ventaData: sale() }), /Stock insuficiente/);
  assert.equal(data.get("productos/pino").stock, 10);
  data.get("reservasStock/otro").estado = "liberada";
  await engine.createVentaEngine({ actor, ventaData: sale() });
});
test("una reserva vencida no bloquea otro pedido", async () => {
  const { data, engine } = fixture();
  data.set("reservasStock/vencida", { productoId: "pino", cantidad: 10, estado: "activa", expiresAt: new Date(Date.now() - 1).toISOString() });
  await engine.createVentaEngine({ actor, ventaData: sale() });
  assert.equal(data.get("productos/pino").stock, 10);
});
test("una venta de mostrador respeta las reservas de tienda", async () => {
  const { data, engine } = fixture();
  data.set("reservasStock/tienda", { productoId: "pino", cantidad: 9, estado: "activa", expiresAt: new Date(Date.now() + 60000).toISOString() });
  await assert.rejects(engine.createVentaEngine({ actor, ventaData: sale({ ecommerceLifecycle: false }) }), /Stock insuficiente/);
  assert.equal(data.get("productos/pino").stock, 10);
});
test("anular una venta pagada repone una sola vez", async () => {
  const { data, engine } = fixture();
  const created = await engine.createVentaEngine({ actor, ventaData: sale() });
  const venta = data.get(`ventas/${created.id}`);
  await engine.updateVentaEngine({ actor, ventaId: created.id, ventaData: { ...venta, montoAbonado: 2000 } });
  await engine.anularVentaEngine({ actor, ventaId: created.id, motivo: "Cancelado" });
  await engine.anularVentaEngine({ actor, ventaId: created.id, motivo: "Cancelado" });
  assert.equal(data.get("productos/pino").stock, 10);
});
test("un combo reserva sus componentes y los consume al confirmar", async () => {
  const { data, engine } = fixture();
  data.set("productos/combo", { nombre: "Combo", tipoProducto: "combo", esCombo: true, componentesCombo: [{ productoId: "pino", cantidad: 3 }] });
  const created = await engine.createVentaEngine({ actor, ventaData: sale({ productos: [{ id: "combo", nombre: "Combo", cantidad: 2, precio: 1000 }] }) });
  assert.equal(data.get(`reservasStock/${created.id}_pino`).cantidad, 6);
  assert.equal(data.get("productos/pino").stock, 10);
  await engine.updateVentaEngine({ actor, ventaId: created.id, ventaData: { ...data.get(`ventas/${created.id}`), montoAbonado: 2000 } });
  assert.equal(data.get("productos/pino").stock, 4);
});
test("cotización ignora precios manipulados y toma descuentos del sistema", async () => {
  const { data, quote } = fixture();
  data.set("productos/pino", { nombre: "Pino", stock: 10, estadoTienda: "Activo", valorVenta: 1000, discount: { percentage: 10 } });
  const result = await quote({ items: [{ id: "pino", quantity: 2, price: 1 }], paymentMethod: "transferencia", deliveryInfo: { metodoEntrega: "retiro", shippingPrice: -1000 } });
  assert.equal(result.pricing.subtotal, 2000);
  assert.equal(result.pricing.productDiscounts, 200);
  assert.equal(result.pricing.transferDiscount, 180);
  assert.equal(result.total, 1620);
});
test("cotización rechaza productos inactivos, cantidades negativas y packs incompletos", async () => {
  const { data, quote } = fixture();
  const input = { items: [{ id: "pino", quantity: 2 }], deliveryInfo: { metodoEntrega: "retiro" } };
  await assert.rejects(quote(input), /disponible/);
  data.set("productos/pino", { nombre: "Pino", stock: 10, estadoTienda: "Activo", valorVenta: 1000, pack: 3 });
  await assert.rejects(quote(input), /cantidad/);
  await assert.rejects(quote({ ...input, items: [{ id: "pino", quantity: -3 }] }), /cantidad/);
  assert.equal((await quote({ ...input, items: [{ id: "pino", quantity: 3 }] })).total, 3000);
});
test("envío sin peso conocido requiere cotización en lugar de cobrar cero", async () => {
  const { data, quote } = fixture();
  data.set("productos/pino", { nombre: "Pino", stock: 10, estadoTienda: "Activo", valorVenta: 1000 });
  await assert.rejects(quote({ items: [{ id: "pino", quantity: 1 }], deliveryInfo: { metodoEntrega: "envio", lat: -34, lng: -58, shippingPrice: 0 } }), /cotización/);
});

test("cotización m² redondea el total como ventas y respeta reservas", async () => {
  const { data, quote } = fixture();
  data.set("productos/pino", { nombre: "Machimbre", categoria: "Maderas", unidadMedida: "M2", alto: 0.14, largo: 3.05, precioPorPie: 2510, stock: 12, estadoTienda: "Activo" });
  const input = { items: [{ id: "pino", quantity: 12 }], deliveryInfo: { metodoEntrega: "retiro" } };
  assert.equal((await quote(input)).total, 12900);
  data.set("reservasStock/otra", { productoId: "pino", cantidad: 1, estado: "activa", expiresAt: new Date(Date.now() + 60000).toISOString() });
  await assert.rejects(quote(input), /Stock insuficiente/);
});

test("cotización agrega consumo de piezas sueltas y componentes compartidos de combos", async () => {
  const { data, quote } = fixture();
  data.set("productos/pino", { nombre: "Pino", stock: 10, estadoTienda: "Activo", valorVenta: 1000 });
  data.set("productos/combo", { nombre: "Combo", esCombo: true, estadoTienda: "Activo", precioVenta: 2500, componentesCombo: [{ productoId: "pino", cantidad: 3 }] });
  await assert.rejects(quote({ items: [{ id: "pino", quantity: 2 }, { id: "combo", quantity: 3 }], deliveryInfo: { metodoEntrega: "retiro" } }), /Stock insuficiente/);
  assert.equal((await quote({ items: [{ id: "combo", quantity: 2 }], deliveryInfo: { metodoEntrega: "retiro" } })).total, 5000);
});

test("el descuento por transferencia sale del panel de la tienda web y gana sobre el ajuste antiguo", async () => {
  const { data, quote } = fixture();
  data.set("productos/pino", { nombre: "Pino", stock: 10, estadoTienda: "Activo", valorVenta: 1000 });
  const input = { items: [{ id: "pino", quantity: 2 }], paymentMethod: "transferencia", deliveryInfo: { metodoEntrega: "retiro" } };
  assert.equal((await quote(input)).pricing.transferDiscount, 200);
  data.set("settings/tienda", { published: { transferencia: { descuentoPct: 15 } } });
  const result = await quote(input);
  assert.equal(result.pricing.transferDiscount, 300);
  assert.equal(result.total, 1700);
  assert.equal(result.transferDiscountRate, 0.15);
  data.set("settings/tienda", { published: { transferencia: { descuentoPct: 0 } } });
  assert.equal((await quote(input)).pricing.transferDiscount, 0);
  assert.equal((await quote({ ...input, paymentMethod: "mercadopago" })).pricing.transferDiscount, 0);
});
