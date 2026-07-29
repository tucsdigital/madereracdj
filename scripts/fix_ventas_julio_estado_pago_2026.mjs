import fs from "fs";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

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

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: getEnv("FIREBASE_PROJECT_ID"),
      clientEmail: getEnv("FIREBASE_CLIENT_EMAIL"),
      privateKey: getEnv("FIREBASE_PRIVATE_KEY"),
    }),
    projectId: getEnv("FIREBASE_PROJECT_ID"),
  });
}

const db = getFirestore();

const toNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const round2 = (value) => Number(toNumber(value).toFixed(2));

const toDateKey = (value) => {
  if (!value) return "";
  if (typeof value === "string") {
    const raw = value.trim();
    if (!raw) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const ms = Date.parse(raw);
    return Number.isFinite(ms) ? new Date(ms).toISOString().split("T")[0] : raw;
  }
  if (value?.toDate && typeof value.toDate === "function") {
    return value.toDate().toISOString().split("T")[0];
  }
  if (typeof value?.seconds === "number") {
    return new Date(value.seconds * 1000).toISOString().split("T")[0];
  }
  const ms = Date.parse(String(value));
  return Number.isFinite(ms) ? new Date(ms).toISOString().split("T")[0] : "";
};

const sanitizePagos = (pagos) =>
  (Array.isArray(pagos) ? pagos : [])
    .map((pago) => ({
      ...pago,
      monto: round2(pago?.monto),
      fecha: toDateKey(pago?.fecha),
      metodo: String(pago?.metodo || "-").trim() || "-",
      usuario: String(pago?.usuario || "Sistema").trim() || "Sistema",
    }))
    .filter((pago) => pago.monto > 0);

const normalizePaymentFields = (venta) => {
  const pagos = sanitizePagos(venta?.pagos);
  const abonado = pagos.length > 0
    ? round2(pagos.reduce((acc, pago) => acc + toNumber(pago?.monto), 0))
    : round2(venta?.montoAbonado);
  const total = round2(venta?.total);
  const estadoPago = total > 0 && abonado >= total ? "pagado" : abonado > 0 ? "parcial" : "pendiente";
  const saldoPendiente = round2(Math.max(total - abonado, 0));
  const saldoAFavor = round2(Math.max(abonado - total, 0));
  const fechaPagoConfirmado =
    pagos.length > 0
      ? pagos
          .map((pago) => toDateKey(pago?.fecha))
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

const targetIds = [
  "40Rek0tAyWvpXp2YMR3B",
  "ADi42kzBTfE7oPjKbg0Y",
  "TUU5IU28HhhrpRu5vbTo",
  "r4ILRc3vzCsc79liyaBD",
];

const results = [];

for (const ventaId of targetIds) {
  const ref = db.collection("ventas").doc(ventaId);
  const snap = await ref.get();
  if (!snap.exists) {
    results.push({ ventaId, ok: false, error: "not_found" });
    continue;
  }

  const venta = snap.data() || {};
  const next = normalizePaymentFields(venta);
  const before = {
    estadoPago: String(venta?.estadoPago || ""),
    montoAbonado: round2(venta?.montoAbonado),
    saldoPendiente: round2(venta?.saldoPendiente),
    saldoAFavor: round2(venta?.saldoAFavor),
    fechaPagoConfirmado: venta?.fechaPagoConfirmado || null,
  };

  const changed =
    before.estadoPago !== next.estadoPago ||
    before.montoAbonado !== next.montoAbonado ||
    before.saldoPendiente !== next.saldoPendiente ||
    before.saldoAFavor !== next.saldoAFavor ||
    before.fechaPagoConfirmado !== next.fechaPagoConfirmado;

  if (!changed) {
    results.push({ ventaId, ok: true, skipped: true, before, after: next });
    continue;
  }

  await ref.set(
    {
      ...next,
      actualizadoEn: new Date().toISOString(),
      actualizadoPorEmail: "audit_script@local",
      actualizadoPorUid: "audit_script",
    },
    { merge: true },
  );

  await db.collection("auditoria").add({
    accion: "NORMALIZACION_ESTADO_PAGO_VENTA",
    coleccion: "ventas",
    documentoId: ventaId,
    numeroPedido: String(venta?.numeroPedido || ""),
    usuarioId: "audit_script",
    usuarioEmail: "audit_script@local",
    fecha: FieldValue.serverTimestamp(),
    origen: "script_fix_ventas_julio_estado_pago_2026",
    before,
    after: next,
  });

  results.push({ ventaId, ok: true, before, after: next });
}

console.log(JSON.stringify({ updated: results }, null, 2));
