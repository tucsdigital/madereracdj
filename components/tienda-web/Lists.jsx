"use client";
import { ImageIcon, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { bannerEstado, destinoLabel, previewUrl, reglaResumen } from "@/lib/tienda-web-ui";
import { SortableItem, SortableList } from "./SortableList";
import { Chip } from "./ui";

function Thumb({ src, className }) {
  return (
    <div className={cn("relative shrink-0 overflow-hidden bg-default-100", className)}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="absolute inset-0 h-full w-full object-cover" onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-default-300"><ImageIcon className="h-5 w-5" /></div>
      )}
    </div>
  );
}

function AddButton({ onClick, children }) {
  return (
    <button type="button" onClick={onClick}
      className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-default-300 py-4 text-sm font-medium text-default-600 transition hover:border-default-400 hover:bg-default-50">
      <Plus className="h-4 w-4" /> {children}
    </button>
  );
}

function Empty({ title, children }) {
  return (
    <div className="rounded-xl border border-dashed border-default-300 px-6 py-10 text-center">
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-sm text-default-500">{children}</p>
    </div>
  );
}

const stop = (e) => e.stopPropagation();
const TONE = { visible: "ok", programado: "warn", vencido: "bad", oculto: "neutral" };

export function BannerList({ items, problems, tiendaUrl, onOpen, onToggle, onMove, onAdd }) {
  return (
    <div className="space-y-3">
      {items.length === 0 ? (
        <Empty title="Todavía no hay banners">Agregá el primero para que se muestre en el carrusel del inicio.</Empty>
      ) : (
        <SortableList ids={items.map((b) => b.id)} onMove={onMove} className="space-y-2">
          {items.map((banner, index) => {
            const estado = bannerEstado(banner);
            return (
              <SortableItem key={banner.id} id={banner.id} className="rounded-xl border border-border bg-card">
                {(handle) => (
                  <div className="flex items-center gap-2 p-2.5 pr-4">
                    {handle}
                    <button type="button" onClick={() => onOpen(index)} className="flex min-w-0 flex-1 items-center gap-4 rounded-lg p-1 text-left hover:bg-default-50">
                      <Thumb src={previewUrl(banner.imagen, tiendaUrl)} className="h-14 w-28 rounded-lg" />
                      <div className="min-w-0">
                        <div className="truncate font-medium">{banner.titulo || "Sin título"}</div>
                        <div className="truncate text-sm text-default-500">Lleva a: {destinoLabel(banner.enlace)}</div>
                      </div>
                    </button>
                    {problems[index] > 0 && <Chip tone="bad">Revisar</Chip>}
                    <Chip tone={TONE[estado.key]} className="hidden sm:inline-flex">{estado.label}</Chip>
                    <span onClick={stop}><Switch checked={banner.activo} onCheckedChange={(v) => onToggle(index, v)} aria-label="Mostrar banner" /></span>
                  </div>
                )}
              </SortableItem>
            );
          })}
        </SortableList>
      )}
      <AddButton onClick={onAdd}>Agregar banner</AddButton>
    </div>
  );
}

export function SeccionList({ items, problems, onOpen, onToggle, onMove, onAdd }) {
  return (
    <div className="space-y-3">
      {items.length === 0 ? (
        <Empty title="Todavía no hay secciones">Cada sección muestra una selección de productos en el inicio.</Empty>
      ) : (
        <SortableList ids={items.map((s) => s.id)} onMove={onMove} className="space-y-2">
          {items.map((seccion, index) => (
            <SortableItem key={seccion.id} id={seccion.id} className="rounded-xl border border-border bg-card">
              {(handle) => (
                <div className={cn("flex items-center gap-2 p-2.5 pr-4", !seccion.activa && "opacity-60")}>
                  {handle}
                  <button type="button" onClick={() => onOpen(index)} className="min-w-0 flex-1 rounded-lg p-2 text-left hover:bg-default-50">
                    <div className="truncate font-medium">{seccion.titulo || "Sin título"}</div>
                    <div className="truncate text-sm text-default-500">{reglaResumen(seccion)}</div>
                  </button>
                  {problems[index] > 0 && <Chip tone="bad">Revisar</Chip>}
                  <span onClick={stop}><Switch checked={seccion.activa} onCheckedChange={(v) => onToggle(index, v)} aria-label="Mostrar sección" /></span>
                </div>
              )}
            </SortableItem>
          ))}
        </SortableList>
      )}
      <AddButton onClick={onAdd}>Agregar sección</AddButton>
    </div>
  );
}

export function CategoriaGrid({ items, problems, tiendaUrl, onOpen, onToggle, onMove, onAdd }) {
  return (
    <div className="space-y-3">
      {items.length === 0 ? (
        <Empty title="Todavía no hay categorías">Son las tarjetas de “Comprá por material” del inicio.</Empty>
      ) : (
        <SortableList ids={items.map((c) => c.id)} onMove={onMove} grid className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((categoria, index) => (
            <SortableItem key={categoria.id} id={categoria.id} className="overflow-hidden rounded-xl border border-border bg-card">
              {(handle) => (
                <div className={cn("relative", !categoria.activa && "opacity-60")}>
                  <button type="button" onClick={() => onOpen(index)} className="block w-full text-left">
                    <Thumb src={previewUrl(categoria.imagen, tiendaUrl)} className="aspect-[4/5] w-full" />
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3 pt-10 text-white">
                      <div className="truncate text-sm font-semibold">{categoria.titulo || "Sin título"}</div>
                      <div className="truncate text-xs text-white/70">{categoria.etiqueta || destinoLabel(categoria.enlace)}</div>
                    </div>
                  </button>
                  <div className="absolute left-1.5 top-1.5 rounded-md bg-card/90">{handle}</div>
                  <div className="absolute right-2 top-2 flex items-center gap-1.5">
                    {problems[index] > 0 && <Chip tone="bad">Revisar</Chip>}
                    <span onClick={stop} className="rounded-full bg-card/90 p-1"><Switch size="sm" checked={categoria.activa} onCheckedChange={(v) => onToggle(index, v)} aria-label="Mostrar categoría" /></span>
                  </div>
                </div>
              )}
            </SortableItem>
          ))}
        </SortableList>
      )}
      <AddButton onClick={onAdd}>Agregar categoría</AddButton>
    </div>
  );
}

