import { NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import {
  computeComboAvailableStock,
  computeComboStock,
  getComboComponentIds,
  isComboProduct,
  normalizeComboComponents,
} from "@/lib/combos";

function withCors(resp) {
  const headers = new Headers(resp.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET,OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  return new NextResponse(resp.body, { status: resp.status, headers });
}

async function getReservationTotals(productIds, now) {
  const ids = Array.from(new Set(productIds.map((id) => String(id).trim()).filter(Boolean)));
  const chunks = [];
  for (let index = 0; index < ids.length; index += 30) chunks.push(ids.slice(index, index + 30));
  const queries = chunks.flatMap((chunk) => [
    query(collection(db, "reservasStock"), where("productoId", "in", chunk)),
    query(collection(db, "reservasStock"), where("componentIds", "array-contains-any", chunk)),
  ]);
  const snapshots = await Promise.all(queries.map((reservationQuery) => getDocs(reservationQuery)));
  const reservations = new Map();
  snapshots.forEach((snapshot) => snapshot.docs.forEach((document) => {
    reservations.set(document.id, document.data() || {});
  }));
  const reservedByProductId = new Map(ids.map((id) => [id, 0]));
  reservations.forEach((reservation) => {
    if (String(reservation.estado || "").toLowerCase() !== "activa") return;
    const expiresAt = reservation.expiresAt?.toDate
      ? reservation.expiresAt.toDate().getTime()
      : Date.parse(reservation.expiresAt || "");
    if (!Number.isFinite(expiresAt) || expiresAt <= now) return;
    const quantity = Number(reservation.cantidad);
    if (!Number.isFinite(quantity) || quantity <= 0) return;
    const recipe = normalizeComboComponents(reservation.componentesReservados);
    if (recipe.length > 0) {
      recipe.forEach((component) => {
        if (reservedByProductId.has(component.productoId)) {
          reservedByProductId.set(
            component.productoId,
            reservedByProductId.get(component.productoId) + quantity * component.cantidad
          );
        }
      });
    } else {
      const productId = String(reservation.productoId || "");
      if (reservedByProductId.has(productId)) {
        reservedByProductId.set(productId, reservedByProductId.get(productId) + quantity);
      }
    }
  });
  return reservedByProductId;
}

export function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const idsParam = searchParams.get("ids");
    const now = Date.now();

    const productoIds = [];
    if (id) productoIds.push(id);
    if (idsParam) {
      idsParam
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((x) => productoIds.push(x));
    }

    if (productoIds.length === 0) {
      return withCors(NextResponse.json({ error: "Debe enviar id o ids" }, { status: 400 }));
    }

    const productSnapshots = await Promise.all(productoIds.map((pid) => getDoc(doc(db, "productos", pid))));
    const productsById = new Map();
    const componentIdsByCombo = new Map();
    productSnapshots.forEach((snapshot, index) => {
      if (!snapshot.exists()) return;
      const product = { id: snapshot.id, ...(snapshot.data() || {}) };
      productsById.set(snapshot.id, product);
      if (isComboProduct(product)) componentIdsByCombo.set(snapshot.id, getComboComponentIds(product));
    });
    const allComponentIds = Array.from(new Set(Array.from(componentIdsByCombo.values()).flat()));
    const componentSnapshots = await Promise.all(
      allComponentIds.map((componentId) => getDoc(doc(db, "productos", componentId)))
    );
    componentSnapshots.forEach((snapshot, index) => {
      if (snapshot.exists()) productsById.set(allComponentIds[index], { id: snapshot.id, ...(snapshot.data() || {}) });
    });
    const reservationTotals = await getReservationTotals([...productoIds, ...allComponentIds], now);

    const items = productoIds.map((pid, index) => {
      const snapshot = productSnapshots[index];
      if (!snapshot.exists()) return { id: pid, error: "No encontrado" };
      const stored = productsById.get(pid);
      if (isComboProduct(stored)) {
        const physicalStock = computeComboStock(stored, productsById);
        const stockDisponible = Math.max(
          0,
          computeComboAvailableStock(stored, productsById, reservationTotals) -
            (Number(reservationTotals.get(pid)) || 0)
        );
        return {
          id: stored.id,
          stockTotal: physicalStock,
          stockReservado: Math.max(0, physicalStock - stockDisponible),
          stockDisponible,
          estado: stored.estado || "",
          nombre: stored.nombre || "",
          unidadMedida: stored.unidadMedida || "",
          esCombo: true,
          versionComposicion: Number(stored.versionComposicion) || 1,
          componentes: normalizeComboComponents(stored.componentesCombo).map((component) => {
            const product = productsById.get(String(component.productoId));
            const stock = Number(product?.stock) || 0;
            const stockReservado = Number(reservationTotals.get(String(component.productoId))) || 0;
            return {
              productoId: component.productoId,
              nombre: product?.nombre || component.nombre || "",
              cantidadPorCombo: component.cantidad,
              stockTotal: stock,
              stockReservado,
              stockDisponible: Math.max(0, stock - stockReservado),
            };
          }),
        };
      }
      const stockTotal = Number(stored?.stock) || 0;
      const stockReservado = Number(reservationTotals.get(pid)) || 0;
      return {
        id: stored?.id || pid,
        stockTotal,
        stockReservado,
        stockDisponible: Math.max(0, stockTotal - stockReservado),
        estado: stored?.estado || "",
        nombre: stored?.nombre || "",
        unidadMedida: stored?.unidadMedida || "",
      };
    });

    return withCors(NextResponse.json({ items }));
  } catch (err) {
    return withCors(NextResponse.json({ error: err.message }, { status: 500 }));
  }
}


