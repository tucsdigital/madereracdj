import { NextResponse } from "next/server";
import crypto from "crypto";
import { getAdminDb } from "@/lib/firebase-admin";
import { verifyCommerceRequest } from "@/lib/ecommerce-auth";
import { paymentDecision } from "@/lib/ecommerce-payment-policy.mjs";
import { updateVentaEngine } from "@/lib/erp/ventas-engine";

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
    if ((await eventRef.get()).exists) return NextResponse.json({ success: true, idempotente: true });

    if (status === "success" && payment.paymentStatus === "approved") {
      if (!order.ventaId) throw new Error("El pedido todavía no está sincronizado con ventas");
      const ventaRef = db.collection("ventas").doc(order.ventaId);
      const venta = (await ventaRef.get()).data();
      if (!venta) throw new Error("Venta no encontrada");
      if (venta.estadoPago !== "pagado" || venta.inventarioAplicado === false) {
        const total = Number(order.pricing?.total ?? order.total);
        try {
          await updateVentaEngine({ actor: { uid: "", email: "mercadopago-webhook" }, ventaId: order.ventaId,
            ventaData: { ...venta, estadoPago: "pagado", montoAbonado: total, total }, origen: "ecommerce_externo" });
        } catch (error) {
          if (error.status === 409 && /Stock insuficiente/.test(error.message)) {
            // Pago tardío después de vencer la reserva: conservar evidencia y pedir conciliación.
            await db.runTransaction(async (t) => {
              const current = await t.get(ref);
              const event = await t.get(eventRef);
              if (event.exists) return;
              if (current.data().status !== "success") t.update(ref, { status: "review", paymentStatus: "approved", paymentId: String(payment.paymentId), revisionPago: error.message });
              t.set(ventaRef, { requiereRevision: true, revisionPago: error.message, pagoPorConciliar: payment }, { merge: true });
              t.create(eventRef, { ...payment, revision: error.message, receivedAt: new Date().toISOString() });
            });
            return NextResponse.json({ success: true, requiresReview: true });
          }
          throw error;
        }
      }
    }
    await db.runTransaction(async (t) => {
      const current = await t.get(ref);
      const event = await t.get(eventRef);
      if (event.exists) return;
      const currentOrder = current.data();
      const nextStatus = paymentDecision(currentOrder, payment);
      const reservations = nextStatus === "failed" && currentOrder.ventaId
        ? await t.get(db.collection("reservasStock").where("ventaId", "==", currentOrder.ventaId)) : null;
      const now = new Date().toISOString();
      // Un rechazo viejo no debe sobrescribir un pago aprobado.
      if (nextStatus !== "success" || payment.paymentStatus === "approved") {
        t.update(ref, { paymentId: String(payment.paymentId), paymentStatus: payment.paymentStatus, status: nextStatus, updatedAt: now });
      }
      t.create(eventRef, { ...payment, receivedAt: now });
      reservations?.docs.forEach((reservation) => {
        if (reservation.data().estado === "activa") t.update(reservation.ref, { estado: "liberada", actualizadoEn: now });
      });
      if (nextStatus === "review" && currentOrder.ventaId) {
        t.set(db.collection("ventas").doc(currentOrder.ventaId), { requiereRevision: true, revisionPago: payment.paymentStatus }, { merge: true });
      }
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.status || 500 });
  }
}
