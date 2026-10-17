"use client";
import { useEffect, useRef, useState } from "react";
import { AlertCircle, ArrowLeft, ArrowRight, ImagePlus, Loader2, Star, Trash2, UploadCloud } from "lucide-react";
import { cn } from "@/lib/utils";
import { Btn } from "@/components/panel-ui/ui";
import { ratioWarning } from "@/lib/tienda-media";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const MAX_BYTES = 10 * 1024 * 1024;
const MIN_SIDE = 600;

async function inspect(file) {
  try {
    const bitmap = await createImageBitmap(file);
    const info = { width: bitmap.width, height: bitmap.height };
    bitmap.close?.();
    return info;
  } catch {
    return null;
  }
}

function IconTip({ label, children }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}

/** Galería del producto: subir, reordenar, elegir la principal y quitar imágenes. La primera es la que ve el cliente. */
export default function Gallery({ images, onChange, disabled, onBusyChange }) {
  const inputRef = useRef(null);
  const [uploads, setUploads] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const [dragIndex, setDragIndex] = useState(null);
  const [dropIndex, setDropIndex] = useState(null);
  const [notes, setNotes] = useState([]);
  const busy = uploads.some((u) => !u.error);
  useEffect(() => { onBusyChange?.(busy); }, [busy, onBusyChange]);

  const patch = (id, data) => setUploads((list) => list.map((u) => (u.id === id ? { ...u, ...data } : u)));

  async function upload(files) {
    const picked = [...files].filter(Boolean);
    if (!picked.length || disabled) return;
    const added = [];
    const newNotes = [];
    for (const file of picked) {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const preview = URL.createObjectURL(file);
      setUploads((list) => [...list, { id, name: file.name, preview, error: "" }]);
      if (!file.type.startsWith("image/")) { patch(id, { error: "No es una imagen." }); continue; }
      if (file.size > MAX_BYTES) { patch(id, { error: "Pesa más de 10 MB." }); continue; }
      const info = await inspect(file);
      if (info) {
        const ratio = ratioWarning(info.width, info.height, 1, "cuadrada, 1200 × 1200 px");
        if (ratio) newNotes.push(`${file.name}: no es cuadrada. Se va a recortar al centro en la tienda.`);
        else if (Math.min(info.width, info.height) < MIN_SIDE) newNotes.push(`${file.name}: es chica (${info.width} × ${info.height} px) y puede verse borrosa.`);
      }
      try {
        const body = new FormData();
        body.append("file", file);
        const response = await fetch("/api/upload", { method: "POST", body });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.url) throw new Error(result.error || "No se pudo subir.");
        added.push(result.url);
        setUploads((list) => list.filter((u) => u.id !== id));
        URL.revokeObjectURL(preview);
      } catch (error) {
        patch(id, { error: error.message || "No se pudo subir." });
      }
    }
    if (added.length) onChange([...images, ...added]);
    if (newNotes.length) setNotes((list) => [...list, ...newNotes].slice(-4));
  }

  const move = (from, to) => {
    if (from === to || to < 0 || to >= images.length) return;
    const next = [...images];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
  };
  const remove = (index) => onChange(images.filter((_, i) => i !== index));
  const dismiss = (id) => setUploads((list) => list.filter((u) => u.id !== id));

  const empty = images.length === 0 && uploads.length === 0;

  return (
    <div className="space-y-4">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => { upload(e.target.files); e.target.value = ""; }}
      />
      <div
        onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDragOver(true); } }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { if (e.dataTransfer.files?.length) { e.preventDefault(); setDragOver(false); upload(e.dataTransfer.files); } }}
        className={cn("rounded-xl border-2 border-dashed transition", dragOver ? "border-primary bg-primary/5" : "border-border", empty ? "p-8" : "p-4")}
      >
        {empty ? (
          <div className="flex flex-col items-center gap-3 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-default-100 text-default-500"><ImagePlus className="h-6 w-6" /></span>
            <div>
              <p className="text-sm font-medium">Todavía no hay imágenes</p>
              <p className="mt-1 text-xs text-default-500">Arrastrá tus fotos acá o elegilas desde tu equipo. Recomendado: cuadradas, 1200 × 1200 px.</p>
            </div>
            <Btn variant="primary" disabled={disabled} onClick={() => inputRef.current?.click()}><UploadCloud className="h-4 w-4" /> Subir imágenes</Btn>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-default-500">
                {images.length} imagen{images.length === 1 ? "" : "es"}. La primera es la principal: la que ve el cliente en la ficha y en las tarjetas. Arrastrá para ordenar.
              </p>
              <Btn size="sm" disabled={disabled} onClick={() => inputRef.current?.click()}><UploadCloud className="h-4 w-4" /> Subir imágenes</Btn>
            </div>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {images.map((url, index) => (
                <li
                  key={`${url}-${index}`}
                  draggable={!disabled}
                  onDragStart={(e) => { setDragIndex(index); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(index)); }}
                  onDragOver={(e) => { if (dragIndex !== null) { e.preventDefault(); setDropIndex(index); } }}
                  onDrop={(e) => { if (dragIndex !== null) { e.preventDefault(); e.stopPropagation(); move(dragIndex, index); } setDragIndex(null); setDropIndex(null); }}
                  onDragEnd={() => { setDragIndex(null); setDropIndex(null); }}
                  className={cn("group relative aspect-square cursor-grab overflow-hidden rounded-xl border bg-default-100 transition", dropIndex === index && dragIndex !== index ? "border-primary ring-2 ring-primary/30" : "border-border", dragIndex === index && "opacity-40")}
                >
                  <img src={url} alt={`Imagen ${index + 1} del producto`} className="h-full w-full object-cover" draggable={false} />
                  {index === 0 ? (
                    <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-foreground px-2 py-0.5 text-[11px] font-medium text-background"><Star className="h-3 w-3" /> Principal</span>
                  ) : null}
                  <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-gradient-to-t from-black/60 to-transparent p-2 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                    <div className="flex gap-1">
                      <IconTip label="Mover antes">
                        <button type="button" aria-label="Mover antes" disabled={disabled || index === 0} onClick={() => move(index, index - 1)} className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/90 text-black disabled:opacity-40"><ArrowLeft className="h-4 w-4" /></button>
                      </IconTip>
                      <IconTip label="Mover después">
                        <button type="button" aria-label="Mover después" disabled={disabled || index === images.length - 1} onClick={() => move(index, index + 1)} className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/90 text-black disabled:opacity-40"><ArrowRight className="h-4 w-4" /></button>
                      </IconTip>
                      {index !== 0 ? (
                        <IconTip label="Hacer principal">
                          <button type="button" aria-label="Hacer principal" disabled={disabled} onClick={() => move(index, 0)} className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/90 text-black"><Star className="h-4 w-4" /></button>
                        </IconTip>
                      ) : null}
                    </div>
                    <IconTip label="Quitar imagen">
                      <button type="button" aria-label="Quitar imagen" disabled={disabled} onClick={() => remove(index)} className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/90 text-red-600"><Trash2 className="h-4 w-4" /></button>
                    </IconTip>
                  </div>
                </li>
              ))}
              {uploads.map((u) => (
                <li key={u.id} className="relative aspect-square overflow-hidden rounded-xl border border-border bg-default-100">
                  <img src={u.preview} alt="" className={cn("h-full w-full object-cover", !u.error && "opacity-50")} />
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-2 text-center">
                    {u.error ? (
                      <>
                        <span className="flex items-center gap-1 rounded-lg bg-white/95 px-2 py-1 text-xs text-destructive"><AlertCircle className="h-3.5 w-3.5 shrink-0" /> {u.error}</span>
                        <Btn size="sm" onClick={() => dismiss(u.id)}>Cerrar</Btn>
                      </>
                    ) : (
                      <span className="flex items-center gap-2 rounded-lg bg-white/95 px-2 py-1 text-xs"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Subiendo…</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      {notes.length ? (
        <ul className="space-y-1" role="status">
          {notes.map((note, i) => <li key={i} className="flex items-start gap-1.5 text-xs text-amber-700"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {note}</li>)}
        </ul>
      ) : null}
      {busy ? <p className="text-xs text-default-500">Esperá a que terminen de subir las imágenes antes de guardar.</p> : null}
    </div>
  );
}
