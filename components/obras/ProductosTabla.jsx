"use client";
import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Icon } from "@iconify/react";

const ProductosTabla = ({
  titulo = "Productos seleccionados",
  items = [],
  editando = false,
  onQuitarProducto,
  onActualizarProducto,
  onActualizarNombreManual,
  formatearNumeroArgentino,
  // Props adicionales para filtros
  categorias = [],
  categoriaId = "",
  setCategoriaId,
  busquedaProducto = "",
  setBusquedaProducto,
  productosFiltrados = [],
  productosPorCategoria = {},
  // Props para filtros específicos
  tiposMadera = [],
  filtroTipoMadera = "",
  setFiltroTipoMadera,
  subCategoriasFerreteria = [],
  filtroSubCategoria = "",
  setFiltroSubCategoria
}) => {
  if (items.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{titulo}</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {/* Filtros mejorados - Solo mostrar si está editando */}
        {editando && (
          <div className="mb-4 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="flex flex-col gap-3">
              {/* Filtro de categorías */}
              <div className="flex-1">
                <div className="flex bg-white dark:bg-gray-800 rounded-lg p-1 shadow-sm border border-gray-200 dark:border-gray-600">
                  {categorias.map((categoria) => (
                    <button
                      key={categoria}
                      type="button"
                      className={`rounded-full px-4 py-1 text-sm flex items-center gap-2 transition-all ${
                        categoriaId === categoria
                          ? "bg-blue-600 text-white"
                          : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                      }`}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (categoriaId === categoria) {
                          setCategoriaId("");
                          setFiltroTipoMadera && setFiltroTipoMadera("");
                          setFiltroSubCategoria && setFiltroSubCategoria("");
                        } else {
                          setCategoriaId(categoria);
                          setFiltroTipoMadera && setFiltroTipoMadera("");
                          setFiltroSubCategoria && setFiltroSubCategoria("");
                        }
                      }}
                    >
                      {categoria}
                    </button>
                  ))}
                </div>
              </div>

              {/* Filtros específicos por categoría */}
              <div className="flex flex-col sm:flex-row gap-3">
                {/* Filtro de tipo de madera */}
                {categoriaId === "Maderas" && tiposMadera && tiposMadera.length > 0 && (
                  <div className="flex-1">
                    <div className="flex bg-white dark:bg-gray-800 rounded-lg p-1 shadow-sm border border-gray-200 dark:border-gray-600">
                      <button
                        type="button"
                        className={`rounded-full px-4 py-1 text-sm flex items-center gap-2 transition-all ${
                          filtroTipoMadera === ""
                            ? "bg-orange-600 text-white"
                            : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                        }`}
                        onClick={() => setFiltroTipoMadera("")}
                      >
                        Todos los tipos
                      </button>
                      {tiposMadera.map((tipo) => (
                        <button
                          key={tipo}
                          type="button"
                          className={`rounded-md px-4 py-1 text-sm flex items-center gap-2 transition-all ${
                            filtroTipoMadera === tipo
                              ? "bg-orange-600 text-white"
                              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                          }`}
                          onClick={() => setFiltroTipoMadera(tipo)}
                        >
                          {tipo}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Filtro de subcategoría de ferretería */}
                {categoriaId === "Ferretería" && subCategoriasFerreteria && subCategoriasFerreteria.length > 0 && (
                  <div className="flex-1">
                    <div className="flex bg-white dark:bg-gray-800 rounded-lg p-1 shadow-sm border border-gray-200 dark:border-gray-600">
                      <button
                        type="button"
                        className={`rounded-md px-4 py-1 text-sm flex items-center gap-2 transition-all ${
                          filtroSubCategoria === ""
                            ? "bg-blue-600 text-white"
                            : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                        }`}
                        onClick={() => setFiltroSubCategoria("")}
                      >
                        Todas las subcategorías
                      </button>
                      {subCategoriasFerreteria.map((subCategoria) => (
                        <button
                          key={subCategoria}
                          type="button"
                          className={`rounded-full px-4 py-1 text-sm flex items-center gap-2 transition-all ${
                            filtroSubCategoria === subCategoria
                              ? "bg-blue-600 text-white"
                              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                          }`}
                          onClick={() => setFiltroSubCategoria(subCategoria)}
                        >
                          {subCategoria}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Buscador mejorado */}
                <div className="flex-1 relative flex items-center gap-2">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <svg
                      className="h-5 w-5 text-gray-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                      />
                    </svg>
                  </div>
                  <input
                    type="text"
                    placeholder="Buscar productos..."
                    value={busquedaProducto}
                    onChange={(e) => setBusquedaProducto(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                      }
                    }}
                    className="w-full pl-10 pr-10 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 bg-card"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="p-2 text-left">Producto</th>
              <th className="p-2 text-center">Cant.</th>
              <th className="p-2 text-center">Unidad</th>
              <th className="p-2 text-center">Ancho</th>
              <th className="p-2 text-center">Largo</th>
              <th className="p-2 text-right">
                <div className="flex flex-col items-end">
                  <span>Valor Unit.</span>
                  <span className="text-xs text-gray-500 font-normal">(Editable)</span>
                </div>
              </th>
              <th className="p-2 text-center">Desc. %</th>
              <th className="p-2 text-right">Subtotal</th>
              {editando && <th className="p-2 text-center">Acción</th>}
            </tr>
          </thead>
          <tbody>
            {items.map((p) => {
              const sub = Number(p.precio || 0) * (1 - Number(p.descuento || 0) / 100);
              const u = String(p.unidadMedida || p.unidad || "UN").toUpperCase();
              const requiereAlto = u === "M2"; // Para m2 pedimos alto y largo. Para ml solo largo.
              const requiereLargo = u === "M2" || u === "ML";
              
              return (
                <React.Fragment key={p.id}>
                  <tr className="border-b">
                    <td className="p-2">
                      <div className="font-medium">
                        {editando && p._esManual ? (
                          <Input 
                            value={p.nombre} 
                            onChange={(e) => onActualizarNombreManual && onActualizarNombreManual(p.id, e.target.value)} 
                            className="h-8" 
                          />
                        ) : (
                          p.nombre
                        )}
                      </div>
                      <div className="text-xs text-gray-500">{p.categoria}</div>
                    </td>
                    <td className="p-2 text-center">
                      {editando ? (
                        <Input 
                          type="number" 
                          min={1} 
                          value={p.cantidad} 
                          onChange={(e) => onActualizarProducto(p.id, "cantidad", e.target.value)} 
                          className="w-20 mx-auto" 
                        />
                      ) : (
                        <span className="font-medium">{p.cantidad}</span>
                      )}
                    </td>
                    <td className="p-2 text-center">
                      {editando && p._esManual ? (
                        <Select value={u} onValueChange={(v) => onActualizarProducto(p.id, "unidadMedida", v)}>
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
                        editando ? (
                          <Input 
                            type="number" 
                            min={0} 
                            step="0.01" 
                            value={p.alto} 
                            onChange={(e) => onActualizarProducto(p.id, "alto", e.target.value)} 
                            className="w-24 mx-auto" 
                          />
                        ) : (
                          <span className="font-medium">{p.alto || 0}</span>
                        )
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="p-2 text-center">
                      {requiereLargo ? (
                        editando ? (
                          <Input 
                            type="number" 
                            min={0} 
                            step="0.01" 
                            value={p.largo} 
                            onChange={(e) => onActualizarProducto(p.id, "largo", e.target.value)} 
                            className="w-24 mx-auto" 
                          />
                        ) : (
                          <span className="font-medium">{p.largo || 0}</span>
                        )
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="p-2 text-right">
                      {editando ? (
                        <div className="relative w-28 ml-auto">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-sm text-default-500">$</span>
                          <Input 
                            type="number" 
                            min={0} 
                            step="0.01" 
                            value={p.valorVenta} 
                            onChange={(e) => onActualizarProducto(p.id, "valorVenta", e.target.value)} 
                            className="pl-5 pr-2 h-8 text-right" 
                            title="Valor unitario editable. Se recalcula automáticamente al cambiar dimensiones."
                          />
                        </div>
                      ) : (
                        <div className="text-right">
                          <span className="font-medium">$ {formatearNumeroArgentino(p.valorVenta || 0)}</span>
                        </div>
                      )}
                      <div className="text-xs text-gray-500 mt-1 text-center">
                        {p.unidadMedida === "M2" && `(${p.alto || 0} × ${p.largo || 0} × ${p.cantidad || 1})`}
                        {p.unidadMedida === "ML" && `(${p.largo || 0} × ${p.cantidad || 1})`}
                        {p.unidadMedida === "UN" && `(${p.cantidad || 1})`}
                      </div>
                    </td>
                    <td className="p-2 text-center">
                      {editando ? (
                        <Input 
                          type="number" 
                          min={0} 
                          max="100" 
                          value={p.descuento} 
                          onChange={(e) => onActualizarProducto(p.id, "descuento", e.target.value)} 
                          className="w-20 mx-auto" 
                        />
                      ) : (
                        <span className="font-medium">{p.descuento || 0}%</span>
                      )}
                    </td>
                    <td className="p-2 text-right font-semibold">$ {formatearNumeroArgentino(sub)}</td>
                    {editando && (
                      <td className="p-2 text-center">
                        <Button 
                          variant="outline" 
                          onClick={() => onQuitarProducto(p.id)} 
                          size="sm"
                        >
                          Quitar
                        </Button>
                      </td>
                    )}
                  </tr>
                  {/* Fila adicional para descripción del producto */}
                  {editando && (
                    <tr className="border-b bg-gray-50">
                      <td colSpan={editando ? 9 : 8} className="p-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-gray-600 w-20">Descripción:</span>
                          <Textarea
                            placeholder="Escribe una descripción específica para este producto..."
                            value={p.descripcion || ""}
                            onChange={(e) => onActualizarProducto(p.id, "descripcion", e.target.value)}
                            className="flex-1 min-h-[60px] resize-none"
                            rows={2}
                          />
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
};

export default ProductosTabla;
