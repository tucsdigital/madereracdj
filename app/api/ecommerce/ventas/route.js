import { NextResponse } from "next/server";
import { verifyFirebaseToken } from "@/lib/firebase-admin";
import { filterVentas, paginate, parseFilters, sortVentas, ventasCsv } from "@/lib/ecommerce-panel";
import { loadEcommerce } from "@/lib/ecommerce-panel-server";

export const runtime = "nodejs";

const fail = (error) => {
  const status = error?.status || 500;
  return NextResponse.json({ error: status === 401 ? "Iniciá sesión para ver las ventas del ecommerce." : error?.message || "No se pudieron cargar las ventas." }, { status });
};

// Ventas de la tienda online con filtros, orden y paginación en el servidor. `?formato=csv` descarga todo lo filtrado.
export async function GET(request) {
  try {
    await verifyFirebaseToken(request.headers.get("authorization"));
    const url = new URL(request.url);
    const f = parseFilters(url.searchParams);
    const { rows, actualizado, truncado } = await loadEcommerce({ fresh: url.searchParams.get("fresco") === "1" });
    const sorted = sortVentas(filterVentas(rows, f), f.orden, f.dir);
    if (url.searchParams.get("formato") === "csv") {
      return new NextResponse(ventasCsv(sorted), {
        headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="ecommerce-ventas.csv"`, "Cache-Control": "no-store" },
      });
    }
    return NextResponse.json({ ...paginate(sorted, f.pagina, f.limite), actualizado, truncado });
  } catch (error) {
    return fail(error);
  }
}
