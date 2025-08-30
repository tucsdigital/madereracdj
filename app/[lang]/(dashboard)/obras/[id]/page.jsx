"use client";
import React, { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Icon } from "@iconify/react";
import { Printer, Edit, Plus, Trash2, Search, Filter } from "lucide-react";
import { useObra } from "@/hooks/useObra";
import { formatearNumeroArgentino, formatearFecha, generarContenidoImpresion, parseNumericValue, calcularPrecioMachimbre, calcularPrecioCorteMadera } from "@/lib/obra-utils";
import ObraHeader from "@/components/obras/ObraHeader";
import ObraInfoGeneral from "@/components/obras/ObraInfoGeneral";
import ObraResumenFinanciero from "@/components/obras/ObraResumenFinanciero";
import ObraCobranza from "@/components/obras/ObraCobranza";
import ObraDocumentacion from "@/components/obras/ObraDocumentacion";
import PresupuestoDetalle from "@/components/obras/PresupuestoDetalle";
import PrintDownloadButtons from "@/components/ui/print-download-buttons";
import ProductosSelector from "@/components/obras/ProductosSelector";
import ProductosTabla from "@/components/obras/ProductosTabla";

const ObraDetallePage = () => {
  const params = useParams();
  const router = useRouter();
  const { id, lang } = params;
  const [openPrint, setOpenPrint] = useState(false);
  const [openNuevoResponsable, setOpenNuevoResponsable] = useState(false);
  const [nuevoResponsable, setNuevoResponsable] = useState("");
  
  const {
    obra,
    loading,
    error,
    presupuesto,
    editando,
    docLinks,
    movimientos,
    tipoObra,
    prioridad,
    estadoObra,
    responsable,
    responsables,
    fechasEdit,
    ubicacionEdit,
    clienteId,
    cliente,
    clientes,
    usarDireccionCliente,
    productosCatalogo,
    productosPorCategoria,
    categorias,
    categoriaId,
    busquedaProducto,
    busquedaDebounced,
    itemsCatalogo,
    isPendingCat,
    productosObraCatalogo,
    productosObraPorCategoria,
    categoriasObra,
    categoriaObraId,
    busquedaProductoObra,
    busquedaDebouncedObra,
    itemsPresupuesto,
    isPendingObra,
    gastoObraManual,
    presupuestosDisponibles,
    presupuestoSeleccionadoId,
    modoCosto,
    descripcionGeneral,
    setEditando,
    setDocLinks,
    setMovimientos,
    setTipoObra,
    setPrioridad,
    setEstadoObra,
    setResponsable,
    setFechasEdit,
    setUbicacionEdit,
    setClienteId,
    setCliente,
    setUsarDireccionCliente,
    setCategoriaId,
    setBusquedaProducto,
    setItemsCatalogo,
    setCategoriaObraId,
    setBusquedaProductoObra,
    setItemsPresupuesto,
    setGastoObraManual,
    setPresupuestoSeleccionadoId,
    setModoCosto,
    setDescripcionGeneral,
    guardarEdicion,
    handleDesvincularPresupuesto,
    handleVincularPresupuesto,
    handleCrearPresupuestoDesdeAqui,
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

  const handleAgregarResponsable = () => {
    if (nuevoResponsable.trim()) {
      setResponsables(prev => [...prev, nuevoResponsable.trim()]);
      setNuevoResponsable("");
      setOpenNuevoResponsable(false);
    }
  };

  const handleCantidadChange = (id, cantidad) => {
    const parsedCantidad = parseNumericValue(cantidad);
    setItemsCatalogo((prev) => prev.map((p) => {
      if (p.id !== id) return p;
      const esMadera = (p.categoria || "").toLowerCase() === "maderas";
      if (esMadera && (p.subcategoria === "machimbre" || p.subcategoria === "deck")) {
        const alto = Number(p.alto) || 0;
        const largo = Number(p.largo) || 0;
        const precioPorPie = Number(p.precioPorPie) || 0;
        const cant = parsedCantidad === "" ? 1 : Number(parsedCantidad) || 1;
        let base = calcularPrecioMachimbre({ alto, largo, cantidad: cant, precioPorPie });
        const final = p.cepilladoAplicado ? base * 1.066 : base;
        const precioRedondeado = Math.round(final / 100) * 100;
        return { ...p, cantidad: parsedCantidad, precio: precioRedondeado };
      }
      return { ...p, cantidad: parsedCantidad };
    }));
  };

  const handlePrecioPorPieChange = (id, nuevo) => {
    const parsed = parseNumericValue(nuevo);
    setItemsCatalogo((prev) => prev.map((p) => {
      if (p.id !== id) return p;
      const esMadera = (p.categoria || "").toLowerCase() === "maderas";
      if (!esMadera) return { ...p, valorVenta: parsed };
      const subcategoria = p.subcategoria || "";
      const alto = Number(p.alto) || 0;
      const ancho = Number(p.ancho) || 0;
      const largo = Number(p.largo) || 0;
      const cantidad = Number(p.cantidad) || 1;
      const precioPorPie = parsed === "" ? 0 : Number(parsed) || 0;
      let base = 0;
      if (subcategoria === "machimbre" || subcategoria === "deck") {
        base = calcularPrecioMachimbre({ alto, largo, cantidad, precioPorPie });
      } else {
        base = calcularPrecioCorteMadera({ alto, ancho, largo, precioPorPie });
      }
      const final = p.cepilladoAplicado ? base * 1.066 : base;
      const precioRedondeado = Math.round(final / 100) * 100;
      return { ...p, precioPorPie: parsed, precio: precioRedondeado };
    }));
  };

  const handleAltoChange = (id, nuevo) => {
    const parsed = parseNumericValue(nuevo);
    setItemsCatalogo((prev) => prev.map((p) => {
      if (p.id !== id) return p;
      const esMadera = (p.categoria || "").toLowerCase() === "maderas";
      if (!esMadera) return p;
      const subcategoria = p.subcategoria || "";
      const alto = parsed === "" ? 0 : Number(parsed) || 0;
      const ancho = Number(p.ancho) || 0;
      const largo = Number(p.largo) || 0;
      const cantidad = Number(p.cantidad) || 1;
      const precioPorPie = Number(p.precioPorPie) || 0;
      let base = 0;
      if (subcategoria === "machimbre" || subcategoria === "deck") {
        base = calcularPrecioMachimbre({ alto, largo, cantidad, precioPorPie });
      } else {
        base = calcularPrecioCorteMadera({ alto, ancho, largo, precioPorPie });
      }
      const final = p.cepilladoAplicado ? base * 1.066 : base;
      const precioRedondeado = Math.round(final / 100) * 100;
      return { ...p, alto: parsed, precio: precioRedondeado };
    }));
  };

  const handleAnchoChange = (id, nuevo) => {
    const parsed = parseNumericValue(nuevo);
    setItemsCatalogo((prev) => prev.map((p) => {
      if (p.id !== id) return p;
      const esMadera = (p.categoria || "").toLowerCase() === "maderas";
      if (!esMadera) return p;
      const subcategoria = p.subcategoria || "";
      if (subcategoria === "machimbre" || subcategoria === "deck") {
        return { ...p, ancho: parsed };
      }
      const alto = Number(p.alto) || 0;
      const ancho = parsed === "" ? 0 : Number(parsed) || 0;
      const largo = Number(p.largo) || 0;
      const precioPorPie = Number(p.precioPorPie) || 0;
      const base = calcularPrecioCorteMadera({ alto, ancho, largo, precioPorPie });
      const final = p.cepilladoAplicado ? base * 1.066 : base;
      const precioRedondeado = Math.round(final / 100) * 100;
      return { ...p, ancho: parsed, precio: precioRedondeado };
    }));
  };

  const handleLargoChange = (id, nuevo) => {
    const parsed = parseNumericValue(nuevo);
    setItemsCatalogo((prev) => prev.map((p) => {
      if (p.id !== id) return p;
      const esMadera = (p.categoria || "").toLowerCase() === "maderas";
      if (!esMadera) return p;
      const subcategoria = p.subcategoria || "";
      const alto = Number(p.alto) || 0;
      const ancho = Number(p.ancho) || 0;
      const largo = parsed === "" ? 0 : Number(parsed) || 0;
      const cantidad = Number(p.cantidad) || 1;
      const precioPorPie = Number(p.precioPorPie) || 0;
      let base = 0;
      if (subcategoria === "machimbre" || subcategoria === "deck") {
        base = calcularPrecioMachimbre({ alto, largo, cantidad, precioPorPie });
      } else {
        base = calcularPrecioCorteMadera({ alto, ancho, largo, precioPorPie });
      }
      const final = p.cepilladoAplicado ? base * 1.066 : base;
      const precioRedondeado = Math.round(final / 100) * 100;
      return { ...p, largo: parsed, precio: precioRedondeado };
    }));
  };

  const toggleCepillado = (id, aplicar) => {
    setItemsCatalogo((prev) => prev.map((p) => {
      if (p.id !== id) return p;
      const esMadera = (p.categoria || "").toLowerCase() === "maderas";
      if (!esMadera) return p;
      const subcategoria = p.subcategoria || "";
      const alto = Number(p.alto) || 0;
      const ancho = Number(p.ancho) || 0;
      const largo = Number(p.largo) || 0;
      const cantidad = Number(p.cantidad) || 1;
      const precioPorPie = Number(p.precioPorPie) || 0;
      let base = 0;
      if (subcategoria === "machimbre" || subcategoria === "deck") {
        base = calcularPrecioMachimbre({ alto, largo, cantidad, precioPorPie });
      } else {
        base = calcularPrecioCorteMadera({ alto, ancho, largo, precioPorPie });
      }
      const final = aplicar ? base * 1.066 : base;
      const precioRedondeado = Math.round(final / 100) * 100;
      return { ...p, precio: precioRedondeado, cepilladoAplicado: aplicar };
    }));
  };

  const agregarProductoCatalogo = (prod) => {
    const ya = itemsCatalogo.some((x) => x.id === prod.id);
    if (ya) return;
    
    const nuevo = {
      id: prod.id,
      nombre: prod.nombre,
      categoria: prod.categoria || "",
      subcategoria: prod.subcategoria || "",
      unidad: prod.unidad || "UN",
      cantidad: 1,
      descuento: 0,
      precio: Number(prod.valorVenta) || 0,
      valorVenta: Number(prod.valorVenta) || 0,
    };
    
    if (prod.categoria?.toLowerCase() === "maderas") {
      nuevo.alto = Number(prod.alto) || 0;
      nuevo.ancho = Number(prod.ancho) || 0;
      nuevo.largo = Number(prod.largo) || 0;
      nuevo.precioPorPie = Number(prod.precioPorPie) || 0;
      nuevo.cepilladoAplicado = false;
    }
    
    setItemsCatalogo((prev) => [...prev, nuevo]);
  };

  const quitarProductoCatalogo = (id) => {
    setItemsCatalogo((prev) => prev.filter((p) => p.id !== id));
  };

  const actualizarDescuento = (id, descuento) => {
    setItemsCatalogo((prev) => prev.map((p) => (p.id === id ? { ...p, descuento: Number(descuento) || 0 } : p)));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Cargando obra...</p>
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

  if (!obra || obra.tipo !== "obra") {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-yellow-600 text-6xl mb-4">🏗️</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">No es una obra</h1>
          <p className="text-gray-600">Esta página solo muestra obras</p>
          {obra?.tipo === "presupuesto" && (
            <Button 
              onClick={() => router.push(`/${lang}/obras/presupuesto/${id}`)}
              className="mt-4"
            >
              Ver como Presupuesto
            </Button>
          )}
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
        <div className="lg:col-span-2 space-y-6">
          {/* Selector de Materiales del Catálogo */}
          <ProductosSelector
            titulo="Materiales del Catálogo"
            productosCatalogo={productosCatalogo}
            productosPorCategoria={productosPorCategoria}
            categorias={categorias}
            itemsSeleccionados={itemsCatalogo}
            onAgregarProducto={agregarProductoCatalogo}
            editando={editando}
            maxProductos={48}
            showFilters={true}
            showSearch={true}
            showPagination={true}
            productosPorPagina={12}
          />

          {/* Tabla de Materiales Seleccionados */}
          <ProductosTabla
            titulo="Materiales Seleccionados"
            items={itemsCatalogo}
            editando={editando}
            onQuitarProducto={quitarProductoCatalogo}
            onActualizarProducto={(id, campo, valor) => {
              if (campo === "cantidad") handleCantidadChange(id, valor);
              else if (campo === "alto") handleAltoChange(id, valor);
              else if (campo === "ancho") handleAnchoChange(id, valor);
              else if (campo === "largo") handleLargoChange(id, valor);
              else if (campo === "precioPorPie") handlePrecioPorPieChange(id, valor);
              else if (campo === "cepilladoAplicado") toggleCepillado(id, valor);
              else if (campo === "descuento") actualizarDescuento(id, valor);
            }}
            onIncrementarCantidad={(id) => {
              const item = itemsCatalogo.find(p => p.id === id);
              if (item) {
                handleCantidadChange(id, String(Number(item.cantidad || 1) + 1));
              }
            }}
            onDecrementarCantidad={(id) => {
              const item = itemsCatalogo.find(p => p.id === id);
              if (item) {
                const nuevaCantidad = Math.max(1, Number(item.cantidad || 1) - 1);
                handleCantidadChange(id, String(nuevaCantidad));
              }
            }}
            formatearNumeroArgentino={formatearNumeroArgentino}
          />

          {/* Presupuesto Inicial */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Icon icon="heroicons:clipboard-document-list" className="w-5 h-5" />
                Presupuesto Inicial
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {presupuesto ? (
                <div className="p-4 bg-blue-50 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-blue-900">
                        Presupuesto Vinculado: {presupuesto.numeroPedido}
                      </p>
                      <p className="text-sm text-blue-700">
                        Total: {formatearNumeroArgentino(presupuesto.total || 0)}
                      </p>
                    </div>
                    {editando && (
                      <Button
                        variant="outline"
                        onClick={handleDesvincularPresupuesto}
                        className="text-red-600 hover:text-red-700"
                      >
                        Desvincular
                      </Button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-gray-600 mb-4">No hay presupuesto inicial vinculado</p>
                  {editando && (
                    <div className="space-y-4">
                      <div className="flex gap-2">
                        <Select
                          value={presupuestoSeleccionadoId}
                          onValueChange={setPresupuestoSeleccionadoId}
                        >
                          <SelectTrigger className="flex-1">
                            <SelectValue placeholder="Seleccionar presupuesto existente" />
                          </SelectTrigger>
                          <SelectContent>
                            {presupuestosDisponibles.map((pres) => (
                              <SelectItem key={pres.id} value={pres.id}>
                                {pres.numeroPedido} - {formatearNumeroArgentino(pres.total || 0)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          onClick={handleVincularPresupuesto}
                          disabled={!presupuestoSeleccionadoId}
                        >
                          Vincular
                        </Button>
                      </div>
                      <div className="text-center">
                        <span className="text-gray-500">o</span>
                      </div>
                      <Button
                        onClick={handleCrearPresupuestoDesdeAqui}
                        variant="outline"
                        className="w-full"
                      >
                        Crear Nuevo Presupuesto
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* Productos del Presupuesto Inicial */}
              {presupuesto && (
                <>
                  {/* Selector de Productos de Obra */}
                  <ProductosSelector
                    titulo="Productos del Presupuesto"
                    productosCatalogo={productosObraCatalogo}
                    productosPorCategoria={productosObraPorCategoria}
                    categorias={categoriasObra}
                    itemsSeleccionados={itemsPresupuesto}
                    onAgregarProducto={(prod) => {
                      const ya = itemsPresupuesto.some((x) => x.id === prod.id);
                      if (ya) return;
                      
                      const nuevo = {
                        id: prod.id,
                        nombre: prod.nombre,
                        categoria: prod.categoria || "",
                        subcategoria: prod.subcategoria || "",
                        unidad: prod.unidad || prod.unidadMedida || "UN",
                        cantidad: 1,
                        descuento: 0,
                        precio: Number(prod.valorVenta) || 0,
                        valorVenta: Number(prod.valorVenta) || 0,
                      };
                      
                      if (prod.categoria?.toLowerCase() === "maderas") {
                        nuevo.alto = Number(prod.alto) || 0;
                        nuevo.ancho = Number(prod.ancho) || 0;
                        nuevo.largo = Number(prod.largo) || 0;
                        nuevo.precioPorPie = Number(prod.precioPorPie) || 0;
                        nuevo.cepilladoAplicado = false;
                      }
                      
                      setItemsPresupuesto((prev) => [...prev, nuevo]);
                    }}
                    editando={editando}
                    maxProductos={48}
                    showFilters={true}
                    showSearch={true}
                    showPagination={true}
                    productosPorPagina={12}
                  />

                  {/* Tabla de Productos del Presupuesto */}
                  <ProductosTabla
                    titulo="Productos del Presupuesto"
                    items={itemsPresupuesto}
                    editando={editando}
                    onQuitarProducto={(id) => setItemsPresupuesto((prev) => prev.filter((p) => p.id !== id))}
                    onActualizarProducto={(id, campo, valor) => {
                      setItemsPresupuesto((prev) => prev.map((p) => {
                        if (p.id !== id) return p;
                        const nuevo = { ...p, [campo]: valor };
                        
                        // Recalcular precio si es madera
                        if (campo === "cantidad" || campo === "alto" || campo === "ancho" || campo === "largo" || campo === "precioPorPie" || campo === "cepilladoAplicado") {
                          if (p.categoria?.toLowerCase() === "maderas") {
                            if (p.subcategoria === "machimbre" || p.subcategoria === "deck") {
                              const alto = Number(nuevo.alto) || 0;
                              const largo = Number(nuevo.largo) || 0;
                              const cantidad = Number(nuevo.cantidad) || 1;
                              const precioPorPie = Number(nuevo.precioPorPie) || 0;
                              const precioBase = alto * largo * precioPorPie * cantidad;
                              const precioFinal = nuevo.cepilladoAplicado ? precioBase * 1.066 : precioBase;
                              nuevo.precio = Math.round(precioFinal / 100) * 100;
                            } else {
                              const alto = Number(nuevo.alto) || 0;
                              const ancho = Number(nuevo.ancho) || 0;
                              const largo = Number(nuevo.largo) || 0;
                              const precioPorPie = Number(nuevo.precioPorPie) || 0;
                              const factor = 0.2734;
                              const precioBase = factor * alto * ancho * largo * precioPorPie;
                              const precioFinal = nuevo.cepilladoAplicado ? precioBase * 1.066 : precioBase;
                              nuevo.precio = Math.round(precioFinal / 100) * 100;
                            }
                          }
                        }
                        
                        return nuevo;
                      }));
                    }}
                    onIncrementarCantidad={(id) => {
                      setItemsPresupuesto((prev) => prev.map((p) => {
                        if (p.id !== id) return p;
                        const nuevaCantidad = Number(p.cantidad || 1) + 1;
                        const nuevo = { ...p, cantidad: nuevaCantidad };
                        
                        // Recalcular precio si es madera machimbre/deck
                        if (p.categoria?.toLowerCase() === "maderas" && (p.subcategoria === "machimbre" || p.subcategoria === "deck")) {
                          const alto = Number(p.alto) || 0;
                          const largo = Number(p.largo) || 0;
                          const precioPorPie = Number(p.precioPorPie) || 0;
                          const precioBase = alto * largo * precioPorPie * nuevaCantidad;
                          const precioFinal = p.cepilladoAplicado ? precioBase * 1.066 : precioBase;
                          nuevo.precio = Math.round(precioFinal / 100) * 100;
                        }
                        
                        return nuevo;
                      }));
                    }}
                    onDecrementarCantidad={(id) => {
                      setItemsPresupuesto((prev) => prev.map((p) => {
                        if (p.id !== id) return p;
                        const nuevaCantidad = Math.max(1, Number(p.cantidad || 1) - 1);
                        const nuevo = { ...p, cantidad: nuevaCantidad };
                        
                        // Recalcular precio si es madera machimbre/deck
                        if (p.categoria?.toLowerCase() === "maderas" && (p.subcategoria === "machimbre" || p.subcategoria === "deck")) {
                          const alto = Number(p.alto) || 0;
                          const largo = Number(p.largo) || 0;
                          const precioPorPie = Number(p.precioPorPie) || 0;
                          const precioBase = alto * largo * precioPorPie * nuevaCantidad;
                          const precioFinal = p.cepilladoAplicado ? precioBase * 1.066 : precioBase;
                          nuevo.precio = Math.round(precioFinal / 100) * 100;
                        }
                        
                        return nuevo;
                      }));
                    }}
                    formatearNumeroArgentino={formatearNumeroArgentino}
                  />
                </>
              )}
            </CardContent>
          </Card>

          <ObraCobranza
            movimientos={movimientos}
            onMovimientosChange={setMovimientos}
            editando={editando}
            formatearNumeroArgentino={formatearNumeroArgentino}
          />

          <ObraDocumentacion
            docLinks={docLinks}
            onDocLinksChange={setDocLinks}
            editando={editando}
          />
        </div>

        {/* Barra lateral */}
        <div className="space-y-6">
          <ObraInfoGeneral
            obra={obra}
            formatearFecha={formatearFecha}
            editando={editando}
            // Estados editables
            tipoObra={tipoObra}
            prioridad={prioridad}
            estadoObra={estadoObra}
            responsable={responsable}
            responsables={responsables}
            fechasEdit={fechasEdit}
            ubicacionEdit={ubicacionEdit}
            clienteId={clienteId}
            cliente={cliente}
            clientes={clientes}
            usarDireccionCliente={usarDireccionCliente}
            // Setters
            setTipoObra={setTipoObra}
            setPrioridad={setPrioridad}
            setEstadoObra={setEstadoObra}
            setResponsable={setResponsable}
            setFechasEdit={setFechasEdit}
            setUbicacionEdit={setUbicacionEdit}
            setClienteId={setClienteId}
            setCliente={setCliente}
            setUsarDireccionCliente={setUsarDireccionCliente}
          />

          <ObraResumenFinanciero
            obra={obra}
            presupuesto={presupuesto}
            modoCosto={modoCosto}
            formatearNumeroArgentino={formatearNumeroArgentino}
          />

          {/* Selector de modo de costo */}
          {presupuesto && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Icon icon="heroicons:calculator" className="w-5 h-5" />
                  Modo de Cálculo
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Select value={modoCosto} onValueChange={setModoCosto}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="presupuesto">Presupuesto Inicial</SelectItem>
                    <SelectItem value="gasto">Gasto Real</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-sm text-gray-600 mt-2">
                  {modoCosto === "presupuesto" 
                    ? "Mostrar total basado en el presupuesto inicial"
                    : "Mostrar total basado en materiales reales utilizados"
                  }
                </p>
              </CardContent>
            </Card>
          )}

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

      {/* Modal: Nuevo Responsable */}
      <Dialog open={openNuevoResponsable} onOpenChange={setOpenNuevoResponsable}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agregar Nuevo Responsable</DialogTitle>
            <DialogDescription>
              Ingrese el nombre del nuevo responsable para la obra.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              value={nuevoResponsable}
              onChange={(e) => setNuevoResponsable(e.target.value)}
              placeholder="Nombre del responsable"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenNuevoResponsable(false)}>
              Cancelar
            </Button>
            <Button onClick={handleAgregarResponsable}>
              Agregar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Vista previa de impresión */}
      <Dialog open={openPrint} onOpenChange={setOpenPrint}>
        <DialogContent className="max-w-6xl max-h-[90vh] w-full">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Printer className="w-5 h-5" />
              Vista Previa de Impresión - Obra
            </DialogTitle>
            <DialogDescription>
              Revise el documento antes de imprimir. Use los botones de acción para imprimir, descargar PDF o cerrar.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0">
            <iframe
              srcDoc={generarContenidoImpresion(obra, presupuesto, modoCosto)}
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
              presupuesto={presupuesto}
              modoCosto={modoCosto}
              movimientos={movimientos}
              variant="default"
              size="sm"
            />
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ObraDetallePage;