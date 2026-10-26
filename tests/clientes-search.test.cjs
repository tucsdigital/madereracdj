const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const file = path.resolve(__dirname, "..", "lib/clientes-search.js");
const source = fs.readFileSync(file, "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const loaded = { exports: {} };
new Function("module", "exports", output)(loaded, loaded.exports);
const {
  addClienteToIdentityIndex,
  createClienteIdentityIndex,
  getClienteCuit,
  getClienteDni,
  getClienteIdentityQueryValues,
  getUniqueClienteIdentityQueryValues,
  getRegistroClienteIds,
  matchesClienteSearch,
  presupuestoMatchesCliente,
  registroMatchesCliente,
  scanMatchingCursorPage,
} = loaded.exports;

test("la búsqueda de texto ignora tildes, mayúsculas y espacios duplicados", () => {
  const cliente = { id: "1", nombre: "José  Pérez" };
  assert.equal(matchesClienteSearch(cliente, "  JOSE   PEREZ "), true);
  assert.equal(matchesClienteSearch(cliente, "Maria Perez"), false);
});

test("una búsqueda alfabética no coincide con documentos vacíos", () => {
  const cliente = { id: "1", nombre: "María López", dni: "", cuit: "" };
  assert.equal(matchesClienteSearch(cliente, "María"), true);
  assert.equal(matchesClienteSearch(cliente, "Cliente inexistente"), false);
});

test("documentos y teléfonos se comparan normalizados, sin perder ceros", () => {
  const cliente = {
    id: "1",
    nombre: "Ana Ruiz",
    dni: "03012345",
    cuit: "20-12345678-9",
    telefono: "+54 (221) 555-0123",
  };
  assert.equal(matchesClienteSearch(cliente, "03.012.345"), true);
  assert.equal(matchesClienteSearch(cliente, "20-12345678-9"), true);
  assert.equal(matchesClienteSearch(cliente, "221 555 0123"), true);
});

test("una búsqueda mixta no relaciona el texto de un cliente con el número de otro", () => {
  const ana = { id: "a", nombre: "Ana Ruiz", telefono: "2215550123" };
  assert.equal(matchesClienteSearch(ana, "Ana 555"), false);
});

test("se conserva la interpretación histórica de DNI guardado en cuit", () => {
  const cliente = { id: "1", nombre: "Cliente antiguo", cuit: "30.123.456" };
  assert.equal(getClienteDni(cliente), "30123456");
  assert.equal(getClienteCuit(cliente), "");
  assert.equal(matchesClienteSearch(cliente, "30123456"), true);
});

test("los presupuestos se relacionan por ID estable aunque el snapshot de datos esté desactualizado", () => {
  const cliente = { id: "cliente-a", dni: "30123456", cuit: "20-12345678-9" };
  const clientes = [cliente, { id: "cliente-b", dni: "30111222", cuit: "20-11111111-1" }];
  const presupuesto = { clienteId: "cliente-a", cliente: { cuit: "20-99999999-9" } };
  assert.equal(presupuestoMatchesCliente(presupuesto, cliente, clientes), true);
});

test("un ID explícito de otro cliente prevalece sobre un CUIT coincidente en el snapshot", () => {
  const cliente = { id: "cliente-a", dni: "30123456", cuit: "20-12345678-9" };
  const clientes = [cliente, { id: "cliente-b", dni: "30111222", cuit: "20-11111111-1" }];
  const presupuesto = { clienteId: "cliente-b", cliente: { cuit: "20-12345678-9" } };
  assert.equal(presupuestoMatchesCliente(presupuesto, cliente, clientes), false);
});

test("los documentos sirven como respaldo histórico solo si identifican a un único cliente", () => {
  const cliente = { id: "cliente-a", dni: "30123456", cuit: "20-12345678-9" };
  const otro = { id: "cliente-b", dni: "30111222", cuit: "20-11111111-1" };
  assert.equal(
    presupuestoMatchesCliente({ cliente: { cuit: "20 12345678 9" } }, cliente, [cliente, otro]),
    true,
  );
  assert.equal(
    presupuestoMatchesCliente({ cliente: { dni: "30123456" } }, cliente, [cliente, { ...otro, dni: "30.123.456" }]),
    false,
  );
  assert.equal(presupuestoMatchesCliente({ cliente: { nombre: "Ana" } }, cliente, [cliente, otro]), false);
});

test("las ventas históricas con clienteId de documento se asignan por identidad única", () => {
  const cliente = { id: "cliente-a", dni: "30123456", cuit: "20-12345678-9" };
  const otro = { id: "cliente-b", dni: "30111222", cuit: "20-11111111-1" };
  assert.equal(registroMatchesCliente({ clienteId: "30123456" }, cliente, [cliente, otro]), true);
  assert.equal(registroMatchesCliente({ clienteId: "cliente-b", cliente: { dni: "30123456" } }, cliente, [cliente, otro]), false);
});

test("el índice compacto detecta documentos únicos y duplicados sin retener los clientes completos", () => {
  const index = createClienteIdentityIndex();
  const cliente = { id: "cliente-a", dni: "30123456", cuit: "20-12345678-9", direccion: "Calle A" };
  const otro = { id: "cliente-b", dni: "30111222", cuit: "20-11111111-1" };
  addClienteToIdentityIndex(index, cliente);
  addClienteToIdentityIndex(index, otro);

  assert.equal(registroMatchesCliente({ cliente: { dni: "30123456" } }, cliente, index), true);
  addClienteToIdentityIndex(index, { id: "cliente-c", dni: "30.123.456" });
  assert.equal(registroMatchesCliente({ cliente: { dni: "30123456" } }, cliente, index), false);
  assert.equal(index.documents.get("30123456").count, 2);
  assert.equal(index.clientIds.size, 3);
});

test("las consultas dirigidas incluyen formatos usuales y descartan identificadores ambiguos", () => {
  const cliente = { id: "cliente-a", dni: "30123456", cuit: "20-12345678-9" };
  const values = getClienteIdentityQueryValues(cliente);
  assert.ok(values.dni.includes("30.123.456"));
  assert.ok(values.cuit.includes("20-12345678-9"));
  assert.ok(values.all.includes("20123456789"));

  const index = createClienteIdentityIndex();
  addClienteToIdentityIndex(index, cliente);
  assert.equal(getUniqueClienteIdentityQueryValues(cliente, index).all.length > 0, true);
  addClienteToIdentityIndex(index, { id: "cliente-b", dni: "30.123.456" });
  assert.equal(getUniqueClienteIdentityQueryValues(cliente, index).dni.length, 0);
  assert.ok(getUniqueClienteIdentityQueryValues(cliente, index).cuit.length > 0);
});

test("los conteos obtienen IDs estables y referencias históricas solo cuando son únicas", () => {
  const index = createClienteIdentityIndex();
  const cliente = { id: "cliente-a", dni: "30123456", cuit: "20-12345678-9" };
  const otro = { id: "cliente-b", dni: "30111222", cuit: "20-11111111-1" };
  addClienteToIdentityIndex(index, cliente);
  addClienteToIdentityIndex(index, otro);

  assert.deepEqual(getRegistroClienteIds({ clienteId: "cliente-a" }, index), ["cliente-a"]);
  assert.deepEqual(getRegistroClienteIds({ clienteId: "30123456" }, index), ["cliente-a"]);
  assert.deepEqual(getRegistroClienteIds({ cliente: { cuit: "20 12345678 9" } }, index), ["cliente-a"]);
  assert.deepEqual(getRegistroClienteIds({ clienteId: "cliente-b", cliente: { dni: "30123456" } }, index), ["cliente-b"]);

  addClienteToIdentityIndex(index, { id: "cliente-c", dni: "30.123.456" });
  assert.deepEqual(getRegistroClienteIds({ clienteId: "30123456" }, index), []);
  assert.deepEqual(getRegistroClienteIds({ cliente: { dni: "30123456" } }, index), []);
});

test("el cursor de búsqueda pagina coincidencias sin duplicar ni saltar documentos", async () => {
  const records = Array.from({ length: 30 }, (_, id) => ({ id, value: id }));
  const fetchBatch = async (cursor, size) => {
    const start = cursor == null ? 0 : cursor + 1;
    return records.slice(start, start + size).map((value) => ({ value, cursor: value.id }));
  };
  const findEven = (value) => value.value % 2 === 0;

  const first = await scanMatchingCursorPage({ fetchBatch, matches: findEven, pageSize: 4, batchSize: 5 });
  const second = await scanMatchingCursorPage({ fetchBatch, cursor: first.nextCursor, matches: findEven, pageSize: 4, batchSize: 5 });

  assert.deepEqual(first.items.map((item) => item.id), [0, 2, 4, 6]);
  assert.equal(first.hasNext, true);
  assert.deepEqual(second.items.map((item) => item.id), [8, 10, 12, 14]);
  assert.equal(second.hasNext, true);
});

test("el cursor termina la búsqueda cuando no quedan más coincidencias", async () => {
  const records = Array.from({ length: 9 }, (_, id) => ({ id, value: id }));
  const fetchBatch = async (cursor, size) => {
    const start = cursor == null ? 0 : cursor + 1;
    return records.slice(start, start + size).map((value) => ({ value, cursor: value.id }));
  };

  const result = await scanMatchingCursorPage({
    fetchBatch,
    matches: (value) => value.value < 3,
    pageSize: 5,
    batchSize: 4,
  });
  assert.deepEqual(result.items.map((item) => item.id), [0, 1, 2]);
  assert.equal(result.hasNext, false);
  assert.equal(result.exhausted, true);
});
