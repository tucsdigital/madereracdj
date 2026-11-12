import { NextResponse } from "next/server";
import { verifyFirebaseToken, getAdminDb } from "@/lib/firebase-admin";
import { sendOrderAdminNotification } from "@/lib/tienda-notificaciones";
import { buildVentaPaymentSnapshot } from "@/lib/ventas-pagos";

export const runtime = "nodejs";

const ALLOWED = new Set(["preparando", "listo_para_retirar", "retirado"]);
const isPickup = (sale) => ["retiro", "retiro_local", "retiro_en_sucursal", "retira", "retira_en_local", "pickup"].includes(String(sale?.tipoEnvio || "").trim().toLowerCase());

export async function POST(request, { params }) {
  try {
    const actor = await verifyFirebaseToken(request.headers.get("authorization"));
    const body = await request.json().catch(() => ({}));
    const nextStatus = String(body?.status || "").trim().toLowerCase();
    const hasStatus = Boolean(nextStatus);
    const hasPickupWindow = Object.prototype.hasOwnProperty.call(body || {}, "rangoHorario");
    const pickupWindow = hasPickupWindow ? String(body.rangoHorario ?? "").trim() : undefined;
    const hasDeliveryDate = Object.prototype.hasOwnProperty.call(body || {}, "fechaEntrega");
    const deliveryDate = hasDeliveryDate ? String(body.fechaEntrega ?? "").trim() : undefined;
    const saleId = String(params?.id || "").trim();
    if (!saleId || (!hasStatus && !hasPickupWindow && !hasDeliveryDate) || (hasStatus && !ALLOWED.has(nextStatus))) {
      return NextResponse.json({ ok: false, error: "Estado de retiro inválido." }, { status: 400 });
    }
    if (hasPickupWindow && (pickupWindow.length > 120 || /[\u0000-\u001f\u007f]/.test(pickupWindow))) {
      return NextResponse.json({ ok: false, error: "La franja de retiro debe tener hasta 120 caracteres y una sola línea." }, { status: 400 });
    }
    const parsedDeliveryDate = hasDeliveryDate && deliveryDate && /^\d{4}-\d{2}-\d{2}$/.test(deliveryDate)
      ? new Date(`${deliveryDate}T00:00:00.000Z`)
      : null;
    if (hasDeliveryDate && deliveryDate && (!parsedDeliveryDate || Number.isNaN(parsedDeliveryDate.getTime()) || parsedDeliveryDate.toISOString().slice(0, 10) !== deliveryDate)) {
      return NextResponse.json({ ok: false, error: "La fecha de retiro debe tener el formato AAAA-MM-DD." }, { status: 400 });
    }

    const db = getAdminDb();
    const saleRef = db.collection("ventas").doc(saleId);
    const saleSnap = await saleRef.get();
    if (!saleSnap.exists) return NextResponse.json({ ok: false, error: "Venta no encontrada." }, { status: 404 });
    const initialSale = saleSnap.data() || {};
    if (!initialSale.ecommerceLifecycle || !isPickup(initialSale)) {
      return NextResponse.json({ ok: false, error: "Esta acción solo aplica a pedidos ecommerce con retiro en local." }, { status: 409 });
    }
    if (initialSale.anulada === true || String(initialSale.estado || "").toLowerCase() === "anulada") {
      return NextResponse.json({ ok: false, error: "No se puede preparar una venta anulada." }, { status: 409 });
    }
    const orderId = String(initialSale.idExterno || "").trim();
    if (!orderId) return NextResponse.json({ ok: false, error: "El pedido no tiene una referencia ecommerce vinculada." }, { status: 409 });
    const orderRef = db.collection("orders").doc(orderId);
    const now = new Date().toISOString();
    const result = await db.runTransaction(async (transaction) => {
      const currentSaleSnap = await transaction.get(saleRef);
      const currentOrderSnap = await transaction.get(orderRef);
      if (!currentSaleSnap.exists) throw Object.assign(new Error("Venta no encontrada."), { status: 404 });
      if (!currentOrderSnap.exists) throw Object.assign(new Error("Pedido ecommerce vinculado no encontrado."), { status: 409 });
      const sale = currentSaleSnap.data() || {};
      const order = currentOrderSnap.data() || {};
      if (!sale.ecommerceLifecycle || !isPickup(sale) || String(sale.idExterno || "").trim() !== orderId) {
        throw Object.assign(new Error("La venta ya no está vinculada a un pedido ecommerce de retiro."), { status: 409 });
      }
      if (sale.anulada === true || String(sale.estado || "").toLowerCase() === "anulada") {
        throw Object.assign(new Error("No se puede preparar una venta anulada."), { status: 409 });
      }
      const previous = String(sale.estadoPreparacion || "pendiente");
      const allowedNext = {
        pendiente: ["preparando"],
        preparando: ["listo_para_retirar"],
        listo_para_retirar: ["retirado"],
        retirado: [],
      };
      const transitioned = hasStatus && previous !== nextStatus;
      if (transitioned && !allowedNext[previous]?.includes(nextStatus)) {
        throw Object.assign(new Error(`No se puede pasar de ${previous} a ${nextStatus}.`), { status: 409 });
      }
      if (transitioned && ["listo_para_retirar", "retirado"].includes(nextStatus)) {
        const paymentMethod = String(sale.formaPago || "").trim().toLowerCase();
        if (["transferencia", "transfer", "bank_transfer"].includes(paymentMethod) &&
          buildVentaPaymentSnapshot(sale).estadoPago !== "pagado") {
          throw Object.assign(new Error("Confirmá primero que la transferencia se acreditó en la cuenta."), { status: 409 });
        }
      }

      const shouldSyncPickupSchedule = hasPickupWindow || hasDeliveryDate || transitioned;
      const effectivePickupWindow = hasPickupWindow
        ? pickupWindow
        : String(sale.rangoHorario || order.rangoHorario || order.deliveryInfo?.rangoHorario || "").trim();
      const effectiveDeliveryDate = hasDeliveryDate
        ? deliveryDate
        : String(sale.fechaEntrega || order.fechaEntrega || order.deliveryInfo?.fechaEntrega || "").trim();
      const salePatch = {};
      const orderPatch = {};
      if (shouldSyncPickupSchedule) {
        salePatch.rangoHorario = effectivePickupWindow;
        salePatch.fechaEntrega = effectiveDeliveryDate;
        orderPatch.rangoHorario = effectivePickupWindow;
        orderPatch.fechaEntrega = effectiveDeliveryDate;
        orderPatch.deliveryInfo = {
          ...(order.deliveryInfo || {}),
          fechaEntrega: effectiveDeliveryDate,
          rangoHorario: effectivePickupWindow,
        };
      }
      if (transitioned) {
        const event = {
          estado: nextStatus,
          fecha: now,
          byUid: String(actor?.uid || ""),
          byEmail: String(actor?.email || ""),
        };
        const history = Array.isArray(sale.historialPreparacion) ? sale.historialPreparacion : [];
        Object.assign(salePatch, {
          estadoPreparacion: nextStatus,
          historialPreparacion: [...history, event],
          actualizadoEn: now,
          actualizadoPorUid: String(actor?.uid || ""),
          actualizadoPorEmail: String(actor?.email || ""),
        });
        Object.assign(orderPatch, {
          fulfillmentStatus: nextStatus,
          fulfillmentUpdatedAt: now,
          fulfillmentUpdatedBy: String(actor?.email || actor?.uid || "Sistema"),
        });
        orderPatch.deliveryInfo = { ...(orderPatch.deliveryInfo || order.deliveryInfo || {}), estadoPreparacion: nextStatus };
        if (nextStatus === "listo_para_retirar") {
          salePatch.retiroListoEn = now;
          salePatch.retiroListoPor = String(actor?.email || actor?.uid || "Sistema");
          orderPatch.pickupReadyAt = now;
        }
        if (nextStatus === "retirado") {
          salePatch.retiradoEn = now;
          salePatch.retiradoPor = String(actor?.email || actor?.uid || "Sistema");
          orderPatch.pickedUpAt = now;
        }
      }
      if (Object.keys(salePatch).length) transaction.update(saleRef, salePatch);
      if (Object.keys(orderPatch).length) transaction.update(orderRef, orderPatch);
      return {
        transitioned,
        alreadyAtStatus: !transitioned,
        sale: { ...sale, ...salePatch },
      };
    });

    let notification = null;
    let notificationError = "";
    if (result.transitioned && ["preparando", "listo_para_retirar"].includes(nextStatus)) {
      const notificationType = nextStatus === "preparando" ? "preparingForPickup" : "readyForPickup";
      try {
        notification = await sendOrderAdminNotification(orderId, notificationType, {
          fallbackOrder: { ...result.sale, orderId, ventaNumeroPedido: result.sale.numeroPedido },
          status: nextStatus === "preparando" ? "preparing_for_pickup" : "ready_for_pickup",
        });
      } catch (error) {
        notificationError = error?.message || "No se pudo enviar el email de aviso.";
        console.error("No se pudo enviar el aviso de preparación/retiro:", notificationError);
      }
    }

    return NextResponse.json({ ok: true, sale: result.sale, alreadyAtStatus: result.alreadyAtStatus, transitioned: result.transitioned, notification, notificationError });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error?.message || "No se pudo actualizar el estado de retiro." }, { status: error?.status || 500 });
  }
}
