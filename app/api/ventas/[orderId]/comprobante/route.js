import { NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { collection, query, where, limit, getDocs, addDoc, doc, updateDoc } from "firebase/firestore";
import { getAdminAuth } from "@/lib/firebase-admin";
import { uploadFileToR2 } from "@/lib/r2-storage";

function withCors(resp) {
  const headers = new Headers(resp.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "POST,OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Api-Key");
  return new NextResponse(resp.body, { status: resp.status, headers });
}

export function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

export async function POST(request, { params }) {
  try {
    const orderId = String(params?.orderId || "").trim();
    if (!orderId) {
      return withCors(NextResponse.json({ error: "orderId_requerido" }, { status: 400 }));
    }

    const contentType = request.headers.get("content-type") || "";
    if (!contentType.toLowerCase().includes("multipart/form-data")) {
      return withCors(NextResponse.json({ error: "content_type_invalid" }, { status: 400 }));
    }

    const headers = request.headers || new Headers();
    const apiKeyHeader = String(headers.get("X-Api-Key") || "").trim();
    const bearer = String(headers.get("Authorization") || "").trim();
    const expectedApiKey = String(process.env.EXTERNAL_API_API_KEY || "").trim();

    // Autenticación: permitir Bearer (Firebase) o API Key simple
    let authOk = false;
    if (bearer.toLowerCase().startsWith("bearer ")) {
      try {
        const auth = getAdminAuth();
        await auth.verifyIdToken(bearer.substring(7));
        authOk = true;
      } catch {
        // no ok
      }
    }
    if (!authOk && expectedApiKey && apiKeyHeader && apiKeyHeader === expectedApiKey) {
      authOk = true;
    }
    if (!authOk) {
      return withCors(NextResponse.json({ error: "unauthorized" }, { status: 401 }));
    }

    const form = await request.formData();
    const file = form.get("file");
    const email = String(form.get("email") || "").trim();
    const comments = String(form.get("comments") || "").trim();
    const mimeTypeOverride = String(form.get("mimeType") || "").trim();

    if (!file || typeof file.name !== "string") {
      return withCors(NextResponse.json({ error: "archivo_requerido" }, { status: 400 }));
    }

    // Validaciones de tipo y tamaño
    const allowed = new Set(["application/pdf", "image/jpeg", "image/png"]);
    const fileType = String(mimeTypeOverride || file.type || "").toLowerCase();
    if (!allowed.has(fileType)) {
      return withCors(NextResponse.json({ error: "mime_no_permitido" }, { status: 400 }));
    }
    const size = Number(file.size || 0);
    if (!Number.isFinite(size) || size <= 0) {
      return withCors(NextResponse.json({ error: "archivo_vacio" }, { status: 400 }));
    }
    const MAX_BYTES = 10 * 1024 * 1024; // 10MB
    if (size > MAX_BYTES) {
      return withCors(NextResponse.json({ error: "archivo_demasiado_grande" }, { status: 413 }));
    }

    // Buscar venta por numeroPedido == orderId o idExterno == orderId
    let ventaDoc = null;
    {
      const q1 = query(collection(db, "ventas"), where("numeroPedido", "==", orderId), limit(1));
      const s1 = await getDocs(q1);
      if (!s1.empty) ventaDoc = s1.docs[0];
    }
    if (!ventaDoc) {
      const q2 = query(collection(db, "ventas"), where("idExterno", "==", orderId), limit(1));
      const s2 = await getDocs(q2);
      if (!s2.empty) ventaDoc = s2.docs[0];
    }
    if (!ventaDoc) {
      return withCors(NextResponse.json({ error: "venta_no_encontrada", orderId }, { status: 404 }));
    }

    const ventaId = ventaDoc.id;
    const nowIso = new Date().toISOString();

    // Subir archivo a Cloudflare R2
    const safeName = file.name.replace(/[^\w.\-]+/g, "_");
    const destPath = `comprobantes/ventas/${ventaId}/${Date.now()}-${safeName}`;
    const uploaded = await uploadFileToR2({
      key: destPath,
      file,
      contentType: fileType,
    });

    // Guardar metadatos en subcolección
    const compMeta = {
      ventaId,
      orderId,
      emailRemitente: email || null,
      comments: comments || null,
      nombreArchivo: safeName,
      mimeType: fileType,
      size,
      storagePath: destPath,
      storageUrl: uploaded?.url || null,
      recibidoEn: nowIso,
      origen: "transferencia_ecommerce",
    };
    const compRef = await addDoc(collection(db, `ventas/${ventaId}/comprobantes`), compMeta);

    // Actualizar la venta: marcar comprobante recibido y guardar último comprobante
    const ventaRef = doc(db, "ventas", ventaId);
    await updateDoc(ventaRef, {
      comprobante_recibido: true,
      ultimoComprobante: {
        id: compRef.id,
        storagePath: destPath,
        storageUrl: uploaded?.url || null,
        mimeType: fileType,
        size,
        nombreArchivo: safeName,
        recibidoEn: nowIso,
        emailRemitente: email || null,
      },
      actualizadoEn: nowIso,
    });

    return withCors(NextResponse.json({ success: true, id: compRef.id }, { status: 201 }));
  } catch (err) {
    return withCors(NextResponse.json({ error: err.message || "internal_error" }, { status: 500 }));
  }
}
