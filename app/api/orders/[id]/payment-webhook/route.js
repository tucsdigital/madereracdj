import { NextResponse } from "next/server";
import crypto from "crypto";
import { getAdminDb } from "@/lib/firebase-admin";
import { verifyCommerceRequest } from "@/lib/ecommerce-auth";
import { paymentDecision, shouldCreateMercadoPagoSale, stockReservationDecision } from "@/lib/ecommerce-payment-policy.mjs";
import { createVentaEngine, updateVentaEngine } from "@/lib/erp/ventas-engine";
import { sendOrderAdminNotification } from "@/lib/tienda-notificaciones";

const toShippingType = (method) => {
  const value = String(method || "").trim().toLowerCase();
  if (["retiro", "retiro_local", "pickup"].includes(value)) return "retiro_local";
  if (value === "cotizar") return "cotizar";
  return value || "domicilio";
};

function saleDataFromOrder(order, payment) {
  const pricing = order.pricing || {};
  const delivery = order.deliveryInfo || {};
  const items = Array.isArray(order.items) ? order.items : [];
  const total = Number(pricing.total ?? order.total) || 0;
  const subtotal = Number(pricing.subtotal) || items.reduce((sum, item) => sum + (Number(item.price) || 0) * (Number(item.quantity) || 0), 0);
  const discounts = Number(pricing.productDiscounts) || 0;
  const shipping = Number(pricing.shipping ?? order.shippingPrice) || 0;
  const createdAt = order.createdAt || new Date().toISOString();

  return {
    idExterno: order.orderId,
    idempotencyKey: `ecommerce_${String(order.orderId)}`,
    ecommerceLifecycle: true,
    estadoPago: "pagado",
    montoAbonado: total,
    total,
    subtotal,
    descuentos,
    descuentoTotal: discounts,
    descuentoEfectivo: Number(pricing.cashDiscount) || Number(pricing.transferDiscount) || 0,
    totalSinEfectivo: Math.max(0, subtotal - discounts + shipping),
    totalConEfectivo: null,
    reservaExpiresAt: order.stockReservationExpiresAt || new Date().toISOString(),
    fecha: new Date(createdAt).toLocaleDateString("es-AR"),
    fechaCreacion: createdAt,
    formaPago: "mercadopago",
    vendedor: "ecommerce",
    cliente: {
      email: order.customerInfo?.email || order.userId || "",
      nombre: order.customerInfo?.nombre || "",
      nombrePila: order.customerInfo?.nombrePila || "",
      apellido: order.customerInfo?.apellido || "",
      telefono: order.customerInfo?.telefono || "",
      dni: String(order.customerInfo?.dni || "").replace(/\D/g, ""),
      direccion: delivery.direccion || "",
      ciudad: delivery.ciudad || delivery.localidad || "",
      codigoPostal: delivery.codigoPostal || "",
    },
    productos: items.map((item) => ({
      id: item.id || "",
      originalId: item.id || "",
      nombre: item.name || "",
      cantidad: Number(item.quantity) || 0,
      precio: Number(item.price) || 0,
      unidad: item.unidad || item.unidadMedida || item.unit || "",
      unidadMedida: item.unidadMedida || item.unidad || item.unit || "",
      categoria: item.category || "",
      imagen: item.image || item.srcUrl || "",
      alto: item.alto || 0,
      ancho: item.ancho || 0,
      largo: item.largo || 0,
      esCombo: item.esCombo === true || item.tipoProducto === "combo",
      tipoProducto: item.tipoProducto || (item.esCombo ? "combo" : "simple"),
      componentesCombo: Array.isArray(item.componentesCombo) ? item.componentesCombo : [],
      versionComposicion: Number(item.versionComposicion) || 1,
      cantidadSinStock: Number(item.cantidadSinStock) || 0,
      plazoEntrega: item.plazoEntrega || "",
    })),
    tipoEnvio: toShippingType(delivery.metodoEntrega),
    estadoEnvio: "pendiente",
    direccionEnvio: delivery.direccion || "",
    localidadEnvio: delivery.localidad || delivery.ciudad || "",
    codigoPostal: delivery.codigoPostal || "",
    coordenadasEnvio: { lat: delivery.lat ?? null, lng: delivery.lng ?? null },
    sucursal: delivery.sucursal || null,
    storeId: delivery.storeId || null,
    costoEnvio: shipping,
    origen: "ecommerce_externo",
    pagoMercadoPago: {
      paymentId: String(payment.paymentId),
      status: payment.paymentStatus,
      amount: Number(payment.amount) || 0,
      currency: String(payment.currency || ""),
      approvedAt: new Date().toISOString(),
    },
  };
}

export async function POST(request, { params }) {
  try {
    const raw = await request.text();
    verifyCommerceRequest(request, raw);
    const payment = JSON.parse(raw);
    const id = String(params.id);
    if (!/^[a-zA-Z0-9_-]{16,100}$/.test(id) || !/^\d+$/.test(String(payment.paymentId))) {
      return NextResponse.json({ error: "Pedido o pago inválido" }, { status: 400 });
    }
    const db = getAdminDb();
    const ref = db.collection("orders").doc(id);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
    const order = snap.data();
    let status;
    try { status = paymentDecision(order, payment); }
    catch (error) { return NextResponse.json({ error: error.message }, { status: 409 }); }
    const eventKey = crypto.createHash("sha256").update(`${id}:${payment.paymentId}:${payment.paymentStatus}`).digest("hex");
    const eventRef = db.collection("paymentsWebhooks").doc(eventKey);
    if ((await eventRef.get()).exists) {
      const latestOrder = (await ref.get()).data() || order;
      await notifyOrderTransition(id, payment, latestOrder).catch((error) => console.error("No se pudo emitir el aviso de estado del pedido:", error?.message));
      return NextResponse.json({ success: true, idempotente: true });
    }

    const shouldCreateSale = shouldCreateMercadoPagoSale(order, payment, status);
    let saleId = order.ventaId || null;
    let saleNumber = order.ventaNumeroPedido || null;
    let inventoryReview = false;

    if (shouldCreateSale) {
      const actor = { uid: "", email: "mercadopago-webhook" };
      if (saleId) {
        const ventaRef = db.collection("ventas").doc(saleId);
        const venta = (await ventaRef.get()).data();
        if (!venta) throw new Error("Venta vinculada al pedido no encontrada");
        if (venta.estadoPago !== "pagado" || venta.inventarioAplicado === false) {
          const total = Number(order.pricing?.total ?? order.total);
          try {
            await updateVentaEngine({ actor, ventaId: saleId,
              ventaData: {
                ...venta,
                estadoPago: "pagado",
                montoAbonado: total,
                total,
                pagoMercadoPago: {
                  ...(venta.pagoMercadoPago || {}),
                  paymentId: String(payment.paymentId),
                  status: payment.paymentStatus,
                  amount: Number(payment.amount) || 0,
                  currency: String(payment.currency || ""),
                  approvedAt: new Date().toISOString(),
                },
              }, origen: "ecommerce_externo" });
          } catch (error) {
            if (error.status !== 409 || !/Stock insuficiente/.test(error.message)) throw error;
            inventoryReview = true;
            await db.collection("ventas").doc(saleId).set({
              estadoPago: "pagado",
              montoAbonado: total,
              total,
              inventarioAplicado: false,
              requiereRevision: true,
              revisionPago: error.message,
              pagoPorConciliar: payment,
            }, { merge: true });
          }
        }
        saleNumber = venta.numeroPedido || saleNumber;
      } else {
        const ventaData = saleDataFromOrder(order, payment);
        let created;
        try {
          created = await createVentaEngine({ actor, ventaData, origen: "ecommerce_externo", orderReservationId: id });
        } catch (error) {
          const inventoryConflict = /Stock insuficiente|Un producto del pedido ya no existe|componentes del combo|combo sin componentes configurados/i.test(error.message || "");
          if (!inventoryConflict) throw error;
          inventoryReview = true;
          created = await createVentaEngine({
            actor,
            ventaData: { ...ventaData, requiereRevision: true, revisionInventario: error.message },
            origen: "ecommerce_externo",
            orderReservationId: id,
            skipInventory: true,
          });
        }
        saleId = created.id;
        saleNumber = created.numeroPedido || null;
        await db.collection("ventasExternal").doc(id).set({
          orderId: id,
          ventaId: saleId,
          numeroPedido: saleNumber,
          createdAt: new Date().toISOString(),
          source: "mercadopago_webhook",
        }, { merge: true });
        await ref.set({ ventaId: saleId, ventaNumeroPedido: saleNumber }, { merge: true });
      }
    }
    await db.runTransaction(async (t) => {
      const current = await t.get(ref);
      const event = await t.get(eventRef);
      if (event.exists) return;
      const currentOrder = current.data();
      const nextStatus = paymentDecision(currentOrder, payment);
      const reservationDecision = stockReservationDecision(payment.paymentStatus);
      const reservationQueries = reservationDecision !== "pending"
        ? await Promise.all([
            t.get(db.collection("reservasStock").where("orderId", "==", id)),
            (currentOrder.ventaId || saleId) ? t.get(db.collection("reservasStock").where("ventaId", "==", currentOrder.ventaId || saleId)) : Promise.resolve(null),
          ])
        : [];
      const now = new Date().toISOString();
      // Un rechazo viejo no debe sobrescribir un pago aprobado.
      if (nextStatus !== "success" || payment.paymentStatus === "approved") {
        t.update(ref, {
          paymentId: String(payment.paymentId),
          paymentStatus: payment.paymentStatus,
          status: inventoryReview && nextStatus === "success" ? "review" : nextStatus,
          ...(saleId ? { ventaId: saleId, ventaNumeroPedido: saleNumber } : {}),
          ...(inventoryReview ? { revisionPago: "Pago aprobado; inventario requiere conciliación." } : {}),
          ...(reservationDecision !== "pending" ? { stockReservationStatus: reservationDecision } : {}),
          updatedAt: now,
        });
      }
      t.create(eventRef, { ...payment, receivedAt: now });
      reservationQueries.flatMap((query) => query?.docs || []).forEach((reservation) => {
        if (reservation.data().estado === "activa") {
          const estado = reservationDecision === "consumed" ? "consumida" : "liberada";
          t.update(reservation.ref, { estado, ...(estado === "consumida" && saleId ? { ventaId: saleId } : {}), actualizadoEn: now });
        }
      });
      if (nextStatus === "review" && (currentOrder.ventaId || saleId)) {
        t.set(db.collection("ventas").doc(currentOrder.ventaId || saleId), { requiereRevision: true, revisionPago: payment.paymentStatus }, { merge: true });
      }
    });
    const latestOrder = (await ref.get()).data() || order;
    await notifyOrderTransition(id, payment, latestOrder, inventoryReview).catch((error) => console.error("No se pudo emitir el aviso de estado del pedido:", error?.message));
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.status || 500 });
  }
}

async function notifyOrderTransition(orderId, payment, order, inventoryReview = false) {
  const currentStatus = String(order?.status || "").toLowerCase();
  const isAlreadyPaid = ["success", "paid", "approved", "pagado"].includes(currentStatus);
  if (payment.paymentStatus === "approved") {
    await sendOrderAdminNotification(orderId, "confirmed", { fallbackOrder: order, status: "confirmed", paymentStatus: "approved" });
    if (inventoryReview || order?.status === "review") {
      await sendOrderAdminNotification(orderId, "review", { fallbackOrder: order, status: "review", paymentStatus: "approved" });
    }
  } else if (["refunded", "charged_back"].includes(payment.paymentStatus)) {
    await sendOrderAdminNotification(orderId, "review", { fallbackOrder: order, status: "review", paymentStatus: payment.paymentStatus });
  }
}
