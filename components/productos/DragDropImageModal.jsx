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
            <div className="p-2 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg">
              <ImageIcon className="w-5 h-5 text-white" />
            </div>
            <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              {imagenes.length === 1 ? 'Confirmar Subida de Imagen' : `Confirmar Subida de ${imagenes.length} Imágenes`}
            </span>
          </DialogTitle>
          <DialogDescription className="text-gray-600">
            {imagenes.length === 1 
              ? 'Estás a punto de agregar una imagen a este producto'
              : `Estás a punto de agregar ${imagenes.length} imágenes a este producto`
            }
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Información del producto con diseño mejorado */}
          <div className="bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 rounded-xl p-4 border-2 border-blue-200 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="p-2.5 bg-white rounded-lg shadow-sm">
                <Package className="w-5 h-5 text-blue-600" />
              </div>
              <div className="flex-1">
                <div className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-1">
                  Producto de destino
                </div>
                <div className="font-bold text-gray-900 text-lg">
                  {producto.nombre}
                </div>
                <div className="flex items-center gap-3 mt-2 text-xs text-gray-600">
                  <span className="bg-white px-2 py-1 rounded-md border border-gray-200">
                    <span className="font-medium">Código:</span> {producto.codigo}
                  </span>
                  <span className="bg-white px-2 py-1 rounded-md border border-gray-200">
                    <span className="font-medium">Categoría:</span> {producto.categoria}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Contador de imágenes con barra de progreso visual */}
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl p-4 border border-green-200">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-green-600" />
                <span className="font-semibold text-gray-900">Estado de la galería</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-2xl font-bold text-green-600">{totalDespuesDeSubir}</span>
                <span className="text-gray-400">/</span>
                <span className="text-lg font-semibold text-gray-600">3</span>
              </div>
            </div>
            
            {/* Barra de progreso visual */}
            <div className="relative w-full h-3 bg-gray-200 rounded-full overflow-hidden">
              <div 
                className="absolute top-0 left-0 h-full bg-gradient-to-r from-green-400 to-emerald-500 rounded-full transition-all duration-500 ease-out"
                style={{ width: `${(totalDespuesDeSubir / 3) * 100}%` }}
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-[10px] font-bold text-white drop-shadow-md">
                  {totalDespuesDeSubir === 3 ? '¡COMPLETO!' : `${espacioDisponible - imagenes.length} espacio${espacioDisponible - imagenes.length !== 1 ? 's' : ''} restante${espacioDisponible - imagenes.length !== 1 ? 's' : ''}`}
                </span>
              </div>
            </div>
            
            <div className="grid grid-cols-3 gap-2 mt-3 text-xs">
              <div className="text-center">
                <div className="font-semibold text-gray-700">{imagenesActuales}</div>
                <div className="text-gray-500">Actuales</div>
              </div>
              <div className="text-center">
                <div className="font-semibold text-blue-600">+{imagenes.length}</div>
                <div className="text-gray-500">Nuevas</div>
              </div>
              <div className="text-center">
                <div className={`font-semibold ${totalDespuesDeSubir === 3 ? 'text-green-600' : 'text-gray-700'}`}>
                  {totalDespuesDeSubir}
                </div>
                <div className="text-gray-500">Total</div>
              </div>
            </div>
          </div>

          {/* Preview de las imágenes - Grid responsive */}
          {imagenes.length > 0 && (
            <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-4 border border-gray-200">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-blue-600" />
                  Vista previa {imagenes.length > 1 && `(${imagenes.length} imágenes)`}
                </div>
                {totalDespuesDeSubir === 3 && (
                  <div className="flex items-center gap-1 text-xs font-medium text-green-600 bg-green-50 px-2 py-1 rounded-full border border-green-200">
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
                    className="group relative bg-white rounded-lg border-2 border-gray-200 overflow-hidden shadow-sm hover:shadow-lg hover:border-blue-300 transition-all duration-300 animate-fadeIn"
                    style={{ animationDelay: `${idx * 100}ms` }}
                  >
                    {/* Número de imagen */}
                    <div className="absolute top-2 left-2 z-10">
                      <div className="bg-gradient-to-br from-blue-600 to-indigo-600 text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center shadow-lg">
                        {idx + 1}
                      </div>
                    </div>
                    
                    {/* Preview de la imagen */}
                    <div className="aspect-square relative overflow-hidden bg-gray-100">
                      <img 
                        src={img.preview} 
                        alt={`Preview ${idx + 1}`} 
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                      />
                      {/* Overlay al hover */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                    </div>
                    
                    {/* Nombre del archivo */}
                    <div className="p-2 bg-white border-t border-gray-200">
                      <div className="text-xs text-gray-600 truncate" title={img.name}>
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
              ? 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-300' 
              : 'bg-gradient-to-r from-amber-50 to-orange-50 border-amber-300'
          }`}>
            {totalDespuesDeSubir === 3 ? (
              <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
            )}
            <div className={`text-sm ${totalDespuesDeSubir === 3 ? 'text-green-800' : 'text-amber-800'}`}>
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
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-4 border border-blue-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-blue-800">
                  Subiendo {imagenes.length > 1 ? 'imágenes' : 'imagen'}...
                </span>
                <span className="text-xs font-medium text-blue-600">
                  {uploadProgress}%
                </span>
              </div>
              <div className="relative w-full h-2 bg-blue-100 rounded-full overflow-hidden">
                <div 
                  className="absolute top-0 left-0 h-full bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${uploadProgress}%` }}
                >
                  <div className="absolute inset-0 bg-white/30 animate-pulse" />
                </div>
              </div>
              <div className="mt-2 flex items-center gap-2 text-xs text-blue-700">
                <div className="animate-spin rounded-full h-3 w-3 border-2 border-blue-600 border-t-transparent"></div>
                <span>Por favor espera, no cierres esta ventana...</span>
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0 border-t pt-4">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={uploading}
            className="flex-1 sm:flex-initial border-2 hover:border-gray-400 transition-all"
          >
            Cancelar
          </Button>
          <Button
            onClick={onConfirm}
            disabled={uploading}
            className="flex-1 sm:flex-initial bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-lg hover:shadow-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {uploading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
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

