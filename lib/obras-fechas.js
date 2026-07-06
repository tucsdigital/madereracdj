export const getObraReferenceDate = (obra) => {
  if (!obra || typeof obra !== "object") return "";

  const fechaInicio = obra?.fechas?.inicio;
  if (fechaInicio) return fechaInicio;

  if (obra?.fecha) return obra.fecha;
  if (obra?.fechaCreacion) return obra.fechaCreacion;

  return "";
};
