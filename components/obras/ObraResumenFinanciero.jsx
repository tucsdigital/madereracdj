"use client";
import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@iconify/react";

const ObraResumenFinanciero = ({ 
  obra, 
  presupuesto, 
  modoCosto, 
  formatearNumeroArgentino 
}) => {
  if (!obra) return null;

  const calcularTotal = () => {
    if (obra.tipo === "presupuesto") {
      return obra.total || 0;
    }
    
    if (modoCosto === "presupuesto" && presupuesto) {
      return presupuesto.total || 0;
    }
    
    // Modo gasto
    const materialesTotal = Array.isArray(obra.materialesCatalogo) 
      ? obra.materialesCatalogo.reduce((acc, item) => {
          const esMadera = String(item.categoria || "").toLowerCase() === "maderas";
          const isMachDeck = esMadera && (item.subcategoria === "machimbre" || item.subcategoria === "deck");
          const base = isMachDeck ? (Number(item.precio) || 0) : (Number(item.precio) || 0) * (Number(item.cantidad) || 0);
          const descuento = Number(item.descuento) || 0;
          return acc + Math.round(base * (1 - descuento / 100));
        }, 0)
      : 0;
    
    return materialesTotal + (Number(obra.gastoObraManual) || 0);
  };

  const total = calcularTotal();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon icon="heroicons:currency-dollar" className="w-5 h-5" />
          Resumen Financiero
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="text-center">
            <p className="text-sm text-gray-500 mb-1">Total</p>
            <p className="text-2xl font-bold text-green-600">
              {formatearNumeroArgentino(total)}
            </p>
          </div>
          
          {obra.tipo === "presupuesto" && (
            <>
              <div className="text-center">
                <p className="text-sm text-gray-500 mb-1">Subtotal</p>
                <p className="text-lg font-semibold">
                  {formatearNumeroArgentino(obra.subtotal || 0)}
                </p>
              </div>
              
              <div className="text-center">
                <p className="text-sm text-gray-500 mb-1">Descuento</p>
                <p className="text-lg font-semibold text-red-600">
                  {formatearNumeroArgentino(obra.descuentoTotal || 0)}
                </p>
              </div>
            </>
          )}
          
          {obra.tipo === "obra" && (
            <>
              <div className="text-center">
                <p className="text-sm text-gray-500 mb-1">Modo de Cálculo</p>
                <Badge variant={modoCosto === "presupuesto" ? "default" : "secondary"}>
                  {modoCosto === "presupuesto" ? "Presupuesto" : "Gasto Real"}
                </Badge>
              </div>
              
              <div className="text-center">
                <p className="text-sm text-gray-500 mb-1">Gasto Manual</p>
                <p className="text-lg font-semibold">
                  {formatearNumeroArgentino(obra.gastoObraManual || 0)}
                </p>
              </div>
            </>
          )}
        </div>
        
        {obra.tipo === "obra" && presupuesto && (
          <div className="mt-4 p-3 bg-blue-50 rounded-lg">
            <p className="text-sm text-blue-800">
              <strong>Presupuesto Inicial:</strong> {presupuesto.numeroPedido} - 
              {formatearNumeroArgentino(presupuesto.total || 0)}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ObraResumenFinanciero;
