import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase-admin";
import {
  computeComboStock,
  isValidComboQuantity,
  isComboProduct,
  normalizeComboComponents,
} from "@/lib/combos";
import { calcularPrecioComponenteVenta } from "@/lib/pricing";

function normalizeRecipeInput(rawComponents) {
  if (!Array.isArray(rawComponents) || rawComponents.length === 0) {
    throw new Error("El combo debe tener al menos un componente.");
  }
  const valid = rawComponents.every((component) => {
    const id = String(component?.productoId || component?.id || component?.originalId || "").trim();
    const quantity = Number(component?.cantidad);
    return id && Number.isFinite(quantity) && quantity > 0;
  });
  if (!valid) throw new Error("Cada componente necesita un producto y una cantidad mayor que cero.");
  const normalized = normalizeComboComponents(rawComponents);
  if (normalized.length === 0) throw new Error("El combo debe tener al menos un componente con cantidad válida.");
  return normalized;
}

async function readCanonicalComponents({ transaction, db, components }) {
  const snapshots = await Promise.all(
    components.map((component) => transaction.get(db.collection("productos").doc(component.productoId)))
  );
  const productsById = new Map();
  const canonicalComponents = snapshots.map((snapshot, index) => {
    const source = components[index];
    if (!snapshot.exists) throw new Error(`No se encontró el componente ${source.productoId}.`);
    const product = { id: snapshot.id, ...(snapshot.data() || {}) };
    if (product.categoria === "Obras" || product.categoria === "Combos" || isComboProduct(product)) {
      throw new Error(`${product.nombre || source.productoId} no es un componente permitido.`);
    }
    productsById.set(snapshot.id, product);
    if (!isValidComboQuantity(source.cantidad, product.unidadMedida || product.unidad)) {
      throw new Error(`${product.nombre || source.productoId} requiere una cantidad válida para su unidad de medida.`);
    }
    return {
      productoId: snapshot.id,
      cantidad: source.cantidad,
      nombre: String(product.nombre || source.nombre || "").trim(),
      codigo: String(product.codigo || source.codigo || "").trim(),
      categoria: String(product.categoria || "").trim(),
      unidadMedida: String(product.unidadMedida || product.unidad || "").trim(),
    };
  });
  return { canonicalComponents, productsById };
}

function getCalculatedFields({ components, productsById }) {
  const stock = computeComboStock({ componentesCombo: components }, productsById);
  const costs = components.map((component) => {
    const product = productsById.get(component.productoId);
    const cost = Number(product?.costo ?? product?.valorCompra ?? product?.costoCompra);
    return Number.isFinite(cost) && cost > 0 ? cost * component.cantidad : null;
  });
  const cost = costs.every((value) => value !== null)
    ? costs.reduce((total, value) => total + value, 0)
    : null;
  const componentPrices = components.map((component) => {
    const product = productsById.get(component.productoId);
    const unitPrice = calcularPrecioComponenteVenta(product);
    return Number.isFinite(unitPrice) && unitPrice > 0 ? unitPrice * component.cantidad : null;
  });
  const suggestedPrice = componentPrices.every((value) => value !== null)
    ? Math.round(componentPrices.reduce((total, value) => total + value, 0) * 100) / 100
    : null;
  return { stock, cost, suggestedPrice };
}

const recipeKey = (components) => JSON.stringify(
  normalizeComboComponents(components).map(({ productoId, cantidad }) => ({ productoId, cantidad }))
);

function sanitizeUserFields(fields = {}) {
  const result = { ...fields };
  for (const key of [
    "id", "stock", "stockCalculadoCombo", "stockDisponibleCombo", "esCombo", "tipoProducto",
    "componentesCombo", "comboComponentIds", "versionComposicion", "costoComponentesCalculado",
    "precioSugeridoCombo", "precioVentaManual",
    "costo", "createdByUid", "createdByEmail", "fechaCreacion", "composicionActualizadaEn",
  ]) delete result[key];
  return Object.fromEntries(Object.entries(result).filter(([, value]) => value !== undefined));
}

export async function createComboEngine({ actor, comboData }) {
  const db = getAdminDb();
  const ref = db.collection("productos").doc();
  const components = normalizeRecipeInput(comboData?.componentesCombo);
  const now = new Date().toISOString();

  return db.runTransaction(async (transaction) => {
    const { canonicalComponents, productsById } = await readCanonicalComponents({ transaction, db, components });
    const { stock, cost, suggestedPrice } = getCalculatedFields({ components: canonicalComponents, productsById });
    const priceInput = comboData?.precioVenta ?? comboData?.valorVenta;
    const hasPriceInput = priceInput !== undefined && priceInput !== null && String(priceInput).trim() !== "";
    const requestedPrice = hasPriceInput ? Number(priceInput) : null;
    if (hasPriceInput && (!Number.isFinite(requestedPrice) || requestedPrice <= 0)) {
      throw new Error("El precio de venta debe ser mayor que cero.");
    }
    const price = hasPriceInput ? requestedPrice : suggestedPrice;
    if (!String(comboData?.nombre || "").trim()) throw new Error("El nombre del combo es obligatorio.");
    if (!Number.isFinite(price) || price <= 0) throw new Error("El precio de venta debe ser mayor que cero.");

    const payload = {
      ...sanitizeUserFields(comboData),
      nombre: String(comboData.nombre).trim(),
      categoria: "Combos",
      precioVenta: price,
      valorVenta: price,
      precioSugeridoCombo: suggestedPrice,
      precioVentaManual: suggestedPrice === null || Math.abs(price - suggestedPrice) > 0.005,
      unidadMedida: "Unidad",
      unidad: "Unidad",
      tipoProducto: "combo",
      esCombo: true,
      componentesCombo: canonicalComponents,
      comboComponentIds: canonicalComponents.map((component) => component.productoId),
      versionComposicion: 1,
      stock,
      costo,
      costoComponentesCalculado: cost,
      deposito: comboData?.deposito || "deposito_1",
      fechaCreacion: now,
      fechaActualizacion: FieldValue.serverTimestamp(),
      creadoPorUid: String(actor?.uid || ""),
      creadoPorEmail: String(actor?.email || ""),
    };
    transaction.create(ref, payload);
    return { id: ref.id, stock, precioSugeridoCombo: suggestedPrice, versionComposicion: 1 };
  });
}

export async function updateComboEngine({ actor, comboId, updates }) {
  const db = getAdminDb();
  const ref = db.collection("productos").doc(String(comboId));
  const components = normalizeRecipeInput(updates?.componentesCombo);

  return db.runTransaction(async (transaction) => {
    const comboSnapshot = await transaction.get(ref);
    if (!comboSnapshot.exists) throw new Error("Combo no encontrado.");
    const previous = comboSnapshot.data() || {};
    if (!isComboProduct(previous) && previous.categoria !== "Combos") {
      throw new Error("El producto indicado no es un combo.");
    }
    const { canonicalComponents, productsById } = await readCanonicalComponents({ transaction, db, components });
    const { stock, cost, suggestedPrice } = getCalculatedFields({ components: canonicalComponents, productsById });
    const recipeChanged = recipeKey(previous.componentesCombo) !== recipeKey(canonicalComponents);
    const priceInput = updates?.precioVenta ?? updates?.valorVenta;
    const hasPriceInput = priceInput !== undefined && priceInput !== null && String(priceInput).trim() !== "";
    const requestedPrice = hasPriceInput ? Number(priceInput) : null;
    if (hasPriceInput && (!Number.isFinite(requestedPrice) || requestedPrice <= 0)) {
      throw new Error("El precio de venta debe ser mayor que cero.");
    }
    const useRecipePrice = !hasPriceInput && recipeChanged && previous.precioVentaManual !== true && suggestedPrice > 0;
    const price = hasPriceInput
      ? requestedPrice
      : useRecipePrice
        ? suggestedPrice
        : Number(previous.precioVenta ?? previous.valorVenta);
    const priceIsManual = hasPriceInput
      ? suggestedPrice === null || Math.abs(price - suggestedPrice) > 0.005
      : previous.precioVentaManual === true;
    if (!String(updates?.nombre ?? previous.nombre ?? "").trim()) throw new Error("El nombre del combo es obligatorio.");
    if (!Number.isFinite(price) || price <= 0) throw new Error("El precio de venta debe ser mayor que cero.");

    const payload = {
      ...sanitizeUserFields(updates),
      categoria: "Combos",
      precioVenta: price,
      valorVenta: price,
      precioSugeridoCombo: suggestedPrice,
      precioVentaManual: priceIsManual,
      unidadMedida: "Unidad",
      unidad: "Unidad",
      tipoProducto: "combo",
      esCombo: true,
      componentesCombo: canonicalComponents,
      comboComponentIds: canonicalComponents.map((component) => component.productoId),
      versionComposicion: Math.max(1, Number(previous.versionComposicion) || 1) + (recipeChanged ? 1 : 0),
      stock,
      costo,
      costoComponentesCalculado: cost,
      fechaActualizacion: FieldValue.serverTimestamp(),
      actualizadoPorUid: String(actor?.uid || ""),
      actualizadoPorEmail: String(actor?.email || ""),
      ...(recipeChanged ? { composicionActualizadaEn: new Date().toISOString() } : {}),
    };
    transaction.update(ref, payload);
    return { id: ref.id, stock, precioSugeridoCombo: suggestedPrice, versionComposicion: payload.versionComposicion };
  });
}
