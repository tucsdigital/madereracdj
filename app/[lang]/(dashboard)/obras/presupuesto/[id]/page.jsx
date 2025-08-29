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
import { Printer, Edit, Save, X, Building, MapPin, User, FileText } from "lucide-react";
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
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [converting, setConverting] = useState(false);
  const [convertMessage, setConvertMessage] = useState("");
  const [datosConversion, setDatosConversion] = useState({
    tipoObra: "",
    prioridad: "",
    responsable: "",
    direccion: "",
    localidad: "",
    provincia: "",
    descripcionGeneral: "",
    ubicacionTipo: "cliente", // "cliente" o "nueva"
    categoriaMaterial: "",
    productoSeleccionado: "",
    cantidadMaterial: "",
    materialesAdicionales: []
  });
  const router = useRouter();
  const { user } = useAuth();

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
    // Agregar catálogo de productos normales
    productosCatalogo,
    productosPorCategoria,
    categorias,
    cargarCatalogoProductos,
    setEditando,
    setCategoriaObraId,
    setBusquedaProductoObra,
    setItemsPresupuesto,
    setDescripcionGeneral,
    guardarEdicion,
    convertirPresupuestoToObra,
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

  const handleOpenConvertModal = async () => {
    // Cargar catálogo de productos normales si no está cargado
    await cargarCatalogoProductos();
    
    // Pre-llenar datos del cliente si existen
    if (obra?.cliente) {
      setDatosConversion(prev => ({
        ...prev,
        direccion: obra.cliente.direccion || "",
        localidad: obra.cliente.localidad || "",
        provincia: obra.cliente.provincia || "",
        descripcionGeneral: obra.descripcionGeneral || descripcionGeneral || "",
        ubicacionTipo: "cliente",
        materialesAdicionales: []
      }));
    }
    setShowConvertModal(true);
  };

  const handleConvertToObra = async () => {
    try {
      setConverting(true);
      setConvertMessage("");
      
      // Validar campos requeridos
      if (!datosConversion.tipoObra || !datosConversion.prioridad || !datosConversion.responsable) {
        throw new Error("Por favor complete todos los campos requeridos");
      }

      // Validar ubicación si se selecciona "nueva ubicación"
      if (datosConversion.ubicacionTipo === "nueva") {
        if (!datosConversion.direccion || !datosConversion.localidad || !datosConversion.provincia) {
          throw new Error("Por favor complete todos los campos de ubicación");
        }
      }

      // Llamar a la función de conversión con los datos del formulario
      await convertirPresupuestoToObra(datosConversion);
      
      setConvertMessage("✅ Presupuesto convertido a obra exitosamente");
      setShowConvertModal(false);
      
      // Limpiar mensaje después de 3 segundos
      setTimeout(() => setConvertMessage(""), 3000);
      
    } catch (error) {
      console.error("Error al convertir presupuesto a obra:", error);
      setConvertMessage(`❌ Error: ${error.message}`);
      
      // Limpiar mensaje después de 5 segundos
      setTimeout(() => setConvertMessage(""), 5000);
    } finally {
      setConverting(false);
    }
  };

  const handleInputChange = (field, value) => {
    setDatosConversion(prev => ({
      ...prev,
      [field]: value
    }));
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
        onConvertToObra={obra?.tipo === "presupuesto" ? handleOpenConvertModal : undefined}
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

      {/* Modal: Convertir a Obra */}
      <Dialog open={showConvertModal} onOpenChange={setShowConvertModal}>
        <DialogContent className="max-w-5xl max-h-[90vh] w-full">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building className="w-5 h-5" />
              Convertir Presupuesto a Obra
            </DialogTitle>
            <DialogDescription>
              Complete los datos para convertir este presupuesto en una nueva obra. El cliente ya está seleccionado.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 max-h-[70vh] overflow-y-auto">
            {/* Datos Generales */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  Datos Generales
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Cliente
                    </label>
                    <Input
                      value={obra?.cliente?.nombre || obra?.cliente?.razonSocial || "Cliente no especificado"}
                      disabled
                      className="bg-gray-50"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Tipo de Obra *
                    </label>
                    <Select
                      value={datosConversion.tipoObra}
                      onValueChange={(value) => handleInputChange("tipoObra", value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar tipo de obra" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="mueble">Mueble</SelectItem>
                        <SelectItem value="carpinteria">Carpintería</SelectItem>
                        <SelectItem value="decoracion">Decoración</SelectItem>
                        <SelectItem value="reparacion">Reparación</SelectItem>
                        <SelectItem value="instalacion">Instalación</SelectItem>
                        <SelectItem value="otro">Otro</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Prioridad *
                    </label>
                    <Select
                      value={datosConversion.prioridad}
                      onValueChange={(value) => handleInputChange("prioridad", value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar prioridad" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="baja">Baja</SelectItem>
                        <SelectItem value="media">Media</SelectItem>
                        <SelectItem value="alta">Alta</SelectItem>
                        <SelectItem value="urgente">Urgente</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Responsable *
                    </label>
                    <Select
                      value={datosConversion.responsable}
                      onValueChange={(value) => handleInputChange("responsable", value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar responsable" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Braian">Braian</SelectItem>
                        <SelectItem value="Damian">Damian</SelectItem>
                        <SelectItem value="Jonathan">Jonathan</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Ubicación */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="w-5 h-5" />
                  Ubicación
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center space-x-4">
                    <label className="flex items-center space-x-2">
                      <input
                        type="radio"
                        name="ubicacionTipo"
                        value="cliente"
                        checked={datosConversion.ubicacionTipo === "cliente"}
                        onChange={(e) => handleInputChange("ubicacionTipo", e.target.value)}
                        className="text-blue-600"
                      />
                      <span className="text-sm font-medium">Usar ubicación del cliente</span>
                    </label>
                    <label className="flex items-center space-x-2">
                      <input
                        type="radio"
                        name="ubicacionTipo"
                        value="nueva"
                        checked={datosConversion.ubicacionTipo === "nueva"}
                        onChange={(e) => handleInputChange("ubicacionTipo", e.target.value)}
                        className="text-blue-600"
                      />
                      <span className="text-sm font-medium">Especificar nueva ubicación</span>
                    </label>
                  </div>
                  
                  {datosConversion.ubicacionTipo === "cliente" ? (
                    <div className="p-3 bg-blue-50 rounded-lg">
                      <p className="text-sm text-blue-800">
                        <strong>Ubicación del cliente:</strong><br />
                        {obra?.cliente?.direccion || "Sin dirección"}<br />
                        {obra?.cliente?.localidad || "Sin localidad"}<br />
                        {obra?.cliente?.provincia || "Sin provincia"}
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Dirección
                        </label>
                        <Input
                          value={datosConversion.direccion}
                          onChange={(e) => handleInputChange("direccion", e.target.value)}
                          placeholder="Dirección de la obra"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Localidad
                        </label>
                        <Input
                          value={datosConversion.localidad}
                          onChange={(e) => handleInputChange("localidad", e.target.value)}
                          placeholder="Localidad"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Provincia
                        </label>
                        <Input
                          value={datosConversion.provincia}
                          onChange={(e) => handleInputChange("provincia", e.target.value)}
                          placeholder="Provincia"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Materiales a Utilizar */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Icon icon="heroicons:cube" className="w-5 h-5" />
                  Materiales a Utilizar
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-sm text-gray-600">
                  <p>Los materiales del presupuesto se transferirán automáticamente a la nueva obra.</p>
                  <div className="mt-3 p-3 bg-blue-50 rounded-lg">
                    <p className="font-medium text-blue-800">
                      Productos del presupuesto: {itemsPresupuesto?.length || 0} items
                    </p>
                    <p className="text-blue-600 text-sm">
                      Total: {formatearNumeroArgentino(obra?.total || 0)}
                    </p>
                  </div>
                </div>
                
                <div className="border-t pt-4">
                  <h4 className="font-medium text-gray-900 mb-3">Agregar materiales adicionales del catálogo</h4>
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Categoría
                        </label>
                        <Select
                          value={datosConversion.categoriaMaterial}
                          onValueChange={(value) => handleInputChange("categoriaMaterial", value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Seleccionar categoría" />
                          </SelectTrigger>
                          <SelectContent>
                            {categorias?.map((cat) => (
                              <SelectItem key={cat} value={cat}>
                                {cat}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Producto
                        </label>
                        <Select
                          value={datosConversion.productoSeleccionado}
                          onValueChange={(value) => handleInputChange("productoSeleccionado", value)}
                          disabled={!datosConversion.categoriaMaterial}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Seleccionar producto" />
                          </SelectTrigger>
                          <SelectContent>
                            {datosConversion.categoriaMaterial && productosPorCategoria[datosConversion.categoriaMaterial]?.map((prod) => (
                              <SelectItem key={prod.id} value={prod.id}>
                                {prod.nombre}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Cantidad
                        </label>
                        <Input
                          type="number"
                          min="1"
                          value={datosConversion.cantidadMaterial || ""}
                          onChange={(e) => handleInputChange("cantidadMaterial", e.target.value)}
                          placeholder="1"
                          disabled={!datosConversion.productoSeleccionado}
                        />
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (datosConversion.productoSeleccionado && datosConversion.cantidadMaterial) {
                          const producto = productosCatalogo.find(p => p.id === datosConversion.productoSeleccionado);
                          if (producto) {
                            const nuevoMaterial = {
                              id: producto.id,
                              nombre: producto.nombre,
                              categoria: producto.categoria,
                              precio: producto.precio,
                              cantidad: parseInt(datosConversion.cantidadMaterial),
                              unidad: producto.unidad || "unidad"
                            };
                            setDatosConversion(prev => ({
                              ...prev,
                              materialesAdicionales: [...(prev.materialesAdicionales || []), nuevoMaterial],
                              categoriaMaterial: "",
                              productoSeleccionado: "",
                              cantidadMaterial: ""
                            }));
                          }
                        }
                      }}
                      disabled={!datosConversion.productoSeleccionado || !datosConversion.cantidadMaterial}
                      className="flex items-center gap-2"
                    >
                      <Icon icon="heroicons:plus" className="w-4 h-4" />
                      Agregar Material
                    </Button>
                  </div>
                  
                  {/* Lista de materiales adicionales */}
                  {datosConversion.materialesAdicionales && datosConversion.materialesAdicionales.length > 0 && (
                    <div className="mt-4">
                      <h5 className="font-medium text-gray-900 mb-2">Materiales adicionales seleccionados:</h5>
                      <div className="space-y-2">
                        {datosConversion.materialesAdicionales.map((mat, index) => (
                          <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                            <span className="text-sm">
                              {mat.nombre} - {mat.cantidad} {mat.unidad}
                            </span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setDatosConversion(prev => ({
                                  ...prev,
                                  materialesAdicionales: prev.materialesAdicionales.filter((_, i) => i !== index)
                                }));
                              }}
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Descripción General */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  Descripción General de la Obra
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Descripción detallada de la obra
                  </label>
                  <textarea
                    value={datosConversion.descripcionGeneral}
                    onChange={(e) => handleInputChange("descripcionGeneral", e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    rows={4}
                    placeholder="Describa en detalle los trabajos a realizar, especificaciones técnicas, materiales especiales, cronograma, etc..."
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Esta descripción será utilizada para el seguimiento y control de la obra.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          <DialogFooter className="gap-2">
            <Button 
              variant="outline" 
              onClick={() => setShowConvertModal(false)}
              disabled={converting}
            >
              Cancelar
            </Button>
            <Button 
              onClick={handleConvertToObra}
              disabled={converting || !datosConversion.tipoObra || !datosConversion.prioridad || !datosConversion.responsable}
              className="flex items-center gap-2"
            >
              {converting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Convirtiendo...
                </>
              ) : (
                <>
                  <Building className="w-4 h-4" />
                  Convertir a Obra
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PresupuestoPage;
