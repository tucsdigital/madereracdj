const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const source = fs.readFileSync(path.resolve(__dirname, "../lib/tienda-media.js"), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const mod = { exports: {} };
new Function("require", "module", "exports", compiled)(require, mod, mod.exports);
const { sniffImage, mediaKey, allowedImageHosts, keyFromUrl, imageUrlsOf } = mod.exports;

const pad = (bytes) => Buffer.concat([Buffer.from(bytes), Buffer.alloc(32)]);

test("detecta el formato por el contenido, no por el nombre", () => {
  assert.deepEqual(sniffImage(pad([0xff, 0xd8, 0xff, 0xe0])), { mime: "image/jpeg", ext: "jpg" });
  assert.deepEqual(sniffImage(pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), { mime: "image/png", ext: "png" });
  assert.deepEqual(sniffImage(Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP"), Buffer.alloc(8)])), { mime: "image/webp", ext: "webp" });
  assert.deepEqual(sniffImage(Buffer.concat([Buffer.alloc(4), Buffer.from("ftypavif"), Buffer.alloc(8)])), { mime: "image/avif", ext: "avif" });
});

test("rechaza SVG, HTML, ejecutables, vacíos y formatos no soportados", () => {
  assert.equal(sniffImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')), null);
  assert.equal(sniffImage(Buffer.from("<html><body>hola mundo</body></html>")), null);
  assert.equal(sniffImage(pad([0x4d, 0x5a, 0x90, 0x00])), null);
  assert.equal(sniffImage(Buffer.from("GIF89a" + "0".repeat(30))), null);
  assert.equal(sniffImage(Buffer.alloc(0)), null);
  assert.equal(sniffImage(null), null);
  assert.equal(sniffImage(Buffer.concat([Buffer.alloc(4), Buffer.from("ftypheic"), Buffer.alloc(8)])), null);
});

test("las claves son únicas, ordenadas por carpeta y no se pueden manipular", () => {
  assert.equal(mediaKey({ folder: "banners", ext: "webp", now: 1700000000000, random: "abc123" }), "tienda/banners/1700000000000-abc123.webp");
  assert.notEqual(mediaKey({ folder: "banners", ext: "webp" }), mediaKey({ folder: "banners", ext: "webp" }));
  assert.throws(() => mediaKey({ folder: "../comprobantes", ext: "webp" }));
  assert.throws(() => mediaKey({ folder: "banners", ext: "w/../x" }));
  assert.ok(!mediaKey({ folder: "banners", ext: "webp", random: "../../x" }).includes(".."));
});

test("solo se reconoce el host público de R2 configurado", () => {
  assert.deepEqual(allowedImageHosts("https://media.ejemplo.com/"), ["media.ejemplo.com"]);
  assert.deepEqual(allowedImageHosts(""), []);
  assert.deepEqual(allowedImageHosts("no es url"), []);
});

test("una URL pública se convierte en clave sólo si pertenece al bucket y a la tienda", () => {
  const base = "https://media.ejemplo.com";
  assert.equal(keyFromUrl("https://media.ejemplo.com/tienda/banners/1-a.webp", base), "tienda/banners/1-a.webp");
  assert.equal(keyFromUrl("https://otro.com/tienda/banners/1-a.webp", base), null);
  assert.equal(keyFromUrl("https://media.ejemplo.com/comprobantes/1.pdf", base), null);
  assert.equal(keyFromUrl("https://media.ejemplo.com/tienda/../secreto.txt", base), null);
  assert.equal(keyFromUrl("https://media.ejemplo.com/bucket/tienda/x.webp", "https://media.ejemplo.com/bucket"), "tienda/x.webp");
  assert.equal(keyFromUrl("no url", base), null);
});

test("imageUrlsOf junta las imágenes de banners y categorías", () => {
  assert.deepEqual(
    imageUrlsOf({ banners: [{ imagen: "a", imagenMovil: "b" }, { imagen: "c" }], categorias: [{ imagen: "d" }, {}] }),
    ["a", "b", "c", "d"]
  );
  assert.deepEqual(imageUrlsOf(null), []);
});
