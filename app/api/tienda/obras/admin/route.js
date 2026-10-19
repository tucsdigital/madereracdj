import { NextResponse } from "next/server";
import { getAdminDb, verifyFirebaseToken } from "@/lib/firebase-admin";
import { importLegacyProjectsIfEmpty, OBRAS_COLLECTION, sortProjectsByManualOrder } from "@/lib/tienda-obras";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const fail = (error) => NextResponse.json({ error: error?.status === 401 ? "Iniciá sesión para administrar las obras." : error?.message || "No se pudieron cargar las obras." }, { status: error?.status || 500 });

export async function GET(request) {
  try {
    await verifyFirebaseToken(request.headers.get("authorization"));
    await importLegacyProjectsIfEmpty();
    const db = getAdminDb();
    const [snap, orderSnap] = await Promise.all([
      db.collection(OBRAS_COLLECTION).get(),
      db.collection("settings").doc("tiendaObrasOrden").get(),
    ]);
    const rawItems = snap.docs.map((document) => ({ id: document.id, ...document.data(), project: document.data()?.draft || document.data()?.published }));
    const items = sortProjectsByManualOrder(rawItems, orderSnap.data()?.slugs || []);
    return NextResponse.json({ items, orderVersion: Number(orderSnap.data()?.version) || 0 });
  } catch (error) {
    return fail(error);
  }
}
