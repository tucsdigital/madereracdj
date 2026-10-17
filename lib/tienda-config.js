// Configuración de la tienda web: valores por defecto, normalización, validación y vista pública.
// Es JavaScript puro (sin Firebase) para poder probarlo y usarlo tanto en el servidor como en el panel.

export const REGLAS_SECCION = {
  oferta: "Productos en oferta",
  nuevos: "Nuevos ingresos",
  combos: "Combos",
  categoria: "Una categoría",
  descuento: "Con descuento mínimo",
  manual: "Selección manual",
};

export const LIMITES = { secciones: 20, banners: 10, categorias: 24, productosManuales: 48 };

export const TIENDA_DEFAULTS = {
  secciones: [
    { id: "ofertas", activa: true, orden: 1, eyebrow: "Ofertas", titulo: "Ofertas especiales", subtitulo: "Precios destacados en maderas y accesorios.", fondo: "gris", regla: { tipo: "oferta" }, limite: 8, enlace: "/shop?filter=specialOffer" },
    { id: "nuevos", activa: true, orden: 2, eyebrow: "Novedades", titulo: "Nuevos ingresos", subtitulo: "Lo último que sumamos a la tienda.", fondo: "blanco", regla: { tipo: "nuevos" }, limite: 8, enlace: "/shop?filter=newArrival" },
    { id: "combos", activa: true, orden: 3, eyebrow: "Soluciones listas", titulo: "Combos para tus proyectos", subtitulo: "Todo lo que necesitás, reunido en una sola compra.", fondo: "gris", regla: { tipo: "combos" }, limite: 8, enlace: "/shop?category=Combos" },
    { id: "revestimientos", activa: true, orden: 4, eyebrow: "Colección", titulo: "Revestimientos", subtitulo: "", fondo: "gris", regla: { tipo: "categoria", valor: "Revestimientos" }, limite: 8, enlace: "/shop?category=Revestimientos" },
  ],
  banners: [
    { id: "maderas", activo: true, orden: 1, titulo: "Maderas seleccionadas", enlace: "/shop", imagen: "/images/Banner_1.png", imagenMovil: "/images/Banner_1.png", alt: "Maderas seleccionadas para construir", desde: "", hasta: "" },
    { id: "ofertas", activo: true, orden: 2, titulo: "Ofertas especiales", enlace: "/shop?filter=specialOffer", imagen: "/images/Banner_2.png", imagenMovil: "/images/Banner_2.png", alt: "Ofertas especiales en maderas y accesorios", desde: "", hasta: "" },
    { id: "obras", activo: true, orden: 3, titulo: "Obras a medida", enlace: "/obras", imagen: "/images/obras/banner_1.png", imagenMovil: "/images/obras/banner_1_mobile.png", alt: "Obras en madera a medida", desde: "", hasta: "" },
  ],
  categorias: [
    { id: "pino", activa: true, orden: 1, titulo: "Pino", etiqueta: "Madera", enlace: "/shop?madera=pino", imagen: "/images/madera-pino.jpg" },
    { id: "eucalipto", activa: true, orden: 2, titulo: "Eucalipto", etiqueta: "Madera", enlace: "/shop?madera=eucalipto", imagen: "/images/madera-eucalipto.jpg" },
    { id: "saligna", activa: true, orden: 3, titulo: "Saligna", etiqueta: "Madera", enlace: "/shop?madera=saligna", imagen: "/images/madera-saligna.jpg" },
    { id: "quebracho", activa: true, orden: 4, titulo: "Quebracho", etiqueta: "Madera", enlace: "/shop?madera=quebracho", imagen: "/images/madera-quebracho.jpg" },
    { id: "grandis", activa: true, orden: 5, titulo: "Grandis", etiqueta: "Madera", enlace: "/shop?madera=grandis", imagen: "/images/madera-grandis.jpg" },
    { id: "ferreteria", activa: true, orden: 6, titulo: "Ferretería", etiqueta: "Accesorios", enlace: "/shop?category=ferretería", imagen: "/images/ferreteria.jpg" },
  ],
  contacto: {
    whatsapp: "541121781148",
    mensajeGeneral: "Hola! Me gustaría obtener más información sobre sus productos.",
    mensajeAsesoria: "Hola! Quiero cotizar una obra de madera.",
    mensajeMenu: "Hola! Quiero consultar por un proyecto de madera.",
  },
  // El porcentaje es el que la tienda mostraba hasta ahora. Los datos bancarios se cargan desde el panel.
  transferencia: {
    descuentoPct: 10,
    titular: "",
    banco: "",
    tipoCuenta: "",
    cbu: "",
    alias: "",
    cuit: "",
    plazoHoras: 24,
    instrucciones: "",
  },
};

const text = (value, max = 200) => String(value ?? "").trim().slice(0, max);
const bool = (value, fallback = true) => (typeof value === "boolean" ? value : fallback);
const int = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
};
const slug = (value) =>
  text(value, 60).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

const list = (raw, fallback) => (Array.isArray(raw) ? raw : fallback);

function normalizeSeccion(raw, index) {
  const r = raw || {};
  const tipo = Object.prototype.hasOwnProperty.call(REGLAS_SECCION, r.regla?.tipo) ? r.regla.tipo : "oferta";
  return {
    id: slug(r.id) || slug(r.titulo) || `seccion-${index + 1}`,
    activa: bool(r.activa),
    orden: int(r.orden, index + 1),
    eyebrow: text(r.eyebrow, 60),
    titulo: text(r.titulo, 90),
    subtitulo: text(r.subtitulo, 200),
    fondo: r.fondo === "blanco" ? "blanco" : "gris",
    regla: {
      tipo,
      valor: text(r.regla?.valor, 80),
      minDescuento: Math.min(100, Math.max(0, Number(r.regla?.minDescuento) || 0)),
      productos: (Array.isArray(r.regla?.productos) ? r.regla.productos : []).map((id) => text(id, 80)).filter(Boolean).slice(0, LIMITES.productosManuales),
    },
    limite: Math.min(24, Math.max(1, int(r.limite, 8))),
    enlace: text(r.enlace, 300) || "/shop",
  };
}

const normalizeBanner = (raw, index) => ({
  id: slug(raw?.id) || slug(raw?.titulo) || `banner-${index + 1}`,
  activo: bool(raw?.activo),
  orden: int(raw?.orden, index + 1),
  titulo: text(raw?.titulo, 80),
  enlace: text(raw?.enlace, 300) || "/shop",
  imagen: text(raw?.imagen, 500),
  imagenMovil: text(raw?.imagenMovil, 500) || text(raw?.imagen, 500),
  alt: text(raw?.alt, 160) || text(raw?.titulo, 160),
  desde: text(raw?.desde, 10),
  hasta: text(raw?.hasta, 10),
});

const normalizeCategoria = (raw, index) => ({
  id: slug(raw?.id) || slug(raw?.titulo) || `categoria-${index + 1}`,
  activa: bool(raw?.activa),
  orden: int(raw?.orden, index + 1),
  titulo: text(raw?.titulo, 60),
  etiqueta: text(raw?.etiqueta, 40),
  enlace: text(raw?.enlace, 300) || "/shop",
  imagen: text(raw?.imagen, 500),
});

/** Descuento por transferencia: acepta "10", "10 %", "7,5". Devuelve un porcentaje entre 0 y 90. */
const percent = (value, fallback) => {
  const n = Number(String(value ?? "").trim().replace(",", ".").replace("%", ""));
  return Number.isFinite(n) ? Math.min(90, Math.max(0, Math.round(n * 100) / 100)) : fallback;
};

export function normalizeTransferencia(raw) {
  const source = { ...TIENDA_DEFAULTS.transferencia, ...(raw && typeof raw === "object" ? raw : {}) };
  return {
    descuentoPct: percent(source.descuentoPct, TIENDA_DEFAULTS.transferencia.descuentoPct),
    titular: text(source.titular, 80),
    banco: text(source.banco, 60),
    tipoCuenta: text(source.tipoCuenta, 40),
    cbu: text(source.cbu, 30).replace(/\D/g, ""),
    alias: text(source.alias, 30).replace(/\s/g, ""),
    cuit: text(source.cuit, 20).replace(/\D/g, ""),
    plazoHoras: Math.min(168, Math.max(1, int(source.plazoHoras, TIENDA_DEFAULTS.transferencia.plazoHoras))),
    instrucciones: text(source.instrucciones, 300),
  };
}

/** Normaliza cualquier entrada. Un bloque ausente toma los valores por defecto; un bloque vacío se respeta. */
export function normalizeTiendaConfig(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const contacto = { ...TIENDA_DEFAULTS.contacto, ...(source.contacto && typeof source.contacto === "object" ? source.contacto : {}) };
  return {
    secciones: list(source.secciones, TIENDA_DEFAULTS.secciones).map(normalizeSeccion),
    banners: list(source.banners, TIENDA_DEFAULTS.banners).map(normalizeBanner),
    categorias: list(source.categorias, TIENDA_DEFAULTS.categorias).map(normalizeCategoria),
    contacto: {
      whatsapp: text(contacto.whatsapp, 20).replace(/\D/g, ""),
      mensajeGeneral: text(contacto.mensajeGeneral, 300),
      mensajeAsesoria: text(contacto.mensajeAsesoria, 300),
      mensajeMenu: text(contacto.mensajeMenu, 300),
    },
    transferencia: normalizeTransferencia(source.transferencia),
    precios: normalizePrecios(source.precios),
  };
}

const safeLink = (value) => /^(\/(?!\/)|https:\/\/)/.test(value) && !/\s/.test(value);
const hostOf = (value) => {
  try {
    return new URL(value).host.toLowerCase();
  } catch {
    return "";
  }
};
/** Rutas propias de la tienda ("/images/...") o URLs https; con `hosts` sólo se aceptan dominios autorizados. */
const imageOk = (value, hosts) => {
  if (!/^(\/(?!\/)|https:\/\/)/.test(value) || /\s/.test(value)) return false;
  if (value.startsWith("/") || !Array.isArray(hosts)) return true;
  return hosts.includes(hostOf(value));
};
const validDate = (value) => {
  if (value === "") return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  // Compara de ida y vuelta para rechazar días inexistentes como 2025-02-30.
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

/**
 * Problemas de la configuración. Cada uno indica dónde está (`scope`, posición y campo) para que el panel
 * pueda marcar el campo exacto. Trabaja sobre la configuración normalizada.
 */
export function tiendaIssues(config, { imageHosts } = {}) {
  const cfg = normalizeTiendaConfig(config);
  const issues = [];
  const add = (scope, index, field, message) => issues.push({ scope, index, id: index === null ? null : cfg[scope]?.[index]?.id ?? null, field, message });

  const maximos = [["secciones", "secciones"], ["banners", "banners"], ["categorias", "categorías"]];
  for (const [key, label] of maximos) {
    if (cfg[key].length > LIMITES[key]) add(key, null, null, `Hay más de ${LIMITES[key]} ${label}.`);
  }
  for (const [key, label] of maximos) {
    const seen = new Set();
    cfg[key].forEach((item, index) => {
      if (seen.has(item.id)) add(key, index, "titulo", `Hay ${label} con identificador repetido; cambiá el título.`);
      seen.add(item.id);
    });
  }

  cfg.secciones.forEach((s, i) => {
    const name = s.titulo || `Sección #${i + 1}`;
    if (!s.titulo) add("secciones", i, "titulo", `Sección #${i + 1}: falta el título.`);
    if (!safeLink(s.enlace)) add("secciones", i, "enlace", `${name}: el enlace no es válido (debe empezar con "/" o "https://").`);
    if (s.regla.tipo === "categoria" && !s.regla.valor) add("secciones", i, "valor", `${name}: indicá la categoría.`);
    if (s.regla.tipo === "descuento" && !(s.regla.minDescuento > 0)) add("secciones", i, "minDescuento", `${name}: indicá el descuento mínimo (mayor a 0).`);
    if (s.regla.tipo === "manual" && !s.regla.productos.length) add("secciones", i, "productos", `${name}: elegí al menos un producto.`);
  });
  cfg.banners.forEach((b, i) => {
    const name = b.titulo || `Banner #${i + 1}`;
    if (!b.titulo) add("banners", i, "titulo", `Banner #${i + 1}: falta el título.`);
    if (!b.imagen) add("banners", i, "imagen", `${name}: falta la imagen.`);
    else if (!imageOk(b.imagen, imageHosts)) add("banners", i, "imagen", `${name}: la imagen debe subirse desde el panel.`);
    if (b.imagenMovil && !imageOk(b.imagenMovil, imageHosts)) add("banners", i, "imagenMovil", `${name}: la imagen móvil debe subirse desde el panel.`);
    if (!safeLink(b.enlace)) add("banners", i, "enlace", `${name}: el enlace no es válido (debe empezar con "/" o "https://").`);
    if (!validDate(b.desde) || !validDate(b.hasta)) add("banners", i, "fechas", `${name}: las fechas no son válidas.`);
    else if (b.desde && b.hasta && b.hasta < b.desde) add("banners", i, "fechas", `${name}: la fecha de fin es anterior a la de inicio.`);
  });
  cfg.categorias.forEach((c, i) => {
    const name = c.titulo || `Categoría #${i + 1}`;
    if (!c.titulo) add("categorias", i, "titulo", `Categoría #${i + 1}: falta el título.`);
    if (!c.imagen) add("categorias", i, "imagen", `${name}: falta la imagen.`);
    else if (!imageOk(c.imagen, imageHosts)) add("categorias", i, "imagen", `${name}: la imagen debe subirse desde el panel.`);
    if (!safeLink(c.enlace)) add("categorias", i, "enlace", `${name}: el enlace no es válido (debe empezar con "/" o "https://").`);
  });
  if (cfg.contacto.whatsapp && !/^\d{10,15}$/.test(cfg.contacto.whatsapp)) {
    add("contacto", null, "whatsapp", "El WhatsApp debe tener entre 10 y 15 dígitos, con código de país (ej: 541121781148).");
  }
  const t = cfg.transferencia;
  if (t.cbu && !/^\d{22}$/.test(t.cbu)) add("transferencia", null, "cbu", "El CBU/CVU debe tener 22 dígitos.");
  if (t.alias && !/^[A-Za-z0-9.-]{6,20}$/.test(t.alias)) add("transferencia", null, "alias", "El alias debe tener entre 6 y 20 caracteres (letras, números, puntos o guiones).");
  if (t.cuit && !/^\d{11}$/.test(t.cuit)) add("transferencia", null, "cuit", "El CUIT/CUIL debe tener 11 dígitos.");
  issues.push(...preciosIssues(config?.precios));
  return issues;
}

/** Errores bloqueantes (texto) y avisos para el panel. */
export function validateTiendaConfig(config, options = {}) {
  const cfg = normalizeTiendaConfig(config);
  const warnings = [];
  if (!cfg.contacto.whatsapp) warnings.push("Sin WhatsApp: los botones de contacto no se mostrarán.");
  if (!cfg.transferencia.cbu && !cfg.transferencia.alias) warnings.push("Sin CBU ni alias: quienes paguen por transferencia no verán a dónde transferir.");
  if (!cfg.banners.some((b) => b.activo)) warnings.push("No hay banners visibles: el carrusel del inicio no se mostrará.");
  if (!cfg.secciones.some((s) => s.activa)) warnings.push("No hay secciones visibles en el inicio.");
  return { errors: tiendaIssues(config, options).map((issue) => issue.message), warnings };
}

/** Fecha de hoy en Argentina (AAAA-MM-DD); las campañas se programan con el día local, no en UTC. */
export const todayAR = (now = Date.now()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(now));

/** Vista pública: sólo lo activo y vigente, ordenado. */
export function publicTiendaConfig(config, now = Date.now()) {
  const cfg = normalizeTiendaConfig(config);
  const day = todayAR(now);
  const byOrder = (a, b) => a.orden - b.orden;
  return {
    secciones: cfg.secciones.filter((s) => s.activa).sort(byOrder),
    banners: cfg.banners
      .filter((b) => b.activo && b.imagen && (!b.desde || b.desde <= day) && (!b.hasta || b.hasta >= day))
      .sort(byOrder),
    categorias: cfg.categorias.filter((c) => c.activa).sort(byOrder),
    contacto: cfg.contacto,
    // Los datos bancarios no son públicos: sólo se entregan junto a un pedido por transferencia.
    transferencia: { descuentoPct: cfg.transferencia.descuentoPct },
  };
}

/* ---------- Precios de la tienda online ---------- */

const parseMoney = (value) => {
  const raw = String(value ?? "").trim().replace(/\s+/g, "");
  if (!raw) return 0;
  const s = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};
const stripText = (value) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
export const PRECIOS_DEFAULTS = { activo: false, globalPct: 0, redondeo: 100, grupos: [], productos: [] };
export const PCT_MIN = -50;
export const PCT_MAX = 300;
// El sistema siempre redondea los precios a $100; el ajuste puede subir ese redondeo a $1000.
export const REDONDEOS = [100, 1000];
export const LIMITES_PRECIOS = { grupos: 150, productos: 500 };
export const MODOS = ["pct", "fijo", "ninguno"];

const pct = (value, fallback = 0) => {
  const n = Number(String(value ?? "").trim().replace(",", ".").replace("%", ""));
  return Number.isFinite(n) ? Math.min(PCT_MAX, Math.max(PCT_MIN, Math.round(n * 100) / 100)) : fallback;
};
const money = (value) => {
  const n = parseMoney(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
};

export function normalizePrecios(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const seenGroups = new Set();
  const grupos = (Array.isArray(source.grupos) ? source.grupos : [])
    .map((g) => ({ categoria: text(g?.categoria), subcategoria: text(g?.subcategoria), pct: pct(g?.pct) }))
    .filter((g) => g.categoria)
    .filter((g) => {
      const key = `${stripText(g.categoria)}|${stripText(g.subcategoria)}`;
      if (seenGroups.has(key)) return false;
      seenGroups.add(key);
      return true;
    })
    .slice(0, LIMITES_PRECIOS.grupos);
  const seenProducts = new Set();
  const productos = (Array.isArray(source.productos) ? source.productos : [])
    .map((p) => {
      const modo = MODOS.includes(p?.modo) ? p.modo : "pct";
      return { id: text(p?.id, 80), modo, valor: modo === "fijo" ? money(p?.valor) : modo === "pct" ? pct(p?.valor) : 0 };
    })
    .filter((p) => p.id)
    .filter((p) => (seenProducts.has(p.id) ? false : (seenProducts.add(p.id), true)))
    .slice(0, LIMITES_PRECIOS.productos);
  return {
    activo: source.activo === true,
    globalPct: pct(source.globalPct),
    redondeo: REDONDEOS.includes(Number(source.redondeo)) ? Number(source.redondeo) : 100,
    grupos,
    productos,
  };
}

export function preciosIssues(raw) {
  const issues = [];
  (Array.isArray(raw?.productos) ? raw.productos : []).forEach((p) => {
    if (p?.modo === "fijo" && !(money(p.valor) > 0)) issues.push({ scope: "precios", index: null, id: null, field: "productos", message: `Precio fijo inválido en el producto ${text(p?.id, 40)}: ingresá un monto mayor a 0.` });
  });
  return issues;
}

