"use client";
import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Icon } from "@iconify/react";
import { Plus, Trash2 } from "lucide-react";

const ObraCobranza = ({ 
  movimientos, 
  onMovimientosChange, 
  editando, 
  formatearNumeroArgentino 
}) => {
  const [nuevoMovimiento, setNuevoMovimiento] = useState({
    fecha: "",
    tipo: "pago",
    metodo: "efectivo",
    monto: "",
    nota: ""
  });

  const handleAgregarMovimiento = () => {
    if (!nuevoMovimiento.fecha || !nuevoMovimiento.monto) return;
    
    const movimiento = {
      ...nuevoMovimiento,
      monto: Number(nuevoMovimiento.monto),
      id: Date.now()
    };
    
    onMovimientosChange([...movimientos, movimiento]);
    setNuevoMovimiento({
      fecha: "",
      tipo: "pago",
      metodo: "efectivo",
      monto: "",
      nota: ""
    });
  };

  const handleEliminarMovimiento = (id) => {
    onMovimientosChange(movimientos.filter(m => m.id !== id));
  };

  const totalCobrado = movimientos.reduce((acc, m) => acc + Number(m.monto || 0), 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon icon="heroicons:banknotes" className="w-5 h-5" />
          Cobranza y Movimientos
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="p-3 bg-blue-50 rounded-lg">
          <p className="text-sm text-blue-800">
            <strong>Total Cobrado:</strong> {formatearNumeroArgentino(totalCobrado)}
          </p>
        </div>

        {editando && (
          <div className="grid grid-cols-1 md:grid-cols-5 gap-2 items-end">
            <Input
              type="date"
              value={nuevoMovimiento.fecha}
              onChange={(e) => setNuevoMovimiento(prev => ({ ...prev, fecha: e.target.value }))}
              placeholder="Fecha"
            />
            
            <Select
              value={nuevoMovimiento.tipo}
              onValueChange={(value) => setNuevoMovimiento(prev => ({ ...prev, tipo: value }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pago">Pago</SelectItem>
                <SelectItem value="seña">Seña</SelectItem>
                <SelectItem value="anticipo">Anticipo</SelectItem>
              </SelectContent>
            </Select>
            
            <Select
              value={nuevoMovimiento.metodo}
              onValueChange={(value) => setNuevoMovimiento(prev => ({ ...prev, metodo: value }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="efectivo">Efectivo</SelectItem>
                <SelectItem value="transferencia">Transferencia</SelectItem>
                <SelectItem value="cheque">Cheque</SelectItem>
                <SelectItem value="tarjeta">Tarjeta</SelectItem>
              </SelectContent>
            </Select>
            
            <Input
              type="number"
              value={nuevoMovimiento.monto}
              onChange={(e) => setNuevoMovimiento(prev => ({ ...prev, monto: e.target.value }))}
              placeholder="Monto"
            />
            
            <Button
              onClick={handleAgregarMovimiento}
              disabled={!nuevoMovimiento.fecha || !nuevoMovimiento.monto}
              className="flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Agregar
            </Button>
          </div>
        )}

        {movimientos.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="p-2 text-left">Fecha</th>
                  <th className="p-2 text-center">Tipo</th>
                  <th className="p-2 text-center">Método</th>
                  <th className="p-2 text-right">Monto</th>
                  <th className="p-2 text-left">Nota</th>
                  {editando && <th className="p-2 text-center">Acción</th>}
                </tr>
              </thead>
              <tbody>
                {movimientos.map((movimiento) => (
                  <tr key={movimiento.id} className="border-b">
                    <td className="p-2">{movimiento.fecha}</td>
                    <td className="p-2 text-center">
                      <span className={`px-2 py-1 rounded-full text-xs ${
                        movimiento.tipo === 'seña' ? 'bg-yellow-100 text-yellow-800' :
                        movimiento.tipo === 'pago' ? 'bg-green-100 text-green-800' :
                        'bg-blue-100 text-blue-800'
                      }`}>
                        {movimiento.tipo}
                      </span>
                    </td>
                    <td className="p-2 text-center">{movimiento.metodo}</td>
                    <td className="p-2 text-right font-medium">
                      {formatearNumeroArgentino(movimiento.monto)}
                    </td>
                    <td className="p-2">{movimiento.nota}</td>
                    {editando && (
                      <td className="p-2 text-center">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEliminarMovimiento(movimiento.id)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ObraCobranza;
