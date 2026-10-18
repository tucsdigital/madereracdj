import { collectInventoryRequirements, getComboComponentIds, isComboProduct } from "@/lib/combos";

const fail = (message) => { throw Object.assign(new Error(message), { status: 409 }); };

/**
 * Comprobación de lectura para la cotización. La reserva definitiva sigue siendo transaccional en ventas-engine.
 * Reparte cada línea entre unidades con stock y unidades pedidas sin stock (solo si la política del producto lo permite
 * y dentro de su tope). Devuelve, por id de producto, cuántas unidades van sin stock.
 */
export async function assertOrderAvailability(db, items, products, { policyFor } = {}) {
  const componentIds = [...new Set([...products.values()].flatMap(getComboComponentIds))];
  await Promise.all(componentIds.filter((id) => !products.has(id)).map(async (id) => {
    const snap = await db.collection("productos").doc(id).get();
    if (snap.exists) products.set(id, { ...snap.data(), id });
  }));
  const lines = items.map((item) => ({ id: String(item.id), cantidad: Number(item.quantity) }));
  const all = collectInventoryRequirements({ lineItems: lines, productoById: products });
  if (all.combosInvalidos.length) fail("La composición de un combo cambió. Revisá tu carrito.");

  const ids = [...all.requiredById.keys()];
  const reservations = new Map();
  for (let i = 0; i < ids.length; i += 30) {
    const chunk = ids.slice(i, i + 30);
    const snapshots = await Promise.all([
      db.collection("reservasStock").where("productoId", "in", chunk).get(),
      db.collection("reservasStock").where("componentIds", "array-contains-any", chunk).get(),
    ]);
    snapshots.forEach((snap) => snap.docs.forEach((doc) => reservations.set(doc.id, doc.data())));
  }
  const reserved = new Map();
  for (const r of reservations.values()) {
    const expiry = r.expiresAt?.toDate ? r.expiresAt.toDate().getTime() : Date.parse(r.expiresAt || "");
    if (r.estado !== "activa" || !(expiry > Date.now())) continue;
    const quantity = Number(r.cantidad) || 0;
    const recipe = r.componentesReservados?.length ? r.componentesReservados : [{ productoId: r.productoId, cantidad: 1 }];
    recipe.forEach((c) => reserved.set(c.productoId, (reserved.get(c.productoId) || 0) + quantity * Number(c.cantidad)));
  }
  const available = new Map(ids.map((id) => [id, Math.max(0, (Number(products.get(id)?.stock) || 0) - (reserved.get(id) || 0))]));
  const insufficient = (id) => fail(`Stock insuficiente de ${products.get(id)?.nombre || "un componente del pedido"}. Disponible: ${available.get(id) || 0}. Revisá las cantidades del carrito.`);

  // Los combos consumen primero: su stock depende de sus componentes y no admite pedido sin stock.
  const comboLines = lines.filter((line) => isComboProduct(products.get(line.id)));
  const { requiredById: comboRequired } = collectInventoryRequirements({ lineItems: comboLines, productoById: products });
  for (const [id, quantity] of comboRequired) {
    if (!products.get(id) || quantity > (available.get(id) || 0)) insufficient(id);
    available.set(id, available.get(id) - quantity);
  }

  const allocation = new Map();
  for (const line of lines) {
    const product = products.get(line.id);
    if (!product) insufficient(line.id);
    if (isComboProduct(product)) { allocation.set(line.id, { sinStock: 0 }); continue; }
    const inStock = Math.min(line.cantidad, available.get(line.id) || 0);
    const sinStock = line.cantidad - inStock;
    if (sinStock > 0) {
      const policy = policyFor?.(product);
      if (!(policy?.tope > 0)) insufficient(line.id);
      if (sinStock > policy.tope) {
        const max = inStock + policy.tope;
        fail(`Podés pedir hasta ${max} unidades de ${product.nombre || "este producto"} (${inStock} en stock y ${policy.tope} bajo pedido). Revisá las cantidades del carrito.`);
      }
    }
    available.set(line.id, (available.get(line.id) || 0) - inStock);
    allocation.set(line.id, { sinStock });
  }
  return allocation;
}
