import { NextResponse } from "next/server";
export const runtime = "nodejs";

import { verifyFirebaseToken } from "@/lib/firebase-admin";
import { getAdminDb } from "@/lib/firebase-admin";
import { anularVentaEngine } from "@/lib/erp/ventas-engine";
import { sendOrderAdminNotification } from "@/lib/tienda-notificaciones";

export async function POST(request, { params }) {
  try {
    const authHeader = request.headers.get("authorization");
    const decoded = await verifyFirebaseToken(authHeader);
    const body = await request.json().catch(() => ({}));
    const ventaId = String(params?.id || "").trim();
    if (!ventaId) return NextResponse.json({ ok: false, error: "ventaId requerido" }, { status: 400 });

    const actor = {
      uid: String(decoded?.uid || ""),
      email: String(decoded?.email || ""),
    };
    const origen = String(body?.origen || "ui").trim() || "ui";
    const motivo = String(body?.motivo || "").trim();

    const res = await anularVentaEngine({ actor, ventaId, motivo, origen });
    const db = getAdminDb();
    const sale = (await db.collection("ventas").doc(ventaId).get()).data() || null;
    if ((sale?.ecommerceLifecycle || sale?.origen === "ecommerce_externo") && sale?.idExterno) {
      const orderRef = db.collection("orders").doc(String(sale.idExterno));
      await orderRef.set({ status: "cancelled", cancelledAt: new Date().toISOString(), updatedAt: new Date().toISOString(), ...(motivo ? { cancellationReason: motivo } : {}) }, { merge: true }).catch(() => {});
      await sendOrderAdminNotification(sale.idExterno, "cancelled", { fallbackOrder: { ...sale, orderId: sale.idExterno, ventaNumeroPedido: sale.numeroPedido }, status: "cancelled", cancellationReason: motivo })
        .catch((error) => console.error("No se pudo enviar el aviso de pedido cancelado:", error?.message));
    }
    return NextResponse.json({ ok: true, ventaId: res.id, already: Boolean(res.already) }, { status: 200 });
  } catch (err) {
    const status = err?.status || 500;
    return NextResponse.json({ ok: false, error: err?.message || "internal_error" }, { status });
  }
}
