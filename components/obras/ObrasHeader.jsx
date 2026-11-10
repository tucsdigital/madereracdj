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
    <div>
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Buscar obras, presupuestos, clientes, direcciones..."
            value={busquedaGlobal}
            onChange={(e) => onBusquedaGlobalChange(e.target.value)}
            className="h-11 rounded-none border-0 border-b border-slate-300 bg-transparent pl-7 shadow-none focus-visible:border-slate-900 focus-visible:ring-0"
            disabled={disabled}
          />
        </div>

        <div className="flex items-center gap-2 text-slate-500">
          <Calendar className="h-4 w-4" />
          <Select
            value={vistaCalendario}
            onValueChange={onVistaCalendarioChange}
            disabled={disabled}
          >
            <SelectTrigger className="h-10 w-[140px] border-0 bg-transparent shadow-none">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="lista">Lista diaria</SelectItem>
              <SelectItem value="semana">Semana</SelectItem>
              <SelectItem value="mes">Mes</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Popover
            open={filtrosAbiertos.estado}
            onOpenChange={(open) =>
              setFiltrosAbiertos((prev) => ({ ...prev, estado: open }))
            }
          >
            <PopoverTrigger asChild>
              <button
                type="button"
                className="inline-flex h-9 items-center rounded-full bg-slate-100 px-3 text-sm text-slate-700 transition-colors hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={disabled}
              >
                <Filter className="mr-2 h-4 w-4" />
                Estado
                {filtros.estado && (
                  <Badge
                    variant="secondary"
                    className="ml-2 h-5 px-1.5 text-xs bg-white text-slate-700"
                  >
                    1
                  </Badge>
                )}
                <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-64 rounded-xl border-slate-200 p-0 shadow-lg" align="start">
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

          {false && <>
          <Popover
            open={filtrosAbiertos.cliente}
            onOpenChange={(open) =>
              setFiltrosAbiertos((prev) => ({ ...prev, cliente: open }))
            }
          >
            <PopoverTrigger asChild>
              <button
                type="button"
                className="inline-flex h-9 items-center rounded-full bg-slate-100 px-3 text-sm text-slate-700 transition-colors hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
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
                className="inline-flex h-9 items-center rounded-full bg-slate-100 px-3 text-sm text-slate-700 transition-colors hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
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
          </>}

          <Popover
            open={filtrosAbiertos.fecha}
            onOpenChange={(open) =>
              setFiltrosAbiertos((prev) => ({ ...prev, fecha: open }))
            }
          >
            <PopoverTrigger asChild>
              <button
                type="button"
                className="inline-flex h-9 items-center rounded-full bg-slate-100 px-3 text-sm text-slate-700 transition-colors hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
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
            <PopoverContent className="w-80 rounded-xl border-slate-200 p-4 shadow-lg" align="start">
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
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
                    buttonClassName="h-9 w-full justify-start border-slate-200 bg-white"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
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
                    buttonClassName="h-9 w-full justify-start border-slate-200 bg-white"
                  />
                </div>
              </div>
            </PopoverContent>
          </Popover>

          {filtrosActivos > 0 && (
            <button
              type="button"
              onClick={limpiarFiltros}
              className="inline-flex h-9 items-center rounded-full px-3 text-sm text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
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

