"use client";
import React from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Edit, Printer, Download } from "lucide-react";
import { useRouter } from "next/navigation";

const ObraHeader = ({ 
  obra, 
  editando, 
  onToggleEdit, 
  onPrint, 
  onDownload,
  showBackButton = true,
  backUrl = "/obras"
}) => {
  const router = useRouter();

  const handleBack = () => {
    router.push(backUrl);
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
        <Button
          variant={editando ? "default" : "outline"}
          onClick={onToggleEdit}
          className="flex items-center gap-2"
        >
          <Edit className="w-4 h-4" />
          {editando ? "Guardando..." : "Editar"}
        </Button>
        
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
      </div>
    </div>
  );
};

export default ObraHeader;
