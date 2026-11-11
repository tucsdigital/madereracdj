import { getObraReferenceDate } from "@/lib/obras-fechas";

export const OBRAS_COMMISSION_RATE = 2.5;

export const calcularTotalObra = (obra) =>
  Number(obra?.total) ||
  Number(obra?.subtotal) ||
  (Number(obra?.productosTotal) || 0) +
    (Number(obra?.materialesTotal) || 0) +
    (Number(obra?.gastoObraManual) || 0) +
    (Number(obra?.costoEnvio) || 0) -
    (Number(obra?.descuentoTotal) || 0);

export const esObraComisionable = (obra) => {
  const tipo = String(obra?.tipo || "").toLowerCase();
  const estado = String(obra?.estado || "").toLowerCase();
  return tipo === "obra" && (estado === "en_ejecucion" || estado === "completada");
};

// La comisión se asigna a la fecha estable de referencia de la obra, no a
// fechas que cambian al editarla o completar el trabajo.
export const getFechaComisionObra = (obra) =>
  esObraComisionable(obra) ? getObraReferenceDate(obra) : "";

export const esObraPendienteDeConfirmacion = (obra) => {
  const tipo = String(obra?.tipo || "").toLowerCase();
  return tipo === "obra" && !esObraComisionable(obra);
};
