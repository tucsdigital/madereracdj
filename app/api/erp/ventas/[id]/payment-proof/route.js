import { NextResponse } from "next/server";
import { verifyFirebaseToken, getAdminDb } from "@/lib/firebase-admin";
import { updateVentaEngine } from "@/lib/erp/ventas-engine";
import { buildVentaPaymentSnapshot, normalizeVentaPaymentFields } from "@/lib/ventas-pagos";
import { sendOrderAdminNotification } from "@/lib/tienda-notificaciones";

export const runtime = "nodejs";

const isTransferSale = (sale) => ["transferencia", "transfer", "bank_transfer"].includes(String(sale?.formaPago || "").trim().toLowerCase());

export async function POST(request, { params }) {
  try {
    const actor = await verifyFirebaseToken(request.headers.get("authorization"));
    const body = await request.json().catch(() => ({}));
    const action = String(body?.action || "").trim().toLowerCase();
    const reason = String(body?.reason || "").trim().slice(0, 300);
    const saleId = String(params?.id || "").trim();
    if (!saleId || !["confirm", "reject"].includes(action)) {
      return NextResponse.json({ ok: false, error: "Acción de revisión inválida." }, { status: 400 });
    }
    if (action === "reject" && !reason) {
      return NextResponse.json({ ok: false, error: "Indicá qué debe corregir el cliente." }, { status: 400 });
    }

    const db = getAdminDb();
    const saleRef = db.collection("ventas").doc(saleId);
    const saleSnap = await saleRef.get();
    if (!saleSnap.exists) return NextResponse.json({ ok: false, error: "Venta no encontrada." }, { status: 404 });
    const sale = saleSnap.data() || {};
    if (!sale.ecommerceLifecycle || !isTransferSale(sale)) {
      return NextResponse.json({ ok: false, error: "Esta revisión solo aplica a transferencias de ecommerce." }, { status: 409 });
    }
    if (sale.anulada === true || String(sale.estado || "").toLowerCase() === "anulada") {
      return NextResponse.json({ ok: false, error: "No se puede revisar el pago de una venta anulada." }, { status: 409 });
    }
    if (!sale.idExterno) return NextResponse.json({ ok: false, error: "El pedido no tiene una referencia ecommerce vinculada." }, { status: 409 });
    if (action === "reject" && sale.paymentProofStatus !== "received") {
      return NextResponse.json({ ok: false, error: "No hay un comprobante pendiente de revisión." }, { status: 409 });
    }
    if (action === "confirm" && !["received", "confirmed"].includes(sale.paymentProofStatus)) {
      return NextResponse.json({ ok: false, error: "Primero debe recibirse un comprobante para confirmar esta transferencia." }, { status: 409 });
    }

    const actorEmail = String(actor?.email || actor?.uid || "Sistema");
    const now = new Date().toISOString();
    const orderRef = db.collection("orders").doc(String(sale.idExterno));
    let updatedSale = sale;
    let notification = null;
    let notificationError = "";

    if (action === "confirm") {
      const snapshot = buildVentaPaymentSnapshot(sale);
      if (snapshot.estadoPago !== "pagado") {
        const currentPayments = normalizeVentaPaymentFields({
          venta: sale,
          previousVenta: sale,
          actorEmail,
        }).pagos;
        const newPayment = {
          fecha: now,
          monto: snapshot.saldoPendiente,
          metodo: "transferencia",
          usuario: actorEmail,
          origen: "comprobante_ecommerce_confirmado",
          comprobanteId: String(sale.paymentProofEvidenceId || ""),
        };
        await updateVentaEngine({
          actor: { uid: String(actor?.uid || ""), email: actorEmail },
          ventaId: saleId,
          origen: "ui_ecommerce_transfer_review",
          ventaData: {
            ...sale,
            formaPago: "transferencia",
            pagos: [...currentPayments, newPayment],
            montoAbonado: snapshot.total,
            estadoPago: "pagado",
          },
        });
        updatedSale = (await saleRef.get()).data() || sale;
      }

      const receipts = (Array.isArray(updatedSale.comprobantesPago) ? updatedSale.comprobantesPago : []).map((item) =>
        item?.id === updatedSale.paymentProofEvidenceId ? { ...item, estadoRevision: "confirmado", revisadoEn: now, revisadoPor: actorEmail } : item
      );
      await saleRef.set({
        paymentProofStatus: "confirmed",
        paymentProofReviewedAt: now,
        paymentProofReviewedBy: actorEmail,
        comprobantesPago: receipts,
        actualizadoEn: now,
      }, { merge: true });
      await orderRef.set({
        status: "success",
        paymentStatus: "approved",
        paymentProofStatus: "confirmed",
        paymentConfirmedAt: now,
        paymentConfirmationSource: "manual_bank_reconciliation",
        paymentProofReviewedAt: now,
        paymentProofReviewedBy: actorEmail,
        updatedAt: now,
      }, { merge: true });
      updatedSale = { ...updatedSale, paymentProofStatus: "confirmed", paymentProofReviewedAt: now, comprobantesPago: receipts };

      notification = await sendOrderAdminNotification(String(sale.idExterno), "confirmed", {
        fallbackOrder: { ...updatedSale, orderId: sale.idExterno, ventaNumeroPedido: sale.numeroPedido },
        status: "confirmed",
        paymentStatus: "approved",
      }).catch((error) => {
        notificationError = error?.message || "No se pudo enviar el aviso de pago confirmado.";
        console.error("No se pudo enviar la confirmación de transferencia:", notificationError);
        return null;
      });
    } else {
      const receipts = (Array.isArray(sale.comprobantesPago) ? sale.comprobantesPago : []).map((item) =>
        item?.id === sale.paymentProofEvidenceId ? { ...item, estadoRevision: "observado", observacion: reason, revisadoEn: now, revisadoPor: actorEmail } : item
      );
      await saleRef.set({
        paymentProofStatus: "rejected",
        paymentProofReason: reason,
        paymentProofReviewedAt: now,
        paymentProofReviewedBy: actorEmail,
        comprobantesPago: receipts,
        actualizadoEn: now,
      }, { merge: true });
      await orderRef.set({
        paymentProofStatus: "rejected",
        paymentProofReason: reason,
        paymentProofReviewedAt: now,
        paymentProofReviewedBy: actorEmail,
        updatedAt: now,
      }, { merge: true });
      updatedSale = { ...sale, paymentProofStatus: "rejected", paymentProofReason: reason, paymentProofReviewedAt: now, comprobantesPago: receipts };
      notification = await sendOrderAdminNotification(String(sale.idExterno), "paymentProofRejected", {
        fallbackOrder: { ...updatedSale, orderId: sale.idExterno, ventaNumeroPedido: sale.numeroPedido },
        status: "payment_proof_rejected",
        paymentProofReason: reason,
      }).catch((error) => {
        notificationError = error?.message || "No se pudo enviar el aviso del comprobante observado.";
        console.error("No se pudo enviar el aviso del comprobante observado:", notificationError);
        return null;
      });
    }

    return NextResponse.json({ ok: true, action, sale: updatedSale, notification, notificationError });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error?.message || "No se pudo revisar el comprobante." }, { status: error?.status || 500 });
  }
}
