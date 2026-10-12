import { NextResponse } from "next/server";
import crypto from "crypto";
import { getAdminDb } from "@/lib/firebase-admin";
import {
  computeComboAvailableStock,
  computeComboStock,
  isComboProduct,
  normalizeComboComponents,
} from "@/lib/combos";

export const runtime = "nodejs";

function withCors(resp) {
  const headers = new Headers(resp.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "POST,OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type,Idempotency-Key,X-Api-Key,X-Request-Timestamp,X-Request-Hash,X-Request-Signature");
  return new NextResponse(resp.body, { status: resp.status, headers });
}

export function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

const fail = (message, status = 400) => {
  const error = new Error(message);
  error.status = status;
  throw error;
};

function isReservationActive(reservation, now) {
  if (String(reservation?.estado || "").toLowerCase() !== "activa") return false;
  const expiresAt = reservation.expiresAt?.toDate
    ? reservation.expiresAt.toDate().getTime()
    : Date.parse(reservation.expiresAt || "");
  return Number.isFinite(expiresAt) && expiresAt > now;
}

function sumReservedForProduct(productId, snapshots, now) {
  const reservations = new Map();
  snapshots.forEach((snapshot) => snapshot?.docs?.forEach((document) => {
    reservations.set(document.id, document.data() || {});
  }));
  let total = 0;
  reservations.forEach((reservation) => {
    if (!isReservationActive(reservation, now)) return;
    const quantity = Number(reservation.cantidad);
    if (!Number.isFinite(quantity) || quantity <= 0) return;
    const recipe = normalizeComboComponents(reservation.componentesReservados);
    if (recipe.length > 0) {
      const component = recipe.find((item) => String(item.productoId) === String(productId));
      if (component) total += quantity * component.cantidad;
    } else if (String(reservation.productoId || "") === String(productId)) {
      total += quantity;
    }
  });
  return total;
}

export async function POST(request) {
  try {
    const rawBody = await request.text();
    const headers = request.headers || new Headers();
    const apiKeyHeader = String(headers.get("X-Api-Key") || "").trim();
    const tsHeader = String(headers.get("X-Request-Timestamp") || "").trim();
    const hashHeader = String(headers.get("X-Request-Hash") || "").trim();
    const sigHeader = String(headers.get("X-Request-Signature") || "").trim();
    const expectedApiKey = String(process.env.EXTERNAL_API_API_KEY || "").trim();
    const sharedSecret = String(process.env.EXTERNAL_API_SHARED_SECRET || "").trim();
    if (!apiKeyHeader || !expectedApiKey || apiKeyHeader !== expectedApiKey) {
      return withCors(NextResponse.json({ error: "invalid_api_key" }, { status: 401 }));
    }
    if (hashHeader !== "HMAC-SHA256") {
      return withCors(NextResponse.json({ error: "invalid_hash_algo" }, { status: 400 }));
    }
    const timestamp = Number(tsHeader);
    if (!Number.isFinite(timestamp)) {
      return withCors(NextResponse.json({ error: "invalid_timestamp" }, { status: 400 }));
    }
    if (Math.abs(Date.now() - timestamp) > 300000) {
      return withCors(NextResponse.json({ error: "timestamp_out_of_window" }, { status: 401 }));
    }
    if (!sharedSecret) {
      return withCors(NextResponse.json({ error: "server_not_configured" }, { status: 500 }));
    }
    const computed = crypto.createHmac("sha256", sharedSecret).update(`${tsHeader}:${rawBody}`).digest("hex");
    const validSignature = computed.length === sigHeader.length &&
      crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(sigHeader));
    if (!validSignature) {
      return withCors(NextResponse.json({ error: "invalid_signature" }, { status: 401 }));
    }

    const body = JSON.parse(rawBody || "{}");
    const productoId = String(body?.productoId || "").trim();
    const carritoId = body?.carritoId ? String(body.carritoId) : null;
    const cantidad = Number(body?.cantidad || 0);
    const ttlRaw = Number(body?.ttlSegundos || 900);
    const ttlSegundos = Math.min(86400, Math.max(60, Number.isFinite(ttlRaw) ? ttlRaw : 900));
    const idempotencyKey = String(headers.get("Idempotency-Key") || body?.idempotencyKey || "").trim();
    if (!productoId || !Number.isFinite(cantidad) || cantidad <= 0) {
      return withCors(NextResponse.json({ error: "productoId y cantidad válidos requeridos" }, { status: 400 }));
    }

    const db = getAdminDb();
    const now = Date.now();
    const result = await db.runTransaction(async (transaction) => {
      const productRef = db.collection("productos").doc(productoId);
      const productSnapshot = await transaction.get(productRef);
      if (!productSnapshot.exists) fail("Producto no encontrado", 404);
      const product = { id: productSnapshot.id, ...(productSnapshot.data() || {}) };
      const isCombo = isComboProduct(product);
      if (isCombo && !Number.isSafeInteger(cantidad)) {
        fail("La cantidad reservada de combos debe ser un número entero mayor que cero.");
      }

      const components = isCombo ? normalizeComboComponents(product.componentesCombo) : [];
      if (isCombo && components.length === 0) fail("El combo no tiene componentes configurados.");

      const componentSnapshots = await Promise.all(
        components.map((component) => transaction.get(db.collection("productos").doc(component.productoId)))
      );
      const productsById = new Map();
      componentSnapshots.forEach((snapshot, index) => {
        if (!snapshot.exists) fail(`No se encontró el componente ${components[index].productoId}.`, 409);
        const componentProduct = { id: snapshot.id, ...(snapshot.data() || {}) };
        if (componentProduct.categoria === "Obras" || componentProduct.categoria === "Combos" || isComboProduct(componentProduct)) {
          fail(`${componentProduct.nombre || snapshot.id} no puede integrar un combo.`, 409);
        }
        productsById.set(snapshot.id, componentProduct);
      });

      const queries = [];
      if (idempotencyKey) {
        queries.push(db.collection("reservasStock").where("idempotencyKey", "==", idempotencyKey).limit(5));
      }
      const reservedProductIds = isCombo
        ? [...new Set([...components.map((component) => component.productoId), productoId])]
        : [productoId];
      for (const reservedProductId of reservedProductIds) {
        queries.push(
          db.collection("reservasStock").where("productoId", "==", reservedProductId)
        );
        if (isCombo && reservedProductId !== productoId) {
          queries.push(
            db.collection("reservasStock").where("componentIds", "array-contains", reservedProductId)
          );
        }
      }
      const querySnapshots = await Promise.all(queries.map((query) => transaction.get(query)));
      let cursor = 0;
      if (idempotencyKey) {
        const idempotencySnapshot = querySnapshots[cursor++];
        const existing = idempotencySnapshot?.docs?.find((snapshot) => {
          const reservation = snapshot.data() || {};
          const expires = Date.parse(reservation.idempotencyExpiresAt || "");
          return Number.isFinite(expires) && expires > now;
        });
        if (existing) return { reserva: { id: existing.id, ...existing.data() }, idempotente: true };
      }

      const activeReservationSnapshots = querySnapshots.slice(cursor);
      const stockTotal = isCombo ? computeComboStock(product, productsById) : Math.max(0, Number(product.stock) || 0);
      let stockReservado = 0;
      let stockDisponible = stockTotal;
      if (isCombo) {
        const reservedByProductId = new Map();
        components.forEach((component, index) => {
          reservedByProductId.set(
            component.productoId,
            sumReservedForProduct(component.productoId, activeReservationSnapshots, now)
          );
        });
        const legacyComboReserved = sumReservedForProduct(productoId, activeReservationSnapshots, now);
        stockDisponible = Math.max(
          0,
          computeComboAvailableStock(product, productsById, reservedByProductId) - legacyComboReserved
        );
        stockReservado = Math.max(0, stockTotal - stockDisponible);
      } else {
        stockReservado = sumReservedForProduct(productoId, activeReservationSnapshots, now);
        stockDisponible = Math.max(0, stockTotal - stockReservado);
      }

      if (cantidad > stockDisponible) {
        fail(`Stock insuficiente: disponibles ${stockDisponible}, solicitados ${cantidad}.`, 409);
      }

      const expiresAt = new Date(now + ttlSegundos * 1000).toISOString();
      const idempotencyExpiresAt = new Date(now + 15 * 60 * 1000).toISOString();
      const reservationRef = db.collection("reservasStock").doc();
      const reservation = {
        productoId,
        carritoId,
        cantidad,
        estado: "activa",
        createdAt: new Date(now).toISOString(),
        expiresAt,
        idempotencyKey: idempotencyKey || null,
        idempotencyExpiresAt,
        ...(isCombo ? {
          componentesReservados: components.map(({ productoId: componentId, cantidad: perCombo }) => ({ productoId: componentId, cantidad: perCombo })),
          componentIds: components.map((component) => component.productoId),
          versionComposicion: Number(product.versionComposicion) || 1,
        } : {}),
      };
      transaction.create(reservationRef, reservation);
      return {
        reserva: { id: reservationRef.id, ...reservation },
        stockTotal,
        stockReservado: Math.max(0, stockTotal - Math.max(0, stockDisponible - cantidad)),
        stockDisponible: Math.max(0, stockDisponible - cantidad),
      };
    });

    return withCors(NextResponse.json(result));
  } catch (error) {
    return withCors(NextResponse.json(
      { error: error?.message || "No se pudo reservar stock" },
      { status: error?.status || (error?.code ? 500 : 400) }
    ));
  }
}
