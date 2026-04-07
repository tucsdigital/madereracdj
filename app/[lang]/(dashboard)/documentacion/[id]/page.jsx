"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/use-toast";
import { useAuth } from "@/provider/auth.provider";
import { DOCUMENTO_ESTADOS, canEditarDocumento, canEmitirDocumento, canGenerarLink } from "@/lib/documentacion-states";
import { DOCUMENTACION_TEXTOS } from "@/lib/documentacion-texts";
import { useQuill } from "react-quilljs";
import "quill/dist/quill.snow.css";
import { ArrowLeft, Loader2, Send } from "lucide-react";

const safeJson = async (res) => {
  try {
    return await res.json();
  } catch {
    return null;
  }
};

const estadoLabel = (estado) => {
  const map = DOCUMENTACION_TEXTOS?.estados || {};
  return map[estado] || estado || "-";
};

const estadoColor = (estado) => {
  if (estado === DOCUMENTO_ESTADOS.FIRMADO) return "success";
  if (estado === DOCUMENTO_ESTADOS.RECHAZADO_U_OBSERVADO) return "destructive";
  if (estado === DOCUMENTO_ESTADOS.VENCIDO) return "warning";
  if (estado === DOCUMENTO_ESTADOS.ANULADO) return "secondary";
  if (estado === DOCUMENTO_ESTADOS.PENDIENTE_ACEPTACION) return "info";
  return "default";
};

const normalizePhone = (phone) => String(phone || "").replace(/[^\d]/g, "");
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

const formatDateTimeAr = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "-";
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

const isExpired = (expiresAt) => {
  const ms = Date.parse(String(expiresAt || ""));
  if (!Number.isFinite(ms)) return false;
  return ms < Date.now();
};

const getDocClientEmail = (doc) => String(doc?.cliente?.email || doc?.inputs?.clienteEmail || "").trim();

const getDocClientPhoneRaw = (doc) => {
  const fromCliente = String(doc?.cliente?.telefono || "").trim();
  if (fromCliente) return fromCliente;
  const fromInputs = String(doc?.inputs?.clienteTelefono || "").trim();
  if (fromInputs) return fromInputs;
  const text = htmlToText(doc?.contentHtml || "");
  const m = text.match(/Tel[eé]fono:\s*([0-9+()\-\s]{6,})/i);
  return String(m?.[1] || "").trim();
};

export default function DocumentacionDetailPage() {
  const { lang, id } = useParams();
  const router = useRouter();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [acting, setActing] = useState(false);
  const [item, setItem] = useState(null);
  const [publicUrl, setPublicUrl] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [ttlDays, setTtlDays] = useState(7);
  const [includeLegal, setIncludeLegal] = useState(false);
  const [showLegal, setShowLegal] = useState(false);

  const canEdit = useMemo(() => canEditarDocumento(item), [item]);
  const canEmit = useMemo(() => canEmitirDocumento(item), [item]);
  const canShare = useMemo(() => canGenerarLink(item), [item]);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/documentacion/documents/${id}`, {
        headers: { authorization: `Bearer ${token}` },
      });
      const data = await safeJson(res);
      if (!data?.ok) throw new Error(data?.error || "Error");
      setItem(data.item);
    } catch (e) {
      toast({
        title: "No se pudo cargar el documento",
        description: e?.message || "Error",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [user, id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setIncludeLegal(Boolean(String(item?.legalHtml || "").trim()));
  }, [item?.id]);

  useEffect(() => {
    const d = item;
    if (!d) {
      setPublicUrl("");
      setExpiresAt("");
      return;
    }
    const expires = String(d?.public?.expiresAt || "");
    const lastGenAtMs = Date.parse(String(d?.public?.lastLinkGeneratedAt || ""));
    let lastEnvio = null;
    if (Array.isArray(d?.envios) && d.envios.length > 0) {
      lastEnvio = d.envios.slice().sort((a, b) => Date.parse(String(b?.at || "")) - Date.parse(String(a?.at || "")))[0];
    }
    const lastEnvioAtMs = Date.parse(String(lastEnvio?.at || ""));
    const superseded = Number.isFinite(lastGenAtMs) && Number.isFinite(lastEnvioAtMs) && lastGenAtMs > lastEnvioAtMs;
    const hasUrl = !!lastEnvio?.publicUrl;
    const valid = !!expires && !isExpired(expires);
    if (hasUrl && valid && !superseded) {
      setPublicUrl(String(lastEnvio.publicUrl || ""));
      setExpiresAt(expires);
    } else {
      setPublicUrl("");
      setExpiresAt("");
    }
  }, [item]);

  const siteUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return window.location.origin;
  }, []);

  const updateField = (key, value) => setItem((p) => ({ ...(p || {}), [key]: value }));

  const { quillRef: bodyRef, quill: bodyQuill } = useQuill();
  const { quillRef: legalRef, quill: legalQuill } = useQuill();

  useEffect(() => {
    if (!bodyQuill) return;
    bodyQuill.enable(Boolean(canEdit));
    const html = String(item?.contentHtml || "");
    const current = String(bodyQuill.root?.innerHTML || "");
    if (html !== current) bodyQuill.clipboard.dangerouslyPasteHTML(html);
    if (canEdit) {
      bodyQuill.on("text-change", () => {
        updateField("contentHtml", bodyQuill.root.innerHTML);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bodyQuill, canEdit, item?.id]);

  useEffect(() => {
    if (!legalQuill) return;
    legalQuill.enable(Boolean(canEdit) && includeLegal);
    const html = String(item?.legalHtml || "");
    const current = String(legalQuill.root?.innerHTML || "");
    if (html !== current) legalQuill.clipboard.dangerouslyPasteHTML(html);
    if (canEdit) {
      legalQuill.on("text-change", () => {
        updateField("legalHtml", legalQuill.root.innerHTML);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [legalQuill, canEdit, item?.id, includeLegal]);

  const save = useCallback(async () => {
    if (!user || !item) return;
    setSaving(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/documentacion/documents/${id}`, {
        method: "PUT",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({
          titulo: item.titulo || "",
          contentHtml: item.contentHtml || "",
          legalHtml: includeLegal ? item.legalHtml || "" : "",
        }),
      });
      const data = await safeJson(res);
      if (!data?.ok) throw new Error(data?.error || "Error");
      await load();
      toast({ title: "Guardado" });
    } catch (e) {
      toast({
        title: "No se pudo guardar",
        description: e?.message || "Error",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }, [user, item, id, load, includeLegal]);

  const emitir = useCallback(async () => {
    if (!user) return;
    setActing(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/documentacion/documents/${id}?action=emitir`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
      });
      const data = await safeJson(res);
      if (!data?.ok) throw new Error(data?.error || "Error");
      await load();
      toast({ title: "Documento emitido" });
    } catch (e) {
      toast({
        title: "No se pudo emitir",
        description: e?.message || "Error",
        variant: "destructive",
      });
    } finally {
      setActing(false);
    }
  }, [user, id, load]);

  const emitirUi = useCallback(async () => {
    if (!canEmit || saving || acting) return;
    await save();
    await emitir();
  }, [canEmit, saving, acting, save, emitir]);

  const generarLink = useCallback(async () => {
    if (!user) return;
    setActing(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/documentacion/documents/${id}/link`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ ttlDays: Number(ttlDays) || 7, rotate: true }),
      });
      const data = await safeJson(res);
      if (!data?.ok) throw new Error(data?.error || "Error");
      const tokenPlain = String(data?.token || "");
      const url = tokenPlain ? `${siteUrl}/${lang}/documentacion/d/${tokenPlain}` : "";
      setPublicUrl(url);
      setExpiresAt(String(data?.expiresAt || ""));
      toast({ title: "Link generado" });
    } catch (e) {
      toast({
        title: "No se pudo generar el link",
        description: e?.message || "Error",
        variant: "destructive",
      });
    } finally {
      setActing(false);
    }
  }, [user, id, ttlDays, siteUrl, lang]);

  const copy = useCallback(async (text) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Copiado" });
    } catch {}
  }, []);

  const enviar = useCallback(
    async (metodo) => {
      if (!user || !item) return;
      const destinatario = metodo === "email" ? getDocClientEmail(item) : getDocClientPhoneRaw(item);
      if (metodo === "email" && !destinatario) {
        toast({ title: "Falta email del cliente", variant: "destructive" });
        return;
      }
      if (metodo === "whatsapp" && !normalizePhone(destinatario)) {
        toast({ title: "Falta teléfono del cliente", variant: "destructive" });
        return;
      }
      setActing(true);
      try {
        const token = await user.getIdToken();
        const res = await fetch(`/api/documentacion/documents/${id}/send`, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
          body: JSON.stringify({ metodo, destinatario, ttlDays: Number(ttlDays) || 7, lang }),
        });
        const data = await safeJson(res);
        if (!data?.ok) throw new Error(data?.error || "Error");
        if (data?.publicUrl) setPublicUrl(String(data.publicUrl));
        if (data?.expiresAt) setExpiresAt(String(data.expiresAt));
        if (metodo === "whatsapp" && data?.whatsappUrl) {
          try {
            window.open(String(data.whatsappUrl), "_blank", "noopener,noreferrer");
          } catch {}
        }
        await load();
        toast({ title: metodo === "email" ? "Email enviado" : "WhatsApp listo" });
      } catch (e) {
        toast({
          title: metodo === "email" ? "No se pudo enviar el email" : "No se pudo preparar WhatsApp",
          description: e?.message || "Error",
          variant: "destructive",
        });
      } finally {
        setActing(false);
      }
    },
    [user, id, item, ttlDays, lang, load]
  );

  const mensajes = useMemo(() => {
    const numero = item?.numero || "";
    const titulo = item?.titulo || "";
    const clienteNombre = item?.cliente?.nombre || "";
    const empresaNombre = "Maderas Caballero";
    const descripcionText = htmlToText(item?.template?.descripcionHtml || "");
    return {
      asuntoEmail: DOCUMENTACION_TEXTOS.envio.asuntoEmail(numero, titulo),
      cuerpoEmail: DOCUMENTACION_TEXTOS.envio.cuerpoEmail(clienteNombre, empresaNombre, publicUrl, descripcionText),
      mensajeWhatsapp: DOCUMENTACION_TEXTOS.envio.mensajeWhatsapp(clienteNombre, numero, publicUrl, descripcionText),
    };
  }, [item, publicUrl]);

  const waLink = useMemo(() => {
    const phone = normalizePhone(getDocClientPhoneRaw(item));
    if (!phone || !publicUrl) return "";
    const text = encodeURIComponent(mensajes.mensajeWhatsapp);
    return `https://wa.me/${phone}?text=${text}`;
  }, [item, publicUrl, mensajes.mensajeWhatsapp]);

  const openWhatsapp = useCallback(async () => {
    if (waLink) {
      try {
        window.open(String(waLink), "_blank", "noopener,noreferrer");
        return;
      } catch {}
    }
    await enviar("whatsapp");
  }, [waLink, enviar]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-[320px]" />
            <Skeleton className="h-6 w-28 rounded-full" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Skeleton className="h-10 w-24" />
            <Skeleton className="h-10 w-24" />
            <Skeleton className="h-10 w-24" />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="border border-default-200 lg:col-span-2">
            <CardHeader>
              <CardTitle>Contenido</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-[260px] w-full" />
              <Skeleton className="h-10 w-full" />
            </CardContent>
          </Card>
          <div className="space-y-4">
            <Card className="border border-default-200">
              <CardHeader>
                <CardTitle>Link y envío</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="py-16 text-center text-default-500">
        <div>No encontrado</div>
        <Button className="mt-4" onClick={() => router.push(`/${lang}/documentacion`)}>
          Volver
        </Button>
      </div>
    );
  }

  const isDraft = (item?.estado || DOCUMENTO_ESTADOS.BORRADOR) === DOCUMENTO_ESTADOS.BORRADOR;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-sm text-default-500">N° {item.numero || "-"}</div>
          <div className="text-2xl font-bold text-default-900">{item.titulo || "Documento"}</div>
          <div className="mt-2">
            <Badge color={estadoColor(item.estado)}>{estadoLabel(item.estado)}</Badge>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isDraft ? (
            <>
              <Button variant="outline" asChild>
                <Link href={`/${lang}/documentacion`} className="inline-flex items-center">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Volver
                </Link>
              </Button>
              <Button variant="outline" onClick={emitirUi} disabled={!canEmit || acting || saving}>
                {acting || saving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Procesando...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Emitir
                  </>
                )}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" asChild>
                <Link href={`/${lang}/documentacion`} className="inline-flex items-center">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Volver
                </Link>
              </Button>
              <Button variant="outline" onClick={emitirUi} disabled={!canEmit || acting || saving}>
                {acting || saving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Procesando...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Emitir
                  </>
                )}
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="border border-default-200 lg:col-span-2">
          <CardHeader>
            <CardTitle>Contenido</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <div className="text-sm font-medium text-default-700">Título</div>
              <Input value={item.titulo || ""} onChange={(e) => updateField("titulo", e.target.value)} disabled={!canEdit} />
            </div>
            {String(item?.template?.descripcionHtml || "").trim() ? (
              <div className="space-y-1">
                <div className="text-sm font-medium text-default-700">Descripción</div>
                <div className="rounded-md border border-default-200 p-4 bg-background">
                  <div
                    className="prose prose-sm max-w-none text-default-900"
                    dangerouslySetInnerHTML={{ __html: String(item.template.descripcionHtml || "") }}
                  />
                </div>
              </div>
            ) : null}
            <div className="space-y-1">
              <div className="text-sm font-medium text-default-700">Documento</div>
              <div className="rounded-md border border-default-200 p-4 bg-background">
                {String(item?.contentHtml || "").trim() ? (
                  <div
                    className="prose prose-sm max-w-none text-default-900"
                    dangerouslySetInnerHTML={{ __html: String(item.contentHtml || "") }}
                  />
                ) : (
                  <div className="text-xs text-default-500">Sin contenido.</div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="border border-default-200">
            <CardHeader>
              <CardTitle>Link y envío</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {publicUrl ? (
                <div className="space-y-2 rounded-md border border-default-200 p-3">
                  <div className="text-xs text-default-500">Link</div>
                  <div className="text-sm break-all font-medium">{publicUrl}</div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => copy(publicUrl)}>
                      Copiar
                    </Button>
                    <Button size="sm" variant="outline" asChild>
                      <a href={publicUrl} target="_blank" rel="noreferrer">
                        Abrir
                      </a>
                    </Button>
                  </div>
                  {expiresAt ? (
                    <div className="text-xs text-default-500">Vence: {formatDateTimeAr(expiresAt)}</div>
                  ) : null}
                </div>
              ) : canShare ? (
                <div className="text-xs text-default-500">El link se generará automáticamente al enviar al cliente.</div>
              ) : (
                <div className="text-xs text-default-500">Emití el documento para habilitar el envío y la generación de link.</div>
              )}

              {canShare ? (
                <div className="space-y-2">
                  <Button
                    className="w-full"
                    variant="outline"
                    onClick={() => enviar("email")}
                    disabled={acting || !getDocClientEmail(item)}
                  >
                    Enviar email
                  </Button>
                  <Button
                    className="w-full"
                    variant="outline"
                    onClick={openWhatsapp}
                    disabled={acting || !normalizePhone(getDocClientPhoneRaw(item))}
                  >
                    Abrir WhatsApp
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card className="border border-default-200">
            <CardHeader>
              <CardTitle>Mensajes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <div className="text-sm font-medium text-default-700">Asunto Email</div>
                <Input value={mensajes.asuntoEmail} readOnly />
                <Button size="sm" variant="outline" onClick={() => copy(mensajes.asuntoEmail)}>
                  Copiar asunto
                </Button>
              </div>
              <div className="space-y-1">
                <div className="text-sm font-medium text-default-700">Cuerpo Email</div>
                <Textarea value={mensajes.cuerpoEmail} readOnly className="min-h-[140px]" />
                <Button size="sm" variant="outline" onClick={() => copy(mensajes.cuerpoEmail)}>
                  Copiar cuerpo
                </Button>
              </div>
              <div className="space-y-1">
                <div className="text-sm font-medium text-default-700">WhatsApp</div>
                <Textarea value={mensajes.mensajeWhatsapp} readOnly className="min-h-[110px]" />
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => copy(mensajes.mensajeWhatsapp)}>
                    Copiar
                  </Button>
                  {canShare ? (
                    <Button size="sm" variant="outline" onClick={openWhatsapp} disabled={acting || !item?.cliente?.telefono}>
                      Abrir WhatsApp
                    </Button>
                  ) : null}
                </div>
              </div>
            </CardContent>
          </Card>

          {item?.signed?.pdfUrl ? (
            <Card className="border border-default-200">
              <CardHeader>
                <CardTitle>PDF firmado</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button className="w-full" asChild>
                  <a href={item.signed.pdfUrl} target="_blank" rel="noreferrer">
                    Descargar PDF
                  </a>
                </Button>
                <div className="text-xs text-default-500 break-all">{item.signed.pdfUrl}</div>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>

      <Card className="border border-default-200">
        <CardHeader>
          <CardTitle>Evidencias</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded-md border border-default-200 p-3">
            <div className="text-xs text-default-500">Creación</div>
            <div className="text-sm font-medium">{formatDateTimeAr(item.createdAt)}</div>
            <div className="text-xs text-default-500">{item.createdByEmail || "-"}</div>
          </div>
          <div className="rounded-md border border-default-200 p-3">
            <div className="text-xs text-default-500">Última edición</div>
            <div className="text-sm font-medium">{formatDateTimeAr(item.updatedAt)}</div>
            <div className="text-xs text-default-500">{item.updatedByEmail || "-"}</div>
          </div>
          <div className="rounded-md border border-default-200 p-3">
            <div className="text-xs text-default-500">Apertura link</div>
            <div className="text-sm font-medium">{formatDateTimeAr(item?.public?.lastOpenedAt)}</div>
            <div className="text-xs text-default-500">{item?.public?.lastIp || "-"}</div>
          </div>
          <div className="rounded-md border border-default-200 p-3">
            <div className="text-xs text-default-500">Lectura confirmada</div>
            <div className="text-sm font-medium">{formatDateTimeAr(item?.public?.readConfirmedAt)}</div>
          </div>
          <div className="rounded-md border border-default-200 p-3">
            <div className="text-xs text-default-500">Firma</div>
            <div className="text-sm font-medium">{formatDateTimeAr(item?.public?.signedAt)}</div>
            <div className="text-xs text-default-500">{item?.signed?.nombreApellido || "-"}</div>
          </div>
          <div className="rounded-md border border-default-200 p-3">
            <div className="text-xs text-default-500">Envíos</div>
            <div className="text-sm font-medium">{Array.isArray(item.envios) ? item.envios.length : 0}</div>
            <div className="text-xs text-default-500">
              {Array.isArray(item.envios) && item.envios[0]
                ? `${item.envios[0].metodo} · ${formatDateTimeAr(item.envios[0].at)}`
                : "-"}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
