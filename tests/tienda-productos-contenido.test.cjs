const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const source = fs.readFileSync(path.resolve(__dirname, "../lib/tienda-productos-contenido.js"), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const mod = { exports: {} };
new Function("require", "module", "exports", compiled)(require, mod, mod.exports);
const { normalizeProductContent, resolveProductContent, productContentIssues, productContentImageUrls } = mod.exports;

const product = {
  id: "pino-18",
  nombre: "Pino 18 mm",
  descripcion: "Descripción del catálogo",
  categoria: "Maderas",
  subcategoria: "Machimbre",
  tipoMadera: "Pino",
  tipoProducto: "Simple",
  unidadMedida: "m2",
  imagenes: ["https://catalogo.example/pino.jpg"],
};

test("hereda contenido de global a categoría, subcategoría y excepción de producto", () => {
  const config = normalizeProductContent({
    global: { description: "Base global", images: [{ url: "https://media.example.com/tienda/productos/global.webp" }] },
    rules: [
      { id: "categoria", match: { categoria: "maderas" }, content: { description: "Texto de maderas", images: [{ url: "https://media.example.com/tienda/productos/maderas.webp" }] } },
      { id: "subcategoria", match: { subcategoria: "machimbre" }, content: { description: "Texto de machimbre" } },
    ],
    products: { "pino-18": { description: "Texto específico" } },
  });
  const result = resolveProductContent(product, config);
  assert.equal(result.description, "Texto específico");
  assert.equal(result.images[0].url, "https://media.example.com/tienda/productos/maderas.webp");
  assert.equal(result.source.description, "producto");
  assert.equal(result.source.images, "categoria");
});

test("una regla de subcategoría prevalece sobre categoría sin depender del orden", () => {
  const config = {
    rules: [
      { id: "sub", order: 0, match: { subcategoria: "Machimbre" }, content: { description: "Más específico" } },
      { id: "cat", order: 99, match: { categoria: "Maderas" }, content: { description: "Categoría" } },
    ],
  };
  assert.equal(resolveProductContent(product, config).description, "Más específico");
});

test("las descripciones editoriales son texto plano y el contenido comercial se conserva", () => {
  const config = normalizeProductContent({ global: { description: "<script>alert(1)</script><b>Descripción segura</b>" } });
  const result = resolveProductContent(product, config);
  assert.equal(result.description, "alert(1)Descripción segura");
  assert.equal(product.id, "pino-18");
  assert.equal(product.descripcion, "Descripción del catálogo");
  assert.equal(product.unidadMedida, "m2");
});

test("las imágenes compartidas se normalizan, validan y quedan protegidas de la limpieza", () => {
  const config = normalizeProductContent({
    global: { images: [{ url: "https://media.example.com/tienda/productos/global.webp", alt: "Pino" }] },
    rules: [{ id: "maderas", match: { categoria: "Maderas" }, content: { images: [{ url: "/images/fallback.webp" }] } }],
    products: { "pino-18": { images: [{ url: "https://evil.example/image.jpg" }] } },
  });
  assert.deepEqual(productContentImageUrls(config).sort(), [
    "/images/fallback.webp",
    "https://evil.example/image.jpg",
    "https://media.example.com/tienda/productos/global.webp",
  ]);
  const issues = productContentIssues(config, ["media.example.com"]);
  assert.equal(issues.length, 1);
  assert.match(issues[0], /biblioteca/);
});

test("sin override usa imagen y descripción del catálogo", () => {
  const result = resolveProductContent(product, null);
  assert.equal(result.description, "Descripción del catálogo");
  assert.equal(result.images[0].url, "https://catalogo.example/pino.jpg");
});

test("respeta galerías legacy con varias URLs en una cadena", () => {
  const result = resolveProductContent({ ...product, imagenes: "https://catalogo.example/uno.jpg, https://catalogo.example/dos.jpg" }, null);
  assert.deepEqual(result.images.map((image) => image.url), [
    "https://catalogo.example/uno.jpg",
    "https://catalogo.example/dos.jpg",
  ]);
});

test("un nivel con una lista de imágenes vacía hereda el nivel previo", () => {
  const result = resolveProductContent(product, {
    global: { images: [{ url: "https://media.example.com/tienda/productos/global.webp" }] },
    rules: [{ id: "maderas", match: { categoria: "Maderas" }, content: { images: [] } }],
  });
  assert.equal(result.images[0].url, "https://media.example.com/tienda/productos/global.webp");
});
