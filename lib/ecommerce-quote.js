import { getAdminDb } from "@/lib/firebase-admin";
import { calcularPreciosProducto, normalizarProductoEntrada } from "@/lib/pricing";
import { getExternalProductoFields } from "@/lib/producto-utils";
import { obtenerSettingsGeneral } from "@/lib/settings";
import { computeShipping, normalizeShippingRules } from "@/lib/shipping";
import { assertOrderAvailability } from "@/lib/ecommerce-availability";
import { getTransferSettings } from "@/lib/tienda-transfer";

const money = (n) => Math.round(n * 100) / 100;
const fail = (message) => { throw Object.assign(new Error(message), { status: 409 }); };

export async function quoteOrder(input) {
  if (!Array.isArray(input.items) || !input.items.length || input.items.length > 100) fail("Carrito inválido");
  const db = getAdminDb();
  const ids = input.items.map((item) => String(item.id || ""));
  if (ids.some((id) => !id || id.includes("/")) || new Set(ids).size !== ids.length) fail("Productos inválidos o repetidos");
  let weight = 0;
  const products = new Map();
  let missingWeight = false;
  const items = await Promise.all(input.items.map(async (item) => {
    const snap = await db.collection("productos").doc(String(item.id)).get();
    const p = snap.data();
    if (p) products.set(snap.id, { ...p, id: snap.id });
    if (!p || p.estadoTienda !== "Activo") fail("Un producto ya no está disponible en la tienda");
    const ext = getExternalProductoFields(p);
    const quantity = Number(item.quantity);
    const pack = Math.max(1, Number(ext.pack) || 1);
    const minimum = Math.max(pack, Number(ext.minimoCompra) || 1);
    if (!Number.isSafeInteger(quantity) || quantity < minimum || quantity % pack !== 0) fail(`Revisá la cantidad de ${p.nombre}: mínimo ${minimum}, múltiplos de ${pack}`);
    const prices = calcularPreciosProducto(normalizarProductoEntrada(p), { cantidad: quantity });
    const base = money(Number(prices.precioUnitarioBase));
    const baseTotal = money(Number(prices.precioTotalBase));
    const pct = Math.min(100, Math.max(0, Number(p.discount?.percentage ?? p.descuentoPorcentaje ?? p.porcentajeDescuento ?? 0)));
    const amount = Number(p.discount?.amount ?? p.descuentoMonto ?? p.descuentoImporte ?? 0);
    const totalPrice = money(Math.max(0, pct > 0 ? baseTotal * (1 - pct / 100) : baseTotal - Math.max(0, amount) * quantity));
    const price = totalPrice / quantity;
    if (!(price > 0) || !Number.isFinite(price)) fail(`Precio no disponible para ${p.nombre}`);
    const kg = Number(String(ext.kg ?? "").replace(",", "."));
    if (!(kg > 0)) missingWeight = true;
    else weight += kg * quantity;
    return {
      id: snap.id, name: p.nombre || p.descripcion || snap.id, quantity, price,
      basePrice: baseTotal / quantity, baseTotal, totalPrice,
      unidad: p.unidadMedida || p.unidad || "Unidad", category: p.categoria || "",
      esCombo: p.esCombo === true || p.tipoProducto === "combo",
      tipoProducto: p.tipoProducto || "simple", componentesCombo: p.componentesCombo || [],
      versionComposicion: Number(p.versionComposicion) || 1,
      image: typeof p.imagen === "string" ? p.imagen : "",
    };
  }));
  await assertOrderAvailability(db, input.items, products);
  const paymentMethod = input.paymentMethod === "transferencia" ? "transferencia" : "mercadopago";
  const deliveryInfo = { ...input.deliveryInfo };
  if (!["retiro", "envio", "cotizar"].includes(deliveryInfo.metodoEntrega)) fail("Seleccioná una modalidad de entrega");
  const { locations, shippingTiers, shippingRules, data } = await obtenerSettingsGeneral();
  const subtotal = money(items.reduce((sum, item) => sum + item.basePrice * item.quantity, 0));
  const net = money(items.reduce((sum, item) => sum + item.totalPrice, 0));
  let shipping = 0;
  let shippingDetail = null;
  if (deliveryInfo.metodoEntrega === "envio") {
    const lat = Number(deliveryInfo.lat), lng = Number(deliveryInfo.lng);
    if (deliveryInfo.lat == null || deliveryInfo.lng == null || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) fail("Revisá la dirección de entrega");
    // El envío gratis se evalúa sobre el neto de productos (después de descuentos de producto).
    const result = computeShipping({
      locations, tiers: shippingTiers, rules: shippingRules ?? normalizeShippingRules(data?.shippingRules),
      lat, lng, weightKg: missingWeight ? null : weight, subtotal: net,
    });
    if (result.status !== "ok") fail(`Este pedido necesita cotización de envío (${result.message}) Volvé al paso de entrega y solicitá cotización.`);
    shipping = result.price;
    shippingDetail = { base: result.base, weightExtra: result.weightExtra, fuel: result.fuel, free: result.free, listPrice: result.listPrice };
    Object.assign(deliveryInfo, { storeId: result.store.id || null, sucursal: result.store, distanciaKm: result.distance, shippingTierKm: result.tierKm });
  }
  deliveryInfo.shippingPrice = shipping;
  const { rate, reserveHours } = await getTransferSettings({ db, general: data });
  const transferDiscount = paymentMethod === "transferencia" ? money(net * rate) : 0;
  const pricing = { subtotal, productDiscounts: money(subtotal - net), transferDiscount, shipping, total: money(net - transferDiscount + shipping) };
  return { items, deliveryInfo, paymentMethod, pricing, shippingDetail, total: pricing.total, currency: "ARS", transferDiscountRate: rate, transferReserveHours: reserveHours };
}
