"use client";
import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Icon } from "@iconify/react";

const ObraInfoGeneral = ({ obra, formatearFecha }) => {
  if (!obra) return null;

  const getEstadoColor = (estado) => {
    const estados = {
      pendiente_inicio: "bg-yellow-100 text-yellow-800",
      en_progreso: "bg-blue-100 text-blue-800",
      completada: "bg-green-100 text-green-800",
      cancelada: "bg-red-100 text-red-800",
      Activo: "bg-green-100 text-green-800",
      Inactivo: "bg-gray-100 text-gray-800"
    };
    return estados[estado] || "bg-gray-100 text-gray-800";
  };

  const getPrioridadColor = (prioridad) => {
    const prioridades = {
      baja: "bg-gray-100 text-gray-800",
      media: "bg-yellow-100 text-yellow-800",
      alta: "bg-red-100 text-red-800"
    };
    return prioridades[prioridad] || "bg-gray-100 text-gray-800";
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon icon="heroicons:information-circle" className="w-5 h-5" />
          Información General
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-gray-500">Número de Pedido</p>
            <p className="font-medium">{obra.numeroPedido}</p>
          </div>
          
          <div>
            <p className="text-sm text-gray-500">Fecha</p>
            <p className="font-medium">{formatearFecha(obra.fecha)}</p>
          </div>
          
          <div>
            <p className="text-sm text-gray-500">Estado</p>
            <Badge className={getEstadoColor(obra.estado)}>
              {obra.estado}
            </Badge>
          </div>
          
          {obra.tipo === "obra" && (
            <>
              <div>
                <p className="text-sm text-gray-500">Tipo de Obra</p>
                <p className="font-medium">{obra.tipoObra || "No especificado"}</p>
              </div>
              
              <div>
                <p className="text-sm text-gray-500">Prioridad</p>
                <Badge className={getPrioridadColor(obra.prioridad)}>
                  {obra.prioridad || "No especificada"}
                </Badge>
              </div>
              
              <div>
                <p className="text-sm text-gray-500">Responsable</p>
                <p className="font-medium">{obra.responsable || "No asignado"}</p>
              </div>
            </>
          )}
        </div>

        {obra.tipo === "obra" && (obra.fechas || obra.ubicacion) && (
          <>
            <Separator />
            
            {obra.fechas && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Fecha de Inicio</p>
                  <p className="font-medium">{formatearFecha(obra.fechas.inicio)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Fecha de Finalización</p>
                  <p className="font-medium">{formatearFecha(obra.fechas.fin)}</p>
                </div>
              </div>
            )}
            
            {obra.ubicacion && (
              <div>
                <p className="text-sm text-gray-500">Ubicación</p>
                <div className="space-y-1">
                  {obra.ubicacion.direccion && (
                    <p className="font-medium">{obra.ubicacion.direccion}</p>
                  )}
                  <div className="flex gap-2 text-sm text-gray-600">
                    {obra.ubicacion.localidad && (
                      <span>{obra.ubicacion.localidad}</span>
                    )}
                    {obra.ubicacion.provincia && (
                      <>
                        {obra.ubicacion.localidad && <span>•</span>}
                        <span>{obra.ubicacion.provincia}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default ObraInfoGeneral;
