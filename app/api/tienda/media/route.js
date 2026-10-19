import { NextResponse } from "next/server";
import { getAdminDb, verifyFirebaseToken } from "@/lib/firebase-admin";
import { getR2ConfigStatus } from "@/lib/r2-storage";
import { MAX_UPLOAD_BYTES, MEDIA_FOLDERS } from "@/lib/tienda-media";
import { processAndStoreTiendaMedia } from "@/lib/tienda-media-processor";

export const runtime = "nodejs";

const fail = (error) => {
  const status = error?.status || 500;
  const message = status === 401 ? "Iniciá sesión para administrar las imágenes." : error?.message || "No se pudo procesar la imagen.";
  return NextResponse.json({ error: message }, { status });
};

const storageState = () => {
  const status = getR2ConfigStatus();
  return { ok: status.ok, missing: status.missing, publicBase: status.configured.publicBase };
};

// Estado del almacenamiento y biblioteca de imágenes ya subidas.
export async function GET(request) {
  try {
    await verifyFirebaseToken(request.headers.get("authorization"));
    const snap = await getAdminDb().collection("tiendaMedia").orderBy("at", "desc").limit(120).get();
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return NextResponse.json({ storage: storageState(), items });
  } catch (error) {
    return fail(error);
  }
}

// Compatibilidad con clientes anteriores; el panel actual usa URLs firmadas para subir directo a R2.
export async function POST(request) {
  try {
    const actor = await verifyFirebaseToken(request.headers.get("authorization"));
    const state = storageState();
    if (!state.ok) {
      return NextResponse.json({ error: `Falta configurar R2 en el servidor: ${state.missing.join(", ")}.`, missing: state.missing }, { status: 503 });
    }

    const form = await request.formData();
    const file = form.get("file");
    const folder = String(form.get("folder") || "");
    if (!MEDIA_FOLDERS.includes(folder)) return NextResponse.json({ error: "Carpeta de imágenes no válida." }, { status: 400 });
    if (!file || typeof file.arrayBuffer !== "function") return NextResponse.json({ error: "No se recibió ningún archivo." }, { status: 400 });
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: `La imagen pesa más de ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB.` }, { status: 413 });
    }

    const original = Buffer.from(await file.arrayBuffer());
    const result = await processAndStoreTiendaMedia({ actor, folder, original, originalName: file.name });
    return NextResponse.json(result);
  } catch (error) {
    return fail(error);
  }
}
