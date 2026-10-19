"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, Check, Copy, ImagePlus, Loader2, Plus, Save, Trash2, X, ZoomIn } from "lucide-react";
import Image from "next/image";
import { toast } from "react-hot-toast";
import { Btn } from "@/components/tienda-web/ui";
import { cn } from "@/lib/utils";
import { previewUrl, productsForConfiguredSection } from "@/lib/tienda-web-ui";
import { isProjectDraftDirty } from "@/lib/tienda-obras-draft";
import { SortableItem, SortableList } from "@/components/tienda-web/SortableList";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const TOAST_OPTIONS = { duration: 4200, position: "top-right" };
const notify = (kind, message) => {
  if (!message) return;
  if (kind === "success") toast.success(message, TOAST_OPTIONS);
  else if (kind === "error") toast.error(message, TOAST_OPTIONS);
  else toast(message, TOAST_OPTIONS);
};

const uid = (prefix) => `${prefix}-${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36)}`;
const slugify = (value) => String(value || "obra").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "nueva-obra";
const MediaContext = createContext({ media: null, tiendaUrl: "" });

function createAccessorySection() {
  return {
    id: uid("accessories-section"),
    eyebrow: "Adicionales",
    title: "Completá tu proyecto",
    description: "",
    contentEyebrow: "Opciones",
    items: [],
  };
}

function getAccessorySections(pageContent) {
  const sections = Array.isArray(pageContent?.accessoriesSections)
    ? pageContent.accessoriesSections
    : pageContent?.accessories && typeof pageContent.accessories === "object"
      ? [pageContent.accessories]
      : [];
  return sections.filter((section) => section && typeof section === "object").map((section, index) => ({
    ...section,
    id: section.id || `accessories-section-${index + 1}`,
    items: Array.isArray(section.items) ? section.items : [],
  }));
}

function newProject() {
  const title = "Nueva obra";
  const slug = `nueva-obra-${Date.now().toString(36)}`;
  const accessoriesSection = createAccessorySection();
  return {
    slug,
    title,
    category: "Construcción",
    status: "inactive",
    workTypeCard: { description: "", features: [], icon: "hammer", imagePortrait: "", imageLandscape: "" },
    seo: { title: `${title} - Maderas Caballero`, description: "Conocé nuestros trabajos y soluciones en madera.", keywords: [], ogImage: "", canonical: `/obras/${slug}` },
    banner: { id: uid("banner"), autoplayInterval: 6000, showControls: true, showIndicators: true, slides: [{ id: uid("slide"), title, subtitle: "Diseño y construcción a medida", description: "Soluciones en madera pensadas para cada proyecto.", backgroundImage: "", mobileBackgroundImage: "", ctaText: "Ver trabajos", ctaUrl: "#gallery", secondaryCtaText: "Solicitar presupuesto", secondaryCtaUrl: "#contacto", overlayOpacity: 0.5 }] },
    info: { id: uid("info"), title, description: "", features: [], images: [] },
    services: [],
    gallery: { id: uid("gallery"), title: `Galería de ${title}`, description: "", categories: [], items: [] },
    testimonials: [],
    faqs: [],
    contact: { id: uid("contact"), title: "Hablemos de tu proyecto", description: "", phone: "", email: "", whatsapp: "", address: "", workingHours: [], socialLinks: [] },
    pageContent: { options: { eyebrow: "Materiales", title: "Elegí los materiales", description: "", consultationLabel: "Consultar", consultationHref: "#contacto", items: [] }, accessories: accessoriesSection, accessoriesSections: [accessoriesSection], services: { enabled: true, eyebrow: "Servicios", title: "Nuestros servicios", description: "Soluciones completas para llevar tu proyecto a la realidad." } },
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

const IMAGE_GUIDE = {
  panoramic: { ratio: "21:10", size: "2400 × 1143 px", className: "aspect-[21/10]" },
  advisory: { ratio: "21:10", size: "2400 × 1143 px", className: "aspect-[21/10]" },
  about: { ratio: "36:25", size: "1800 × 1250 px", className: "aspect-[36/25]" },
  wide: { ratio: "3:1", size: "2400 × 800 px", className: "aspect-[3/1]" },
  landscape: { ratio: "3:2", size: "1800 × 1200 px", className: "aspect-[3/2]" },
  square: { ratio: "1:1", size: "1200 × 1200 px", className: "aspect-square" },
  portrait: { ratio: "4:5", size: "1080 × 1350 px", className: "aspect-[4/5]" },
};

const WORK_TYPE_ICON_OPTIONS = [["anchor", "Ancla"], ["flame", "Fuego"], ["tree", "Árbol"], ["fence", "Cerco"], ["layout", "Deck"], ["hammer", "Martillo"]];

function projectDraftWithLegacyWorkType(project, obrasInicioContent) {
  if (!project) return project;
  if (!project.workTypeCard && !Array.isArray(obrasInicioContent?.workTypes?.items)) return project;
  const legacy = (obrasInicioContent?.workTypes?.items || []).find((item) => item.slug === project.slug);
  const card = project.workTypeCard && typeof project.workTypeCard === "object" ? project.workTypeCard : {};
  const projectFeatures = project.pageContent?.hero?.services?.length
    ? project.pageContent.hero.services
    : project.info?.features || [];
  const features = Array.isArray(card.features)
    ? card.features
    : Array.isArray(legacy?.features)
      ? legacy.features
      : projectFeatures.map((feature) => typeof feature === "string" ? feature : feature?.title || feature?.description || "").filter(Boolean).slice(0, 4);
  const oldCardImageIsLandscape = card.imageRatio === "3:2";
  const portraitFallback = project.homeCardImage || legacy?.image || project.banner?.slides?.[0]?.backgroundImage || project.seo?.ogImage || "";

  return {
    ...project,
    workTypeCard: {
      description: typeof card.description === "string" ? card.description : legacy?.summary ?? project.seo?.description ?? project.info?.description ?? "",
      features,
      icon: typeof card.icon === "string" && card.icon ? card.icon : legacy?.icon || "hammer",
      imagePortrait: typeof card.imagePortrait === "string"
        ? card.imagePortrait
        : oldCardImageIsLandscape
          ? portraitFallback
          : typeof card.image === "string" ? card.image : portraitFallback,
      imageLandscape: typeof card.imageLandscape === "string"
        ? card.imageLandscape
        : oldCardImageIsLandscape ? card.image || "" : "",
    },
  };
}

function ImageField({ label, value, onChange, uploadImage, media, tiendaUrl, multiline = false, ratio, showImageLabels = true }) {
  const mediaContext = useContext(MediaContext);
  media = media || mediaContext.media;
  const storeUrl = tiendaUrl || mediaContext.tiendaUrl;
  const visibleLabel = label.replace(/\s*\(una URL por línea\)/i, "");
  const labelText = visibleLabel.toLocaleLowerCase("es");
  const ratioKey = ratio || (labelText.includes("material") || labelText.includes("opción") || labelText === "imagen principal" ? "square" : labelText.includes("compartir") || labelText.includes("fondo") || labelText.includes("soluciones") ? "panoramic" : labelText.includes("adicional") || labelText.includes("complement") ? "wide" : "landscape");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const [showLibrary, setShowLibrary] = useState(false);
  const [expandedImage, setExpandedImage] = useState("");
  const closePreviewRef = useRef(null);
  const images = multiline ? String(value || "").split("\n").map((image) => image.trim()).filter(Boolean) : value ? [value] : [];
  const guide = IMAGE_GUIDE[ratioKey] || IMAGE_GUIDE.landscape;
  const library = (media?.items || []).filter((item) => item?.url && item?.mime?.startsWith("image/"));
  const update = (next) => onChange(multiline ? next.join("\n") : next[0] || "");
  useEffect(() => {
    if (!expandedImage) return undefined;
    const previouslyFocused = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setExpandedImage("");
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    closePreviewRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, [expandedImage]);
  const upload = async (fileList) => {
    const files = Array.from(fileList || []).filter(Boolean);
    if (!files.length || uploading) return;
    setUploading(true);
    setUploadProgress({ current: 0, total: files.length });
    const nextImages = [...images];
    const failures = [];
    let uploadedCount = 0;
    let ratioMismatchCount = 0;
    try {
      for (const [index, file] of files.entries()) {
        try {
          const item = await uploadImage(file, "obras");
          if (!item?.url) throw new Error("No se recibió la dirección de la imagen cargada.");
          if (multiline) {
            if (!nextImages.includes(item.url)) nextImages.push(item.url);
          } else {
            nextImages.splice(0, nextImages.length, item.url);
          }
          uploadedCount += 1;
          const sourceWidth = Number(item.sourceWidth || item.width) || 0;
          const sourceHeight = Number(item.sourceHeight || item.height) || 0;
          const targetRatio = Number(guide.ratio.split(":")[0]) / Number(guide.ratio.split(":")[1]);
          if (sourceWidth && sourceHeight && Math.abs(sourceWidth / sourceHeight - targetRatio) > 0.2) ratioMismatchCount += 1;
        } catch (cause) {
          failures.push(`${file.name || "Imagen"}: ${cause?.message || "no se pudo cargar"}`);
        } finally {
          setUploadProgress({ current: index + 1, total: files.length });
        }
      }
      if (uploadedCount) {
        update(nextImages);
        notify("success", multiline ? `${uploadedCount} ${uploadedCount === 1 ? "imagen cargada" : "imágenes cargadas"}.` : "Imagen cargada.");
      }
      if (failures.length) {
        const detail = failures[0];
        notify("error", failures.length === 1 ? detail : `Fallaron ${failures.length} de ${files.length} cargas. ${detail}`);
      }
      if (ratioMismatchCount) {
        notify("info", `${ratioMismatchCount} ${ratioMismatchCount === 1 ? "imagen no tiene" : "imágenes no tienen"} la proporción recomendada ${guide.ratio} (${guide.size}); se recortará${ratioMismatchCount === 1 ? "" : "n"} al centro.`);
      }
    } finally {
      setUploading(false);
      setUploadProgress({ current: 0, total: 0 });
    }
  };
  const choose = (url) => {
    if (uploading) return;
    if (multiline) update(images.includes(url) ? images : [...images, url]);
    else update([url]);
    if (!multiline) setShowLibrary(false);
  };
  return <div className="min-w-0 space-y-2">
    <div className="flex flex-wrap items-baseline justify-between gap-2"><span className="text-xs font-medium text-default-600">{visibleLabel}</span><span className="text-[10px] text-default-400">Ideal {guide.ratio} · {guide.size}</span></div>
    {images.length ? <div className={cn("grid gap-2", multiline ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2 sm:grid-cols-3")}>
      {images.map((image, index) => <div key={`${image}-${index}`} className="group relative overflow-hidden rounded-xl border border-border/70 bg-muted/30">
        <button type="button" aria-label={`Ampliar ${visibleLabel} ${index + 1}`} onClick={() => setExpandedImage(image)} className={cn("group/preview relative block w-full overflow-hidden bg-muted outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-foreground", guide.className)}>
          {previewUrl(image, storeUrl) ? <Image src={previewUrl(image, storeUrl) || image} alt="" fill unoptimized sizes="160px" className="object-cover transition duration-300 group-hover/preview:scale-[1.03]" onError={(event) => { event.currentTarget.style.visibility = "hidden"; }} /> : null}
          <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition group-hover/preview:bg-black/25 group-hover/preview:opacity-100 group-focus-visible/preview:bg-black/25 group-focus-visible/preview:opacity-100"><ZoomIn className="h-5 w-5 drop-shadow" /></span>
        </button>
         {showImageLabels ? <span className="absolute bottom-1.5 left-1.5 max-w-[calc(100%-3rem)] truncate rounded-full bg-background/90 px-2 py-1 text-[10px] font-medium text-foreground">{index === 0 ? "Principal" : `Imagen ${index + 1}`}</span> : null}
         <button type="button" disabled={uploading} aria-label={`Quitar ${visibleLabel} ${index + 1}`} onClick={() => update(images.filter((_, i) => i !== index))} className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-background/90 text-muted-foreground shadow-sm transition hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground disabled:opacity-50"><X className="h-3.5 w-3.5" /></button>
      </div>)}
    </div> : <div className={cn("flex items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 text-xs text-muted-foreground", multiline ? "min-h-20" : cn("w-full", guide.className))}>Sin imagen seleccionada</div>}
    <div className="flex flex-wrap items-center gap-2">
      <label className={cn("inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full bg-foreground px-3 text-[11px] font-medium text-background transition hover:opacity-85", uploading && "pointer-events-none opacity-60")}>
         {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}{uploading ? multiline && uploadProgress.total > 1 ? `Subiendo ${uploadProgress.current}/${uploadProgress.total}…` : "Subiendo…" : multiline ? "Subir imágenes" : "Subir imagen"}
         <input className="sr-only" type="file" multiple={multiline} accept="image/jpeg,image/png,image/webp,image/avif" disabled={uploading} onChange={(event) => { void upload(event.target.files); event.target.value = ""; }} />
       </label>
       <button type="button" disabled={uploading} onClick={() => setShowLibrary((open) => !open)} className="h-8 rounded-full border border-border px-3 text-[11px] font-medium text-default-600 transition hover:bg-default-50 disabled:opacity-50">{showLibrary ? "Cerrar biblioteca" : "Elegir de biblioteca"}</button>
       {multiline ? <span className="text-[10px] text-default-400">Podés seleccionar varias imágenes o cargarlas en lote.</span> : null}
    </div>
    {showLibrary ? <div className="rounded-xl border border-border bg-muted/20 p-2.5">
      {library.length ? <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">{library.map((item) => <button key={item.id || item.key || item.url} type="button" aria-label="Elegir imagen de la biblioteca" onClick={() => choose(item.url)} className="relative aspect-square overflow-hidden rounded-lg bg-muted outline-none ring-1 ring-border hover:ring-2 hover:ring-foreground focus-visible:ring-2 focus-visible:ring-foreground"><Image src={previewUrl(item.url, storeUrl) || item.url} alt="" fill unoptimized sizes="120px" className="object-cover" onError={(event) => { event.currentTarget.style.visibility = "hidden"; }} />{images.includes(item.url) ? <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-foreground text-background"><Check className="h-3 w-3" /></span> : null}</button>)}</div> : <p className="px-2 py-3 text-xs text-muted-foreground">Todavía no hay imágenes cargadas.</p>}
    </div> : null}
    {expandedImage ? <div role="dialog" aria-modal="true" aria-label={`Vista ampliada: ${visibleLabel}`} onMouseDown={(event) => { if (event.target === event.currentTarget) setExpandedImage(""); }} className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm sm:p-8">
      <button ref={closePreviewRef} type="button" aria-label="Cerrar vista ampliada" onClick={() => setExpandedImage("")} className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"><X className="h-5 w-5" /></button>
      <div className="relative h-[88vh] w-[94vw]"><Image src={previewUrl(expandedImage, storeUrl) || expandedImage} alt={`${visibleLabel} ampliada`} fill unoptimized sizes="94vw" className="rounded-lg object-contain shadow-2xl" /></div>
    </div> : null}
  </div>;
}

function ListEditor({ title, items, onAdd, children }) {
  return <Card title={title} action={<Btn size="sm" variant="outline" onClick={onAdd}><Plus className="h-3.5 w-3.5" />Agregar</Btn>}>
    {items.length ? <div className="space-y-3">{items.map((item, index) => <div key={item.id || index} className="relative rounded-lg border border-border/70 bg-background p-3 pr-11">{children(item, index)}<button type="button" aria-label={`Quitar elemento ${index + 1}`} onClick={() => onAdd(index, true)} className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-md text-default-400 transition hover:bg-red-50 hover:text-destructive"><Trash2 className="h-4 w-4" /></button></div>)}</div>
      : <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-xs text-default-500">Todavía no hay elementos.</p>}
  </Card>;
}

function HomeField({ label, value, onChange, maxLength = 180, multiline = false, hint }) {
  const common = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition placeholder:text-default-400 focus:border-primary focus:ring-2 focus:ring-primary/10";
  return <label className="block min-w-0 space-y-1.5">
    <span className="flex items-center justify-between gap-2 text-xs font-medium text-default-600"><span>{label}</span><span className="shrink-0 text-[10px] font-normal text-default-400">{String(value || "").length}/{maxLength}</span></span>
    {multiline ? <textarea maxLength={maxLength} className={cn(common, "min-h-20 resize-y")} value={value ?? ""} onChange={(event) => onChange(event.target.value)} />
      : <input maxLength={maxLength} className={common} value={value ?? ""} onChange={(event) => onChange(event.target.value)} />}
    {hint ? <span className="block text-[10px] leading-4 text-default-400">{hint}</span> : null}
  </label>;
}

const BENEFIT_ICON_OPTIONS = [["truck", "Envíos"], ["headphones", "Asesoramiento"], ["shield", "Garantía"], ["package", "Stock"]];
const PILLAR_ICON_OPTIONS = [["sprout", "Ideas"], ["boxes", "Productos"], ["badge", "Calidad"], ["pin", "Local"]];

export function HomeContentEditor({ value, onChange, uploadImage, media, tiendaUrl, onNavigateTab, sections = [], products = [], productsLoading = false }) {
  const content = value || {};
  const updatePath = (path, nextValue) => {
    const next = structuredClone(content);
    let target = next;
    for (let index = 0; index < path.length - 1; index += 1) target = target[path[index]] = { ...(target[path[index]] || {}) };
    target[path[path.length - 1]] = nextValue;
    onChange(next);
  };
  const updateEntry = (path, index, patch) => {
    const next = structuredClone(content);
    const list = path.reduce((object, key) => object?.[key], next);
    list[index] = { ...list[index], ...patch };
    onChange(next);
  };
  const addEntry = (path, seed) => {
    const next = structuredClone(content);
    path.reduce((object, key) => object[key], next).push(seed);
    onChange(next);
  };
  const removeEntry = (path, index) => {
    const next = structuredClone(content);
    path.reduce((object, key) => object[key], next).splice(index, 1);
    onChange(next);
  };
  const reorderTextList = (value) => value.split("\n").slice(0, 6);
  const popup = content.offerPopup || {};
  const updatePopup = (patch) => updatePath(["offerPopup"], { ...popup, ...patch });
  const selectedPopupSection = sections.find((section) => section.id === popup.sectionId);
  const popupMatches = selectedPopupSection ? productsForConfiguredSection(selectedPopupSection, products).length : 0;

  return <div className="space-y-4">
    <Card title="Frases destacadas de la portada" description="Se muestran debajo del carrusel. Hasta 6 frases; máximo 48 caracteres cada una.">
      <HomeField label="Una frase por línea" value={(content.highlights || []).join("\n")} maxLength={300} multiline onChange={(next) => updatePath(["highlights"], reorderTextList(next).map((item) => item.slice(0, 48)))} />
    </Card>
    <Card title="Encabezado de categorías" description="Las tarjetas e imágenes se editan desde la pestaña Categorías.">
      <div className="grid gap-3 sm:grid-cols-2"><HomeField label="Antetítulo" value={content.categories?.eyebrow} maxLength={40} onChange={(next) => updatePath(["categories", "eyebrow"], next)} /><HomeField label="Título" value={content.categories?.title} maxLength={80} onChange={(next) => updatePath(["categories", "title"], next)} /><div className="sm:col-span-2"><HomeField label="Descripción" value={content.categories?.description} maxLength={180} multiline onChange={(next) => updatePath(["categories", "description"], next)} /></div></div>
    </Card>
    <Card title="Beneficios" description="Se conservan las tarjetas y sus íconos. Hasta 8 beneficios; título 64 caracteres y descripción 180.">
      <div className="grid gap-3 sm:grid-cols-2"><HomeField label="Antetítulo" value={content.benefits?.eyebrow} maxLength={40} onChange={(next) => updatePath(["benefits", "eyebrow"], next)} /><HomeField label="Título" value={content.benefits?.title} maxLength={80} onChange={(next) => updatePath(["benefits", "title"], next)} /><div className="sm:col-span-2"><HomeField label="Descripción" value={content.benefits?.description} maxLength={180} multiline onChange={(next) => updatePath(["benefits", "description"], next)} /></div></div>
      <div className="mt-4"><ListEditor title="Tarjetas de beneficios" items={content.benefits?.items || []} onAdd={(index, remove) => remove ? removeEntry(["benefits", "items"], index) : addEntry(["benefits", "items"], { id: uid("beneficio"), icon: "package", title: "Nuevo beneficio", detail: "" })}>{(item, index) => <div className="grid gap-3 sm:grid-cols-2"><label className="block space-y-1.5"><span className="text-xs font-medium text-default-600">Ícono</span><select className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" value={item.icon} onChange={(event) => updateEntry(["benefits", "items"], index, { icon: event.target.value })}>{BENEFIT_ICON_OPTIONS.map(([icon, label]) => <option key={icon} value={icon}>{label}</option>)}</select></label><HomeField label="Título" value={item.title} maxLength={64} onChange={(next) => updateEntry(["benefits", "items"], index, { title: next })} /><div className="sm:col-span-2"><HomeField label="Descripción" value={item.detail} maxLength={180} multiline onChange={(next) => updateEntry(["benefits", "items"], index, { detail: next })} /></div></div>}</ListEditor></div>
    </Card>
    <Card title="Tarjetas de obras" description="Las tarjetas se generan con la imagen configurada en “Tarjeta en Tipos de obras” para cada obra publicada y respetan el orden de la lista.">
      <div className="grid gap-3 sm:grid-cols-2"><HomeField label="Antetítulo" value={content.works?.eyebrow} maxLength={40} onChange={(next) => updatePath(["works", "eyebrow"], next)} /><HomeField label="Título" value={content.works?.title} maxLength={80} onChange={(next) => updatePath(["works", "title"], next)} /><div className="sm:col-span-2"><HomeField label="Descripción" value={content.works?.description} maxLength={180} multiline onChange={(next) => updatePath(["works", "description"], next)} /></div><HomeField label="Texto del botón" value={content.works?.linkLabel} maxLength={36} onChange={(next) => updatePath(["works", "linkLabel"], next)} /></div>
    </Card>
    <Card title="Asesoramiento" description="Imagen apaisada recomendada 21:10 · 2400 × 1143 px. Se adapta al recorte del diseño actual.">
      <div className="grid gap-3 sm:grid-cols-2"><HomeField label="Etiqueta" value={content.advisory?.badge} maxLength={40} onChange={(next) => updatePath(["advisory", "badge"], next)} /><HomeField label="Título" value={content.advisory?.title} maxLength={90} onChange={(next) => updatePath(["advisory", "title"], next)} /><div className="sm:col-span-2"><HomeField label="Descripción" value={content.advisory?.description} maxLength={220} multiline onChange={(next) => updatePath(["advisory", "description"], next)} /></div><div className="sm:col-span-2"><ImageField label="Imagen de fondo" value={content.advisory?.image} ratio="advisory" onChange={(next) => updatePath(["advisory", "image"], next)} uploadImage={uploadImage} media={media} tiendaUrl={tiendaUrl} /></div><HomeField label="Texto alternativo de la imagen" value={content.advisory?.imageAlt} maxLength={140} onChange={(next) => updatePath(["advisory", "imageAlt"], next)} /><HomeField label="Botón de WhatsApp" value={content.advisory?.whatsappLabel} maxLength={40} onChange={(next) => updatePath(["advisory", "whatsappLabel"], next)} /><HomeField label="Botón de obras" value={content.advisory?.worksLabel} maxLength={32} onChange={(next) => updatePath(["advisory", "worksLabel"], next)} /></div>
    </Card>
    <Card title="Nosotros" description="La imagen se muestra aproximadamente en 3:2 en móvil y 36:25 en escritorio.">
      <div className="grid gap-3 sm:grid-cols-2"><HomeField label="Antetítulo" value={content.about?.eyebrow} maxLength={40} onChange={(next) => updatePath(["about", "eyebrow"], next)} /><HomeField label="Título" value={content.about?.title} maxLength={100} multiline hint="Usá un salto de línea para definir el corte del título." onChange={(next) => updatePath(["about", "title"], next)} /><div className="sm:col-span-2"><HomeField label="Descripción" value={content.about?.description} maxLength={180} multiline onChange={(next) => updatePath(["about", "description"], next)} /></div><div className="sm:col-span-2"><ImageField label="Imagen de historia" value={content.about?.image} ratio="about" onChange={(next) => updatePath(["about", "image"], next)} uploadImage={uploadImage} media={media} tiendaUrl={tiendaUrl} /></div><HomeField label="Texto alternativo de la imagen" value={content.about?.imageAlt} maxLength={140} onChange={(next) => updatePath(["about", "imageAlt"], next)} /><HomeField label="Ubicación debajo de la imagen" value={content.about?.location} maxLength={60} onChange={(next) => updatePath(["about", "location"], next)} /></div>
      <div className="mt-4"><ListEditor title="Historia" items={content.about?.story || []} onAdd={(index, remove) => remove ? removeEntry(["about", "story"], index) : addEntry(["about", "story"], { id: uid("hito"), title: "Nuevo hito", text: "" })}>{(item, index) => <div className="grid gap-3"><HomeField label="Título" value={item.title} maxLength={60} onChange={(next) => updateEntry(["about", "story"], index, { title: next })} /><HomeField label="Texto" value={item.text} maxLength={220} multiline onChange={(next) => updateEntry(["about", "story"], index, { text: next })} /></div>}</ListEditor></div>
      <div className="mt-4"><ListEditor title="Pilares" items={content.about?.pillars || []} onAdd={(index, remove) => remove ? removeEntry(["about", "pillars"], index) : addEntry(["about", "pillars"], { id: uid("pilar"), icon: "sprout", title: "Nuevo pilar", description: "" })}>{(item, index) => <div className="grid gap-3 sm:grid-cols-2"><label className="block space-y-1.5"><span className="text-xs font-medium text-default-600">Ícono</span><select className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" value={item.icon} onChange={(event) => updateEntry(["about", "pillars"], index, { icon: event.target.value })}>{PILLAR_ICON_OPTIONS.map(([icon, label]) => <option key={icon} value={icon}>{label}</option>)}</select></label><HomeField label="Título" value={item.title} maxLength={56} onChange={(next) => updateEntry(["about", "pillars"], index, { title: next })} /><div className="sm:col-span-2"><HomeField label="Descripción" value={item.description} maxLength={140} multiline onChange={(next) => updateEntry(["about", "pillars"], index, { description: next })} /></div></div>}</ListEditor></div>
    </Card>
    <Card title="Instagram" description="Se cambia el texto del bloque; el identificador apunta al widget de Elfsight.">
      <div className="grid gap-3 sm:grid-cols-2"><HomeField label="Antetítulo" value={content.instagram?.eyebrow} maxLength={40} onChange={(next) => updatePath(["instagram", "eyebrow"], next)} /><HomeField label="Título" value={content.instagram?.title} maxLength={80} onChange={(next) => updatePath(["instagram", "title"], next)} /><div className="sm:col-span-2"><HomeField label="Descripción" value={content.instagram?.description} maxLength={180} multiline onChange={(next) => updatePath(["instagram", "description"], next)} /></div><HomeField label="ID del widget" value={content.instagram?.appId} maxLength={80} hint="No lo cambies salvo que tengas un ID nuevo del widget." onChange={(next) => updatePath(["instagram", "appId"], next)} /></div>
    </Card>
    <Card title="Ventana de ofertas" description="El popup utiliza exactamente los productos que coinciden con una sección dinámica activa de la portada.">
      <div className="space-y-4">
        <label className="flex items-center justify-between gap-4 rounded-lg border border-border px-4 py-3">
          <span><span className="block text-sm font-medium">Activar popup</span><span className="mt-0.5 block text-xs text-default-500">Si está apagado, no aparece en la tienda.</span></span>
          <input type="checkbox" checked={popup.enabled !== false} onChange={(event) => updatePopup({ enabled: event.target.checked })} className="h-4 w-4 accent-primary" />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block min-w-0 space-y-1.5"><span className="text-xs font-medium text-default-600">Sección de productos</span><select className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" value={popup.sectionId || ""} onChange={(event) => updatePopup({ sectionId: event.target.value })}>
            <option value="">Elegí una sección</option>
            {sections.map((section) => <option key={section.id} value={section.id}>{section.titulo || section.id}{section.activa ? "" : " (inactiva)"}</option>)}
          </select></label>
          <label className="block min-w-0 space-y-1.5"><span className="text-xs font-medium text-default-600">Cómo elegir el producto</span><select className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" value={popup.selectionStrategy || "random"} onChange={(event) => updatePopup({ selectionStrategy: event.target.value })}><option value="random">Al azar entre los productos de la sección</option><option value="first">Primero de la sección</option><option value="highestDiscount">Mayor descuento</option></select></label>
        </div>
        {!selectedPopupSection || !selectedPopupSection.activa ? <p role="status" className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-800 dark:text-amber-300">La sección seleccionada no está activa o ya no existe. El popup no mostrará productos hasta elegir una sección activa. <button type="button" onClick={() => onNavigateTab?.("secciones")} className="font-semibold underline underline-offset-2">Revisar secciones</button></p> : null}
        {selectedPopupSection?.activa && (productsLoading ? <p className="text-xs text-default-500">Comprobando los productos de la sección…</p> : popupMatches ? <p className="text-xs text-default-500">{popupMatches} productos pertenecen a esta sección; el popup elegirá entre los primeros {Math.min(popupMatches, selectedPopupSection.limite)}.</p> : <p className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">No hay productos en esta sección, así que el popup no aparecerá hasta que haya alguno.</p>)}
        {popup.enabled && !popup.showOnDesktop && !popup.showOnMobile ? <p role="status" className="text-xs text-amber-700">El popup está activado, pero no se mostrará en ningún dispositivo.</p> : null}
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block space-y-1.5"><span className="text-xs font-medium text-default-600">Demora inicial (segundos)</span><input type="number" min="0" max="120" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" value={popup.delaySeconds ?? 3} onChange={(event) => updatePopup({ delaySeconds: event.target.value })} /></label>
          <label className="block space-y-1.5"><span className="text-xs font-medium text-default-600">Tiempo visible (segundos)</span><input type="number" min="2" max="120" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" value={popup.durationSeconds ?? 8} onChange={(event) => updatePopup({ durationSeconds: event.target.value })} /></label>
          <label className="block space-y-1.5"><span className="text-xs font-medium text-default-600">Pausa entre avisos (minutos)</span><input type="number" min="1" max="1440" disabled={popup.oncePerSession} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm disabled:opacity-50" value={popup.repeatEveryMinutes ?? 1} onChange={(event) => updatePopup({ repeatEveryMinutes: event.target.value })} /></label>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          {[["oncePerSession", "Mostrar una sola vez por sesión"], ["showOnDesktop", "Mostrar en computadora"], ["showOnMobile", "Mostrar en celular"]].map(([key, label]) => <label key={key} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2.5 text-xs"><input type="checkbox" checked={Boolean(popup[key])} onChange={(event) => updatePopup({ [key]: event.target.checked })} className="h-4 w-4 accent-primary" />{label}</label>)}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <HomeField label="Etiqueta" value={popup.badge} maxLength={32} onChange={(next) => updatePopup({ badge: next })} />
          <HomeField label="Título" value={popup.title} maxLength={48} onChange={(next) => updatePopup({ title: next })} />
          <HomeField label="Descripción" value={popup.description} maxLength={90} onChange={(next) => updatePopup({ description: next })} />
          <HomeField label="Botón" value={popup.buttonLabel} maxLength={32} onChange={(next) => updatePopup({ buttonLabel: next })} />
          <HomeField label="Texto al pie" value={popup.footerText} maxLength={80} onChange={(next) => updatePopup({ footerText: next })} />
        </div>
      </div>
    </Card>
  </div>;
}

function ObrasInicioContentEditor({ value, onChange, uploadImage, media, tiendaUrl }) {
  const content = value || {};
  const updatePath = (path, nextValue) => {
    const next = structuredClone(content);
    let target = next;
    for (let index = 0; index < path.length - 1; index += 1) target = target[path[index]] = { ...(target[path[index]] || {}) };
    target[path[path.length - 1]] = nextValue;
    onChange(next);
  };
  const updateEntry = (path, index, patch) => {
    const next = structuredClone(content);
    const list = path.reduce((object, key) => object?.[key], next);
    list[index] = { ...list[index], ...patch };
    onChange(next);
  };
  const addEntry = (path, seed) => {
    const next = structuredClone(content);
    path.reduce((object, key) => object[key], next).push(seed);
    onChange(next);
  };
  const removeEntry = (path, index) => {
    const next = structuredClone(content);
    path.reduce((object, key) => object[key], next).splice(index, 1);
    onChange(next);
  };
  const moveEntry = (path, from, to) => {
    const next = structuredClone(content);
    const list = path.reduce((object, key) => object[key], next);
    const [item] = list.splice(from, 1);
    list.splice(to, 0, item);
    onChange(next);
  };
  const field = (label, value, path, multiline = false) => <Field label={label} value={value} multiline={multiline} onChange={(next) => updatePath(path, next)} />;
  const icons = [["anchor", "Ancla"], ["flame", "Fuego"], ["tree", "Árbol"], ["fence", "Cerco"], ["layout", "Deck"], ["hammer", "Martillo"]];

  return <div className="space-y-4">

    <Card title="Portada de Obras" description="Administrá los banners que se muestran en esta portada. Son independientes de las obras publicadas.">
      <div className="grid gap-3 sm:grid-cols-2">
        {field("Antetítulo", content.hero?.eyebrow, ["hero", "eyebrow"])}
        {field("Primera línea del título", content.hero?.titleLine1, ["hero", "titleLine1"])}
        {field("Segunda línea del título", content.hero?.titleLine2, ["hero", "titleLine2"])}
        <div className="sm:col-span-2">{field("Descripción", content.hero?.description, ["hero", "description"], true)}</div>
        {field("Botón principal", content.hero?.primaryLabel, ["hero", "primaryLabel"])}
        {field("Botón secundario", content.hero?.secondaryLabel, ["hero", "secondaryLabel"])}
      </div>
      <div className="mt-5 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div><h4 className="text-xs font-semibold">Banners de portada</h4><p className="mt-1 text-[10px] text-default-500">Escritorio 21:10 · celular 4:5. Arrastrá para cambiar el orden.</p></div>
          <Btn size="sm" variant="outline" disabled={(content.hero?.slides || []).length >= 8} onClick={() => addEntry(["hero", "slides"], { id: uid("banner"), label: "Nuevo banner", href: "/obras", image: "", mobileImage: "", alt: "" })}><Plus className="h-3.5 w-3.5" />Agregar banner</Btn>
        </div>
        {(content.hero?.slides || []).length ? <SortableList
          ids={(content.hero?.slides || []).map((slide, index) => slide.id || `banner-${index + 1}`)}
          onMove={(from, to) => moveEntry(["hero", "slides"], from, to)}
          className="space-y-3"
        >
          {(content.hero?.slides || []).map((slide, index) => {
            const id = slide.id || `banner-${index + 1}`;
            return <SortableItem key={id} id={id} className="relative rounded-lg border border-border/70 bg-background p-3">
              {(dragHandle) => <div className="flex min-w-0 gap-2">
                <div className="pt-1">{dragHandle}</div>
                <div className="min-w-0 flex-1 space-y-3 pr-9">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Etiqueta" value={slide.label} onChange={(value) => updateEntry(["hero", "slides"], index, { label: value })} />
                    <Field label="Enlace" value={slide.href} onChange={(value) => updateEntry(["hero", "slides"], index, { href: value })} />
                    <div className="sm:col-span-2"><Field label="Descripción de imagen" value={slide.alt} onChange={(value) => updateEntry(["hero", "slides"], index, { alt: value })} /></div>
                    <div className="sm:col-span-2"><ImageField label="Imagen de escritorio" value={slide.image} ratio="panoramic" onChange={(image) => updateEntry(["hero", "slides"], index, { image })} uploadImage={uploadImage} media={media} tiendaUrl={tiendaUrl} /></div>
                    <div className="sm:col-span-2"><ImageField label="Imagen para celular" value={slide.mobileImage} ratio="portrait" onChange={(mobileImage) => updateEntry(["hero", "slides"], index, { mobileImage })} uploadImage={uploadImage} media={media} tiendaUrl={tiendaUrl} /></div>
                  </div>
                </div>
                <button type="button" aria-label={`Quitar banner ${index + 1}`} onClick={() => removeEntry(["hero", "slides"], index)} className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-md text-default-400 transition hover:bg-red-50 hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
              </div>}
            </SortableItem>;
          })}
        </SortableList> : <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-xs text-default-500">Todavía no hay banners configurados.</p>}
      </div>
    </Card>

    <Card title="Servicios destacados" description="Una frase por línea; se muestran debajo del carrusel.">
      <Field label="Frases" value={(content.highlights || []).join("\n")} multiline onChange={(value) => updatePath(["highlights"], value.split("\n").map((item) => item.trim()).filter(Boolean).slice(0, 8))} />
    </Card>

    <Card title="Tipos de obras" description="Las tarjetas se generan con las obras publicadas y se editan desde cada obra. Acá solo se configuran los textos y botones de la sección.">
      <div className="grid gap-3 sm:grid-cols-2">
        {field("Antetítulo", content.workTypes?.eyebrow, ["workTypes", "eyebrow"])}
        {field("Título", content.workTypes?.title, ["workTypes", "title"])}
        <div className="sm:col-span-2">{field("Descripción", content.workTypes?.description, ["workTypes", "description"], true)}</div>
        {field("Botón de obra publicada", content.workTypes?.detailLabel, ["workTypes", "detailLabel"])}
        {field("Botón de consulta", content.workTypes?.contactLabel, ["workTypes", "contactLabel"])}
        {field("Botón en celular", content.workTypes?.mobileLabel, ["workTypes", "mobileLabel"])}
      </div>
    </Card>

    <Card title="Reseñas de clientes" description="El widget externo sigue mostrando las reseñas; acá podés cambiar su encabezado y su identificador.">
      <div className="grid gap-3 sm:grid-cols-2">{field("Antetítulo", content.reviews?.eyebrow, ["reviews", "eyebrow"])}{field("Título", content.reviews?.title, ["reviews", "title"])}<div className="sm:col-span-2">{field("Descripción", content.reviews?.description, ["reviews", "description"], true)}</div>{field("ID del widget", content.reviews?.widgetId, ["reviews", "widgetId"])}</div>
    </Card>

    <Card title="Empresas que confían en nosotros">
      <div className="grid gap-3 sm:grid-cols-2">{field("Antetítulo", content.partners?.eyebrow, ["partners", "eyebrow"])}{field("Título", content.partners?.title, ["partners", "title"])}<div className="sm:col-span-2">{field("Descripción", content.partners?.description, ["partners", "description"], true)}</div></div>
      <div className="mt-4"><ListEditor title="Logos" items={content.partners?.items || []} onAdd={(index, remove) => remove ? removeEntry(["partners", "items"], index) : addEntry(["partners", "items"], { name: "Nueva empresa", logo: "" })}>
        {(item, index) => <div className="grid gap-3 sm:grid-cols-2"><Field label="Nombre" value={item.name} onChange={(name) => updateEntry(["partners", "items"], index, { name })} /><div className="sm:col-span-2"><ImageField label="Logo" value={item.logo} ratio="wide" onChange={(logo) => updateEntry(["partners", "items"], index, { logo })} uploadImage={uploadImage} media={media} tiendaUrl={tiendaUrl} /></div></div>}
      </ListEditor></div>
    </Card>

    <Card title="Galería de trabajos" description="Las fotos se cargan desde las galerías de las obras publicadas.">
      <div className="grid gap-3 sm:grid-cols-2">{field("Antetítulo", content.gallery?.eyebrow, ["gallery", "eyebrow"])}{field("Título", content.gallery?.title, ["gallery", "title"])}<div className="sm:col-span-2">{field("Descripción", content.gallery?.description, ["gallery", "description"], true)}</div></div>
    </Card>

    <Card title="Indicadores" description="Se muestran en la franja de resultados debajo de la galería.">
      <ListEditor title="Datos" items={content.metrics || []} onAdd={(index, remove) => remove ? removeEntry(["metrics"], index) : addEntry(["metrics"], { value: "", label: "" })}>
        {(item, index) => <div className="grid gap-3 sm:grid-cols-2"><Field label="Valor" value={item.value} onChange={(value) => updateEntry(["metrics"], index, { value })} /><Field label="Descripción" value={item.label} onChange={(label) => updateEntry(["metrics"], index, { label })} /></div>}
      </ListEditor>
    </Card>

    <Card title="Instagram" description="El widget y sus textos son exclusivos de la página de Obras.">
      <div className="grid gap-3 sm:grid-cols-2">{field("Antetítulo", content.instagram?.eyebrow, ["instagram", "eyebrow"])}{field("Título", content.instagram?.title, ["instagram", "title"])}<div className="sm:col-span-2">{field("Descripción", content.instagram?.description, ["instagram", "description"], true)}</div>{field("ID del widget", content.instagram?.appId, ["instagram", "appId"])}</div>
    </Card>

    <Card title="Preguntas frecuentes">
      <div className="grid gap-3 sm:grid-cols-2">{field("Antetítulo", content.faq?.eyebrow, ["faq", "eyebrow"])}{field("Título", content.faq?.title, ["faq", "title"])}<div className="sm:col-span-2">{field("Descripción", content.faq?.description, ["faq", "description"], true)}</div>{field("Texto del enlace de consulta", content.faq?.ctaLabel, ["faq", "ctaLabel"])}</div>
      <div className="mt-4"><ImageField label="Imagen" value={content.faq?.image} ratio="landscape" onChange={(image) => updatePath(["faq", "image"], image)} uploadImage={uploadImage} media={media} tiendaUrl={tiendaUrl} /></div>
      <div className="mt-4"><ListEditor title="Preguntas y respuestas" items={content.faq?.items || []} onAdd={(index, remove) => remove ? removeEntry(["faq", "items"], index) : addEntry(["faq", "items"], { question: "", answer: "" })}>
        {(item, index) => <div className="grid gap-3"><Field label="Pregunta" value={item.question} onChange={(question) => updateEntry(["faq", "items"], index, { question })} /><Field label="Respuesta" value={item.answer} multiline onChange={(answer) => updateEntry(["faq", "items"], index, { answer })} /></div>}
      </ListEditor></div>
    </Card>

    <Card title="Cierre y contacto" description="El WhatsApp y el teléfono se usan desde la configuración general de Contacto.">
      <div className="grid gap-3 sm:grid-cols-2">{field("Etiqueta", content.closing?.badge, ["closing", "badge"])}{field("Título", content.closing?.title, ["closing", "title"])}<div className="sm:col-span-2">{field("Descripción", content.closing?.description, ["closing", "description"], true)}</div>{field("Botón de WhatsApp", content.closing?.whatsappLabel, ["closing", "whatsappLabel"])}</div>
      <div className="mt-4"><ImageField label="Imagen de fondo" value={content.closing?.image} ratio="panoramic" onChange={(image) => updatePath(["closing", "image"], image)} uploadImage={uploadImage} media={media} tiendaUrl={tiendaUrl} /></div>
    </Card>
  </div>;
}

export default function ObrasManager({ authFetch, uploadImage, tiendaUrl, media, obrasInicioContent, onObrasInicioChange, openObrasInicio = false, onObrasInicioOpened }) {
  const [items, setItems] = useState([]);
  const [selectedSlug, setSelectedSlug] = useState("");
  const [draft, setDraft] = useState(null);
  const [version, setVersion] = useState(0);
  const [savedDraftSnapshot, setSavedDraftSnapshot] = useState(null);
  const [published, setPublished] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingMode, setSavingMode] = useState(null);
  const [section, setSection] = useState("general");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [orderVersion, setOrderVersion] = useState(0);
  const [savingOrder, setSavingOrder] = useState(false);
  const [view, setView] = useState("obras");
  const obrasInicioContentRef = useRef(obrasInicioContent);
  obrasInicioContentRef.current = obrasInicioContent;

  const load = useCallback(async (preferredSlug) => {
    setLoading(true);
    try {
      const data = await authFetch("/api/tienda/obras/admin");
      const next = data.items || [];
      setItems(next);
      setOrderVersion(Number(data.orderVersion) || 0);
      const slug = preferredSlug || next[0]?.id || "";
      const entry = next.find((item) => item.id === slug);
      const sourceProject = entry?.project || null;
      setSelectedSlug(slug);
      setDraft(projectDraftWithLegacyWorkType(sourceProject, obrasInicioContentRef.current));
      setSavedDraftSnapshot(sourceProject ? JSON.stringify(sourceProject) : null);
      setVersion(Number(entry?.version) || 0);
      setPublished(Boolean(entry?.published?.status === "active"));
    } catch (error) {
      notify("error", error.message || "No se pudieron cargar las obras.");
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!draft || draft.workTypeCard || !Array.isArray(obrasInicioContent?.workTypes?.items)) return;
    setDraft((current) => current && !current.workTypeCard
      ? projectDraftWithLegacyWorkType(current, obrasInicioContent)
      : current);
  }, [draft, obrasInicioContent]);
  useEffect(() => {
    if (!openObrasInicio) return;
    setView("inicio");
    onObrasInicioOpened?.();
  }, [openObrasInicio, onObrasInicioOpened]);

  const setPath = (path, value) => setDraft((current) => {
    const next = structuredClone(current);
    let target = next;
    for (let index = 0; index < path.length - 1; index += 1) target = target[path[index]] = { ...target[path[index]] };
    target[path[path.length - 1]] = value;
    return next;
  });
  const setAccessorySections = (update) => setDraft((current) => {
    if (!current) return current;
    const currentSections = getAccessorySections(current.pageContent);
    const sections = (typeof update === "function" ? update(currentSections) : update)
      .map((section, index) => ({
        ...section,
        id: section.id || `accessories-section-${index + 1}`,
        items: Array.isArray(section.items) ? section.items : [],
      }));
    const next = structuredClone(current);
    next.pageContent = {
      ...(next.pageContent || {}),
      accessoriesSections: sections,
      accessories: sections[0] || null,
    };
    return next;
  });
  const updateAccessorySection = (sectionIndex, patch) => setAccessorySections((sections) => sections.map((section, index) => (
    index === sectionIndex ? { ...section, ...patch } : section
  )));
  const addAccessorySection = () => setAccessorySections((sections) => [...sections, createAccessorySection()]);
  const duplicateAccessorySection = (sectionIndex) => setAccessorySections((sections) => {
    const source = sections[sectionIndex];
    if (!source) return sections;
    const duplicate = structuredClone(source);
    duplicate.id = uid("accessories-section");
    duplicate.items = (duplicate.items || []).map((item) => ({ ...item, id: uid("accessory") }));
    return [...sections.slice(0, sectionIndex + 1), duplicate, ...sections.slice(sectionIndex + 1)];
  });
  const removeAccessorySection = (sectionIndex) => setAccessorySections((sections) => sections.filter((_, index) => index !== sectionIndex));
  const moveAccessorySection = (from, to) => setAccessorySections((sections) => {
    if (from < 0 || to < 0 || from >= sections.length || to >= sections.length || from === to) return sections;
    const next = [...sections];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    return next;
  });
  const updateAccessoryItem = (sectionIndex, itemIndex, patch) => setAccessorySections((sections) => sections.map((section, index) => (
    index === sectionIndex
      ? { ...section, items: section.items.map((item, currentIndex) => currentIndex === itemIndex ? { ...item, ...patch } : item) }
      : section
  )));
  const addAccessoryItem = (sectionIndex) => setAccessorySections((sections) => sections.map((section, index) => (
    index === sectionIndex
      ? { ...section, items: [...section.items, { id: uid("accessory"), title: "", description: "", image: "", mobileImage: "" }] }
      : section
  )));
  const removeAccessoryItem = (sectionIndex, itemIndex) => setAccessorySections((sections) => sections.map((section, index) => (
    index === sectionIndex ? { ...section, items: section.items.filter((_, currentIndex) => currentIndex !== itemIndex) } : section
  )));
  const setGalleryImages = (value) => {
    const urls = String(value || "").split("\n").map((image) => image.trim()).filter(Boolean);
    const existingByImage = new Map((draft?.gallery?.items || []).filter((item) => item?.image).map((item) => [item.image, item]));
    setPath(["gallery", "items"], urls.map((image) => existingByImage.get(image) || {
      id: uid("work"),
      title: "",
      description: "",
      image,
      category: "",
    }));
  };
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
    if (saving) return;
    const project = newProject();
    setItems((current) => [...current, { id: project.slug, project, draft: project, version: 0 }]);
    setSelectedSlug(project.slug);
    setDraft(project);
    setVersion(0);
    setSavedDraftSnapshot(null);
    setPublished(false);
    setSection("general");
  };

  const duplicateProject = (item) => {
    if (saving) return;
    const source = item.project || item.draft || item.published;
    if (!source) return;
    const base = `${slugify(source.slug || source.title)}-copia`;
    let slug = base;
    let suffix = 2;
    while (items.some((entry) => entry.id === slug)) slug = `${base}-${suffix++}`;
    const now = new Date().toISOString();
    const cloneWithFreshIds = (value) => {
      if (Array.isArray(value)) return value.map(cloneWithFreshIds);
      if (!value || typeof value !== "object") return value;
      return Object.fromEntries(Object.entries(value).map(([key, child]) => [
        key,
        key === "id" && child ? uid(String(child).split("-")[0] || "item") : cloneWithFreshIds(child),
      ]));
    };
    const duplicate = cloneWithFreshIds(structuredClone(source));
    duplicate.slug = slug;
    duplicate.title = `${source.title || "Obra"} (copia)`;
    duplicate.status = "inactive";
    duplicate.seo = { ...duplicate.seo, title: `${duplicate.title} - Maderas Caballero`, canonical: `/obras/${slug}` };
    duplicate.createdAt = now;
    duplicate.updatedAt = now;
    setItems((current) => [...current, { id: slug, slug, project: duplicate, draft: duplicate, published: null, version: 0, publishedVersion: 0 }]);
    setSelectedSlug(slug);
    setDraft(duplicate);
    setVersion(0);
    setSavedDraftSnapshot(null);
    setPublished(false);
    setSection("general");
    notify("success", "Copia creada como borrador. Guardala para continuar.");
  };

  const deleteProject = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      if (Number(deleteTarget.version) > 0) {
        await authFetch(`/api/tienda/obras/admin/${encodeURIComponent(deleteTarget.id)}`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ baseVersion: Number(deleteTarget.version) || 0 }),
        });
      }
      const remaining = items.filter((item) => item.id !== deleteTarget.id);
      setItems(remaining);
      let orderSaveError = "";
      if (Number(deleteTarget.version) > 0) {
        const orderResult = await persistOrder(remaining.map((item) => item.id), false);
        if (!orderResult.ok) orderSaveError = orderResult.error || "no se pudo guardar el nuevo orden";
      }
      if (selectedSlug === deleteTarget.id) {
        const next = remaining[0];
        const nextProject = next?.project || next?.draft || next?.published || null;
        setSelectedSlug(next?.id || "");
        setDraft(projectDraftWithLegacyWorkType(nextProject, obrasInicioContent));
        setSavedDraftSnapshot(nextProject ? JSON.stringify(nextProject) : null);
        setVersion(Number(next?.version) || 0);
        setPublished(next?.published?.status === "active");
        setSection("general");
      }
      notify(orderSaveError ? "error" : "success", orderSaveError
        ? `Obra eliminada, pero ${orderSaveError}.`
        : Number(deleteTarget.version) > 0 ? "Obra eliminada. Sus imágenes se conservaron en la biblioteca." : "Borrador local descartado.");
      setDeleteTarget(null);
    } catch (error) {
      notify("error", error.message || "No se pudo eliminar la obra.");
    } finally {
      setDeleting(false);
    }
  };

  const persistOrder = async (slugs, showToast = true) => {
    if (savingOrder) return { ok: false, error: "El orden ya se está guardando." };
    setSavingOrder(true);
    try {
      const result = await authFetch("/api/tienda/obras/admin/orden", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slugs, baseVersion: orderVersion }),
      });
      setOrderVersion(Number(result.version) || orderVersion + 1);
      if (showToast) notify("success", "Orden de obras guardado y aplicado en la tienda.");
      return { ok: true };
    } catch (error) {
      if (showToast) notify("error", error.message || "No se pudo guardar el orden de las obras.");
      return { ok: false, error: error.message };
    } finally {
      setSavingOrder(false);
    }
  };

  const moveWork = async (from, to) => {
    if (saving || savingOrder || from < 0 || to < 0 || from === to) return;
    const previous = items;
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setItems(next);
    const result = await persistOrder(next.map((item) => item.id), false);
    if (result.ok) notify("success", "Orden de obras guardado y aplicado en la tienda.");
    else {
      setItems(previous);
      notify("error", result.error || "No se pudo guardar el orden de las obras.");
    }
  };

  const saveDraft = async () => {
    if (!draft || !hasUnsavedChanges || saving) return;
    setSaving(true);
    setSavingMode("draft");
    const nextSlug = version === 0 ? slugify(draft.slug || draft.title) : selectedSlug;
    const draftSnapshotAtSave = JSON.stringify(draft);
    try {
      const result = await authFetch(`/api/tienda/obras/admin/${encodeURIComponent(nextSlug)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project: { ...draft, slug: nextSlug }, baseVersion: version }),
      });
      setSelectedSlug(nextSlug);
      setSavedDraftSnapshot(JSON.stringify(result.project));
      setDraft((current) => JSON.stringify(current) === draftSnapshotAtSave ? result.project : current);
      setVersion(result.version);
      const previousIndex = items.findIndex((item) => item.id === selectedSlug || item.id === nextSlug);
      const existing = items.find((item) => item.id === nextSlug || item.id === selectedSlug) || {};
      const savedItem = { ...existing, id: nextSlug, slug: nextSlug, project: result.project, draft: result.project, version: result.version, published: existing.published || null };
      const nextItems = items.filter((item) => item.id !== selectedSlug && item.id !== nextSlug);
      nextItems.splice(previousIndex < 0 ? nextItems.length : previousIndex, 0, savedItem);
      setItems(nextItems);
      if (version === 0 || selectedSlug !== nextSlug) {
        const orderResult = await persistOrder(nextItems.map((item) => item.id), false);
        if (!orderResult.ok) {
          notify("error", `Borrador guardado, pero no se pudo persistir el orden: ${orderResult.error}`);
          return;
        }
      }
      notify("success", "Borrador guardado. Todavía no se muestra en la tienda.");
    } catch (error) {
      notify("error", error.data?.issues?.join(" · ") || error.message || "No se pudo guardar el borrador.");
    } finally {
      setSaving(false);
      setSavingMode(null);
    }
  };

  const publish = async () => {
    if (!draft || version === 0 || hasUnsavedChanges || saving) {
      notify("error", hasUnsavedChanges ? "Guardá los cambios antes de publicar." : "Guardá el borrador antes de publicarlo.");
      return;
    }
    setSaving(true);
    setSavingMode("publish");
    try {
      const result = await authFetch(`/api/tienda/obras/admin/${encodeURIComponent(selectedSlug)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseVersion: version }),
      });
      setVersion(result.version);
      setDraft(result.project);
      setSavedDraftSnapshot(JSON.stringify(result.project));
      setPublished(result.published);
      setItems((current) => current.map((item) => item.id === selectedSlug ? { ...item, project: result.project, draft: result.project, published: result.project, version: result.version, publishedVersion: version } : item));
      notify("success", result.published ? "Obra publicada. La tienda la mostrará en breve." : "Cambios publicados; la obra permanece desactivada.");
    } catch (error) {
      notify("error", error.data?.issues?.join(" · ") || error.message || "No se pudo publicar la obra.");
    } finally {
      setSaving(false);
      setSavingMode(null);
    }
  };

  const sections = useMemo(() => [
    ["general", "General y SEO"], ["materiales", "Materiales"], ["adicionales", "Adicionales"], ["galeria", "Galería"], ["faq", "Preguntas frecuentes"],
  ], []);
  const draftSnapshot = useMemo(() => draft ? JSON.stringify(draft) : null, [draft]);
  const hasUnsavedChanges = isProjectDraftDirty(draftSnapshot, savedDraftSnapshot, version);
  const accessorySections = getAccessorySections(draft?.pageContent);

  if (loading) return <div className="flex min-h-48 items-center justify-center text-sm text-default-500"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Cargando obras…</div>;

  return <MediaContext.Provider value={{ media, tiendaUrl }}><div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-border bg-card p-1" role="tablist" aria-label="Contenido de Obras y de Inicio">
          <button type="button" role="tab" aria-selected={view === "obras"} onClick={() => setView("obras")} className={cn("rounded-md px-3 py-1.5 text-xs", view === "obras" ? "bg-default-100 font-semibold" : "text-default-500")}>Obras</button>
          <button type="button" role="tab" aria-selected={view === "inicio"} onClick={() => setView("inicio")} className={cn("rounded-md px-3 py-1.5 text-xs", view === "inicio" ? "bg-default-100 font-semibold" : "text-default-500")}>Inicio</button>
        </div>
        {view === "obras" && draft && published && tiendaUrl ? <a href={`${tiendaUrl.replace(/\/$/, "")}/obras/${selectedSlug}`} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-medium text-default-600 hover:bg-default-100">Ver publicada <ArrowUpRight className="h-3.5 w-3.5" /></a> : null}
        {view === "obras" ? <Btn variant="primary" disabled={saving} onClick={startNew}><Plus className="h-4 w-4" />Nueva obra</Btn> : null}
      </div>
    </div>

    <div className={cn("grid items-start gap-4 xl:grid-cols-[250px_minmax(0,1fr)]", view !== "obras" && "hidden")}>
      <aside className="rounded-xl border border-border bg-card p-2">
        <p className="flex items-center justify-between px-3 pb-2 pt-2 text-[10px] font-semibold uppercase tracking-[0.13em] text-default-400"><span>{items.length} obras</span><span>{savingOrder ? "Guardando orden…" : "Arrastrá para ordenar"}</span></p>
        <SortableList ids={items.map((item) => item.id)} onMove={moveWork} disabled={saving || savingOrder} className="space-y-1">
          {items.map((item) => {
            const project = item.project || item.draft || item.published;
            const cover = project?.banner?.slides?.[0]?.backgroundImage || project?.seo?.ogImage;
            return <SortableItem key={item.id} id={item.id} disabled={savingOrder} className={cn("group rounded-xl p-1 transition", selectedSlug === item.id ? "bg-muted/70" : "hover:bg-muted/40")}>
              {(handle) => <div className="flex items-center gap-1">
                {handle}
                <button type="button" disabled={saving} onClick={() => { const sourceProject = item.project || item.draft || item.published; setSelectedSlug(item.id); setDraft(projectDraftWithLegacyWorkType(sourceProject, obrasInicioContent)); setSavedDraftSnapshot(sourceProject ? JSON.stringify(sourceProject) : null); setVersion(Number(item.version) || 0); setPublished(item.published?.status === "active"); setSection("general"); }} className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-foreground disabled:cursor-not-allowed disabled:opacity-60">
                  <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-muted">{cover ? <Image src={previewUrl(cover, tiendaUrl) || cover} alt="" fill unoptimized sizes="40px" className="object-cover" onError={(event) => { event.currentTarget.style.visibility = "hidden"; }} /> : null}</span>
                  <span className="min-w-0 flex-1"><span className="flex items-center gap-2"><span className="truncate text-xs font-medium text-foreground">{project?.title || item.id}</span><span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", item.published?.status === "active" ? "bg-emerald-500" : "bg-muted-foreground/40")} /></span><span className="mt-1 block truncate text-[10px] text-muted-foreground">{item.id}</span></span>
                </button>
                <button type="button" disabled={saving} aria-label={`Duplicar ${project?.title || item.id}`} title="Duplicar obra" onClick={() => duplicateProject(item)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground opacity-70 transition hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground disabled:cursor-not-allowed disabled:opacity-40"><Copy className="h-3.5 w-3.5" /></button>
                <button type="button" disabled={saving} aria-label={`Eliminar ${project?.title || item.id}`} title="Eliminar obra" onClick={() => setDeleteTarget(item)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground opacity-70 transition hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive disabled:cursor-not-allowed disabled:opacity-40"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>}
            </SortableItem>;
          })}
          {!items.length ? <p className="px-3 py-5 text-xs leading-5 text-default-500">No hay obras todavía. Creá la primera para empezar.</p> : null}
        </SortableList>
      </aside>

      {!draft ? <div className="flex min-h-64 items-center justify-center rounded-xl border border-dashed border-border text-center text-sm text-default-500">Elegí una obra o creá una nueva.</div> : <main aria-busy={saving} onKeyDownCapture={(event) => { if (saving) event.preventDefault(); }} className={cn("min-w-0 space-y-4", saving && "pointer-events-none opacity-70")}>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 sm:p-4">
          <div className="min-w-0"><p className="truncate text-sm font-semibold">{draft.title || "Nueva obra"}</p><p className="mt-0.5 truncate text-xs text-default-500">{version ? `Borrador v${version}` : "Sin guardar"}{published ? " · Publicada" : " · No publicada"}{hasUnsavedChanges ? " · Cambios sin guardar" : ""}</p></div>
          <div className="flex shrink-0 gap-2">
            <Btn variant="outline" disabled={saving || !hasUnsavedChanges} onClick={saveDraft} aria-live="polite">
              {savingMode === "draft" ? <Loader2 className="h-4 w-4 animate-spin" /> : hasUnsavedChanges ? <Save className="h-4 w-4" /> : <Check className="h-4 w-4" />}
              {savingMode === "draft" ? "Guardando…" : hasUnsavedChanges ? "Guardar borrador" : "Borrador guardado"}
            </Btn>
            <Btn variant="primary" disabled={saving || version === 0 || hasUnsavedChanges} onClick={publish}>
              {savingMode === "publish" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {savingMode === "publish" ? "Publicando…" : hasUnsavedChanges && version > 0 ? "Guardá antes de publicar" : published ? "Publicar cambios" : "Publicar"}
            </Btn>
          </div>
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
          <Card title="Tarjeta en Tipos de obras" description="Cargá una imagen vertical 4:5 para Inicio y móvil, y otra apaisada 3:2 para escritorio en /obras. Ambas usan los mismos textos y datos de la obra.">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2"><Field label="Descripción de la tarjeta" value={draft.workTypeCard?.description} onChange={(value) => setPath(["workTypeCard", "description"], value)} multiline /></div>
              <div className="sm:col-span-2"><Field label="Características (una por línea)" value={(draft.workTypeCard?.features || []).join("\n")} onChange={(value) => setPath(["workTypeCard", "features"], value.split("\n").map((feature) => feature.trim()).filter(Boolean).slice(0, 4))} multiline /></div>
              <label className="block min-w-0 space-y-1.5"><span className="text-xs font-medium text-default-600">Ícono</span><select className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" value={draft.workTypeCard?.icon || "hammer"} onChange={(event) => setPath(["workTypeCard", "icon"], event.target.value)}>{WORK_TYPE_ICON_OPTIONS.map(([icon, label]) => <option key={icon} value={icon}>{label}</option>)}</select></label>
              <ImageField label="Imagen vertical (4:5)" value={draft.workTypeCard?.imagePortrait || ""} ratio="portrait" onChange={(imagePortrait) => setPath(["workTypeCard", "imagePortrait"], imagePortrait)} uploadImage={uploadImage} media={media} tiendaUrl={tiendaUrl} />
              <ImageField label="Imagen apaisada (3:2)" value={draft.workTypeCard?.imageLandscape || ""} ratio="landscape" onChange={(imageLandscape) => setPath(["workTypeCard", "imageLandscape"], imageLandscape)} uploadImage={uploadImage} media={media} tiendaUrl={tiendaUrl} />
            </div>
          </Card>
          <Card title="Portada principal" description="Cargá una imagen apaisada 3:2 para PC y otra vertical 4:5 para móvil. Si no configurás la de móvil, se usará la imagen de PC.">
            <div className="space-y-3">{(draft.banner?.slides || []).slice(0, 1).map((slide, index) => <div key={slide.id || index} className="rounded-lg border border-border/70 p-3"><div className="grid gap-3 sm:grid-cols-2"><Field label="Título" value={slide.title} onChange={(value) => setEntry(["banner", "slides"], index, { title: value })} /><Field label="Bajada" value={slide.subtitle} onChange={(value) => setEntry(["banner", "slides"], index, { subtitle: value })} /><div className="sm:col-span-2"><Field label="Descripción" value={slide.description} onChange={(value) => setEntry(["banner", "slides"], index, { description: value })} multiline /></div><ImageField label="Imagen para PC (3:2)" value={slide.backgroundImage} ratio="landscape" onChange={(backgroundImage) => setEntry(["banner", "slides"], index, { backgroundImage })} uploadImage={uploadImage} media={media} tiendaUrl={tiendaUrl} /><ImageField label="Imagen para móvil (4:5)" value={slide.mobileBackgroundImage || ""} ratio="portrait" onChange={(mobileBackgroundImage) => setEntry(["banner", "slides"], index, { mobileBackgroundImage })} uploadImage={uploadImage} media={media} tiendaUrl={tiendaUrl} /><Field label="Texto del botón" value={slide.ctaText} onChange={(value) => setEntry(["banner", "slides"], index, { ctaText: value })} /><Field label="Destino del botón" value={slide.ctaUrl} onChange={(value) => setEntry(["banner", "slides"], index, { ctaUrl: value })} /></div></div>)}</div>
          </Card>
          <Card title="Textos y botones de portada" description="Opcional: estos textos reemplazan los de la diapositiva principal.">
            <div className="grid gap-3 sm:grid-cols-2"><Field label="Antetítulo" value={draft.pageContent?.hero?.eyebrow} onChange={(value) => setPath(["pageContent", "hero", "eyebrow"], value)} /><Field label="Título principal" value={draft.pageContent?.hero?.headline} onChange={(value) => setPath(["pageContent", "hero", "headline"], value)} /><Field label="Subtítulo" value={draft.pageContent?.hero?.subheadline} onChange={(value) => setPath(["pageContent", "hero", "subheadline"], value)} /><Field label="Servicios destacados (uno por línea)" value={(draft.pageContent?.hero?.services || []).join("\n")} onChange={(value) => setPath(["pageContent", "hero", "services"], value.split("\n").map((item) => item.trim()).filter(Boolean))} multiline /><div className="sm:col-span-2"><Field label="Descripción" value={draft.pageContent?.hero?.description} onChange={(value) => setPath(["pageContent", "hero", "description"], value)} multiline /></div><Field label="Texto del botón principal" value={draft.pageContent?.hero?.primaryLabel} onChange={(value) => setPath(["pageContent", "hero", "primaryLabel"], value)} /><Field label="Destino del botón principal" value={draft.pageContent?.hero?.primaryHref} onChange={(value) => setPath(["pageContent", "hero", "primaryHref"], value)} /><Field label="Texto del botón secundario" value={draft.pageContent?.hero?.secondaryLabel} onChange={(value) => setPath(["pageContent", "hero", "secondaryLabel"], value)} /><Field label="Destino del botón secundario" value={draft.pageContent?.hero?.secondaryHref} onChange={(value) => setPath(["pageContent", "hero", "secondaryHref"], value)} /></div>
          </Card>
          <Card title="Soluciones y cierre"><div className="grid gap-3 sm:grid-cols-2"><Field label="Antetítulo" value={draft.pageContent?.solutions?.eyebrow} onChange={(value) => setPath(["pageContent", "solutions", "eyebrow"], value)} /><Field label="Título" value={draft.pageContent?.solutions?.title} onChange={(value) => setPath(["pageContent", "solutions", "title"], value)} /><div className="sm:col-span-2"><Field label="Descripción" value={draft.pageContent?.solutions?.description} onChange={(value) => setPath(["pageContent", "solutions", "description"], value)} multiline /></div><div className="sm:col-span-2"><ImageField label="Imagen de fondo" value={draft.pageContent?.solutions?.image} onChange={(value) => setPath(["pageContent", "solutions", "image"], value)} uploadImage={uploadImage} /></div><Field label="Texto del botón WhatsApp" value={draft.pageContent?.solutions?.whatsappLabel} onChange={(value) => setPath(["pageContent", "solutions", "whatsappLabel"], value)} /></div></Card>
        </div> : null}

        {section === "materiales" ? <div className="space-y-4">
          <Card title="Sección de materiales"><div className="grid gap-3 sm:grid-cols-2"><Field label="Antetítulo" value={draft.pageContent?.options?.eyebrow} onChange={(value) => setPath(["pageContent", "options", "eyebrow"], value)} /><Field label="Título" value={draft.pageContent?.options?.title} onChange={(value) => setPath(["pageContent", "options", "title"], value)} /><div className="sm:col-span-2"><Field label="Descripción" value={draft.pageContent?.options?.description} onChange={(value) => setPath(["pageContent", "options", "description"], value)} multiline /></div><Field label="Texto del botón de consulta" value={draft.pageContent?.options?.consultationLabel} onChange={(value) => setPath(["pageContent", "options", "consultationLabel"], value)} /><Field label="Destino del botón de consulta" value={draft.pageContent?.options?.consultationHref} onChange={(value) => setPath(["pageContent", "options", "consultationHref"], value)} /></div></Card>
          <ListEditor title="Tipos de materiales" items={draft.pageContent?.options?.items || []} onAdd={(index, remove) => remove ? removeEntry(["pageContent", "options", "items"], index) : addEntry(["pageContent", "options", "items"], { id: uid("material"), title: "", description: "", image: "", images: [], group: "" })}>{(item, index) => <div className="grid gap-3 sm:grid-cols-2"><Field label="Nombre" value={item.title} onChange={(value) => setEntry(["pageContent", "options", "items"], index, { title: value })} /><Field label="Grupo" value={item.group} onChange={(value) => setEntry(["pageContent", "options", "items"], index, { group: value })} /><div className="sm:col-span-2"><Field label="Descripción" value={item.description} onChange={(value) => setEntry(["pageContent", "options", "items"], index, { description: value })} multiline /></div><div className="sm:col-span-2"><ImageField label="Imagen principal" value={item.image} onChange={(value) => setEntry(["pageContent", "options", "items"], index, { image: value })} uploadImage={uploadImage} /></div><div className="sm:col-span-2"><ImageField label="Galería (una URL por línea)" value={(item.images || []).join("\n")} onChange={(value) => setEntry(["pageContent", "options", "items"], index, { images: value.split("\n").map((image) => image.trim()).filter(Boolean) })} uploadImage={uploadImage} multiline /></div></div>}</ListEditor>
        </div> : null}

        {section === "adicionales" ? <div className="space-y-4">
          <Card title="Secciones de adicionales" description="Cada sección se publica como un carrusel independiente. Arrastrá para cambiar el orden." action={<Btn size="sm" variant="outline" disabled={saving} onClick={addAccessorySection}><Plus className="h-3.5 w-3.5" />Agregar sección</Btn>}>
            {accessorySections.length ? <SortableList ids={accessorySections.map((accessorySection) => accessorySection.id)} onMove={moveAccessorySection} disabled={saving} className="space-y-4">
              {accessorySections.map((accessorySection, sectionIndex) => <SortableItem key={accessorySection.id} id={accessorySection.id} disabled={saving} className="flex min-w-0 gap-2">
                {(dragHandle) => <>
                  <div className="pt-4">{dragHandle}</div>
                  <div className="min-w-0 flex-1">
                    <Card
                      title={`Sección de adicionales ${sectionIndex + 1}`}
                      description="Configurá el encabezado y los elementos de este carrusel."
                      action={<div className="flex items-center gap-1.5">
                        <Btn size="sm" variant="outline" disabled={saving} onClick={() => duplicateAccessorySection(sectionIndex)}><Copy className="h-3.5 w-3.5" />Duplicar</Btn>
                        <button type="button" disabled={saving} aria-label={`Eliminar sección de adicionales ${sectionIndex + 1}`} title="Eliminar sección" onClick={() => removeAccessorySection(sectionIndex)} className="flex h-8 w-8 items-center justify-center rounded-lg text-default-400 transition hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"><Trash2 className="h-4 w-4" /></button>
                      </div>}
                    >
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Antetítulo" value={accessorySection.eyebrow} onChange={(value) => updateAccessorySection(sectionIndex, { eyebrow: value })} />
                        <Field label="Título" value={accessorySection.title} onChange={(value) => updateAccessorySection(sectionIndex, { title: value })} />
                        <div className="sm:col-span-2"><Field label="Descripción" value={accessorySection.description} onChange={(value) => updateAccessorySection(sectionIndex, { description: value })} multiline /></div>
                        <Field label="Antetítulo del contenido" value={accessorySection.contentEyebrow} onChange={(value) => updateAccessorySection(sectionIndex, { contentEyebrow: value })} />
                      </div>
                      <div className="mt-4">
                        <ListEditor title="Elementos de esta sección" items={accessorySection.items} onAdd={(itemIndex, remove) => remove ? removeAccessoryItem(sectionIndex, itemIndex) : addAccessoryItem(sectionIndex)}>
                          {(item, itemIndex) => <div className="grid gap-3 sm:grid-cols-2">
                            <Field label="Nombre" value={item.title} onChange={(value) => updateAccessoryItem(sectionIndex, itemIndex, { title: value })} />
                            <Field label="Descripción" value={item.description} onChange={(value) => updateAccessoryItem(sectionIndex, itemIndex, { description: value })} multiline />
                            <ImageField label="Imagen para PC (3:2)" value={item.image} ratio="landscape" onChange={(image) => updateAccessoryItem(sectionIndex, itemIndex, { image })} uploadImage={uploadImage} media={media} tiendaUrl={tiendaUrl} />
                            <ImageField label="Imagen para móvil (4:5)" value={item.mobileImage || ""} ratio="portrait" onChange={(mobileImage) => updateAccessoryItem(sectionIndex, itemIndex, { mobileImage })} uploadImage={uploadImage} media={media} tiendaUrl={tiendaUrl} />
                          </div>}
                        </ListEditor>
                      </div>
                    </Card>
                  </div>
                </>}
              </SortableItem>)}
            </SortableList> : <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-xs text-default-500">No hay secciones de adicionales. Agregá una para empezar.</p>}
          </Card>
        </div> : null}


        {section === "galeria" ? <div className="space-y-4">
          <Card title="Encabezado de la galería"><div className="grid gap-3 sm:grid-cols-2"><Field label="Antetítulo" value={draft.pageContent?.gallery?.eyebrow} onChange={(value) => setPath(["pageContent", "gallery", "eyebrow"], value)} /><Field label="Instagram: antetítulo" value={draft.pageContent?.instagram?.eyebrow} onChange={(value) => setPath(["pageContent", "instagram", "eyebrow"], value)} /><Field label="Instagram: título" value={draft.pageContent?.instagram?.title} onChange={(value) => setPath(["pageContent", "instagram", "title"], value)} /><Field label="Instagram: descripción" value={draft.pageContent?.instagram?.description} onChange={(value) => setPath(["pageContent", "instagram", "description"], value)} multiline /></div></Card>
          <Card title="Galería de trabajos"><div className="grid gap-3 sm:grid-cols-2"><Field label="Título" value={draft.gallery?.title} onChange={(value) => setPath(["gallery", "title"], value)} /><Field label="Categorías (separadas por coma)" value={(draft.gallery?.categories || []).join(", ")} onChange={(value) => setPath(["gallery", "categories"], value.split(",").map((item) => item.trim()).filter(Boolean))} /><div className="sm:col-span-2"><Field label="Descripción" value={draft.gallery?.description} onChange={(value) => setPath(["gallery", "description"], value)} multiline /></div></div></Card>
          <Card title="Fotos de trabajos" description="Podés cargar varias fotos juntas. Guía recomendada: apaisada 3:2 · 1800 × 1200 px.">
            <ImageField
              label="Fotos de trabajos"
              value={(draft.gallery?.items || []).map((item) => item.image).filter(Boolean).join("\n")}
              onChange={setGalleryImages}
              uploadImage={uploadImage}
              media={media}
              tiendaUrl={tiendaUrl}
              multiline
              ratio="landscape"
              showImageLabels={false}
            />
          </Card>
        </div> : null}

        {section === "faq" ? <div className="space-y-4"><Card title="Encabezado de preguntas frecuentes"><div className="grid gap-3 sm:grid-cols-2"><Field label="Antetítulo" value={draft.pageContent?.faq?.eyebrow} onChange={(value) => setPath(["pageContent", "faq", "eyebrow"], value)} /><Field label="Título" value={draft.pageContent?.faq?.title} onChange={(value) => setPath(["pageContent", "faq", "title"], value)} /><div className="sm:col-span-2"><Field label="Descripción" value={draft.pageContent?.faq?.description} onChange={(value) => setPath(["pageContent", "faq", "description"], value)} multiline /></div><Field label="Texto del enlace" value={draft.pageContent?.faq?.ctaLabel} onChange={(value) => setPath(["pageContent", "faq", "ctaLabel"], value)} /></div></Card><ListEditor title="Preguntas frecuentes" items={draft.faqs || []} onAdd={(index, remove) => remove ? removeEntry(["faqs"], index) : addEntry(["faqs"], { id: uid("faq"), question: "", answer: "" })}>{(item, index) => <div className="grid gap-3"><Field label="Pregunta" value={item.question} onChange={(value) => setEntry(["faqs"], index, { question: value })} /><Field label="Respuesta" value={item.answer} onChange={(value) => setEntry(["faqs"], index, { answer: value })} multiline /></div>}</ListEditor></div> : null}

      </main>}
    </div>
    <div className={view === "inicio" ? "" : "hidden"}>
      <ObrasInicioContentEditor value={obrasInicioContent} onChange={onObrasInicioChange} uploadImage={uploadImage} media={media} tiendaUrl={tiendaUrl} />
    </div>
  </div><AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open && !deleting) setDeleteTarget(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Eliminar esta obra?</AlertDialogTitle>
          <AlertDialogDescription>{deleteTarget?.published?.status === "active" ? "La página dejará de aparecer en la tienda. " : ""}Se eliminará el borrador y su publicación, pero las imágenes compartidas permanecerán en la biblioteca.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
          <AlertDialogAction disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={(event) => { event.preventDefault(); void deleteProject(); }}>{deleting ? "Eliminando…" : "Eliminar obra"}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog></MediaContext.Provider>;
}
