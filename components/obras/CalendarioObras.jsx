"use client";
import React, { useMemo, useCallback, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Icon } from "@iconify/react";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Building,
  FileText,
  X,
  Eye,
} from "lucide-react";
import { formatearNumeroArgentino, formatearFecha } from "@/lib/obra-utils";

// Colores según estado de obra
const coloresEstado = {
  pendiente_inicio: {
    bg: "bg-yellow-50",
    border: "border-yellow-300",
    text: "text-yellow-800",
    badge: "bg-yellow-100 text-yellow-800 border-yellow-200",
  },
  en_ejecucion: {
    bg: "bg-blue-50",
    border: "border-blue-300",
    text: "text-blue-800",
    badge: "bg-blue-100 text-blue-800 border-blue-200",
  },
  pausada: {
    bg: "bg-gray-50",
    border: "border-gray-300",
    text: "text-gray-800",
    badge: "bg-gray-100 text-gray-800 border-gray-200",
  },
  completada: {
    bg: "bg-green-50",
    border: "border-green-300",
    text: "text-green-800",
    badge: "bg-green-100 text-green-800 border-green-200",
  },
  cancelada: {
    bg: "bg-red-50",
    border: "border-red-300",
    text: "text-red-800",
    badge: "bg-red-100 text-red-800 border-red-200",
  },
};

const CalendarioObras = ({
  obras = [],
  notas = [],
  vista = "semana", // "semana" | "mes"
  fechaInicio,
  onFechaInicioChange,
  onObraClick,
  onNotaClick,
  onAgregarNota,
  loadingNotas = false,
  deletingNota = null,
  onEditNota,
  onDeleteNota,
}) => {
  // Estado para el modal del día
  const [diaSeleccionado, setDiaSeleccionado] = useState(null);
  const [showModalDia, setShowModalDia] = useState(false);

  // Límites de items a mostrar
  const MAX_OBRAS_VISIBLES = 3;
  const MAX_NOTAS_VISIBLES = 2;
  // Obtener días de la semana
  const getWeekDays = useCallback(() => {
    if (!fechaInicio) return [];
    const days = [];
    const weekStart = new Date(fechaInicio);
    for (let i = 0; i < 7; i++) {
      const day = new Date(weekStart);
      day.setDate(weekStart.getDate() + i);
      days.push(day);
    }
    return days;
  }, [fechaInicio]);

  // Obtener días del mes
  const getMonthDays = useCallback(() => {
    if (!fechaInicio) return [];
    const year = fechaInicio.getFullYear();
    const month = fechaInicio.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();
    // Ajustar para que lunes sea el primer día (0 = domingo, 1 = lunes)
    const adjustedStartingDay = startingDayOfWeek === 0 ? 6 : startingDayOfWeek - 1;

    const days = [];
    // Días del mes anterior (para completar la primera semana)
    for (let i = adjustedStartingDay - 1; i >= 0; i--) {
      const day = new Date(year, month, -i);
      days.push({ date: day, isCurrentMonth: false });
    }
    // Días del mes actual
    for (let i = 1; i <= daysInMonth; i++) {
      const day = new Date(year, month, i);
      days.push({ date: day, isCurrentMonth: true });
    }
    // Días del mes siguiente (para completar la última semana)
    const remainingDays = 42 - days.length; // 6 semanas * 7 días
    for (let i = 1; i <= remainingDays; i++) {
      const day = new Date(year, month + 1, i);
      days.push({ date: day, isCurrentMonth: false });
    }
    return days;
  }, [fechaInicio]);

  // Formatear fecha como clave (YYYY-MM-DD)
  const formatDateKey = useCallback((date) => {
    if (!date) return "";
    const d = new Date(date);
    return d.toISOString().split("T")[0];
  }, []);

  // Verificar si una fecha coincide con la fecha de inicio de una obra
  // Solo mostrar obras en su fecha de inicio, no en cascada
  const obraEnFecha = useCallback((obra, dateKey) => {
    if (!obra.fechas) return false;
    const fechaInicio = obra.fechas.inicio || "";
    // Solo mostrar la obra en su fecha de inicio exacta
    return dateKey === fechaInicio;
  }, []);

  // Obtener obras para una fecha específica
  const getObrasForDate = useCallback(
    (dateKey) => {
      return obras.filter((obra) => obraEnFecha(obra, dateKey));
    },
    [obras, obraEnFecha]
  );

  // Obtener notas para una fecha específica
  const getNotasForDate = useCallback(
    (dateKey) => {
      return notas.filter((nota) => nota.fecha === dateKey);
    },
    [notas]
  );

  // Navegación
  const goToPrevious = () => {
    if (!fechaInicio) return;
    const newDate = new Date(fechaInicio);
    if (vista === "semana") {
      newDate.setDate(newDate.getDate() - 7);
    } else {
      newDate.setMonth(newDate.getMonth() - 1);
    }
    onFechaInicioChange(newDate);
  };

  const goToNext = () => {
    if (!fechaInicio) return;
    const newDate = new Date(fechaInicio);
    if (vista === "semana") {
      newDate.setDate(newDate.getDate() + 7);
    } else {
      newDate.setMonth(newDate.getMonth() + 1);
    }
    onFechaInicioChange(newDate);
  };

  const goToToday = () => {
    const today = new Date();
    if (vista === "semana") {
      const day = today.getDay();
      const diff = day === 0 ? -6 : 1 - day; // Lunes como primer día
      const monday = new Date(today);
      monday.setDate(today.getDate() + diff);
      monday.setHours(0, 0, 0, 0);
      onFechaInicioChange(monday);
    } else {
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      onFechaInicioChange(firstDay);
    }
  };

  // Título del calendario
  const tituloCalendario = useMemo(() => {
    if (!fechaInicio) return "";
    if (vista === "semana") {
      return fechaInicio.toLocaleDateString("es-AR", {
        month: "long",
        year: "numeric",
      });
    } else {
      return fechaInicio.toLocaleDateString("es-AR", {
        month: "long",
        year: "numeric",
      });
    }
  }, [fechaInicio, vista]);

  const diasSemana = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

  // Función para abrir el modal del día
  const abrirModalDia = useCallback((dateKey, day) => {
    const obrasDelDia = getObrasForDate(dateKey);
    const notasDelDia = getNotasForDate(dateKey);
    setDiaSeleccionado({
      dateKey,
      day,
      obras: obrasDelDia,
      notas: notasDelDia,
    });
    setShowModalDia(true);
  }, [getObrasForDate, getNotasForDate]);

  // Función para cerrar el modal
  const cerrarModalDia = useCallback(() => {
    setShowModalDia(false);
    setDiaSeleccionado(null);
  }, []);

  return (
    <Card className="rounded-2xl shadow-lg border-0 bg-gradient-to-br from-white to-gray-50/50 overflow-hidden">
      <CardHeader className="pb-4 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-t-2xl">
        <CardTitle className="flex items-center gap-2">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center shadow-md">
            <Calendar className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="text-xl font-bold text-gray-900">
              Calendario de Obras y Notas
            </div>
            <div className="text-xs font-medium text-gray-600">
              Vista {vista === "semana" ? "Semanal" : "Mensual"}
            </div>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-6">
        {/* Navegación */}
        <div className="flex items-center justify-between mb-6">
          <Button
            variant="outline"
            size="sm"
            onClick={goToPrevious}
            className="flex items-center gap-2"
          >
            <ChevronLeft className="w-4 h-4" />
            Anterior
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={goToToday}>
              Hoy
            </Button>
            <span className="text-sm font-medium text-gray-700">
              {tituloCalendario}
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={goToNext}
            className="flex items-center gap-2"
          >
            Siguiente
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>

        {/* Vista Semana */}
        {vista === "semana" && (
          <div className="grid grid-cols-7 gap-2">
            {getWeekDays().map((day, index) => {
              const dateKey = formatDateKey(day);
              const isToday =
                day.toDateString() === new Date().toDateString();
              const dayObras = getObrasForDate(dateKey);
              const dayNotas = getNotasForDate(dateKey);

                return (
                  <div
                    key={index}
                    className={`border rounded-lg p-2 min-h-[200px] transition-all cursor-pointer ${
                      isToday
                        ? "bg-blue-50 border-blue-300 shadow-md"
                        : "bg-white border-gray-200 hover:border-gray-300"
                    }`}
                    onClick={() => {
                      if (dayObras.length > 0 || dayNotas.length > 0) {
                        abrirModalDia(dateKey, day);
                      }
                    }}
                    title={dayObras.length + dayNotas.length > 0 ? "Clic para ver todos los eventos del día" : ""}
                  >
                  {/* Header del día */}
                  <div className="text-center mb-2 pb-2 border-b border-gray-200">
                    <div className="text-[10px] font-semibold text-gray-600 uppercase">
                      {diasSemana[index]}
                    </div>
                    <div
                      className={`text-base font-bold ${
                        isToday ? "text-blue-600" : "text-gray-800"
                      }`}
                    >
                      {day.getDate()}
                    </div>
                  </div>

                  {/* Botón agregar nota */}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="w-full mb-2 text-[10px] h-6 px-1 bg-yellow-50 hover:bg-yellow-100 text-yellow-700 border border-yellow-200"
                    onClick={(e) => {
                      e.stopPropagation();
                      onAgregarNota(dateKey);
                    }}
                  >
                    <Icon icon="heroicons:plus" className="w-3 h-3 mr-0.5" />
                    Nota
                  </Button>

                  {/* Obras del día */}
                  <div className="space-y-1.5 mb-2">
                    {dayObras.slice(0, MAX_OBRAS_VISIBLES).map((obra) => {
                      const estado = obra.estado || "pendiente_inicio";
                      const colores = coloresEstado[estado] || coloresEstado.pendiente_inicio;
                      const total = obra.presupuestoTotal || obra.total || 0;

                      return (
                        <div
                          key={obra.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            onObraClick(obra);
                          }}
                          className={`${colores.bg} ${colores.border} border rounded px-2 py-1.5 text-xs cursor-pointer hover:shadow-md transition-all group`}
                        >
                          <div className="flex items-start justify-between gap-1">
                            <div className="flex-1 min-w-0">
                              <div className="font-semibold text-[11px] truncate">
                                {obra.numeroPedido || "Sin número"}
                              </div>
                              <div className="text-[10px] text-gray-600 truncate mt-0.5">
                                {obra.cliente?.nombre || "Sin cliente"}
                              </div>
                              <div className="text-[10px] font-medium mt-0.5">
                                {formatearNumeroArgentino(total)}
                              </div>
                            </div>
                            <Badge
                              variant="outline"
                              className={`${colores.badge} text-[9px] px-1 py-0 shrink-0`}
                            >
                              <Building className="w-2.5 h-2.5 mr-0.5" />
                            </Badge>
                          </div>
                        </div>
                      );
                    })}
                    {dayObras.length > MAX_OBRAS_VISIBLES && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="w-full text-[10px] h-6 px-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200"
                        onClick={(e) => {
                          e.stopPropagation();
                          abrirModalDia(dateKey, day);
                        }}
                      >
                        <Eye className="w-3 h-3 mr-1" />
                        Ver {dayObras.length - MAX_OBRAS_VISIBLES} más
                      </Button>
                    )}
                  </div>

                  {/* Notas del día */}
                  <div className="space-y-1">
                    {loadingNotas ? (
                      <div className="flex items-center justify-center py-2">
                        <Icon
                          icon="heroicons:arrow-path"
                          className="w-3 h-3 animate-spin text-gray-400"
                        />
                      </div>
                    ) : dayNotas.length === 0 ? (
                      <div className="text-center py-1 text-[9px] text-gray-400">
                        Sin notas
                      </div>
                    ) : (
                      dayNotas.slice(0, MAX_NOTAS_VISIBLES).map((nota) => (
                        <div
                          key={nota.id}
                          className={`bg-yellow-50 border border-yellow-200 rounded px-2 py-1 text-[10px] relative group hover:shadow-sm transition-all ${
                            deletingNota === nota.id
                              ? "opacity-50 pointer-events-none"
                              : "cursor-pointer"
                          }`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onNotaClick(nota);
                          }}
                        >
                          {deletingNota === nota.id && (
                            <div className="absolute inset-0 bg-white/50 flex items-center justify-center rounded">
                              <Icon
                                icon="heroicons:arrow-path"
                                className="w-3 h-3 animate-spin text-red-600"
                              />
                            </div>
                          )}
                          <div className="flex items-start justify-between gap-1">
                            <div className="flex-1 min-w-0">
                              <div className="font-semibold text-gray-800 truncate text-[10px]">
                                {nota.nombreObra}
                              </div>
                              {nota.productos && (
                                <div className="text-gray-600 mt-0.5 line-clamp-1 text-[9px]">
                                  {nota.productos}
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onEditNota(nota);
                                }}
                                className="w-4 h-4 bg-blue-500 text-white rounded flex items-center justify-center hover:bg-blue-600 transition-all"
                                title="Editar nota"
                                disabled={deletingNota === nota.id}
                              >
                                <Icon icon="heroicons:pencil" className="w-2 h-2" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDeleteNota(nota);
                                }}
                                className="w-4 h-4 bg-red-500 text-white rounded flex items-center justify-center hover:bg-red-600 transition-all"
                                title="Eliminar nota"
                                disabled={deletingNota === nota.id}
                              >
                                <Icon icon="heroicons:trash" className="w-2 h-2" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                    {dayNotas.length > MAX_NOTAS_VISIBLES && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="w-full text-[10px] h-6 px-1 bg-yellow-50 hover:bg-yellow-100 text-yellow-700 border border-yellow-200"
                        onClick={(e) => {
                          e.stopPropagation();
                          abrirModalDia(dateKey, day);
                        }}
                      >
                        <Eye className="w-3 h-3 mr-1" />
                        Ver {dayNotas.length - MAX_NOTAS_VISIBLES} más
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Modal del día seleccionado */}
        <Dialog open={showModalDia} onOpenChange={setShowModalDia}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                {diaSeleccionado && formatearFecha(diaSeleccionado.dateKey)}
              </DialogTitle>
              <DialogDescription>
                {diaSeleccionado && (
                  <>
                    {diaSeleccionado.obras.length} obra{diaSeleccionado.obras.length !== 1 ? "s" : ""} y{" "}
                    {diaSeleccionado.notas.length} nota{diaSeleccionado.notas.length !== 1 ? "s" : ""}
                  </>
                )}
              </DialogDescription>
            </DialogHeader>

            {diaSeleccionado && (
              <div className="space-y-6 mt-4">
                {/* Obras del día */}
                {diaSeleccionado.obras.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                      <Building className="w-5 h-5 text-blue-600" />
                      Obras ({diaSeleccionado.obras.length})
                    </h3>
                    <div className="space-y-3">
                      {diaSeleccionado.obras.map((obra) => {
                        const estado = obra.estado || "pendiente_inicio";
                        const colores = coloresEstado[estado] || coloresEstado.pendiente_inicio;
                        const total = obra.presupuestoTotal || obra.total || 0;

                        return (
                          <div
                            key={obra.id}
                            onClick={() => {
                              onObraClick(obra);
                              cerrarModalDia();
                            }}
                            className={`${colores.bg} ${colores.border} border-2 rounded-lg p-4 cursor-pointer hover:shadow-lg transition-all`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-2">
                                  <Building className="w-5 h-5 text-gray-600" />
                                  <span className="font-bold text-lg text-gray-900">
                                    {obra.numeroPedido || "Sin número"}
                                  </span>
                                  <Badge className={colores.badge}>
                                    {estado === "en_ejecucion" ? "En Ejecución" : 
                                     estado === "completada" ? "Completada" : 
                                     estado === "pendiente_inicio" ? "Pendiente" : 
                                     estado === "pausada" ? "Pausada" : "Cancelada"}
                                  </Badge>
                                </div>
                                <div className="text-sm text-gray-600 mb-1">
                                  <strong>Cliente:</strong> {obra.cliente?.nombre || "Sin cliente"}
                                </div>
                                {obra.cliente?.telefono && (
                                  <div className="text-sm text-gray-600 mb-1">
                                    <strong>Teléfono:</strong> {obra.cliente.telefono}
                                  </div>
                                )}
                                <div className="text-lg font-bold text-gray-900 mt-2">
                                  Total: {formatearNumeroArgentino(total)}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Notas del día */}
                {diaSeleccionado.notas.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                      <FileText className="w-5 h-5 text-yellow-600" />
                      Notas ({diaSeleccionado.notas.length})
                    </h3>
                    <div className="space-y-3">
                      {diaSeleccionado.notas.map((nota) => (
                        <div
                          key={nota.id}
                          className="bg-yellow-50 border-2 border-yellow-300 rounded-lg p-4 hover:shadow-lg transition-all"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <FileText className="w-5 h-5 text-yellow-700" />
                                <span className="font-bold text-lg text-gray-900">
                                  {nota.nombreObra}
                                </span>
                              </div>
                              {nota.productos && (
                                <div className="text-sm text-gray-700 mb-2">
                                  <strong>Productos:</strong> {nota.productos}
                                </div>
                              )}
                              {nota.fecha && (
                                <div className="text-xs text-gray-500">
                                  Fecha: {formatearFecha(nota.fecha)}
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onEditNota(nota);
                                  cerrarModalDia();
                                }}
                                className="bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-300"
                              >
                                <Icon icon="heroicons:pencil" className="w-4 h-4 mr-1" />
                                Editar
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDeleteNota(nota);
                                }}
                                className="bg-red-50 hover:bg-red-100 text-red-700 border-red-300"
                                disabled={deletingNota === nota.id}
                              >
                                {deletingNota === nota.id ? (
                                  <Icon icon="heroicons:arrow-path" className="w-4 h-4 mr-1 animate-spin" />
                                ) : (
                                  <Icon icon="heroicons:trash" className="w-4 h-4 mr-1" />
                                )}
                                Eliminar
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Mensaje si no hay items */}
                {diaSeleccionado.obras.length === 0 && diaSeleccionado.notas.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    No hay obras ni notas para este día
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Vista Mes - Calendario Completo Mensual */}
        {vista === "mes" && (
          <div className="space-y-3">
            {/* Headers de días de la semana */}
            <div className="grid grid-cols-7 gap-2 mb-3">
              {diasSemana.map((dia) => (
                <div
                  key={dia}
                  className="text-center text-sm font-bold text-gray-700 uppercase py-3 bg-gradient-to-b from-gray-50 to-gray-100 rounded-lg border border-gray-200"
                >
                  {dia}
                </div>
              ))}
            </div>

            {/* Grid de días del mes */}
            <div className="grid grid-cols-7 gap-2">
              {getMonthDays().map((dayObj, index) => {
                const day = dayObj.date;
                const dateKey = formatDateKey(day);
                const isToday =
                  day.toDateString() === new Date().toDateString();
                const dayObras = getObrasForDate(dateKey);
                const dayNotas = getNotasForDate(dateKey);
                const totalItems = dayObras.length + dayNotas.length;

                return (
                  <div
                    key={index}
                    className={`border-2 rounded-xl p-2 min-h-[140px] transition-all duration-200 ${
                      !dayObj.isCurrentMonth
                        ? "bg-gray-50/50 border-gray-100 opacity-40"
                        : isToday
                        ? "bg-gradient-to-br from-blue-50 to-blue-100 border-blue-400 shadow-lg ring-2 ring-blue-200"
                        : "bg-white border-gray-200 hover:border-gray-300 hover:shadow-md"
                    } ${totalItems > 0 ? "cursor-pointer" : ""}`}
                    onClick={() => {
                      if (totalItems > 0 && dayObj.isCurrentMonth) {
                        abrirModalDia(dateKey, day);
                      }
                    }}
                    title={totalItems > 0 && dayObj.isCurrentMonth ? "Clic para ver todos los eventos del día" : ""}
                  >
                    {/* Header del día */}
                    <div className="flex items-center justify-between mb-2 pb-2 border-b border-gray-200">
                      <div
                        className={`text-sm font-bold ${
                          isToday
                            ? "text-blue-700"
                            : dayObj.isCurrentMonth
                            ? "text-gray-800"
                            : "text-gray-400"
                        }`}
                      >
                        {day.getDate()}
                      </div>
                      {totalItems > 0 && (
                        <Badge
                          variant="outline"
                          className="text-[10px] px-1.5 py-0.5 bg-indigo-100 text-indigo-700 border-indigo-300 font-semibold"
                        >
                          {totalItems}
                        </Badge>
                      )}
                    </div>

                    {/* Contenido del día */}
                    <div className="space-y-1.5 flex-1">
                      {/* Obras del día */}
                      {dayObras.length > 0 && (
                        <div className="space-y-1">
                          {dayObras.slice(0, MAX_OBRAS_VISIBLES).map((obra) => {
                            const estado = obra.estado || "pendiente_inicio";
                            const colores = coloresEstado[estado] || coloresEstado.pendiente_inicio;
                            const total = obra.presupuestoTotal || obra.total || 0;

                            return (
                              <div
                                key={obra.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onObraClick(obra);
                                }}
                                className={`${colores.bg} ${colores.border} border rounded-lg px-2 py-1.5 text-[10px] cursor-pointer hover:shadow-md transition-all group`}
                              >
                                <div className="flex items-start justify-between gap-1">
                                  <div className="flex-1 min-w-0">
                                    <div className="font-bold text-[11px] truncate flex items-center gap-1">
                                      <Building className="w-3 h-3 shrink-0" />
                                      {obra.numeroPedido || "Sin número"}
                                    </div>
                                    <div className="text-[9px] text-gray-600 truncate mt-0.5">
                                      {obra.cliente?.nombre || "Sin cliente"}
                                    </div>
                                    <div className="text-[9px] font-semibold mt-0.5 text-gray-700">
                                      {formatearNumeroArgentino(total)}
                                    </div>
                                  </div>
                                  <Badge
                                    variant="outline"
                                    className={`${colores.badge} text-[8px] px-1 py-0 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity`}
                                  >
                                    {estado === "en_ejecucion" ? "Activa" : estado === "completada" ? "Completa" : estado === "pendiente_inicio" ? "Pendiente" : estado === "pausada" ? "Pausada" : "Cancelada"}
                                  </Badge>
                                </div>
                              </div>
                            );
                          })}
                          {dayObras.length > MAX_OBRAS_VISIBLES && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="w-full text-[9px] h-6 px-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200"
                              onClick={(e) => {
                                e.stopPropagation();
                                abrirModalDia(dateKey, day);
                              }}
                            >
                              <Eye className="w-3 h-3 mr-1" />
                              Ver {dayObras.length - MAX_OBRAS_VISIBLES} más
                            </Button>
                          )}
                        </div>
                      )}

                      {/* Notas del día */}
                      {dayNotas.length > 0 && (
                        <div className="space-y-1">
                          {dayNotas.slice(0, MAX_NOTAS_VISIBLES).map((nota) => (
                            <div
                              key={nota.id}
                              className={`bg-yellow-50 border border-yellow-300 rounded-lg px-2 py-1.5 text-[10px] cursor-pointer hover:shadow-md transition-all group relative ${
                                deletingNota === nota.id
                                  ? "opacity-50 pointer-events-none"
                                  : ""
                              }`}
                              onClick={(e) => {
                                e.stopPropagation();
                                onNotaClick(nota);
                              }}
                            >
                              {deletingNota === nota.id && (
                                <div className="absolute inset-0 bg-white/70 flex items-center justify-center rounded-lg">
                                  <Icon
                                    icon="heroicons:arrow-path"
                                    className="w-4 h-4 animate-spin text-red-600"
                                  />
                                </div>
                              )}
                              <div className="flex items-start justify-between gap-1">
                                <div className="flex-1 min-w-0">
                                  <div className="font-bold text-[11px] truncate flex items-center gap-1">
                                    <FileText className="w-3 h-3 shrink-0 text-yellow-700" />
                                    {nota.nombreObra}
                                  </div>
                                  {nota.productos && (
                                    <div className="text-[9px] text-gray-600 mt-0.5 line-clamp-1">
                                      {nota.productos}
                                    </div>
                                  )}
                                </div>
                                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onEditNota(nota);
                                    }}
                                    className="w-5 h-5 bg-blue-500 text-white rounded flex items-center justify-center hover:bg-blue-600 transition-all"
                                    title="Editar nota"
                                    disabled={deletingNota === nota.id}
                                  >
                                    <Icon icon="heroicons:pencil" className="w-2.5 h-2.5" />
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onDeleteNota(nota);
                                    }}
                                    className="w-5 h-5 bg-red-500 text-white rounded flex items-center justify-center hover:bg-red-600 transition-all"
                                    title="Eliminar nota"
                                    disabled={deletingNota === nota.id}
                                  >
                                    <Icon icon="heroicons:trash" className="w-2.5 h-2.5" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                          {dayNotas.length > MAX_NOTAS_VISIBLES && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="w-full text-[9px] h-6 px-1 bg-yellow-50 hover:bg-yellow-100 text-yellow-700 border border-yellow-200"
                              onClick={(e) => {
                                e.stopPropagation();
                                abrirModalDia(dateKey, day);
                              }}
                            >
                              <Eye className="w-3 h-3 mr-1" />
                              Ver {dayNotas.length - MAX_NOTAS_VISIBLES} más
                            </Button>
                          )}
                        </div>
                      )}

                      {/* Mensaje vacío */}
                      {totalItems === 0 && dayObj.isCurrentMonth && (
                        <div className="text-center py-2 text-[9px] text-gray-400">
                          Sin eventos
                        </div>
                      )}
                    </div>

                    {/* Botón agregar nota (solo si es del mes actual) */}
                    {dayObj.isCurrentMonth && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="w-full mt-2 text-[10px] h-7 px-2 bg-gradient-to-r from-yellow-50 to-yellow-100 hover:from-yellow-100 hover:to-yellow-200 text-yellow-700 border border-yellow-300 font-medium shadow-sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          onAgregarNota(dateKey);
                        }}
                      >
                        <Icon icon="heroicons:plus" className="w-3 h-3 mr-1" />
                        Agregar Nota
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default CalendarioObras;

