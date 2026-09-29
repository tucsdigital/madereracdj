/**
 * GET /api/dolar-blue
 * Consulta el dólar blue publicado por DolarHoy. Para cobranzas en USD la
 * referencia es la cotización de compra: al recibir dólares, la empresa los
 * acredita a la punta compradora, que es la política más favorable al vendedor.
 */
import { NextResponse } from "next/server";

const DOLAR_HOY_BLUE_URL = "https://dolarhoy.com/cotizaciondolarblue";

function parseDolarHoyNumber(value) {
  if (!value) return null;
  const normalized = String(value)
    .replace(/\$/g, "")
    .replace(/\./g, "")
    .replace(",", ".")
    .trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function extractDolarBlueValues(html) {
  const quoteSection = html.match(
    /<div class="cotizacion_moneda">[\s\S]*?<div class="tile update">/i
  )?.[0];

  if (!quoteSection) return { compra: null, venta: null };

  const compra = quoteSection.match(
    /<div class="topic">\s*Compra\s*<\/div>\s*<div class="value">\s*\$?\s*([\d.,]+)\s*<\/div>/i
  )?.[1];
  const venta = quoteSection.match(
    /<div class="topic">\s*Venta\s*<\/div>\s*<div class="value">\s*\$?\s*([\d.,]+)\s*<\/div>/i
  )?.[1];

  return {
    compra: parseDolarHoyNumber(compra),
    venta: parseDolarHoyNumber(venta),
  };
}

function extractDolarHoyUpdateTime(html) {
  return html.match(
    /Actualizado\s+por\s+[úu]ltima\s+vez:\s*([^<]+)/i
  )?.[1]?.trim() || null;
}

export async function GET() {
  try {
    const res = await fetch(DOLAR_HOY_BLUE_URL, {
      next: { revalidate: 300 },
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "MaderasCaballero/1.0 (+https://www.caballeromaderas.com)",
      },
    });

    if (!res.ok) {
      throw new Error(`DolarHoy respondió: ${res.status}`);
    }

    const html = await res.text();
    const { compra, venta } = extractDolarBlueValues(html);
    if (compra == null || venta == null) {
      throw new Error("No se pudo interpretar la cotización de dólar blue de DolarHoy");
    }

    return NextResponse.json({
      compra,
      venta,
      // Al recibir USD, se acredita en ARS a la cotización de compra del blue.
      referencia: compra,
      fechaActualizacion: new Date().toISOString(),
      horaActualizacion: extractDolarHoyUpdateTime(html),
      nombre: "Dólar blue · Compra",
      fuente: "DolarHoy",
      criterio: "compra_dolar_blue",
    });
  } catch (error) {
    console.error("[dolar-blue] Error:", error?.message || error);
    return NextResponse.json(
      { error: error?.message || "Error al obtener la cotización de dólar blue" },
      { status: 502 }
    );
  }
}
