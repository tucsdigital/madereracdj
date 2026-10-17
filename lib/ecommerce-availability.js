import { collectInventoryRequirements, getComboComponentIds } from "@/lib/combos";

// Comprobación de lectura para la cotización. La reserva definitiva sigue siendo transaccional en ventas-engine.
export async function assertOrderAvailability(db, items, products) {
  const componentIds = [...new Set([...products.values()].flatMap(getComboComponentIds))];
  await Promise.all(componentIds.filter((id) => !products.has(id)).map(async (id) => {
    const snap = await db.collection("productos").doc(id).get();
    if (snap.exists) products.set(id, { ...snap.data(), id });
  }));
  const { requiredById, combosInvalidos } = collectInventoryRequirements({
    lineItems: items.map((item) => ({ id: item.id, cantidad: item.quantity })), productoById: products,
  });
  const fail = (message) => { throw Object.assign(new Error(message), { status: 409 }); };
  if (combosInvalidos.length) fail("La composición de un combo cambió. Revisá tu carrito.");
  const ids = [...requiredById.keys()];
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
  for (const [id, quantity] of requiredById) {
    const p = products.get(id);
    const available = Math.max(0, (Number(p?.stock) || 0) - (reserved.get(id) || 0));
    if (!p || quantity > available) fail(`Stock insuficiente de ${p?.nombre || "un componente del pedido"}. Disponible: ${available}. Revisá las cantidades del carrito.`);
  }
}
