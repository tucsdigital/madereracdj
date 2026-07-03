import { NextResponse } from "next/server";
export const runtime = "nodejs";
import { put } from "@vercel/blob";
import { addDocumentoEvent, findDocumentoByPublicTokenHash, getRequestIp, nowIso, sha256 } from "@/lib/documentacion-server";
import { DOCUMENTO_ESTADOS } from "@/lib/documentacion-states";
import { generatePdfFromHtml } from "@/src/lib/pdf/generate-documento-firmado";

const isExpired = (expiresAt) => {
  if (!expiresAt) return false;
  const ms = Date.parse(String(expiresAt));
  if (!Number.isFinite(ms)) return false;
  return ms < Date.now();
};

const stripDataUrlPrefix = (dataUrl) => {
  const m = String(dataUrl || "").match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return null;
  return { mime: m[1], base64: m[2] };
};

const buildSignedHtml = ({ numero, titulo, cliente, obra, ubicacion, contentHtml, legalHtml, signed }) => {
  const safe = (v) => String(v || "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  const formatDateTimeAr = (value) => {
    const raw = String(value || "").trim();
    if (!raw) return "";
    const ms = Date.parse(raw);
    if (!Number.isFinite(ms)) return raw;
    try {
      const formatted = new Intl.DateTimeFormat("es-AR", {
        timeZone: "America/Argentina/Buenos_Aires",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).format(new Date(ms));
      return formatted.replace(",", "");
    } catch {
      return raw;
    }
  };
  const row = (label, value) =>
    `<div style="display:flex; gap:10px; margin: 2px 0;"><div style="width:170px; color:#374151; font-weight:700;">${safe(
      label
    )}</div><div style="flex:1; color:#111827; font-weight:600;">${safe(value)}</div></div>`;

  const firmaImg = signed?.signatureUrl
    ? `<img src="${signed.signatureUrl}" alt="Firma" style="max-width: 320px; border: 1px solid #e5e7eb; border-radius: 10px; padding: 10px; background:#ffffff;" />`
    : "";

  const empresa = {
    nombre: "Maderas Caballero",
    direccion: "Av. Dr. Honorio Pueyrredón 4625, Villa Rosa, Buenos Aires",
    telefono: "11-3497-6239",
    web: "www.caballeromaderas.com",
    instagram: "@caballeromaderas",
  };

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${safe(numero)}${titulo ? ` - ${safe(titulo)}` : ""}</title>
  </head>
  <body style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; background:#f9fafb; margin:0; padding:0;">
    <div style="max-width: 820px; margin: 24px auto; padding: 0 14px;">
      <div style="background:#111827; color:#fff; padding: 16px 18px; border-radius: 14px;">
        <div style="font-size: 12px; opacity: 0.9; font-weight: 700;">DOCUMENTACIÓN</div>
        <div style="display:flex; justify-content:space-between; align-items:flex-end; gap: 12px;">
          <div>
            <div style="font-size: 18px; font-weight: 900; line-height: 1.15;">${safe(titulo || "Documento")}</div>
            <div style="font-size: 12px; opacity: 0.9; margin-top: 4px;">N° ${safe(numero)}</div>
          </div>
          <div style="text-align:right; font-size: 12px; opacity: 0.95;">
            <div style="font-weight: 800;">${safe(empresa.nombre)}</div>
            <div style="opacity: 0.9;">${safe(empresa.direccion)}</div>
            <div style="opacity: 0.9;">Tel: ${safe(empresa.telefono)}</div>
            <div style="opacity: 0.9;">${safe(empresa.web)}</div>
            <div style="opacity: 0.9;">${safe(empresa.instagram)}</div>
          </div>
        </div>
      </div>

      <div style="background:#fff; margin-top: 12px; border-radius: 14px; border:1px solid #e5e7eb; overflow:hidden;">
        <div style="padding: 16px;">
          <div style="font-weight: 900; color:#111827; margin-bottom: 10px;">Documento</div>
          <div style="font-size: 14px; color:#111827; line-height: 1.55;">${contentHtml || ""}</div>
          ${
            legalHtml
              ? `<div style="margin-top: 14px; padding-top: 14px; border-top: 1px dashed #e5e7eb;">
                  <div style="font-weight: 900; color:#111827; margin-bottom: 10px;">Términos y condiciones</div>
                  <div style="font-size: 12.5px; color:#111827; line-height: 1.55;">${legalHtml}</div>
                </div>`
              : ""
          }
        </div>
      </div>

      <div style="background:#fff; margin-top: 12px; border-radius: 14px; border:1px solid #e5e7eb; overflow:hidden;">
        <div style="padding: 14px 16px; border-bottom:1px solid #e5e7eb;">
          <div style="font-weight: 900; color:#111827;">Aceptación y firma</div>
          <div style="margin-top: 8px; font-size: 13px;">
            ${row("Leído", signed?.confirmoLectura ? "Sí" : "No")}
            ${row("Términos aceptados", legalHtml ? (signed?.aceptoTerminos ? "Sí" : "No") : "N/A")}
            ${row("Asesoramiento mantenimiento", signed?.recibioMantenimiento ? "Sí" : "No")}
            ${row("Conformidad", signed?.conformeObra ? "Sí" : "No")}
            ${row("Nombre y apellido", signed?.nombreApellido || "")}
            ${row("DNI/CUIT", signed?.identificacion || "")}
            ${row("Fecha y hora", formatDateTimeAr(signed?.at))}
          </div>
        </div>
        <div style="padding: 16px;">
          <div style="font-weight: 900; color:#111827; margin-bottom: 10px;">Firma</div>
          ${firmaImg}
          ${
            signed?.observaciones
              ? `<div style="margin-top: 12px; font-size: 13px; color:#111827;">
                  <div style="font-weight: 900; margin-bottom: 6px;">Observaciones</div>
                  <div style="white-space: pre-wrap;">${safe(signed.observaciones)}</div>
                </div>`
              : ""
          }
          <div style="margin-top: 12px; font-size: 11.5px; color:#374151;">
            La firma digital registrada constituye evidencia de aceptación de conformidad y puede ser utilizada como respaldo legal y comercial.
          </div>
        </div>
      </div>
    </div>
  </body>
</html>`;
};

export async function POST(request, { params }) {
  try {
    const token = String(params?.token || "");
    if (!token) return NextResponse.json({ ok: false, error: "Token inválido" }, { status: 400 });
    const tokenHash = sha256(token);

    const body = await request.json().catch(() => ({}));
    const confirmoLectura = Boolean(body?.confirmoLectura);
    const aceptoTerminos = Boolean(body?.aceptoTerminos);
    const recibioMantenimiento = Boolean(body?.recibioMantenimiento);
    const conformeObra = Boolean(body?.conformeObra);
    const nombreApellido = String(body?.nombreApellido || "").trim();
    const identificacion = String(body?.identificacion || "").trim();
    const observaciones = String(body?.observaciones || "").trim();
    const signatureDataUrl = String(body?.signatureDataUrl || "");

    const docSnap = await findDocumentoByPublicTokenHash(tokenHash);
    if (!docSnap) return NextResponse.json({ ok: false, error: "No encontrado" }, { status: 404 });
    const data = docSnap.data() || {};

    const requiresTerms = Boolean(String(data?.legalHtml || "").trim());
    if (!confirmoLectura || !recibioMantenimiento || !conformeObra || (requiresTerms && !aceptoTerminos)) {
      return NextResponse.json({ ok: false, error: "Faltan confirmaciones obligatorias" }, { status: 400 });
    }
    if (!nombreApellido) {
      return NextResponse.json({ ok: false, error: "Nombre requerido" }, { status: 400 });
    }
    if (!identificacion) {
      return NextResponse.json({ ok: false, error: "Identificación requerida" }, { status: 400 });
    }
    const parsedSig = stripDataUrlPrefix(signatureDataUrl);
    if (!parsedSig || !parsedSig.base64) {
      return NextResponse.json({ ok: false, error: "Firma requerida" }, { status: 400 });
    }

    if (data?.estado === DOCUMENTO_ESTADOS.ANULADO) {
      return NextResponse.json({ ok: false, error: "Anulado" }, { status: 410 });
    }
    if (data?.estado === DOCUMENTO_ESTADOS.VENCIDO || isExpired(data?.public?.expiresAt)) {
      return NextResponse.json({ ok: false, error: "Vencido" }, { status: 410 });
    }
    if (data?.estado === DOCUMENTO_ESTADOS.FIRMADO) {
      return NextResponse.json({ ok: true, estado: DOCUMENTO_ESTADOS.FIRMADO });
    }

    const now = nowIso();
    const ip = getRequestIp(request);
    const userAgent = request.headers.get("user-agent") || "";

    const ext = parsedSig.mime === "image/jpeg" ? "jpg" : "png";
    const signatureBytes = Buffer.from(parsedSig.base64, "base64");
    const signaturePath = `documentacion/documentos/${docSnap.id}/signature-${Date.now()}.${ext}`;
    const tokenRW = process.env.demo_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN;
    const signatureBlob = await put(signaturePath, signatureBytes, {
      access: "public",
      addRandomSuffix: false,
      contentType: parsedSig.mime,
      token: tokenRW,
    });

    const signedPayload = {
      confirmoLectura,
      aceptoTerminos,
      recibioMantenimiento,
      conformeObra,
      nombreApellido,
      identificacion,
      observaciones,
      at: now,
      signatureUrl: signatureBlob.url,
    };

    const html = buildSignedHtml({
      numero: data.numero || "",
      titulo: data.titulo || "",
      cliente: data.cliente || null,
      obra: data.obra || null,
      ubicacion: data.ubicacion || null,
      contentHtml: data.contentHtml || "",
      legalHtml: data.legalHtml || "",
      signed: signedPayload,
    });

    const pdfBuffer = await generatePdfFromHtml(html);
    const pdfPath = `documentacion/documentos/${docSnap.id}/signed-${Date.now()}.pdf`;
    const pdfBlob = await put(pdfPath, pdfBuffer, {
      access: "public",
      addRandomSuffix: false,
      contentType: "application/pdf",
      token: tokenRW,
    });

    await docSnap.ref.set(
      {
        estado: DOCUMENTO_ESTADOS.FIRMADO,
        bloqueado: true,
        public: {
          ...(data.public || {}),
          readConfirmedAt: data?.public?.readConfirmedAt || now,
          signedAt: now,
          lastIp: ip,
          lastUserAgent: userAgent,
        },
        signed: {
          ...signedPayload,
          pdfUrl: pdfBlob.url,
          htmlSha256: sha256(html),
        },
        updatedAt: now,
      },
      { merge: true }
    );

    await addDocumentoEvent({
      documentoId: docSnap.id,
      type: "public_signed",
      actorType: "public",
      actorId: "",
      actorEmail: "",
      ip,
      userAgent,
      details: {
        nombreApellido,
        identificacion,
        hasObservaciones: Boolean(observaciones),
        signatureUrl: signatureBlob.url,
        pdfUrl: pdfBlob.url,
      },
    });

    return NextResponse.json({ ok: true, estado: DOCUMENTO_ESTADOS.FIRMADO });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e?.message || "Error" }, { status: 500 });
  }
}
