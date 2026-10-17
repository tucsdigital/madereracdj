const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const sharp = require("sharp");

// Ejecuta las rutas reales con almacenamiento, base de datos y sesión simulados.
function loadRoute(relative, mocks) {
  const cache = {};
  const load = (name) => {
    if (mocks[name]) return mocks[name];
    if (name === "sharp") return sharp;
    if (name === "@/lib/tienda-media") {
      if (!cache[name]) {
        const src = fs.readFileSync(path.resolve(__dirname, "../lib/tienda-media.js"), "utf8");
        const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
        const m = { exports: {} };
        new Function("require", "module", "exports", out)(load, m, m.exports);
        cache[name] = m.exports;
      }
      return cache[name];
    }
    return require(name);
  };
  const src = fs.readFileSync(path.resolve(__dirname, relative), "utf8");
  const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const m = { exports: {} };
  new Function("require", "module", "exports", out)(load, m, m.exports);
  return m.exports;
}

const NextResponse = { json: (body, init = {}) => ({ status: init.status || 200, body }) };

function setup({ storageOk = true } = {}) {
  const state = { uploads: [], records: [], deleted: [], docs: {}, mediaDocs: [] };
  const mocks = {
    "next/server": { NextResponse },
    "@/lib/firebase-admin": {
      verifyFirebaseToken: async (header) => {
        if (!header) throw Object.assign(new Error("Missing"), { status: 401 });
        return { uid: "u1", email: "admin@ejemplo.com" };
      },
      getAdminDb: () => ({
        collection: (name) => ({
          add: async (item) => { state.records.push({ name, item }); return { id: `doc${state.records.length}` }; },
          orderBy() { return this; }, limit() { return this; },
          doc: (id) => ({
            get: async () => ({ data: () => state.docs[`${name}/${id}`] }),
            delete: async () => { state.deleted.push(`doc:${id}`); },
          }),
          get: async () => ({ docs: state.mediaDocs.map((d) => ({ id: d.id, data: () => d })) }),
        }),
      }),
    },
    "@/lib/r2-storage": {
      getR2ConfigStatus: () => storageOk
        ? { ok: true, missing: [], configured: { publicBase: "https://media.ejemplo.com" } }
        : { ok: false, missing: ["R2_BUCKET", "R2_ENDPOINT"], configured: { publicBase: null } },
      uploadFileToR2: async ({ key, file, contentType, cacheControl }) => {
        const bytes = Buffer.from(await file.arrayBuffer());
        state.uploads.push({ key, bytes, contentType, cacheControl });
        return { key, url: `https://media.ejemplo.com/${key}` };
      },
      deleteFileFromR2: async (key) => { state.deleted.push(key); },
    },
  };
  return { state, mocks };
}

const request = (formFields, auth = "Bearer token") => ({
  headers: { get: (name) => (name.toLowerCase() === "authorization" ? auth : null) },
  formData: async () => { const fd = new FormData(); Object.entries(formFields).forEach(([k, v]) => fd.append(k, v)); return fd; },
});
const png = (width, height) => sharp({ create: { width, height, channels: 3, background: "#8b5a2b" } }).png().toBuffer();
const fileOf = (buffer, name = "x.png", type = "image/png") => new File([buffer], name, { type });

test("sube, reduce y convierte a WebP, y registra la URL pública", async () => {
  const { state, mocks } = setup();
  const route = loadRoute("../app/api/tienda/media/route.js", mocks);
  const res = await route.POST(request({ file: fileOf(await png(3000, 1200)), folder: "banners" }));
  assert.equal(res.status, 200);
  const upload = state.uploads[0];
  assert.match(upload.key, /^tienda\/banners\/\d+-[a-z0-9]+\.webp$/);
  assert.equal(upload.contentType, "image/webp");
  assert.match(upload.cacheControl, /immutable/);
  assert.equal(upload.bytes.subarray(8, 12).toString(), "WEBP");
  assert.equal(res.body.item.width, 2400);
  assert.equal(res.body.item.height, 960);
  assert.equal(res.body.item.url, `https://media.ejemplo.com/${upload.key}`);
  assert.equal(state.records[0].name, "tiendaMedia");
  assert.equal(state.records[0].item.byEmail, "admin@ejemplo.com");
});

test("sin sesión no se sube nada", async () => {
  const { state, mocks } = setup();
  const route = loadRoute("../app/api/tienda/media/route.js", mocks);
  const res = await route.POST(request({ file: fileOf(await png(800, 800)), folder: "banners" }, ""));
  assert.equal(res.status, 401);
  assert.equal(state.uploads.length, 0);
});

test("sin R2 configurado informa qué variables faltan", async () => {
  const { state, mocks } = setup({ storageOk: false });
  const route = loadRoute("../app/api/tienda/media/route.js", mocks);
  const res = await route.POST(request({ file: fileOf(await png(800, 800)), folder: "banners" }));
  assert.equal(res.status, 503);
  assert.match(res.body.error, /R2_BUCKET/);
  assert.equal(state.uploads.length, 0);
});

test("rechaza carpetas inválidas, archivos ausentes, SVG y contenido que no es imagen", async () => {
  const { state, mocks } = setup();
  const route = loadRoute("../app/api/tienda/media/route.js", mocks);
  const good = fileOf(await png(800, 800));
  assert.equal((await route.POST(request({ file: good, folder: "../comprobantes" }))).status, 400);
  assert.equal((await route.POST(request({ folder: "banners" }))).status, 400);
  const svg = fileOf(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), "x.png", "image/png");
  assert.equal((await route.POST(request({ file: svg, folder: "banners" }))).status, 415);
  const exe = fileOf(Buffer.concat([Buffer.from("MZ"), Buffer.alloc(100)]), "foto.jpg", "image/jpeg");
  assert.equal((await route.POST(request({ file: exe, folder: "banners" }))).status, 415);
  assert.equal(state.uploads.length, 0);
});

test("rechaza archivos demasiado pesados, diminutos o con cabecera válida pero contenido dañado", async () => {
  const { state, mocks } = setup();
  const route = loadRoute("../app/api/tienda/media/route.js", mocks);
  const heavy = fileOf(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(9 * 1024 * 1024)]), "x.jpg", "image/jpeg");
  assert.equal((await route.POST(request({ file: heavy, folder: "banners" }))).status, 413);
  assert.equal((await route.POST(request({ file: fileOf(await png(100, 100)), folder: "banners" }))).status, 400);
  const corrupt = fileOf(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from("esto no es un jpeg real"), Buffer.alloc(64)]), "x.jpg", "image/jpeg");
  const res = await route.POST(request({ file: corrupt, folder: "categorias" }));
  assert.equal(res.status, 400);
  assert.equal(state.uploads.length, 0, "un archivo dañado nunca debe quedar guardado");
});

test("la limpieza solo elimina imágenes de la tienda que no usa ni el borrador ni lo publicado", async () => {
  const { state, mocks } = setup();
  const base = "https://media.ejemplo.com";
  state.docs["settings/tienda"] = {
    published: { banners: [{ imagen: `${base}/tienda/banners/1-usada.webp` }] },
    draft: { categorias: [{ imagen: `${base}/tienda/categorias/2-borrador.webp` }] },
  };
  state.mediaDocs = [
    { id: "a", key: "tienda/banners/1-usada.webp", url: `${base}/tienda/banners/1-usada.webp`, size: 10 },
    { id: "b", key: "tienda/categorias/2-borrador.webp", url: `${base}/tienda/categorias/2-borrador.webp`, size: 10 },
    { id: "c", key: "tienda/banners/3-huerfana.webp", url: `${base}/tienda/banners/3-huerfana.webp`, size: 10 },
    { id: "d", key: "comprobantes/ajeno.pdf", url: `${base}/comprobantes/ajeno.pdf`, size: 10 },
  ];
  const route = loadRoute("../app/api/tienda/media/limpiar/route.js", mocks);
  const post = (body) => ({ headers: { get: () => "Bearer t" }, json: async () => body });

  const preview = await route.POST(post({}));
  assert.deepEqual(preview.body.unused.map((u) => u.id), ["c"]);
  assert.equal(state.deleted.length, 0, "sin confirmar no se borra nada");

  const done = await route.POST(post({ confirmar: true }));
  assert.equal(done.body.deleted, 1);
  assert.deepEqual(state.deleted, ["tienda/banners/3-huerfana.webp", "doc:c"]);
  assert.equal((await route.POST({ headers: { get: () => null }, json: async () => ({}) })).status, 401);
});
