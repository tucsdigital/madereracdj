"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Check, ImagePlus, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { Btn } from "@/components/tienda-web/ui";
import { cn } from "@/lib/utils";

const uid = (prefix) => `${prefix}-${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36)}`;
const slugify = (value) => String(value || "obra").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "nueva-obra";

function newProject() {
  const title = "Nueva obra";
  const slug = `nueva-obra-${Date.now().toString(36)}`;
  return {
    slug,
    title,
    category: "Construcción",
    status: "inactive",
    seo: { title: `${title} - Maderas Caballero`, description: "Conocé nuestros trabajos y soluciones en madera.", keywords: [], ogImage: "", canonical: `/obras/${slug}` },
    banner: { id: uid("banner"), autoplayInterval: 6000, showControls: true, showIndicators: true, slides: [{ id: uid("slide"), title, subtitle: "Diseño y construcción a medida", description: "Soluciones en madera pensadas para cada proyecto.", backgroundImage: "", ctaText: "Ver trabajos", ctaUrl: "#gallery", secondaryCtaText: "Solicitar presupuesto", secondaryCtaUrl: "#contact", overlayOpacity: 0.5 }] },
    info: { id: uid("info"), title, description: "", features: [], images: [] },
    services: [],
    gallery: { id: uid("gallery"), title: `Galería de ${title}`, description: "", categories: [], items: [] },
    testimonials: [],
    faqs: [],
    contact: { id: uid("contact"), title: "Hablemos de tu proyecto", description: "", phone: "", email: "", whatsapp: "", address: "", workingHours: [], socialLinks: [] },
    pageContent: { options: { eyebrow: "Materiales", title: "Elegí los materiales", description: "", consultationLabel: "Consultar", consultationHref: "#contact", items: [] }, accessories: { eyebrow: "Adicionales", title: "Completá tu proyecto", description: "", contentEyebrow: "Opciones", items: [] }, services: { enabled: true, eyebrow: "Servicios", title: "Nuestros servicios", description: "Soluciones completas para llevar tu proyecto a la realidad." } },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function Card({ title, description, children, action }) {
  return <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
    <div className="mb-4 flex items-start justify-between gap-3">
      <div><h3 className="text-sm font-semibold">{title}</h3>{description ? <p className="mt-1 text-xs leading-5 text-default-500">{description}</p> : null}</div>
      {action}
    </div>
    {children}
  </section>;
}

function Field({ label, value, onChange, multiline = false, type = "text", placeholder = "", disabled = false }) {
  const common = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition placeholder:text-default-400 focus:border-primary focus:ring-2 focus:ring-primary/10";
  return <label className="block min-w-0 space-y-1.5">
    <span className="text-xs font-medium text-default-600">{label}</span>
    {multiline ? <textarea disabled={disabled} className={cn(common, "min-h-20 resize-y disabled:cursor-not-allowed disabled:bg-default-50 disabled:text-default-500")} value={value ?? ""} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
      : <input disabled={disabled} className={cn(common, "disabled:cursor-not-allowed disabled:bg-default-50 disabled:text-default-500")} type={type} value={value ?? ""} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />}
  </label>;
}

function ImageField({ label, value, onChange, uploadImage, multiline = false }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const upload = async (file) => {
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const item = await uploadImage(file, "obras");
      onChange(multiline ? [...String(value || "").split("\n").filter(Boolean), item.url].join("\n") : item.url);
    } catch (cause) {
      setError(cause?.message || "No se pudo subir la imagen a R2.");
    } finally {
      setUploading(false);
    }
  };
  return <div className="min-w-0 space-y-1.5">
    <span className="text-xs font-medium text-default-600">{label}</span>
    <div className="flex min-w-0 gap-2">
      {multiline ? <textarea aria-label={label} className="min-h-20 min-w-0 flex-1 resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" value={value || ""} placeholder="Una URL de imagen por línea" onChange={(event) => onChange(event.target.value)} /> : <input aria-label={label} className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" value={value || ""} placeholder="URL de R2 o imagen existente" onChange={(event) => onChange(event.target.value)} />}
      <label className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium text-default-600 transition hover:bg-default-50">
        {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
        <span className="hidden sm:inline">Subir a R2</span>
        <input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,image/avif" disabled={uploading} onChange={(event) => { void upload(event.target.files?.[0]); event.target.value = ""; }} />
      </label>
    </div>
    {value ? <div className="flex items-center gap-2 truncate text-[11px] text-default-500"><Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" /><span className="truncate">{value}</span></div> : null}
    {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
  </div>;
}

function ListEditor({ title, items, onAdd, children }) {
  return <Card title={title} action={<Btn size="sm" variant="outline" onClick={onAdd}><Plus className="h-3.5 w-3.5" />Agregar</Btn>}>
    {items.length ? <div className="space-y-3">{items.map((item, index) => <div key={item.id || index} className="relative rounded-lg border border-border/70 bg-background p-3 pr-11">{children(item, index)}<button type="button" aria-label={`Quitar elemento ${index + 1}`} onClick={() => onAdd(index, true)} className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-md text-default-400 transition hover:bg-red-50 hover:text-destructive"><Trash2 className="h-4 w-4" /></button></div>)}</div>
      : <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-xs text-default-500">Todavía no hay elementos.</p>}
  </Card>;
}

export default function ObrasManager({ authFetch, uploadImage, tiendaUrl }) {
  const [items, setItems] = useState([]);
  const [selectedSlug, setSelectedSlug] = useState("");
  const [draft, setDraft] = useState(null);
  const [version, setVersion] = useState(0);
  const [published, setPublished] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);
  const [section, setSection] = useState("general");

  const load = useCallback(async (preferredSlug) => {
    setLoading(true);
    try {
      const data = await authFetch("/api/tienda/obras/admin");
      const next = data.items || [];
      setItems(next);
      const slug = preferredSlug || next[0]?.id || "";
      const entry = next.find((item) => item.id === slug);
      setSelectedSlug(slug);
      setDraft(entry?.project || null);
      setVersion(Number(entry?.version) || 0);
      setPublished(Boolean(entry?.published?.status === "active"));
    } catch (error) {
      setNotice({ type: "error", text: error.message });
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => { void load(); }, [load]);

  const setPath = (path, value) => setDraft((current) => {
    const next = structuredClone(current);
    let target = next;
    for (let index = 0; index < path.length - 1; index += 1) target = target[path[index]] = { ...target[path[index]] };
    target[path[path.length - 1]] = value;
    return next;
  });
  const setEntry = (path, index, patch) => setDraft((current) => {
    const next = structuredClone(current);
    const list = path.reduce((object, key) => object?.[key], next);
    list[index] = typeof patch === "function" ? patch(list[index]) : { ...list[index], ...patch };
    return next;
  });
  const addEntry = (path, seed) => setDraft((current) => {
    const next = structuredClone(current);
    const list = path.reduce((object, key) => object[key], next);
    list.push(seed);
    return next;
  });
  const removeEntry = (path, index) => setDraft((current) => {
    const next = structuredClone(current);
    const list = path.reduce((object, key) => object[key], next);
    list.splice(index, 1);
    return next;
  });

  const startNew = () => {
    const project = newProject();
    setItems((current) => [{ id: project.slug, project, draft: project, version: 0 }, ...current]);
    setSelectedSlug(project.slug);
    setDraft(project);
    setVersion(0);
    setPublished(false);
    setSection("general");
    setNotice(null);
  };

  const saveDraft = async () => {
    if (!draft) return;
    setSaving(true);
    setNotice(null);
    const nextSlug = version === 0 ? slugify(draft.slug || draft.title) : selectedSlug;
    try {
      const result = await authFetch(`/api/tienda/obras/admin/${encodeURIComponent(nextSlug)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project: { ...draft, slug: nextSlug }, baseVersion: version }),
      });
      setSelectedSlug(nextSlug);
      setDraft(result.project);
      setVersion(result.version);
      setItems((current) => {
        const without = current.filter((item) => item.id !== nextSlug);
        return [{ ...(current.find((item) => item.id === nextSlug) || {}), id: nextSlug, slug: nextSlug, project: result.project, draft: result.project, version: result.version, published: current.find((item) => item.id === nextSlug)?.published || null }, ...without];
      });
      setNotice({ type: "ok", text: "Borrador guardado. Todavía no se muestra en la tienda." });
    } catch (error) {
      setNotice({ type: "error", text: error.data?.issues?.join(" · ") || error.message });
    } finally {
      setSaving(false);
    }
  };

  const publish = async () => {
    if (!draft || version === 0) {
      setNotice({ type: "error", text: "Guardá el borrador antes de publicarlo." });
      return;
    }
    setSaving(true);
    setNotice(null);
    try {
      const result = await authFetch(`/api/tienda/obras/admin/${encodeURIComponent(selectedSlug)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseVersion: version }),
      });
      setVersion(result.version);
      setDraft(result.project);
      setPublished(result.published);
      setItems((current) => current.map((item) => item.id === selectedSlug ? { ...item, project: result.project, draft: result.project, published: result.project, version: result.version, publishedVersion: version } : item));
      setNotice({ type: "ok", text: result.published ? "Obra publicada. La tienda la mostrará en breve." : "Cambios publicados; la obra permanece desactivada." });
    } catch (error) {
      setNotice({ type: "error", text: error.data?.issues?.join(" · ") || error.message });
    } finally {
      setSaving(false);
    }
  };

  const sections = useMemo(() => [
    ["general", "General y SEO"], ["materiales", "Materiales"], ["adicionales", "Adicionales"], ["servicios", "Servicios"], ["galeria", "Galería y reseñas"], ["faq", "Preguntas frecuentes"], ["contacto", "Contacto"],
  ], []);

  if (loading) return <div className="flex min-h-48 items-center justify-center text-sm text-default-500"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Cargando obras…</div>;

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-base font-semibold">Obras</h2><p className="mt-1 text-sm text-default-500">Administrá páginas, materiales e imágenes de cada obra desde un solo lugar.</p></div>
      <div className="flex items-center gap-2">
        {draft && published && tiendaUrl ? <a href={`${tiendaUrl.replace(/\/$/, "")}/obras/${selectedSlug}`} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-medium text-default-600 hover:bg-default-100">Ver publicada <ArrowUpRight className="h-3.5 w-3.5" /></a> : null}
        <Btn variant="primary" onClick={startNew}><Plus className="h-4 w-4" />Nueva obra</Btn>
      </div>
    </div>

    {notice ? <div role="status" className={cn("flex items-start justify-between gap-3 rounded-lg px-4 py-3 text-sm", notice.type === "ok" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800")}><span>{notice.text}</span><button type="button" aria-label="Cerrar aviso" onClick={() => setNotice(null)}>×</button></div> : null}

    <div className="grid items-start gap-4 xl:grid-cols-[250px_minmax(0,1fr)]">
      <aside className="rounded-xl border border-border bg-card p-2">
        <p className="px-3 pb-2 pt-2 text-[10px] font-semibold uppercase tracking-[0.13em] text-default-400">{items.length} obras</p>
        <div className="space-y-1">
          {items.map((item) => {
            const project = item.project || item.draft || item.published;
            return <button key={item.id} type="button" onClick={() => { setSelectedSlug(item.id); setDraft(item.project); setVersion(Number(item.version) || 0); setPublished(item.published?.status === "active"); setSection("general"); setNotice(null); }} className={cn("w-full rounded-lg px-3 py-2.5 text-left transition", selectedSlug === item.id ? "bg-default-100" : "hover:bg-default-50")}>
              <span className="flex items-center justify-between gap-2"><span className="truncate text-sm font-medium">{project?.title || item.id}</span><span className={cn("h-2 w-2 shrink-0 rounded-full", item.published?.status === "active" ? "bg-emerald-500" : "bg-default-300")} /></span>
              <span className="mt-1 block truncate text-[11px] text-default-500">/obras/{item.id}</span>
            </button>;
          })}
          {!items.length ? <p className="px-3 py-5 text-xs leading-5 text-default-500">No hay obras todavía. Creá la primera para empezar.</p> : null}
        </div>
      </aside>

      {!draft ? <div className="flex min-h-64 items-center justify-center rounded-xl border border-dashed border-border text-center text-sm text-default-500">Elegí una obra o creá una nueva.</div> : <main className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 sm:p-4">
          <div className="min-w-0"><p className="truncate text-sm font-semibold">{draft.title || "Nueva obra"}</p><p className="mt-0.5 truncate text-xs text-default-500">{version ? `Borrador v${version}` : "Sin guardar"}{published ? " · Publicada" : " · No publicada"}</p></div>
          <div className="flex shrink-0 gap-2"><Btn variant="outline" disabled={saving} onClick={saveDraft}><Save className="h-4 w-4" />Guardar borrador</Btn><Btn variant="primary" disabled={saving || version === 0} onClick={publish}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{published ? "Publicar cambios" : "Publicar"}</Btn></div>
        </div>

        <nav className="flex gap-1 overflow-x-auto rounded-xl border border-border bg-card p-1" aria-label="Secciones de la obra">
          {sections.map(([id, label]) => <button key={id} type="button" onClick={() => setSection(id)} aria-current={section === id ? "page" : undefined} className={cn("shrink-0 rounded-lg px-3 py-2 text-xs transition", section === id ? "bg-default-100 font-semibold text-foreground" : "text-default-500 hover:bg-default-50 hover:text-foreground")}>{label}</button>)}
        </nav>

        {section === "general" ? <div className="space-y-4">
          <Card title="Identidad y publicación" description="El slug define la dirección pública de la obra.">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nombre de la obra" value={draft.title} onChange={(value) => setPath(["title"], value)} />
              <Field label="Categoría" value={draft.category} onChange={(value) => setPath(["category"], value)} />
              <Field label="Slug" value={draft.slug} disabled={version > 0} onChange={(value) => { const slug = slugify(value); setPath(["slug"], slug); setPath(["seo", "canonical"], `/obras/${slug}`); }} />
              <label className="block space-y-1.5"><span className="text-xs font-medium text-default-600">Estado de la página</span><select className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" value={draft.status} onChange={(event) => setPath(["status"], event.target.value)}><option value="active">Activa al publicar</option><option value="inactive">Desactivada</option><option value="coming-soon">Próximamente</option></select></label>
            </div>
          </Card>
          <Card title="SEO" description="Estos textos se usan en buscadores y vistas previas al compartir.">
            <div className="grid gap-3 sm:grid-cols-2"><Field label="Título SEO" value={draft.seo?.title} onChange={(value) => setPath(["seo", "title"], value)} /><Field label="Descripción SEO" value={draft.seo?.description} onChange={(value) => setPath(["seo", "description"], value)} multiline /><Field label="Palabras clave (separadas por coma)" value={(draft.seo?.keywords || []).join(", ")} onChange={(value) => setPath(["seo", "keywords"], value.split(",").map((item) => item.trim()).filter(Boolean))} /><Field label="URL canónica" value={draft.seo?.canonical} onChange={(value) => setPath(["seo", "canonical"], value)} /><div className="sm:col-span-2"><ImageField label="Imagen para compartir" value={draft.seo?.ogImage} onChange={(value) => setPath(["seo", "ogImage"], value)} uploadImage={uploadImage} /></div></div>
          </Card>
          <Card title="Portada principal" description="Se muestra como encabezado de la página de obra.">
            <div className="space-y-3">{(draft.banner?.slides || []).slice(0, 1).map((slide, index) => <div key={slide.id || index} className="rounded-lg border border-border/70 p-3"><div className="grid gap-3 sm:grid-cols-2"><Field label="Título" value={slide.title} onChange={(value) => setEntry(["banner", "slides"], index, { title: value })} /><Field label="Bajada" value={slide.subtitle} onChange={(value) => setEntry(["banner", "slides"], index, { subtitle: value })} /><div className="sm:col-span-2"><Field label="Descripción" value={slide.description} onChange={(value) => setEntry(["banner", "slides"], index, { description: value })} multiline /></div><div className="sm:col-span-2"><ImageField label="Imagen de portada" value={slide.backgroundImage} onChange={(value) => setEntry(["banner", "slides"], index, { backgroundImage: value })} uploadImage={uploadImage} /></div><Field label="Texto del botón" value={slide.ctaText} onChange={(value) => setEntry(["banner", "slides"], index, { ctaText: value })} /><Field label="Destino del botón" value={slide.ctaUrl} onChange={(value) => setEntry(["banner", "slides"], index, { ctaUrl: value })} /></div></div>)}</div>
          </Card>
          <Card title="Textos y botones de portada" description="Opcional: estos textos reemplazan los de la diapositiva principal.">
            <div className="grid gap-3 sm:grid-cols-2"><Field label="Antetítulo" value={draft.pageContent?.hero?.eyebrow} onChange={(value) => setPath(["pageContent", "hero", "eyebrow"], value)} /><Field label="Título principal" value={draft.pageContent?.hero?.headline} onChange={(value) => setPath(["pageContent", "hero", "headline"], value)} /><Field label="Subtítulo" value={draft.pageContent?.hero?.subheadline} onChange={(value) => setPath(["pageContent", "hero", "subheadline"], value)} /><Field label="Servicios destacados (uno por línea)" value={(draft.pageContent?.hero?.services || []).join("\n")} onChange={(value) => setPath(["pageContent", "hero", "services"], value.split("\n").map((item) => item.trim()).filter(Boolean))} multiline /><div className="sm:col-span-2"><Field label="Descripción" value={draft.pageContent?.hero?.description} onChange={(value) => setPath(["pageContent", "hero", "description"], value)} multiline /></div><Field label="Texto del botón principal" value={draft.pageContent?.hero?.primaryLabel} onChange={(value) => setPath(["pageContent", "hero", "primaryLabel"], value)} /><Field label="Destino del botón principal" value={draft.pageContent?.hero?.primaryHref} onChange={(value) => setPath(["pageContent", "hero", "primaryHref"], value)} /><Field label="Texto del botón secundario" value={draft.pageContent?.hero?.secondaryLabel} onChange={(value) => setPath(["pageContent", "hero", "secondaryLabel"], value)} /><Field label="Destino del botón secundario" value={draft.pageContent?.hero?.secondaryHref} onChange={(value) => setPath(["pageContent", "hero", "secondaryHref"], value)} /></div>
          </Card>
          <Card title="Presentación" description="Introducción breve y atributos destacados.">
            <div className="space-y-3"><Field label="Título" value={draft.info?.title} onChange={(value) => setPath(["info", "title"], value)} /><Field label="Descripción" value={draft.info?.description} onChange={(value) => setPath(["info", "description"], value)} multiline /><ImageField label="Imágenes de presentación (una URL por línea)" value={(draft.info?.images || []).join("\n")} onChange={(value) => setPath(["info", "images"], value.split("\n").map((item) => item.trim()).filter(Boolean))} uploadImage={uploadImage} multiline />
              <ListEditor title="Atributos" items={draft.info?.features || []} onAdd={(index, remove) => remove ? removeEntry(["info", "features"], index) : addEntry(["info", "features"], { id: uid("feature"), icon: "check", title: "", description: "" })}>{(item, index) => <div className="grid gap-3 sm:grid-cols-2"><Field label="Título" value={item.title} onChange={(value) => setEntry(["info", "features"], index, { title: value })} /><Field label="Ícono (nombre interno)" value={item.icon} onChange={(value) => setEntry(["info", "features"], index, { icon: value })} /><div className="sm:col-span-2"><Field label="Descripción" value={item.description} onChange={(value) => setEntry(["info", "features"], index, { description: value })} multiline /></div></div>}</ListEditor>
              <ListEditor title="Datos destacados" items={draft.info?.stats || []} onAdd={(index, remove) => remove ? removeEntry(["info", "stats"], index) : addEntry(["info", "stats"], { id: uid("stat"), number: "", suffix: "", label: "" })}>{(item, index) => <div className="grid gap-3 sm:grid-cols-3"><Field label="Número" value={item.number} onChange={(value) => setEntry(["info", "stats"], index, { number: value })} /><Field label="Sufijo" value={item.suffix} onChange={(value) => setEntry(["info", "stats"], index, { suffix: value })} /><Field label="Descripción breve" value={item.label} onChange={(value) => setEntry(["info", "stats"], index, { label: value })} /></div>}</ListEditor>
            </div>
          </Card>
          <Card title="Soluciones y cierre"><div className="grid gap-3 sm:grid-cols-2"><Field label="Antetítulo" value={draft.pageContent?.solutions?.eyebrow} onChange={(value) => setPath(["pageContent", "solutions", "eyebrow"], value)} /><Field label="Título" value={draft.pageContent?.solutions?.title} onChange={(value) => setPath(["pageContent", "solutions", "title"], value)} /><div className="sm:col-span-2"><Field label="Descripción" value={draft.pageContent?.solutions?.description} onChange={(value) => setPath(["pageContent", "solutions", "description"], value)} multiline /></div><div className="sm:col-span-2"><ImageField label="Imagen de fondo" value={draft.pageContent?.solutions?.image} onChange={(value) => setPath(["pageContent", "solutions", "image"], value)} uploadImage={uploadImage} /></div><Field label="Texto del botón WhatsApp" value={draft.pageContent?.solutions?.whatsappLabel} onChange={(value) => setPath(["pageContent", "solutions", "whatsappLabel"], value)} /><Field label="Teléfono visible" value={draft.pageContent?.solutions?.phone} onChange={(value) => setPath(["pageContent", "solutions", "phone"], value)} /></div></Card>
        </div> : null}

        {section === "materiales" ? <div className="space-y-4">
          <Card title="Sección de materiales"><div className="grid gap-3 sm:grid-cols-2"><Field label="Antetítulo" value={draft.pageContent?.options?.eyebrow} onChange={(value) => setPath(["pageContent", "options", "eyebrow"], value)} /><Field label="Título" value={draft.pageContent?.options?.title} onChange={(value) => setPath(["pageContent", "options", "title"], value)} /><div className="sm:col-span-2"><Field label="Descripción" value={draft.pageContent?.options?.description} onChange={(value) => setPath(["pageContent", "options", "description"], value)} multiline /></div><Field label="Texto del botón de consulta" value={draft.pageContent?.options?.consultationLabel} onChange={(value) => setPath(["pageContent", "options", "consultationLabel"], value)} /><Field label="Destino del botón de consulta" value={draft.pageContent?.options?.consultationHref} onChange={(value) => setPath(["pageContent", "options", "consultationHref"], value)} /></div></Card>
          <ListEditor title="Tipos de materiales" items={draft.pageContent?.options?.items || []} onAdd={(index, remove) => remove ? removeEntry(["pageContent", "options", "items"], index) : addEntry(["pageContent", "options", "items"], { id: uid("material"), title: "", description: "", image: "", images: [], group: "" })}>{(item, index) => <div className="grid gap-3 sm:grid-cols-2"><Field label="Nombre" value={item.title} onChange={(value) => setEntry(["pageContent", "options", "items"], index, { title: value })} /><Field label="Grupo" value={item.group} onChange={(value) => setEntry(["pageContent", "options", "items"], index, { group: value })} /><div className="sm:col-span-2"><Field label="Descripción" value={item.description} onChange={(value) => setEntry(["pageContent", "options", "items"], index, { description: value })} multiline /></div><div className="sm:col-span-2"><ImageField label="Imagen principal" value={item.image} onChange={(value) => setEntry(["pageContent", "options", "items"], index, { image: value })} uploadImage={uploadImage} /></div><div className="sm:col-span-2"><ImageField label="Galería (una URL por línea)" value={(item.images || []).join("\n")} onChange={(value) => setEntry(["pageContent", "options", "items"], index, { images: value.split("\n").map((image) => image.trim()).filter(Boolean) })} uploadImage={uploadImage} multiline /></div></div>}</ListEditor>
        </div> : null}

        {section === "adicionales" ? <div className="space-y-4">
          <Card title="Sección de adicionales"><div className="grid gap-3 sm:grid-cols-2"><Field label="Antetítulo" value={draft.pageContent?.accessories?.eyebrow} onChange={(value) => setPath(["pageContent", "accessories", "eyebrow"], value)} /><Field label="Título" value={draft.pageContent?.accessories?.title} onChange={(value) => setPath(["pageContent", "accessories", "title"], value)} /><div className="sm:col-span-2"><Field label="Descripción" value={draft.pageContent?.accessories?.description} onChange={(value) => setPath(["pageContent", "accessories", "description"], value)} multiline /></div><Field label="Antetítulo del contenido" value={draft.pageContent?.accessories?.contentEyebrow} onChange={(value) => setPath(["pageContent", "accessories", "contentEyebrow"], value)} /></div></Card>
          <ListEditor title="Adicionales" items={draft.pageContent?.accessories?.items || []} onAdd={(index, remove) => remove ? removeEntry(["pageContent", "accessories", "items"], index) : addEntry(["pageContent", "accessories", "items"], { id: uid("accessory"), title: "", description: "", image: "" })}>{(item, index) => <div className="grid gap-3 sm:grid-cols-2"><Field label="Nombre" value={item.title} onChange={(value) => setEntry(["pageContent", "accessories", "items"], index, { title: value })} /><Field label="Descripción" value={item.description} onChange={(value) => setEntry(["pageContent", "accessories", "items"], index, { description: value })} multiline /><div className="sm:col-span-2"><ImageField label="Imagen" value={item.image} onChange={(value) => setEntry(["pageContent", "accessories", "items"], index, { image: value })} uploadImage={uploadImage} /></div></div>}</ListEditor>
        </div> : null}

        {section === "servicios" ? <div className="space-y-4"><Card title="Sección de servicios" description="Podés editar las tarjetas y decidir si se muestran en la página pública."><label className="flex items-center justify-between gap-4 rounded-lg border border-border p-3"><span><span className="block text-sm font-medium">Mostrar servicios en la página</span><span className="mt-1 block text-xs text-default-500">La sección solo se publica cuando está activada y tiene contenido.</span></span><input type="checkbox" checked={draft.pageContent?.services?.enabled === true} onChange={(event) => setPath(["pageContent", "services", "enabled"], event.target.checked)} className="h-4 w-4 accent-black" /></label><div className="mt-3 grid gap-3 sm:grid-cols-2"><Field label="Antetítulo" value={draft.pageContent?.services?.eyebrow} onChange={(value) => setPath(["pageContent", "services", "eyebrow"], value)} /><Field label="Título" value={draft.pageContent?.services?.title} onChange={(value) => setPath(["pageContent", "services", "title"], value)} /><div className="sm:col-span-2"><Field label="Descripción" value={draft.pageContent?.services?.description} onChange={(value) => setPath(["pageContent", "services", "description"], value)} multiline /></div></div></Card><ListEditor title="Servicios" items={draft.services || []} onAdd={(index, remove) => remove ? removeEntry(["services"], index) : addEntry(["services"], { id: uid("service"), section: "service", title: "", description: "", image: "", features: [], carousel: [] })}>{(item, index) => <div className="grid gap-3 sm:grid-cols-2"><Field label="Nombre" value={item.title} onChange={(value) => setEntry(["services"], index, { title: value })} /><Field label="Sección" value={item.section} placeholder="options, accessories o service" onChange={(value) => setEntry(["services"], index, { section: value })} /><div className="sm:col-span-2"><Field label="Descripción" value={item.description} onChange={(value) => setEntry(["services"], index, { description: value })} multiline /></div><div className="sm:col-span-2"><ImageField label="Imagen" value={item.image} onChange={(value) => setEntry(["services"], index, { image: value })} uploadImage={uploadImage} /></div><div className="sm:col-span-2"><Field label="Características (una por línea)" value={(item.features || []).join("\n")} onChange={(value) => setEntry(["services"], index, { features: value.split("\n").map((feature) => feature.trim()).filter(Boolean) })} multiline /></div><Field label="Precio desde" type="number" value={item.price?.from ?? ""} onChange={(value) => setEntry(["services"], index, { price: { ...(item.price || {}), from: value === "" ? undefined : Number(value) } })} /><Field label="Unidad de precio" value={item.price?.unit} onChange={(value) => setEntry(["services"], index, { price: { ...(item.price || {}), currency: "ARS", unit: value } })} /><div className="sm:col-span-2"><ListEditor title="Opciones y materiales del servicio" items={item.carousel || []} onAdd={(nestedIndex, remove) => setEntry(["services"], index, { carousel: remove ? (item.carousel || []).filter((_, i) => i !== nestedIndex) : [...(item.carousel || []), { id: uid("service-item"), title: "", image: "", description: "" }] })}>{(option, nestedIndex) => <div className="grid gap-3 sm:grid-cols-2"><Field label="Nombre" value={option.title} onChange={(value) => setEntry(["services"], index, { carousel: (item.carousel || []).map((entry, i) => i === nestedIndex ? { ...entry, title: value } : entry) })} /><Field label="Descripción" value={option.description} onChange={(value) => setEntry(["services"], index, { carousel: (item.carousel || []).map((entry, i) => i === nestedIndex ? { ...entry, description: value } : entry) })} multiline /><div className="sm:col-span-2"><ImageField label="Imagen" value={option.image} onChange={(value) => setEntry(["services"], index, { carousel: (item.carousel || []).map((entry, i) => i === nestedIndex ? { ...entry, image: value } : entry) })} uploadImage={uploadImage} /></div></div>}</ListEditor></div></div>}</ListEditor></div> : null}

        {section === "galeria" ? <div className="space-y-4">
          <Card title="Encabezado de la galería"><div className="grid gap-3 sm:grid-cols-2"><Field label="Antetítulo" value={draft.pageContent?.gallery?.eyebrow} onChange={(value) => setPath(["pageContent", "gallery", "eyebrow"], value)} /><Field label="Instagram: antetítulo" value={draft.pageContent?.instagram?.eyebrow} onChange={(value) => setPath(["pageContent", "instagram", "eyebrow"], value)} /><Field label="Instagram: título" value={draft.pageContent?.instagram?.title} onChange={(value) => setPath(["pageContent", "instagram", "title"], value)} /><Field label="Instagram: descripción" value={draft.pageContent?.instagram?.description} onChange={(value) => setPath(["pageContent", "instagram", "description"], value)} multiline /></div></Card>
          <Card title="Galería de trabajos"><div className="grid gap-3 sm:grid-cols-2"><Field label="Título" value={draft.gallery?.title} onChange={(value) => setPath(["gallery", "title"], value)} /><Field label="Categorías (separadas por coma)" value={(draft.gallery?.categories || []).join(", ")} onChange={(value) => setPath(["gallery", "categories"], value.split(",").map((item) => item.trim()).filter(Boolean))} /><div className="sm:col-span-2"><Field label="Descripción" value={draft.gallery?.description} onChange={(value) => setPath(["gallery", "description"], value)} multiline /></div></div></Card>
          <ListEditor title="Fotos de trabajos" items={draft.gallery?.items || []} onAdd={(index, remove) => remove ? removeEntry(["gallery", "items"], index) : addEntry(["gallery", "items"], { id: uid("work"), title: "", description: "", image: "", category: "" })}>{(item, index) => <div className="grid gap-3 sm:grid-cols-2"><Field label="Título" value={item.title} onChange={(value) => setEntry(["gallery", "items"], index, { title: value })} /><Field label="Categoría" value={item.category} onChange={(value) => setEntry(["gallery", "items"], index, { category: value })} /><div className="sm:col-span-2"><Field label="Descripción" value={item.description} onChange={(value) => setEntry(["gallery", "items"], index, { description: value })} multiline /></div><div className="sm:col-span-2"><ImageField label="Foto" value={item.image} onChange={(value) => setEntry(["gallery", "items"], index, { image: value })} uploadImage={uploadImage} /></div><div className="sm:col-span-2"><ImageField label="Foto anterior (opcional)" value={item.beforeImage} onChange={(value) => setEntry(["gallery", "items"], index, { beforeImage: value })} uploadImage={uploadImage} /></div></div>}</ListEditor>
          <ListEditor title="Testimonios" items={draft.testimonials || []} onAdd={(index, remove) => remove ? removeEntry(["testimonials"], index) : addEntry(["testimonials"], { id: uid("testimonial"), name: "", role: "", content: "", rating: 5 })}>{(item, index) => <div className="grid gap-3 sm:grid-cols-2"><Field label="Nombre" value={item.name} onChange={(value) => setEntry(["testimonials"], index, { name: value })} /><Field label="Rol" value={item.role} onChange={(value) => setEntry(["testimonials"], index, { role: value })} /><div className="sm:col-span-2"><Field label="Testimonio" value={item.content} onChange={(value) => setEntry(["testimonials"], index, { content: value })} multiline /></div><Field label="Puntuación (1 a 5)" type="number" value={item.rating} onChange={(value) => setEntry(["testimonials"], index, { rating: Math.min(5, Math.max(1, Number(value) || 1)) })} /></div>}</ListEditor>
        </div> : null}

        {section === "faq" ? <div className="space-y-4"><Card title="Encabezado de preguntas frecuentes"><div className="grid gap-3 sm:grid-cols-2"><Field label="Antetítulo" value={draft.pageContent?.faq?.eyebrow} onChange={(value) => setPath(["pageContent", "faq", "eyebrow"], value)} /><Field label="Título" value={draft.pageContent?.faq?.title} onChange={(value) => setPath(["pageContent", "faq", "title"], value)} /><div className="sm:col-span-2"><Field label="Descripción" value={draft.pageContent?.faq?.description} onChange={(value) => setPath(["pageContent", "faq", "description"], value)} multiline /></div><Field label="Texto del enlace" value={draft.pageContent?.faq?.ctaLabel} onChange={(value) => setPath(["pageContent", "faq", "ctaLabel"], value)} /></div></Card><ListEditor title="Preguntas frecuentes" items={draft.faqs || []} onAdd={(index, remove) => remove ? removeEntry(["faqs"], index) : addEntry(["faqs"], { id: uid("faq"), question: "", answer: "" })}>{(item, index) => <div className="grid gap-3"><Field label="Pregunta" value={item.question} onChange={(value) => setEntry(["faqs"], index, { question: value })} /><Field label="Respuesta" value={item.answer} onChange={(value) => setEntry(["faqs"], index, { answer: value })} multiline /></div>}</ListEditor></div> : null}

        {section === "contacto" ? <div className="space-y-4">
          <Card title="Contacto de la obra" description="Si un campo queda vacío, se mantiene el comportamiento del componente de contacto de la tienda.">
            <div className="grid gap-3 sm:grid-cols-2"><Field label="Título" value={draft.contact?.title} onChange={(value) => setPath(["contact", "title"], value)} /><Field label="Teléfono" value={draft.contact?.phone} onChange={(value) => setPath(["contact", "phone"], value)} /><Field label="Email" value={draft.contact?.email} onChange={(value) => setPath(["contact", "email"], value)} /><Field label="WhatsApp" value={draft.contact?.whatsapp} onChange={(value) => setPath(["contact", "whatsapp"], value)} /><Field label="Dirección" value={draft.contact?.address} onChange={(value) => setPath(["contact", "address"], value)} /><div className="sm:col-span-2"><Field label="Descripción" value={draft.contact?.description} onChange={(value) => setPath(["contact", "description"], value)} multiline /></div><Field label="Sección de contacto: antetítulo" value={draft.pageContent?.contact?.eyebrow} onChange={(value) => setPath(["pageContent", "contact", "eyebrow"], value)} /><Field label="Sección de contacto: título" value={draft.pageContent?.contact?.title} onChange={(value) => setPath(["pageContent", "contact", "title"], value)} /><Field label="Título del formulario" value={draft.pageContent?.contact?.formTitle} onChange={(value) => setPath(["pageContent", "contact", "formTitle"], value)} /><div className="sm:col-span-2"><Field label="Sección de contacto: descripción" value={draft.pageContent?.contact?.description} onChange={(value) => setPath(["pageContent", "contact", "description"], value)} multiline /></div></div>
          </Card>
          <Card title="Horarios" action={<Btn size="sm" variant="outline" onClick={() => addEntry(["contact", "workingHours"], { day: "", hours: "" })}><Plus className="h-3.5 w-3.5" />Agregar</Btn>}>
            <div className="space-y-2">{(draft.contact?.workingHours || []).map((item, index) => <div key={index} className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]"><Field label="Día" value={item.day} onChange={(value) => setEntry(["contact", "workingHours"], index, { day: value })} /><Field label="Horario" value={item.hours} onChange={(value) => setEntry(["contact", "workingHours"], index, { hours: value })} /><button type="button" className="mt-5 flex h-9 w-9 items-center justify-center text-default-400 hover:text-destructive" aria-label="Quitar horario" onClick={() => removeEntry(["contact", "workingHours"], index)}><Trash2 className="h-4 w-4" /></button></div>)}</div>
          </Card>
          <ListEditor title="Redes y enlaces" items={draft.contact?.socialLinks || []} onAdd={(index, remove) => remove ? removeEntry(["contact", "socialLinks"], index) : addEntry(["contact", "socialLinks"], { platform: "", url: "", icon: "" })}>{(item, index) => <div className="grid gap-3 sm:grid-cols-2"><Field label="Red o plataforma" value={item.platform} onChange={(value) => setEntry(["contact", "socialLinks"], index, { platform: value })} /><Field label="URL" value={item.url} onChange={(value) => setEntry(["contact", "socialLinks"], index, { url: value })} /></div>}</ListEditor>
        </div> : null}
      </main>}
    </div>
  </div>;
}
