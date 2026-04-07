"use client";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { DOCUMENTACION_TEXTOS } from "@/lib/documentacion-texts";
import { toast } from "@/components/ui/use-toast";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";

const safeJson = async (res) => {
  try {
    return await res.json();
  } catch {
    return null;
  }
};

const SkeletonLine = ({ className = "" }) => (
  <div className={`h-3 rounded-md bg-default-200/70 animate-pulse ${className}`} />
);

const PublicPageSkeleton = () => {
  return (
    <div className="min-h-screen bg-default-50 py-10">
      <div className="mx-auto max-w-3xl px-4 space-y-4">
        <div className="rounded-2xl bg-default-950 text-white p-5">
          <div className="h-3 w-28 rounded-md bg-white/20 animate-pulse" />
          <div className="mt-2 h-6 w-2/3 rounded-md bg-white/20 animate-pulse" />
          <div className="mt-3 h-4 w-3/4 rounded-md bg-white/15 animate-pulse" />
        </div>

        <Card className="border border-default-200">
          <CardHeader>
            <CardTitle>Documento</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <div className="rounded-md border border-default-200 bg-background p-3">
                <div className="h-3 w-16 rounded-md bg-default-200/70 animate-pulse" />
                <div className="mt-2 h-4 w-40 rounded-md bg-default-200/70 animate-pulse" />
              </div>
              <div className="rounded-md border border-default-200 bg-background p-3">
                <div className="h-3 w-14 rounded-md bg-default-200/70 animate-pulse" />
                <div className="mt-2 h-4 w-24 rounded-md bg-default-200/70 animate-pulse" />
              </div>
            </div>
            <div className="rounded-xl border border-default-200 bg-background p-4 space-y-3">
              <SkeletonLine className="w-2/3" />
              <SkeletonLine className="w-full" />
              <SkeletonLine className="w-5/6" />
              <SkeletonLine className="w-3/4" />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
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

const getDocClienteNombre = (doc) => {
  const fromDoc = String(doc?.cliente?.nombre || "").trim();
  if (fromDoc) return fromDoc;
  const fromInputs = String(doc?.inputs?.clienteNombre || "").trim();
  if (fromInputs) return fromInputs;
  const text = htmlToText(doc?.contentHtml || "");
  const m = text.match(/Nombre y Apellido:\s*([^\n\r]+)/i);
  return String(m?.[1] || "").trim();
};

const getDocObraNumero = (doc) => {
  const fromDoc = String(doc?.obra?.numeroPedido || doc?.obra?.numero || "").trim();
  if (fromDoc) return fromDoc;
  const fromInputs = String(doc?.inputs?.obraNumero || "").trim();
  if (fromInputs) return fromInputs;
  const text = htmlToText(doc?.contentHtml || "");
  const m = text.match(/OBRA\s*N[°ºo]?:[ \t]*([^\n\r]+)/i);
  const candidate = String(m?.[1] || "").trim();
  if (!candidate) return "";
  if (/^\d+\.\s/.test(candidate)) return "";
  return candidate;
};

const SignaturePad = ({ value, onChange }) => {
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const lastRef = useRef({ x: 0, y: 0 });

  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;
    const ratio = window.devicePixelRatio || 1;
    const w = parent.clientWidth;
    const h = 180;
    const prev = canvas.toDataURL("image/png");
    canvas.width = Math.floor(w * ratio);
    canvas.height = Math.floor(h * ratio);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext("2d");
    ctx.scale(ratio, ratio);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 2.2;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    if (value) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, w, h);
      };
      img.src = value;
    } else if (prev && prev !== "data:,") {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, w, h);
      };
      img.src = prev;
    }
  }, [value]);

  useEffect(() => {
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [resize]);

  const point = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX ?? 0) - rect.left;
    const y = (e.clientY ?? 0) - rect.top;
    return { x, y };
  };

  const start = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawingRef.current = true;
    const p = point(e);
    lastRef.current = p;
    const ctx = canvas.getContext("2d");
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };

  const move = (e) => {
    if (!drawingRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const p = point(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastRef.current = p;
  };

  const end = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL("image/png");
    onChange(dataUrl);
  };

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawingRef.current = false;
    onChange("");
    // Re-inicializar fondo blanco y estilos
    resize();
  };

  return (
    <div className="space-y-2">
      <div className="rounded-xl border border-default-200 bg-background p-2">
        <canvas
          ref={canvasRef}
          onPointerDown={(e) => start(e)}
          onPointerMove={(e) => move(e)}
          onPointerUp={end}
          onPointerCancel={end}
          className="block w-full touch-none"
        />
      </div>
      <div className="flex justify-end">
        <Button size="sm" variant="outline" onClick={clear}>
          Limpiar firma
        </Button>
      </div>
    </div>
  );
};

const buildTypedSignature = (text) => {
  const t = String(text || "").trim();
  if (!t) return "";
  const canvas = document.createElement("canvas");
  canvas.width = 900;
  canvas.height = 240;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#111827";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.font = "88px 'Segoe Script', 'Brush Script MT', cursive";
  ctx.fillText(t, 40, 120);
  return canvas.toDataURL("image/png");
};

export default function PublicDocumentoPage() {
  const { token } = useParams();
  const t = DOCUMENTACION_TEXTOS.publico;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [docu, setDocu] = useState(null);
  const [step, setStep] = useState("leer");
  const [read, setRead] = useState(false);
  const [confirmingRead, setConfirmingRead] = useState(false);
  const [aceptoTerminos, setAceptoTerminos] = useState(false);
  const [recibioMantenimiento, setRecibioMantenimiento] = useState(false);
  const [conformeObra, setConformeObra] = useState(false);
  const [nombreApellido, setNombreApellido] = useState("");
  const [identificacion, setIdentificacion] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [signatureMode, setSignatureMode] = useState("draw");
  const [typedSig, setTypedSig] = useState("");
  const [signatureDataUrl, setSignatureDataUrl] = useState("");
  const [signing, setSigning] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [obsRechazo, setObsRechazo] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/documentacion/public/${token}`);
      const data = await safeJson(res);
      if (!data?.ok) {
        const msg = data?.error === "Vencido" ? t.errorVencido : t.errorToken;
        throw new Error(msg);
      }
      setDocu(data.document);
      if (!String(data.document?.legalHtml || "").trim()) setAceptoTerminos(true);
      const alreadyRead = Boolean(data.document?.public?.readConfirmedAt);
      const alreadySigned = Boolean(data.document?.public?.signedAt);
      setRead(alreadyRead);
      if (alreadySigned) setStep("firmado");
      else if (alreadyRead) setStep("aceptar");
      else setStep("leer");
    } catch (e) {
      setError(e?.message || t.errorToken);
    } finally {
      setLoading(false);
    }
  }, [token, t.errorToken, t.errorVencido]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (signatureMode === "typed") {
      const url = typedSig ? buildTypedSignature(typedSig) : "";
      setSignatureDataUrl(url);
    }
  }, [signatureMode, typedSig]);

  const confirmRead = useCallback(async () => {
    if (confirmingRead) return;
    setConfirmingRead(true);
    try {
      const res = await fetch(`/api/documentacion/public/${token}/read`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirmado: true }),
      });
      const data = await safeJson(res);
      if (!data?.ok) throw new Error(data?.error || "Error");
      setRead(true);
      setStep("aceptar");
      toast({ title: "Lectura confirmada", description: "Continuá con las confirmaciones para finalizar." });
    } catch (e) {
      toast({
        title: "No se pudo confirmar la lectura",
        description: e?.message || "Error",
        variant: "destructive",
      });
    } finally {
      setConfirmingRead(false);
    }
  }, [token, confirmingRead]);

  const canSign = useMemo(() => {
    if (!read) return false;
    const requiresTerms = Boolean(String(docu?.legalHtml || "").trim());
    if ((requiresTerms && !aceptoTerminos) || !recibioMantenimiento || !conformeObra) return false;
    if (!nombreApellido.trim() || !identificacion.trim()) return false;
    if (!signatureDataUrl) return false;
    return true;
  }, [read, docu?.legalHtml, aceptoTerminos, recibioMantenimiento, conformeObra, nombreApellido, identificacion, signatureDataUrl]);

  const onSign = useCallback(async () => {
    if (!canSign) return;
    setSigning(true);
    try {
      const res = await fetch(`/api/documentacion/public/${token}/sign`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          confirmoLectura: true,
          aceptoTerminos: Boolean(String(docu?.legalHtml || "").trim()) ? aceptoTerminos : true,
          recibioMantenimiento,
          conformeObra,
          nombreApellido,
          identificacion,
          observaciones,
          signatureDataUrl,
        }),
      });
      const data = await safeJson(res);
      if (!data?.ok) throw new Error(data?.error || "Error");
      setStep("firmado");
      await load();
      toast({ title: "Firma registrada", description: "El documento quedó finalizado correctamente." });
    } catch (e) {
      toast({
        title: "No se pudo finalizar",
        description: e?.message || "Error",
        variant: "destructive",
      });
    } finally {
      setSigning(false);
    }
  }, [
    canSign,
    token,
    aceptoTerminos,
    docu?.legalHtml,
    recibioMantenimiento,
    conformeObra,
    nombreApellido,
    identificacion,
    observaciones,
    signatureDataUrl,
    load,
  ]);

  const onReject = useCallback(async () => {
    const obs = String(obsRechazo || "").trim();
    if (!obs) return;
    setRejecting(true);
    try {
      const res = await fetch(`/api/documentacion/public/${token}/reject`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ observaciones: obs }),
      });
      const data = await safeJson(res);
      if (!data?.ok) throw new Error(data?.error || "Error");
      await load();
      toast({ title: "Observaciones enviadas", description: "Nuestro equipo lo revisará." });
    } catch (e) {
      toast({
        title: "No se pudo enviar",
        description: e?.message || "Error",
        variant: "destructive",
      });
    } finally {
      setRejecting(false);
    }
  }, [token, obsRechazo, load]);

  if (loading) {
    return <PublicPageSkeleton />;
  }

  if (error) {
    return (
      <div className="min-h-screen bg-default-50 py-14">
        <div className="mx-auto max-w-3xl px-4">
          <Card className="border border-default-200">
            <CardHeader>
              <CardTitle>Documento</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-destructive">
                <AlertTriangle className="h-5 w-5 mt-0.5" />
                <div className="space-y-0.5">
                  <div className="font-semibold">No se pudo abrir el documento</div>
                  <div className="text-sm opacity-90">{error}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const docTitle = `${docu?.numero || ""}${docu?.titulo ? ` - ${docu.titulo}` : ""}`.trim() || t.titulo;
  const headerCliente = getDocClienteNombre(docu) || "-";
  const headerObra = getDocObraNumero(docu);

  return (
    <div className="min-h-screen bg-default-50 py-10">
      <div className="mx-auto max-w-3xl px-4 space-y-4">
        <div className="rounded-2xl bg-default-950 text-white p-5">
          <div className="text-xs font-semibold opacity-80">DOCUMENTACIÓN</div>
          <div className="mt-1 text-xl font-bold leading-tight">{docTitle}</div>
          <div className="mt-2 text-sm opacity-90">{t.encabezado}</div>
        </div>

        <Card className="border border-default-200">
          <CardHeader>
            <CardTitle>Documento</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 gap-2 text-sm text-default-700 md:grid-cols-2">
              <div className="rounded-md border border-default-200 bg-background p-3">
                <div className="text-xs text-default-500">Cliente</div>
                <div className="font-medium">{headerCliente}</div>
              </div>
              <div className="rounded-md border border-default-200 bg-background p-3">
                <div className="text-xs text-default-500">Obra</div>
                <div className="font-medium">{headerObra || ""}</div>
              </div>
            </div>

            <div className="rounded-xl border border-default-200 bg-background p-4">
              <div
                className="documentacion-html prose prose-sm max-w-none text-default-900"
                dangerouslySetInnerHTML={{ __html: docu?.contentHtml || "" }}
              />
              {docu?.legalHtml ? (
                <div className="mt-4 border-t border-default-200 pt-4">
                  <div
                    className="documentacion-html prose prose-sm max-w-none text-default-900"
                    dangerouslySetInnerHTML={{ __html: docu?.legalHtml || "" }}
                  />
                </div>
              ) : null}
            </div>

            <AnimatePresence mode="wait">
              {step === "leer" ? (
                <motion.div
                  key="leer"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.22 }}
                  className="space-y-3"
                >
                  <div className="flex items-start gap-3 rounded-xl border border-default-200 bg-background p-4">
                    <Checkbox checked={read} onCheckedChange={(v) => setRead(Boolean(v))} />
                    <div className="text-sm text-default-800">{t.confirmoLectura}</div>
                  </div>
                  <Button className="w-full" onClick={confirmRead} disabled={!read || confirmingRead}>
                    {confirmingRead ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Confirmando...
                      </>
                    ) : (
                      t.btnContinuar
                    )}
                  </Button>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </CardContent>
        </Card>

        <AnimatePresence mode="wait">
          {step === "aceptar" ? (
            <motion.div
              key="aceptar"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.22 }}
            >
              <Card className="border border-default-200">
                <CardHeader>
                  <CardTitle>Aceptación</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {String(docu?.legalHtml || "").trim() ? (
                    <div className="flex items-start gap-3 rounded-xl border border-default-200 bg-background p-4">
                      <Checkbox checked={aceptoTerminos} onCheckedChange={(v) => setAceptoTerminos(Boolean(v))} />
                      <div className="text-sm text-default-800">{t.aceptoTerminos}</div>
                    </div>
                  ) : null}
                  <div className="flex items-start gap-3 rounded-xl border border-default-200 bg-background p-4">
                    <Checkbox checked={recibioMantenimiento} onCheckedChange={(v) => setRecibioMantenimiento(Boolean(v))} />
                    <div className="text-sm text-default-800">{t.recibioMantenimiento}</div>
                  </div>
                  <div className="flex items-start gap-3 rounded-xl border border-default-200 bg-background p-4">
                    <Checkbox checked={conformeObra} onCheckedChange={(v) => setConformeObra(Boolean(v))} />
                    <div className="text-sm text-default-800">{t.conformeObra}</div>
                  </div>

                  <div className="rounded-xl border border-default-200 bg-background p-4 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-bold text-default-900">{t.firmaTitulo}</div>
                    </div>
                    <SignaturePad value={signatureDataUrl} onChange={setSignatureDataUrl} />
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="space-y-1">
                      <div className="text-sm font-medium text-default-700">{t.nombreApellido}</div>
                      <Input value={nombreApellido} onChange={(e) => setNombreApellido(e.target.value)} disabled={signing} />
                    </div>
                    <div className="space-y-1">
                      <div className="text-sm font-medium text-default-700">{t.identificacion}</div>
                      <Input value={identificacion} onChange={(e) => setIdentificacion(e.target.value)} disabled={signing} />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="text-sm font-medium text-default-700">{t.observaciones}</div>
                    <Textarea
                      value={observaciones}
                      onChange={(e) => setObservaciones(e.target.value)}
                      className="min-h-[120px]"
                      disabled={signing}
                    />
                  </div>

                  <Button className="w-full" onClick={onSign} disabled={!canSign || signing}>
                    {signing ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Finalizando...
                      </>
                    ) : (
                      "Finalizar"
                    )}
                  </Button>
                  <div className="text-xs text-default-500">{t.disclaimerLegal}</div>

              {/* <div className="rounded-xl border border-default-200 bg-background p-4 space-y-2">
                <div className="text-sm font-bold text-default-900">¿No está conforme?</div>
                <div className="text-sm text-default-700">
                  Puede dejar observaciones para que el equipo las revise antes de finalizar.
                </div>
                <Textarea
                  value={obsRechazo}
                  onChange={(e) => setObsRechazo(e.target.value)}
                  className="min-h-[100px]"
                  placeholder="Describa el motivo u observaciones"
                />
                <Button variant="outline" className="w-full" onClick={onReject} disabled={!obsRechazo.trim() || rejecting}>
                  {t.btnRechazar}
                </Button>
              </div> */}
                </CardContent>
              </Card>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          {step === "firmado" ? (
            <motion.div
              key="firmado"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.22 }}
            >
              <Card className="border border-default-200">
                <CardHeader>
                  <CardTitle>Firma registrada</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-start gap-3 rounded-xl border border-success/30 bg-success/10 p-4 text-success">
                    <CheckCircle2 className="h-5 w-5 mt-0.5" />
                    <div className="space-y-0.5">
                      <div className="font-bold">{t.gracias}</div>
                      <div className="text-sm opacity-90">Ya podés descargar el PDF firmado.</div>
                    </div>
                  </div>
                  <Button className="w-full" asChild>
                    <a href={`/api/documentacion/public/${token}/pdf`} target="_blank" rel="noreferrer">
                      {t.btnDescargar}
                    </a>
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}
