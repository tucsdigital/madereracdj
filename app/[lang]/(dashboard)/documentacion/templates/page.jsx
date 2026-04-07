"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/use-toast";
import { useAuth } from "@/provider/auth.provider";
import { DEFAULT_RECIBO_TEMPLATE, DEFAULT_VARIABLES } from "@/lib/documentacion-variables";
import { useQuill } from "react-quilljs";
import "quill/dist/quill.snow.css";
import { Plus, Trash2, Loader2 } from "lucide-react";

const safeJson = async (res) => {
  try {
    return await res.json();
  } catch {
    return null;
  }
};

const labelForVariable = (key) => {
  const k = String(key || "").trim();
  if (!k) return "";
  const [root, prop] = k.split(".");
  const rootLabel =
    root === "cliente"
      ? "Cliente"
      : root === "obra"
        ? "Obra"
        : root === "ubicacion"
          ? "Ubicación"
          : root === "empresa"
            ? "Empresa"
            : root === "ahora"
              ? "Ahora"
              : root;
  const propLabel =
    prop === "numeroPedido"
      ? "N° de pedido"
      : prop === "cuit"
        ? "CUIT"
        : prop === "fechaAr"
          ? "Fecha (dd/mm/aaaa)"
          : prop === "fecha"
            ? "Fecha"
            : prop === "telefono"
              ? "Teléfono"
              : prop === "direccion"
                ? "Dirección"
                : prop === "localidad"
                  ? "Localidad"
                  : prop === "provincia"
                    ? "Provincia"
                    : prop === "partido"
                      ? "Partido"
                      : prop === "web"
                        ? "Web"
                        : prop === "instagram"
                          ? "Instagram"
                          : prop === "descripcion"
                            ? "Descripción"
                            : prop === "hora"
                              ? "Hora"
                              : prop
                                ? prop.charAt(0).toUpperCase() + prop.slice(1)
                                : "";
  return propLabel ? `${rootLabel}: ${propLabel}` : rootLabel;
};

const insertPlaceholderIntoQuill = (quill, placeholder) => {
  if (!quill) return;
  const text = String(placeholder || "");
  if (!text) return;
  const range = quill.getSelection(true);
  const index = range?.index ?? quill.getLength();
  quill.insertText(index, text, "user");
  quill.setSelection(index + text.length, 0, "silent");
};

export default function DocumentacionTemplatesPage() {
  const { lang } = useParams();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(null);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    nombre: "",
    bodyHtml: "",
    legalHtml: "",
    fields: [],
  });

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/documentacion/templates", {
        headers: { authorization: `Bearer ${token}` },
      });
      const data = await safeJson(res);
      if (!data?.ok) throw new Error(data?.error || "Error");
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (e) {
      toast({
        title: "No se pudieron cargar las plantillas",
        description: e?.message || "Error",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const onNew = () => {
    setEditing(null);
    setStep(1);
    setForm({
      nombre: DEFAULT_RECIBO_TEMPLATE.nombre,
      bodyHtml: DEFAULT_RECIBO_TEMPLATE.bodyHtml,
      legalHtml: DEFAULT_RECIBO_TEMPLATE.legalHtml,
      fields: DEFAULT_RECIBO_TEMPLATE.fields,
    });
    setOpen(true);
  };

  const onEdit = (it) => {
    setEditing(it);
    setStep(1);
    setForm({
      nombre: it?.nombre || "",
      bodyHtml: it?.bodyHtml || "",
      legalHtml: it?.legalHtml || "",
      fields: Array.isArray(it?.fields) ? it.fields : [],
    });
    setOpen(true);
  };

  const onSave = useCallback(async () => {
    if (!user) return;
    setSaving(true);
    try {
      const token = await user.getIdToken();
      const url = editing ? `/api/documentacion/templates/${editing.id}` : "/api/documentacion/templates";
      const method = editing ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({
          nombre: form.nombre,
          descripcion: "",
          bodyHtml: form.bodyHtml,
          legalHtml: form.legalHtml,
          fields: Array.isArray(form.fields) ? form.fields : [],
          variables: DEFAULT_VARIABLES,
        }),
      });
      const data = await safeJson(res);
      if (!data?.ok) throw new Error(data?.error || "Error");
      setOpen(false);
      await load();
      toast({ title: editing ? "Plantilla actualizada" : "Plantilla creada" });
    } catch (e) {
      toast({
        title: "No se pudo guardar la plantilla",
        description: e?.message || "Error",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }, [user, editing, form, load]);

  const onArchive = useCallback(
    async (it) => {
      if (!user) return;
      try {
        const token = await user.getIdToken();
        const res = await fetch(`/api/documentacion/templates/${it.id}`, {
          method: "DELETE",
          headers: { authorization: `Bearer ${token}` },
        });
        const data = await safeJson(res);
        if (!data?.ok) throw new Error(data?.error || "Error");
        await load();
        toast({ title: "Plantilla archivada" });
      } catch (e) {
        toast({
          title: "No se pudo archivar la plantilla",
          description: e?.message || "Error",
          variant: "destructive",
        });
      }
    },
    [user, load]
  );

  const { quillRef: bodyRef, quill: bodyQuill } = useQuill();
  const { quillRef: legalRef, quill: legalQuill } = useQuill();

  const variableChoices = useMemo(() => {
    const vars = Array.from(new Set([...(DEFAULT_VARIABLES || []), "ahora.fechaAr"].filter(Boolean)));
    return vars.map((v) => ({ value: v, label: labelForVariable(v) }));
  }, []);

  useEffect(() => {
    if (!open) return;
    if (!bodyQuill) return;
    const current = String(bodyQuill.root?.innerHTML || "");
    const next = String(form.bodyHtml || "");
    if (current !== next) bodyQuill.clipboard.dangerouslyPasteHTML(next);
    const handler = () => setForm((p) => ({ ...p, bodyHtml: bodyQuill.root.innerHTML }));
    bodyQuill.on("text-change", handler);
    return () => {
      bodyQuill.off("text-change", handler);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, bodyQuill]);

  useEffect(() => {
    if (!open) return;
    if (!legalQuill) return;
    const current = String(legalQuill.root?.innerHTML || "");
    const next = String(form.legalHtml || "");
    if (current !== next) legalQuill.clipboard.dangerouslyPasteHTML(next);
    const handler = () => setForm((p) => ({ ...p, legalHtml: legalQuill.root.innerHTML }));
    legalQuill.on("text-change", handler);
    return () => {
      legalQuill.off("text-change", handler);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, legalQuill]);

  const addField = useCallback(() => {
    setForm((p) => {
      const next = Array.isArray(p.fields) ? [...p.fields] : [];
      const idx = next.length + 1;
      next.push({
        key: `campo${idx}`,
        label: `Campo ${idx}`,
        kind: "text",
        required: false,
        defaultValue: "",
        options: [],
      });
      return { ...p, fields: next };
    });
  }, []);

  const updateField = useCallback((index, patch) => {
    setForm((p) => {
      const next = Array.isArray(p.fields) ? [...p.fields] : [];
      const cur = next[index] || {};
      const merged = { ...cur, ...patch };
      if (String(merged?.kind || "") === "select" && !Array.isArray(merged.options)) merged.options = [];
      next[index] = merged;
      return { ...p, fields: next };
    });
  }, []);

  const removeField = useCallback((index) => {
    setForm((p) => {
      const next = Array.isArray(p.fields) ? [...p.fields] : [];
      next.splice(index, 1);
      return { ...p, fields: next };
    });
  }, []);

  const fieldChoices = useMemo(() => {
    const fields = Array.isArray(form.fields) ? form.fields : [];
    return fields
      .map((f) => ({
        key: String(f?.key || "").trim(),
        label: String(f?.label || f?.key || "").trim(),
      }))
      .filter((f) => f.key);
  }, [form.fields]);

  const insertFieldPlaceholder = useCallback(
    (fieldKey) => {
      if (!bodyQuill) return;
      const key = String(fieldKey || "").trim();
      if (!key) return;
      insertPlaceholderIntoQuill(bodyQuill, `{{inputs.${key}}}`);
    },
    [bodyQuill]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-2xl font-bold text-default-900">Plantillas</div>
          <div className="text-sm text-default-600">Reutilizables, con variables dinámicas y versionado.</div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <Link href={`/${lang}/documentacion`}>Volver</Link>
          </Button>
          <Button onClick={onNew}>Nueva plantilla</Button>
        </div>
      </div>

      <Card className="border border-default-200">
        <CardHeader>
          <CardTitle>Listado</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Versión</TableHead>
                <TableHead>Actualización</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={`sk-${i}`}>
                    <TableCell>
                      <Skeleton className="h-4 w-[220px]" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-6 w-16 rounded-full" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-32" />
                    </TableCell>
                    <TableCell className="text-right">
                      <Skeleton className="ml-auto h-9 w-28" />
                    </TableCell>
                  </TableRow>
                ))
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-10 text-center text-default-500">
                    No hay plantillas.
                  </TableCell>
                </TableRow>
              ) : (
                items.map((it) => (
                  <TableRow key={it.id}>
                    <TableCell className="font-medium">{it.nombre}</TableCell>
                    <TableCell>
                      <Badge color="secondary" variant="outline">
                        v{it.version || 1}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-default-600">{it.updatedAt || "-"}</TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button size="sm" variant="outline" onClick={() => onEdit(it)}>
                        Editar
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => onArchive(it)}>
                        Archivar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[95vw] max-w-4xl max-h-[90vh] overflow-hidden flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-default-200">
            <DialogTitle>{editing ? "Editar plantilla" : "Nueva plantilla"}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <div className="text-sm font-medium text-default-700">Nombre</div>
                <Input value={form.nombre} onChange={(e) => setForm((p) => ({ ...p, nombre: e.target.value }))} />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant={step === 1 ? "default" : "outline"} onClick={() => setStep(1)}>
                1. Inputs
              </Button>
              <Button
                size="sm"
                variant={step === 2 ? "default" : "outline"}
                onClick={() => setStep(2)}
              >
                2. Contenido
              </Button>
              <Button size="sm" variant={step === 3 ? "default" : "outline"} onClick={() => setStep(3)}>
                3. Términos
              </Button>
              {step === 2 && (Array.isArray(form.fields) ? form.fields : []).length === 0 ? (
                <div className="text-xs text-default-500">Podés escribir el contenido igual; si agregás inputs, aparecen para insertar.</div>
              ) : null}
            </div>

            {step === 1 ? (
            <div className="rounded-md border border-default-200 p-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-medium text-default-800">Campos del formulario</div>
                  <div className="text-xs text-default-500">Estos datos se completan al crear un documento con esta plantilla.</div>
                </div>
                <Button size="sm" variant="outline" onClick={addField}>
                  <Plus className="h-4 w-4 mr-2" />
                  Agregar campo
                </Button>
              </div>
              <div className="mt-3 space-y-3">
                {(Array.isArray(form.fields) ? form.fields : []).length === 0 ? (
                  <div className="text-sm text-default-500">Sin campos.</div>
                ) : (
                  (form.fields || []).map((f, idx) => (
                    <div key={`${f?.key || "field"}-${idx}`} className="rounded-md border border-default-200 p-3">
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <div className="space-y-1">
                          <div className="text-xs font-medium text-default-700">Etiqueta</div>
                          <Input
                            value={f?.label || ""}
                            onChange={(e) => updateField(idx, { label: e.target.value })}
                          />
                        </div>
                        <div className="space-y-1">
                          <div className="text-xs font-medium text-default-700">Clave</div>
                          <Input value={f?.key || ""} onChange={(e) => updateField(idx, { key: e.target.value })} />
                        </div>
                        <div className="space-y-1">
                          <div className="text-xs font-medium text-default-700">Tipo</div>
                          <Select value={String(f?.kind || "text")} onValueChange={(v) => updateField(idx, { kind: v })}>
                            <SelectTrigger>
                              <SelectValue placeholder="Seleccionar" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="text">Texto</SelectItem>
                              <SelectItem value="textarea">Texto largo</SelectItem>
                              <SelectItem value="date">Fecha</SelectItem>
                              <SelectItem value="select">Selección</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <div className="text-xs font-medium text-default-700">Requerido</div>
                          <div className="flex items-center justify-between rounded-md border border-default-200 px-3 py-2">
                            <div className="text-sm text-default-700">Requerido</div>
                            <Checkbox checked={Boolean(f?.required)} onCheckedChange={(v) => updateField(idx, { required: Boolean(v) })} />
                          </div>
                        </div>
                        <div className="space-y-1 md:col-span-2">
                          <div className="text-xs font-medium text-default-700">Valor por defecto (opcional)</div>
                          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                            <Select
                              value=""
                              onValueChange={(v) => updateField(idx, { defaultValue: v ? `{{${v}}}` : "" })}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Autocompletar desde..." />
                              </SelectTrigger>
                              <SelectContent>
                                {variableChoices.map((v) => (
                                  <SelectItem key={v.value} value={v.value}>
                                    {v.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {String(f?.kind || "text") === "textarea" ? (
                              <Textarea
                                value={f?.defaultValue || ""}
                                onChange={(e) => updateField(idx, { defaultValue: e.target.value })}
                                placeholder="Texto libre (opcional)"
                                className="min-h-[90px]"
                              />
                            ) : (
                              <Input
                                value={f?.defaultValue || ""}
                                onChange={(e) => updateField(idx, { defaultValue: e.target.value })}
                                placeholder="Texto libre (opcional)"
                              />
                            )}
                          </div>
                        </div>

                        {String(f?.kind || "text") === "select" ? (
                          <div className="space-y-2 md:col-span-2">
                            <div className="text-xs font-medium text-default-700">Opciones de la selección</div>
                            <div className="flex items-center gap-2">
                              <Input
                                value={String(f?.newOption || "")}
                                onChange={(e) => updateField(idx, { newOption: e.target.value })}
                                placeholder="Agregar opción..."
                              />
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  const opt = String(f?.newOption || "").trim();
                                  if (!opt) return;
                                  const options = Array.isArray(f?.options) ? f.options : [];
                                  updateField(idx, { options: Array.from(new Set([...options, opt])), newOption: "" });
                                }}
                                disabled={!String(f?.newOption || "").trim()}
                              >
                                <Plus className="h-4 w-4" />
                              </Button>
                            </div>
                            {Array.isArray(f?.options) && f.options.length > 0 ? (
                              <div className="flex flex-wrap gap-2">
                                {f.options.map((opt, optIdx) => (
                                  <Badge key={`${opt}-${optIdx}`} variant="outline" className="flex items-center gap-2">
                                    {opt}
                                    <Trash2
                                      className="h-3 w-3 cursor-pointer"
                                      onClick={() => {
                                        const options = Array.isArray(f?.options) ? f.options : [];
                                        const next = options.filter((_, i) => i !== optIdx);
                                        updateField(idx, { options: next });
                                      }}
                                    />
                                  </Badge>
                                ))}
                              </div>
                            ) : (
                              <div className="text-xs text-default-500">Sin opciones.</div>
                            )}
                          </div>
                        ) : null}
                      </div>
                      <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                        <Button size="sm" variant="outline" onClick={() => removeField(idx)}>
                          <Trash2 className="h-4 w-4 mr-2" />
                          Eliminar
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
              {(Array.isArray(form.fields) ? form.fields : []).length > 0 ? (
                <div className="mt-3 flex justify-end">
                  <Button size="sm" onClick={() => setStep(2)}>
                    Continuar a Contenido
                  </Button>
                </div>
              ) : null}
            </div>
            ) : null}

            {step === 2 ? (
              <div className="space-y-2">
                <div className="text-sm font-medium text-default-700">Contenido (Documento)</div>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                  <Select value="" onValueChange={(v) => insertFieldPlaceholder(v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Insertar input..." />
                    </SelectTrigger>
                    <SelectContent>
                      {fieldChoices.map((f) => (
                        <SelectItem key={`in-${f.key}`} value={f.key}>
                          {f.label || f.key}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value="" onValueChange={(v) => insertPlaceholderIntoQuill(bodyQuill, `{{${v}}}`)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Insertar variable..." />
                    </SelectTrigger>
                    <SelectContent>
                      {variableChoices.map((v) => (
                        <SelectItem key={v.value} value={v.value}>
                          {v.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="text-xs text-default-500 flex items-center">
                    Escribí el documento y usá inputs/variables como placeholders.
                  </div>
                </div>
                <div className="snow-editor border border-border min-h-[320px]" ref={bodyRef}></div>
              </div>
            ) : null}

            {step === 3 ? (
              <div className="space-y-2">
                <div className="text-sm font-medium text-default-700">Términos y condiciones (opcional)</div>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  <Select value="" onValueChange={(v) => insertPlaceholderIntoQuill(legalQuill, `{{${v}}}`)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Insertar variable..." />
                    </SelectTrigger>
                    <SelectContent>
                      {variableChoices.map((v) => (
                        <SelectItem key={v.value} value={v.value}>
                          {v.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="text-xs text-default-500 flex items-center">Opcional. Se puede incluir o no al crear el documento.</div>
                </div>
                <div className="snow-editor border border-border min-h-[220px]" ref={legalRef}></div>
              </div>
            ) : null}
          </div>
          <DialogFooter className="px-6 py-4 border-t border-default-200">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={onSave} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Guardando...
                </>
              ) : (
                "Guardar"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
