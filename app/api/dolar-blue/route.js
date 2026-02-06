/**
 * GET /api/dolar-blue
 * Obtiene el Dólar Blue en venta desde dolarapi.com
 * (Fuente: https://dolarapi.com - datos compatibles con dolarhoy.com)
 */
import { NextResponse } from 'next/server';

const DOLAR_API_URL = 'https://dolarapi.com/v1/dolares/blue';

export async function GET() {
  try {
    const res = await fetch(DOLAR_API_URL, {
      next: { revalidate: 60 },
      headers: { 'Accept': 'application/json' },
    });

    if (!res.ok) {
      throw new Error(`dolarapi respondió: ${res.status}`);
    }

    const data = await res.json();
    const venta = data?.venta;

    if (venta == null || typeof venta !== 'number') {
      throw new Error('Formato de respuesta inválido');
    }

    return NextResponse.json({
      venta: Number(venta),
      compra: data?.compra != null ? Number(data.compra) : null,
      fechaActualizacion: data?.fechaActualizacion || null,
      nombre: data?.nombre || 'Dólar Blue',
    });
  } catch (error) {
    console.error('[dolar-blue] Error:', error?.message || error);
    return NextResponse.json(
      { error: error?.message || 'Error al obtener cotización del dólar' },
      { status: 502 }
    );
  }
}
