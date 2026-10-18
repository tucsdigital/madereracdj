import { NextResponse } from "next/server";
import { verifyFirebaseToken } from "@/lib/firebase-admin";
import { getOrderAdminNotificationEvents } from "@/lib/tienda-notificaciones";

export const runtime = "nodejs";

export async function GET(request) {
  try {
    await verifyFirebaseToken(request.headers.get("authorization"));
    const url = new URL(request.url);
    return NextResponse.json({ items: await getOrderAdminNotificationEvents(url.searchParams.get("limit")) });
  } catch (error) {
    return NextResponse.json({ error: error?.message || "No se pudo cargar el historial de avisos." }, { status: error?.status || 500 });
  }
}
