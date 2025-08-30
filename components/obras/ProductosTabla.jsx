"use client";
import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Icon } from "@iconify/react";
import { Trash2, Plus, Minus } from "lucide-react";

const ProductosTabla = ({
  titulo = "Productos Seleccionados",
  items = [],
  editando = false,
  onQuitarProducto,
  onActualizarProducto,
  onIncrementarCantidad,
  onDecrementarCantidad,
  formatearNumeroArgentino
}) => {
  if (items.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon icon="heroicons:clipboard-document-list" className="w-5 h-5" />
          {titulo}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="p-2 text-left">Producto</th>
                <th className="p-2 text-center">Cantidad</th>
                <th className="p-2 text-center">Alto</th>
                <th className="p-2 text-center">Ancho</th>
                <th className="p-2 text-center">Largo</th>
                <th className="p-2 text-center">Precio por Pie</th>
                <th className="p-2 text-center">Cepillado</th>
                <th className="p-2 text-right">Precio</th>
                <th className="p-2 text-center">Desc. %</th>
                <th className="p-2 text-right">Subtotal</th>
                {editando && <th className="p-2 text-center">Acción</th>}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const esMadera = String(item.categoria || "").toLowerCase() === "maderas";
                const isMachDeck = esMadera && (item.subcategoria === "machimbre" || item.subcategoria === "deck");
                const base = isMachDeck ? Number(item.precio) || 0 : (Number(item.precio) || 0) * (Number(item.cantidad) || 0);
                const subtotal = Math.round(base * (1 - Number(item.descuento || 0) / 100));
                
                return (
                  <tr key={item.id} className="border-b">
                    <td className="p-2">
                      <div className="font-medium">{item.nombre}</div>
                      <div className="text-xs text-gray-500">{item.categoria}</div>
                      {item.tipoMadera && (
                        <div className="text-xs text-orange-600">🌲 {item.tipoMadera}</div>
                      )}
                      {item.subCategoria && (
                        <div className="text-xs text-blue-600">🔧 {item.subCategoria}</div>
                      )}
                    </td>
                    <td className="p-2 text-center">
                      {editando ? (
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onDecrementarCantidad(item.id)}
                            disabled={Number(item.cantidad) <= 1}
                          >
                            <Minus className="w-3 h-3" />
                          </Button>
                          <Input
                            type="number"
                            min={1}
                            value={item.cantidad}
                            onChange={(e) => onActualizarProducto(item.id, "cantidad", e.target.value)}
                            className="w-16 mx-auto text-center"
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onIncrementarCantidad(item.id)}
                          >
                            <Plus className="w-3 h-3" />
                          </Button>
                        </div>
                      ) : (
                        item.cantidad
                      )}
                    </td>
                    <td className="p-2 text-center">
                      {esMadera && editando ? (
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          value={item.alto}
                          onChange={(e) => onActualizarProducto(item.id, "alto", e.target.value)}
                          className="w-20 mx-auto"
                        />
                      ) : esMadera ? (
                        item.alto
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="p-2 text-center">
                      {esMadera && editando ? (
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          value={item.ancho}
                          onChange={(e) => onActualizarProducto(item.id, "ancho", e.target.value)}
                          className="w-20 mx-auto"
                        />
                      ) : esMadera ? (
                        item.ancho
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="p-2 text-center">
                      {esMadera && editando ? (
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          value={item.largo}
                          onChange={(e) => onActualizarProducto(item.id, "largo", e.target.value)}
                          className="w-20 mx-auto"
                        />
                      ) : esMadera ? (
                        item.largo
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="p-2 text-center">
                      {esMadera && editando ? (
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          value={item.precioPorPie}
                          onChange={(e) => onActualizarProducto(item.id, "precioPorPie", e.target.value)}
                          className="w-24 mx-auto"
                        />
                      ) : esMadera ? (
                        formatearNumeroArgentino(item.precioPorPie)
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="p-2 text-center">
                      {esMadera && editando ? (
                        <Button
                          variant={item.cepilladoAplicado ? "default" : "outline"}
                          size="sm"
                          onClick={() => onActualizarProducto(item.id, "cepilladoAplicado", !item.cepilladoAplicado)}
                        >
                          {item.cepilladoAplicado ? "Sí" : "No"}
                        </Button>
                      ) : esMadera ? (
                        <Badge variant={item.cepilladoAplicado ? "default" : "secondary"}>
                          {item.cepilladoAplicado ? "Sí" : "No"}
                        </Badge>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="p-2 text-right font-medium">
                      {formatearNumeroArgentino(item.precio)}
                    </td>
                    <td className="p-2 text-center">
                      {editando ? (
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          value={item.descuento}
                          onChange={(e) => onActualizarProducto(item.id, "descuento", e.target.value)}
                          className="w-20 mx-auto"
                        />
                      ) : (
                        `${item.descuento || 0}%`
                      )}
                    </td>
                    <td className="p-2 text-right font-semibold">
                      {formatearNumeroArgentino(subtotal)}
                    </td>
                    {editando && (
                      <td className="p-2 text-center">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onQuitarProducto(item.id)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
};

export default ProductosTabla;
