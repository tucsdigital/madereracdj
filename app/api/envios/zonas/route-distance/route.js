import { NextResponse } from "next/server";
import { verifyFirebaseToken } from "@/lib/firebase-admin";
import { getDrivingDistances } from "@/lib/google-routes";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    await verifyFirebaseToken(request.headers.get("authorization"));
    const body = await request.json().catch(() => ({}));
    const locations = Array.isArray(body.locations) ? body.locations : [];
    if (locations.length > 100) return NextResponse.json({ error: "La lista de sucursales no es válida." }, { status: 400 });
    const distancesByStore = await getDrivingDistances({ locations, lat: body.lat, lng: body.lng });
    return NextResponse.json({ distancesByStore });
  } catch (error) {
    return NextResponse.json({ error: error?.message || "No se pudo calcular la distancia por ruta." }, { status: error?.status || 500 });
  }
}
