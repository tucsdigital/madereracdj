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
import { Image as ImageIcon, AlertCircle, Package } from "lucide-react";

const DragDropImageModal = ({ 
  isOpen, 
  onClose, 
  onConfirm, 
  imagePreview, 
  fileName,
  producto,
  uploading 
}) => {
  if (!producto) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <ImageIcon className="w-6 h-6 text-blue-600" />
            Confirmar Subida de Imagen
          </DialogTitle>
          <DialogDescription>
            Estás a punto de subir una imagen al siguiente producto
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Información del producto */}
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-200">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Package className="w-5 h-5 text-blue-600" />
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium text-gray-500 mb-1">
                  Producto de destino:
                </div>
                <div className="font-bold text-gray-900 text-lg">
                  {producto.nombre}
                </div>
                <div className="text-sm text-gray-600 mt-1">
                  Código: <span className="font-semibold">{producto.codigo}</span>
                </div>
                <div className="text-sm text-gray-600">
                  Categoría: <span className="font-semibold">{producto.categoria}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Preview de la imagen */}
          {imagePreview && (
            <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
              <div className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                <ImageIcon className="w-4 h-4" />
                Vista previa de la imagen:
              </div>
              <div className="flex items-center gap-4">
                <img 
                  src={imagePreview} 
                  alt="Preview" 
                  className="w-32 h-32 object-cover rounded-lg border-2 border-gray-300 shadow-sm"
                />
                <div className="flex-1">
                  <div className="text-sm text-gray-600 break-all">
                    <span className="font-medium">Archivo:</span>
                    <br />
                    {fileName}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Alerta informativa */}
          <div className="bg-amber-50 rounded-lg p-3 border border-amber-200 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-amber-800">
              <p className="font-medium mb-1">Importante:</p>
              <p>Esta imagen se agregará a la galería del producto. Si deseas que sea la imagen principal, podrás reordenarla después en el editor del producto.</p>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={uploading}
            className="flex-1 sm:flex-initial"
          >
            Cancelar
          </Button>
          <Button
            onClick={onConfirm}
            disabled={uploading}
            className="flex-1 sm:flex-initial bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
          >
            {uploading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Subiendo...
              </>
            ) : (
              <>
                <ImageIcon className="w-4 h-4 mr-2" />
                Confirmar y Subir
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default DragDropImageModal;

