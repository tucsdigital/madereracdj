import { NextResponse } from "next/server";
export const runtime = "nodejs";

import { getAdminDb, verifyFirebaseToken } from "@/lib/firebase-admin";
import { dimensionSearchVariants, parseDimensionQuery } from "@/lib/product-search";

const LIMIT_MAX = 30;
const normalizeText = (value) =>
  String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

const searchVariants = (value) => Array.from(new Set([
  value,
  value.toLowerCase(),
  value.toUpperCase(),
  value.charAt(0).toUpperCase() + value.slice(1).toLowerCase(),
].filter(Boolean)));

export async function GET(request) {
  try {
    await verifyFirebaseToken(request.headers.get("authorization"));
    const { searchParams } = new URL(request.url);
    const term = String(searchParams.get("q") || "").trim();
    const categoria = String(searchParams.get("categoria") || "").trim();
    const stockFilter = String(searchParams.get("stock") || "").trim();
    const selectedIds = Array.from(new Set(
      String(searchParams.get("selected") || "").split(",").map((id) => id.trim()).filter(Boolean)
    )).slice(0, 30);
    const limit = Math.min(Math.max(Number(searchParams.get("limit")) || 12, 1), LIMIT_MAX);
    const page = Math.min(Math.max(Number(searchParams.get("page")) || 0, 0), 20);
    const queryLimit = (page + 1) * limit + 1;
    if (!term && !categoria && stockFilter === "todos") {
      return NextResponse.json({ items: [], hasMore: false });
    }

    const db = getAdminDb();
    const collection = db.collection("productos");
    const queries = [];
    const variants = searchVariants(term);
    const dimensions = parseDimensionQuery(term);
    const dimensionQueries = [];

    if (dimensions && (!categoria || categoria === "Maderas")) {
      for (const variant of dimensionSearchVariants(dimensions)) {
        let query = collection.where("categoria", "==", "Maderas");
        for (const [field, value] of Object.entries(variant)) query = query.where(field, "==", value);
        dimensionQueries.push(query.limit(queryLimit).get());
      }
    }

    if (term) {
      for (const variant of variants) {
        for (const field of ["nombre", "codigo"]) {
          let query = collection.orderBy(field).startAt(variant).endAt(`${variant}\uf8ff`);
          if (categoria) query = query.where("categoria", "==", categoria);
          queries.push(query.limit(queryLimit).get());
        }
      }
    } else {
      let query = collection;
      if (categoria) query = query.where("categoria", "==", categoria);
      query = query.orderBy("nombre");
      queries.push(query.limit(queryLimit).get());
    }

    const [snapshots, dimensionSnapshots] = await Promise.all([
      Promise.all(queries),
      Promise.all(dimensionQueries.map((query) => query.catch(() => null))),
    ]);
    const dimensionMatches = new Set();
    dimensionSnapshots.filter(Boolean).forEach((snapshot) => snapshot.docs.forEach((document) => {
      dimensionMatches.add(document.id);
    }));
    const allSearchSnapshots = [...snapshots, ...dimensionSnapshots.filter(Boolean)];
    const productsById = new Map();
    const toProduct = (document) => {
      const data = document.data() || {};
      return {
        id: document.id,
        nombre: String(data.nombre || ""),
        codigo: String(data.codigo || ""),
        descripcion: String(data.descripcion || ""),
        categoria: String(data.categoria || ""),
        subcategoria: String(data.subcategoria || data.subCategoria || ""),
        unidadMedida: String(data.unidadMedida || data.unidad || ""),
        unidad: String(data.unidad || data.unidadMedida || ""),
        estado: String(data.estado || ""),
        estadoTienda: String(data.estadoTienda || ""),
        stock: Number(data.stock) || 0,
        costo: Number(data.costo ?? data.valorCompra ?? data.costoCompra) || null,
        precioVenta: Number(data.precioVenta ?? data.valorVenta ?? data.precioCalculado) || 0,
        valorVenta: Number(data.valorVenta ?? data.precioVenta ?? data.precioCalculado) || 0,
        alto: Number(data.alto) || null,
        ancho: Number(data.ancho) || null,
        largo: Number(data.largo) || null,
        espesor: Number(data.espesor) || null,
        precioPorPie: Number(data.precioPorPie) || 0,
        precioUnidad: Number(data.precioUnidad) || 0,
        precioUnidadVenta: Number(data.precioUnidadVenta) || 0,
        precioUnidadHerraje: Number(data.precioUnidadHerraje) || 0,
        precioUnidadQuimico: Number(data.precioUnidadQuimico) || 0,
        precioUnidadHerramienta: Number(data.precioUnidadHerramienta) || 0,
        cepilladoAplicado: data.cepilladoAplicado === true,
        cepilladoPorcentaje: Number(data.cepilladoPorcentaje) || 0,
        calibradoAplicado: data.calibradoAplicado === true,
        calibradoPorcentaje: Number(data.calibradoPorcentaje) || 0,
      };
    };
    allSearchSnapshots.forEach((snapshot) => snapshot.docs.forEach((document) => {
      if (productsById.has(document.id)) return;
      const data = document.data() || {};
      if (data.categoria === "Obras" || data.categoria === "Combos" || data.esCombo === true || String(data.tipoProducto || "").toLowerCase() === "combo") return;
      const name = normalizeText(data.nombre);
      const code = normalizeText(data.codigo);
      const normalizedTerm = normalizeText(term);
      if (normalizedTerm && !name.includes(normalizedTerm) && !code.includes(normalizedTerm) && !dimensionMatches.has(document.id)) return;
      productsById.set(document.id, toProduct(document));
    }));

    const selectedSnapshots = await Promise.all(
      selectedIds.map((id) => collection.doc(id).get())
    );
    const selectedItems = selectedSnapshots
      .filter((snapshot) => snapshot.exists)
      .map(toProduct);

    const allCandidates = new Map([
      ...Array.from(productsById.entries()),
      ...selectedItems.map((item) => [item.id, item]),
    ]);
    const candidateIds = Array.from(allCandidates.keys());
    const reservationChunks = [];
    for (let index = 0; index < candidateIds.length; index += 30) {
      reservationChunks.push(candidateIds.slice(index, index + 30));
    }
    const reservationQueries = reservationChunks.flatMap((chunk) => [
      db.collection("reservasStock").where("productoId", "in", chunk),
      db.collection("reservasStock").where("componentIds", "array-contains-any", chunk),
    ]);
    const reservationSnapshots = await Promise.all(reservationQueries.map((query) => query.get()));
    const reservationsById = new Map();
    reservationSnapshots.forEach((snapshot) => snapshot.docs.forEach((document) => {
      reservationsById.set(document.id, document.data() || {});
    }));
    const reservedByProductId = new Map(candidateIds.map((id) => [id, 0]));
    const now = Date.now();
    reservationsById.forEach((reservation) => {
      if (String(reservation.estado || "").toLowerCase() !== "activa") return;
      const expiresAt = reservation.expiresAt?.toDate
        ? reservation.expiresAt.toDate().getTime()
        : Date.parse(reservation.expiresAt || "");
      if (!Number.isFinite(expiresAt) || expiresAt <= now) return;
      const quantity = Number(reservation.cantidad);
      if (!Number.isFinite(quantity) || quantity <= 0) return;
      const recipe = Array.isArray(reservation.componentesReservados) ? reservation.componentesReservados : [];
      if (recipe.length > 0) {
        recipe.forEach((component) => {
          const id = String(component.productoId || "");
          const componentQuantity = Number(component.cantidad);
          if (reservedByProductId.has(id) && Number.isFinite(componentQuantity) && componentQuantity > 0) {
            reservedByProductId.set(id, reservedByProductId.get(id) + quantity * componentQuantity);
          }
        });
      } else {
        const id = String(reservation.productoId || "");
        if (reservedByProductId.has(id)) reservedByProductId.set(id, reservedByProductId.get(id) + quantity);
      }
    });
    const withAvailableStock = (product) => {
      const stockTotal = Math.max(0, Number(product.stock) || 0);
      const stockReservado = Number(reservedByProductId.get(String(product.id))) || 0;
      return {
        ...product,
        stockTotal,
        stockReservado,
        stock: Math.max(0, stockTotal - stockReservado),
      };
    };
    const candidatesWithStock = new Map(
      Array.from(allCandidates, ([id, product]) => [id, withAvailableStock(product)])
    );

    const candidates = Array.from(productsById.keys()).map((id) => candidatesWithStock.get(id));
    const sorted = candidates
      .filter((product) => stockFilter !== "con-stock" || product.stock > 0)
      .filter((product) => stockFilter !== "sin-stock" || product.stock <= 0)
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" }));
    const pageSize = (page + 1) * limit;
    return NextResponse.json({
      items: sorted.slice(0, pageSize),
      selectedItems: selectedItems.map((item) => candidatesWithStock.get(item.id) || item),
      hasMore:
        page < 20 &&
        (sorted.length > pageSize || allSearchSnapshots.some((snapshot) => snapshot.size >= queryLimit)),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || "No se pudo buscar componentes" },
      { status: error?.status || 500 }
    );
  }
}
