import { NextResponse } from "next/server";
import { verifyFirebaseToken } from "@/lib/firebase-admin";
import { computeResumen, filterVentas, parseFilters } from "@/lib/ecommerce-panel";
import { loadEcommerce } from "@/lib/ecommerce-panel-server";

export const runtime = "nodejs";

// Estadísticas del período: lo vendido, pedidos, ticket promedio, clientes, productos más vendidos y series por día.
export async function GET(request) {
  try {
    await verifyFirebaseToken(request.headers.get("authorization"));
    const url = new URL(request.url);
    const f = parseFilters(url.searchParams);
    const { rows, altas, actualizado } = await loadEcommerce({ fresh: url.searchParams.get("fresco") === "1" });
    const inRange = (list, from, to) => filterVentas(list, { from, to, anuladas: true });
    const current = inRange(rows, f.from, f.to);
    const previous = f.prev ? inRange(rows, f.prev.from, f.prev.to) : null;
    const nuevos = altas.filter((ms) => ms > 0 && (f.from === null || ms >= f.from) && (f.to === null || ms < f.to)).length;
    const resumen = computeResumen({ rows: current, prevRows: previous, from: f.from, to: f.to, clientes: { total: altas.length, nuevos } });
    return NextResponse.json({ ...resumen, actualizado });
  } catch (error) {
    const status = error?.status || 500;
    return NextResponse.json({ error: status === 401 ? "Iniciá sesión para ver las estadísticas." : error?.message || "No se pudieron cargar las estadísticas." }, { status });
  }
}
