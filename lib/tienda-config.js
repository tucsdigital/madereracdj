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

/** Errores bloqueantes y avisos para el panel. Trabaja sobre la configuración normalizada. */
export function validateTiendaConfig(config, { imageHosts } = {}) {
  const cfg = normalizeTiendaConfig(config);
  const errors = [];
  const warnings = [];
  const maximos = [["secciones", "secciones"], ["banners", "banners"], ["categorias", "categorías"]];
  for (const [key, label] of maximos) {
    if (cfg[key].length > LIMITES[key]) errors.push(`Hay más de ${LIMITES[key]} ${label}.`);
  }
  const repeated = (items, label) => {
    const ids = items.map((item) => item.id);
    if (new Set(ids).size !== ids.length) errors.push(`Hay ${label} con identificador repetido; cambiá el título o el identificador.`);
  };
  repeated(cfg.secciones, "secciones");
  repeated(cfg.banners, "banners");
  repeated(cfg.categorias, "categorías");

  cfg.secciones.forEach((s, i) => {
    const name = s.titulo || `Sección #${i + 1}`;
    if (!s.titulo) errors.push(`Sección #${i + 1}: falta el título.`);
    if (!safeLink(s.enlace)) errors.push(`${name}: el enlace debe empezar con "/" o "https://".`);
    if (s.regla.tipo === "categoria" && !s.regla.valor) errors.push(`${name}: indicá la categoría.`);
    if (s.regla.tipo === "descuento" && !(s.regla.minDescuento > 0)) errors.push(`${name}: indicá el descuento mínimo (mayor a 0).`);
    if (s.regla.tipo === "manual" && !s.regla.productos.length) errors.push(`${name}: elegí al menos un producto.`);
  });
  cfg.banners.forEach((b, i) => {
    const name = b.titulo || `Banner #${i + 1}`;
    if (!b.titulo) errors.push(`Banner #${i + 1}: falta el título.`);
    if (!imageOk(b.imagen, imageHosts)) errors.push(`${name}: la imagen debe subirse desde el panel o ser una ruta propia de la tienda ("/images/...").`);
    if (b.imagenMovil && !imageOk(b.imagenMovil, imageHosts)) errors.push(`${name}: la imagen móvil debe subirse desde el panel o ser una ruta propia de la tienda.`);
    if (!safeLink(b.enlace)) errors.push(`${name}: el enlace debe empezar con "/" o "https://".`);
    if (!validDate(b.desde) || !validDate(b.hasta)) errors.push(`${name}: las fechas deben tener formato AAAA-MM-DD.`);
    else if (b.desde && b.hasta && b.hasta < b.desde) errors.push(`${name}: la fecha de fin es anterior a la de inicio.`);
  });
  cfg.categorias.forEach((c, i) => {
    const name = c.titulo || `Categoría #${i + 1}`;
    if (!c.titulo) errors.push(`Categoría #${i + 1}: falta el título.`);
    if (!imageOk(c.imagen, imageHosts)) errors.push(`${name}: la imagen debe subirse desde el panel o ser una ruta propia de la tienda ("/images/...").`);
    if (!safeLink(c.enlace)) errors.push(`${name}: el enlace debe empezar con "/" o "https://".`);
  });
  if (cfg.contacto.whatsapp && !/^\d{10,15}$/.test(cfg.contacto.whatsapp)) {
    errors.push("El WhatsApp debe tener entre 10 y 15 dígitos, con código de país (ej: 541121781148).");
  }
  if (!cfg.contacto.whatsapp) warnings.push("Sin WhatsApp: los botones de contacto no se mostrarán.");
  if (!cfg.banners.some((b) => b.activo)) warnings.push("No hay banners activos: el carrusel y su bloque de destacados no se mostrarán en el inicio.");
  if (!cfg.secciones.some((s) => s.activa)) warnings.push("No hay secciones activas en el inicio.");
  return { errors, warnings };
}

const today = (now) => new Date(now).toISOString().slice(0, 10);

/** Vista pública: sólo lo activo y vigente, ordenado. */
export function publicTiendaConfig(config, now = Date.now()) {
  const cfg = normalizeTiendaConfig(config);
  const day = today(now);
  const byOrder = (a, b) => a.orden - b.orden;
  return {
    secciones: cfg.secciones.filter((s) => s.activa).sort(byOrder),
    banners: cfg.banners
      .filter((b) => b.activo && b.imagen && (!b.desde || b.desde <= day) && (!b.hasta || b.hasta >= day))
      .sort(byOrder),
    categorias: cfg.categorias.filter((c) => c.activa).sort(byOrder),
    contacto: cfg.contacto,
  };
}
