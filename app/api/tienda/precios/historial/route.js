import { NextResponse } from "next/server";
import { getAdminDb, verifyFirebaseToken } from "@/lib/firebase-admin";
import { describePreciosChange, normalizePrecios } from "@/lib/tienda-precios";
import { describeStockChange, normalizeStock } from "@/lib/tienda-stock";

export const runtime = "nodejs";

const BLOQUES = {
  precios: { describe: describePreciosChange, normalize: normalizePrecios },
  stock: { describe: describeStockChange, normalize: normalizeStock },
};

// Últimos cambios de un bloque de la tienda web (precios o stock): quién, cuándo y qué cambió,
// con la configuración anterior para poder volver atrás.
export async function GET(request) {
  try {
    await verifyFirebaseToken(request.headers.get("authorization"));
    const name = new URL(request.url).searchParams.get("bloque") === "stock" ? "stock" : "precios";
    const { describe, normalize } = BLOQUES[name];
    const snap = await getAdminDb().collection("settingsHistory").orderBy("at", "desc").limit(150).get();
    const items = [];
    snap.forEach((doc) => {
      const d = doc.data() || {};
      if (d.tipo !== "tienda") return;
      const summary = describe(d.before?.[name], d.after?.[name]);
      if (!summary.length) return;
      items.push({ id: doc.id, at: d.at || null, by: d.byEmail || d.byUid || "", summary, before: normalize(d.before?.[name]) });
    });
    return NextResponse.json({ items: items.slice(0, 15) });
  } catch (error) {
    const status = error?.status || 500;
    return NextResponse.json({ error: status === 401 ? "Iniciá sesión para ver el historial." : error?.message || "No se pudo cargar el historial." }, { status });
  }
}
