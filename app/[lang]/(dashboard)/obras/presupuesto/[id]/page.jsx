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
import { Printer, Edit, Save, X, Building } from "lucide-react";
import { db } from "@/lib/firebase";
import { doc, getDoc, updateDoc, collection, addDoc, serverTimestamp } from "firebase/firestore";
import { useObra } from "@/hooks/useObra";
import { formatearNumeroArgentino, formatearFecha, generarContenidoImpresion } from "@/lib/obra-utils";
import ObraHeader from "@/components/obras/ObraHeader";
import ObraInfoGeneral from "@/components/obras/ObraInfoGeneral";
import ObraResumenFinanciero from "@/components/obras/ObraResumenFinanciero";
import PresupuestoDetalle from "@/components/obras/PresupuestoDetalle";
import PrintDownloadButtons from "@/components/ui/print-download-buttons";
import { useAuth } from "@/provider/auth.provider";
import { useRouter } from "next/navigation";

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
    convertirPresupuestoToObra,
    convertMessage,
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

  const handleConvertToObra = async () => {
    try {
      setConverting(true);
      setConvertMessage("");
      
      await convertirPresupuestoToObra();
      
      setConvertMessage("✅ Presupuesto convertido a obra exitosamente");
      
      // El hook se encargará de la redirección
      
    } catch (error) {
      console.error("Error al convertir presupuesto a obra:", error);
      setConvertMessage(`❌ Error: ${error.message}`);
      
      // Limpiar mensaje después de 5 segundos
      setTimeout(() => setConvertMessage(""), 5000);
    } finally {
      setConverting(false);
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
        onConvertToObra={handleConvertToObra}
        converting={converting}
        showBackButton={true}
        backUrl={`/${lang}/obras`}
      />

      {/* Mensaje de conversión */}
      {convertMessage && (
        <div className={`mb-6 p-4 rounded-xl flex items-center gap-3 text-base font-medium shadow-lg border transition-all duration-500 ${
          convertMessage.startsWith('✅') 
            ? "bg-gradient-to-r from-green-50 to-emerald-50 border-green-200 text-green-800 shadow-green-100" 
            : "bg-gradient-to-r from-red-50 to-rose-50 border-red-200 text-red-800 shadow-red-100"
        }`}>
          {convertMessage.startsWith('✅') ? (
            <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
              <Building className="w-6 h-6 text-green-600" />
            </div>
          ) : (
            <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
              <Building className="w-6 h-6 text-red-600" />
            </div>
          )}
          <span className="font-semibold">{convertMessage}</span>
        </div>
      )}

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
