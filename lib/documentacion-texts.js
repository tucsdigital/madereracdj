export const DOCUMENTACION_TEXTOS = {
  estados: {
    borrador: "Borrador",
    emitido: "Emitido",
    enviado: "Enviado",
    abierto: "Abierto por el cliente",
    pendiente_de_aceptacion: "Pendiente de aceptación",
    firmado: "Firmado",
    rechazado_u_observado: "Rechazado / Observado",
    vencido: "Vencido",
    anulado: "Anulado",
  },
  acciones: {
    guardarBorrador: "Guardar borrador",
    emitir: "Emitir documento",
    generarLink: "Generar link",
    copiarLink: "Copiar link",
    reenviar: "Reenviar",
    descargarPdf: "Descargar PDF",
    anular: "Anular documento",
    verDocumento: "Ver documento",
    verHistorial: "Ver historial",
  },
  publico: {
    titulo: "Documento de Cierre de Obra",
    encabezado: "Por favor, lea el documento completo y complete el proceso de aceptación para finalizar la obra.",
    confirmoLectura: "Confirmo que leí el documento completo.",
    aceptoTerminos: "Acepto los términos y condiciones informados en este documento.",
    recibioMantenimiento: "Confirmo haber recibido asesoramiento de mantenimiento y uso correcto.",
    conformeObra: "Confirmo mi conformidad con los trabajos realizados.",
    firmaTitulo: "Firma y aclaración",
    nombreApellido: "Aclaración (nombre completo)",
    identificacion: "DNI o CUIT",
    observaciones: "Observaciones (opcional)",
    btnContinuar: "Continuar",
    btnFirmar: "Firmar y finalizar",
    btnRechazar: "Rechazar / Observar",
    btnDescargar: "Descargar PDF firmado",
    errorToken: "El link no es válido o ya no se encuentra disponible.",
    errorVencido: "Este link se encuentra vencido. Solicite un reenvío.",
    errorEstado: "Este documento no está disponible para firma.",
    gracias: "Gracias. Su firma fue registrada correctamente.",
    disclaimerLegal:
      "La firma digital registrada en este documento constituye evidencia de aceptación de conformidad y puede ser utilizada como respaldo legal y comercial.",
  },
  envio: {
    asuntoEmail: (numero, titulo) =>
      `Documento para confirmación - ${numero || "Documento"}${titulo ? ` - ${titulo}` : ""}`,
    cuerpoEmail: (clienteNombre, empresaNombre, link, descripcionText = "") => {
      const desc = String(descripcionText || "").trim();
      return [
        `Hola${clienteNombre ? ` ${clienteNombre}` : ""},`,
        "",
        "Le compartimos el documento para su lectura y confirmación.",
        ...(desc ? ["", desc] : []),
        "Para acceder, abra el siguiente link:",
        "",
        link,
        "",
        "Una vez leído, podrá completar el proceso de aceptación y firma desde el mismo enlace.",
        "",
        "Saludos,",
        empresaNombre || "Maderas Caballero",
        "",
        "Maderas Caballero",
        "Av. Dr. Honorio Pueyrredón 4625, Villa Rosa, Buenos Aires",
        "Tel: 11-3497-6239 · Web: www.caballeromaderas.com",
      ].join("\n");
    },
    cuerpoEmailHtml: ({ clienteNombre, numero, titulo, link, logoUrl, descripcionHtml = "" }) => {
      const preheader = "Documento para lectura y confirmación.";
      const asunto = `Documento ${numero || ""}${titulo ? ` - ${titulo}` : ""}`.trim();
      const saludo = `Hola${clienteNombre ? ` ${clienteNombre}` : ""},`;
      const desc = String(descripcionHtml || "").trim();
      const logo = logoUrl
        ? `<img src="${logoUrl}" width="180" height="48" alt="Maderas Caballero" style="display:block; border:0; outline:none; text-decoration:none; max-width:180px;" />`
        : `<div style="font-weight:800; font-size:18px; color:#111827;">Maderas Caballero</div>`;

      return [
        `<div style="display:none; max-height:0; overflow:hidden; opacity:0; color:transparent;">${preheader}</div>`,
        `<div style="font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial; background:#f6f7fb; padding:24px;">`,
        `<div style="max-width:640px; margin:0 auto; background:#ffffff; border:1px solid #e5e7eb; border-radius:14px; overflow:hidden;">`,
        `<div style="padding:18px 22px; border-bottom:1px solid #e5e7eb; display:flex; align-items:center; justify-content:space-between; gap:12px;">`,
        `<div>${logo}</div>`,
        `<div style="font-size:12px; color:#6b7280; text-align:right;">${asunto}</div>`,
        `</div>`,
        `<div style="padding:22px;">`,
        `<div style="font-size:15px; color:#111827; line-height:1.6;">`,
        `<p style="margin:0 0 12px;">${saludo}</p>`,
        `<p style="margin:0 0 16px;">Le compartimos el documento para su lectura y confirmación. Desde el enlace podrá completar el proceso de aceptación y firma.</p>`,
        desc
          ? `<div style="margin:0 0 16px; font-size:14px; color:#111827; line-height:1.6;">${desc}</div>`
          : "",
        `<div style="margin:18px 0 18px;">`,
        `<a href="${link}" target="_blank" rel="noopener noreferrer" style="display:inline-block; background:#0ea5e9; color:#ffffff; text-decoration:none; font-weight:700; padding:12px 16px; border-radius:10px;">Abrir documento</a>`,
        `</div>`,
        `<div style="font-size:13px; color:#374151; background:#f9fafb; border:1px solid #e5e7eb; border-radius:12px; padding:12px;">`,
        `<div style="font-weight:700; margin-bottom:6px;">Si el botón no funciona</div>`,
        `<div style="word-break:break-all;"><a href="${link}" target="_blank" rel="noopener noreferrer" style="color:#0ea5e9; text-decoration:none;">${link}</a></div>`,
        `</div>`,
        `<p style="margin:16px 0 0; font-size:12px; color:#6b7280;">Si usted no esperaba este correo, puede ignorarlo.</p>`,
        `</div>`,
        `</div>`,
        `<div style="padding:16px 22px; border-top:1px solid #e5e7eb; background:#ffffff;">`,
        `<div style="font-size:12px; color:#6b7280; line-height:1.5;">`,
        `<div style="font-weight:700; color:#111827; margin-bottom:2px;">Maderas Caballero</div>`,
        `<div>Av. Dr. Honorio Pueyrredón 4625, Villa Rosa, Buenos Aires</div>`,
        `<div>Tel: 11-3497-6239 · Web: <a href="https://www.caballeromaderas.com" style="color:#0ea5e9; text-decoration:none;">www.caballeromaderas.com</a></div>`,
        `</div>`,
        `</div>`,
        `</div>`,
        `</div>`,
      ].join("");
    },
    mensajeWhatsapp: (clienteNombre, numero, link, descripcionText = "") => {
      const desc = String(descripcionText || "").trim();
      const short = desc.length > 260 ? `${desc.slice(0, 260).trim()}…` : desc;
      return [
        `Hola${clienteNombre ? ` ${clienteNombre}` : ""}.`,
        `Te comparto el documento ${numero || ""} para lectura y firma:`,
        ...(short ? [short] : []),
        link,
      ]
        .filter(Boolean)
        .join("\n");
    },
  },
  validaciones: {
    requiereTitulo: "Ingrese un título para el documento.",
    requiereContenido: "Ingrese el contenido del documento.",
    requierePlantilla: "Seleccione una plantilla o cree un documento manual.",
    requiereLectura: "Debe confirmar la lectura del documento.",
    requiereTerminos: "Debe aceptar términos y condiciones.",
    requiereMantenimiento: "Debe confirmar el asesoramiento de mantenimiento.",
    requiereConformidad: "Debe confirmar su conformidad con la obra.",
    requiereFirma: "Debe ingresar una firma.",
    requiereNombre: "Ingrese su nombre y apellido.",
    requiereIdentificacion: "Ingrese DNI o CUIT.",
  },
};
