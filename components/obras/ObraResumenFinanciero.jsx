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
    <Card className="border-0 shadow-sm bg-gradient-to-br from-slate-50 to-white">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-700">
          <Icon icon="heroicons:currency-dollar" className="w-4 h-4 text-emerald-600" />
          Resumen Financiero
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-3">
          {/* Total Principal */}
          <div className="text-center p-3 bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-xl border border-emerald-200">
            <p className="text-xs text-emerald-700 mb-1 font-medium">Total</p>
            <p className="text-sm font-bold text-emerald-800">
              {formatearNumeroArgentino(total)}
            </p>
          </div>
          
          {obra.tipo === "presupuesto" && (
            <>
              <div className="text-center p-3 bg-slate-50 rounded-xl border border-slate-200">
                <p className="text-xs text-slate-600 mb-1 font-medium">Subtotal</p>
                <p className="text-sm font-semibold text-slate-800">
                  {formatearNumeroArgentino(obra.subtotal || 0)}
                </p>
              </div>
              
              <div className="text-center p-3 bg-red-50 rounded-xl border border-red-200">
                <p className="text-xs text-red-700 mb-1 font-medium">Descuento</p>
                <p className="text-sm font-semibold text-red-800">
                  {formatearNumeroArgentino(obra.descuentoTotal || 0)}
                </p>
              </div>
            </>
          )}
          
          {obra.tipo === "obra" && (
            <>
              <div className="text-center p-3 bg-blue-50 rounded-xl border border-blue-200">
                <p className="text-xs text-blue-700 mb-1 font-medium">Modo de Cálculo</p>
                <Badge 
                  variant={modoCosto === "presupuesto" ? "default" : "secondary"}
                  className="text-xs px-2 py-1 h-6"
                >
                  {modoCosto === "presupuesto" ? "Presupuesto" : "Gasto Real"}
                </Badge>
              </div>
              
              <div className="text-center p-3 bg-amber-50 rounded-xl border border-amber-200">
                <p className="text-xs text-amber-700 mb-1 font-medium">Gasto Manual</p>
                <p className="text-sm font-semibold text-amber-800">
                  {formatearNumeroArgentino(obra.gastoObraManual || 0)}
                </p>
              </div>
            </>
          )}
        </div>
        
        {obra.tipo === "obra" && presupuesto && (
          <div className="mt-3 p-2.5 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200">
            <p className="text-xs text-blue-800 font-medium">
              <span className="font-semibold">Presupuesto Inicial:</span> {presupuesto.numeroPedido} - 
              {formatearNumeroArgentino(presupuesto.total || 0)}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ObraResumenFinanciero;
