/**
 * POST /api/upload-comprobante
 * Sube comprobantes de pago (imágenes o PDF) para ventas/boletas.
 * Acepta: image/* y application/pdf
 */
import { put } from '@vercel/blob';
import { NextResponse } from 'next/server';

const TIPOS_PERMITIDOS = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
const MAX_SIZE_MB = 10;

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!file) {
      return NextResponse.json(
        { error: 'No se proporcionó ningún archivo' },
        { status: 400 }
      );
    }

    const esValido = file.type.startsWith('image/') || file.type === 'application/pdf';
    if (!esValido) {
      return NextResponse.json(
        { error: 'Solo se permiten imágenes (JPG, PNG, WebP, GIF) o PDF' },
        { status: 400 }
      );
    }

    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      return NextResponse.json(
        { error: `El archivo es demasiado grande. Máximo ${MAX_SIZE_MB}MB` },
        { status: 400 }
      );
    }

    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 15);
    const extension = file.name.split('.').pop() || (file.type === 'application/pdf' ? 'pdf' : 'jpg');
    const fileName = `ventas/comprobantes/${timestamp}-${randomString}.${extension}`;

    const token = process.env.demo_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN;

    const blob = await put(fileName, file, {
      access: 'public',
      addRandomSuffix: false,
      token: token,
    });

    return NextResponse.json({
      url: blob.url,
      fileName: fileName,
      nombre: file.name,
      size: file.size,
      type: file.type,
      tipo: file.type === 'application/pdf' ? 'pdf' : 'image',
    });
  } catch (error) {
    console.error('Error al subir comprobante:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
