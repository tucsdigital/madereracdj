const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

function setup({ events = {}, customerEmail = "cliente@example.com", failRecipients = [] } = {}) {
  const state = { docs: new Map(), emails: [], failRecipients: [...failRecipients] };
  const clone = (value) => value === undefined ? undefined : structuredClone(value);
  const snapshot = (ref) => ({ id: ref.id, ref, exists: state.docs.has(ref.path), data: () => clone(state.docs.get(ref.path)) });

  function collection(name, filters = []) {
    const query = {
      doc(id) {
        const ref = { id: String(id), path: `${name}/${id}` };
        ref.get = async () => snapshot(ref);
        ref.set = async (value, options = {}) => state.docs.set(ref.path, options.merge ? { ...(state.docs.get(ref.path) || {}), ...clone(value) } : clone(value));
        ref.update = async (value) => {
          if (!state.docs.has(ref.path)) throw new Error(`No existe ${ref.path}`);
          state.docs.set(ref.path, { ...state.docs.get(ref.path), ...clone(value) });
        };
        return ref;
      },
      where(field, operator, value) {
        assert.equal(operator, "==");
        return collection(name, [...filters, [field, value]]);
      },
      orderBy() { return this; },
      limit() { return this; },
      async get() {
        const docs = [...state.docs.entries()]
          .filter(([key]) => key.startsWith(`${name}/`))
          .map(([key]) => snapshot({ id: key.slice(name.length + 1), path: key }))
          .filter((item) => filters.every(([field, expected]) => item.data()?.[field] === expected));
        return { docs, empty: docs.length === 0, size: docs.length };
      },
    };
    return query;
  }

  const db = {
    collection,
    async runTransaction(callback) {
      const writes = [];
      const transaction = {
        get: async (ref) => snapshot(ref),
        set(ref, value, options = {}) {
          writes.push(() => state.docs.set(ref.path, options.merge ? { ...(state.docs.get(ref.path) || {}), ...clone(value) } : clone(value)));
        },
        create(ref, value) {
          writes.push(() => {
            if (state.docs.has(ref.path)) throw new Error(`Ya existe ${ref.path}`);
            state.docs.set(ref.path, clone(value));
          });
        },
      };
      const result = await callback(transaction);
      writes.forEach((write) => write());
      return result;
    },
  };

  state.docs.set("settings/tienda", { published: {
    notificacionesPedidos: { enabled: true, recipients: ["equipo@example.com"], events },
    transferencia: { titular: "Maderas Caballero", banco: "Banco Ejemplo", cbu: "123456789", alias: "MADERAS.CABALLERO" },
    contacto: { whatsapp: "541121781148" },
  } });
  state.docs.set("orders/pedido_123", {
    orderId: "pedido_123", status: "pending", paymentMethod: "transferencia", createdAt: "2026-10-19T10:00:00.000Z",
    pricing: { total: 12000 }, customerInfo: { nombre: "Ana Pérez", email: customerEmail },
    deliveryInfo: { metodoEntrega: "retiro", direccion: "Av. Siempre Viva 123" },
    items: [{ name: "Tabla de pino", quantity: 2, price: 6000 }],
  });

  class ResendMock {
    constructor() {
      this.emails = { send: async (payload, options) => {
        state.emails.push({ payload: clone(payload), options: clone(options) });
        const recipients = Array.isArray(payload.to) ? payload.to : [payload.to];
        if (recipients.some((recipient) => state.failRecipients.includes(recipient))) return { error: { message: "Resend no disponible" } };
        return { data: { id: `resend_${state.emails.length}` } };
      } };
    }
  }

  const cache = {};
  function load(name) {
    if (name === "resend") return { Resend: ResendMock };
    if (name === "@/lib/firebase-admin") return { getAdminDb: () => db };
    if (name === "@/lib/tienda-config") {
      if (!cache.config) {
        const source = fs.readFileSync(path.resolve(__dirname, "../lib/tienda-config.js"), "utf8");
        const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
        const configModule = { exports: {} };
        new Function("require", "module", "exports", output)(load, configModule, configModule.exports);
        cache.config = configModule.exports;
      }
      return cache.config;
    }
    return require(name);
  }

  const source = fs.readFileSync(path.resolve(__dirname, "../lib/tienda-notificaciones.js"), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const notificationModule = { exports: {} };
  new Function("require", "module", "exports", output)(load, notificationModule, notificationModule.exports);
  process.env.RESEND_API_KEY = "test_key";
  process.env.RESEND_FROM_EMAIL = "avisos@example.com";
  return { state, service: notificationModule.exports };
}

const eventDocument = (state) => [...state.docs.entries()].find(([key]) => key.startsWith("orderAdminEmailEvents/"));

test("envía un nuevo pedido al equipo y al email del cliente, con datos para transferir", async () => {
  const { state, service } = setup();
  await service.sendOrderAdminNotification("pedido_123", "created");

  assert.equal(state.emails.length, 2);
  const team = state.emails.find(({ payload }) => Array.isArray(payload.to));
  const customer = state.emails.find(({ payload }) => payload.to === "cliente@example.com");
  assert.deepEqual(team.payload.to, ["equipo@example.com"]);
  assert.match(customer.payload.subject, /Recibimos tu pedido/);
  assert.match(customer.payload.html, /Datos para transferir/);
  assert.match(customer.payload.html, /MADERAS\.CABALLERO/);
  assert.doesNotMatch(customer.payload.html, /equipo@example\.com/);

  const [, stored] = eventDocument(state);
  assert.equal(stored.status, "sent");
  assert.equal(stored.customerStatus, "sent");
  assert.ok(stored.resendId);
  assert.ok(stored.customerResendId);
});

test("no envía cuando el evento fue desactivado", async () => {
  const { state, service } = setup({ events: { cancelled: false } });
  const result = await service.sendOrderAdminNotification("pedido_123", "cancelled");
  assert.equal(result.skipped, true);
  assert.equal(state.emails.length, 0);
  assert.equal(eventDocument(state), undefined);
});

test("el fallo y reintento de un canal no repite el email entregado al otro", async () => {
  const { state, service } = setup({ failRecipients: ["equipo@example.com"] });
  await assert.rejects(service.sendOrderAdminNotification("pedido_123", "confirmed"), /Resend no disponible/);

  let [, stored] = eventDocument(state);
  assert.equal(stored.status, "failed");
  assert.equal(stored.customerStatus, "sent");
  assert.equal(state.emails.length, 2);

  state.failRecipients = [];
  const [documentPath] = eventDocument(state);
  const result = await service.retryOrderAdminNotification(documentPath.split("/")[1], "team");
  assert.equal(result.channels[0].audience, "team");
  assert.equal(state.emails.length, 3);
  [, stored] = eventDocument(state);
  assert.equal(stored.status, "sent");
  assert.equal(stored.customerStatus, "sent");
});

test("omite sólo el canal del cliente cuando falta su email", async () => {
  const { state, service } = setup({ customerEmail: "" });
  await service.sendOrderAdminNotification("pedido_123", "review");
  assert.equal(state.emails.length, 1);
  const [, stored] = eventDocument(state);
  assert.equal(stored.status, "sent");
  assert.equal(stored.customerStatus, "skipped");
});

test("el webhook de Resend actualiza y deduplica el estado de entrega del cliente", async () => {
  const { state, service } = setup();
  await service.sendOrderAdminNotification("pedido_123", "cancelled", { cancellationReason: "Pedido cancelado por el cliente" });
  const [, stored] = eventDocument(state);
  const delivery = { type: "email.delivered", created_at: "2026-10-19T10:05:00.000Z", data: { email_id: stored.customerResendId } };

  assert.deepEqual(await service.recordOrderAdminDeliveryEvent(delivery, "webhook-1"), { matched: true, duplicate: false });
  assert.deepEqual(await service.recordOrderAdminDeliveryEvent(delivery, "webhook-1"), { matched: false, duplicate: true });
  const [, updated] = eventDocument(state);
  assert.equal(updated.customerDeliveryStatus, "delivered");
  const customer = state.emails.find(({ payload }) => payload.to === "cliente@example.com");
  assert.match(customer.payload.subject, /Pedido cancelado/);
  assert.match(customer.payload.text, /Pedido cancelado por el cliente/);
});

test("las plantillas de cliente y equipo mantienen contenido y destinatarios separados", () => {
  const { service } = setup();
  const snapshot = {
    type: "paymentFailed", label: "Pago rechazado o cancelado", orderNumber: "VENTA-10", orderId: "pedido_123",
    customerName: "Ana Pérez", customerEmail: "cliente@example.com", paymentMethod: "mercadopago", paymentStatus: "rejected",
    deliveryMethod: "retiro", address: "Av. Siempre Viva", total: 12000,
    items: [{ name: "Tabla", quantity: 1, total: 12000 }],
  };
  const customer = service.buildOrderNotificationEmail(snapshot, "customer");
  const team = service.buildOrderNotificationEmail(snapshot, "team");
  assert.match(customer.subject, /No se pudo confirmar el pago/);
  assert.match(customer.text, /No confirmado/);
  assert.doesNotMatch(customer.html, /cliente@example\.com/);
  assert.match(team.html, /cliente@example\.com/);
});
