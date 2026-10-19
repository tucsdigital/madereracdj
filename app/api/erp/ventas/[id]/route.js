import { NextResponse } from "next/server";
export const runtime = "nodejs";

import { verifyFirebaseToken } from "@/lib/firebase-admin";
import { updateVentaEngine } from "@/lib/erp/ventas-engine";
import { getAdminDb } from "@/lib/firebase-admin";
import { sendOrderAdminNotification } from "@/lib/tienda-notificaciones";

export async function PUT(request, { params }) {
  try {
    const authHeader = request.headers.get("authorization");
    const decoded = await verifyFirebaseToken(authHeader);
    const body = await request.json().catch(() => ({}));
    const venta = body?.venta || body;

    const actor = {
      uid: String(decoded?.uid || ""),
      email: String(decoded?.email || ""),
    };
    const origen = String(body?.origen || venta?.origen || "ui").trim() || "ui";
    const ventaId = String(params?.id || "").trim();
    if (!ventaId) return NextResponse.json({ ok: false, error: "ventaId requerido" }, { status: 400 });

    const db = getAdminDb();
    const before = (await db.collection("ventas").doc(ventaId).get()).data() || null;
    const res = await updateVentaEngine({ actor, ventaId, ventaData: venta, origen });
    const after = (await db.collection("ventas").doc(ventaId).get()).data() || null;
    const becamePaid = ["pendiente", "parcial"].includes(String(before?.estadoPago || "").toLowerCase()) && String(after?.estadoPago || "").toLowerCase() === "pagado";
    const becameReview = before?.requiereRevision !== true && after?.requiereRevision === true;
    if ((before?.ecommerceLifecycle || before?.origen === "ecommerce_externo") && before?.idExterno) {
      const fallbackOrder = { ...before, ...after, orderId: before.idExterno };
      if (becamePaid) {
        await sendOrderAdminNotification(before.idExterno, "confirmed", { fallbackOrder, status: "confirmed", paymentStatus: "approved" })
          .catch((error) => console.error("No se pudo enviar el aviso de pedido confirmado:", error?.message));
      }
      if (becameReview) {
        await sendOrderAdminNotification(before.idExterno, "review", { fallbackOrder, status: "review" })
          .catch((error) => console.error("No se pudo enviar el aviso de revisión del pedido:", error?.message));
      }
    }
    return NextResponse.json({ ok: true, ventaId: res.id, flags: res.flags, version: res.version }, { status: 200 });
  } catch (err) {
    const status = err?.status || 500;
    return NextResponse.json({ ok: false, error: err?.message || "internal_error" }, { status });
  }
}
