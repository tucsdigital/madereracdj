/**
 * POST /api/delete-blob
 * Elimina un archivo de Vercel Blob por URL.
 * Solo acepta URLs de nuestro store (blob.vercel-storage.com).
 */
import { del } from '@vercel/blob';
import { NextResponse } from 'next/server';

const BLOB_DOMAIN = 'blob.vercel-storage.com';

export async function POST(request) {
  try {
    const body = await request.json();
    const { url } = body;

    if (!url || typeof url !== 'string') {
      return NextResponse.json(
        { error: 'URL requerida' },
        { status: 400 }
      );
    }

    if (!url.includes(BLOB_DOMAIN)) {
      return NextResponse.json(
        { error: 'URL no válida para eliminación' },
        { status: 403 }
      );
    }

    await del(url);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[delete-blob] Error:', error?.message || error);
    return NextResponse.json(
      { error: error?.message || 'Error al eliminar archivo' },
      { status: 500 }
    );
  }
}
