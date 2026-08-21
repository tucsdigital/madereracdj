"use client";
import React, { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
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
import { Icon } from "@iconify/react";
import {
  Search,
  Filter,
  Calendar,
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
              <SelectItem value="15dias">15 días</SelectItem>
              <SelectItem value="semana">Semana</SelectItem>
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
              <button
                type="button"
                className="inline-flex h-10 items-center rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={disabled}
              >
                <Filter className="mr-2 h-4 w-4" />
                Estado
                {filtros.estado && (
                  <Badge
                    variant="secondary"
                    className="ml-2 h-5 px-1.5 text-xs bg-blue-100 text-blue-700"
                  >
                    1
                  </Badge>
                )}
                <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
              </button>
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
              <button
                type="button"
                className="inline-flex h-10 items-center rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
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
                  />
                )}
                <ChevronDown className="w-4 h-4 ml-2 opacity-50" />
              </button>
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
              <button
                type="button"
                className="inline-flex h-10 items-center rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
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
                  />
                )}
                <ChevronDown className="w-4 h-4 ml-2 opacity-50" />
              </button>
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
              <button
                type="button"
                className="inline-flex h-10 items-center rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
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
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-4" align="start">
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-gray-700 mb-1 block">
                    Desde
                  </label>
                  <DateInput
                    value={filtros.fechaDesde || ""}
                    onChange={(v) =>
                      onFiltrosChange({
                        ...filtros,
                        fechaDesde: v,
                      })
                    }
                    buttonClassName="h-9 w-full justify-start bg-white border-gray-300"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700 mb-1 block">
                    Hasta
                  </label>
                  <DateInput
                    value={filtros.fechaHasta || ""}
                    min={filtros.fechaDesde || undefined}
                    onChange={(v) =>
                      onFiltrosChange({
                        ...filtros,
                        fechaHasta: v,
                      })
                    }
                    buttonClassName="h-9 w-full justify-start bg-white border-gray-300"
                  />
                </div>
              </div>
            </PopoverContent>
          </Popover>

          {filtrosActivos > 0 && (
            <button
              type="button"
              onClick={limpiarFiltros}
              className="inline-flex h-10 items-center rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={disabled}
            >
              <X className="w-4 h-4 mr-2" />
              Limpiar ({filtrosActivos})
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ObrasHeader;

