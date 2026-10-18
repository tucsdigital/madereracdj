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

const HOME_ICONS = {
  beneficios: ["truck", "headphones", "shield", "package"],
  pilares: ["sprout", "boxes", "badge", "pin"],
};

export const TIENDA_DEFAULTS = {
  secciones: [
    { id: "ofertas", activa: true, orden: 1, eyebrow: "Ofertas", titulo: "Ofertas especiales", subtitulo: "Precios destacados en maderas y accesorios.", linkLabel: "Ver todos", linkSuffix: " los productos", fondo: "gris", regla: { tipo: "oferta" }, limite: 8, enlace: "/shop?filter=specialOffer" },
    { id: "nuevos", activa: true, orden: 2, eyebrow: "Novedades", titulo: "Nuevos ingresos", subtitulo: "Lo último que sumamos a la tienda.", linkLabel: "Ver todos", linkSuffix: " los productos", fondo: "blanco", regla: { tipo: "nuevos" }, limite: 8, enlace: "/shop?filter=newArrival" },
    { id: "combos", activa: true, orden: 3, eyebrow: "Soluciones listas", titulo: "Combos para tus proyectos", subtitulo: "Todo lo que necesitás, reunido en una sola compra.", linkLabel: "Ver todos", linkSuffix: " los productos", fondo: "gris", regla: { tipo: "combos" }, limite: 8, enlace: "/shop?category=Combos" },
    { id: "revestimientos", activa: true, orden: 4, eyebrow: "Colección", titulo: "Revestimientos", subtitulo: "", linkLabel: "Ver todos", linkSuffix: " los productos", fondo: "gris", regla: { tipo: "categoria", valor: "Revestimientos" }, limite: 8, enlace: "/shop?category=Revestimientos" },
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
    telefono: "011 2178-1148",
    email: "info@maderascaballero.com",
    direccion: "Av. Dr. Honorio Pueyrredón 4625, Villa Rosa, Buenos Aires",
    horarios: [
      { day: "Lunes a viernes", hours: "8:00 a 12:30 y 13:30 a 18:00" },
      { day: "Sábados", hours: "8:00–13:00" },
      { day: "Domingos", hours: "Cerrado" },
    ],
    redes: [{ platform: "TikTok", url: "https://www.tiktok.com/@maderascaballero2" }],
    eyebrow: "Contacto",
    title: "Hablemos de tu próximo proyecto",
    description: "Estamos listos para hacer realidad tu próxima obra en madera.",
    formTitle: "Contanos sobre tu proyecto",
    copy: {
      helpHeading: "Estamos para ayudarte.", whatsappLabel: "WhatsApp", phoneLabel: "Teléfono", emailLabel: "Email", hoursLabel: "Horarios",
      socialFallback: "Red social", nameLabel: "Nombre *", namePlaceholder: "Tu nombre", lastNameLabel: "Apellido *", lastNamePlaceholder: "Tu apellido",
      phoneFieldLabel: "Teléfono", phonePlaceholder: "Tu teléfono", emailFieldLabel: "Email *", emailPlaceholder: "tu@email.com",
      messageLabel: "Mensaje *", messagePlaceholder: "¿Qué te gustaría construir?", requiredNote: "Los campos con * son obligatorios.",
      submitLabel: "Continuar en WhatsApp", submitHelp: "Se abrirá WhatsApp con tu mensaje para que lo envíes.",
      visitHeading: "Vení a visitarnos.", directionsLabel: "Cómo llegar", mapTitle: "Ubicación de Maderas Caballero",
    },
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
  notificacionesPedidos: {
    enabled: false,
    recipients: [],
    events: { created: true, confirmed: true, cancelled: true, paymentFailed: true, review: true },
  },
  inicio: {
    highlights: ["Stock permanente", "Envíos a todo el país", "Asesoramiento", "Obras a medida"],
    categories: { eyebrow: "Tienda", title: "Comprá por material", description: "Elegí la madera adecuada para tu proyecto y recibila en tu obra." },
    benefits: {
      eyebrow: "Por qué elegirnos", title: "Comprá con respaldo", description: "Un equipo que te acompaña desde la elección de la madera hasta la entrega.",
      items: [
        { id: "envios", icon: "truck", title: "Envíos a todo el país", detail: "Pactados previamente según la ubicación y el volumen del pedido." },
        { id: "asesoramiento", icon: "headphones", title: "Asesoramiento", detail: "Orientación en maderas, sistemas y diseño según espacio y uso." },
        { id: "garantia", icon: "shield", title: "Garantía y mantenimiento", detail: "Garantía en nuestras obras y tratamientos protectores periódicos." },
        { id: "stock", icon: "package", title: "Stock permanente", detail: "Maderas, tirantes y accesorios listos para entrega inmediata." },
      ],
    },
    works: { eyebrow: "Tipos de obras", title: "Especialidades en madera", description: "Recorré cada tipo de obra para conocer materiales, detalles constructivos y opciones a medida.", linkLabel: "Ver todas las obras" },
    advisory: {
      badge: "¿Necesitás ayuda?", title: "Empecemos tu próxima obra", description: "Contanos tu idea y recibí asesoramiento sin compromiso para definirla, cotizarla y construirla.",
      image: "/images/footer.png", imageAlt: "Asesoramiento profesional", whatsappLabel: "Escribinos por WhatsApp", worksLabel: "Ver obras",
    },
    about: {
      eyebrow: "Nosotros", title: "Más de 17 años\nconstruyendo en madera.", description: "De Villa Rosa a cada proyecto. Madera de calidad y asesoramiento cercano desde el primer día.",
      image: "/images/nosotros.jpg", imageAlt: "Depósito de maderas de Maderas Caballero", location: "Villa Rosa, Buenos Aires",
      story: [
        { id: "inicio", title: "Cómo empezamos", text: "Nacimos en Villa Rosa con una idea simple: ofrecer madera de calidad y asesoramiento honesto a quienes quieren construir." },
        { id: "crecimiento", title: "Cómo crecimos", text: "Sumamos tirantes, accesorios y ferretería. Después empezamos a construir muelles, decks, pérgolas y tablestacados a medida." },
        { id: "hoy", title: "Dónde estamos hoy", text: "Acompañamos cada proyecto de principio a fin, desde elegir la madera hasta la entrega o la obra terminada." },
      ],
      pillars: [
        { id: "ideas", icon: "sprout", title: "Proyectos que cobran vida", description: "Transformamos tus ideas en espacios reales." },
        { id: "construir", icon: "boxes", title: "Todo para construir", description: "Maderas, tirantes, combos y accesorios en un solo lugar." },
        { id: "calidad", icon: "badge", title: "Calidad que se ve", description: "Materiales seleccionados para resultados duraderos." },
        { id: "local", icon: "pin", title: "Atención local", description: "Asesoramiento cercano y respaldo real." },
      ],
    },
    instagram: { eyebrow: "Instagram", title: "Nuestras obras en redes", description: "Seguí nuestra cuenta para ver nuevos proyectos, proceso de construcción y consejos.", appId: "6b212be4-5e60-411b-8291-0df7de642b0a" },
    offerPopup: { badge: "Oferta Especial", title: "¡Aprovecha!", description: "Producto seleccionado con descuento", buttonLabel: "Ver oferta" },
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
    linkLabel: text(r.linkLabel, 36) || "Ver todos",
    linkSuffix: text(r.linkSuffix, 40) || " los productos",
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

const boundedList = (value, fallback, max) => (Array.isArray(value) ? value : fallback).slice(0, max);
const normalizeHomeTextList = (value, fallback, { maxItems = 12, titleMax = 80, textMax = 240 } = {}) =>
  boundedList(value, fallback, maxItems).map((item, index) => ({
    id: slug(item?.id) || `item-${index + 1}`,
    title: text(item?.title, titleMax),
    text: text(item?.text ?? item?.detail ?? item?.description, textMax),
  }));

function normalizeHome(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const d = TIENDA_DEFAULTS.inicio;
  const benefits = { ...d.benefits, ...(source.benefits || {}) };
  const works = { ...d.works, ...(source.works || {}) };
  const advisory = { ...d.advisory, ...(source.advisory || {}) };
  const about = { ...d.about, ...(source.about || {}) };
  const instagram = { ...d.instagram, ...(source.instagram || {}) };
  const offerPopup = { ...d.offerPopup, ...(source.offerPopup || {}) };
  const categories = { ...d.categories, ...(source.categories || {}) };
  return {
    highlights: boundedList(source.highlights, d.highlights, 6).map((item) => text(item, 48)).filter(Boolean),
    categories: { eyebrow: text(categories.eyebrow, 40), title: text(categories.title, 80), description: text(categories.description, 180) },
    benefits: {
      eyebrow: text(benefits.eyebrow, 40), title: text(benefits.title, 80), description: text(benefits.description, 180),
      items: boundedList(benefits.items, d.benefits.items, 8).map((item, index) => ({
        id: slug(item?.id) || `beneficio-${index + 1}`,
        icon: HOME_ICONS.beneficios.includes(item?.icon) ? item.icon : d.benefits.items[index % d.benefits.items.length].icon,
        title: text(item?.title, 64), detail: text(item?.detail, 180),
      })),
    },
    works: { eyebrow: text(works.eyebrow, 40), title: text(works.title, 80), description: text(works.description, 180), linkLabel: text(works.linkLabel, 36) },
    advisory: {
      badge: text(advisory.badge, 40), title: text(advisory.title, 90), description: text(advisory.description, 220),
      image: text(advisory.image, 500), imageAlt: text(advisory.imageAlt, 140), whatsappLabel: text(advisory.whatsappLabel, 40), worksLabel: text(advisory.worksLabel, 32),
    },
    about: {
      eyebrow: text(about.eyebrow, 40), title: text(about.title, 100), description: text(about.description, 180),
      image: text(about.image, 500), imageAlt: text(about.imageAlt, 140), location: text(about.location, 60),
      story: normalizeHomeTextList(about.story, d.about.story, { maxItems: 5, titleMax: 60, textMax: 220 }),
      pillars: boundedList(about.pillars, d.about.pillars, 6).map((item, index) => ({
        id: slug(item?.id) || `pilar-${index + 1}`,
        icon: HOME_ICONS.pilares.includes(item?.icon) ? item.icon : d.about.pillars[index % d.about.pillars.length].icon,
        title: text(item?.title, 56), description: text(item?.description, 140),
      })),
    },
    instagram: { eyebrow: text(instagram.eyebrow, 40), title: text(instagram.title, 80), description: text(instagram.description, 180), appId: text(instagram.appId, 80) },
    offerPopup: { badge: text(offerPopup.badge, 32), title: text(offerPopup.title, 48), description: text(offerPopup.description, 90), buttonLabel: text(offerPopup.buttonLabel, 32) },
  };
}

function normalizeOrderNotifications(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const events = source.events && typeof source.events === "object" ? source.events : {};
  return {
    enabled: bool(source.enabled, false),
    // Se conserva un elemento de más para que la validación pueda informar el exceso en lugar de truncarlo sin aviso.
    recipients: [...new Set(boundedList(source.recipients, [], 11).map((email) => text(email, 254).toLowerCase()).filter(Boolean))],
    events: {
      created: bool(events.created, true),
      confirmed: bool(events.confirmed, true),
      cancelled: bool(events.cancelled, true),
      paymentFailed: bool(events.paymentFailed, true),
      review: bool(events.review, true),
    },
  };
}

/** Normaliza cualquier entrada. Un bloque ausente toma los valores por defecto; un bloque vacío se respeta. */
export function normalizeTiendaConfig(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const contactoSource = source.contacto && typeof source.contacto === "object" ? source.contacto : {};
  const contacto = {
    ...TIENDA_DEFAULTS.contacto,
    ...contactoSource,
    copy: { ...TIENDA_DEFAULTS.contacto.copy, ...(contactoSource.copy && typeof contactoSource.copy === "object" ? contactoSource.copy : {}) },
  };
  return {
    secciones: list(source.secciones, TIENDA_DEFAULTS.secciones).map(normalizeSeccion),
    banners: list(source.banners, TIENDA_DEFAULTS.banners).map(normalizeBanner),
    categorias: list(source.categorias, TIENDA_DEFAULTS.categorias).map(normalizeCategoria),
    contacto: {
      whatsapp: text(contacto.whatsapp, 20).replace(/\D/g, ""),
      mensajeGeneral: text(contacto.mensajeGeneral, 300),
      mensajeAsesoria: text(contacto.mensajeAsesoria, 300),
      mensajeMenu: text(contacto.mensajeMenu, 300),
      telefono: text(contacto.telefono, 40),
      email: text(contacto.email, 160),
      direccion: text(contacto.direccion, 240),
      horarios: list(contacto.horarios, TIENDA_DEFAULTS.contacto.horarios).slice(0, 14).map((row) => ({
        day: text(row?.day, 60),
        hours: text(row?.hours, 100),
      })),
      redes: list(contacto.redes, TIENDA_DEFAULTS.contacto.redes).slice(0, 12).map((link) => ({
        platform: text(link?.platform, 60),
        url: text(link?.url, 500),
      })),
      eyebrow: text(contacto.eyebrow, 60),
      title: text(contacto.title, 120),
      description: text(contacto.description, 400),
      formTitle: text(contacto.formTitle, 120),
      copy: {
        helpHeading: text(contacto.copy?.helpHeading, 80), whatsappLabel: text(contacto.copy?.whatsappLabel, 40),
        phoneLabel: text(contacto.copy?.phoneLabel, 40), emailLabel: text(contacto.copy?.emailLabel, 40), hoursLabel: text(contacto.copy?.hoursLabel, 40),
        socialFallback: text(contacto.copy?.socialFallback, 40), nameLabel: text(contacto.copy?.nameLabel, 40), namePlaceholder: text(contacto.copy?.namePlaceholder, 60),
        lastNameLabel: text(contacto.copy?.lastNameLabel, 40), lastNamePlaceholder: text(contacto.copy?.lastNamePlaceholder, 60),
        phoneFieldLabel: text(contacto.copy?.phoneFieldLabel, 40), phonePlaceholder: text(contacto.copy?.phonePlaceholder, 60),
        emailFieldLabel: text(contacto.copy?.emailFieldLabel, 40), emailPlaceholder: text(contacto.copy?.emailPlaceholder, 60),
        messageLabel: text(contacto.copy?.messageLabel, 40), messagePlaceholder: text(contacto.copy?.messagePlaceholder, 100),
        requiredNote: text(contacto.copy?.requiredNote, 100), submitLabel: text(contacto.copy?.submitLabel, 50), submitHelp: text(contacto.copy?.submitHelp, 140),
        visitHeading: text(contacto.copy?.visitHeading, 80), directionsLabel: text(contacto.copy?.directionsLabel, 40), mapTitle: text(contacto.copy?.mapTitle, 80),
      },
    },
    inicio: normalizeHome(source.inicio),
    notificacionesPedidos: normalizeOrderNotifications(source.notificacionesPedidos),
    transferencia: normalizeTransferencia(source.transferencia),
    precios: normalizePrecios(source.precios),
    stock: normalizeStock(source.stock),
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
  if (cfg.contacto.telefono && (cfg.contacto.telefono.replace(/\D/g, "").length < 7 || cfg.contacto.telefono.replace(/\D/g, "").length > 15)) {
    add("contacto", null, "telefono", "El teléfono debe tener entre 7 y 15 dígitos.");
  }
  if (cfg.contacto.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cfg.contacto.email)) {
    add("contacto", null, "email", "Ingresá un email válido.");
  }
  cfg.contacto.redes.forEach((link, index) => {
    if (!link.platform) add("contacto", null, `red-${index}-platform`, `La red social #${index + 1} necesita un nombre.`);
    if (link.url) {
      try {
        if (new URL(link.url).protocol !== "https:") throw new Error("invalid protocol");
      } catch {
        add("contacto", null, `red-${index}-url`, `El enlace de la red social #${index + 1} debe usar HTTPS.`);
      }
    }
  });
  const notificationEmails = cfg.notificacionesPedidos.recipients;
  if (notificationEmails.length > 10) issues.push({ scope: "notificaciones", index: null, id: null, field: "recipients", message: "Podés indicar hasta 10 destinatarios para los avisos de pedidos." });
  notificationEmails.forEach((email, index) => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      issues.push({ scope: "notificaciones", index, id: null, field: `recipient-${index}`, message: `El destinatario #${index + 1} no es un email válido.` });
    }
  });
  if (cfg.notificacionesPedidos.enabled && !notificationEmails.length) {
    issues.push({ scope: "notificaciones", index: null, id: null, field: "recipients", message: "Agregá al menos un destinatario para activar los avisos de pedidos." });
  }
  const homeImageHosts = imageHosts;
  for (const [field, value] of [["advisory.image", cfg.inicio.advisory.image], ["about.image", cfg.inicio.about.image]]) {
    if (!value) issues.push({ scope: "obras", index: null, id: null, field, message: `Falta la imagen de Inicio (${field}).` });
    else if (!imageOk(value, homeImageHosts)) issues.push({ scope: "obras", index: null, id: null, field, message: `La imagen de Inicio (${field}) debe ser una ruta propia o cargarse desde la biblioteca del panel.` });
  }
  if (!/^[a-zA-Z0-9-]{8,80}$/.test(cfg.inicio.instagram.appId)) {
    issues.push({ scope: "obras", index: null, id: null, field: "instagram.appId", message: "El identificador del widget de Instagram debe contener entre 8 y 80 letras, números o guiones." });
  }
  const t = cfg.transferencia;
  if (t.cbu && !/^\d{22}$/.test(t.cbu)) add("transferencia", null, "cbu", "El CBU/CVU debe tener 22 dígitos.");
  if (t.alias && !/^[A-Za-z0-9.-]{6,20}$/.test(t.alias)) add("transferencia", null, "alias", "El alias debe tener entre 6 y 20 caracteres (letras, números, puntos o guiones).");
  if (t.cuit && !/^\d{11}$/.test(t.cuit)) add("transferencia", null, "cuit", "El CUIT/CUIL debe tener 11 dígitos.");
  issues.push(...preciosIssues(config?.precios));
  issues.push(...stockIssues(config?.stock));
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
    inicio: cfg.inicio,
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


/* ---------- Venta sin stock y stock bajo ---------- */

export const POLITICAS_STOCK = {
  solo_stock: "Solo con stock",
  bajo_pedido: "Permitir pedido sin stock",
  ocultar: "Ocultar sin stock",
};
export const STOCK_DEFAULTS = {
  activo: false,
  politica: "solo_stock",
  tope: 20,
  plazo: "",
  umbralBajo: 5,
  mostrarCantidad: true,
  etiqueta: "Bajo pedido",
  grupos: [],
  productos: [],
};
export const LIMITES_STOCK = { grupos: 150, productos: 500, tope: 9999, umbral: 999 };

const optInt = (value, max, min = 0) => {
  if (value === "" || value === null || value === undefined) return "";
  const n = Number(String(value).trim().replace(",", "."));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.trunc(n))) : "";
};
const stockRule = (raw) => ({
  politica: Object.prototype.hasOwnProperty.call(POLITICAS_STOCK, raw?.politica) ? raw.politica : "",
  tope: optInt(raw?.tope, LIMITES_STOCK.tope, 1),
  plazo: text(raw?.plazo, 80),
  umbralBajo: optInt(raw?.umbralBajo, LIMITES_STOCK.umbral, 0),
});

export function normalizeStock(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const has = (key) => Object.prototype.hasOwnProperty.call(source, key);
  const baseRule = stockRule(source);
  const seenGroups = new Set();
  const grupos = (Array.isArray(source.grupos) ? source.grupos : [])
    .map((g) => ({ categoria: text(g?.categoria, 120), subcategoria: text(g?.subcategoria, 120), ...stockRule(g) }))
    .filter((g) => g.categoria)
    .filter((g) => {
      const key = `${stripText(g.categoria)}|${stripText(g.subcategoria)}`;
      if (seenGroups.has(key)) return false;
      seenGroups.add(key);
      return true;
    })
    .slice(0, LIMITES_STOCK.grupos);
  const seenProducts = new Set();
  const productos = (Array.isArray(source.productos) ? source.productos : [])
    .map((p) => ({ id: text(p?.id, 80), ...stockRule(p) }))
    .filter((p) => p.id)
    .filter((p) => (seenProducts.has(p.id) ? false : (seenProducts.add(p.id), true)))
    .slice(0, LIMITES_STOCK.productos);
  return {
    activo: source.activo === true,
    politica: baseRule.politica || STOCK_DEFAULTS.politica,
    // Un valor ausente usa los defaults históricos; un campo presente y vacío desactiva esa función.
    tope: has("tope") ? baseRule.tope : STOCK_DEFAULTS.tope,
    plazo: baseRule.plazo,
    umbralBajo: has("umbralBajo") ? baseRule.umbralBajo : STOCK_DEFAULTS.umbralBajo,
    mostrarCantidad: source.mostrarCantidad === false ? false : true,
    etiqueta: has("etiqueta") ? text(source.etiqueta, 40) : STOCK_DEFAULTS.etiqueta,
    grupos,
    productos,
  };
}

export function stockIssues(raw) {
  const issues = [];
  const add = (message) => issues.push({ scope: "stock", index: null, id: null, field: null, message });
  const check = (rule, name) => {
    const rawTope = rule?.tope;
    if (rawTope !== undefined && rawTope !== null && String(rawTope).trim() !== "") {
      const n = Number(String(rawTope).trim().replace(",", "."));
      if (!Number.isFinite(n) || n < 1) add(`${name}: el tope de unidades sin stock debe ser 1 o más.`);
    }
  };
  check(raw, "Ajuste general");
  (Array.isArray(raw?.grupos) ? raw.grupos : []).forEach((g) => check(g, `Categoría ${text(g?.categoria, 40)}`));
  (Array.isArray(raw?.productos) ? raw.productos : []).forEach((p) => check(p, `Producto ${text(p?.id, 40)}`));
  return issues;
}
