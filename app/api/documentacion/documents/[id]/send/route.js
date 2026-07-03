import { NextResponse } from "next/server";
export const runtime = "nodejs";
import { getAdminDb, verifyFirebaseToken } from "@/lib/firebase-admin";
import { addDocumentoEvent, getRequestIp, newToken, nowIso, sha256 } from "@/lib/documentacion-server";
import { DOCUMENTO_ESTADOS, nextEstadoAfterSend } from "@/lib/documentacion-states";
import { DOCUMENTACION_TEXTOS } from "@/lib/documentacion-texts";
import { Resend } from "resend";

const normalizePhone = (phone) => {
  const digits = String(phone || "").replace(/[^\d]/g, "");
  if (!digits) return "";
  let v = digits;
  if (v.startsWith("00")) v = v.slice(2);
  if (v.startsWith("0")) v = v.slice(1);
  if (v.startsWith("54")) return v;
  if (v.length <= 11) return `54${v}`;
  return v;
};

const buildPublicUrl = ({ request, lang, tokenPlain }) => {
  const origin = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
  const safeLang = String(lang || "es").trim() || "es";
  return `${origin}/${safeLang}/documentacion/d/${tokenPlain}`;
};

const htmlToText = (html) =>
  String(html || "")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/\s*div\s*>/gi, "\n")
    .replace(/<\/\s*p\s*>/gi, "\n")
    .replace(/<\/\s*h[1-6]\s*>/gi, "\n")
    .replace(/<\/\s*li\s*>/gi, "\n")
    .replace(/<\/\s*tr\s*>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

export async function POST(request, { params }) {
  try {
    const authHeader = request.headers.get("authorization") || "";
    const user = await verifyFirebaseToken(authHeader);
    const id = params?.id;
    const body = await request.json().catch(() => ({}));

    const metodo = String(body?.metodo || "").toLowerCase();
    if (metodo !== "email" && metodo !== "whatsapp") {
      return NextResponse.json({ ok: false, error: "Método inválido" }, { status: 400 });
    }
    const destinatarioRaw = String(body?.destinatario || "").trim();
    const lang = String(body?.lang || "es").trim() || "es";
    const ttlDays = Math.max(1, Math.min(60, Number(body?.ttlDays || 14)));

    const db = getAdminDb();
    const ref = db.collection("documentos").doc(String(id));
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ ok: false, error: "No encontrado" }, { status: 404 });
    }
    const current = snap.data() || {};

    const now = nowIso();
    const nextEstado = nextEstadoAfterSend(current);

    const tokenPlain = newToken();
    const tokenHash = sha256(tokenPlain);
    const nextExpiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000).toISOString();
    const currentExpiresAtMs = Date.parse(String(current?.public?.expiresAt || ""));
    const nextExpiresAtMs = Date.parse(String(nextExpiresAt || ""));
    const expiresAt =
      Number.isFinite(currentExpiresAtMs) && Number.isFinite(nextExpiresAtMs) && currentExpiresAtMs > nextExpiresAtMs
        ? String(current?.public?.expiresAt || nextExpiresAt)
        : nextExpiresAt;
    const publicUrl = buildPublicUrl({ request, lang, tokenPlain });
    const prevHashes = Array.isArray(current?.public?.tokenHashes) ? current.public.tokenHashes : [];
    const tokenHashes = Array.from(new Set([...(prevHashes || []), tokenHash].filter(Boolean)));

    const clienteNombre = String(current?.inputs?.clienteNombre || current?.cliente?.nombre || "");
    const numero = String(current?.numero || "");
    const titulo = String(current?.titulo || "");
    const empresaNombre = "Maderas Caballero";
    const asuntoEmail = DOCUMENTACION_TEXTOS.envio.asuntoEmail(numero, titulo);
    const descripcionHtml = String(current?.template?.descripcionHtml || "");
    const descripcionText = htmlToText(descripcionHtml);
    const cuerpoEmail = DOCUMENTACION_TEXTOS.envio.cuerpoEmail(clienteNombre, empresaNombre, publicUrl, descripcionText);

    const destinatarioFallback =
      metodo === "email"
        ? String(current?.cliente?.email || current?.inputs?.clienteEmail || "").trim()
        : String(current?.cliente?.telefono || current?.inputs?.clienteTelefono || "").trim();
    const destinatario = destinatarioRaw || destinatarioFallback;

    let whatsappUrl = "";
    if (metodo === "whatsapp") {
      const phone = normalizePhone(destinatario);
      if (!phone) {
        return NextResponse.json({ ok: false, error: "Teléfono inválido" }, { status: 400 });
      }
      const msg = DOCUMENTACION_TEXTOS.envio.mensajeWhatsapp(clienteNombre, numero, publicUrl, descripcionText);
      whatsappUrl = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
    }

    let resendId = "";
    if (metodo === "email") {
      if (!destinatario) {
        return NextResponse.json({ ok: false, error: "Email requerido" }, { status: 400 });
      }
      const apiKey = String(process.env.RESEND_API_KEY || "").trim();
      const from = String(process.env.RESEND_FROM || "").trim();
      if (!apiKey || !from) {
        return NextResponse.json(
          { ok: false, error: "Falta configurar RESEND_API_KEY o RESEND_FROM" },
          { status: 500 }
        );
      }
      const resend = new Resend(apiKey);
      const origin = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
      const logoUrl = `${origin}/logo-maderera.png`;
      const html = DOCUMENTACION_TEXTOS.envio.cuerpoEmailHtml({
        clienteNombre,
        numero,
        titulo,
        link: publicUrl,
        logoUrl,
        descripcionHtml,
      });
      const replyTo = String(process.env.RESEND_REPLY_TO || "").trim();
      const fromFinal = from.includes("<") ? from : `Maderas Caballero <${from}>`;
      const { data, error } = await resend.emails.send({
        from: fromFinal,
        to: destinatario,
        subject: asuntoEmail,
        text: cuerpoEmail,
        html,
        ...(replyTo ? { replyTo } : {}),
      });
      if (error) {
        return NextResponse.json({ ok: false, error: error.message || "Error enviando email" }, { status: 502 });
      }
      resendId = String(data?.id || "");
    }

    await ref.set(
      {
        estado: nextEstado,
        inputs:
          metodo === "email"
            ? { ...(current.inputs || {}), clienteEmail: destinatario }
            : metodo === "whatsapp"
              ? { ...(current.inputs || {}), clienteTelefono: destinatario }
              : current.inputs || null,
        public: {
          ...(current.public || {}),
          tokenHash,
          tokenHashes,
          tokenCreatedAt: current?.public?.tokenCreatedAt || now,
          tokenRotatedAt: current?.public?.tokenHash ? now : (current?.public?.tokenRotatedAt || null),
          expiresAt,
          lastLinkGeneratedAt: now,
        },
        envios: [
          ...(Array.isArray(current.envios) ? current.envios : []),
          {
            metodo,
            destinatario,
            publicUrl,
            ...(whatsappUrl ? { whatsappUrl } : {}),
            ...(resendId ? { resendId } : {}),
            at: now,
            byUid: String(user.uid || ""),
            byEmail: String(user.email || ""),
          },
        ],
        enviadoAt: current.enviadoAt || (nextEstado === DOCUMENTO_ESTADOS.ENVIADO ? now : null),
        updatedAt: now,
        updatedByUid: String(user.uid || ""),
        updatedByEmail: String(user.email || ""),
      },
      { merge: true }
    );

    await addDocumentoEvent({
      documentoId: ref.id,
      type: "document_sent",
      actorType: "internal",
      actorId: user.uid,
      actorEmail: user.email,
      ip: getRequestIp(request),
      userAgent: request.headers.get("user-agent") || "",
      details: { metodo, destinatario, publicUrl, expiresAt, resendId, whatsappUrl },
    });

    return NextResponse.json({ ok: true, estado: nextEstado, publicUrl, expiresAt, resendId, whatsappUrl });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Error" },
      { status: e?.status || 500 }
    );
  }
}
