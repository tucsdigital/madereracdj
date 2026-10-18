import { NextResponse } from "next/server";
import { Resend } from "resend";
import { recordOrderAdminDeliveryEvent } from "@/lib/tienda-notificaciones";

export const runtime = "nodejs";

export async function POST(request) {
  const secret = String(process.env.RESEND_WEBHOOK_SECRET || "").trim();
  if (!secret) return NextResponse.json({ error: "Webhook de Resend no configurado." }, { status: 503 });

  const payload = await request.text();
  const headers = {
    id: request.headers.get("svix-id") || "",
    timestamp: request.headers.get("svix-timestamp") || "",
    signature: request.headers.get("svix-signature") || "",
  };
  if (!headers.id || !headers.timestamp || !headers.signature) {
    return NextResponse.json({ error: "Faltan los encabezados de firma del webhook." }, { status: 400 });
  }

  let event;
  try {
    event = new Resend().webhooks.verify({ payload, headers, webhookSecret: secret });
  } catch {
    return NextResponse.json({ error: "Firma del webhook inválida." }, { status: 400 });
  }

  try {
    const result = await recordOrderAdminDeliveryEvent(event, headers.id);
    if (!result.matched && !result.duplicate && !result.ignored) {
      // Resend reintentará el webhook. Esto cubre la carrera entre recibir el
      // evento de entrega y terminar de guardar el id devuelto por emails.send.
      return NextResponse.json({ error: "El email todavía no está asociado al historial." }, { status: 503 });
    }
    return NextResponse.json({ received: true, ...result });
  } catch (error) {
    console.error("No se pudo registrar el estado de entrega de Resend:", error?.message);
    return NextResponse.json({ error: "No se pudo registrar el estado de entrega." }, { status: 503 });
  }
}
