import { fechaLocalActual, normalizarFecha } from "@/lib/fechas-locales";
const round2 = (value) => Number((Number(value) || 0).toFixed(2));

export const toPaymentNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

export const toPaymentDateKey = (value, fallback = "") => {
  if (!value) return fallback;
  if (typeof value === "string" && !value.trim()) return fallback;
  return normalizarFecha(value) || (typeof value === "string" ? fallback || value.trim() : fallback);
};

export const sanitizePagosArray = (pagos, { actorEmail = "", defaultMetodo = "-", defaultFecha = "" } = {}) =>
  (Array.isArray(pagos) ? pagos : [])
    .map((pago) => {
      const monto = round2(pago?.monto);
      if (monto <= 0) return null;
      return {
        ...pago,
        monto,
        fecha: toPaymentDateKey(pago?.fecha, defaultFecha || fechaLocalActual()),
        metodo: String(pago?.metodo || defaultMetodo || "-").trim() || "-",
        usuario: String(pago?.usuario || actorEmail || "Sistema").trim() || "Sistema",
      };
    })
    .filter(Boolean);

const paymentSignature = (pago) => JSON.stringify([
  round2(pago?.monto),
  toPaymentDateKey(pago?.fecha),
  String(pago?.metodo || "-").trim().toLowerCase(),
]);

/** Adds a timestamp only to payments newly introduced by a write. */
export const stampNewPaymentTimestamps = (pagos, previousPagos = [], timestamp = new Date().toISOString()) => {
  const remainingPrevious = new Map();
  (Array.isArray(previousPagos) ? previousPagos : []).forEach((pago) => {
    const signature = paymentSignature(pago);
    remainingPrevious.set(signature, (remainingPrevious.get(signature) || 0) + 1);
  });

  return (Array.isArray(pagos) ? pagos : []).map((pago) => {
    const signature = paymentSignature(pago);
    const previousCount = remainingPrevious.get(signature) || 0;
    if (previousCount > 0) {
      remainingPrevious.set(signature, previousCount - 1);
      return pago;
    }
    return pago?.fechaHora ? pago : { ...pago, fechaHora: timestamp };
  });
};

export const calcVentaAbonado = (ventaLike) => {
  const pagosArr = Array.isArray(ventaLike?.pagos) ? ventaLike.pagos : [];
  if (pagosArr.length > 0) {
    return round2(pagosArr.reduce((acc, pago) => acc + toPaymentNumber(pago?.monto), 0));
  }
  return round2(ventaLike?.montoAbonado);
};

export const getVentaFechaConfirmacion = (ventaLike) => {
  const total = round2(ventaLike?.total);
  if (total <= 0 || calcVentaAbonado(ventaLike) < total) return "";

  const pagosOrdenados = (Array.isArray(ventaLike?.pagos) ? ventaLike.pagos : [])
    .map((pago, index) => ({
      fecha: toPaymentDateKey(pago?.fecha),
      monto: toPaymentNumber(pago?.monto),
      index,
    }))
    .filter((pago) => pago.fecha && pago.monto > 0)
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.index - b.index);

  let acumulado = 0;
  for (const pago of pagosOrdenados) {
    acumulado = round2(acumulado + pago.monto);
    if (acumulado >= total) return pago.fecha;
  }

  // Respaldo para registros legacy que tienen fecha de confirmación, pero no
  // conservan un historial de pagos suficientemente completo.
  return toPaymentDateKey(ventaLike?.fechaPagoConfirmado) || "";
};

export const esVentaPagada = (ventaLike) => {
  const total = round2(ventaLike?.total);
  return total > 0 && calcVentaAbonado(ventaLike) >= total;
};

export const deriveVentaEstadoPago = ({ total, abonado }) => {
  const totalSeguro = round2(total);
  const abonadoSeguro = round2(abonado);
  if (totalSeguro > 0 && abonadoSeguro >= totalSeguro) return "pagado";
  if (abonadoSeguro > 0) return "parcial";
  return "pendiente";
};

export const buildVentaPaymentSnapshot = (ventaLike) => {
  const total = round2(ventaLike?.total);
  const abonado = calcVentaAbonado(ventaLike);
  const estadoPago = deriveVentaEstadoPago({ total, abonado });
  const saldoPendiente = round2(Math.max(total - abonado, 0));
  const saldoAFavor = round2(Math.max(abonado - total, 0));
  return { total, abonado, estadoPago, saldoPendiente, saldoAFavor };
};

export const normalizeVentaPaymentFields = ({
  venta,
  previousVenta = null,
  actorEmail = "",
  defaultFecha = "",
} = {}) => {
  const hasOwn = (obj, key) => Boolean(obj) && Object.prototype.hasOwnProperty.call(obj, key);
  const total = round2(venta?.total ?? previousVenta?.total);
  const metodoBase = String(
    venta?.formaPago ||
      previousVenta?.formaPago ||
      previousVenta?.pagos?.[previousVenta?.pagos?.length - 1]?.metodo ||
      "-",
  ).trim() || "-";
  const fechaBase =
    toPaymentDateKey(defaultFecha) ||
    toPaymentDateKey(venta?.fechaPagoConfirmado) ||
    toPaymentDateKey(venta?.fecha) ||
    toPaymentDateKey(previousVenta?.fechaPagoConfirmado) ||
    toPaymentDateKey(previousVenta?.fecha) ||
    fechaLocalActual();

  const rawPagos = hasOwn(venta, "pagos")
    ? venta?.pagos
    : Array.isArray(previousVenta?.pagos)
      ? previousVenta.pagos
      : null;

  let pagos = sanitizePagosArray(rawPagos, {
    actorEmail,
    defaultMetodo: metodoBase,
    defaultFecha: fechaBase,
  });

  const montoAbonadoFallback = round2(
    hasOwn(venta, "montoAbonado") ? venta?.montoAbonado : previousVenta?.montoAbonado,
  );

  if (pagos.length === 0 && montoAbonadoFallback > 0) {
    pagos = sanitizePagosArray(
      [
        {
          fecha: fechaBase,
          monto: montoAbonadoFallback,
          metodo: metodoBase,
          usuario: actorEmail || "Sistema",
          generadoAutomaticamente: true,
        },
      ],
      {
        actorEmail,
        defaultMetodo: metodoBase,
        defaultFecha: fechaBase,
      },
    );
  }

  const abonado = round2(pagos.reduce((acc, pago) => acc + toPaymentNumber(pago?.monto), 0));
  const estadoPago = deriveVentaEstadoPago({ total, abonado });
  const saldoPendiente = round2(Math.max(total - abonado, 0));
  const saldoAFavor = round2(Math.max(abonado - total, 0));
  const fechaPagoConfirmado =
    pagos.length > 0
      ? pagos
          .map((pago) => toPaymentDateKey(pago?.fecha))
          .filter(Boolean)
          .sort()
          .slice(-1)[0] || null
      : null;

  return {
    pagos,
    montoAbonado: abonado,
    estadoPago,
    pagoPendiente: estadoPago === "pendiente",
    pagoParcial: estadoPago === "parcial",
    saldoPendiente,
    saldoAFavor,
    fechaPagoConfirmado,
  };
};
