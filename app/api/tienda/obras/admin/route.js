import { NextResponse } from "next/server";
import { getAdminDb, verifyFirebaseToken } from "@/lib/firebase-admin";
import { importLegacyProjectsIfEmpty, OBRAS_COLLECTION } from "@/lib/tienda-obras";

export const runtime = "nodejs";

const fail = (error) => NextResponse.json({ error: error?.status === 401 ? "Iniciá sesión para administrar las obras." : error?.message || "No se pudieron cargar las obras." }, { status: error?.status || 500 });

export async function GET(request) {
  try {
    await verifyFirebaseToken(request.headers.get("authorization"));
    await importLegacyProjectsIfEmpty();
    const snap = await getAdminDb().collection(OBRAS_COLLECTION).orderBy("slug").get();
    return NextResponse.json({ items: snap.docs.map((doc) => ({ id: doc.id, ...doc.data(), project: doc.data()?.draft || doc.data()?.published })) });
  } catch (error) {
    return fail(error);
  }
}
