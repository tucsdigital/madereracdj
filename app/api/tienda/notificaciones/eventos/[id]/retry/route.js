import { NextResponse } from "next/server";
import { verifyFirebaseToken } from "@/lib/firebase-admin";
import { retryOrderAdminNotification } from "@/lib/tienda-notificaciones";

export const runtime = "nodejs";

export async function POST(request, { params }) {
  try {
    await verifyFirebaseToken(request.headers.get("authorization"));
    const result = await retryOrderAdminNotification(params.id);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error?.message || "No se pudo reintentar el aviso." }, { status: error?.status || 500 });
  }
}
