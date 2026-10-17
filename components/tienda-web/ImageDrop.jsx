"use client";
import { useRef, useState } from "react";
import { ImageIcon, Loader2, UploadCloud } from "lucide-react";
import { cn } from "@/lib/utils";
import { previewUrl } from "@/lib/tienda-web-ui";
import { MAX_UPLOAD_BYTES, ratioWarning } from "@/lib/tienda-media";
import { Btn } from "./ui";

const kb = (bytes) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

/**
 * Zona de imagen: muestra la imagen real, permite arrastrar o elegir un archivo, cambiarla o quitarla,
 * y reutilizar una ya subida. No muestra rutas ni formatos técnicos.
 */
export default function ImageDrop({ label, hint, value, onChange, folder, aspect = "aspect-[21/10]", ratio, ratioLabel, media, tiendaUrl, error, className }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState("");
  const [showLibrary, setShowLibrary] = useState(false);
  const [warning, setWarning] = useState("");

  const enabled = Boolean(media.storage?.ok);
  const src = previewUrl(value, tiendaUrl);
  const library = media.items.filter((item) => item.folder === folder);
  const message = localError || error;

  const handleFile = async (file) => {
    if (!file || !enabled) return;
    setLocalError("");
    setWarning("");
    if (ratio) {
      try {
        const bitmap = await createImageBitmap(file);
        setWarning(ratioWarning(bitmap.width, bitmap.height, ratio, ratioLabel));
        bitmap.close?.();
      } catch {
        // si el navegador no puede leerla, el servidor la valida igual
      }
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setLocalError(`La imagen pesa ${kb(file.size)}; el máximo es ${Math.round(MAX_UPLOAD_BYTES / 1048576)} MB.`);
      return;
    }
    setUploading(true);
    try {
      const item = await media.upload(file, folder);
      onChange(item.url);
      setShowLibrary(false);
    } catch (e) {
      setLocalError(e.message);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const pick = () => enabled && !uploading && inputRef.current?.click();

  return (
    <div className={cn("space-y-2", className)}>
      {label && <div className="text-sm font-medium">{label}</div>}
      <div
        onDragOver={(e) => { if (enabled) { e.preventDefault(); setDragging(true); } }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files?.[0]); }}
        className={cn(
          "group relative w-full overflow-hidden rounded-xl border bg-default-50",
          aspect,
          value ? "border-border" : "border-dashed border-default-300",
          dragging && "border-primary bg-primary/5",
          message && "border-destructive"
        )}
      >
        <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/avif" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />

        {value ? (
          src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt="" className="absolute inset-0 h-full w-full object-cover" onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-default-400">
              <ImageIcon className="h-6 w-6" />
              <span className="text-xs">Imagen de la tienda</span>
            </div>
          )
        ) : (
          <button type="button" onClick={pick} disabled={!enabled}
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center text-default-500 transition hover:bg-default-100 disabled:cursor-not-allowed disabled:hover:bg-transparent">
            <UploadCloud className="h-6 w-6" />
            <span className="text-sm">{enabled ? "Arrastrá una imagen o hacé clic para subirla" : "La subida de imágenes todavía no está activada"}</span>
          </button>
        )}

        {value && enabled && !uploading && (
          <div className="absolute inset-x-0 bottom-0 flex justify-end gap-2 bg-gradient-to-t from-black/50 to-transparent p-3 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
            <Btn size="sm" onClick={pick}>Cambiar</Btn>
            <Btn size="sm" onClick={() => onChange("")}>Quitar</Btn>
          </div>
        )}
        {value && !enabled && (
          <div className="absolute inset-x-0 bottom-0 flex justify-end bg-gradient-to-t from-black/40 to-transparent p-3 opacity-0 transition group-hover:opacity-100">
            <Btn size="sm" onClick={() => onChange("")}>Quitar</Btn>
          </div>
        )}

        {uploading && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 bg-background/80 text-sm backdrop-blur-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Subiendo y optimizando…
          </div>
        )}
      </div>

      {!message && warning ? <p role="status" className="text-xs text-amber-700">{warning}</p> : null}
      {message ? <p role="alert" className="text-xs text-destructive">{message}</p> : hint ? <p className="text-xs text-default-500">{hint}</p> : null}

      {enabled && library.length > 0 && (
        <div>
          <button type="button" className="text-xs text-default-600 underline-offset-4 hover:underline" onClick={() => setShowLibrary((v) => !v)}>
            {showLibrary ? "Ocultar imágenes subidas" : `Elegir una imagen ya subida (${library.length})`}
          </button>
          {showLibrary && (
            <div className="mt-2 grid max-h-48 grid-cols-4 gap-2 overflow-y-auto rounded-lg border border-border p-2 sm:grid-cols-5">
              {library.map((item) => (
                <button key={item.id} type="button" title={`${item.width || "?"} × ${item.height || "?"} · ${kb(item.size)}`}
                  onClick={() => { onChange(item.url); setShowLibrary(false); }}
                  className="overflow-hidden rounded-md border border-border transition hover:ring-2 hover:ring-primary/40">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.url} alt="" className="aspect-square w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
