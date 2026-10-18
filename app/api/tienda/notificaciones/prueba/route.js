import { NextResponse } from "next/server";
import { verifyFirebaseToken } from "@/lib/firebase-admin";
import { sendOrderAdminTestEmail } from "@/lib/tienda-notificaciones";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    await verifyFirebaseToken(request.headers.get("authorization"));
    const body = await request.json().catch(() => ({}));
    const result = await sendOrderAdminTestEmail(body?.recipients);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error?.message || "No se pudo enviar el correo de prueba." }, { status: error?.status || 500 });
  }
}
