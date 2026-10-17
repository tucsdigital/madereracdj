import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { verifyCommerceRequest } from "@/lib/ecommerce-auth";
import { getPublishedTransferencia } from "@/lib/tienda-transfer";

export async function GET(request, { params }) {
  try {
    verifyCommerceRequest(request, "");
    if (!/^[a-zA-Z0-9_-]{16,100}$/.test(String(params.id))) return NextResponse.json({ error: "Pedido inválido" }, { status: 400 });
    const db = getAdminDb();
    const snap = await db.collection("orders").doc(params.id).get();
    if (!snap.exists) return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
    const order = snap.data();
    const venta = order.ventaId ? (await db.collection("ventas").doc(order.ventaId).get()).data() : null;
    const reservations = order.ventaId ? await db.collection("reservasStock").where("ventaId", "==", order.ventaId).get() : null;
    const reservaActiva = Boolean(reservations?.docs.length) && reservations.docs.every((doc) => {
      const reservation = doc.data();
      return reservation.estado === "activa" && Date.parse(reservation.expiresAt) > Date.now();
    });
    const transferencia = order.paymentMethod === "transferencia" ? await getPublishedTransferencia(db) : null;
    return NextResponse.json({ ...order, numeroPedido: venta?.numeroPedido || null, reservaActiva, reservaExpiresAt: venta?.reservaExpiresAt || null, anulada: venta?.anulada === true, transferencia });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.status || 500 });
  }
}
