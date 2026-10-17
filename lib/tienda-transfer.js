import { getAdminDb } from "@/lib/firebase-admin";
import { TIENDA_DEFAULTS, normalizeTransferencia } from "@/lib/tienda-config";

const parseRate = (raw) => {
  const n = Number(String(raw ?? "").trim().replace(",", ".").replace("%", ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(0.9, n < 1 ? n : n / 100);
};

/** Configuración de transferencia publicada desde /tienda-web (o null si nunca se guardó). */
export async function getPublishedTransferencia(db = getAdminDb()) {
  const data = (await db.collection("settings").doc("tienda").get()).data();
  return data?.published?.transferencia ? normalizeTransferencia(data.published.transferencia) : null;
}

/**
 * Fracción de descuento por transferencia (0–0,9) y horas de reserva. Prioridad del descuento: panel de la
 * tienda web, ajuste general antiguo, variable de entorno y, por último, el valor original de la tienda.
 */
export async function getTransferSettings({ db = getAdminDb(), general } = {}) {
  const published = await getPublishedTransferencia(db);
  const reserveHours = published?.plazoHoras ?? TIENDA_DEFAULTS.transferencia.plazoHoras;
  if (published) return { rate: Math.min(0.9, published.descuentoPct / 100), reserveHours };
  const legacy = parseRate(general?.transferenciaDescuentoPct);
  if (legacy !== null) return { rate: legacy, reserveHours };
  const env = parseRate(process.env.TRANSFERENCIA_DESCUENTO_PCT);
  if (env !== null) return { rate: env, reserveHours };
  return { rate: Math.min(0.9, TIENDA_DEFAULTS.transferencia.descuentoPct / 100), reserveHours };
}

export async function getTransferDiscountRate(options) {
  return (await getTransferSettings(options)).rate;
}
