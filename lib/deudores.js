import { buildVentaPaymentSnapshot } from "@/lib/ventas-pagos";

export const isVentaAnulada = (venta = {}) =>
  String(venta?.estado || "").trim().toLowerCase() === "anulada" || venta?.anulada === true;

const fechaEnMilisegundos = (valor) => {
  if (!valor) return 0;
  const fecha = typeof valor?.toDate === "function" ? valor.toDate() : new Date(valor);
  return Number.isNaN(fecha.getTime()) ? 0 : fecha.getTime();
};

export const construirListadoDeudores = (ventas = []) =>
  (Array.isArray(ventas) ? ventas : [])
    .filter((venta) => !isVentaAnulada(venta))
    .map((venta) => ({
      ...venta,
      resumenPago: buildVentaPaymentSnapshot(venta),
    }))
    .filter(({ resumenPago }) =>
      resumenPago.saldoPendiente > 0 &&
      (resumenPago.estadoPago === "pendiente" || resumenPago.estadoPago === "parcial")
    )
    .sort((a, b) =>
      fechaEnMilisegundos(b.fechaCreacion || b.fecha) -
      fechaEnMilisegundos(a.fechaCreacion || a.fecha)
    );
