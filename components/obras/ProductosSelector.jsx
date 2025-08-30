"use client";
import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@iconify/react";
import { Search, Filter, RefreshCw } from "lucide-react";

const ProductosSelector = ({
  titulo = "Selección de Productos",
  productosCatalogo = [],
  productosPorCategoria = {},
  categorias = [],
  itemsSeleccionados = [],
  onAgregarProducto,
  onQuitarProducto,
  onActualizarProducto,
  editando = false,
  maxProductos = 48,
  showFilters = true,
  showSearch = true,
  showPagination = true,
  productosPorPagina = 12
}) => {
  const [categoriaId, setCategoriaId] = useState("");
  const [busquedaProducto, setBusquedaProducto] = useState("");
  const [busquedaDebounced, setBusquedaDebounced] = useState("");
  const [paginaActual, setPaginaActual] = useState(1);
  const [isPending, startTransition] = React.useTransition();

  // Debounce para búsqueda
  useEffect(() => {
    const timer = setTimeout(() => setBusquedaDebounced(busquedaProducto), 150);
    return () => clearTimeout(timer);
  }, [busquedaProducto]);

  // Resetear página cuando cambien los filtros
  useEffect(() => {
    setPaginaActual(1);
  }, [categoriaId, busquedaDebounced]);

  // Filtrar productos
  const productosFiltrados = React.useMemo(() => {
    let productos = [];
    
    if (categoriaId && productosPorCategoria[categoriaId]) {
      productos = productosPorCategoria[categoriaId];
    } else if (busquedaDebounced && busquedaDebounced.trim() !== "") {
      productos = productosCatalogo;
    } else {
      return [];
    }

    // Aplicar búsqueda si existe
    if (busquedaDebounced && busquedaDebounced.trim() !== "") {
      const busqueda = busquedaDebounced.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "");
      productos = productos.filter((prod) => {
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

    return productos;
  }, [categoriaId, productosPorCategoria, busquedaDebounced, productosCatalogo]);

  // Paginación
  const totalProductos = productosFiltrados.length;
  const totalPaginas = Math.ceil(totalProductos / productosPorPagina) || 1;
  const productosPaginados = productosFiltrados.slice(
    (paginaActual - 1) * productosPorPagina,
    paginaActual * productosPorPagina
  );

  // Función para obtener el precio del producto
  const getPrecioProducto = (prod) => {
    if (prod.categoria === "Maderas") return Number(prod.precioPorPie) || 0;
    if (prod.categoria === "Ferretería") return Number(prod.valorVenta) || 0;
    return (
      Number(prod.precioUnidad) ||
      Number(prod.precioUnidadVenta) ||
      Number(prod.precioUnidadHerraje) ||
      Number(prod.precioUnidadQuimico) ||
      Number(prod.precioUnidadHerramienta) ||
      Number(prod.valorVenta) ||
      0
    );
  };

  // Función para formatear números argentinos
  const formatearNumeroArgentino = (numero) => {
    if (numero === null || numero === undefined || isNaN(numero)) return "0";
    return new Intl.NumberFormat("es-AR").format(Number(numero));
  };

  if (!editando) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon icon="heroicons:cube" className="w-5 h-5" />
          {titulo}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filtros y búsqueda */}
        {showFilters && (
          <div className="flex gap-2 items-center">
            {showSearch && (
              <div className="flex-1 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Icon icon="heroicons:magnifying-glass" className="h-5 w-5 text-gray-400" />
                </div>
                <Input
                  placeholder="Buscar productos..."
                  value={busquedaProducto}
                  onChange={(e) => setBusquedaProducto(e.target.value)}
                  className="pl-10"
                />
              </div>
            )}
            <Select value={categoriaId} onValueChange={setCategoriaId}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Todas las categorías" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Todas las categorías</SelectItem>
                {categorias.map((cat) => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setCategoriaId("");
                setBusquedaProducto("");
                setPaginaActual(1);
              }}
            >
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        )}

        {/* Grid de productos */}
        <div className="max-h-96 overflow-y-auto">
          {!categoriaId && (!busquedaDebounced || busquedaDebounced.trim() === "") ? (
            <div className="p-8 text-center">
              <h3 className="text-lg font-medium mb-2">Selecciona una categoría</h3>
              <p className="text-gray-500">Elige una categoría para ver los productos disponibles</p>
            </div>
          ) : productosFiltrados.length === 0 ? (
            <div className="p-8 text-center">
              <h3 className="text-lg font-medium mb-2">No se encontraron productos</h3>
              <p className="text-gray-500">Intenta cambiar los filtros o la búsqueda</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4 relative">
                {isPending && (
                  <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-10 flex items-center justify-center rounded-lg">
                    <div className="flex items-center gap-3 bg-white px-4 py-3 rounded-lg shadow-lg border border-gray-200">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-gray-600"></div>
                      <span className="text-sm font-medium text-gray-700">Cargando productos...</span>
                    </div>
                  </div>
                )}
                
                {productosPaginados.slice(0, maxProductos).map((prod) => {
                  const yaAgregado = itemsSeleccionados.some((p) => p.id === prod.id);
                  const precio = getPrecioProducto(prod);
                  
                  return (
                    <div
                      key={prod.id}
                      className={`group relative rounded-lg border-2 transition-all duration-200 hover:shadow-md h-full flex flex-col ${
                        yaAgregado
                          ? "border-green-200 bg-green-50"
                          : "border-gray-200 hover:border-blue-300"
                      }`}
                    >
                      <div className="p-4 flex flex-col h-full">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-3 mb-2">
                              <div
                                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                                  prod.categoria === "Maderas"
                                    ? "bg-orange-100 text-orange-700"
                                    : "bg-blue-100 text-blue-700"
                                }`}
                              >
                                {prod.categoria === "Maderas" ? "🌲" : "🔧"}
                              </div>
                              <div className="flex-1 min-w-0">
                                <h4 className="text-sm font-semibold truncate">{prod.nombre}</h4>
                                {prod.categoria === "Maderas" && prod.tipoMadera && (
                                  <div className="flex items-center gap-1 mt-1">
                                    <span className="text-xs text-orange-600 font-medium">🌲 {prod.tipoMadera}</span>
                                  </div>
                                )}
                                {prod.categoria === "Ferretería" && prod.subCategoria && (
                                  <div className="flex items-center gap-1 mt-1">
                                    <span className="text-xs text-blue-600 font-medium">🔧 {prod.subCategoria}</span>
                                  </div>
                                )}
                              </div>
                              {yaAgregado && (
                                <div className="flex items-center gap-1 text-green-600">
                                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                                  </svg>
                                  <span className="text-xs font-medium">Agregado</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Información del producto */}
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-gray-500">Precio:</span>
                            <span className="text-sm font-semibold">${formatearNumeroArgentino(precio)}</span>
                          </div>
                          {(prod.unidadMedida || prod.unidad) && (
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-gray-500">Unidad:</span>
                              <span className="text-xs text-gray-700">{prod.unidadMedida || prod.unidad}</span>
                            </div>
                          )}
                          {prod.stock !== undefined && (
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-gray-500">Stock:</span>
                              <span className={`text-xs font-medium ${prod.stock > 10 ? "text-green-600" : prod.stock > 0 ? "text-yellow-600" : "text-red-600"}`}>
                                {prod.stock} unidades
                              </span>
                            </div>
                          )}
                          
                          {/* Información adicional para maderas */}
                          {prod.categoria === "Maderas" && (
                            <>
                              {prod.precioPorPie && (
                                <div className="flex items-center justify-between">
                                  <span className="text-xs text-gray-500">Precio por pie:</span>
                                  <span className="text-xs text-gray-700">${formatearNumeroArgentino(prod.precioPorPie)}</span>
                                </div>
                              )}
                              {prod.alto && prod.largo && prod.unidadMedida === "M2" && (
                                <div className="flex items-center justify-between">
                                  <span className="text-xs text-gray-500">Dimensiones:</span>
                                  <span className="text-xs text-gray-700">
                                    {prod.alto}×{prod.largo} m
                                  </span>
                                </div>
                              )}
                              {prod.alto && prod.ancho && prod.largo && prod.unidadMedida !== "M2" && prod.unidadMedida !== "Unidad" && (
                                <div className="flex items-center justify-between">
                                  <span className="text-xs text-gray-500">Dimensiones:</span>
                                  <span className="text-xs text-gray-700">
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
                              if (!yaAgregado) {
                                onAgregarProducto(prod);
                              }
                            }}
                            disabled={yaAgregado}
                            className={`w-full py-2 px-3 rounded-md text-sm font-medium transition-colors ${
                              yaAgregado 
                                ? "bg-green-100 text-green-700 cursor-not-allowed" 
                                : "bg-blue-600 text-white hover:bg-blue-700"
                            }`}
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
              {showPagination && totalPaginas > 1 && (
                <div className="flex items-center justify-center gap-2 mt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPaginaActual(prev => Math.max(1, prev - 1))}
                    disabled={paginaActual === 1}
                  >
                    Anterior
                  </Button>
                  <span className="text-sm text-gray-600">
                    Página {paginaActual} de {totalPaginas}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPaginaActual(prev => Math.min(totalPaginas, prev + 1))}
                    disabled={paginaActual === totalPaginas}
                  >
                    Siguiente
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default ProductosSelector;
