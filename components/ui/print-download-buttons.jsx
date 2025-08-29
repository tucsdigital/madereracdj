"use client";
import React from "react";
import { Button } from "@/components/ui/button";
import { Printer, Download } from "lucide-react";
import { generarContenidoImpresion, descargarPDF } from "@/lib/obra-utils";

const PrintDownloadButtons = ({ 
  obra, 
  presupuesto, 
  modoCosto, 
  movimientos = [],
  className = "",
  variant = "outline",
  size = "sm"
}) => {
  const handleImprimir = () => {
    const contenidoHTML = generarContenidoImpresion(obra, presupuesto, modoCosto, movimientos);
    const nuevaVentana = window.open('', '_blank');
    nuevaVentana.document.write(contenidoHTML);
    nuevaVentana.document.close();
    
    // Esperar a que se cargue el contenido antes de imprimir
    setTimeout(() => {
      nuevaVentana.print();
    }, 500);
  };

  const handleDescargarPDF = async () => {
    try {
      await descargarPDF(obra, presupuesto, modoCosto, movimientos);
    } catch (error) {
      console.error('Error al descargar PDF:', error);
      // Fallback: mostrar mensaje de error
      alert('Error al generar el PDF. Intente nuevamente.');
    }
  };

  return (
    <div className={`flex gap-2 ${className}`}>
      <Button
        variant={variant}
        size={size}
        onClick={handleImprimir}
        className="flex items-center gap-2"
      >
        <Printer className="h-4 w-4" />
        Imprimir
      </Button>
      
      <Button
        variant={variant}
        size={size}
        onClick={handleDescargarPDF}
        className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white"
      >
        <Download className="h-4 w-4" />
        Descargar PDF
      </Button>
    </div>
  );
};

export default PrintDownloadButtons;
