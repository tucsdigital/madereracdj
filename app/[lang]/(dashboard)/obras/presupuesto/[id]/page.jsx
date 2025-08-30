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

  // Log para debuggear productos del catálogo
  useEffect(() => {
    if (productosCatalogo && productosCatalogo.length > 0) {
      console.log("Productos del catálogo cargados:", productosCatalogo.length);
      console.log("Primer producto de ejemplo:", productosCatalogo[0]);
    }
  }, [productosCatalogo]);

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
      await convertirPresupuestoToObra(datosConversion, user);
      
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

  // Funciones para manejar productos seleccionados (como en ventas/page.jsx)
  const handleDimensionChange = (id, dimension, value) => {
    setDatosConversion(prev => ({
      ...prev,
      materialesAdicionales: prev.materialesAdicionales.map(p => {
        if (p.id !== id) return p;
        
        const nuevoProducto = { ...p, [dimension]: value === "" ? "" : Number(value) || 0 };
        
        // Recalcular precio si es madera
        if (p.categoria === "Maderas" && p.unidad !== "Unidad") {
          if (p.subcategoria === "machimbre" || p.subcategoria === "deck") {
            // Machimbre/deck: precio = alto × largo × precioPorPie × cantidad
            const alto = Number(nuevoProducto.alto) || 0;
            const largo = Number(nuevoProducto.largo) || 0;
            const cantidad = Number(nuevoProducto.cantidad) || 1;
            const precioPorPie = Number(nuevoProducto.precioPorPie) || 0;
            const precioBase = alto * largo * precioPorPie * cantidad;
            const precioFinal = p.cepilladoAplicado ? precioBase * 1.066 : precioBase;
            nuevoProducto.precio = Math.round(precioFinal / 100) * 100;
          } else {
            // Madera normal: precio = alto × ancho × largo × precioPorPie × factor
            const alto = Number(nuevoProducto.alto) || 0;
            const ancho = Number(nuevoProducto.ancho) || 0;
            const largo = Number(nuevoProducto.largo) || 0;
            const precioPorPie = Number(nuevoProducto.precioPorPie) || 0;
            const factor = 0.2734;
            const precioBase = factor * alto * ancho * largo * precioPorPie;
            const precioFinal = p.cepilladoAplicado ? precioBase * 1.066 : precioBase;
            nuevoProducto.precio = Math.round(precioFinal / 100) * 100;
          }
        }
        
        return nuevoProducto;
      })
    }));
  };

  const handlePrecioPorPieChange = (id, value) => {
    setDatosConversion(prev => ({
      ...prev,
      materialesAdicionales: prev.materialesAdicionales.map(p => {
        if (p.id !== id) return p;
        
        const nuevoProducto = { ...p, precioPorPie: value === "" ? "" : Number(value) || 0 };
        
        // Recalcular precio si es madera
        if (p.categoria === "Maderas" && p.unidad !== "Unidad") {
          if (p.subcategoria === "machimbre" || p.subcategoria === "deck") {
            // Machimbre/deck: precio = alto × largo × precioPorPie × cantidad
            const alto = Number(p.alto) || 0;
            const largo = Number(p.largo) || 0;
            const cantidad = Number(p.cantidad) || 1;
            const precioPorPie = Number(value) || 0;
            const precioBase = alto * largo * precioPorPie * cantidad;
            const precioFinal = p.cepilladoAplicado ? precioBase * 1.066 : precioBase;
            nuevoProducto.precio = Math.round(precioFinal / 100) * 100;
          } else {
            // Madera normal: precio = alto × ancho × largo × precioPorPie × factor
            const alto = Number(p.alto) || 0;
            const ancho = Number(p.ancho) || 0;
            const largo = Number(p.largo) || 0;
            const precioPorPie = Number(value) || 0;
            const factor = 0.2734;
            const precioBase = factor * alto * ancho * largo * precioPorPie;
            const precioFinal = p.cepilladoAplicado ? precioBase * 1.066 : precioBase;
            nuevoProducto.precio = Math.round(precioFinal / 100) * 100;
          }
        }
        
        return nuevoProducto;
      })
    }));
  };

  const recalcularPreciosMadera = (id, aplicarCepillado) => {
    setDatosConversion(prev => ({
      ...prev,
      materialesAdicionales: prev.materialesAdicionales.map(p => {
        if (p.id !== id) return p;
        
        const nuevoProducto = { ...p, cepilladoAplicado: aplicarCepillado };
        
        if (p.categoria === "Maderas" && p.unidad !== "Unidad") {
          let precioBase = 0;
          
          if (p.subcategoria === "machimbre" || p.subcategoria === "deck") {
            // Machimbre/deck: precio = alto × largo × precioPorPie × cantidad
            const alto = Number(p.alto) || 0;
            const largo = Number(p.largo) || 0;
            const cantidad = Number(p.cantidad) || 1;
            const precioPorPie = Number(p.precioPorPie) || 0;
            precioBase = alto * largo * precioPorPie * cantidad;
          } else {
            // Madera normal: precio = alto × ancho × largo × precioPorPie × factor
            const alto = Number(p.alto) || 0;
            const ancho = Number(p.ancho) || 0;
            const largo = Number(p.largo) || 0;
            const precioPorPie = Number(p.precioPorPie) || 0;
            const factor = 0.2734;
            precioBase = factor * alto * ancho * largo * precioPorPie;
          }
          
          const precioFinal = aplicarCepillado ? precioBase * 1.066 : precioBase;
          nuevoProducto.precio = Math.round(precioFinal / 100) * 100;
        }
        
        return nuevoProducto;
      })
    }));
  };

  const handleCantidadChange = (id, value) => {
    setDatosConversion(prev => ({
      ...prev,
      materialesAdicionales: prev.materialesAdicionales.map(p => {
        if (p.id !== id) return p;
        
        const nuevoProducto = { ...p, cantidad: value === "" ? "" : Number(value) || 1 };
        
        // Recalcular precio si es madera machimbre/deck
        if (p.categoria === "Maderas" && p.unidad !== "Unidad" && 
            (p.subcategoria === "machimbre" || p.subcategoria === "deck")) {
          const alto = Number(p.alto) || 0;
          const largo = Number(p.largo) || 0;
          const cantidad = Number(value) || 1;
          const precioPorPie = Number(p.precioPorPie) || 0;
          const precioBase = alto * largo * precioPorPie * cantidad;
          const precioFinal = p.cepilladoAplicado ? precioBase * 1.066 : precioBase;
          nuevoProducto.precio = Math.round(precioFinal / 100) * 100;
        }
        
        return nuevoProducto;
      })
    }));
  };

  const handleIncrementarCantidad = (id) => {
    setDatosConversion(prev => ({
      ...prev,
      materialesAdicionales: prev.materialesAdicionales.map(p => {
        if (p.id !== id) return p;
        
        const nuevaCantidad = Number(p.cantidad || 1) + 1;
        const nuevoProducto = { ...p, cantidad: nuevaCantidad };
        
        // Recalcular precio si es madera machimbre/deck
        if (p.categoria === "Maderas" && p.unidad !== "Unidad" && 
            (p.subcategoria === "machimbre" || p.subcategoria === "deck")) {
          const alto = Number(p.alto) || 0;
          const largo = Number(p.largo) || 0;
          const precioPorPie = Number(p.precioPorPie) || 0;
          const precioBase = alto * largo * precioPorPie * nuevaCantidad;
          const precioFinal = p.cepilladoAplicado ? precioBase * 1.066 : precioBase;
          nuevoProducto.precio = Math.round(precioFinal / 100) * 100;
        }
        
        return nuevoProducto;
      })
    }));
  };

  const handleDecrementarCantidad = (id) => {
    setDatosConversion(prev => ({
      ...prev,
      materialesAdicionales: prev.materialesAdicionales.map(p => {
        if (p.id !== id) return p;
        
        const nuevaCantidad = Math.max(1, Number(p.cantidad || 1) - 1);
        const nuevoProducto = { ...p, cantidad: nuevaCantidad };
        
        // Recalcular precio si es madera machimbre/deck
        if (p.categoria === "Maderas" && p.unidad !== "Unidad" && 
            (p.subcategoria === "machimbre" || p.subcategoria === "deck")) {
          const alto = Number(p.alto) || 0;
          const largo = Number(p.largo) || 0;
          const precioPorPie = Number(p.precioPorPie) || 0;
          const precioBase = alto * largo * precioPorPie * nuevaCantidad;
          const precioFinal = p.cepilladoAplicado ? precioBase * 1.066 : precioBase;
          nuevoProducto.precio = Math.round(precioFinal / 100) * 100;
        }
        
        return nuevoProducto;
      })
    }));
  };

  const handleDescuentoChange = (id, value) => {
    setDatosConversion(prev => ({
      ...prev,
      materialesAdicionales: prev.materialesAdicionales.map(p => {
        if (p.id !== id) return p;
        return { ...p, descuento: value === "" ? "" : Number(value) || 0 };
      })
    }));
  };

  const handleQuitarProducto = (id) => {
    setDatosConversion(prev => ({
      ...prev,
      materialesAdicionales: prev.materialesAdicionales.filter(p => p.id !== id)
    }));
  };

  // Formateador para números en formato argentino
  const formatearNumeroArgentino = (numero) => {
    if (numero === null || numero === undefined || isNaN(numero)) return "0";
    return new Intl.NumberFormat("es-AR").format(Number(numero));
  };

  // Funciones de cálculo de precios para maderas (como en ventas/page.jsx)
  function calcularPrecioCorteMadera({
    alto,
    ancho,
    largo,
    precioPorPie,
    factor = 0.2734,
  }) {
    if (
      [alto, ancho, largo, precioPorPie].some(
        (v) => typeof v !== "number" || v <= 0
      )
    ) {
      return 0;
    }
    const precio = factor * alto * ancho * largo * precioPorPie;
    // Redondear a centenas (múltiplos de 100)
    return Math.round(precio / 100) * 100;
  }

  // Función para calcular precio de machimbre (precio por pie × ancho × largo × cantidad)
  function calcularPrecioMachimbre({ alto, largo, cantidad, precioPorPie }) {
    if (
      [alto, largo, cantidad, precioPorPie].some(
        (v) => typeof v !== "number" || v <= 0
      )
    ) {
      return 0;
    }
    // Nueva fórmula: (alto × largo) × precioPorPie × cantidad
    const metrosCuadrados = alto * largo;
    const precio = metrosCuadrados * precioPorPie * cantidad;
    // Redondear a centenas (múltiplos de 100)
    return Math.round(precio / 100) * 100;
  }

  // Función para agregar productos al catálogo (como en ventas/page.jsx)
  const handleAgregarProducto = (producto) => {
    console.log("Producto recibido en handleAgregarProducto:", producto);
    
    // Verificar si ya está agregado
    const yaAgregado = datosConversion.materialesAdicionales.some(p => p.id === producto.id);
    if (yaAgregado) return;

    let productoParaAgregar = {
      id: producto.id,
      nombre: producto.nombre,
      categoria: producto.categoria,
      subcategoria: producto.subcategoria,
      tipoMadera: producto.tipoMadera,
      unidad: producto.unidadMedida || producto.unidad,
      cantidad: 1,
      precio: producto.precio,
      descuento: 0,
      cepilladoAplicado: false,
      stock: producto.stock
    };

    // Si es madera, calcular precio según tipo
    if (producto.categoria === "Maderas") {
      const alto = Number(producto.alto) || 0;
      const ancho = Number(producto.ancho) || 0;
      const largo = Number(producto.largo) || 0;
      const precioPorPie = Number(producto.precioPorPie) || 0;

      if (producto.unidadMedida === "Unidad") {
        if (precioPorPie > 0) {
          const precioUnidad = Math.round(precioPorPie / 100) * 100;
          productoParaAgregar.precio = precioUnidad;
        } else {
          productoParaAgregar.precio = 0;
        }
      } else if (producto.unidadMedida === "M2") {
        if (alto > 0 && largo > 0 && precioPorPie > 0) {
          const precioM2 = calcularPrecioMachimbre({
            alto,
            largo,
            cantidad: 1,
            precioPorPie,
          });
          productoParaAgregar.precio = precioM2;
        } else {
          productoParaAgregar.precio = 0;
        }
      } else {
        if (alto > 0 && ancho > 0 && largo > 0 && precioPorPie > 0) {
          const precioCorte = calcularPrecioCorteMadera({
            alto,
            ancho,
            largo,
            precioPorPie,
          });
          productoParaAgregar.precio = precioCorte;
        } else {
          productoParaAgregar.precio = 0;
        }
      }

      productoParaAgregar = {
        ...productoParaAgregar,
        alto,
        ancho,
        largo,
        precioPorPie
      };
    }

    console.log("Producto final a agregar:", productoParaAgregar);
    
    setDatosConversion(prev => ({
      ...prev,
      materialesAdicionales: [...prev.materialesAdicionales, productoParaAgregar]
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
        onConvertToObra={obra?.tipo === "presupuesto" ? handleToggleConvertForm : undefined}
        converting={converting}
        showBackButton={true}
        backUrl={`/${lang}/obras`}
      />

      {/* Mensaje de conversión */}
      {convertMessage && (
        <div className={`mb-6 p-4 rounded-xl flex items-center gap-3 text-base font-medium shadow-lg border transition-all duration-500 ${
          convertMessage.startsWith('✅') 
            ? "bg-green-50 border-green-200 text-green-800" 
            : "bg-red-50 border-red-200 text-red-800"
        }`}>
          {convertMessage.startsWith('✅') ? (
            <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
              <Building className="w-5 h-5 text-green-600" />
            </div>
          ) : (
            <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
              <Building className="w-5 h-5 text-red-600" />
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
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  <Building className="w-5 h-5" />
                  Convertir Presupuesto a Obra
                </CardTitle>
              </CardHeader>
              
              <CardContent className="p-6 space-y-6">
                {/* Datos Generales */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                    <FileText className="w-5 h-5" />
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
                    <MapPin className="w-5 h-5" />
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
                        />
                        <span className="text-sm font-medium">Especificar nueva ubicación</span>
                      </label>
                    </div>
                    
                    {datosConversion.ubicacionTipo === "cliente" ? (
                      <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                        <p className="text-sm text-gray-800">
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
                    <Icon icon="heroicons:cube" className="w-5 h-5" />
                    Materiales a Utilizar
                  </h3>
                  
                  <div>
                    <div className="space-y-3">
                      <div className="flex flex-col sm:flex-row gap-3">
                        <div className="flex-1">
                          <div className="flex bg-white rounded-lg p-1 shadow-sm border border-gray-200">
                            {categorias && categorias.length > 0 ? (
                              categorias.map((cat) => (
                                <button 
                                  key={cat} 
                                  type="button" 
                                  className={`rounded-full px-4 py-1 text-sm mr-2 ${datosConversion.categoriaMaterial === cat ? "bg-gray-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`} 
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
                            className="w-full pl-10 pr-10 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-gray-500 transition-all duration-200 bg-card" 
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
                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4 p-4 relative">
                                {isPending && (
                                  <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-10 flex items-center justify-center rounded-lg">
                                    <div className="flex items-center gap-3 bg-white px-4 py-3 rounded-lg shadow-lg border border-gray-200">
                                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-gray-600"></div>
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
                                          : "border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500"
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
                                          
                                          {/* Información adicional para maderas */}
                                          {prod.categoria === "Maderas" && (
                                            <>
                                              {prod.precioPorPie && (
                                                <div className="flex items-center justify-between">
                                                  <span className="text-xs text-gray-500 dark:text-gray-400">Precio por pie:</span>
                                                  <span className="text-xs text-gray-700 dark:text-gray-300">${formatearNumeroArgentino(prod.precioPorPie)}</span>
                                                </div>
                                              )}
                                              {prod.alto && prod.largo && prod.unidadMedida === "M2" && (
                                                <div className="flex items-center justify-between">
                                                  <span className="text-xs text-gray-500 dark:text-gray-400">Dimensiones:</span>
                                                  <span className="text-xs text-gray-700 dark:text-gray-300">
                                                    {prod.alto}×{prod.largo} m
                                                  </span>
                                                </div>
                                              )}
                                              {prod.alto && prod.ancho && prod.largo && prod.unidadMedida !== "M2" && prod.unidadMedida !== "Unidad" && (
                                                <div className="flex items-center justify-between">
                                                  <span className="text-xs text-gray-500 dark:text-gray-400">Dimensiones:</span>
                                                  <span className="text-xs text-gray-700 dark:text-gray-300">
                                                    {prod.alto}×{prod.ancho}×{prod.largo} m
                                                  </span>
                                                </div>
                                              )}
                                            </>
                                          )}
                                        </div>

                                        {/* Botón de agregar */}
                                        <div className="mt-4">
                                          <button
                                            onClick={() => {
                                              console.log("Botón agregar clickeado para producto:", prod);
                                              console.log("Campos del producto:", {
                                                id: prod.id,
                                                nombre: prod.nombre,
                                                categoria: prod.categoria,
                                                subcategoria: prod.subcategoria,
                                                tipoMadera: prod.tipoMadera,
                                                unidadMedida: prod.unidadMedida,
                                                alto: prod.alto,
                                                ancho: prod.ancho,
                                                largo: prod.largo,
                                                precioPorPie: prod.precioPorPie,
                                                precio: prod.precio
                                              });
                                              console.log("Todos los campos disponibles:", Object.keys(prod));
                                              if (yaAgregado) return;
                                              handleAgregarProducto(prod);
                                            }}
                                            disabled={yaAgregado}
                                            className={`w-full py-2 px-3 rounded-md text-sm font-medium transition-colors ${yaAgregado ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 cursor-not-allowed" : "bg-gray-600 text-white hover:bg-gray-700 dark:bg-gray-500 dark:hover:bg-gray-600"}`}
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
                                    {isPending && (<div className="animate-spin rounded-full h-3 w-3 border-b-2 border-gray-600"></div>)}
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
                                          <button key={pageNum} onClick={() => startTransition(() => setPaginaActual(pageNum))} disabled={isPending} className={`px-3 py-1 rounded-md text-sm font-medium ${paginaActual === pageNum ? "bg-gray-600 text-white" : "text-gray-600 hover:text-gray-900"}`}>
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
                    
                    {/* Tabla de productos seleccionados */}
                    {datosConversion.materialesAdicionales && datosConversion.materialesAdicionales.length > 0 && (
                      <section className="bg-card/60 rounded-xl p-0 border border-default-200 shadow-lg overflow-hidden ring-1 ring-default-200/60 mt-4">
                        <div className="flex items-center justify-between px-4 py-3 border-b bg-gradient-to-r from-default-50 to-default-100">
                          <h3 className="text-base md:text-lg font-semibold text-default-900">Productos Seleccionados</h3>
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-default-200/60 text-default-700 border border-default-300">
                            {datosConversion.materialesAdicionales.length} producto{datosConversion.materialesAdicionales.length !== 1 ? "s" : ""}
                          </span>
                        </div>

                        <div className="overflow-x-auto">
                          <table className="min-w-full text-[15px]">
                            <thead className="sticky top-0 z-10 bg-default-50/80 backdrop-blur supports-[backdrop-filter]:bg-default-50/60">
                              <tr className="border-b border-default-200">
                                <th className="h-12 px-4 text-left align-middle text-xs font-semibold uppercase tracking-wide text-default-600">Categoría</th>
                                <th className="h-12 px-4 text-left align-middle text-xs font-semibold uppercase tracking-wide text-default-600">Producto</th>
                                <th className="h-12 px-4 text-center align-middle text-xs font-semibold uppercase tracking-wide text-default-600">Cant.</th>
                                <th className="h-12 px-4 text-center align-middle text-xs font-semibold uppercase tracking-wide text-default-600">Cepillado</th>
                                <th className="h-12 px-4 text-right align-middle text-xs font-semibold uppercase tracking-wide text-default-600">Precio unit.</th>
                                <th className="h-12 px-4 text-center align-middle text-xs font-semibold uppercase tracking-wide text-default-600">Desc.</th>
                                <th className="h-12 px-4 text-right align-middle text-xs font-semibold uppercase tracking-wide text-default-600">Subtotal</th>
                                <th className="h-12 px-4 text-center align-middle text-xs font-semibold uppercase tracking-wide text-default-600">Acción</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-default-200">
                              {datosConversion.materialesAdicionales.map((p, idx) => {
                                const esMadera = (p.categoria || "").toLowerCase() === "maderas";
                                const isMachDeck = esMadera && (p.subcategoria === "machimbre" || p.subcategoria === "deck");
                                const sub = (() => {
                                  if (esMadera && isMachDeck) {
                                    // Para machimbre/deck, el precio ya incluye la cantidad
                                    return Number(p.precio) * (1 - (Number(p.descuento) || 0) / 100);
                                  } else {
                                    // Para el resto: precio × cantidad × (1 - descuento)
                                    return Number(p.precio) * Number(p.cantidad) * (1 - (Number(p.descuento) || 0) / 100);
                                  }
                                })();

                                return (
                                  <tr key={p.id} className="border-b border-default-300 transition-colors">
                                    <td className="p-4 align-middle text-sm text-default-600">
                                      {p.categoria && (
                                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-default-100 text-default-700 border border-default-200 text-[11px] font-medium">
                                          {p.categoria}
                                        </span>
                                      )}
                                    </td>
                                    <td className="p-4 align-top text-sm text-default-600">
                                      <div className="font-semibold text-default-900">
                                        {p.nombre}
                                        {esMadera && p.tipoMadera && (
                                          <span className="font-semibold text-default-900">
                                            {" "}
                                            - {p.tipoMadera.toUpperCase()}
                                          </span>
                                        )}
                                      </div>
                                      {/* Información específica por categoría */}
                                      {p.categoria === "Ferretería" && p.subcategoria && (
                                        <div className="flex items-center gap-1 mt-1">
                                          <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                                            {p.subcategoria}
                                          </span>
                                        </div>
                                      )}

                                      {/* Campos editables para maderas (ocultar cuando unidad es "Unidad") */}
                                      {esMadera && p.unidad !== "Unidad" && (
                                        <div className="mt-2 flex flex-wrap items-start gap-3">
                                          {/* Sección de dimensiones (compacta) */}
                                          <div className="inline-block w-fit rounded-md border border-orange-200/60 dark:border-orange-700/60 bg-orange-50/60 dark:bg-orange-900/20 p-1.5 align-top">
                                            <div className="flex items-center gap-1.5 mb-1">
                                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 dark:bg-orange-800/40 dark:text-orange-300 text-sm font-semibold">
                                                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zM14 9a1 1 0 00-1 1v6a1 1 0 11-2 0v-7zm5 0a1 1 0 112 0v7a1 1 0 11-2 0v-7z" clipRule="evenodd"/></svg>
                                                Dimensiones
                                              </span>
                                              {isMachDeck ? (
                                                <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 dark:bg-orange-800/40 dark:text-orange-300 text-sm font-semibold">
                                                  Total {(((p.alto || 0) * (p.largo || 0) * (p.cantidad || 1)).toFixed(2))} m²
                                                </span>
                                              ) : (
                                                <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 dark:bg-orange-800/40 dark:text-orange-300 text-sm font-semibold">
                                                  Volumen {(((p.alto || 0) * (p.ancho || 0) * (p.largo || 0)).toFixed(2))} m³
                                                </span>
                                              )}
                                            </div>

                                            {isMachDeck ? (
                                              <div className="flex flex-wrap items-end gap-2">
                                                <div className="flex flex-col gap-0.5">
                                                  <label className="text-[11px] font-semibold text-orange-700">Alto</label>
                                                  <input
                                                    type="number"
                                                    min="0"
                                                    step="0.01"
                                                    value={p.alto === "" ? "" : p.alto || ""}
                                                    onChange={(e) => handleDimensionChange(p.id, "alto", e.target.value)}
                                                    className="h-8 w-[68px] sm:w-[80px] rounded-sm border border-orange-300 dark:border-orange-600 bg-white dark:bg-gray-800 text-sm px-1.5 focus:border-orange-500 focus:ring-1 focus:ring-orange-200 dark:focus:ring-orange-800"
                                                  />
                                                </div>
                                                <div className="flex flex-col gap-0.5">
                                                  <label className="text-[11px] font-semibold text-orange-700">Largo</label>
                                                  <input
                                                    type="number"
                                                    min="0"
                                                    step="0.01"
                                                    value={p.largo === "" ? "" : p.largo || ""}
                                                    onChange={(e) => handleDimensionChange(p.id, "largo", e.target.value)}
                                                    className="h-8 w-[68px] sm:w-[80px] rounded-sm border border-orange-300 dark:border-orange-600 bg-white dark:bg-gray-800 text-sm px-1.5 focus:border-orange-500 focus:ring-1 focus:ring-orange-200 dark:focus:ring-orange-800"
                                                  />
                                                </div>
                                              </div>
                                            ) : (
                                              <div className="flex flex-wrap items-end gap-2">
                                                <div className="flex flex-col gap-0.5">
                                                  <label className="text-[11px] font-semibold text-orange-700">Alto</label>
                                                  <input
                                                    type="number"
                                                    min="0"
                                                    step="0.01"
                                                    value={p.alto === "" ? "" : p.alto || ""}
                                                    onChange={(e) => handleDimensionChange(p.id, "alto", e.target.value)}
                                                    className="h-8 w-[68px] sm:w-[80px] rounded-sm border border-orange-300 dark:border-orange-600 bg-white dark:bg-gray-800 text-sm px-1.5 focus:border-orange-500 focus:ring-1 focus:ring-orange-200 dark:focus:ring-orange-800"
                                                  />
                                                </div>
                                                <div className="flex flex-col gap-0.5">
                                                  <label className="text-[11px] font-semibold text-orange-700">Ancho</label>
                                                  <input
                                                    type="number"
                                                    min="0"
                                                    step="0.01"
                                                    value={p.ancho === "" ? "" : p.ancho || ""}
                                                    onChange={(e) => handleDimensionChange(p.id, "ancho", e.target.value)}
                                                    className="h-8 w-[68px] sm:w-[80px] rounded-sm border border-orange-300 dark:border-orange-600 bg-white dark:bg-gray-800 text-sm px-1.5 focus:border-orange-500 focus:ring-1 focus:ring-orange-200 dark:focus:ring-orange-800"
                                                  />
                                                </div>
                                                <div className="flex flex-col gap-0.5">
                                                  <label className="text-[11px] font-semibold text-orange-700">Largo</label>
                                                  <input
                                                    type="number"
                                                    min="0"
                                                    step="0.01"
                                                    value={p.largo === "" ? "" : p.largo || ""}
                                                    onChange={(e) => handleDimensionChange(p.id, "largo", e.target.value)}
                                                    className="h-8 w-[68px] sm:w-[80px] rounded-sm border border-orange-300 dark:border-orange-600 bg-white dark:bg-gray-800 text-sm px-1.5 focus:border-orange-500 focus:ring-1 focus:ring-orange-200 dark:focus:ring-orange-800"
                                                  />
                                                </div>
                                              </div>
                                            )}
                                          </div>

                                          {/* Sección de precio por pie (compacta y no ancha) */}
                                          <div className="inline-block w-fit p-1.5 bg-green-50 dark:bg-green-900/20 rounded-md border border-green-200 dark:border-green-700 align-top">
                                            <div className="flex items-center gap-1 mb-1">
                                              <svg
                                                className="w-3 h-3 text-green-600 dark:text-green-400"
                                                fill="currentColor"
                                                viewBox="0 0 20 20"
                                              >
                                                <path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z" />
                                                <path
                                                  fillRule="evenodd"
                                                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z"
                                                  clipRule="evenodd"
                                                />
                                              </svg>
                                              <span className="text-sm font-semibold text-green-700 dark:text-green-400">
                                                Precio
                                              </span>
                                            </div>
                                            {/* Precio compacto (más angosto) */}
                                            <div className="inline-block w-fit">
                                              <label className="block text-[11px] font-semibold text-green-700 dark:text-green-300 mb-0.5">Valor</label>
                                              <div className="relative">
                                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-sm text-green-600 dark:text-green-400 font-medium">$</span>
                                                <input
                                                  type="number"
                                                  min="0"
                                                  step="0.01"
                                                  value={p.precioPorPie === "" ? "" : p.precioPorPie || ""}
                                                  onChange={(e) => handlePrecioPorPieChange(p.id, e.target.value)}
                                                  className="h-8 w-[88px] pl-5 pr-2 text-sm border border-green-300 dark:border-green-600 rounded-md bg-white dark:bg-gray-800 focus:border-green-500 focus:ring-1 focus:ring-green-200 dark:focus:ring-green-800 focus:outline-none transition-colors tabular-nums"
                                                  placeholder="0.00"
                                                />
                                              </div>
                                            </div>
                                          </div>
                                        </div>
                                      )}
                                    </td>
                                    <td className="p-4 align-middle text-sm text-default-600">
                                      <div className="flex items-center justify-center">
                                        <div className="flex items-center bg-white dark:bg-gray-800 border border-default-300 dark:border-gray-700 rounded-lg overflow-hidden shadow-sm">
                                          <button
                                            type="button"
                                            onClick={() => handleDecrementarCantidad(p.id)}
                                            disabled={p.cantidad <= 1}
                                            className="px-3 py-2 text-default-500 hover:text-default-900 hover:bg-default-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                          >
                                            <svg
                                              className="w-4 h-4"
                                              fill="none"
                                              stroke="currentColor"
                                              viewBox="0 0 24 24"
                                            >
                                              <path
                                                strokeLinecap="round"
                                                strokeLinejoinjoin="round"
                                                strokeWidth="2"
                                                d="M20 12H4"
                                              />
                                            </svg>
                                          </button>

                                          <input
                                            type="number"
                                            min={1}
                                            value={p.cantidad === "" ? "" : p.cantidad}
                                            onChange={(e) => handleCantidadChange(p.id, e.target.value)}
                                            className="w-16 text-center text-base md:text-lg font-bold border-0 bg-transparent focus:ring-0 focus:outline-none text-gray-900 dark:text-gray-100 tabular-nums"
                                          />

                                          <button
                                            type="button"
                                            onClick={() => handleIncrementarCantidad(p.id)}
                                            className="px-3 py-2 text-default-500 hover:text-default-900 hover:bg-default-100 dark:hover:bg-gray-700 transition-colors"
                                          >
                                            <svg
                                              className="w-4 h-4"
                                              fill="none"
                                              stroke="currentColor"
                                              viewBox="0 0 24 24"
                                            >
                                              <path
                                                strokeLinecap="round"
                                                strokeLinejoinjoin="round"
                                                strokeWidth="2"
                                                d="M12 4v16m8-8H4"
                                              />
                                            </svg>
                                          </button>
                                        </div>
                                      </div>
                                    </td>
                                    <td className="p-4 align-middle text-sm text-default-600">
                                      {esMadera && p.unidad !== "Unidad" ? (
                                        <div className="flex items-center justify-center">
                                          <input
                                            type="checkbox"
                                            checked={p.cepilladoAplicado || false}
                                            onChange={(e) => {
                                              recalcularPreciosMadera(p.id, e.target.checked);
                                            }}
                                            className="w-4 h-4 text-blue-600 bg-white border-default-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 focus:ring-2"
                                            title="Aplicar cepillado (+6.6%)"
                                          />
                                        </div>
                                      ) : (
                                        <span className="text-gray-400">-</span>
                                      )}
                                    </td>
                                    <td className="p-4 align-middle text-sm text-default-600">
                                      <span className="block text-right font-semibold text-default-900 tabular-nums">{`$${formatearNumeroArgentino(p.precio)}`}</span>
                                    </td>
                                    <td className="p-4 align-middle text-sm text-default-600">
                                      <div className="relative w-20 md:w-24 mx-auto">
                                        <input
                                          type="number"
                                          min={0}
                                          max={100}
                                          value={p.descuento === "" ? "" : p.descuento || ""}
                                          onChange={(e) => handleDescuentoChange(p.id, e.target.value)}
                                          className="w-full text-center border border-default-300 rounded-md px-2 py-1 pr-6 bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-200"
                                        />
                                        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-default-500">%</span>
                                      </div>
                                    </td>
                                    <td className="p-4 align-middle text-right text-sm text-default-900 font-bold tabular-nums">
                                      ${formatearNumeroArgentino(sub)}
                                    </td>
                                    <td className="p-4 align-middle text-center text-sm text-default-600">
                                      <span className="group relative inline-flex">
                                        <button
                                          type="button"
                                          aria-label="Eliminar producto"
                                          onClick={() => handleQuitarProducto(p.id)}
                                          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-red-200 text-red-600 hover:text-white hover:bg-red-600 hover:border-red-600 shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                                          title="Eliminar"
                                        >
                                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                                            <path d="M9 3a1 1 0 00-1 1v1H5.5a1 1 0 100 2H6v12a2 2 0 002 2h8a2 2 0 002-2V7h.5a1 1 0 100-2H16V4a1 1 0 00-1-1H9zm2 2h4v1h-4V5zm-1 5a1 1 0 112 0v7a1 1 0 11-2 0v-7zm5 0a1 1 0 112 0v7a1 1 0 11-2 0v-7z" />
                                          </svg>
                                        </button>
                                        <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-default-900 text-white text-[10px] px-2 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity">Eliminar</span>
                                      </span>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                        
                        {/* Resumen de totales */}
                        {datosConversion.materialesAdicionales && datosConversion.materialesAdicionales.length > 0 && (
                          <div className="border-t border-default-200 bg-default-50/50 px-4 py-3">
                            <div className="flex flex-col items-end gap-2">
                              <div className="bg-primary/5 dark:bg-primary/10 border border-primary/20 rounded-lg px-6 py-3 flex flex-col md:flex-row gap-4 md:gap-8 text-lg shadow-sm w-full md:w-auto font-semibold">
                                <div>
                                  Subtotal:{" "}
                                  <span className="font-bold">
                                    ${formatearNumeroArgentino(
                                      datosConversion.materialesAdicionales.reduce((sum, p) => {
                                        const esMadera = (p.categoria || "").toLowerCase() === "maderas";
                                        const isMachDeck = esMadera && (p.subcategoria === "machimbre" || p.subcategoria === "deck");
                                        let precioLinea = 0;
                                        
                                        if (esMadera && isMachDeck) {
                                          // Para machimbre/deck, el precio ya incluye la cantidad
                                          precioLinea = Number(p.precio) || 0;
                                        } else {
                                          // Para el resto: precio × cantidad
                                          precioLinea = (Number(p.precio) || 0) * (Number(p.cantidad) || 1);
                                        }
                                        
                                        return sum + precioLinea;
                                      }, 0)
                                    )}
                                  </span>
                                </div>
                                <div>
                                  Descuento:{" "}
                                  <span className="font-bold">
                                    ${formatearNumeroArgentino(
                                      datosConversion.materialesAdicionales.reduce((sum, p) => {
                                        const esMadera = (p.categoria || "").toLowerCase() === "maderas";
                                        const isMachDeck = esMadera && (p.subcategoria === "machimbre" || p.subcategoria === "deck");
                                        let precioLinea = 0;
                                        
                                        if (esMadera && isMachDeck) {
                                          // Para machimbre/deck, el precio ya incluye la cantidad
                                          precioLinea = Number(p.precio) || 0;
                                        } else {
                                          // Para el resto: precio × cantidad
                                          precioLinea = (Number(p.precio) || 0) * (Number(p.cantidad) || 1);
                                        }
                                        
                                        return sum + (precioLinea * (Number(p.descuento) || 0) / 100);
                                      }, 0)
                                    )}
                                  </span>
                                </div>
                                <div>
                                  Total:{" "}
                                  <span className="font-bold text-primary">
                                    ${formatearNumeroArgentino(
                                      datosConversion.materialesAdicionales.reduce((sum, p) => {
                                        const esMadera = (p.categoria || "").toLowerCase() === "maderas";
                                        const isMachDeck = esMadera && (p.subcategoria === "machimbre" || p.subcategoria === "deck");
                                        let precioLinea = 0;
                                        
                                        if (esMadera && isMachDeck) {
                                          // Para machimbre/deck, el precio ya incluye la cantidad
                                          precioLinea = Number(p.precio) || 0;
                                        } else {
                                          // Para el resto: precio × cantidad
                                          precioLinea = (Number(p.precio) || 0) * (Number(p.cantidad) || 1);
                                        }
                                        
                                        const descuento = precioLinea * (Number(p.descuento) || 0) / 100;
                                        return sum + (precioLinea - descuento);
                                      }, 0)
                                    )}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </section>
                    )}
                  </div>
                </div>

                {/* Descripción General */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                    <FileText className="w-5 h-5" />
                    Descripción General de la Obra
                  </h3>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Descripción detallada de la obra
                    </label>
                    <textarea
                      value={datosConversion.descripcionGeneral}
                      onChange={(e) => handleInputChange("descripcionGeneral", e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-transparent"
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
