"use client";
import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Image as ImageIcon, AlertCircle, Package, Upload, CheckCircle2, Layers } from "lucide-react";

const DragDropImageModal = ({ 
  isOpen, 
  onClose, 
  onConfirm, 
  imagePreview, 
  fileName,
  producto,
  uploading,
  uploadProgress = 0 
}) => {
  if (!producto) return null;

  // Detectar si es un array de imágenes o una sola imagen
  const isMultiple = Array.isArray(imagePreview);
  const imagenes = isMultiple ? imagePreview : (imagePreview ? [{ preview: imagePreview, name: fileName }] : []);
  const imagenesActuales = (producto.imagenes || []).length;
  const espacioDisponible = 3 - imagenesActuales;
  const totalDespuesDeSubir = imagenesActuales + imagenes.length;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <div className="rounded-lg bg-primary/10 p-2 text-primary">
              <ImageIcon className="h-5 w-5" />
            </div>
            <span className="text-foreground">
              {imagenes.length === 1 ? 'Confirmar Subida de Imagen' : `Confirmar Subida de ${imagenes.length} Imágenes`}
            </span>
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {imagenes.length === 1 
              ? 'Estás a punto de agregar una imagen a este producto'
              : `Estás a punto de agregar ${imagenes.length} imágenes a este producto`
            }
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Información del producto con diseño mejorado */}
          <div className="rounded-xl border border-border bg-muted/30 p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-background p-2.5 shadow-sm">
                <Package className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-primary">
                  Producto de destino
                </div>
                <div className="text-lg font-bold text-foreground">
                  {producto.nombre}
                </div>
                <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="rounded-md border border-border bg-background px-2 py-1">
                    <span className="font-medium">Código:</span> {producto.codigo}
                  </span>
                  <span className="rounded-md border border-border bg-background px-2 py-1">
                    <span className="font-medium">Categoría:</span> {producto.categoria}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Contador de imágenes con barra de progreso visual */}
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Layers className="h-5 w-5 text-primary" />
                <span className="font-semibold text-foreground">Estado de la galería</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-2xl font-bold text-foreground">{totalDespuesDeSubir}</span>
                <span className="text-muted-foreground">/</span>
                <span className="text-lg font-semibold text-muted-foreground">3</span>
              </div>
            </div>
            
            {/* Barra de progreso visual */}
            <div className="relative h-3 w-full overflow-hidden rounded-full bg-muted">
              <div 
                className="absolute left-0 top-0 h-full rounded-full bg-primary transition-all duration-500 ease-out motion-reduce:transition-none"
                style={{ width: `${(totalDespuesDeSubir / 3) * 100}%` }}
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-[10px] font-bold text-primary-foreground drop-shadow-md">
                  {totalDespuesDeSubir === 3 ? '¡COMPLETO!' : `${espacioDisponible - imagenes.length} espacio${espacioDisponible - imagenes.length !== 1 ? 's' : ''} restante${espacioDisponible - imagenes.length !== 1 ? 's' : ''}`}
                </span>
              </div>
            </div>
            
            <div className="grid grid-cols-3 gap-2 mt-3 text-xs">
              <div className="text-center">
                <div className="font-semibold text-foreground">{imagenesActuales}</div>
                <div className="text-muted-foreground">Actuales</div>
              </div>
              <div className="text-center">
                <div className="font-semibold text-primary">+{imagenes.length}</div>
                <div className="text-muted-foreground">Nuevas</div>
              </div>
              <div className="text-center">
                <div className={`font-semibold ${totalDespuesDeSubir === 3 ? 'text-success' : 'text-foreground'}`}>
                  {totalDespuesDeSubir}
                </div>
                <div className="text-muted-foreground">Total</div>
              </div>
            </div>
          </div>

          {/* Preview de las imágenes - Grid responsive */}
          {imagenes.length > 0 && (
            <div className="rounded-xl border border-border bg-muted/30 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <ImageIcon className="h-4 w-4 text-primary" />
                  Vista previa {imagenes.length > 1 && `(${imagenes.length} imágenes)`}
                </div>
                {totalDespuesDeSubir === 3 && (
                  <div className="flex items-center gap-1 rounded-full border border-success/20 bg-success/10 px-2 py-1 text-xs font-medium text-success">
                    <CheckCircle2 className="w-3 h-3" />
                    Galería completa
                  </div>
                )}
              </div>
              
              <div className={`grid gap-3 ${
                imagenes.length === 1 
                  ? 'grid-cols-1' 
                  : imagenes.length === 2 
                    ? 'grid-cols-2' 
                    : 'grid-cols-3'
              }`}>
                {imagenes.map((img, idx) => (
                  <div 
                    key={idx} 
                    className="group relative overflow-hidden rounded-lg border-2 border-border bg-background shadow-sm transition-all duration-300 hover:border-primary/50 hover:shadow-lg motion-reduce:transition-none animate-fadeIn"
                    style={{ animationDelay: `${idx * 100}ms` }}
                  >
                    {/* Número de imagen */}
                    <div className="absolute top-2 left-2 z-10">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground shadow-lg">
                        {idx + 1}
                      </div>
                    </div>
                    
                    {/* Preview de la imagen */}
                    <div className="relative aspect-square overflow-hidden bg-muted">
                      <img 
                        src={img.preview} 
                        alt={`Preview ${idx + 1}`} 
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                      />
                      {/* Overlay al hover */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                    </div>
                    
                    {/* Nombre del archivo */}
                    <div className="border-t border-border bg-background p-2">
                      <div className="truncate text-xs text-muted-foreground" title={img.name}>
                        <span className="font-medium">📎</span> {img.name}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Alerta informativa mejorada */}
          <div className={`rounded-xl p-4 border-2 flex items-start gap-3 transition-all duration-300 ${
            totalDespuesDeSubir === 3 
              ? 'border-success/30 bg-success/10'
              : 'border-warning/30 bg-warning/10'
          }`}>
            {totalDespuesDeSubir === 3 ? (
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
            ) : (
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
            )}
            <div className={`text-sm ${totalDespuesDeSubir === 3 ? 'text-success' : 'text-warning'}`}>
              <p className="font-semibold mb-1">
                {totalDespuesDeSubir === 3 ? '¡Perfecto!' : 'Información:'}
              </p>
              <p>
                {totalDespuesDeSubir === 3 
                  ? 'Con esta subida, la galería del producto alcanzará el límite máximo de 3 imágenes. Podrás reordenar o eliminar imágenes desde el editor del producto.'
                  : `Después de esta subida, el producto tendrá ${totalDespuesDeSubir} de 3 imágenes. ${espacioDisponible - imagenes.length > 0 ? `Podrás agregar ${espacioDisponible - imagenes.length} imagen${espacioDisponible - imagenes.length !== 1 ? 'es' : ''} más.` : ''} Podrás reordenar las imágenes en el editor del producto.`
                }
              </p>
            </div>
          </div>
        </div>

        {/* Barra de progreso durante la subida */}
        {uploading && (
          <div className="px-4 pb-4">
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-foreground">
                  Subiendo {imagenes.length > 1 ? 'imágenes' : 'imagen'}...
                </span>
                <span className="text-xs font-medium text-primary">
                  {uploadProgress}%
                </span>
              </div>
              <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
                <div 
                  className="absolute left-0 top-0 h-full rounded-full bg-primary transition-all duration-300 ease-out motion-reduce:transition-none"
                  style={{ width: `${uploadProgress}%` }}
                >
                  <div className="absolute inset-0 animate-pulse bg-primary-foreground/30" />
                </div>
              </div>
              <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent motion-reduce:animate-none"></div>
                <span>Por favor espera, no cierres esta ventana...</span>
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 border-t border-border pt-4 sm:gap-0">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={uploading}
            className="flex-1 border-border transition-colors hover:bg-muted sm:flex-initial"
          >
            Cancelar
          </Button>
          <Button
            onClick={onConfirm}
            disabled={uploading}
            className="flex-1 bg-primary text-primary-foreground transition-colors hover:bg-primary/90 sm:flex-initial disabled:cursor-not-allowed"
          >
            {uploading ? (
              <>
                <div className="mr-2 h-4 w-4 animate-spin rounded-full border-b-2 border-primary-foreground motion-reduce:animate-none"></div>
                <span>Subiendo {imagenes.length > 1 ? `${imagenes.length} imágenes` : 'imagen'}...</span>
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 mr-2" />
                <span>Subir {imagenes.length > 1 ? `${imagenes.length} Imágenes` : 'Imagen'}</span>
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default DragDropImageModal;

