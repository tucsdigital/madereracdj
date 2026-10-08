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

export const calcVentaAbonado = (ventaLike) => {
  const pagosArr = Array.isArray(ventaLike?.pagos) ? ventaLike.pagos : [];
  if (pagosArr.length > 0) {
    return round2(pagosArr.reduce((acc, pago) => acc + toPaymentNumber(pago?.monto), 0));
  }
  return round2(ventaLike?.montoAbonado);
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
