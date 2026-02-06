"use client";

import React, { useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Trash2, Upload, FileText, Loader2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";

export default function ComprobantesPagoSection({
  comprobantes = [],
  onComprobantesChange,
  disabled = false,
  maxFiles = 10,
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [deletingIdx, setDeletingIdx] = useState(null);
  const inputRef = useRef(null);

  const handleUpload = useCallback(
    async (files) => {
      if (!files?.length || comprobantes.length >= maxFiles) return;
      const restantes = maxFiles - comprobantes.length;
      const toUpload = Array.from(files).slice(0, restantes);

      setUploading(true);
      setUploadProgress(0);
      const nuevos = [];
      const total = toUpload.length;
      let completed = 0;

      try {
        for (const file of toUpload) {
          const formData = new FormData();
          formData.append("file", file);
          const res = await fetch("/api/upload-comprobante", {
            method: "POST",
            body: formData,
          });
          if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || "Error al subir");
          }
          const data = await res.json();
          nuevos.push({
            url: data.url,
            nombre: data.nombre || file.name,
            tipo: data.tipo || (file.type === "application/pdf" ? "pdf" : "image"),
          });
          completed++;
          setUploadProgress(Math.round((completed / total) * 100));
        }
        onComprobantesChange([...comprobantes, ...nuevos]);
      } catch (err) {
        alert(err.message || "Error al subir comprobante");
      } finally {
        setUploading(false);
        setUploadProgress(0);
      }
    },
    [comprobantes, maxFiles, onComprobantesChange]
  );

  const handleDelete = useCallback(
    async (idx) => {
      const comp = comprobantes[idx];
      if (!comp) return;
      setDeletingIdx(idx);
      try {
        if (comp.url?.includes("blob.vercel-storage.com")) {
          const res = await fetch("/api/delete-blob", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: comp.url }),
          });
          if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || "Error al eliminar");
          }
        }
        const next = comprobantes.filter((_, i) => i !== idx);
        onComprobantesChange(next);
      } catch (err) {
        alert(err.message || "Error al eliminar comprobante");
      } finally {
        setDeletingIdx(null);
      }
    },
    [comprobantes, onComprobantesChange]
  );

  const onDrop = useCallback(
    (e) => {
      e.preventDefault();
      setIsDragging(false);
      if (disabled || uploading) return;
      handleUpload(e.dataTransfer.files);
    },
    [disabled, uploading, handleUpload]
  );

  const onDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const onFileChange = useCallback(
    (e) => {
      const files = e.target?.files;
      if (files?.length) handleUpload(files);
      e.target.value = "";
    },
    [handleUpload]
  );

  const canAdd = comprobantes.length < maxFiles && !uploading && !disabled;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-700">Comprobantes de pago</h4>
        <span className="text-xs text-gray-500">
          {comprobantes.length}/{maxFiles}
        </span>
      </div>

      {/* Zona drag & drop */}
      {canAdd && (
        <div
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onClick={() => inputRef.current?.click()}
          className={`
            relative flex flex-col items-center justify-center min-h-[140px] rounded-xl border-2 border-dashed
            transition-all duration-200 cursor-pointer
            ${isDragging
              ? "border-blue-500 bg-blue-50/80 scale-[1.01]"
              : "border-gray-300 hover:border-blue-400 hover:bg-blue-50/40"
            }
          `}
        >
          <input
            ref={inputRef}
            type="file"
            accept="image/*,application/pdf"
            multiple
            className="hidden"
            onChange={onFileChange}
            disabled={uploading}
          />
          {uploading ? (
            <div className="flex flex-col items-center gap-3 py-6">
              <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
              <span className="text-sm font-medium text-gray-600">Subiendo...</span>
              <Progress value={uploadProgress} className="w-48 h-2" />
              <span className="text-xs text-gray-500">{uploadProgress}%</span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 py-6 px-4 text-center">
              <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                <Upload className="w-6 h-6 text-blue-600" />
              </div>
              <span className="text-sm font-medium text-gray-700">
                Arrastrá archivos o hacé clic
              </span>
              <span className="text-xs text-gray-500">
                Imágenes (JPG, PNG, WebP) o PDF · Máx. 10MB cada uno
              </span>
            </div>
          )}
        </div>
      )}

      {/* Lista de comprobantes */}
      {comprobantes.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {comprobantes.map((comp, idx) => (
            <div
              key={`${comp.url}-${idx}`}
              className="group relative flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200 hover:border-slate-300 transition-colors"
            >
              <a
                href={comp.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 min-w-0 flex items-center gap-3 no-underline text-gray-800"
              >
                {comp.tipo === "pdf" ? (
                  <div className="shrink-0 w-12 h-12 rounded-lg bg-red-100 flex items-center justify-center">
                    <FileText className="w-6 h-6 text-red-600" />
                  </div>
                ) : (
                  <img
                    src={comp.url}
                    alt={comp.nombre || "Comprobante"}
                    className="shrink-0 w-12 h-12 rounded-lg object-cover border border-slate-200"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate" title={comp.nombre}>
                    {comp.nombre || `Comprobante ${idx + 1}`}
                  </p>
                  <p className="text-xs text-gray-500">
                    {comp.tipo === "pdf" ? "PDF" : "Imagen"}
                  </p>
                </div>
              </a>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleDelete(idx);
                }}
                disabled={deletingIdx === idx}
                className="shrink-0 h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                title="Eliminar (también se borra del servidor)"
              >
                {deletingIdx === idx ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
