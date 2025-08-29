"use client";
import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@iconify/react";
import { Plus, Trash2, Search, Filter } from "lucide-react";

const PresupuestoDetalle = ({
  itemsPresupuesto,
  onItemsPresupuestoChange,
  productosObraCatalogo,
  productosObraPorCategoria,
  categoriasObra,
  categoriaObraId,
  setCategoriaObraId,
  busquedaProductoObra,
  setBusquedaProductoObra,
  editando,
  formatearNumeroArgentino
}) => {
  const [busquedaDebounced, setBusquedaDebounced] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setBusquedaDebounced(busquedaProductoObra), 150);
    return () => clearTimeout(timer);
  }, [busquedaProductoObra]);

  const agregarProductoObra = (prod) => {
    const ya = itemsPresupuesto.some((x) => x.id === prod.id);
    if (ya) return;
    
    const unidadMedida = prod.unidadMedida || "UN";
    const nuevo = {
      id: prod.id,
      nombre: prod.nombre,
      categoria: prod.categoria || "",
      subCategoria: prod.subCategoria || prod.subcategoria || "",
      unidadMedida,
      valorVenta: Number(prod.valorVenta) || 0,
      alto: 1,
      largo: 1,
      cantidad: 1,
      descuento: 0,
    };
    
    // Calcular precio inicial
    const precio = calcularPrecioProductoObra({
      unidadMedida: nuevo.unidadMedida,
      alto: nuevo.alto,
      largo: nuevo.largo,
      valorVenta: nuevo.valorVenta,
      cantidad: nuevo.cantidad
    });
    nuevo.precio = precio;
    
    onItemsPresupuestoChange([...itemsPresupuesto, nuevo]);
  };

  const agregarProductoObraManual = () => {
    const nuevo = {
      id: `manual-${Date.now()}`,
      nombre: "Nuevo ítem",
      categoria: "Manual",
      subCategoria: "",
      unidadMedida: "UN",
      valorVenta: 0,
      alto: 1,
      largo: 1,
      cantidad: 1,
      descuento: 0,
      _esManual: true,
      precio: 0
    };
    
    onItemsPresupuestoChange([nuevo, ...itemsPresupuesto]);
  };

  const quitarProductoObra = (id) => {
    onItemsPresupuestoChange(itemsPresupuesto.filter((p) => p.id !== id));
  };

  const actualizarCampoObra = (id, campo, valor) => {
    onItemsPresupuestoChange(itemsPresupuesto.map((p) => {
      if (p.id !== id) return p;
      
      const actualizado = { ...p, [campo]: valor };
      
      if (campo === "unidadMedida" || campo === "alto" || campo === "largo" || campo === "cantidad" || campo === "valorVenta") {
        const precioBase = calcularPrecioProductoObra({
          unidadMedida: actualizado.unidadMedida,
          alto: Number(actualizado.alto) || 0,
          largo: Number(actualizado.largo) || 0,
          valorVenta: Number(actualizado.valorVenta) || 0,
          cantidad: Number(actualizado.cantidad) || 1
        });
        actualizado.precio = Math.round(precioBase);
      }
      
      return actualizado;
    }));
  };

  const calcularPrecioProductoObra = ({ unidadMedida, alto, largo, valorVenta, cantidad }) => {
    const u = String(unidadMedida || "").toUpperCase();
    const altoNum = Number(alto) || 0;
    const largoNum = Number(largo) || 0;
    const valorNum = Number(valorVenta) || 0;
    const cantNum = Number(cantidad) || 1;
    
    if (u === "M2") return Math.round(altoNum * largoNum * valorNum * cantNum);
    if (u === "ML") return Math.round(largoNum * valorNum * cantNum);
    return Math.round(valorNum * cantNum);
  };

  const totalPresupuesto = itemsPresupuesto.reduce((acc, item) => {
    const subtotal = Number(item.precio || 0) * (1 - Number(item.descuento || 0) / 100);
    return acc + subtotal;
  }, 0);

  const fuenteProductos = busquedaDebounced
    ? (categoriaObraId ? (productosObraPorCategoria[categoriaObraId] || []) : productosObraCatalogo)
    : (categoriaObraId ? productosObraPorCategoria[categoriaObraId] : productosObraCatalogo);

  const productosFiltrados = fuenteProductos?.filter((prod) => {
    if (!busquedaDebounced) return true;
    const q = busquedaDebounced.toLowerCase();
    return String(prod.nombre || "").toLowerCase().includes(q) || 
           String(prod.unidadMedida || "").toLowerCase().includes(q);
  }).slice(0, 48) || [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon icon="heroicons:clipboard-document-list" className="w-5 h-5" />
          Presupuesto
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {editando && (
          <>
            <div className="flex gap-2 items-center">
              <div className="flex-1">
                <Input
                  placeholder="Buscar productos..."
                  value={busquedaProductoObra}
                  onChange={(e) => setBusquedaProductoObra(e.target.value)}
                  className="flex-1"
                />
              </div>
              <Select value={categoriaObraId} onValueChange={setCategoriaObraId}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Todas las categorías" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Todas las categorías</SelectItem>
                  {categoriasObra.map((cat) => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={agregarProductoObraManual} variant="outline">
                <Plus className="w-4 h-4 mr-2" />
                Ítem Manual
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 p-4 border rounded-lg">
              {productosFiltrados.map((prod) => {
                const yaAgregado = itemsPresupuesto.some((p) => p.id === prod.id);
                const precio = Number(prod.valorVenta) || 0;
                
                return (
                  <div key={prod.id} className={`group relative rounded-lg border-2 transition-all duration-200 hover:shadow-md h-full flex flex-col ${
                    yaAgregado ? "border-green-200 bg-green-50" : "border-gray-200 hover:border-blue-300"
                  }`}>
                    <div className="p-4 flex flex-col h-full">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-2">
                            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold bg-blue-100 text-blue-700">
                              🏗️
                            </div>
                            <div className="flex-1 min-w-0">
                              <h4 className="text-sm font-semibold truncate">{prod.nombre}</h4>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-500">Precio:</span>
                          <span className="text-sm font-semibold">{formatearNumeroArgentino(precio)}</span>
                        </div>
                      </div>
                      <div className="mt-4">
                        <button
                          onClick={() => { if (!yaAgregado) agregarProductoObra(prod); }}
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
          </>
        )}

        {itemsPresupuesto.length > 0 && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="p-2 text-left">Producto</th>
                    <th className="p-2 text-center">Unidad</th>
                    <th className="p-2 text-center">Alto</th>
                    <th className="p-2 text-center">Largo</th>
                    <th className="p-2 text-right">Valor</th>
                    <th className="p-2 text-center">Desc. %</th>
                    <th className="p-2 text-right">Subtotal</th>
                    {editando && <th className="p-2 text-center">Acción</th>}
                  </tr>
                </thead>
                <tbody>
                  {itemsPresupuesto.map((p) => {
                    const u = String(p.unidadMedida || "UN").toUpperCase();
                    const sub = Number(p.precio || 0) * (1 - Number(p.descuento || 0) / 100);
                    const requiereAlto = u === "M2";
                    const requiereLargo = u === "M2" || u === "ML";
                    
                    return (
                      <tr key={p.id} className="border-b">
                        <td className="p-2">
                          <div className="font-medium">
                            {p._esManual ? (
                              <Input
                                value={p.nombre}
                                onChange={(e) => actualizarCampoObra(p.id, "nombre", e.target.value)}
                                className="h-8"
                              />
                            ) : (
                              p.nombre
                            )}
                          </div>
                          <div className="text-xs text-gray-500">{p.categoria}</div>
                        </td>
                        
                        <td className="p-2 text-center">
                          {p._esManual ? (
                            <Select
                              value={u}
                              onValueChange={(v) => actualizarCampoObra(p.id, "unidadMedida", v)}
                            >
                              <SelectTrigger className="w-24 mx-auto h-8">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="UN">UN</SelectItem>
                                <SelectItem value="M2">M2</SelectItem>
                                <SelectItem value="ML">ML</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (
                            <Badge variant="outline">{u}</Badge>
                          )}
                        </td>
                        
                        <td className="p-2 text-center">
                          {requiereAlto ? (
                            <Input
                              type="number"
                              min={0}
                              step="0.01"
                              value={p.alto}
                              onChange={(e) => actualizarCampoObra(p.id, "alto", e.target.value)}
                              className="w-24 mx-auto"
                            />
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        
                        <td className="p-2 text-center">
                          {requiereLargo ? (
                            <Input
                              type="number"
                              min={0}
                              step="0.01"
                              value={p.largo}
                              onChange={(e) => actualizarCampoObra(p.id, "largo", e.target.value)}
                              className="w-24 mx-auto"
                            />
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        
                        <td className="p-2 text-right">
                          {p._esManual ? (
                            <div className="relative w-28 ml-auto">
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-sm text-default-500">$</span>
                              <Input
                                type="number"
                                min={0}
                                step="0.01"
                                value={p.valorVenta || 0}
                                onChange={(e) => actualizarCampoObra(p.id, "valorVenta", e.target.value)}
                                className="pl-5 pr-2 h-8 text-right"
                              />
                            </div>
                          ) : (
                            formatearNumeroArgentino(p.valorVenta || 0)
                          )}
                        </td>
                        
                        <td className="p-2 text-center">
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            value={p.descuento}
                            onChange={(e) => actualizarCampoObra(p.id, "descuento", e.target.value)}
                            className="w-20 mx-auto"
                          />
                        </td>
                        
                        <td className="p-2 text-right font-semibold">
                          {formatearNumeroArgentino(Math.round(sub))}
                        </td>
                        
                        {editando && (
                          <td className="p-2 text-center">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => quitarProductoObra(p.id)}
                            >
                              Quitar
                            </Button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            
            <div className="text-right">
              <div className="text-lg font-semibold">
                Total: {formatearNumeroArgentino(totalPresupuesto)}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default PresupuestoDetalle;
