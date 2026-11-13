const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

function loadRoute(file, mocks) {
  const source = fs.readFileSync(path.resolve(__dirname, "..", file), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
  const module = { exports: {} };
  const localRequire = (name) => {
    if (Object.prototype.hasOwnProperty.call(mocks, name)) return mocks[name];
    return require(name);
  };
  new Function("require", "module", "exports", output)(localRequire, module, module.exports);
  return module.exports;
}

function setup() {
  const reads = [];
  const documents = {
    presupuestos: {
      "presupuesto-1": { numeroPedido: "P-001", cliente: { nombre: "Cliente" } },
    },
    ventas: {
      "venta-1": { numeroPedido: "V-001", clienteId: "cliente-1" },
    },
    clientes: {
      "cliente-1": { nombre: "Cliente", localidad: "Pilar" },
    },
  };
  const adminDb = {
    collection: (collectionName) => ({
      doc: (id) => ({
        get: async () => {
          reads.push({ collectionName, id });
          const data = documents[collectionName]?.[id];
          return {
            id,
            exists: Boolean(data),
            data: () => data,
          };
        },
      }),
    }),
  };
  const calls = { adminDb: 0, generatedHtml: 0, generatedPdf: 0 };
  const mocks = {
    "@/lib/firebase-admin": {
      getAdminDb: () => {
        calls.adminDb += 1;
        return adminDb;
      },
      verifyFirebaseToken: async (authorization) => {
        if (!authorization) throw Object.assign(new Error("Unauthorized"), { status: 401 });
        return { uid: "user-1" };
      },
    },
    "@/src/lib/pdf/mappers": {
      mapVentaToRemito: (data) => ({ ...data, numero: data.numeroPedido, tipoComprobante: "venta" }),
      mapPresupuestoToRemito: (data) => ({ ...data, numero: data.numeroPedido, tipoComprobante: "presupuesto" }),
      mapObraToRemito: (data) => ({ ...data, numero: data.numeroPedido, tipoComprobante: "obra" }),
    },
    "@/src/lib/pdf/generate-remito-pdf": {
      buildRemitoHtml: (remito) => {
        calls.generatedHtml += 1;
        return `<html>${remito.tipoComprobante}</html>`;
      },
      generateRemitoPDFBuffer: async () => {
        calls.generatedPdf += 1;
        return Buffer.from("pdf-content");
      },
    },
    "@/lib/obra-utils": { generarContenidoImpresion: () => "<html>obra</html>" },
    "@/lib/pdf/venta-location.mjs": {
      mergeVentaClientLocation: (venta, cliente) => ({ ...venta, cliente }),
    },
  };

  return {
    calls,
    reads,
    htmlRoute: loadRoute("app/api/pdf/remito-html/route.ts", mocks),
    pdfRoute: loadRoute("app/api/pdf/remito/route.ts", mocks),
  };
}

function request(body, authorization = "Bearer valid-token") {
  return new Request("http://localhost/api/pdf/remito", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(authorization ? { Authorization: authorization } : {}),
    },
    body: JSON.stringify(body),
  });
}

test("la impresión de presupuesto lee con Firebase Admin y devuelve HTML", async () => {
  const { calls, reads, htmlRoute } = setup();
  const response = await htmlRoute.POST(request({ type: "presupuesto", id: "presupuesto-1", empleado: false }));

  assert.equal(response.status, 200);
  assert.match(await response.text(), /<html>presupuesto<\/html>/);
  assert.deepEqual(reads[0], { collectionName: "presupuestos", id: "presupuesto-1" });
  assert.equal(calls.generatedHtml, 1);
});

test("la descarga de ventas obtiene también la ubicación del cliente con Admin", async () => {
  const { calls, reads, pdfRoute } = setup();
  const response = await pdfRoute.POST(request({ type: "venta", id: "venta-1", empleado: false }));

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/pdf");
  assert.deepEqual(reads, [
    { collectionName: "ventas", id: "venta-1" },
    { collectionName: "clientes", id: "cliente-1" },
  ]);
  assert.equal(calls.generatedPdf, 1);
  assert.equal(Buffer.from(await response.arrayBuffer()).toString(), "pdf-content");
});

test("la descarga de presupuesto consulta la colección correcta con Admin", async () => {
  const { reads, pdfRoute } = setup();
  const response = await pdfRoute.POST(request({ type: "presupuesto", id: "presupuesto-1", empleado: false }));

  assert.equal(response.status, 200);
  assert.deepEqual(reads, [{ collectionName: "presupuestos", id: "presupuesto-1" }]);
  assert.equal(Buffer.from(await response.arrayBuffer()).toString(), "pdf-content");
});

test("las rutas rechazan solicitudes sin sesión antes de acceder a Firestore", async () => {
  const { calls, htmlRoute, pdfRoute } = setup();
  const body = { type: "presupuesto", id: "presupuesto-1" };

  assert.equal((await htmlRoute.POST(request(body, ""))).status, 401);
  assert.equal((await pdfRoute.POST(request(body, ""))).status, 401);
  assert.equal(calls.adminDb, 0);
});
