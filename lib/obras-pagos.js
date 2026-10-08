const TIPOS_COBRO = ["pago", "seña", "senia", "anticipo"];

const numeroSeguro = (valor) => {
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : 0;
};

const pad = (n) => String(n).padStart(2, "0");

const aFechaLocalISO = (date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export const fechaLocalActual = () => aFechaLocalISO(new Date());

export const generarIdMovimiento = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `mov-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

// Devuelve siempre "YYYY-MM-DD" (fecha local) o "" si no es interpretable.
export const normalizarFecha = (valor) => {
  if (!valor) return "";

  if (typeof valor === "object") {
    if (typeof valor.toDate === "function") return aFechaLocalISO(valor.toDate());
    if (typeof valor.seconds === "number") {
      return aFechaLocalISO(new Date(valor.seconds * 1000));
    }
    if (valor instanceof Date) {
      return Number.isNaN(valor.getTime()) ? "" : aFechaLocalISO(valor);
    }
    return "";
  }

  const texto = String(valor).trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) return texto;

  const dmy = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) return `${dmy[3]}-${pad(dmy[2])}-${pad(dmy[1])}`;

  const parsed = new Date(texto);
  return Number.isNaN(parsed.getTime()) ? "" : aFechaLocalISO(parsed);
};

// Formatea "YYYY-MM-DD" sin pasar por UTC, para evitar el corrimiento de un día.
export const formatearFechaLocal = (valor) => {
  const iso = normalizarFecha(valor);
  if (!iso) return "-";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
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
