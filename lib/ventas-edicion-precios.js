const numberOr = (value, fallback = 0) => {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const hasNumber = (value) =>
  value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));

/**
 * Native ERP sales use the ERP's configured calculation. Ecommerce sales keep
 * the amount snapshot confirmed at checkout; editing delivery details must not
 * recalculate a store discount using the ERP cash-payment rule.
 */
export function calcularImportesEdicionVenta({
  esVentaEcommerce = false,
  ventaOriginal = {},
  ventaEdit = {},
  totalesProductos = {},
}) {
  if (esVentaEcommerce) {
    const descuentoTotal = hasNumber(ventaOriginal.descuentoTotal)
      ? Number(ventaOriginal.descuentoTotal)
      : numberOr(ventaOriginal.descuentos, numberOr(totalesProductos.descuentoTotal));
    const descuentos = hasNumber(ventaOriginal.descuentos)
      ? Number(ventaOriginal.descuentos)
      : descuentoTotal;
    const total = hasNumber(ventaOriginal.totalConEfectivo)
      ? Number(ventaOriginal.totalConEfectivo)
      : numberOr(ventaOriginal.total, numberOr(ventaEdit.total));

    return {
      subtotal: numberOr(ventaOriginal.subtotal, numberOr(totalesProductos.subtotal)),
      descuentoTotal,
      descuentos,
      descuentoEfectivo: numberOr(ventaOriginal.descuentoEfectivo),
      ivaPorcentaje: ventaOriginal.ivaPorcentaje,
      ivaMonto: numberOr(ventaOriginal.ivaMonto),
      transferenciaPorcentaje: ventaOriginal.transferenciaPorcentaje,
      transferenciaMonto: numberOr(ventaOriginal.transferenciaMonto),
      costoEnvioCalculado: numberOr(ventaOriginal.costoEnvio),
      total,
    };
  }

  const subtotal = numberOr(totalesProductos.subtotal);
  const descuentoTotal = numberOr(totalesProductos.descuentoTotal);
  const totalSinEnvio = numberOr(totalesProductos.total);
  const costoEnvioCalculado =
    ventaEdit.tipoEnvio &&
    ventaEdit.tipoEnvio !== "retiro_local" &&
    ventaEdit.costoEnvio !== undefined &&
    ventaEdit.costoEnvio !== "" &&
    Number.isFinite(Number(ventaEdit.costoEnvio))
      ? Number(ventaEdit.costoEnvio)
      : 0;
  const descuentoEfectivo = ventaEdit.pagoEnEfectivo ? subtotal * 0.1 : 0;
  const baseImponible = Math.max(0, totalSinEnvio - descuentoEfectivo);
  const ivaPorcentaje = Math.max(0, Number(ventaEdit.ivaPorcentaje) || 21);
  const ivaMonto = Boolean(ventaEdit.aplicaIva) ? baseImponible * (ivaPorcentaje / 100) : 0;
  const transferenciaPorcentaje = Math.max(0, Number(ventaEdit.transferenciaPorcentaje) || 10);
  const transferenciaMonto = Boolean(ventaEdit.aplicaTransferencia)
    ? baseImponible * (transferenciaPorcentaje / 100)
    : 0;
  const total = baseImponible + ivaMonto + transferenciaMonto + costoEnvioCalculado;

  return {
    subtotal,
    descuentoTotal,
    descuentos: descuentoTotal,
    descuentoEfectivo,
    ivaPorcentaje,
    ivaMonto,
    transferenciaPorcentaje,
    transferenciaMonto,
    costoEnvioCalculado,
    total,
  };
}
