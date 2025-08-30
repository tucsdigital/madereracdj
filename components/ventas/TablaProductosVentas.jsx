"use client";
import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const TablaProductosVentas = ({
  titulo = "Productos seleccionados",
  items = [],
  editando = false,
  onQuitarProducto,
  onActualizarCampo,
  onActualizarNombreManual,
  formatearNumeroArgentino,
  showTotals = true,
  showDescripcionGeneral = false,
  descripcionGeneral = "",
  onDescripcionGeneralChange
}) => {
  if (items.length === 0) {
    return null;
  }

  // Calcular totales
  const subtotal = items.reduce((acc, p) => acc + Number(p.precio || 0), 0);
  const descuentoTotal = items.reduce((acc, p) => {
    const precio = Number(p.precio || 0);
    const descuento = Number(p.descuento || 0);
    return acc + (precio * descuento / 100);
  }, 0);
  const total = subtotal - descuentoTotal;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{titulo}</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="p-2 text-left">Producto</th>
                <th className="p-2 text-center">Cant.</th>
                <th className="p-2 text-center">Unidad</th>
                <th className="p-2 text-right">Precio Unit.</th>
                <th className="p-2 text-center">Desc. %</th>
                <th className="p-2 text-right">Subtotal</th>
                <th className="p-2 text-center">Acción</th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => {
                const sub = Number(p.precio || 0) * (1 - Number(p.descuento || 0) / 100);
                return (
                  <React.Fragment key={p.id}>
                    <tr className="border-b">
                      <td className="p-2">
                        <div className="font-medium">
                          {p._esManual ? (
                            <Input 
                              value={p.nombre || p.descripcion} 
                              onChange={(e) => onActualizarNombreManual && onActualizarNombreManual(p.id, e.target.value)} 
                              className="h-8" 
                            />
                          ) : (
                            p.nombre || p.descripcion
                          )}
                        </div>
                        <div className="text-xs text-gray-500">{p.categoria}</div>
                      </td>
                      <td className="p-2 text-center">
                        <Input 
                          type="number" 
                          min={1} 
                          value={p.cantidad} 
                          onChange={(e) => onActualizarCampo && onActualizarCampo(p.id, "cantidad", e.target.value)} 
                          className="w-20 mx-auto" 
                        />
                      </td>
                      <td className="p-2 text-center">
                        {p._esManual ? (
                          <Select value={p.unidad} onValueChange={(v) => onActualizarCampo && onActualizarCampo(p.id, "unidad", v)}>
                            <SelectTrigger className="w-24 mx-auto h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="UN">UN</SelectItem>
                              <SelectItem value="M2">M2</SelectItem>
                              <SelectItem value="ML">ML</SelectItem>
                              <SelectItem value="KG">KG</SelectItem>
                              <SelectItem value="L">L</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge variant="outline">{p.unidad}</Badge>
                        )}
                      </td>
                      <td className="p-2 text-right">
                        <div className="relative w-28 ml-auto">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-sm text-default-500">$</span>
                          <Input 
                            type="number" 
                            min={0} 
                            step="0.01" 
                            value={p.precio} 
                            onChange={(e) => onActualizarCampo && onActualizarCampo(p.id, "precio", e.target.value)} 
                            className="pl-5 pr-2 h-8 text-right" 
                            title="Precio unitario editable"
                          />
                        </div>
                      </td>
                      <td className="p-2 text-center">
                        <Input 
                          type="number" 
                          min={0} 
                          max={100} 
                          value={p.descuento || 0} 
                          onChange={(e) => onActualizarCampo && onActualizarCampo(p.id, "descuento", e.target.value)} 
                          className="w-20 mx-auto" 
                        />
                      </td>
                      <td className="p-2 text-right font-semibold">
                        $ {formatearNumeroArgentino ? formatearNumeroArgentino(sub) : sub.toLocaleString("es-AR")}
                      </td>
                      <td className="p-2 text-center">
                        <Button 
                          variant="outline" 
                          onClick={() => onQuitarProducto && onQuitarProducto(p.id)} 
                          size="sm"
                        >
                          Quitar
                        </Button>
                      </td>
                    </tr>
                    {/* Fila adicional para descripción del producto */}
                    <tr className="border-b bg-gray-50">
                      <td colSpan={7} className="p-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-gray-600 w-20">Descripción:</span>
                          <Textarea
                            placeholder="Escribe una descripción específica para este producto..."
                            value={p.descripcion || ""}
                            onChange={(e) => onActualizarCampo && onActualizarCampo(p.id, "descripcion", e.target.value)}
                            className="flex-1 min-h-[60px] resize-none"
                            rows={2}
                          />
                        </div>
                      </td>
                    </tr>
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Totales */}
      {showTotals && (
        <div className="flex justify-end">
          <div className="bg-primary/5 border border-primary/20 rounded-lg px-6 py-3 text-lg shadow-sm font-semibold flex gap-6">
            <div>
              Subtotal: <span className="font-bold">$ {formatearNumeroArgentino ? formatearNumeroArgentino(subtotal) : subtotal.toLocaleString("es-AR")}</span>
            </div>
            <div>
              Descuento: <span className="font-bold">$ {formatearNumeroArgentino ? formatearNumeroArgentino(descuentoTotal) : descuentoTotal.toLocaleString("es-AR")}</span>
            </div>
            <div>
              Total: <span className="font-bold text-primary">$ {formatearNumeroArgentino ? formatearNumeroArgentino(total) : total.toLocaleString("es-AR")}</span>
            </div>
          </div>
        </div>
      )}

      {/* Campo de descripción general */}
      {showDescripcionGeneral && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-lg">Descripción General</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              placeholder="Escribe una descripción general, notas importantes, etc..."
              value={descripcionGeneral}
              onChange={(e) => onDescripcionGeneralChange && onDescripcionGeneralChange(e.target.value)}
              className="min-h-[100px] resize-none"
              rows={4}
            />
          </CardContent>
        </Card>
      )}
    </>
  );
};

export default TablaProductosVentas;
