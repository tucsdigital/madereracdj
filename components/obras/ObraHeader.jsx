"use client";
import React from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Edit, Printer, Download, Save, X, Building, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

const ObraHeader = ({ 
  obra, 
  editando, 
  onToggleEdit, 
  onPrint, 
  onDownload,
  onCancel,
  onConvertToObra,
  converting = false,
  saving = false,
  showBackButton = true,
  backUrl = "/obras"
}) => {
  const router = useRouter();

  const handleBack = () => {
    router.push(backUrl);
  };

  const handleSave = () => {
    onToggleEdit();
  };

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    } else {
      onToggleEdit();
    }
  };

  return (
    <div className="flex items-center justify-between mb-6">
      <div className="flex items-center gap-4">
        {showBackButton && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleBack}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver
          </Button>
        )}
      </div>
      
      <div className="flex items-center gap-2">
        {editando ? (
          <>
            <Button
              variant="outline"
              onClick={handleCancel}
              disabled={saving}
              className="flex items-center gap-2"
            >
              <X className="w-4 h-4" />
              Cancelar
            </Button>

            <Button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              {saving ? "Guardando…" : "Guardar cambios"}
            </Button>
          </>
        ) : (
          <Button
            variant="outline"
            onClick={onToggleEdit}
            className="flex items-center gap-2"
          >
            <Edit className="w-4 h-4" />
            Editar
          </Button>
        )}
        
        <Button
          variant="outline"
          onClick={onPrint}
          className="flex items-center gap-2"
        >
          <Printer className="w-4 h-4" />
          Imprimir
        </Button>
        
        {onDownload && (
          <Button
            variant="outline"
            onClick={onDownload}
            className="flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            Descargar
          </Button>
        )}

        {onConvertToObra && (
          <Button
            variant="outline"
            onClick={onConvertToObra}
            className="flex items-center gap-2"
            disabled={converting}
          >
            {converting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Building className="w-4 h-4" />
            )}
            {converting ? "Convirtiendo..." : "Convertir a Obra"}
          </Button>
        )}
      </div>
    </div>
  );
};

export default ObraHeader;
