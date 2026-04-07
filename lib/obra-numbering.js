import { db } from "@/lib/firebase";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  runTransaction,
  writeBatch,
} from "firebase/firestore";

const COUNTERS_COLLECTION = "correlativos";
const OBRA_COUNTER_ID = "obras";
const PRESUPUESTO_OBRA_COUNTER_ID = "presupuestos_obra";
const DOCUMENTACION_COUNTER_ID = "documentacion";

const toMillis = (value) => {
  if (!value) return 0;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  if (typeof value?.toDate === "function") {
    const dt = value.toDate();
    const ms = dt?.getTime?.();
    return Number.isFinite(ms) ? ms : 0;
  }
  if (typeof value?.seconds === "number") {
    return value.seconds * 1000;
  }
  return 0;
};

const parsePrefixedNumber = (value, prefix) => {
  const text = String(value || "").trim().toUpperCase();
  const normalizedPrefix = String(prefix || "").trim().toUpperCase();
  if (!text.startsWith(`${normalizedPrefix}-`)) return null;
  const parsed = Number.parseInt(
    text.slice(normalizedPrefix.length + 1),
    10
  );
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
};

const formatPrefixedNumber = (prefix, number, padding) =>
  `${prefix}-${String(number).padStart(padding, "0")}`;

const getMaxExistingNumber = async ({ tipo, prefix }) => {
  const snap = await getDocs(collection(db, "obras"));
  let maxNumber = 0;
  snap.docs.forEach((docSnap) => {
    const data = docSnap.data();
    if (tipo && data.tipo !== tipo) return;
    const parsed = parsePrefixedNumber(data.numeroPedido, prefix);
    if (parsed && parsed > maxNumber) {
      maxNumber = parsed;
    }
  });
  return maxNumber;
};

const getNextNumberFromCounter = async ({
  counterId,
  tipo,
  prefix,
  padding,
}) => {
  const counterRef = doc(db, COUNTERS_COLLECTION, counterId);
  const [counterSnap, maxExisting] = await Promise.all([
    getDoc(counterRef),
    getMaxExistingNumber({ tipo, prefix }),
  ]);

  const preloadedCounter = Number(counterSnap.data()?.lastNumber) || 0;
  const nextNumber = await runTransaction(db, async (transaction) => {
    const txCounterSnap = await transaction.get(counterRef);
    const txCounterValue = Number(txCounterSnap.data()?.lastNumber) || 0;
    const base = Math.max(txCounterValue, preloadedCounter, maxExisting, 0);
    const candidate = base + 1;
    transaction.set(
      counterRef,
      {
        lastNumber: candidate,
        prefix,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
    return candidate;
  });

  return formatPrefixedNumber(prefix, nextNumber, padding);
};

export const getNextObraNumber = async () =>
  getNextNumberFromCounter({
    counterId: OBRA_COUNTER_ID,
    tipo: "obra",
    prefix: "OBRA",
    padding: 5,
  });

export const getNextObraPresupuestoNumber = async () =>
  getNextNumberFromCounter({
    counterId: PRESUPUESTO_OBRA_COUNTER_ID,
    tipo: "presupuesto",
    prefix: "PO",
    padding: 4,
  });

export const getNextDocumentacionNumber = async () =>
  getNextNumberFromCounter({
    counterId: DOCUMENTACION_COUNTER_ID,
    tipo: null,
    prefix: "DOC",
    padding: 6,
  });

export const repairObraPedidosByCreationDate = async () => {
  const snap = await getDocs(collection(db, "obras"));
  const obras = snap.docs
    .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
    .filter((item) => item.tipo === "obra");

  const sorted = [...obras].sort((a, b) => {
    const aDate = toMillis(a.fechaCreacion || a.fecha || a.creadoEn);
    const bDate = toMillis(b.fechaCreacion || b.fecha || b.creadoEn);
    if (aDate !== bDate) return aDate - bDate;
    return String(a.id).localeCompare(String(b.id));
  });

  let lastCorrectIndex = -1;
  let expectedNumber = null;

  for (let i = 0; i < sorted.length; i += 1) {
    const parsed = parsePrefixedNumber(sorted[i].numeroPedido, "OBRA");
    if (!parsed) break;
    if (expectedNumber === null) {
      lastCorrectIndex = i;
      expectedNumber = parsed + 1;
      continue;
    }
    if (parsed !== expectedNumber) break;
    lastCorrectIndex = i;
    expectedNumber += 1;
  }

  let nextNumber = expectedNumber || 1;
  const updates = [];
  for (let i = lastCorrectIndex + 1; i < sorted.length; i += 1) {
    const nuevoNumero = formatPrefixedNumber("OBRA", nextNumber, 5);
    if (String(sorted[i].numeroPedido || "") !== nuevoNumero) {
      updates.push({ id: sorted[i].id, numeroPedido: nuevoNumero });
    }
    nextNumber += 1;
  }

  if (updates.length > 0) {
    for (let i = 0; i < updates.length; i += 450) {
      const chunk = updates.slice(i, i + 450);
      const batch = writeBatch(db);
      chunk.forEach((item) => {
        batch.update(doc(db, "obras", item.id), {
          numeroPedido: item.numeroPedido,
        });
      });
      await batch.commit();
    }
  }

  const highestAssigned = sorted.length > 0 ? nextNumber - 1 : 0;
  const counterRef = doc(db, COUNTERS_COLLECTION, OBRA_COUNTER_ID);
  await runTransaction(db, async (transaction) => {
    const counterSnap = await transaction.get(counterRef);
    const current = Number(counterSnap.data()?.lastNumber) || 0;
    const nextCounter = Math.max(current, highestAssigned, 0);
    transaction.set(
      counterRef,
      {
        lastNumber: nextCounter,
        prefix: "OBRA",
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  });

  const lastCorrect =
    lastCorrectIndex >= 0
      ? {
          id: sorted[lastCorrectIndex].id,
          numeroPedido: sorted[lastCorrectIndex].numeroPedido || "",
          fechaCreacion: sorted[lastCorrectIndex].fechaCreacion || "",
        }
      : null;

  return {
    totalObras: sorted.length,
    updatedCount: updates.length,
    lastCorrect,
    firstUpdated: updates[0] || null,
    lastUpdated: updates[updates.length - 1] || null,
  };
};
