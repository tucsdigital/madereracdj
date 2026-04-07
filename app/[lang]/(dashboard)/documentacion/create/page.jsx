"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/use-toast";
import { useAuth } from "@/provider/auth.provider";
import { db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { buildContextFromDraft, buildContextFromObra, DEFAULT_RECIBO_TEMPLATE, renderTemplateHtml } from "@/lib/documentacion-variables";
import { useQuill } from "react-quilljs";
import "quill/dist/quill.snow.css";
import SelectorObraNumeroPedido from "@/components/obras/SelectorObraNumeroPedido";
import { Loader2 } from "lucide-react";

const safeJson = async (res) => {
  try {
    return await res.json();
  } catch {
    return null;
  }
};

export default function DocumentacionCreatePage() {
  const { lang } = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();

  const obraIdQuery = searchParams.get("obraId") || "";
  const [loading, setLoading] = useState(false);
  const templateId = "manual";
  const [includeLegal, setIncludeLegal] = useState(false);
  const [openObraSelector, setOpenObraSelector] = useState(false);
  const [fieldValues, setFieldValues] = useState({});
  const [editBody, setEditBody] = useState(false);
  const [bodyTouched, setBodyTouched] = useState(false);
  const [legalTouched, setLegalTouched] = useState(false);

  const [form, setForm] = useState({
    titulo: "RECIBO DE CONFORMIDAD Y MANTENIMIENTO",
    obraId: obraIdQuery,
    obra: null,
    cliente: null,
    ubicacion: null,
    contentHtml: "",
    legalHtml: "",
  });

  const ctx = useMemo(
    () =>
      buildContextFromDraft({
        obra: form.obra || null,
        cliente: form.cliente || null,
        ubicacion: form.ubicacion || null,
      }),
    [form.obra, form.cliente, form.ubicacion]
  );

  const loadObra = useCallback(async () => {
    const obraId = String(form.obraId || "").trim();
    if (!obraId) {
      setForm((p) => ({ ...p, obra: null, cliente: null, ubicacion: null }));
      return;
    }
    const snap = await getDoc(doc(db, "obras", obraId));
    if (!snap.exists()) throw new Error("Obra no encontrada");
    const obra = { id: snap.id, ...(snap.data() || {}) };
    const ctxObra = buildContextFromObra(obra);
    setForm((p) => ({
      ...p,
      obra,
      cliente: ctxObra.cliente,
      ubicacion: ctxObra.ubicacion,
    }));
  }, [form.obraId]);

  useEffect(() => {
    if (obraIdQuery) loadObra().catch(() => {});
  }, [obraIdQuery, loadObra]);

  const selectedTemplate = useMemo(() => {
    return {
      id: "manual",
      nombre: DEFAULT_RECIBO_TEMPLATE.nombre,
      version: 1,
      bodyHtml: DEFAULT_RECIBO_TEMPLATE.bodyHtml,
      legalHtml: DEFAULT_RECIBO_TEMPLATE.legalHtml,
      fields: DEFAULT_RECIBO_TEMPLATE.fields,
    };
  }, []);

  const templateFields = useMemo(() => {
    const f = selectedTemplate?.fields;
    return Array.isArray(f) ? f : [];
  }, [selectedTemplate]);

  const isTemplateDriven = templateFields.length > 0;

  useEffect(() => {
    if (!isTemplateDriven) return;
    setFieldValues((prev) => {
      const next = { ...prev };
      for (const field of templateFields) {
        const key = String(field?.key || "").trim();
        if (!key) continue;
        const current = next[key];
        if (typeof current === "string" && current.trim()) continue;
        const seeded = renderTemplateHtml(String(field?.defaultValue || ""), ctx);
        next[key] = seeded;
      }
      return next;
    });
  }, [isTemplateDriven, templateFields, ctx]);

  const { quillRef: bodyRef, quill: bodyQuill } = useQuill();
  const { quillRef: legalRef, quill: legalQuill } = useQuill();

  const renderedBodyHtml = useMemo(() => {
    if (!selectedTemplate?.bodyHtml) return "";
    const merged = { ...ctx, inputs: fieldValues || {} };
    return renderTemplateHtml(selectedTemplate.bodyHtml, merged);
  }, [selectedTemplate, ctx, fieldValues]);

  const bodyPreviewHtml = useMemo(() => {
    return bodyTouched ? String(form.contentHtml || "") : renderedBodyHtml;
  }, [bodyTouched, form.contentHtml, renderedBodyHtml]);

  const renderedLegalHtml = useMemo(() => {
    if (!selectedTemplate?.legalHtml) return "";
    const merged = { ...ctx, inputs: fieldValues || {} };
    return renderTemplateHtml(selectedTemplate.legalHtml, merged);
  }, [selectedTemplate, ctx, fieldValues]);

  useEffect(() => {
    if (!isTemplateDriven) return;
    if (!editBody) return;
    if (bodyTouched) return;
    if (!bodyQuill) return;
    const nextHtml = renderedBodyHtml || "";
    setForm((p) => ({ ...p, contentHtml: nextHtml }));
    const delta = bodyQuill.clipboard.convert(nextHtml);
    bodyQuill.setContents(delta, "silent");
    bodyQuill.setSelection(0, 0, "silent");
  }, [renderedBodyHtml, bodyQuill, isTemplateDriven, editBody, bodyTouched]);

  useEffect(() => {
    if (legalTouched) return;
    const nextHtml = renderedLegalHtml || "";
    setForm((p) => ({ ...p, legalHtml: nextHtml }));
    if (legalQuill) {
      const delta = legalQuill.clipboard.convert(nextHtml);
      legalQuill.setContents(delta, "silent");
      legalQuill.setSelection(0, 0, "silent");
    }
  }, [renderedLegalHtml, legalTouched, legalQuill]);

  useEffect(() => {
    if (!bodyQuill) return;
    bodyQuill.enable(!isTemplateDriven || editBody);
    const handler = (_delta, _oldDelta, source) => {
      if (isTemplateDriven && source === "user") setBodyTouched(true);
      setForm((p) => ({ ...p, contentHtml: bodyQuill.root.innerHTML }));
    };
    bodyQuill.on("text-change", handler);
    return () => {
      bodyQuill.off("text-change", handler);
    };
  }, [bodyQuill, isTemplateDriven, editBody]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!legalQuill) return;
    legalQuill.enable(includeLegal);
    const html = form.legalHtml || "";
    const delta = legalQuill.clipboard.convert(html);
    legalQuill.setContents(delta, "silent");
    legalQuill.setSelection(0, 0, "silent");
    const handler = (_delta, _oldDelta, source) => {
      if (source === "user") setLegalTouched(true);
      setForm((p) => ({ ...p, legalHtml: legalQuill.root.innerHTML }));
    };
    legalQuill.on("text-change", handler);
    return () => {
      legalQuill.off("text-change", handler);
    };
  }, [legalQuill, includeLegal]); // eslint-disable-line react-hooks/exhaustive-deps

  const onCreate = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await user.getIdToken();
      if (isTemplateDriven) {
        const missing = templateFields
          .filter((f) => f?.required)
          .filter((f) => !String(fieldValues?.[f.key] || "").trim())
          .map((f) => f.label || f.key);
        if (missing.length) {
          toast({
            title: "Faltan datos",
            description: `Completá: ${missing.join(", ")}`,
            variant: "destructive",
          });
          return;
        }
      }

      const finalContentHtml = isTemplateDriven ? (bodyTouched ? form.contentHtml : renderedBodyHtml) : form.contentHtml;
      const finalLegalHtml = includeLegal ? form.legalHtml : "";
      const res = await fetch("/api/documentacion/documents", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          titulo: form.titulo,
          obra: form.obra
            ? {
                id: form.obra.id,
                numeroPedido: form.obra.numeroPedido || form.obra.numero || "",
                tipo: form.obra.tipo || "",
              }
            : null,
          cliente: form.cliente
            ? {
                id: form.cliente.id || form.obra?.clienteId || "",
                ...form.cliente,
              }
            : null,
          ubicacion: form.ubicacion || null,
          template: null,
          inputs: isTemplateDriven ? fieldValues || {} : null,
          contentHtml: finalContentHtml,
          legalHtml: finalLegalHtml,
        }),
      });
      const data = await safeJson(res);
      if (!data?.ok) throw new Error(data?.error || "Error");
      toast({ title: "Documento creado" });
      router.push(`/${lang}/documentacion/${data.id}`);
    } catch (e) {
      toast({
        title: "No se pudo crear el documento",
        description: e?.message || "Error",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [
    user,
    isTemplateDriven,
    templateFields,
    fieldValues,
    renderedBodyHtml,
    renderedLegalHtml,
    includeLegal,
    editBody,
    bodyTouched,
    form,
    router,
    lang,
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-2xl font-bold text-default-900">Nuevo documento</div>
          <div className="text-sm text-default-600">Creación manual o vinculada a una obra para autocompletar datos.</div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <Link href={`/${lang}/documentacion`}>Volver</Link>
          </Button>
          <Button onClick={onCreate} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creando...
              </>
            ) : (
              "Crear documento"
            )}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-1">
          <Card className="border border-default-200 h-fit self-start">
            <CardHeader>
              <CardTitle>Datos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {templateId === "manual" ? (
                <div className="space-y-1">
                  <div className="text-sm font-medium text-default-700">Título</div>
                  <Input value={form.titulo} onChange={(e) => setForm((p) => ({ ...p, titulo: e.target.value }))} />
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="text-sm font-medium text-default-700">Título</div>
                  <Input value={selectedTemplate?.nombre || form.titulo} readOnly />
                </div>
              )}
              <div className="space-y-2">
                <div className="text-sm font-medium text-default-700">Por Nº de Obra</div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" onClick={() => setOpenObraSelector(true)}>
                    Buscar obra
                  </Button>
                  {form.obra?.numeroPedido ? (
                    <div className="text-sm text-default-700">Seleccionada: {form.obra.numeroPedido}</div>
                  ) : (
                    <div className="text-xs text-default-500">Opcional. Si se indica, se autocompletan datos.</div>
                  )}
                </div>
                <SelectorObraNumeroPedido
                  open={openObraSelector}
                  onClose={() => setOpenObraSelector(false)}
                  obraActual={form.obra || null}
                  onObraSeleccionada={(obraSel) => {
                    const ctxObra = buildContextFromObra(obraSel);
                    setForm((p) => ({
                      ...p,
                      obraId: obraSel.id,
                      obra: obraSel,
                      cliente: ctxObra.cliente,
                      ubicacion: ctxObra.ubicacion,
                    }));
                  }}
                />
              </div>
            </CardContent>
          </Card>

          <Card className="border border-default-200 h-fit self-start">
            <CardHeader>
              <CardTitle>Términos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-medium text-default-700">Términos y condiciones</div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={includeLegal}
                        onCheckedChange={(v) => {
                          const next = Boolean(v);
                          setIncludeLegal(next);
                        }}
                      />
                      <div className="text-xs text-default-600">Incluir</div>
                    </div>
                  </div>
                </div>
              <div className={includeLegal ? "" : "pointer-events-none opacity-60"}>
                <div className="snow-editor border border-border min-h-[160px]" ref={legalRef}></div>
              </div>
                {!includeLegal ? <div className="text-xs text-default-500">Desactivado (no se incluirá en el documento).</div> : null}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="border border-default-200 xl:col-span-2">
          <CardHeader>
            <CardTitle>Contenido</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {isTemplateDriven ? (
              <div className="space-y-3">
                <div className="text-sm font-medium text-default-700">Completar datos</div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {templateFields.map((f) => {
                    const key = String(f?.key || "").trim();
                    if (!key) return null;
                    const kind = String(f?.kind || "text");
                    const value = String(fieldValues?.[key] ?? "");
                    const commonProps = {
                      value,
                      onChange: (e) =>
                        setFieldValues((p) => ({
                          ...p,
                          [key]: e.target.value,
                        })),
                    };

                    return (
                      <div key={key} className={kind === "textarea" ? "md:col-span-2 space-y-1" : "space-y-1"}>
                        <div className="text-sm font-medium text-default-700">
                          {f?.label || key}
                          {f?.required ? <span className="text-red-600"> *</span> : null}
                        </div>
                        {kind === "textarea" ? (
                          <Textarea className="min-h-[120px]" {...commonProps} />
                        ) : kind === "select" ? (
                          <Select
                            value={value}
                            onValueChange={(v) =>
                              setFieldValues((p) => ({
                                ...p,
                                [key]: v,
                              }))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Seleccionar" />
                            </SelectTrigger>
                            <SelectContent>
                              {(Array.isArray(f?.options) ? f.options : []).map((opt, i) => (
                                <SelectItem key={`${key}-opt-${i}`} value={String(opt)}>
                                  {String(opt)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : kind === "date" ? (
                          <Input type="text" placeholder="dd/mm/aaaa" inputMode="numeric" {...commonProps} />
                        ) : (
                          <Input type="text" {...commonProps} />
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-medium text-default-700">Documento (previsualización)</div>
                    <div className="flex items-center gap-2">
                      <Switch checked={editBody} onCheckedChange={(v) => setEditBody(Boolean(v))} />
                      <div className="text-xs text-default-600">Editar</div>
                    </div>
                  </div>
                  <div className="relative min-h-[260px]">
                    <div className={editBody ? "" : "absolute inset-0 opacity-0 pointer-events-none"}>
                      <div className="snow-editor border border-border min-h-[260px]" ref={bodyRef}></div>
                    </div>
                    {!editBody ? (
                      <div className="rounded-md border border-default-200 p-4 bg-background">
                        <div className="prose prose-sm max-w-none text-default-900" dangerouslySetInnerHTML={{ __html: bodyPreviewHtml }} />
                      </div>
                    ) : null}
                  </div>
                  {!editBody ? <div className="text-xs text-default-500">Desactivado (solo lectura).</div> : null}
                </div>
              </div>
            ) : null}

            {!isTemplateDriven ? (
              <div className="space-y-1">
                <div className="text-sm font-medium text-default-700">Documento</div>
                <div className="snow-editor border border-border min-h-[260px]" ref={bodyRef}></div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
