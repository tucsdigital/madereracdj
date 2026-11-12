const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const clone = (value) => value == null ? value : structuredClone(value);

function fakeDb(seed) {
  const docs = new Map(Object.entries(seed).map(([key, value]) => [key, clone(value)]));
  const snapshot = (ref) => ({ exists: docs.has(ref.path), data: () => clone(docs.get(ref.path)) });
  const ref = (pathName) => ({
    id: pathName.split("/").at(-1),
    path: pathName,
    get: async () => snapshot(ref(pathName)),
    set: async (value, options = {}) => docs.set(pathName, options.merge ? { ...(docs.get(pathName) || {}), ...clone(value) } : clone(value)),
    update: async (value) => {
      if (!docs.has(pathName)) throw new Error(`Missing ${pathName}`);
      docs.set(pathName, { ...docs.get(pathName), ...clone(value) });
    },
  });
  const db = {
    collection(name) { return { doc(id) { return ref(`${name}/${id}`); } }; },
    async runTransaction(callback) {
      const writes = [];
      const transaction = {
        get: async (documentRef) => snapshot(documentRef),
        update(documentRef, value) { writes.push(() => {
          if (!docs.has(documentRef.path)) throw new Error(`Missing ${documentRef.path}`);
          docs.set(documentRef.path, { ...docs.get(documentRef.path), ...clone(value) });
        }); },
        set(documentRef, value, options = {}) { writes.push(() => docs.set(documentRef.path, options.merge ? { ...(docs.get(documentRef.path) || {}), ...clone(value) } : clone(value))); },
      };
      const result = await callback(transaction);
      writes.forEach((write) => write());
      return result;
    },
  };
  return { db, docs };
}

function loadRoute(file, mocks) {
  const source = fs.readFileSync(path.resolve(__dirname, file), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loadedModule = { exports: {} };
  const mockRequire = (name) => Object.hasOwn(mocks, name) ? mocks[name] : require(name);
  new Function("require", "module", "exports", compiled)(mockRequire, loadedModule, loadedModule.exports);
  return loadedModule.exports;
}

function nextResponseMock() {
  return { NextResponse: { json: (body, init = {}) => ({ status: init.status || 200, json: async () => body }) } };
}

function request(body = {}) {
  return { headers: { get: () => "Bearer staff-token" }, json: async () => body };
}

const paidState = (sale) => {
  const total = Number(sale?.total) || 0;
  const paid = Array.isArray(sale?.pagos) && sale.pagos.length
    ? sale.pagos.reduce((sum, item) => sum + (Number(item.monto) || 0), 0)
    : Number(sale?.montoAbonado) || 0;
  return { total, abonado: paid, saldoPendiente: Math.max(0, total - paid), estadoPago: paid >= total ? "pagado" : paid > 0 ? "parcial" : "pendiente" };
};

function pickupFixture(salePatch = {}) {
  const { db, docs } = fakeDb({
    "ventas/sale-123": {
      ecommerceLifecycle: true, tipoEnvio: "retiro_local", idExterno: "order-123",
      formaPago: "efectivo", estadoPreparacion: "pendiente", total: 100, pagos: [],
      cliente: { telefono: "5491123456789" }, ...salePatch,
    },
    "orders/order-123": { orderId: "order-123", status: "pending" },
  });
  const notifications = [];
  const route = loadRoute("../app/api/erp/ventas/[id]/pickup-status/route.js", {
    "next/server": nextResponseMock(),
    "@/lib/firebase-admin": { verifyFirebaseToken: async () => ({ uid: "staff-1", email: "staff@example.com" }), getAdminDb: () => db },
    "@/lib/ventas-pagos": { buildVentaPaymentSnapshot: paidState },
    "@/lib/tienda-notificaciones": { sendOrderAdminNotification: async (...args) => { notifications.push(args); return { ok: true }; } },
  });
  return { route, docs, notifications };
}

function proofFixture(salePatch = {}) {
  const sale = {
    ecommerceLifecycle: true, formaPago: "transferencia", idExterno: "order-123", total: 100,
    montoAbonado: 0, pagos: [], paymentProofStatus: "received", paymentProofEvidenceId: "proof-1",
    comprobantesPago: [{ id: "proof-1", url: "https://files.example/proof.pdf", estadoRevision: "pendiente" }],
    ...salePatch,
  };
  const { db, docs } = fakeDb({ "ventas/sale-123": sale, "orders/order-123": { orderId: "order-123", status: "pending" } });
  const notifications = [];
  const mocks = {
    "next/server": nextResponseMock(),
    "@/lib/firebase-admin": { verifyFirebaseToken: async () => ({ uid: "staff-1", email: "staff@example.com" }), getAdminDb: () => db },
    "@/lib/ventas-pagos": {
      buildVentaPaymentSnapshot: paidState,
      normalizeVentaPaymentFields: ({ venta }) => ({ pagos: Array.isArray(venta?.pagos) ? venta.pagos : [] }),
    },
    "@/lib/tienda-notificaciones": { sendOrderAdminNotification: async (...args) => { notifications.push(args); return { ok: true }; } },
    "@/lib/erp/ventas-engine": {
      updateVentaEngine: async ({ ventaId, ventaData }) => {
        const old = docs.get(`ventas/${ventaId}`);
        const pagos = clone(ventaData.pagos || []);
        docs.set(`ventas/${ventaId}`, { ...old, ...clone(ventaData), pagos, estadoPago: paidState({ ...old, ...ventaData, pagos }).estadoPago });
      },
    },
  };
  const route = loadRoute("../app/api/erp/ventas/[id]/payment-proof/route.js", mocks);
  return { route, docs, notifications };
}

test("un retiro de transferencia no se marca listo hasta confirmar el pago", async () => {
  const { route, docs, notifications } = pickupFixture({ formaPago: "transferencia" });
  await route.POST(request({ status: "preparando" }), { params: { id: "sale-123" } });
  const response = await route.POST(request({ status: "listo_para_retirar" }), { params: { id: "sale-123" } });
  const body = await response.json();

  assert.equal(response.status, 409);
  assert.match(body.error, /transferencia/i);
  assert.equal(docs.get("ventas/sale-123").estadoPreparacion, "preparando");
  assert.deepEqual(notifications.map(([, type]) => type), ["preparingForPickup"]);
});

test("la preparación inicia con un aviso y al marcar listo se envía el segundo evento", async () => {
  const { route, docs, notifications } = pickupFixture({ rangoHorario: "Hoy de 14:00 a 17:00" });
  const preparingResponse = await route.POST(request({ status: "preparando" }), { params: { id: "sale-123" } });
  const preparingBody = await preparingResponse.json();
  assert.equal(preparingResponse.status, 200);
  assert.equal(preparingBody.sale.estadoPreparacion, "preparando");
  assert.equal(notifications[0][1], "preparingForPickup");

  const response = await route.POST(request({ status: "listo_para_retirar" }), { params: { id: "sale-123" } });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(docs.get("ventas/sale-123").estadoPreparacion, "listo_para_retirar");
  assert.equal(docs.get("orders/order-123").fulfillmentStatus, "listo_para_retirar");
  assert.equal(docs.get("orders/order-123").deliveryInfo.rangoHorario, "Hoy de 14:00 a 17:00");
  assert.deepEqual(notifications.map(([, type]) => type), ["preparingForPickup", "readyForPickup"]);
  assert.equal(body.ok, true);
});

test("no permite saltar directamente de pendiente a listo para retirar", async () => {
  const { route, docs, notifications } = pickupFixture();
  const response = await route.POST(request({ status: "listo_para_retirar" }), { params: { id: "sale-123" } });
  const body = await response.json();

  assert.equal(response.status, 409);
  assert.match(body.error, /No se puede pasar/);
  assert.equal(docs.get("ventas/sale-123").estadoPreparacion, "pendiente");
  assert.equal(notifications.length, 0);
});

test("guarda la franja opcional en venta y pedido sin emitir un aviso", async () => {
  const { route, docs, notifications } = pickupFixture();
  const response = await route.POST(request({ rangoHorario: "Hoy de 14:00 a 17:00" }), { params: { id: "sale-123" } });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.sale.rangoHorario, "Hoy de 14:00 a 17:00");
  assert.equal(docs.get("ventas/sale-123").rangoHorario, "Hoy de 14:00 a 17:00");
  assert.equal(docs.get("orders/order-123").rangoHorario, "Hoy de 14:00 a 17:00");
  assert.equal(docs.get("orders/order-123").deliveryInfo.rangoHorario, "Hoy de 14:00 a 17:00");
  assert.equal(notifications.length, 0);
});

test("sincroniza fecha y horario de retiro con la venta y el pedido sin emitir avisos", async () => {
  const { route, docs, notifications } = pickupFixture();
  const response = await route.POST(request({ fechaEntrega: "2026-11-20", rangoHorario: "08:00 - 12:00" }), { params: { id: "sale-123" } });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.sale.fechaEntrega, "2026-11-20");
  assert.equal(body.sale.rangoHorario, "08:00 - 12:00");
  assert.equal(docs.get("ventas/sale-123").fechaEntrega, "2026-11-20");
  assert.equal(docs.get("orders/order-123").fechaEntrega, "2026-11-20");
  assert.equal(docs.get("orders/order-123").deliveryInfo.fechaEntrega, "2026-11-20");
  assert.equal(docs.get("orders/order-123").deliveryInfo.rangoHorario, "08:00 - 12:00");
  assert.equal(notifications.length, 0);
});

test("rechaza fechas de retiro inexistentes", async () => {
  const { route, docs } = pickupFixture();
  const response = await route.POST(request({ fechaEntrega: "2026-02-31" }), { params: { id: "sale-123" } });
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.match(body.error, /fecha de retiro/i);
  assert.equal(docs.get("ventas/sale-123").fechaEntrega, undefined);
});

test("repetir el estado en preparación no duplica su email", async () => {
  const { route, notifications } = pickupFixture();
  await route.POST(request({ status: "preparando" }), { params: { id: "sale-123" } });
  const repeated = await route.POST(request({ status: "preparando" }), { params: { id: "sale-123" } });

  assert.equal(repeated.status, 200);
  assert.equal(notifications.length, 1);
});

test("la revisión rechaza un comprobante ausente y exige observación para solicitar otro", async () => {
  const absent = proofFixture({ paymentProofStatus: "awaiting_transfer" });
  const absentResponse = await absent.route.POST(request({ action: "confirm" }), { params: { id: "sale-123" } });
  assert.equal(absentResponse.status, 409);

  const missingReason = proofFixture();
  const reasonResponse = await missingReason.route.POST(request({ action: "reject", reason: "  " }), { params: { id: "sale-123" } });
  assert.equal(reasonResponse.status, 400);
});

test("confirmar acreditación registra el pago y fija el estado del comprobante", async () => {
  const { route, docs, notifications } = proofFixture();
  const response = await route.POST(request({ action: "confirm" }), { params: { id: "sale-123" } });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(docs.get("ventas/sale-123").estadoPago, "pagado");
  assert.equal(docs.get("ventas/sale-123").pagos[0].monto, 100);
  assert.equal(docs.get("ventas/sale-123").paymentProofStatus, "confirmed");
  assert.equal(docs.get("orders/order-123").paymentConfirmationSource, "manual_bank_reconciliation");
  assert.equal(notifications[0][1], "confirmed");
  assert.equal(body.ok, true);
});

test("observar el comprobante guarda el motivo y envía el evento de corrección", async () => {
  const { route, docs, notifications } = proofFixture();
  const response = await route.POST(request({ action: "reject", reason: "No se distingue el importe." }), { params: { id: "sale-123" } });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(docs.get("ventas/sale-123").paymentProofStatus, "rejected");
  assert.equal(docs.get("orders/order-123").paymentProofReason, "No se distingue el importe.");
  assert.equal(notifications[0][1], "paymentProofRejected");
  assert.equal(notifications[0][2].paymentProofReason, "No se distingue el importe.");
  assert.equal(body.ok, true);
});
