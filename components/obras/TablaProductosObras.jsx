"use client";
import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const TablaProductosObras = ({
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
  const subtotal = items.reduce((acc, p) => {
    const precio = Number(p.valorVenta || p.precio || 0);
    const cantidad = Number(p.cantidad || 1);
    return acc + (precio * cantidad);
  }, 0);
  const descuentoTotal = items.reduce((acc, p) => {
    const precio = Number(p.valorVenta || p.precio || 0);
    const cantidad = Number(p.cantidad || 1);
    const descuento = Number(p.descuento || 0);
    return acc + (precio * cantidad * descuento / 100);
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
                <th className="p-2 text-center">Acción</th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => {
                const precio = Number(p.valorVenta || p.precio || 0);
                const cantidad = Number(p.cantidad || 1);
                const descuento = Number(p.descuento || 0);
                const sub = precio * cantidad * (1 - descuento / 100);
                const u = String(p.unidadMedida || "UN").toUpperCase();
                const requiereAlto = u === "M2"; // Para m2 pedimos alto y largo. Para ml solo largo.
                const requiereLargo = u === "M2" || u === "ML";
                return (
                  <React.Fragment key={p.id}>
                    <tr className="border-b">
                      <td className="p-2">
                        <div className="font-medium">
                          {p._esManual ? (
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
                            onChange={(e) => onActualizarCampo && onActualizarCampo(p.id, "cantidad", e.target.value)} 
                            className="w-20 mx-auto" 
                          />
                        ) : (
                          <span className="text-sm font-medium">{p.cantidad}</span>
                        )}
                      </td>
                      <td className="p-2 text-center">
                        {editando && p._esManual ? (
                          <Select value={u} onValueChange={(v) => onActualizarCampo && onActualizarCampo(p.id, "unidadMedida", v)}>
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
                              onChange={(e) => onActualizarCampo && onActualizarCampo(p.id, "alto", e.target.value)} 
                              className="w-24 mx-auto" 
                            />
                          ) : (
                            <span className="text-sm font-medium">{p.alto || 0}</span>
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
                              onChange={(e) => onActualizarCampo && onActualizarCampo(p.id, "largo", e.target.value)} 
                              className="w-24 mx-auto" 
                            />
                          ) : (
                            <span className="text-sm font-medium">{p.largo || 0}</span>
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
                              onChange={(e) => onActualizarCampo && onActualizarCampo(p.id, "valorVenta", e.target.value)} 
                              className="pl-5 pr-2 h-8 text-right" 
                              title="Valor unitario editable. Se recalcula automáticamente al cambiar dimensiones."
                            />
                          </div>
                        ) : (
                          <div className="text-right">
                            <span className="text-sm font-semibold">${formatearNumeroArgentino ? formatearNumeroArgentino(p.valorVenta) : p.valorVenta.toLocaleString("es-AR")}</span>
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
                            max={100} 
                            value={p.descuento} 
                            onChange={(e) => onActualizarCampo && onActualizarCampo(p.id, "descuento", e.target.value)} 
                            className="w-20 mx-auto" 
                          />
                        ) : (
                          <span className="text-sm font-medium">{p.descuento || 0}%</span>
                        )}
                      </td>
                      <td className="p-2 text-right font-semibold">
                        {formatearNumeroArgentino ? formatearNumeroArgentino(sub) : sub.toLocaleString("es-AR")}
                      </td>
                      <td className="p-2 text-center">
                        {editando && (
                          <Button 
                            variant="outline" 
                            onClick={() => onQuitarProducto && onQuitarProducto(p.id)} 
                            size="sm"
                          >
                            Quitar
                          </Button>
                        )}
                      </td>
                    </tr>
                    {/* Fila adicional para descripción del producto */}
                    <tr className="border-b bg-gray-50">
                      <td colSpan={9} className="p-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-gray-600 w-20">Descripción:</span>
                          {editando ? (
                            <Textarea
                              placeholder="Escribe una descripción específica para este producto..."
                              value={p.descripcion || ""}
                              onChange={(e) => onActualizarCampo && onActualizarCampo(p.id, "descripcion", e.target.value)}
                              className="flex-1 min-h-[60px] resize-none"
                              rows={2}
                            />
                          ) : (
                            <div className="flex-1 min-h-[60px] text-sm text-gray-700">
                              {p.descripcion || "Sin descripción"}
                            </div>
                          )}
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
              Subtotal: <span className="font-bold">{formatearNumeroArgentino ? formatearNumeroArgentino(subtotal) : subtotal.toLocaleString("es-AR")}</span>
            </div>
            <div>
              Descuento: <span className="font-bold">{formatearNumeroArgentino ? formatearNumeroArgentino(descuentoTotal) : descuentoTotal.toLocaleString("es-AR")}</span>
            </div>
            <div>
              Total: <span className="font-bold text-primary">{formatearNumeroArgentino ? formatearNumeroArgentino(total) : total.toLocaleString("es-AR")}</span>
            </div>
          </div>
        </div>
      )}

      {/* Campo de descripción general del presupuesto */}
      {showDescripcionGeneral && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-lg">Descripción General del Presupuesto</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              placeholder="Escribe una descripción general del presupuesto, especificaciones técnicas, notas importantes, etc..."
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

export default TablaProductosObras;
