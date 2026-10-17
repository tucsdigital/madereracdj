"use client";
import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { IMAGE_GUIDE } from "@/lib/tienda-media";
import { issuesByField } from "@/lib/tienda-web-ui";
import ImageDrop from "./ImageDrop";
import { DestinoField, EditorSheet, Field, Segmented, inputClass, inputErrorClass } from "./ui";

function Visible({ checked, onChange, label = "Mostrar en la tienda" }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
      <span className="text-sm font-medium">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </div>
  );
}

const err = (issues, scope, index) => issuesByField(issues, scope, index);

export function BannerEditor({ open, onOpenChange, banner, index, issues, onChange, onDuplicate, onDelete, media, tiendaUrl, categories }) {
  if (!banner) return null;
  const e = err(issues, "banners", index);
  return (
    <EditorSheet open={open} onOpenChange={onOpenChange} title={banner.titulo || "Nuevo banner"} subtitle="Banner del carrusel principal"
      onDuplicate={onDuplicate} onDelete={onDelete} deleteMessage="El banner deja de mostrarse en la tienda cuando guardes los cambios.">
      <ImageDrop label="Imagen principal" ratio={IMAGE_GUIDE.banners.ratio} ratioLabel={IMAGE_GUIDE.banners.proporcion} hint={`Ideal ${IMAGE_GUIDE.banners.ancho} × ${IMAGE_GUIDE.banners.alto} px (${IMAGE_GUIDE.banners.proporcion}). Se muestra en computadora y tablet.`}
        folder="banners" aspect="aspect-[21/10]" value={banner.imagen} media={media} tiendaUrl={tiendaUrl} error={e.imagen}
        onChange={(url) => onChange({ imagen: url, ...(banner.imagenMovil && banner.imagenMovil !== banner.imagen ? {} : { imagenMovil: url }) })} />
      <ImageDrop label="Imagen para celular" ratio={IMAGE_GUIDE.bannersMovil.ratio} ratioLabel={IMAGE_GUIDE.bannersMovil.proporcion} hint={`Ideal ${IMAGE_GUIDE.bannersMovil.ancho} × ${IMAGE_GUIDE.bannersMovil.alto} px (${IMAGE_GUIDE.bannersMovil.proporcion}). Si no subís otra, se usa la principal.`}
        folder="banners" aspect="aspect-[4/5]" className="max-w-[220px]" value={banner.imagenMovil} media={media} tiendaUrl={tiendaUrl} error={e.imagenMovil}
        onChange={(url) => onChange({ imagenMovil: url })} />
      <Field label="Título" hint="Es el texto del botón que aparece sobre la imagen." error={e.titulo} htmlFor="banner-titulo">
        <input id="banner-titulo" className={cn(inputClass, e.titulo && inputErrorClass)} value={banner.titulo} onChange={(ev) => onChange({ titulo: ev.target.value })} />
      </Field>
      <DestinoField value={banner.enlace} onChange={(enlace) => onChange({ enlace })} categories={categories} error={e.enlace} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Mostrar desde" error={e.fechas} htmlFor="banner-desde">
          <input id="banner-desde" type="date" className={cn(inputClass, e.fechas && inputErrorClass)} value={banner.desde} onChange={(ev) => onChange({ desde: ev.target.value })} />
        </Field>
        <Field label="Hasta" htmlFor="banner-hasta">
          <input id="banner-hasta" type="date" className={cn(inputClass, e.fechas && inputErrorClass)} value={banner.hasta} onChange={(ev) => onChange({ hasta: ev.target.value })} />
        </Field>
        <p className="col-span-2 -mt-3 text-xs text-default-500">Dejalas vacías para que se muestre siempre.</p>
      </div>
      <Visible checked={banner.activo} onChange={(activo) => onChange({ activo })} />
      <details className="rounded-lg border border-border px-4 py-3 text-sm">
        <summary className="cursor-pointer font-medium">Más opciones</summary>
        <Field className="mt-3" label="Descripción de la imagen" hint="La leen los lectores de pantalla y buscadores. Si la dejás vacía se usa el título." htmlFor="banner-alt">
          <input id="banner-alt" className={inputClass} value={banner.alt} onChange={(ev) => onChange({ alt: ev.target.value })} />
        </Field>
      </details>
    </EditorSheet>
  );
}

export function CategoriaEditor({ open, onOpenChange, categoria, index, issues, onChange, onDuplicate, onDelete, media, tiendaUrl, categories }) {
  if (!categoria) return null;
  const e = err(issues, "categorias", index);
  return (
    <EditorSheet open={open} onOpenChange={onOpenChange} title={categoria.titulo || "Nueva categoría"} subtitle="Tarjeta de “Comprá por material”"
      onDuplicate={onDuplicate} onDelete={onDelete} deleteMessage="La tarjeta deja de mostrarse en la tienda cuando guardes los cambios.">
      <ImageDrop label="Imagen" ratio={IMAGE_GUIDE.categorias.ratio} ratioLabel={IMAGE_GUIDE.categorias.proporcion} hint={`Ideal ${IMAGE_GUIDE.categorias.ancho} × ${IMAGE_GUIDE.categorias.alto} px (${IMAGE_GUIDE.categorias.proporcion}, vertical).`}
        folder="categorias" aspect="aspect-[4/5]" className="max-w-[260px]" value={categoria.imagen} media={media} tiendaUrl={tiendaUrl} error={e.imagen}
        onChange={(url) => onChange({ imagen: url })} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Título" error={e.titulo} htmlFor="cat-titulo">
          <input id="cat-titulo" className={cn(inputClass, e.titulo && inputErrorClass)} value={categoria.titulo} onChange={(ev) => onChange({ titulo: ev.target.value })} />
        </Field>
        <Field label="Etiqueta" hint="Ej.: Madera, Accesorios." htmlFor="cat-etiqueta">
          <input id="cat-etiqueta" className={inputClass} value={categoria.etiqueta} onChange={(ev) => onChange({ etiqueta: ev.target.value })} />
        </Field>
      </div>
      <DestinoField value={categoria.enlace} onChange={(enlace) => onChange({ enlace })} categories={categories} error={e.enlace} />
      <Visible checked={categoria.activa} onChange={(activa) => onChange({ activa })} />
    </EditorSheet>
  );
}

const QUE_MOSTRAR = [
  { value: "oferta", label: "Ofertas", help: "Productos marcados en oferta" },
  { value: "nuevos", label: "Nuevos ingresos", help: "Lo último que se agregó" },
  { value: "combos", label: "Combos", help: "Combos armados" },
  { value: "categoria", label: "Una categoría", help: "Todos los de una categoría" },
  { value: "descuento", label: "Con descuento", help: "Desde un descuento mínimo" },
  { value: "manual", label: "Los que elija", help: "Uno por uno" },
];

function ProductPicker({ selected, products, onChange, error }) {
  const [term, setTerm] = useState("");
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const results = useMemo(() => {
    const q = term.trim().toLowerCase();
    if (!q) return [];
    return products.filter((p) => !selected.includes(p.id) && `${p.nombre} ${p.codigo}`.toLowerCase().includes(q)).slice(0, 8);
  }, [term, products, selected]);
  return (
    <Field label="Productos" error={error}>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selected.map((id) => (
            <span key={id} className="inline-flex items-center gap-1 rounded-full bg-default-100 py-1 pl-3 pr-1.5 text-xs">
              {byId.get(id)?.nombre || id}
              <button type="button" aria-label="Quitar" className="rounded-full p-0.5 hover:bg-default-200" onClick={() => onChange(selected.filter((x) => x !== id))}><X className="h-3 w-3" /></button>
            </span>
          ))}
        </div>
      )}
      <input className={cn(inputClass, error && inputErrorClass)} placeholder={products.length ? "Buscar por nombre o código…" : "Cargando productos…"} value={term} onChange={(ev) => setTerm(ev.target.value)} />
      {results.length > 0 && (
        <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
          {results.map((p) => (
            <button key={p.id} type="button" className="block w-full px-3 py-2 text-left text-sm hover:bg-default-100"
              onClick={() => { onChange([...selected, p.id]); setTerm(""); }}>
              {p.nombre} <span className="text-default-500">{p.codigo}</span>
            </button>
          ))}
        </div>
      )}
    </Field>
  );
}

export function SeccionEditor({ open, onOpenChange, seccion, index, issues, onChange, onDuplicate, onDelete, categories, products }) {
  if (!seccion) return null;
  const e = err(issues, "secciones", index);
  const regla = seccion.regla;
  const setRegla = (patch) => onChange({ regla: { ...regla, ...patch } });
  return (
    <EditorSheet open={open} onOpenChange={onOpenChange} title={seccion.titulo || "Nueva sección"} subtitle="Sección de productos del inicio"
      onDuplicate={onDuplicate} onDelete={onDelete} deleteMessage="La sección deja de mostrarse en la tienda cuando guardes los cambios.">
      <Field label="Título" error={e.titulo} htmlFor="sec-titulo">
        <input id="sec-titulo" className={cn(inputClass, e.titulo && inputErrorClass)} value={seccion.titulo} onChange={(ev) => onChange({ titulo: ev.target.value })} />
      </Field>
      <Field label="Descripción" hint="Opcional. Aparece debajo del título." htmlFor="sec-sub">
        <input id="sec-sub" className={inputClass} value={seccion.subtitulo} onChange={(ev) => onChange({ subtitulo: ev.target.value })} />
      </Field>

      <Field label="Qué productos muestra">
        <div className="grid grid-cols-2 gap-2">
          {QUE_MOSTRAR.map((option) => (
            <button key={option.value} type="button" role="radio" aria-checked={regla.tipo === option.value} onClick={() => setRegla({ tipo: option.value })}
              className={cn("rounded-lg border px-3 py-2.5 text-left transition", regla.tipo === option.value ? "border-primary bg-primary/5" : "border-border hover:bg-default-50")}>
              <span className="block text-sm font-medium">{option.label}</span>
              <span className="block text-xs text-default-500">{option.help}</span>
            </button>
          ))}
        </div>
      </Field>

      {regla.tipo === "categoria" && (
        <Field label="Categoría" error={e.valor} htmlFor="sec-cat">
          <input id="sec-cat" list="tienda-web-categorias" className={cn(inputClass, e.valor && inputErrorClass)} value={regla.valor} onChange={(ev) => setRegla({ valor: ev.target.value })} placeholder="Elegí o escribí una categoría" />
          <datalist id="tienda-web-categorias">{categories.map((c) => <option key={c} value={c} />)}</datalist>
        </Field>
      )}
      {regla.tipo === "descuento" && (
        <Field label="Descuento mínimo (%)" error={e.minDescuento} htmlFor="sec-desc" className="max-w-[200px]">
          <input id="sec-desc" inputMode="numeric" className={cn(inputClass, e.minDescuento && inputErrorClass)} value={regla.minDescuento || ""} onChange={(ev) => setRegla({ minDescuento: ev.target.value })} />
        </Field>
      )}
      {regla.tipo === "manual" && <ProductPicker selected={regla.productos} products={products} error={e.productos} onChange={(productos) => setRegla({ productos })} />}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Cantidad máxima" hint="Entre 1 y 24 productos." htmlFor="sec-limite">
          <input id="sec-limite" inputMode="numeric" className={inputClass} value={seccion.limite} onChange={(ev) => onChange({ limite: ev.target.value })} />
        </Field>
      </div>
      <DestinoField label="El botón “Ver todos” lleva a" value={seccion.enlace} onChange={(enlace) => onChange({ enlace })} categories={categories} error={e.enlace} />
      <Visible checked={seccion.activa} onChange={(activa) => onChange({ activa })} />
      <details className="rounded-lg border border-border px-4 py-3 text-sm">
        <summary className="cursor-pointer font-medium">Más opciones</summary>
        <div className="mt-3 space-y-4">
          <Field label="Texto pequeño sobre el título" hint="Ej.: Ofertas, Novedades." htmlFor="sec-eyebrow">
            <input id="sec-eyebrow" className={inputClass} value={seccion.eyebrow} onChange={(ev) => onChange({ eyebrow: ev.target.value })} />
          </Field>
          <Field label="Color de fondo">
            <Segmented value={seccion.fondo} onChange={(fondo) => onChange({ fondo })} options={[{ value: "gris", label: "Gris" }, { value: "blanco", label: "Blanco" }]} />
          </Field>
        </div>
      </details>
    </EditorSheet>
  );
}
