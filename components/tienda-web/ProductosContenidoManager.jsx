"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ImagePlus, Loader2, Plus, Search, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Btn } from "@/components/tienda-web/ui";
import { resolveProductContent } from "@/lib/tienda-productos-contenido";
import { previewUrl } from "@/lib/tienda-web-ui";

const inputClass = "h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none transition placeholder:text-default-400 focus:border-foreground/40 focus:ring-2 focus:ring-foreground/10";
const newId = () => `contenido-${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36)}`;
const imageUrl = (product) => {
  const raw = product?.imagenes ?? product?.images ?? product?.imagen ?? product?.srcUrl;
  const first = Array.isArray(raw) ? raw[0] : raw;
  if (typeof first === "string") return first.split(/\s*\|\s*/)[0];
  return first?.url || first?.src || first?.imageUrl || first?.imagen || "";
};
const categoryLabel = (rule) => Object.entries(rule.match || {}).map(([key, value]) => `${({ categoria: "Categoría", subcategoria: "Subcategoría", tipoProducto: "Tipo", tipoMadera: "Material", unidad: "Unidad", uso: "Uso" })[key] || key}: ${value}`).join(" · ");

function Panel({ title, description, action, children }) {
  return <section className="overflow-hidden rounded-2xl border border-border/70 bg-card">
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border/60 px-4 py-4 sm:px-5">
      <div><h3 className="text-sm font-semibold text-foreground">{title}</h3>{description ? <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">{description}</p> : null}</div>
      {action}
    </header>
    <div className="p-4 sm:p-5">{children}</div>
  </section>;
}

function ImagePreview({ src, tiendaUrl, alt = "", className = "" }) {
  const resolved = previewUrl(src, tiendaUrl);
  return resolved ? <img src={resolved} alt={alt} className={className} onError={(event) => { event.currentTarget.style.visibility = "hidden"; }} /> : null;
}

function GalleryEditor({ images, onChange, media, uploadImage, tiendaUrl }) {
  const [showLibrary, setShowLibrary] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const add = (url, alt = "") => {
    if (!url || images.some((image) => image.url === url)) return;
    if (images.length >= 12) {
      setError("Cada nivel puede definir hasta 12 imágenes.");
      return;
    }
    onChange([...images, { url, alt, ratio: "square" }]);
  };
  const upload = async (file) => {
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const item = await uploadImage(file, "productos");
      add(item.url, "");
      const sourceWidth = item.sourceWidth || item.width;
      const sourceHeight = item.sourceHeight || item.height;
      if (sourceWidth && sourceHeight && Math.abs(sourceWidth / sourceHeight - 1) > 0.2) {
        setError("La imagen se recortó al centro a 1:1. Revisá que el producto quede dentro del encuadre.");
      }
    } catch (cause) {
      setError(cause?.message || "No se pudo cargar la imagen.");
    } finally {
      setUploading(false);
    }
  };
  const library = (media?.items || []).filter((item) => item?.url && item?.mime?.startsWith("image/"));

  return <div className="space-y-3">
    <div className="flex flex-wrap items-center gap-2">
      <label className={cn("inline-flex h-9 cursor-pointer items-center gap-2 rounded-full bg-foreground px-4 text-xs font-medium text-background transition hover:opacity-85", uploading && "pointer-events-none opacity-60")}>
        {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
        {uploading ? "Subiendo…" : "Subir imagen"}
        <input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,image/avif" disabled={uploading} onChange={(event) => { void upload(event.target.files?.[0]); event.target.value = ""; }} />
      </label>
      <button type="button" onClick={() => setShowLibrary((value) => !value)} className="inline-flex h-9 items-center gap-2 rounded-full border border-border px-4 text-xs font-medium text-foreground transition hover:bg-muted/50">
        <span>{showLibrary ? "Cerrar biblioteca" : "Cargar desde biblioteca"}</span>
      </button>
      <span className="text-xs text-muted-foreground">1:1 · 1200 × 1200 px · máximo 12 fotos</span>
    </div>
    {error ? <p role="status" className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-800 dark:text-amber-300">{error}</p> : null}
    {showLibrary ? <div className="rounded-2xl border border-border/60 bg-muted/20 p-3">
      {library.length ? <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-7">
        {library.map((item) => <button key={item.id || item.key || item.url} type="button" onClick={() => { add(item.url); if (item.width && item.height && Math.abs(item.width / item.height - 1) > 0.2) setError("La imagen no es cuadrada. La tienda la recortará al centro; conviene dejar el producto dentro del 70 % central."); }} className="group relative aspect-square overflow-hidden rounded-xl border border-border/60 bg-muted text-left outline-none focus-visible:ring-2 focus-visible:ring-foreground" aria-label="Usar imagen de la biblioteca">
          <ImagePreview src={item.url} tiendaUrl={tiendaUrl} className="h-full w-full object-cover transition group-hover:scale-105" />
          {images.some((image) => image.url === item.url) ? <span className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-foreground text-background"><Check className="h-3.5 w-3.5" /></span> : null}
        </button>)}
      </div> : <p className="text-xs text-muted-foreground">Todavía no hay imágenes cargadas.</p>}
    </div> : null}
    {images.length ? <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {images.map((image, index) => <div key={`${image.url}-${index}`} className="group relative overflow-hidden rounded-2xl border border-border/70 bg-muted/30">
        <div className="relative aspect-square"><ImagePreview src={image.url} tiendaUrl={tiendaUrl} alt={image.alt || "Vista previa de producto"} className="h-full w-full object-cover" />
          <span className="absolute left-2 top-2 rounded-full bg-background/90 px-2.5 py-1 text-[10px] font-semibold text-foreground shadow-sm">{index === 0 ? "Portada" : `Imagen ${index + 1}`}</span>
          <button type="button" aria-label={`Quitar imagen ${index + 1}`} onClick={() => onChange(images.filter((_, i) => i !== index))} className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-background/90 text-muted-foreground shadow-sm transition hover:text-destructive"><X className="h-4 w-4" /></button>
        </div>
        <label className="block p-2"><span className="sr-only">Texto alternativo imagen {index + 1}</span><input className="w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground" value={image.alt || ""} onChange={(event) => onChange(images.map((entry, i) => i === index ? { ...entry, alt: event.target.value } : entry))} placeholder="Texto alternativo" maxLength={180} /></label>
      </div>)}
    </div> : <div className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">Sin imágenes definidas en este nivel. Se hereda la portada anterior.</div>}
  </div>;
}

function ContentEditor({ editor, onChange, onCancel, onCommit, media, uploadImage, busy, previewProduct, previewContent, tiendaUrl }) {
  if (!editor) return null;
  const patch = editor.content || {};
  const changeContent = (update) => onChange({ ...editor, content: { ...patch, ...update } });
  const toggleDescription = (enabled) => {
    const next = { ...patch };
    if (enabled) next.description = "";
    else delete next.description;
    onChange({ ...editor, content: next });
  };
  const toggleImages = (enabled) => {
    const next = { ...patch };
    if (enabled) next.images = [];
    else delete next.images;
    onChange({ ...editor, content: next });
  };
  const target = editor.kind === "global" ? "Todo el catálogo" : editor.kind === "rule" ? categoryLabel(editor) : `${editor.ids.length} producto${editor.ids.length === 1 ? "" : "s"}`;

  return <Panel title={editor.kind === "global" ? "Contenido general" : editor.kind === "rule" ? "Regla por filtros" : "Excepción de producto"} description={`Alcance: ${target}. Los campos sin marcar heredan el contenido del nivel anterior.`}>
    {editor.kind === "rule" ? <div className="mb-4 flex flex-wrap gap-2">{Object.entries(editor.match).map(([key, value]) => <span key={key} className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">{({ categoria: "Categoría", subcategoria: "Subcategoría", tipoProducto: "Tipo", tipoMadera: "Material", unidad: "Unidad", uso: "Uso" })[key]} · {value}</span>)}</div> : null}
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="space-y-5">
      <div className="space-y-3">
        <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={typeof patch.description === "string"} onChange={(event) => toggleDescription(event.target.checked)} className="h-4 w-4 accent-foreground" />Definir descripción en este nivel</label>
        {typeof patch.description === "string" ? <textarea className={cn(inputClass, "min-h-28 resize-y py-3")} value={patch.description} maxLength={6000} onChange={(event) => changeContent({ description: event.target.value })} placeholder="Escribí una descripción clara y útil para el cliente." /> : <p className="text-xs text-muted-foreground">Se conserva la descripción definida en el nivel anterior o en el catálogo.</p>}
      </div>
      <div className="space-y-3">
        <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={Array.isArray(patch.images)} onChange={(event) => toggleImages(event.target.checked)} className="h-4 w-4 accent-foreground" />Definir imágenes en este nivel</label>
        {Array.isArray(patch.images) ? <GalleryEditor images={patch.images} onChange={(images) => changeContent({ images })} media={media} uploadImage={uploadImage} tiendaUrl={tiendaUrl} /> : <p className="text-xs text-muted-foreground">Se heredan las imágenes del nivel anterior o las del catálogo.</p>}
      </div>
      <div className="flex flex-wrap justify-end gap-2 border-t border-border/60 pt-4">
        {editor.kind === "product" ? <Btn variant="ghost" disabled={busy} onClick={() => onCommit({ remove: true })}><Trash2 className="h-4 w-4" />Quitar excepción</Btn> : null}
        <Btn variant="outline" disabled={busy} onClick={onCancel}>Cancelar</Btn>
        <Btn variant="primary" disabled={busy} onClick={() => onCommit({})}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Aplicar</Btn>
      </div>
      </div>
      <aside className="self-start rounded-2xl border border-border/60 bg-muted/20 p-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Vista previa</p>
        {previewProduct ? <div className="mt-3 overflow-hidden rounded-xl border border-border/60 bg-card">
          <div className="grid grid-cols-3 gap-1 bg-muted/30 p-1">
            {(previewContent?.images || []).slice(0, 3).map((image, index) => <div key={`${image.url}-${index}`} className="aspect-square overflow-hidden rounded-lg bg-muted"><ImagePreview src={image.url} tiendaUrl={tiendaUrl} className="h-full w-full object-cover" /></div>)}
            {!previewContent?.images?.length ? <div className="col-span-3 flex aspect-square items-center justify-center text-xs text-muted-foreground">Sin imagen</div> : null}
          </div>
          <div className="space-y-1.5 p-3"><p className="line-clamp-2 text-xs font-semibold text-foreground">{previewProduct.nombre || previewProduct.name || "Producto"}</p><p className="line-clamp-5 whitespace-pre-line text-[11px] leading-5 text-muted-foreground">{previewContent?.description || "Sin descripción."}</p><p className="pt-1 text-[10px] text-muted-foreground">La tarjeta usa la primera imagen; la ficha muestra la galería completa.</p></div>
        </div> : <p className="mt-3 text-xs leading-5 text-muted-foreground">Elegí una familia o producto para ver un ejemplo.</p>}
      </aside>
    </div>
  </Panel>;
}

export default function ProductosContenidoManager({ products = [], categories = [], media, uploadImage, authFetch, tiendaUrl, active = true, onSaveStateChange }) {
  const [config, setConfig] = useState(null);
  const [savedConfig, setSavedConfig] = useState(null);
  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [type, setType] = useState("");
  const [wood, setWood] = useState("");
  const [unit, setUnit] = useState("");
  const [use, setUse] = useState("");
  const [selected, setSelected] = useState([]);
  const [editor, setEditor] = useState(null);

  useEffect(() => {
    let active = true;
    authFetch("/api/tienda/productos/contenido/admin")
      .then((data) => { if (active) { setConfig(data.config); setSavedConfig(data.config); setVersion(Number(data.version) || 0); } })
      .catch((cause) => { if (active) setError(cause.message || "No se pudo cargar el contenido."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [authFetch]);

  useEffect(() => {
    if (!active) setEditor(null);
  }, [active]);

  const categoryOptions = useMemo(() => [...new Set([...categories, ...products.map((p) => p.categoria).filter(Boolean)])].sort((a, b) => a.localeCompare(b, "es")), [categories, products]);
  const subcategoryOptions = useMemo(() => [...new Set(products.filter((p) => !category || p.categoria === category).map((p) => p.subcategoria).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es")), [products, category]);
  const typeOptions = useMemo(() => [...new Set(products.map((p) => p.tipoProducto).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es")), [products]);
  const woodOptions = useMemo(() => [...new Set(products.map((p) => p.tipoMadera).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es")), [products]);
  const unitOptions = useMemo(() => [...new Set(products.map((p) => p.unidad).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es")), [products]);
  const useOptions = useMemo(() => [...new Set(products.map((p) => p.uso).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es")), [products]);
  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("es");
    return products.filter((product) => {
      if (category && product.categoria !== category) return false;
      if (subcategory && product.subcategoria !== subcategory) return false;
      if (type && product.tipoProducto !== type) return false;
      if (wood && product.tipoMadera !== wood) return false;
      if (unit && product.unidad !== unit) return false;
      if (use && product.uso !== use) return false;
      return !q || `${product.nombre} ${product.codigo} ${product.categoria} ${product.subcategoria} ${product.tipoMadera} ${product.tipoProducto}`.toLocaleLowerCase("es").includes(q);
    });
  }, [products, category, subcategory, type, wood, unit, use, query]);
  const visibleProducts = filtered.slice(0, 100);
  const selectedInFilter = selected.filter((id) => filtered.some((product) => product.id === id));
  const selectedCount = selectedInFilter.length;

  const setFacet = (name, value) => {
    if (name === "categoria") { setCategory(value); setSubcategory(""); }
    if (name === "subcategoria") setSubcategory(value);
    if (name === "tipoProducto") setType(value);
    if (name === "tipoMadera") setWood(value);
    if (name === "unidad") setUnit(value);
    if (name === "uso") setUse(value);
  };
  const activeMatch = Object.fromEntries(Object.entries({ categoria: category, subcategoria: subcategory, tipoProducto: type, tipoMadera: wood, unidad: unit, uso: use }).filter(([, value]) => value));
  const openRule = () => {
    if (!Object.keys(activeMatch).length) return;
    setEditor({ kind: "rule", id: newId(), active: true, match: activeMatch, content: {} });
  };
  const openProductEditor = (ids) => {
    const current = ids.length === 1 ? config.products?.[ids[0]] || {} : {};
    setEditor({ kind: "product", ids, content: { ...current } });
  };

  const save = useCallback(async () => {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const data = await authFetch("/api/tienda/productos/contenido/admin", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config, baseVersion: version }),
      });
      setConfig(data.config);
      setSavedConfig(data.config);
      setVersion(data.version);
      setNotice("Contenido publicado. La tienda ya usa esta versión.");
      return { ok: true };
    } catch (cause) {
      const message = cause.data?.issues?.join(" · ") || cause.message || "No se pudo guardar.";
      setError(message);
      return { ok: false, message };
    } finally {
      setSaving(false);
    }
  }, [authFetch, config, version]);

  const discard = useCallback(() => {
    if (savedConfig) setConfig(savedConfig);
    setEditor(null);
    setError("");
    setNotice("");
  }, [savedConfig]);

  const commitEditor = ({ remove = false } = {}) => {
    if (!editor || !config) return;
    setConfig((current) => {
      const next = structuredClone(current);
      if (editor.kind === "global") next.global = editor.content;
      if (editor.kind === "rule") {
        const index = next.rules.findIndex((rule) => rule.id === editor.id);
        const rule = { ...editor, order: index < 0 ? next.rules.length : next.rules[index].order };
        if (index < 0) next.rules.push(rule);
        else next.rules[index] = rule;
      }
      if (editor.kind === "product") {
        if (remove) editor.ids.forEach((id) => delete next.products[id]);
        else if (editor.ids.length === 1) {
          if (Object.keys(editor.content).length) next.products[editor.ids[0]] = editor.content;
          else delete next.products[editor.ids[0]];
        } else if (Object.keys(editor.content).length) {
          editor.ids.forEach((id) => { next.products[id] = { ...(next.products[id] || {}), ...editor.content }; });
        }
      }
      return next;
    });
    setEditor(null);
    setNotice("Cambios pendientes. Guardalos para publicarlos en la tienda.");
  };

  const toggleOne = (id) => setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const toggleVisible = () => {
    const ids = visibleProducts.map((product) => product.id);
    const allSelected = ids.length > 0 && ids.every((id) => selected.includes(id));
    setSelected((current) => allSelected ? current.filter((id) => !ids.includes(id)) : [...new Set([...current, ...ids])]);
  };
  const deleteRule = (id) => setConfig((current) => ({ ...current, rules: current.rules.filter((rule) => rule.id !== id) }));
  const previewProduct = editor?.kind === "product"
    ? products.find((product) => editor.ids.includes(product.id))
    : editor?.kind === "rule"
      ? products.find((product) => Object.entries(editor.match || {}).every(([field, value]) => String(product[field] || "").toLocaleLowerCase("es") === String(value).toLocaleLowerCase("es")))
      : products[0];
  const previewContent = useMemo(() => {
    if (!editor || !previewProduct || !config) return null;
    const previewConfig = structuredClone(config);
    if (editor.kind === "global") previewConfig.global = editor.content;
    if (editor.kind === "rule") {
      const index = previewConfig.rules.findIndex((rule) => rule.id === editor.id);
      if (index < 0) previewConfig.rules.push({ ...editor, order: previewConfig.rules.length });
      else previewConfig.rules[index] = { ...editor, order: previewConfig.rules[index].order };
    }
    if (editor.kind === "product") previewConfig.products[editor.ids[0]] = { ...(previewConfig.products[editor.ids[0]] || {}), ...editor.content };
    return resolveProductContent(previewProduct, previewConfig);
  }, [config, editor, previewProduct]);
  const dirty = Boolean(config && savedConfig && JSON.stringify(config) !== JSON.stringify(savedConfig));

  useEffect(() => {
    onSaveStateChange?.({ dirty, saving, save, discard });
  }, [dirty, saving, save, discard, onSaveStateChange]);

  if (loading) return <div className="flex min-h-48 items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Cargando catálogo editorial…</div>;
  if (!config) return <div role="alert" className="rounded-2xl border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">{error || "No se pudo cargar el contenido de productos."}</div>;

  return <div className="space-y-5">
    {error ? <div role="alert" className="rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div> : null}
    {notice ? <div role="status" className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-300">{notice}</div> : null}

    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,.65fr)]">
      <Panel title="Productos" description="Filtrá las variantes. Las reglas guardadas se aplican también a los próximos productos que coincidan.">
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          <label className="relative sm:col-span-2 xl:col-span-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input aria-label="Buscar productos" className={cn(inputClass, "pl-9")} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nombre o código" /></label>
          <select aria-label="Filtrar por categoría" className={inputClass} value={category} onChange={(event) => setFacet("categoria", event.target.value)}><option value="">Todas las categorías</option>{categoryOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select>
          <select aria-label="Filtrar por subcategoría" className={inputClass} value={subcategory} onChange={(event) => setFacet("subcategoria", event.target.value)}><option value="">Todas las subcategorías</option>{subcategoryOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select>
          <select aria-label="Filtrar por tipo" className={inputClass} value={type} onChange={(event) => setFacet("tipoProducto", event.target.value)}><option value="">Todos los tipos</option>{typeOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select>
          <select aria-label="Filtrar por material" className={inputClass} value={wood} onChange={(event) => setFacet("tipoMadera", event.target.value)}><option value="">Todos los materiales</option>{woodOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select>
          <select aria-label="Filtrar por unidad" className={inputClass} value={unit} onChange={(event) => setFacet("unidad", event.target.value)}><option value="">Todas las unidades</option>{unitOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select>
          <select aria-label="Filtrar por uso" className={inputClass} value={use} onChange={(event) => setFacet("uso", event.target.value)}><option value="">Todos los usos</option>{useOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">{filtered.length} coincidencias · {selectedCount} seleccionados</p>
          <div className="flex flex-wrap gap-2">
            <Btn size="sm" variant="outline" disabled={!Object.keys(activeMatch).length} onClick={openRule}><Plus className="h-3.5 w-3.5" />Crear regla para este filtro</Btn>
            <Btn size="sm" variant="outline" disabled={!selectedCount} onClick={() => openProductEditor(selectedInFilter)}>Asignar a seleccionados</Btn>
          </div>
        </div>
        <div className="mt-4 max-h-[520px] overflow-auto rounded-xl border border-border/70">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="sticky top-0 z-10 bg-muted/80 text-xs text-muted-foreground backdrop-blur"><tr>
              <th className="w-10 px-3 py-3"><input type="checkbox" aria-label="Seleccionar productos visibles" checked={visibleProducts.length > 0 && visibleProducts.every((p) => selected.includes(p.id))} onChange={toggleVisible} className="h-4 w-4 accent-foreground" /></th>
              <th className="px-2 py-3 font-medium">Producto</th><th className="px-3 py-3 font-medium">Contenido</th><th className="px-3 py-3 text-right font-medium">Acción</th>
            </tr></thead>
            <tbody className="divide-y divide-border/60">
              {visibleProducts.map((product) => {
                const override = config.products?.[product.id];
                const resolved = resolveProductContent(product, config);
                const thumb = resolved.images[0]?.url || imageUrl(product);
                return <tr key={product.id} className="transition hover:bg-muted/30">
                  <td className="px-3 py-2.5"><input type="checkbox" aria-label={`Seleccionar ${product.nombre}`} checked={selected.includes(product.id)} onChange={() => toggleOne(product.id)} className="h-4 w-4 accent-foreground" /></td>
                  <td className="max-w-[300px] px-2 py-2.5"><div className="flex min-w-0 items-center gap-3"><div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-muted"><ImagePreview src={thumb} tiendaUrl={tiendaUrl} className="h-full w-full object-cover" /></div><div className="min-w-0"><p className="truncate text-xs font-medium text-foreground">{product.nombre}</p><p className="truncate text-[10px] text-muted-foreground">{[product.codigo, product.categoria, product.subcategoria].filter(Boolean).join(" · ")}</p></div></div></td>
                  <td className="px-3 py-2.5">{override ? <span className="rounded-full border border-foreground/10 bg-muted/40 px-2.5 py-1 text-[10px] font-medium">Excepción</span> : resolved.source.images !== "catalogo" || resolved.source.description !== "catalogo" ? <span className="rounded-full border border-foreground/10 bg-muted/40 px-2.5 py-1 text-[10px] font-medium">Por regla</span> : <span className="text-xs text-muted-foreground">Catálogo</span>}</td>
                  <td className="px-3 py-2.5 text-right"><button type="button" onClick={() => openProductEditor([product.id])} className="rounded-full px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-muted">Editar</button></td>
                </tr>;
              })}
            </tbody>
          </table>
          {filtered.length > 100 ? <p className="border-t border-border/60 px-3 py-2 text-xs text-muted-foreground">Mostrando 100 de {filtered.length}. Refiná los filtros para ver otros.</p> : null}
          {!filtered.length ? <p className="px-4 py-10 text-center text-sm text-muted-foreground">No hay productos que coincidan con estos filtros.</p> : null}
        </div>
      </Panel>

      <div className="space-y-4">
        <Panel title="Herencia global" description="Base para todo el catálogo. Las reglas más específicas pueden reemplazarla." action={<Btn size="sm" variant="outline" onClick={() => setEditor({ kind: "global", content: { ...config.global } })}>Editar</Btn>}>
          <div className="flex items-center gap-3"><div className="relative h-12 w-12 overflow-hidden rounded-xl bg-muted"><ImagePreview src={config.global?.images?.[0]?.url} tiendaUrl={tiendaUrl} className="h-full w-full object-cover" /></div><p className="line-clamp-2 text-xs leading-5 text-muted-foreground">{config.global?.description || "Sin descripción general definida."}</p></div>
        </Panel>
        <Panel title="Reglas activas" description="Se aplican a cada producto que coincida; los cambios también alcanzan futuras variantes.">
          <div className="space-y-2">
            {config.rules.map((rule) => <div key={rule.id} className="flex items-start justify-between gap-3 rounded-xl border border-border/60 p-3">
              <div className="min-w-0"><p className="text-xs font-medium text-foreground">{categoryLabel(rule) || "Filtro"}</p><p className="mt-1 truncate text-[11px] text-muted-foreground">{rule.content?.description ? "Descripción" : "Hereda descripción"} · {Array.isArray(rule.content?.images) ? `${rule.content.images.length} imágenes` : "hereda imágenes"}</p></div>
              <div className="flex shrink-0 gap-1"><button type="button" aria-label="Editar regla" onClick={() => setEditor({ ...rule, kind: "rule", content: { ...rule.content } })} className="rounded-full px-2.5 py-1.5 text-xs text-foreground hover:bg-muted">Editar</button><button type="button" aria-label="Eliminar regla" onClick={() => deleteRule(rule.id)} className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button></div>
            </div>)}
            {!config.rules.length ? <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">Todavía no hay reglas por categoría o tipo.</p> : null}
          </div>
        </Panel>
      </div>
    </div>

    <ContentEditor editor={editor} onChange={setEditor} onCancel={() => setEditor(null)} onCommit={commitEditor} media={media} uploadImage={uploadImage} busy={saving} previewProduct={previewProduct} previewContent={previewContent} tiendaUrl={tiendaUrl} />
  </div>;
}
