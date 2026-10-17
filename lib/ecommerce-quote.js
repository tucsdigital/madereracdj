import { getAdminDb } from "@/lib/firebase-admin";
import { calcularPreciosProducto, normalizarProductoEntrada } from "@/lib/pricing";
import { getExternalProductoFields } from "@/lib/producto-utils";
import { obtenerSettingsGeneral } from "@/lib/settings";

const money = (n) => Math.round(n * 100) / 100;
const fail = (message) => { throw Object.assign(new Error(message), { status: 409 }); };

export async function quoteOrder(input) {
  if (!Array.isArray(input.items) || !input.items.length || input.items.length > 100) fail("Carrito inválido");
  const db = getAdminDb();
  const ids = input.items.map((item) => String(item.id || ""));
  if (ids.some((id) => !id || id.includes("/")) || new Set(ids).size !== ids.length) fail("Productos inválidos o repetidos");
  let weight = 0;
  let missingWeight = false;
  const items = await Promise.all(input.items.map(async (item) => {
    const snap = await db.collection("productos").doc(String(item.id)).get();
    const p = snap.data();
    if (!p || p.estadoTienda !== "Activo") fail("Un producto ya no está disponible en la tienda");
    const ext = getExternalProductoFields(p);
    const quantity = Number(item.quantity);
    const pack = Math.max(1, Number(ext.pack) || 1);
    const minimum = Math.max(pack, Number(ext.minimoCompra) || 1);
    if (!Number.isSafeInteger(quantity) || quantity < minimum || quantity % pack !== 0) fail(`Revisá la cantidad de ${p.nombre}: mínimo ${minimum}, múltiplos de ${pack}`);
    const prices = calcularPreciosProducto(normalizarProductoEntrada(p), { cantidad: 1 });
    const base = money(Number(prices.precioUnitarioBase));
    const pct = Number(p.discount?.percentage ?? p.descuentoPorcentaje ?? p.porcentajeDescuento ?? 0);
    const amount = Number(p.discount?.amount ?? p.descuentoMonto ?? p.descuentoImporte ?? 0);
    const price = money(pct > 0 ? base * (1 - pct / 100) : amount > 0 ? base - amount : Number(prices.precioUnitarioFinal));
    if (!(price > 0) || !Number.isFinite(price)) fail(`Precio no disponible para ${p.nombre}`);
    const kg = Number(String(ext.kg ?? "").replace(",", "."));
    if (!(kg > 0)) missingWeight = true;
    else weight += kg * quantity;
    return {
      id: snap.id, name: p.nombre || p.descripcion || snap.id, quantity, price,
      basePrice: base, totalPrice: money(price * quantity),
      unidad: p.unidadMedida || p.unidad || "Unidad", category: p.categoria || "",
      esCombo: p.esCombo === true || p.tipoProducto === "combo",
      tipoProducto: p.tipoProducto || "simple", componentesCombo: p.componentesCombo || [],
      versionComposicion: Number(p.versionComposicion) || 1,
      image: typeof p.imagen === "string" ? p.imagen : "",
    };
  }));
  const paymentMethod = input.paymentMethod === "transferencia" ? "transferencia" : "mercadopago";
  const deliveryInfo = { ...input.deliveryInfo };
  if (!["retiro", "envio", "cotizar"].includes(deliveryInfo.metodoEntrega)) fail("Seleccioná una modalidad de entrega");
  const { locations, shippingTiers, data } = await obtenerSettingsGeneral();
  let shipping = 0;
  if (deliveryInfo.metodoEntrega === "envio") {
    const lat = Number(deliveryInfo.lat), lng = Number(deliveryInfo.lng);
    if (deliveryInfo.lat == null || deliveryInfo.lng == null || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) fail("Revisá la dirección de entrega");
    if (missingWeight || weight > Number(data?.shippingMaxWeightKg || 100)) fail("Este pedido necesita cotización de envío. Volvé al paso de entrega y solicitá cotización.");
    const rad = (n) => n * Math.PI / 180;
    const stores = locations.map((store) => {
      const a = Math.sin(rad(store.lat - lat) / 2) ** 2 + Math.cos(rad(lat)) * Math.cos(rad(store.lat)) * Math.sin(rad(store.lng - lng) / 2) ** 2;
      return { ...store, distance: money(6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))) };
    }).sort((a, b) => a.distance - b.distance);
    const store = stores[0];
    const tier = store && shippingTiers.find((t) => t.price >= 0 && t.km >= store.distance);
    if (!store || store.distance > store.radio / 1000 || !tier) fail("El envío necesita cotización. Volvé al paso de entrega.");
    shipping = money(tier.price);
    Object.assign(deliveryInfo, { storeId: store.id || null, sucursal: store, distanciaKm: store.distance, shippingTierKm: tier.km });
  }
  deliveryInfo.shippingPrice = shipping;
  const subtotal = money(items.reduce((sum, item) => sum + item.basePrice * item.quantity, 0));
  const net = money(items.reduce((sum, item) => sum + item.totalPrice, 0));
  const rawRate = Number(String(data?.transferenciaDescuentoPct ?? process.env.TRANSFERENCIA_DESCUENTO_PCT ?? "0").replace(",", ".").replace("%", ""));
  const rate = Number.isFinite(rawRate) ? Math.min(0.9, Math.max(0, rawRate < 1 ? rawRate : rawRate / 100)) : 0;
  const transferDiscount = paymentMethod === "transferencia" ? money(net * rate) : 0;
  const pricing = { subtotal, productDiscounts: money(subtotal - net), transferDiscount, shipping, total: money(net - transferDiscount + shipping) };
  return { items, deliveryInfo, paymentMethod, pricing, total: pricing.total, currency: "ARS", transferDiscountRate: rate };
}
