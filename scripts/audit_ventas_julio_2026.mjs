import fs from "fs";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const ENV_PATH = "c:/Users/Lauti/Documents/GitHub/ecommerces/sistema_maderas_caballero/.env.local";
const envText = fs.readFileSync(ENV_PATH, "utf8");

const getEnv = (name) => {
  const match = envText.match(new RegExp(`^${name}=(.*)$`, "m"));
  if (!match) return "";
  let value = match[1].trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  return value.replace(/\\n/g, "\n");
};

const projectId = getEnv("FIREBASE_PROJECT_ID");
const clientEmail = getEnv("FIREBASE_CLIENT_EMAIL");
const privateKey = getEnv("FIREBASE_PRIVATE_KEY");

if (!getApps().length) {
  initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
    projectId,
  });
}

const db = getFirestore();

const start = new Date("2026-07-01T00:00:00-03:00");
const end = new Date("2026-08-01T00:00:00-03:00");
const startMs = start.getTime();
const endMs = end.getTime();

const toMs = (value) => {
  if (!value) return NaN;
  if (typeof value === "string") {
    const raw = value.trim();
    if (!raw) return NaN;
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      return new Date(`${raw}T00:00:00-03:00`).getTime();
    }
    const ms = Date.parse(raw);
    return Number.isFinite(ms) ? ms : NaN;
  }
  if (value?.toDate && typeof value.toDate === "function") {
    return value.toDate().getTime();
  }
  if (typeof value?.seconds === "number") {
    return value.seconds * 1000;
  }
  const ms = Date.parse(String(value));
  return Number.isFinite(ms) ? ms : NaN;
};

const formatIsoDay = (value) => {
  const ms = toMs(value);
  if (!Number.isFinite(ms)) return "";
  const d = new Date(ms);
  const y = d.toLocaleString("sv-SE", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
  });
  const m = d.toLocaleString("sv-SE", {
    timeZone: "America/Argentina/Buenos_Aires",
    month: "2-digit",
  });
  const day = d.toLocaleString("sv-SE", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit",
  });
  return `${y}-${m}-${day}`;
};

const calcAbonado = (ventaLike) => {
  const pagosArr = Array.isArray(ventaLike?.pagos) ? ventaLike.pagos : [];
  if (pagosArr.length > 0) {
    return pagosArr.reduce((acc, p) => acc + (Number(p?.monto) || 0), 0);
  }
  return Number(ventaLike?.montoAbonado || 0);
};

const deriveEstadoPago = ({ estadoPago, total, abonado }) => {
  const raw = String(estadoPago || "").toLowerCase();
  if (raw === "pagado" || raw === "parcial" || raw === "pendiente") {
    return raw;
  }
  const t = Number(total) || 0;
  const a = Number(abonado) || 0;
  if (t > 0 && a >= t) return "pagado";
  if (a > 0) return "parcial";
  return "pendiente";
};

const snap = await db.collection("ventas").get();
const ventasAllRaw = snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
const ventasAll = ventasAllRaw.filter(
  (v) => !(String(v?.estado || "").toLowerCase() === "anulada" || v?.anulada === true),
);

const ventasPeriodo = ventasAll.filter((v) => {
  const ms = toMs(v.fechaCreacion || v.fecha);
  return Number.isFinite(ms) && ms >= startMs && ms < endMs;
});

const withAudit = ventasPeriodo.map((v) => {
  const total = Number(v.total) || 0;
  const pagos = Array.isArray(v.pagos) ? v.pagos : [];
  const abonado = calcAbonado(v);
  const estadoPago = deriveEstadoPago({ estadoPago: v.estadoPago, total, abonado });
  const saldo = Math.max(total - abonado, 0);
  const fechasPagos = pagos
    .map((p) => p?.fecha)
    .filter(Boolean)
    .map(formatIsoDay)
    .filter(Boolean)
    .sort();
  const fechaPagoConfirmado = fechasPagos.length > 0 ? fechasPagos[fechasPagos.length - 1] : null;
  const fechaLimitePago = v.fechaVencimiento || v.fechaLimite || v.limitePago || null;
  const notaDeuda = v.observaciones || v.nota || v.comentario || v.notas || null;
  const rawEstado = String(v.estadoPago || "").toLowerCase().trim();
  const hasRecognizedRawEstado =
    rawEstado === "" || rawEstado === "pagado" || rawEstado === "parcial" || rawEstado === "pendiente";
  const sumPagos = pagos.reduce((acc, p) => acc + (Number(p?.monto) || 0), 0);
  return {
    id: v.id,
    numeroPedido: String(v.numeroPedido || v.numero || ""),
    fechaEmision: formatIsoDay(v.fechaCreacion || v.fecha),
    estadoPago,
    estadoPagoRaw: rawEstado || null,
    total,
    abonado,
    saldo,
    fechaPagoConfirmado,
    fechaLimitePago: fechaLimitePago ? formatIsoDay(fechaLimitePago) || String(fechaLimitePago) : null,
    notaDeuda: notaDeuda ? String(notaDeuda).trim() : null,
    clienteNombre: String(v?.cliente?.nombre || ""),
    pagosCount: pagos.length,
    sumPagos,
    hasRecognizedRawEstado,
    inconsistenciaMonto: Math.abs(abonado - sumPagos) > 0.009 && pagos.length > 0,
    inconsistenciaSaldoNegativo: saldo < -0.009,
    inconsistenciaPagadoConSaldo: estadoPago === "pagado" && saldo > 0.009,
    inconsistenciaPendienteSinSaldo: estadoPago !== "pagado" && saldo <= 0.009 && total > 0,
  };
});

const pendientesParciales = withAudit
  .filter((v) => v.estadoPago === "pendiente" || v.estadoPago === "parcial")
  .sort(
    (a, b) =>
      (a.fechaEmision || "").localeCompare(b.fechaEmision || "") || a.id.localeCompare(b.id),
  );

const totalVentas = withAudit.length;
const completadas = withAudit.filter((v) => v.estadoPago === "pagado").length;
const totalFacturado = withAudit.reduce((acc, v) => acc + v.total, 0);
const totalCobrado = withAudit.reduce((acc, v) => acc + v.abonado, 0);
const totalPendiente = withAudit.reduce((acc, v) => acc + v.saldo, 0);

const duplicateIds = withAudit
  .map((v) => v.id)
  .filter((id, index, arr) => arr.indexOf(id) !== index);

const duplicateNumeroPedido = Object.entries(
  withAudit.reduce((acc, v) => {
    const key = v.numeroPedido || "";
    if (!key) return acc;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {}),
)
  .filter(([, count]) => count > 1)
  .map(([numeroPedido, count]) => ({ numeroPedido, count }));

const rawEstadosNoReconocidos = withAudit
  .filter((v) => !v.hasRecognizedRawEstado)
  .map((v) => ({ id: v.id, estadoPagoRaw: v.estadoPagoRaw }));

const inconsistencias = withAudit
  .filter(
    (v) =>
      v.inconsistenciaMonto ||
      v.inconsistenciaSaldoNegativo ||
      v.inconsistenciaPagadoConSaldo ||
      v.inconsistenciaPendienteSinSaldo,
  )
  .map((v) => ({
    id: v.id,
    numeroPedido: v.numeroPedido,
    estadoPago: v.estadoPago,
    total: v.total,
    abonado: v.abonado,
    saldo: v.saldo,
    pagosCount: v.pagosCount,
    sumPagos: v.sumPagos,
    flags: {
      monto: v.inconsistenciaMonto,
      saldoNegativo: v.inconsistenciaSaldoNegativo,
      pagadoConSaldo: v.inconsistenciaPagadoConSaldo,
      noPagadoSinSaldo: v.inconsistenciaPendienteSinSaldo,
    },
  }));

const result = {
  period: { month: "2026-07", start: "2026-07-01", endExclusive: "2026-08-01" },
  stats: {
    totalVentas,
    ventasCompletadas: completadas,
    porcentajeCompletadas: totalVentas ? Number(((completadas / totalVentas) * 100).toFixed(2)) : 0,
    totalFacturado,
    totalCobrado,
    totalPendiente,
    pendientesCount: pendientesParciales.filter((v) => v.estadoPago === "pendiente").length,
    parcialesCount: pendientesParciales.filter((v) => v.estadoPago === "parcial").length,
  },
  integrity: {
    duplicateIds,
    duplicateNumeroPedido,
    rawEstadosNoReconocidos,
    inconsistencias,
  },
  listaEstadosPendienteOParcial: pendientesParciales.map((v) => ({
    id: v.id,
    numeroPedido: v.numeroPedido,
    fechaEmision: v.fechaEmision,
    estadoPago: v.estadoPago,
    montoTotal: v.total,
    montoTotalAbonado: v.abonado,
    fechaPagoConfirmado: v.fechaPagoConfirmado,
    clienteNombre: v.clienteNombre || null,
  })),
  listaNoCompletadas: pendientesParciales.map((v) => ({
    id: v.id,
    numeroPedido: v.numeroPedido,
    fechaEmision: v.fechaEmision,
    estadoPago: v.estadoPago,
    montoPendienteCobro: v.saldo,
    fechaLimitePago: v.fechaLimitePago,
    notaDeuda: v.notaDeuda,
    clienteNombre: v.clienteNombre || null,
  })),
};

console.log(JSON.stringify(result, null, 2));
