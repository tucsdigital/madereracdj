export const DOCUMENTO_ESTADOS = {
  BORRADOR: "borrador",
  EMITIDO: "emitido",
  ENVIADO: "enviado",
  ABIERTO: "abierto",
  PENDIENTE_ACEPTACION: "pendiente_de_aceptacion",
  FIRMADO: "firmado",
  RECHAZADO_U_OBSERVADO: "rechazado_u_observado",
  VENCIDO: "vencido",
  ANULADO: "anulado",
};

export const DOCUMENTO_ESTADOS_ORDEN = [
  DOCUMENTO_ESTADOS.BORRADOR,
  DOCUMENTO_ESTADOS.EMITIDO,
  DOCUMENTO_ESTADOS.ENVIADO,
  DOCUMENTO_ESTADOS.ABIERTO,
  DOCUMENTO_ESTADOS.PENDIENTE_ACEPTACION,
  DOCUMENTO_ESTADOS.FIRMADO,
  DOCUMENTO_ESTADOS.RECHAZADO_U_OBSERVADO,
  DOCUMENTO_ESTADOS.VENCIDO,
  DOCUMENTO_ESTADOS.ANULADO,
];

export const isEstadoFinal = (estado) =>
  estado === DOCUMENTO_ESTADOS.FIRMADO ||
  estado === DOCUMENTO_ESTADOS.ANULADO ||
  estado === DOCUMENTO_ESTADOS.VENCIDO;

export const canEditarDocumento = (doc) => {
  const estado = doc?.estado || DOCUMENTO_ESTADOS.BORRADOR;
  if (doc?.bloqueado) return false;
  return estado === DOCUMENTO_ESTADOS.BORRADOR;
};

export const canEmitirDocumento = (doc) => {
  const estado = doc?.estado || DOCUMENTO_ESTADOS.BORRADOR;
  return estado === DOCUMENTO_ESTADOS.BORRADOR && !doc?.bloqueado;
};

export const canGenerarLink = (doc) => {
  const estado = doc?.estado || DOCUMENTO_ESTADOS.BORRADOR;
  if (doc?.bloqueado) return false;
  return (
    estado === DOCUMENTO_ESTADOS.EMITIDO ||
    estado === DOCUMENTO_ESTADOS.ENVIADO ||
    estado === DOCUMENTO_ESTADOS.ABIERTO ||
    estado === DOCUMENTO_ESTADOS.PENDIENTE_ACEPTACION ||
    estado === DOCUMENTO_ESTADOS.RECHAZADO_U_OBSERVADO
  );
};

export const canAnularDocumento = (doc) => {
  const estado = doc?.estado || DOCUMENTO_ESTADOS.BORRADOR;
  return !isEstadoFinal(estado);
};

export const nextEstadoAfterOpen = (doc) => {
  const estado = doc?.estado || DOCUMENTO_ESTADOS.BORRADOR;
  if (estado === DOCUMENTO_ESTADOS.ENVIADO || estado === DOCUMENTO_ESTADOS.EMITIDO) {
    return DOCUMENTO_ESTADOS.ABIERTO;
  }
  return estado;
};

export const nextEstadoAfterRead = (doc) => {
  const estado = doc?.estado || DOCUMENTO_ESTADOS.BORRADOR;
  if (estado === DOCUMENTO_ESTADOS.ABIERTO) {
    return DOCUMENTO_ESTADOS.PENDIENTE_ACEPTACION;
  }
  if (estado === DOCUMENTO_ESTADOS.ENVIADO) {
    return DOCUMENTO_ESTADOS.PENDIENTE_ACEPTACION;
  }
  return estado;
};

export const nextEstadoAfterSend = (doc) => {
  const estado = doc?.estado || DOCUMENTO_ESTADOS.BORRADOR;
  if (estado === DOCUMENTO_ESTADOS.EMITIDO) return DOCUMENTO_ESTADOS.ENVIADO;
  return estado;
};

