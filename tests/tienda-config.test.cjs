const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const source = fs.readFileSync(path.resolve(__dirname, "../lib/tienda-config.js"), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const mod = { exports: {} };
new Function("require", "module", "exports", compiled)(require, mod, mod.exports);
const { TIENDA_DEFAULTS, normalizeTiendaConfig, validateTiendaConfig, publicTiendaConfig } = mod.exports;

test("sin configuración usa los valores que antes estaban fijos en la tienda y son válidos", () => {
  const cfg = normalizeTiendaConfig(undefined);
  assert.equal(cfg.secciones.length, 4);
  assert.equal(cfg.banners.length, 3);
  assert.equal(cfg.categorias.length, 6);
  assert.equal(cfg.contacto.whatsapp, "541121781148");
  assert.equal(cfg.contacto.telefono, "011 2178-1148");
  assert.equal(cfg.contacto.email, "info@maderascaballero.com");
  assert.equal(cfg.contacto.horarios.length, 3);
  assert.deepEqual(cfg.contacto.redes, [{ platform: "TikTok", url: "https://www.tiktok.com/@maderascaballero2" }]);
  assert.deepEqual(validateTiendaConfig(TIENDA_DEFAULTS).errors, []);
});

test("un bloque vacío se respeta y un bloque ausente toma el valor por defecto", () => {
  assert.equal(normalizeTiendaConfig({ banners: [] }).banners.length, 0);
  assert.equal(normalizeTiendaConfig({ banners: [] }).secciones.length, 4);
});

test("normaliza identificadores, límites y reglas desconocidas", () => {
  const cfg = normalizeTiendaConfig({
    secciones: [{ titulo: "Liquidación de Verano!", limite: 999, regla: { tipo: "inventada" } }, { titulo: "Otra", limite: -5 }],
  });
  assert.equal(cfg.secciones[0].id, "liquidacion-de-verano");
  assert.equal(cfg.secciones[0].limite, 24);
  assert.equal(cfg.secciones[0].regla.tipo, "oferta");
  assert.equal(cfg.secciones[1].limite, 1);
});

test("la validación bloquea enlaces peligrosos, reglas incompletas, fechas y ids repetidos", () => {
  const bad = normalizeTiendaConfig({
    secciones: [
      { id: "a", titulo: "A", enlace: "javascript:alert(1)", regla: { tipo: "oferta" } },
      { id: "a", titulo: "B", enlace: "//evil.com", regla: { tipo: "categoria" } },
      { id: "c", titulo: "C", enlace: "/shop", regla: { tipo: "manual", productos: [] } },
      { id: "d", titulo: "D", enlace: "/shop", regla: { tipo: "descuento", minDescuento: 0 } },
    ],
    banners: [{ id: "b", titulo: "B", enlace: "/shop", imagen: "http://inseguro.com/x.png", desde: "2025-02-30", hasta: "" }],
    categorias: [{ id: "k", titulo: "K", enlace: "/shop", imagen: "x.png" }],
    contacto: { whatsapp: "123" },
  });
  const { errors } = validateTiendaConfig(bad);
  for (const pattern of [/enlace/, /repetido/, /categoría/, /producto/, /descuento mínimo/, /imagen/, /fechas/, /WhatsApp/]) {
    assert.ok(errors.some((e) => pattern.test(e)), `falta error ${pattern}`);
  }
});

test("el fin no puede ser anterior al inicio", () => {
  const cfg = { banners: [{ id: "b", titulo: "B", enlace: "/shop", imagen: "/a.png", desde: "2025-05-10", hasta: "2025-05-01" }] };
  assert.ok(validateTiendaConfig(cfg).errors.some((e) => /anterior/.test(e)));
});

test("la vista pública oculta lo inactivo y fuera de fecha, y respeta el orden", () => {
  const now = Date.parse("2025-06-15T12:00:00Z");
  const view = publicTiendaConfig({
    secciones: [
      { id: "b", titulo: "B", orden: 2, activa: true },
      { id: "a", titulo: "A", orden: 1, activa: true },
      { id: "x", titulo: "X", orden: 3, activa: false },
    ],
    banners: [
      { id: "ok", titulo: "OK", imagen: "/a.png", desde: "2025-06-01", hasta: "2025-06-30", orden: 2 },
      { id: "futuro", titulo: "F", imagen: "/a.png", desde: "2025-07-01", orden: 1 },
      { id: "vencido", titulo: "V", imagen: "/a.png", hasta: "2025-06-14", orden: 3 },
      { id: "off", titulo: "O", imagen: "/a.png", activo: false, orden: 4 },
    ],
  }, now);
  assert.deepEqual(view.secciones.map((s) => s.id), ["a", "b"]);
  assert.deepEqual(view.banners.map((b) => b.id), ["ok"]);
});

test("el WhatsApp se limpia a dígitos", () => {
  assert.equal(normalizeTiendaConfig({ contacto: { whatsapp: "+54 11 2178-1148" } }).contacto.whatsapp, "541121781148");
});

test("el contacto global conserva campos nuevos en configuraciones antiguas y los publica", () => {
  const old = normalizeTiendaConfig({ contacto: { whatsapp: "541121781148", mensajeGeneral: "Hola" } });
  assert.equal(old.contacto.telefono, TIENDA_DEFAULTS.contacto.telefono);
  assert.deepEqual(old.contacto.horarios, TIENDA_DEFAULTS.contacto.horarios);
  const view = publicTiendaConfig({ contacto: {
    telefono: "011 5555-1212",
    email: "ventas@example.com",
    direccion: "Calle 1, Buenos Aires",
    horarios: [{ day: "Lunes", hours: "9 a 18" }],
    redes: [{ platform: "Instagram", url: "https://instagram.com/ejemplo" }],
    title: "Contactanos",
  } });
  assert.equal(view.contacto.telefono, "011 5555-1212");
  assert.equal(view.contacto.email, "ventas@example.com");
  assert.deepEqual(view.contacto.horarios, [{ day: "Lunes", hours: "9 a 18" }]);
  assert.deepEqual(view.contacto.redes, [{ platform: "Instagram", url: "https://instagram.com/ejemplo" }]);
  assert.equal(view.contacto.title, "Contactanos");
});

test("el contacto global valida email, teléfono y enlaces sociales seguros", () => {
  const { errors } = validateTiendaConfig({ contacto: {
    telefono: "12",
    email: "no-es-email",
    redes: [{ platform: "Instagram", url: "http://instagram.com/ejemplo" }],
  } });
  assert.ok(errors.some((error) => /teléfono/i.test(error)));
  assert.ok(errors.some((error) => /email válido/i.test(error)));
  assert.ok(errors.some((error) => /red social #1.*HTTPS/.test(error)));
});

test("con dominios autorizados solo se aceptan imágenes de R2 o rutas propias de la tienda", () => {
  const base = {
    banners: [{ id: "b", titulo: "B", enlace: "/shop", imagen: "https://media.ejemplo.com/tienda/banners/1-a.webp" }],
    categorias: [{ id: "c", titulo: "C", enlace: "/shop", imagen: "/images/madera-pino.jpg" }],
  };
  const hosts = ["media.ejemplo.com"];
  assert.deepEqual(validateTiendaConfig(base, { imageHosts: hosts }).errors, []);
  const foreign = { ...base, banners: [{ ...base.banners[0], imagen: "https://evil.com/x.webp", imagenMovil: "https://evil.com/y.webp" }] };
  const errors = validateTiendaConfig(foreign, { imageHosts: hosts }).errors;
  assert.ok(errors.some((e) => /imagen debe subirse/.test(e)));
  assert.ok(errors.some((e) => /imagen móvil/.test(e)));
  // Sin R2 configurado (lista vacía) solo valen las rutas propias.
  assert.ok(validateTiendaConfig(base, { imageHosts: [] }).errors.length > 0);
  assert.deepEqual(validateTiendaConfig({ banners: [{ id: "b", titulo: "B", enlace: "/shop", imagen: "/images/a.png" }] }, { imageHosts: [] }).errors, []);
  // Un host que solo contiene el dominio autorizado como subcadena no engaña a la validación.
  assert.ok(validateTiendaConfig({ banners: [{ id: "b", titulo: "B", enlace: "/shop", imagen: "https://media.ejemplo.com.evil.com/x.webp" }] }, { imageHosts: hosts }).errors.length > 0);
});

test("transferencia: normaliza descuento, CBU, alias y plazo; la vista pública no expone datos bancarios", () => {
  const cfg = normalizeTiendaConfig({ transferencia: { descuentoPct: "7,5 %", cbu: "0000 0031 0000 0123 4567 89", alias: "mader as.cab", plazoHoras: 9999, titular: "  Maderas  " } });
  assert.equal(cfg.transferencia.descuentoPct, 7.5);
  assert.equal(cfg.transferencia.cbu, "0000003100000123456789");
  assert.equal(cfg.transferencia.alias, "maderas.cab");
  assert.equal(cfg.transferencia.plazoHoras, 168);
  assert.equal(cfg.transferencia.titular, "Maderas");
  assert.equal(normalizeTiendaConfig({ transferencia: { descuentoPct: 500 } }).transferencia.descuentoPct, 90);
  assert.equal(normalizeTiendaConfig({ transferencia: { descuentoPct: "abc" } }).transferencia.descuentoPct, 10);
  const publico = publicTiendaConfig({ transferencia: { descuentoPct: 12, cbu: "0000003100000123456789", alias: "mi.alias" } });
  assert.deepEqual(publico.transferencia, { descuentoPct: 12 });
});

test("transferencia: valida formatos y avisa si faltan los datos para transferir", () => {
  const { errors } = validateTiendaConfig({ transferencia: { cbu: "123", alias: "a", cuit: "1" } });
  for (const pattern of [/CBU/, /alias/, /CUIT/]) assert.ok(errors.some((e) => pattern.test(e)), `falta error ${pattern}`);
  assert.ok(validateTiendaConfig(TIENDA_DEFAULTS).warnings.some((w) => /CBU ni alias/.test(w)));
  assert.deepEqual(validateTiendaConfig({ transferencia: { cbu: "0000003100000123456789", alias: "maderas.cab", cuit: "30123456789" } }).errors, []);
});
