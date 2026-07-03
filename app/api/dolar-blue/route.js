/**
 * GET /api/dolar-blue
 * Obtiene la cotización oficial del dólar billete desde Banco Nación
 * y devuelve compra, venta y un valor de referencia promedio.
 */
import { NextResponse } from "next/server";

const BNA_URL = "https://www.bna.com.ar/personas";

function parseBnaNumber(value) {
  if (!value) return null;
  const normalized = String(value).replace(/\./g, "").replace(",", ".").trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function extractBnaUsdBilleteValues(html) {
  const rowMatch = html.match(
    /<tr[^>]*>\s*<td[^>]*>\s*Dolar\s*U\.?S\.?A\s*<\/td>\s*<td[^>]*>\s*([\d.,]+)\s*<\/td>\s*<td[^>]*>\s*([\d.,]+)\s*<\/td>/i
  );
  if (rowMatch) {
    return {
      compra: parseBnaNumber(rowMatch[1]),
      venta: parseBnaNumber(rowMatch[2]),
    };
  }

  const compact = html.replace(/\s+/g, " ");
  const textMatch = compact.match(/Dolar\s*U\.?S\.?A[^0-9]*([\d.,]+)[^0-9]+([\d.,]+)/i);
  if (textMatch) {
    return {
      compra: parseBnaNumber(textMatch[1]),
      venta: parseBnaNumber(textMatch[2]),
    };
  }

  return { compra: null, venta: null };
}

function extractBnaUpdateTime(html) {
  const match = html.match(/Hora\s+Actualizaci[oó]n:\s*([0-9]{1,2}:[0-9]{2})/i);
  return match?.[1] || null;
}

export async function GET() {
  try {
    const res = await fetch(BNA_URL, {
      next: { revalidate: 300 },
      headers: { Accept: "text/html,application/xhtml+xml" },
    });

    if (!res.ok) {
      throw new Error(`Banco Nación respondió: ${res.status}`);
    }

    const html = await res.text();
    const { compra, venta } = extractBnaUsdBilleteValues(html);
    if (compra == null || venta == null) {
      throw new Error("No se pudo interpretar la cotización oficial de Banco Nación");
    }

    const referencia = Number(((compra + venta) / 2).toFixed(2));
    const horaActualizacion = extractBnaUpdateTime(html);

    return NextResponse.json({
      compra,
      venta,
      referencia,
      fechaActualizacion: new Date().toISOString(),
      horaActualizacion,
      nombre: "Dólar Oficial BNA",
      fuente: "Banco Nación",
      criterio: "promedio_compra_venta",
    });
  } catch (error) {
    console.error("[dolar-blue] Error:", error?.message || error);
    return NextResponse.json(
      { error: error?.message || "Error al obtener cotización oficial del dólar" },
      { status: 502 }
    );
  }
}
