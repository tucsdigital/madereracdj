import {
  aFechaLocalISO,
  fechaLocalActual,
  formatearFechaLocal,
  normalizarFecha,
} from "@/lib/fechas-locales";

export { aFechaLocalISO, fechaLocalActual, formatearFechaLocal, normalizarFecha };

const TIPOS_COBRO = ["pago", "seña", "senia", "anticipo"];

const numeroSeguro = (valor) => {
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : 0;
};

export const generarIdMovimiento = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `mov-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

export const normalizarMovimiento = (mov, indice = 0) => {
  const m = mov || {};
  const fecha = normalizarFecha(m.fecha);
  const tipo = m.tipo || "pago";
  const monto = Math.max(0, numeroSeguro(m.monto));
  const esUsd = m.pagoEnDolares === true || m.moneda === "USD";
  const cotizacion =
    numeroSeguro(m.valorOficialDolar ?? m.cotizacionDolar) || null;

  return {
    id: m.id ? String(m.id) : `legacy-${indice}-${tipo}-${fecha}-${monto}`,
    fecha,
    tipo,
    metodo: m.metodo || "efectivo",
    monto,
    nota: m.nota || "",
    moneda: esUsd ? "USD" : "ARS",
    pagoEnDolares: esUsd,
    montoOriginal: numeroSeguro(m.montoOriginal) || null,
    valorOficialDolar: esUsd ? cotizacion : null,
    cotizacionDolar: esUsd ? cotizacion : null,
    comprobantes: Array.isArray(m.comprobantes) ? m.comprobantes : [],
    timestamp: m.timestamp || null,
  };
};

// Garantiza ids únicos aunque haya duplicados en los datos guardados.
export const normalizarMovimientos = (lista) => {
  const vistos = new Set();
  return (Array.isArray(lista) ? lista : []).map((mov, i) => {
    const norm = normalizarMovimiento(mov, i);
    if (vistos.has(norm.id)) norm.id = `${norm.id}-${i}`;
    vistos.add(norm.id);
    return norm;
  });
};

// Convierte los campos legacy cobranzas.senia / cobranzas.monto en movimientos.
export const movimientosDesdeCobranzas = (cobranzas) => {
  const c = cobranzas || {};
  const forma = c.formaPago || "efectivo";
  const inicial = [];

  const sen = numeroSeguro(c.senia);
  if (sen > 0) {
    inicial.push({
      fecha: c.fechaSenia,
      tipo: "seña",
      metodo: forma,
      monto: sen,
      nota: "Seña",
    });
  }

  const mon = numeroSeguro(c.monto);
  if (mon > 0) {
    inicial.push({
      fecha: c.fechaMonto,
      tipo: "pago",
      metodo: forma,
      monto: mon,
      nota: "Pago",
    });
  }

  const hist = Array.isArray(c.historialPagos) ? c.historialPagos : [];
  return normalizarMovimientos([...inicial, ...hist]);
};

export const ordenarMovimientos = (lista) =>
  [...(Array.isArray(lista) ? lista : [])].sort((a, b) => {
    const fa = normalizarFecha(a?.fecha);
    const fb = normalizarFecha(b?.fecha);
    if (fa !== fb) return fa < fb ? -1 : 1;
    return String(a?.timestamp || "").localeCompare(String(b?.timestamp || ""));
  });

export const esMovimientoCobrado = (mov) =>
  TIPOS_COBRO.includes(String(mov?.tipo || "").toLowerCase());

export const eliminarMovimientoPorId = (lista, id) =>
  (Array.isArray(lista) ? lista : []).filter((m) => m.id !== id);
