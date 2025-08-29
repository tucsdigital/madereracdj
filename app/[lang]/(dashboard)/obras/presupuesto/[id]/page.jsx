"use client";
import React, { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Icon } from "@iconify/react";
import { Printer, Edit, Save, X, Building, MapPin, User, FileText, ChevronDown, ChevronUp } from "lucide-react";
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
  const [showConvertForm, setShowConvertForm] = useState(false);
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
    busquedaProducto: "",
    materialesAdicionales: []
  });

  // Búsqueda debounced para productos (como en create/page.jsx)
  const [busquedaDebounced, setBusquedaDebounced] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setBusquedaDebounced(datosConversion.busquedaProducto), 150);
    return () => clearTimeout(id);
  }, [datosConversion.busquedaProducto]);

  // Paginación para productos (como en create/page.jsx)
  const [paginaActual, setPaginaActual] = useState(1);
  const [productosPorPagina] = useState(12);
  const [isPending, startTransition] = React.useTransition();

  // Resetear página cuando cambien los filtros
  useEffect(() => { 
    setPaginaActual(1); 
  }, [datosConversion.categoriaMaterial, busquedaDebounced]);
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
    catalogoCargado,
    setEditando,
    setCategoriaObraId,
    setBusquedaProductoObra,
    setItemsPresupuesto,
    setDescripcionGeneral,
    guardarEdicion,
    convertirPresupuestoToObra,
  } = useObra(id);

  // Cargar catálogo de productos cuando se monta el componente
  useEffect(() => {
    if (!catalogoCargado && !loading) {
      cargarCatalogoProductos();
    }
  }, [catalogoCargado, loading, cargarCatalogoProductos]);

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

  const handleToggleConvertForm = async () => {
    if (!showConvertForm) {
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
    }
    setShowConvertForm(!showConvertForm);
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
      setShowConvertForm(false);
      
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
    setDatosConversion(prev => {
      const newData = { ...prev, [field]: value };
      
      // Si cambia la categoría, limpiar el producto seleccionado
      if (field === "categoriaMaterial") {
        newData.productoSeleccionado = "";
        newData.cantidadMaterial = "";
      }
      
      return newData;
    });
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
        onConvertToObra={obra?.tipo === "presupuesto" ? handleToggleConvertForm : undefined}
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

          {/* Formulario de conversión a obra */}
          {showConvertForm && (
            <Card className="border-2 border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50 shadow-lg">
              <CardHeader className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
                <CardTitle className="flex items-center gap-3">
                  <Building className="w-6 h-6" />
                  Convertir Presupuesto a Obra
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleToggleConvertForm}
                    className="ml-auto text-white hover:bg-blue-700 hover:text-white"
                  >
                    <X className="w-5 h-5" />
                  </Button>
                </CardTitle>
              </CardHeader>
              
              <CardContent className="p-6 space-y-6">
                {/* Datos Generales */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                    <FileText className="w-5 h-5 text-blue-600" />
                    Datos Generales
                  </h3>
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
                </div>

                {/* Ubicación */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                    <MapPin className="w-5 h-5 text-blue-600" />
                    Ubicación
                  </h3>
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
                      <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
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
                </div>

                {/* Materiales a Utilizar */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                    <Icon icon="heroicons:cube" className="w-5 h-5 text-blue-600" />
                    Materiales a Utilizar
                  </h3>
                  <div className="text-sm text-gray-600">
                    <p>Los materiales del presupuesto se transferirán automáticamente a la nueva obra.</p>
                    <div className="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
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
                    
                    {/* Indicador de estado del catálogo */}
                    <div className="mb-3 p-2 rounded text-sm">
                      {!catalogoCargado ? (
                        <div className="flex items-center gap-2 text-blue-600">
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                          Cargando catálogo de productos...
                        </div>
                      ) : (
                        <div className="text-green-600">
                          ✓ Catálogo cargado: {categorias?.length || 0} categorías, {productosCatalogo?.length || 0} productos
                        </div>
                      )}
                    </div>
                    
                    <div className="space-y-3">
                      <div className="flex flex-col sm:flex-row gap-3">
                        <div className="flex-1">
                          <div className="flex bg-white rounded-lg p-1 shadow-sm border border-gray-200">
                            {categorias && categorias.length > 0 ? (
                              categorias.map((cat) => (
                                <button 
                                  key={cat} 
                                  type="button" 
                                  className={`rounded-full px-4 py-1 text-sm mr-2 ${datosConversion.categoriaMaterial === cat ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`} 
                                  onClick={() => handleInputChange("categoriaMaterial", datosConversion.categoriaMaterial === cat ? "" : cat)}
                                >
                                  {cat}
                                </button>
                              ))
                            ) : (
                              <div className="px-4 py-1 text-sm text-gray-500">
                                {!catalogoCargado ? "Cargando categorías..." : "No hay categorías disponibles"}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex-1 relative flex items-center gap-2">
                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Icon icon="heroicons:magnifying-glass" className="h-5 w-5 text-gray-400" />
                          </div>
                          <input 
                            type="text" 
                            placeholder="Buscar productos..." 
                            value={datosConversion.busquedaProducto || ""} 
                            onChange={(e) => handleInputChange("busquedaProducto", e.target.value)} 
                            onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }} 
                            className="w-full pl-10 pr-10 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 bg-card" 
                          />
                        </div>
                      </div>
                      
                      <div className="max-h-150 overflow-y-auto">
                        {categorias && categorias.length === 0 ? (
                          <div className="p-8 text-center text-gray-500">No hay categorías disponibles</div>
                        ) : !datosConversion.categoriaMaterial && (!busquedaDebounced || busquedaDebounced.trim() === "") ? (
                          <div className="p-8 text-center">
                            <h3 className="text-lg font-medium mb-2">Selecciona una categoría</h3>
                            <p className="text-gray-500">Elige una categoría para ver los productos disponibles</p>
                          </div>
                        ) : (() => {
                          // Filtrar productos basado en categoría y búsqueda
                          let productosFiltrados = [];
                          if (datosConversion.categoriaMaterial && productosPorCategoria[datosConversion.categoriaMaterial]) {
                            productosFiltrados = productosPorCategoria[datosConversion.categoriaMaterial];
                          } else                           if (busquedaDebounced && busquedaDebounced.trim() !== "") {
                            productosFiltrados = productosCatalogo || [];
                          }
                          
                          // Aplicar búsqueda si existe
                          if (busquedaDebounced && busquedaDebounced.trim() !== "") {
                            const busqueda = busquedaDebounced.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "");
                            productosFiltrados = productosFiltrados.filter((prod) => {
                              const nombre = (prod.nombre || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "");
                              const unidad = (prod.unidad || prod.unidadMedida || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "");
                              if (busqueda === "") return true;
                              if (busqueda.endsWith(".")) {
                                const sinPunto = busqueda.slice(0, -1);
                                return nombre.startsWith(sinPunto) || unidad.startsWith(sinPunto);
                              }
                              return nombre.includes(busqueda) || unidad.includes(busqueda);
                            });
                          }
                          
                          if (productosFiltrados.length === 0) {
                            return (
                              <div className="p-8 text-center">
                                <h3 className="text-lg font-medium mb-2">No se encontraron productos</h3>
                                <p className="text-gray-500">Intenta cambiar los filtros o la búsqueda</p>
                              </div>
                            );
                          }
                          
                          const totalProductos = productosFiltrados.length;
                          const totalPaginas = Math.ceil(totalProductos / productosPorPagina) || 1;
                          const productosPaginados = productosFiltrados.slice(
                            (paginaActual - 1) * productosPorPagina, 
                            paginaActual * productosPorPagina
                          );

                          return (
                            <div className="space-y-4">
                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 p-4 relative">
                                {isPending && (
                                  <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-10 flex items-center justify-center rounded-lg">
                                    <div className="flex items-center gap-3 bg-white px-4 py-3 rounded-lg shadow-lg border border-gray-200">
                                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                                      <span className="text-sm font-medium text-gray-700">Cargando productos...</span>
                                    </div>
                                  </div>
                                )}
                                {productosPaginados.map((prod) => {
                                  const yaAgregado = datosConversion.materialesAdicionales?.some((p) => p.id === prod.id);
                                  const precio = (() => {
                                    if (prod.categoria === "Maderas") return Number(prod.precioPorPie) || 0;
                                    if (prod.categoria === "Ferretería") return Number(prod.valorVenta) || 0;
                                    return (
                                      Number(prod.precioUnidad) ||
                                      Number(prod.precioUnidadVenta) ||
                                      Number(prod.precioUnidadHerraje) ||
                                      Number(prod.precioUnidadQuimico) ||
                                      Number(prod.precioUnidadHerramienta) ||
                                      0
                                    );
                                  })();
                                  return (
                                    <div
                                      key={prod.id}
                                      className={`group relative dark:bg-gray-800 rounded-lg border-2 transition-all duration-200 hover:shadow-md h-full flex flex-col ${
                                        yaAgregado
                                          ? "border-green-200 bg-green-50 dark:bg-green-900/20 dark:border-green-700"
                                          : "border-gray-200 dark:border-gray-600 hover:border-blue-300 dark:hover:border-blue-500"
                                      }`}
                                    >
                                      <div className="p-4 flex flex-col h-full">
                                        <div className="flex items-start justify-between mb-3">
                                          <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-3 mb-2">
                                              <div
                                                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                                                  prod.categoria === "Maderas"
                                                    ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
                                                    : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                                                }`}
                                              >
                                                {prod.categoria === "Maderas" ? "🌲" : "🔧"}
                                              </div>
                                              <div className="flex-1 min-w-0">
                                                <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{prod.nombre}</h4>
                                                {prod.categoria === "Maderas" && prod.tipoMadera && (
                                                  <div className="flex items-center gap-1 mt-1">
                                                    <span className="text-xs text-orange-600 dark:text-orange-400 font-medium">🌲 {prod.tipoMadera}</span>
                                                  </div>
                                                )}
                                                {prod.categoria === "Ferretería" && prod.subCategoria && (
                                                  <div className="flex items-center gap-1 mt-1">
                                                    <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">🔧 {prod.subCategoria}</span>
                                                  </div>
                                                )}
                                              </div>
                                              {yaAgregado && (
                                                <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
                                                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg>
                                                  <span className="text-xs font-medium">Agregado</span>
                                                </div>
                                              )}
                                            </div>
                                          </div>
                                        </div>

                                        {/* Información del producto */}
                                        <div className="flex-1 space-y-2">
                                          <div className="flex items-center justify-between">
                                            <span className="text-xs text-gray-500 dark:text-gray-400">Precio:</span>
                                            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">${formatearNumeroArgentino(precio)}</span>
                                          </div>
                                          {(prod.unidadMedida || prod.unidad) && (
                                            <div className="flex items-center justify-between">
                                              <span className="text-xs text-gray-500 dark:text-gray-400">Unidad:</span>
                                              <span className="text-xs text-gray-700 dark:text-gray-300">{prod.unidadMedida || prod.unidad}</span>
                                            </div>
                                          )}
                                          {prod.stock !== undefined && (
                                            <div className="flex items-center justify-between">
                                              <span className="text-xs text-gray-500 dark:text-gray-400">Stock:</span>
                                              <span className={`text-xs font-medium ${prod.stock > 10 ? "text-green-600 dark:text-green-400" : prod.stock > 0 ? "text-yellow-600 dark:text-yellow-400" : "text-red-600 dark:text-red-400"}`}>{prod.stock} unidades</span>
                                            </div>
                                          )}
                                        </div>

                                        {/* Botón de agregar */}
                                        <div className="mt-4">
                                          <button
                                            onClick={() => {
                                              if (yaAgregado) return;
                                              const nuevoMaterial = {
                                                id: prod.id,
                                                nombre: prod.nombre,
                                                categoria: prod.categoria || "",
                                                subcategoria: prod.subcategoria || prod.subCategoria || "",
                                                unidad: prod.unidad || prod.unidadMedida || "UN",
                                                valorVenta: Number(prod.valorVenta) || 0,
                                                cantidad: 1,
                                                descuento: 0,
                                                precio: precio
                                              };
                                              setDatosConversion(prev => ({
                                                ...prev,
                                                materialesAdicionales: [...(prev.materialesAdicionales || []), nuevoMaterial]
                                              }));
                                            }}
                                            disabled={yaAgregado}
                                            className={`w-full py-2 px-3 rounded-md text-sm font-medium transition-colors ${yaAgregado ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 cursor-not-allowed" : "bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"}`}
                                          >
                                            {yaAgregado ? "Ya agregado" : "Agregar"}
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                              
                              {/* Paginación */}
                              {totalPaginas > 1 && (
                                <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-t border-gray-200">
                                  <div className="text-sm text-gray-700 flex items-center gap-2">
                                    {isPending && (<div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-600"></div>)}
                                    <span>Mostrando {paginaActual}-{Math.min(paginaActual + productosPorPagina - 1, totalProductos)} de {totalProductos} productos</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <button onClick={() => startTransition(() => setPaginaActual(1))} disabled={paginaActual === 1 || isPending} className="p-2 rounded-md text-gray-500 hover:text-gray-700 disabled:opacity-50" title="Primera página">
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoinjoin="round" strokeWidth="2" d="M11 19l-7-7 7-7m8 14l-7-7 7-7"/></svg>
                                    </button>
                                    <button onClick={() => startTransition(() => setPaginaActual(Math.max(1, paginaActual - 1)))} disabled={paginaActual === 1 || isPending} className="p-2 rounded-md text-gray-500 hover:text-gray-700 disabled:opacity-50" title="Página anterior">
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoinjoin="round" strokeWidth="2" d="M15 19l-7-7 7-7"/></svg>
                                    </button>
                                    <div className="flex items-center gap-1">
                                      {Array.from({ length: Math.min(5, totalPaginas) }, (_, i) => {
                                        let pageNum;
                                        if (totalPaginas <= 5) pageNum = i + 1;
                                        else if (paginaActual <= 3) pageNum = i + 1;
                                        else if (paginaActual >= totalPaginas - 2) pageNum = totalPaginas - 4 + i;
                                        else pageNum = paginaActual - 2 + i;
                                        return (
                                          <button key={pageNum} onClick={() => startTransition(() => setPaginaActual(pageNum))} disabled={isPending} className={`px-3 py-1 rounded-md text-sm font-medium ${paginaActual === pageNum ? "bg-blue-600 text-white" : "text-gray-600 hover:text-gray-900"}`}>
                                            {pageNum}
                                          </button>
                                        );
                                      })}
                                    </div>
                                    <button onClick={() => startTransition(() => setPaginaActual(Math.min(totalPaginas, paginaActual + 1)))} disabled={paginaActual === totalPaginas || isPending} className="p-2 rounded-md text-gray-500 hover:text-gray-700 disabled:opacity-50" title="Página siguiente">
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoinjoin="round" strokeWidth="2" d="M9 5l7 7-7 7"/></svg>
                                    </button>
                                    <button onClick={() => startTransition(() => setPaginaActual(totalPaginas))} disabled={paginaActual === totalPaginas || isPending} className="p-2 rounded-md text-gray-500 hover:text-gray-700 disabled:opacity-50" title="Última página">
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoinjoin="round" strokeWidth="2" d="M13 5l7 7-7 7M5 5l7 7-7 7"/></svg>
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                    
                    {/* Lista de materiales adicionales */}
                    {datosConversion.materialesAdicionales && datosConversion.materialesAdicionales.length > 0 && (
                      <div className="mt-4">
                        <h5 className="font-medium text-gray-900 mb-2">Materiales adicionales seleccionados:</h5>
                        <div className="space-y-2">
                          {datosConversion.materialesAdicionales.map((mat, index) => (
                            <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border">
                              <div className="flex-1">
                                <div className="flex items-center gap-3">
                                  <div className="flex-1">
                                    <div className="font-medium text-gray-900">{mat.nombre}</div>
                                    <div className="text-sm text-gray-600">
                                      {mat.categoria} {mat.subcategoria && `- ${mat.subcategoria}`}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm text-gray-600">Cantidad:</span>
                                    <div className="flex items-center bg-white border border-gray-300 rounded-lg overflow-hidden shadow-sm">
                                      <button 
                                        type="button" 
                                        onClick={() => {
                                          const nuevaCantidad = Math.max(1, (mat.cantidad || 1) - 1);
                                          setDatosConversion(prev => ({
                                            ...prev,
                                            materialesAdicionales: prev.materialesAdicionales.map((m, i) => 
                                              i === index ? { ...m, cantidad: nuevaCantidad } : m
                                            )
                                          }));
                                        }} 
                                        className="px-3 py-1 text-gray-500 hover:text-gray-900 hover:bg-gray-100 disabled:opacity-50" 
                                        disabled={mat.cantidad <= 1}
                                      >
                                        -
                                      </button>
                                      <span className="w-12 text-center text-sm font-medium border-x border-gray-300 py-1">
                                        {mat.cantidad || 1}
                                      </span>
                                      <button 
                                        type="button" 
                                        onClick={() => {
                                          const nuevaCantidad = (mat.cantidad || 1) + 1;
                                          setDatosConversion(prev => ({
                                            ...prev,
                                            materialesAdicionales: prev.materialesAdicionales.map((m, i) => 
                                              i === index ? { ...m, cantidad: nuevaCantidad } : m
                                            )
                                          }));
                                        }} 
                                        className="px-3 py-1 text-gray-500 hover:text-gray-900 hover:bg-gray-100"
                                      >
                                        +
                                      </button>
                                    </div>
                                    <span className="text-sm text-gray-500 ml-2">{mat.unidad}</span>
                                  </div>
                                  <div className="text-right">
                                    <div className="font-semibold text-gray-900">
                                      ${formatearNumeroArgentino((mat.precio || 0) * (mat.cantidad || 1))}
                                    </div>
                                    <div className="text-sm text-gray-600">
                                      ${formatearNumeroArgentino(mat.precio || 0)} c/u
                                    </div>
                                  </div>
                                </div>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setDatosConversion(prev => ({
                                    ...prev,
                                    materialesAdicionales: prev.materialesAdicionales.filter((_, i) => i !== index)
                                  }));
                                }}
                                className="text-red-600 hover:text-red-700 hover:bg-red-50 ml-4"
                              >
                                <X className="w-4 h-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Descripción General */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                    <FileText className="w-5 h-5 text-blue-600" />
                    Descripción General de la Obra
                  </h3>
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
                </div>

                {/* Botones de acción */}
                <div className="flex items-center justify-end gap-3 pt-4 border-t">
                  <Button 
                    variant="outline" 
                    onClick={handleToggleConvertForm}
                    disabled={converting}
                  >
                    Cancelar
                  </Button>
                  <Button 
                    onClick={handleConvertToObra}
                    disabled={converting || !datosConversion.tipoObra || !datosConversion.prioridad || !datosConversion.responsable}
                    className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
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
                </div>
              </CardContent>
            </Card>
          )}
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
