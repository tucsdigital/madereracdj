const get = (obj, path) => {
  const parts = String(path || "").split(".").filter(Boolean);
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return "";
    cur = cur[p];
  }
  if (cur == null) return "";
  if (typeof cur === "string") return cur;
  if (typeof cur === "number") return String(cur);
  return "";
};

export const renderTemplateHtml = (html, ctx) => {
  const source = String(html || "");
  return source.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, key) => {
    const value = get(ctx, key);
    return String(value || "");
  });
};

export const buildContextFromObra = (obra) => {
  const cliente = obra?.cliente || {};
  const ubicacion = obra?.ubicacion || {};
  const fechas = obra?.fechas || {};
  const fechaAr = new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date());
  return {
    obra: {
      id: obra?.id || "",
      numeroPedido: obra?.numeroPedido || "",
      tipo: obra?.tipo || "",
      estado: obra?.estado || "",
      descripcion: obra?.descripcion || obra?.descripcionGeneral || "",
      responsable: obra?.responsable || obra?.responsableNombre || "",
      fechaInicio: fechas?.inicio || "",
      fechaFin: fechas?.fin || "",
    },
    cliente: {
      id: obra?.clienteId || "",
      nombre: cliente?.nombre || obra?.clienteNombre || "",
      telefono: cliente?.telefono || "",
      email: cliente?.email || "",
      cuit: cliente?.cuit || "",
      direccion: cliente?.direccion || "",
      localidad: cliente?.localidad || "",
      provincia: cliente?.provincia || "",
      partido: cliente?.partido || "",
    },
    ubicacion: {
      direccion: ubicacion?.direccion || cliente?.direccion || "",
      localidad: ubicacion?.localidad || cliente?.localidad || "",
      provincia: ubicacion?.provincia || cliente?.provincia || "",
      partido: ubicacion?.partido || cliente?.partido || "",
      barrio: ubicacion?.barrio || "",
      area: ubicacion?.area || "",
      lote: ubicacion?.lote || "",
      descripcion: ubicacion?.descripcion || "",
    },
    empresa: {
      nombre: "Maderas Caballero",
      web: "www.caballeromaderas.com",
      instagram: "@maderas_caballero",
      telefono: "11-3497-6239",
      direccion: "Av. Dr. Honorio Pueyrredón 4625, Villa Rosa, Buenos Aires",
    },
    ahora: {
      iso: new Date().toISOString(),
      fecha: new Date().toISOString().slice(0, 10),
      fechaAr,
      hora: new Date().toTimeString().slice(0, 5),
    },
  };
};

export const buildContextManual = (data) => ({
  ...data,
  ahora: {
    iso: new Date().toISOString(),
    fecha: new Date().toISOString().slice(0, 10),
    fechaAr: new Intl.DateTimeFormat("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(new Date()),
    hora: new Date().toTimeString().slice(0, 5),
  },
});

export const buildContextFromDraft = ({ obra = null, cliente = null, ubicacion = null } = {}) => {
  const base = buildContextFromObra(obra || null);
  const next = { ...base };

  if (cliente && typeof cliente === "object") {
    next.cliente = {
      ...next.cliente,
      id: String(cliente.id || next.cliente?.id || ""),
      nombre: String(cliente.nombre || next.cliente?.nombre || ""),
      telefono: String(cliente.telefono || next.cliente?.telefono || ""),
      email: String(cliente.email || next.cliente?.email || ""),
      cuit: String(cliente.cuit || next.cliente?.cuit || ""),
      direccion: String(cliente.direccion || next.cliente?.direccion || ""),
      localidad: String(cliente.localidad || next.cliente?.localidad || ""),
      provincia: String(cliente.provincia || next.cliente?.provincia || ""),
      partido: String(cliente.partido || next.cliente?.partido || ""),
    };
  }

  if (ubicacion && typeof ubicacion === "object") {
    next.ubicacion = {
      ...next.ubicacion,
      direccion: String(ubicacion.direccion || next.ubicacion?.direccion || ""),
      localidad: String(ubicacion.localidad || next.ubicacion?.localidad || ""),
      provincia: String(ubicacion.provincia || next.ubicacion?.provincia || ""),
      partido: String(ubicacion.partido || next.ubicacion?.partido || ""),
      barrio: String(ubicacion.barrio || next.ubicacion?.barrio || ""),
      area: String(ubicacion.area || next.ubicacion?.area || ""),
      lote: String(ubicacion.lote || next.ubicacion?.lote || ""),
      descripcion: String(ubicacion.descripcion || next.ubicacion?.descripcion || ""),
    };
  }

  next.inputs = {};
  return next;
};

export const DEFAULT_RECIBO_TEMPLATE = {
  nombre: "Recibo de Conformidad y Mantenimiento",
  fields: [
    { key: "fecha", label: "Fecha", kind: "date", required: true, defaultValue: "{{ahora.fechaAr}}" },
    { key: "obraNumero", label: "Obra N° (opcional)", kind: "text", required: false, defaultValue: "{{obra.numeroPedido}}" },
    { key: "clienteNombre", label: "Nombre y Apellido", kind: "text", required: true, defaultValue: "{{cliente.nombre}}" },
    { key: "clienteDniCuit", label: "DNI / CUIT", kind: "text", required: true, defaultValue: "{{cliente.cuit}}" },
    { key: "clienteTelefono", label: "Teléfono", kind: "text", required: true, defaultValue: "{{cliente.telefono}}" },
    { key: "ubicacionObra", label: "Ubicación de la obra", kind: "text", required: true, defaultValue: "{{ubicacion.direccion}}" },
    { key: "detalleTrabajos", label: "Detalle de los trabajos", kind: "textarea", required: true, defaultValue: "{{obra.descripcion}}" },
  ],
  bodyHtml: [
    "<div style=\"font-size:15px; line-height:1.6; color:#111827;\">",
    "<div style=\"font-weight:900; font-size:18px; margin-bottom:8px;\">RECIBO DE CONFORMIDAD Y MANTENIMIENTO</div>",
    "<div style=\"margin-bottom:6px;\"><strong>FECHA:</strong> {{inputs.fecha}}</div>",
    "<div style=\"margin-bottom:12px;\"><strong>OBRA N°:</strong> {{inputs.obraNumero}}</div>",
    "<div style=\"font-weight:800; margin-bottom:6px;\">1. DATOS DEL CLIENTE</div>",
    "<div style=\"margin-bottom:4px;\"><strong>Nombre y Apellido:</strong> {{inputs.clienteNombre}}</div>",
    "<div style=\"margin-bottom:4px;\"><strong>DNI / CUIT:</strong> {{inputs.clienteDniCuit}}</div>",
    "<div style=\"margin-bottom:4px;\"><strong>Teléfono:</strong> {{inputs.clienteTelefono}}</div>",
    "<div style=\"margin-bottom:10px;\"><strong>Ubicación de la Obra:</strong> {{inputs.ubicacionObra}}</div>",
    "<div style=\"font-weight:800; margin:12px 0 6px;\">2. DETALLE DE LOS TRABAJOS</div>",
    "<div>Por la presente, el Cliente declara haber recibido de Maderas Caballero la finalización de los trabajos consistentes en:</div>",
    "<div style=\"margin-top:8px; padding:10px; border:1px solid #e5e7eb; border-radius:10px; background:#fafafa;\">{{inputs.detalleTrabajos}}</div>",
    "<div style=\"font-weight:800; margin:12px 0 6px;\">3. CONFORMIDAD Y RECEPCIÓN</div>",
    "<div>El Cliente manifiesta que la obra ha sido ejecutada según lo acordado, encontrándose a su entera satisfacción en cuanto a calidad de materiales, terminaciones y limpieza del sector. Al firmar este documento, se da por finalizada la etapa de construcción/instalación.</div>",
    "<div style=\"font-weight:800; margin:12px 0 6px;\">4. CONSTANCIA DE ASESORAMIENTO TÉCNICO</div>",
    "<div>El Cliente declara explícitamente que:</div>",
    "<ul style=\"margin-left:18px; list-style:disc;\">",
    "<li>Ha sido debidamente informado por el personal de Maderas Caballero sobre los cuidados específicos y el plan de mantenimiento preventivo que requiere la estructura (aplicación de protectores, limpieza de superficies, frecuencia de pintado/aceitado, etc.), en el caso que sea WPC solo llevara mantenimieno de limpieza.</li>",
    "<li>Comprende que la vida útil y la estética de la madera dependen directamente de la realización periódica de dichos mantenimientos.</li>",
    "<li>Recibió las recomendaciones necesarias para evitar daños por humedad, exposición solar o uso de productos abrasivos no recomendados.</li>",
    "</ul>",
    "<div style=\"font-weight:800; margin:12px 0 6px;\">5. GARANTÍA</div>",
    "<div>La garantía cubre defectos de instalación y vicios ocultos de los materiales en el lapso de 1 año una vez finalizada la obra, pero quedará sin efecto si el Cliente no cumple con el mantenimiento informado o si la estructura es intervenida por terceros ajenos a Maderas Caballero.</div>",
    "</div>",
  ].join(""),
  legalHtml: [
    "<div style=\"font-size:13px; line-height:1.6; color:#111827;\">",
    "<div style=\"font-weight:800; margin-bottom:6px;\">Términos y condiciones</div>",
    "<div>La aceptación de este documento implica la conformidad con las condiciones de ejecución y el asesoramiento recibido. La garantía se sujeta al cumplimiento del plan de mantenimiento recomendado por Maderas Caballero.</div>",
    "</div>",
  ].join(""),
};

export const DEFAULT_VARIABLES = [
  "empresa.nombre",
  "empresa.direccion",
  "empresa.telefono",
  "empresa.web",
  "empresa.instagram",
  "obra.numeroPedido",
  "obra.estado",
  "obra.descripcion",
  "obra.fechaInicio",
  "obra.fechaFin",
  "cliente.nombre",
  "cliente.telefono",
  "cliente.email",
  "cliente.cuit",
  "cliente.direccion",
  "cliente.localidad",
  "cliente.provincia",
  "cliente.partido",
  "ubicacion.direccion",
  "ubicacion.localidad",
  "ubicacion.provincia",
  "ubicacion.partido",
  "ubicacion.barrio",
  "ubicacion.area",
  "ubicacion.lote",
  "ubicacion.descripcion",
  "ahora.fecha",
  "ahora.fechaAr",
  "ahora.hora",
];
