"use client";
import React, { useState } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Icon } from "@iconify/react";
import { Printer, Edit, Save, X } from "lucide-react";
import { db } from "@/lib/firebase";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { useObra } from "@/hooks/useObra";
import { formatearNumeroArgentino, formatearFecha, generarContenidoImpresion } from "@/lib/obra-utils";
import ObraHeader from "@/components/obras/ObraHeader";
import ObraInfoGeneral from "@/components/obras/ObraInfoGeneral";
import ObraResumenFinanciero from "@/components/obras/ObraResumenFinanciero";
import PresupuestoDetalle from "@/components/obras/PresupuestoDetalle";
import PrintDownloadButtons from "@/components/ui/print-download-buttons";

const PresupuestoPage = () => {
  const params = useParams();
  const { id, lang } = params;
  const [openPrint, setOpenPrint] = useState(false);
  
  const {
    obra,
    loading,
    error,
    editando,
    itemsPresupuesto,
    productosObraCatalogo,
    productosObraPorCategoria,
    categoriasObra,
    categoriaObraId,
    busquedaProductoObra,
    descripcionGeneral,
    setEditando,
    setCategoriaObraId,
    setBusquedaProductoObra,
    setItemsPresupuesto,
    setDescripcionGeneral,
    guardarEdicion,
  } = useObra(id);

  const handlePrint = () => {
    setOpenPrint(true);
  };

  const handleToggleEdit = () => {
    if (editando) {
      guardarEdicion();
    } else {
      setEditando(true);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Cargando presupuesto...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-red-600 text-6xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Error</h1>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  if (!obra || obra.tipo !== "presupuesto") {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-yellow-600 text-6xl mb-4">📋</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">No es un presupuesto</h1>
          <p className="text-gray-600">Esta página solo muestra presupuestos</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl">
      <ObraHeader
        obra={obra}
        editando={editando}
        onToggleEdit={handleToggleEdit}
        onPrint={handlePrint}
        showBackButton={true}
        backUrl={`/${lang}/obras`}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Columna principal */}
        <div className="lg:col-span-2 space-y-6">
          <PresupuestoDetalle
            itemsPresupuesto={itemsPresupuesto}
            onItemsPresupuestoChange={setItemsPresupuesto}
            productosObraCatalogo={productosObraCatalogo}
            productosObraPorCategoria={productosObraPorCategoria}
            categoriasObra={categoriasObra}
            categoriaObraId={categoriaObraId}
            setCategoriaObraId={setCategoriaObraId}
            busquedaProductoObra={busquedaProductoObra}
            setBusquedaProductoObra={setBusquedaProductoObra}
            editando={editando}
            formatearNumeroArgentino={formatearNumeroArgentino}
            descripcionGeneral={descripcionGeneral}
            onDescripcionGeneralChange={setDescripcionGeneral}
          />
        </div>

        {/* Barra lateral */}
        <div className="space-y-6">
          <ObraInfoGeneral
            obra={obra}
            formatearFecha={formatearFecha}
          />

          <ObraResumenFinanciero
            obra={obra}
            presupuesto={null}
            modoCosto="presupuesto"
            formatearNumeroArgentino={formatearNumeroArgentino}
          />

          {/* Información de envío si existe */}
          {obra.tipoEnvio && obra.tipoEnvio !== "retiro_local" && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Icon icon="heroicons:truck" className="w-5 h-5" />
                  Información de Envío
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="text-sm text-gray-500">Tipo de Envío</p>
                  <p className="font-medium">{obra.tipoEnvio}</p>
                </div>
                {obra.direccionEnvio && (
                  <div>
                    <p className="text-sm text-gray-500">Dirección de Envío</p>
                    <p className="font-medium">{obra.direccionEnvio}</p>
                  </div>
                )}
                {obra.localidadEnvio && (
                  <div>
                    <p className="text-sm text-gray-500">Localidad</p>
                    <p className="font-medium">{obra.localidadEnvio}</p>
                  </div>
                )}
                {obra.transportista && (
                  <div>
                    <p className="text-sm text-gray-500">Transportista</p>
                    <p className="font-medium">{obra.transportista}</p>
                  </div>
                )}
                {obra.fechaEntrega && (
                  <div>
                    <p className="text-sm text-gray-500">Fecha de Entrega</p>
                    <p className="font-medium">
                      {formatearFecha(obra.fechaEntrega)}
                    </p>
                  </div>
                )}
                {obra.rangoHorario && (
                  <div>
                    <p className="text-sm text-gray-500">Rango Horario</p>
                    <p className="font-medium">{obra.rangoHorario}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Modal: Vista previa de impresión */}
      <Dialog open={openPrint} onOpenChange={setOpenPrint}>
        <DialogContent className="max-w-6xl max-h-[90vh] w-full">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Printer className="w-5 h-5" />
              Vista Previa de Impresión - Presupuesto
            </DialogTitle>
            <DialogDescription>
              Revise el documento antes de imprimir. Use los botones de acción para imprimir, descargar PDF o cerrar.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0">
            <iframe
              srcDoc={generarContenidoImpresion(obra, null, "presupuesto")}
              className="w-full h-[70vh] border border-gray-200 rounded-lg"
              title="Vista previa de impresión"
              sandbox="allow-scripts allow-same-origin allow-modals"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpenPrint(false)}>
              Cerrar
            </Button>
            
            {/* Botones de impresión y descarga PDF */}
            <PrintDownloadButtons
              obra={obra}
              presupuesto={null}
              modoCosto="presupuesto"
              movimientos={[]}
              variant="default"
              size="sm"
            />
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PresupuestoPage;
