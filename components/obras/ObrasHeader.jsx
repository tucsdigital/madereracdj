"use client";
import React, { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Icon } from "@iconify/react";
import {
  Search,
  Filter,
  Calendar,
  CalendarDays,
  X,
  ChevronDown,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

const estadosObra = [
  { value: "", label: "Todos los estados" },
  { value: "pendiente_inicio", label: "Pendiente de Inicio" },
  { value: "en_ejecucion", label: "En Ejecución" },
  { value: "pausada", label: "Pausada" },
  { value: "completada", label: "Completada" },
  { value: "cancelada", label: "Cancelada" },
];

const estadosPago = [
  { value: "", label: "Todos" },
  { value: "pagado", label: "Pagado" },
  { value: "parcial", label: "Pago Parcial" },
  { value: "pendiente", label: "Pendiente" },
];

const ObrasHeader = ({
  onNuevaObra,
  onNuevoPresupuesto,
  vistaCalendario,
  onVistaCalendarioChange,
  busquedaGlobal,
  onBusquedaGlobalChange,
  filtros,
  onFiltrosChange,
  clientes = [],
  disabled = false,
}) => {
  const [filtrosAbiertos, setFiltrosAbiertos] = useState({
    estado: false,
    cliente: false,
    estadoPago: false,
    fecha: false,
  });

  // Contar filtros activos
  const filtrosActivos = useMemo(() => {
    let count = 0;
    if (filtros.estado) count++;
    if (filtros.cliente) count++;
    if (filtros.estadoPago) count++;
    if (filtros.fechaDesde || filtros.fechaHasta) count++;
    return count;
  }, [filtros]);

  const limpiarFiltros = () => {
    onFiltrosChange({
      estado: "",
      cliente: "",
      estadoPago: "",
      fechaDesde: "",
      fechaHasta: "",
    });
  };

  const clienteSeleccionado = useMemo(() => {
    if (!filtros.cliente) return null;
    return clientes.find((c) => c.id === filtros.cliente);
  }, [filtros.cliente, clientes]);

  return (
    <div className="px-2">
      <div className="mb-6">
          <Card className="rounded-xl shadow-lg border border-default-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <Icon icon="heroicons:briefcase" className="w-5 h-5" />
                Gestión de Obras y Presupuestos
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <p className="text-base text-default-600">
                  Administra y da seguimiento a todas las obras y presupuestos
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="default"
                    className="flex items-center justify-center gap-2 px-6 py-2.5 text-sm font-semibold rounded-xl shadow-lg bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 transition-all duration-300"
                    onClick={onNuevoPresupuesto}
                    disabled={disabled}
                  >
                    <Icon icon="heroicons:document-plus" className="w-4 h-4" />
                    <span className="hidden sm:inline">Nuevo Presupuesto</span>
                    <span className="sm:hidden">Presupuesto</span>
                  </Button>
                  <Button
                    variant="default"
                    className="flex items-center justify-center gap-2 px-6 py-2.5 text-sm font-semibold rounded-xl shadow-lg bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 transition-all duration-300"
                    onClick={onNuevaObra}
                    disabled={disabled}
                  >
                    <Icon icon="heroicons:building-office" className="w-4 h-4" />
                    <span className="hidden sm:inline">Nueva Obra</span>
                    <span className="sm:hidden">Obra</span>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col lg:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Buscar obras, presupuestos, clientes, direcciones..."
              value={busquedaGlobal}
              onChange={(e) => onBusquedaGlobalChange(e.target.value)}
              className="pl-10 pr-4 h-10 bg-white border-gray-300 focus:border-blue-500 focus:ring-blue-500"
              disabled={disabled}
            />
          </div>

          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-gray-500" />
            <Select
              value={vistaCalendario}
              onValueChange={onVistaCalendarioChange}
              disabled={disabled}
            >
              <SelectTrigger className="w-[140px] h-10 bg-white border-gray-300">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="semana">Semana</SelectItem>
                <SelectItem value="mes">Mes</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Popover
              open={filtrosAbiertos.estado}
              onOpenChange={(open) =>
                setFiltrosAbiertos((prev) => ({ ...prev, estado: open }))
              }
            >
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-10 px-3 bg-white border-gray-300 text-gray-700 hover:bg-gray-50"
                  disabled={disabled}
                >
                  <Filter className="w-4 h-4 mr-2" />
                  Estado
                  {filtros.estado && (
                    <Badge
                      variant="secondary"
                      className="ml-2 h-5 px-1.5 text-xs bg-blue-100 text-blue-700"
                    >
                      1
                    </Badge>
                  )}
                  <ChevronDown className="w-4 h-4 ml-2 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-0" align="start">
                <div className="p-2">
                  <Select
                    value={filtros.estado || ""}
                    onValueChange={(value) =>
                      onFiltrosChange({ ...filtros, estado: value })
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Seleccionar estado" />
                    </SelectTrigger>
                    <SelectContent>
                      {estadosObra.map((estado) => (
                        <SelectItem key={estado.value} value={estado.value}>
                          {estado.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </PopoverContent>
            </Popover>

            <Popover
              open={filtrosAbiertos.cliente}
              onOpenChange={(open) =>
                setFiltrosAbiertos((prev) => ({ ...prev, cliente: open }))
              }
            >
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-10 px-3 bg-white border-gray-300 text-gray-700 hover:bg-gray-50"
                  disabled={disabled}
                >
                  <Icon
                    icon="heroicons:user"
                    className="w-4 h-4 mr-2"
                  />
                  Cliente
                  {filtros.cliente && (
                    <Badge
                      variant="secondary"
                      className="ml-2 h-5 px-1.5 text-xs bg-blue-100 text-blue-700"
                    >
                      1
                    </Badge>
                  )}
                  <ChevronDown className="w-4 h-4 ml-2 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-0" align="start">
                <div className="p-2">
                  <Select
                    value={filtros.cliente || ""}
                    onValueChange={(value) =>
                      onFiltrosChange({ ...filtros, cliente: value })
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Seleccionar cliente" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Todos los clientes</SelectItem>
                      {clientes.map((cliente) => (
                        <SelectItem key={cliente.id} value={cliente.id}>
                          {cliente.nombre || "Sin nombre"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </PopoverContent>
            </Popover>

            <Popover
              open={filtrosAbiertos.estadoPago}
              onOpenChange={(open) =>
                setFiltrosAbiertos((prev) => ({ ...prev, estadoPago: open }))
              }
            >
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-10 px-3 bg-white border-gray-300 text-gray-700 hover:bg-gray-50"
                  disabled={disabled}
                >
                  <Icon
                    icon="heroicons:currency-dollar"
                    className="w-4 h-4 mr-2"
                  />
                  Pago
                  {filtros.estadoPago && (
                    <Badge
                      variant="secondary"
                      className="ml-2 h-5 px-1.5 text-xs bg-blue-100 text-blue-700"
                    >
                      1
                    </Badge>
                  )}
                  <ChevronDown className="w-4 h-4 ml-2 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-0" align="start">
                <div className="p-2">
                  <Select
                    value={filtros.estadoPago || ""}
                    onValueChange={(value) =>
                      onFiltrosChange({ ...filtros, estadoPago: value })
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Seleccionar estado de pago" />
                    </SelectTrigger>
                    <SelectContent>
                      {estadosPago.map((estado) => (
                        <SelectItem key={estado.value} value={estado.value}>
                          {estado.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </PopoverContent>
            </Popover>

            <Popover
              open={filtrosAbiertos.fecha}
              onOpenChange={(open) =>
                setFiltrosAbiertos((prev) => ({ ...prev, fecha: open }))
              }
            >
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-10 px-3 bg-white border-gray-300 text-gray-700 hover:bg-gray-50"
                  disabled={disabled}
                >
                  <Calendar className="w-4 h-4 mr-2" />
                  Fechas
                  {(filtros.fechaDesde || filtros.fechaHasta) && (
                    <Badge
                      variant="secondary"
                      className="ml-2 h-5 px-1.5 text-xs bg-blue-100 text-blue-700"
                    >
                      1
                    </Badge>
                  )}
                  <ChevronDown className="w-4 h-4 ml-2 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-4" align="start">
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-medium text-gray-700 mb-1 block">
                      Desde
                    </label>
                    <Input
                      type="date"
                      value={filtros.fechaDesde || ""}
                      onChange={(e) =>
                        onFiltrosChange({
                          ...filtros,
                          fechaDesde: e.target.value,
                        })
                      }
                      className="h-9"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-700 mb-1 block">
                      Hasta
                    </label>
                    <Input
                      type="date"
                      value={filtros.fechaHasta || ""}
                      onChange={(e) =>
                        onFiltrosChange({
                          ...filtros,
                          fechaHasta: e.target.value,
                        })
                      }
                      className="h-9"
                    />
                  </div>
                </div>
              </PopoverContent>
            </Popover>

            {filtrosActivos > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={limpiarFiltros}
                className="h-10 px-3 bg-white border-gray-300 text-gray-700 hover:bg-gray-50"
                disabled={disabled}
              >
                <X className="w-4 h-4 mr-2" />
                Limpiar ({filtrosActivos})
              </Button>
            )}
          </div>
        </div>
    </div>
  );
};

export default ObrasHeader;

