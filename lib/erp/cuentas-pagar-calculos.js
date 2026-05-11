const toNumber = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export const esCuentaAnulada = (cuenta) => {
  if (!cuenta || typeof cuenta !== "object") return false;
  if (cuenta.anulada === true) return true;
  const op = String(cuenta.estadoOperativo || "").trim().toLowerCase();
  if (op === "anulada" || op === "anulado") return true;
  const estado = String(cuenta.estado || "").trim().toLowerCase();
  if (estado === "anulada" || estado === "anulado") return true;
  return false;
};

export const calcularSaldoCuenta = (cuenta) => {
  if (!cuenta || typeof cuenta !== "object") return 0;
  if (esCuentaAnulada(cuenta)) return 0;
  const total = toNumber(cuenta.monto);
  const pagado = toNumber(cuenta.montoPagado);
  return Math.max(total - pagado, 0);
};

export const esCuentaVencida = (cuenta, now = new Date()) => {
  if (!cuenta || typeof cuenta !== "object") return false;
  if (esCuentaAnulada(cuenta)) return false;
  const saldo = calcularSaldoCuenta(cuenta);
  if (saldo <= 0) return false;
  const fv = cuenta.fechaVencimiento;
  if (!fv) return false;
  const d = fv instanceof Date ? fv : new Date(String(fv));
  if (Number.isNaN(d.getTime())) return false;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const due = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0);
  return due < today;
};

export const calcularEstadoCuenta = (cuenta, now = new Date()) => {
  if (!cuenta || typeof cuenta !== "object") return "pendiente";
  if (esCuentaAnulada(cuenta)) return "anulada";
  const saldo = calcularSaldoCuenta(cuenta);
  const total = toNumber(cuenta.monto);
  const pagado = toNumber(cuenta.montoPagado);
  if (esCuentaVencida(cuenta, now)) return "vencida";
  if (total > 0 && pagado >= total) return "pagado";
  if (pagado > 0 && saldo > 0) return "parcial";
  return "pendiente";
};

export const normalizarCuentaProveedor = (doc) => {
  const d = doc || {};
  const monto = toNumber(d.monto);
  const montoPagado = toNumber(d.montoPagado);
  const proveedorId = String(d.proveedorId || "").trim();
  const proveedor =
    d.proveedor && typeof d.proveedor === "object"
      ? {
          id: String(d.proveedor.id || proveedorId || "").trim(),
          nombre: String(d.proveedor.nombre || "").trim(),
          cuit: String(d.proveedor.cuit || "").trim(),
          telefono: String(d.proveedor.telefono || "").trim(),
        }
      : null;
  const pagos = Array.isArray(d.pagos) ? d.pagos : [];
  const estadoPago = String(d.estadoPago || "").trim().toLowerCase() || "pendiente";
  const fecha = String(d.fecha || "").trim();
  const fechaVencimiento = d.fechaVencimiento ? String(d.fechaVencimiento).trim() : null;
  const responsable = String(d.responsable || "").trim();
  return {
    ...d,
    monto,
    montoPagado,
    estadoPago,
    proveedorId,
    proveedor,
    pagos,
    fecha,
    fechaVencimiento,
    responsable,
  };
};

export const normalizarMovimientoProveedor = (doc) => {
  const d = doc || {};
  const tipo = String(d.tipo || "").trim();
  const proveedorId = String(d.proveedorId || "").trim();
  const proveedor =
    d.proveedor && typeof d.proveedor === "object"
      ? {
          id: String(d.proveedor.id || proveedorId || "").trim(),
          nombre: String(d.proveedor.nombre || "").trim(),
          cuit: String(d.proveedor.cuit || "").trim(),
          telefono: String(d.proveedor.telefono || "").trim(),
        }
      : null;
  const fecha = String(d.fecha || "").trim();
  const anulado = d.anulado === true;
  return {
    ...d,
    tipo,
    proveedorId,
    proveedor,
    fecha,
    anulado,
  };
};

export const calcularResumenGeneral = ({ cuentas, proveedores, movimientos, now = new Date() }) => {
  const cuentasArr = Array.isArray(cuentas) ? cuentas : [];
  const proveedoresArr = Array.isArray(proveedores) ? proveedores : [];
  const movimientosArr = Array.isArray(movimientos) ? movimientos : [];

  const cuentasActivas = cuentasArr.filter((c) => !esCuentaAnulada(c));
  const totalCuentas = cuentasActivas.reduce((acc, c) => acc + toNumber(c.monto), 0);
  const totalPagado = cuentasActivas.reduce((acc, c) => acc + toNumber(c.montoPagado), 0);
  const saldoPendienteBruto = cuentasActivas.reduce((acc, c) => acc + calcularSaldoCuenta(c), 0);

  const saldoAFavorTotal = proveedoresArr.reduce((acc, p) => acc + toNumber(p?.saldoAFavor), 0);
  const saldoPendienteNeto = Math.max(saldoPendienteBruto - saldoAFavorTotal, 0);
  const excedenteSaldoAFavor = Math.max(saldoAFavorTotal - saldoPendienteBruto, 0);

  const cuentasPendientes = cuentasActivas.filter((c) => calcularEstadoCuenta(c, now) === "pendiente").length;
  const cuentasParciales = cuentasActivas.filter((c) => calcularEstadoCuenta(c, now) === "parcial").length;
  const cuentasPagadas = cuentasActivas.filter((c) => calcularEstadoCuenta(c, now) === "pagado").length;
  const cuentasVencidas = cuentasActivas.filter((c) => calcularEstadoCuenta(c, now) === "vencida").length;

  const movimientosAnulados = movimientosArr.filter((m) => m?.anulado === true).length;

  return {
    totalCuentas,
    totalPagado,
    saldoPendienteBruto,
    saldoAFavorTotal,
    saldoPendienteNeto,
    excedenteSaldoAFavor,
    cuentasPendientes,
    cuentasPagadas,
    cuentasParciales,
    cuentasVencidas,
    movimientosAnulados,
    cantidadCuentas: cuentasActivas.length,
  };
};

export const calcularResumenProveedor = ({ proveedorId, cuentas, proveedor, movimientos, now = new Date() }) => {
  const provId = String(proveedorId || proveedor?.id || "").trim();
  const cuentasArr = (Array.isArray(cuentas) ? cuentas : []).filter((c) => String(c?.proveedorId || "") === provId);
  const cuentasActivas = cuentasArr.filter((c) => !esCuentaAnulada(c));
  const movimientosArr = (Array.isArray(movimientos) ? movimientos : []).filter((m) => String(m?.proveedorId || "") === provId);

  const total = cuentasActivas.reduce((acc, c) => acc + toNumber(c.monto), 0);
  const pagado = cuentasActivas.reduce((acc, c) => acc + toNumber(c.montoPagado), 0);
  const saldoPendienteBruto = cuentasActivas.reduce((acc, c) => acc + calcularSaldoCuenta(c), 0);
  const saldoAFavor = toNumber(proveedor?.saldoAFavor);
  const saldoPendienteNeto = Math.max(saldoPendienteBruto - saldoAFavor, 0);
  const excedenteSaldoAFavor = Math.max(saldoAFavor - saldoPendienteBruto, 0);
  const cuentasActivasCount = cuentasActivas.filter((c) => calcularSaldoCuenta(c) > 0).length;
  const cuentasVencidasCount = cuentasActivas.filter((c) => esCuentaVencida(c, now)).length;

  const proximoVencimiento = (() => {
    let best = null;
    for (const c of cuentasActivas) {
      if (!c?.fechaVencimiento) continue;
      const saldo = calcularSaldoCuenta(c);
      if (saldo <= 0) continue;
      const d = new Date(String(c.fechaVencimiento));
      if (Number.isNaN(d.getTime())) continue;
      if (!best || d < best) best = d;
    }
    return best;
  })();

  const porcentajePagado = total > 0 ? (pagado / total) * 100 : 0;

  const estadoGeneral = (() => {
    if (cuentasVencidasCount > 0) return "Con deuda vencida";
    if (saldoPendienteNeto > 0 && pagado > 0) return "Deuda parcial";
    if (saldoPendienteNeto > 0) return "Con deuda";
    if (excedenteSaldoAFavor > 0) return "Con saldo a favor";
    return "Sin deuda";
  })();

  const movimientosAnulados = movimientosArr.filter((m) => m?.anulado === true).length;

  return {
    proveedorId: provId,
    proveedor: proveedor || null,
    total,
    pagado,
    saldoPendienteBruto,
    saldoAFavor,
    saldoPendienteNeto,
    excedenteSaldoAFavor,
    cuentasActivas: cuentasActivasCount,
    cuentasVencidas: cuentasVencidasCount,
    porcentajePagado,
    proximoVencimiento,
    estadoGeneral,
    movimientosAnulados,
  };
};

export const puedeEditarCuenta = (cuenta) => !esCuentaAnulada(cuenta);
export const puedeRegistrarPago = (cuenta) => !esCuentaAnulada(cuenta) && calcularSaldoCuenta(cuenta) > 0;
export const puedeAnularMovimiento = (movimiento) => movimiento && movimiento.anulado !== true;

export const formatMoneyARS = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return "$0";
  const abs = Math.abs(n);
  const hasDecimals = Math.abs(abs - Math.round(abs)) > 0.000001;
  const formatted = abs.toLocaleString("es-AR", {
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: hasDecimals ? 2 : 0,
  });
  return `${n < 0 ? "-" : ""}$${formatted}`;
};

export const formatFechaAR = (value) => {
  if (!value) return "-";
  if (typeof value === "string") {
    const s = value.trim();
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) {
      const y = Number(m[1]);
      const mo = Number(m[2]);
      const d = Number(m[3]);
      const dt = new Date(`${String(y).padStart(4, "0")}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}T00:00:00-03:00`);
      if (!Number.isNaN(dt.getTime())) {
        return new Intl.DateTimeFormat("es-AR", {
          timeZone: "America/Argentina/Buenos_Aires",
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        }).format(dt);
      }
    }
  }
  const dt = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(dt.getTime())) return "-";
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(dt);
};

export const formatFechaHoraAR = (value) => {
  if (!value) return "-";
  const dt = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(dt.getTime())) return "-";
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(dt);
};

