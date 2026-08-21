"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  columnsPresupuestos,
  columnsVentas,
} from "../(invoice)/invoice-list/invoice-list-table/components/columns-enhanced";
import {
  Loader2,
  CheckCircle,
  AlertCircle,
  Trash2,
  X,
  AlertTriangle,
  Info,
  FileText,
  ShoppingCart,
  ChevronLeft,
  ChevronRight,
  Search,
} from "lucide-react";
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { db } from "@/lib/firebase";
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  serverTimestamp,
  limit,
  query,
} from "firebase/firestore";
import { useRouter, useParams } from "next/navigation";
import { useAuth } from "@/provider/auth.provider";

const PERIODOS_LISTA = [
  { value: "7dias", label: "Fecha: Ultimos 7 dias" },
  { value: "30dias", label: "Fecha: Ultimos 30 dias" },
  { value: "90dias", label: "Fecha: Ultimos 90 dias" },
  { value: "todos", label: "Fecha: Todo el periodo" },
];

const OPCIONES_CREACION = {
  presupuesto: {
    value: "presupuesto",
    title: "Nuevo presupuesto",
    href: (lang) => `/${lang}/presupuestos/create`,
    icon: FileText,
  },
  venta: {
    value: "venta",
    title: "Nueva venta",
    href: (lang) => `/${lang}/ventas/create`,
    icon: ShoppingCart,
  },
};

const normalize = (value) =>
  String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

const getClienteSearchFields = (cliente = {}) => [
  cliente.nombre,
  cliente.telefono,
  cliente.celular,
  cliente.whatsapp,
  cliente.cuil,
  cliente.dni,
  cliente.cuit,
  cliente.email,
  cliente.direccion,
  cliente.localidad,
  cliente.provincia,
];

const parseMaybeDate = (value) => {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const matchesPeriodo = (value, periodo) => {
  if (!value || periodo === "todos") return true;

  const parsed = parseMaybeDate(value);
  if (!parsed) return true;

  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const from = new Date(today);

  if (periodo === "7dias") from.setDate(today.getDate() - 7);
  if (periodo === "30dias") from.setDate(today.getDate() - 30);
  if (periodo === "90dias") from.setDate(today.getDate() - 90);

  from.setHours(0, 0, 0, 0);
  return parsed >= from && parsed <= today;
};

const isVentaAnulada = (venta) => {
  if (!venta) return false;
  return String(venta.estado || "").toLowerCase() === "anulada" || venta.anulada === true;
};

const isPresupuestoAnulado = (presupuesto) => {
  if (!presupuesto) return false;
  return String(presupuesto.estado || "").toLowerCase() === "anulada" || presupuesto.anulada === true;
};

const CompactTableCard = ({
  title,
  count,
  icon: Icon,
  accent,
  data,
  columns,
  searchValue,
  onSearchChange,
  searchPlaceholder,
  periodo,
  onPeriodoChange,
  estadoFiltro,
  onEstadoFiltroChange,
  showEstadoFiltro = false,
  mostrarAnulados,
  onMostrarAnuladosChange,
  onCreateClick,
  createLabel,
  onRowClick,
  rowClassName,
  cellClassName,
  isAnuladoFn,
  loadingBusqueda = false,
}) => {
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 });

  useEffect(() => {
    setPagination((current) => ({ ...current, pageIndex: 0 }));
  }, [data]);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    autoResetPageIndex: false,
    state: {
      sorting: [{ id: "numeroPedido", desc: true }],
      pagination,
    },
    onPaginationChange: setPagination,
  });

  return (
    <div className="rounded-2xl border border-border/60 bg-card shadow-sm overflow-hidden">
      <div className="flex flex-col gap-3 p-4 sm:p-5 border-b border-border/50 bg-gradient-to-b from-background to-muted/20">
        <div className="flex flex-col lg:flex-row lg:items-center gap-3 lg:gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${accent}`}>
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-bold text-foreground leading-tight truncate">
                {title}
                <span className="ml-2 text-xs font-semibold text-muted-foreground">({count})</span>
              </h2>
            </div>
            <div className="shrink-0">
              <Button
                type="button"
                size="sm"
                onClick={onCreateClick}
                className="h-8 rounded-lg px-3 text-xs font-semibold shadow-sm hover:shadow transition-all select-none"
                onDoubleClick={(e) => e.preventDefault()}
              >
                <Icon className="mr-1.5 h-4 w-4" />
                {createLabel}
              </Button>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchValue}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder}
              className="h-8 pl-8 pr-3 rounded-lg text-xs border-border/60 w-full"
            />
          </div>

          <Select value={periodo} onValueChange={onPeriodoChange}>
            <SelectTrigger className="h-8 rounded-lg text-xs border-border/60 w-full sm:w-[170px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIODOS_LISTA.map((p) => (
                <SelectItem key={p.value} value={p.value} className="text-xs">
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {showEstadoFiltro && (
            <Select value={estadoFiltro} onValueChange={onEstadoFiltroChange}>
              <SelectTrigger className="h-8 rounded-lg text-xs border-border/60 w-full sm:w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos" className="text-xs">Estado: Todos</SelectItem>
                <SelectItem value="pagado" className="text-xs">Pagado</SelectItem>
                <SelectItem value="parcial" className="text-xs">Parcial</SelectItem>
                <SelectItem value="pendiente" className="text-xs">Pendiente</SelectItem>
              </SelectContent>
            </Select>
          )}

          <label className="flex items-center gap-2 h-8 px-3 rounded-lg border border-border/60 bg-background cursor-pointer select-none w-full sm:w-auto justify-center">
            <Checkbox
              checked={mostrarAnulados}
              onCheckedChange={(c) => onMostrarAnuladosChange(Boolean(c))}
              className="h-3.5 w-3.5"
            />
            <span className="text-xs font-medium text-foreground whitespace-nowrap">Anulados</span>
          </label>

        </div>
      </div>

      <div className="overflow-x-auto">
        <Table className="w-full">
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="border-border/50 hover:bg-transparent">
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className="h-8 px-2.5 py-1.5 text-[10.5px] font-bold uppercase tracking-normal text-muted-foreground bg-muted/30 whitespace-nowrap"
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {loadingBusqueda ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-20 text-center">
                  <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    Buscando resultados...
                  </div>
                </TableCell>
              </TableRow>
            ) : table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => {
                const rowOriginal = row.original;
                const anulado = isAnuladoFn?.(rowOriginal);
                const customRowClass = rowClassName?.(rowOriginal) || "";
                return (
                  <TableRow
                    key={row.id}
                    onClick={() => onRowClick?.(rowOriginal)}
                    className={`h-8 cursor-pointer border-border/40 transition-colors ${
                      anulado ? "bg-red-50/60 hover:bg-red-50/80" : "hover:bg-muted/40"
                    } ${customRowClass}`}
                  >
                    {row.getVisibleCells().map((cell) => {
                      const customCellClass =
                        cellClassName?.(rowOriginal, cell.column.id) || "";
                      return (
                        <TableCell
                          key={cell.id}
                          className={`px-2.5 py-1.5 text-xs whitespace-nowrap ${
                            anulado && String(cell.column.id) !== "actions"
                              ? "text-red-700 line-through"
                              : anulado && String(cell.column.id) === "actions"
                                ? "text-red-700"
                                : ""
                          } ${customCellClass}`}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-20 text-center text-xs text-muted-foreground"
                >
                  Sin resultados.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 p-3 sm:p-4 border-t border-border/50 bg-muted/10">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <span className="text-[11px] text-muted-foreground">Mostrar:</span>
          <Select
            value={String(pagination.pageSize)}
            onValueChange={(value) =>
              setPagination({ pageIndex: 0, pageSize: Math.min(100, Number(value) || 10) })
            }
          >
            <SelectTrigger className="h-7 rounded-lg text-xs border-border/60 w-full sm:w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[10, 20, 50, 100].map((size) => (
                <SelectItem key={size} value={String(size)} className="text-xs">
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-[11px] text-muted-foreground text-center sm:text-left">
            Total: {data.length}
          </span>
        </div>
        <div className="flex items-center justify-center sm:justify-end gap-1.5">
          <span className="mr-2 text-[11px] text-muted-foreground">
            Pág. {table.getState().pagination.pageIndex + 1} de {table.getPageCount() || 1}
          </span>
          {Array.from({ length: Math.min(5, table.getPageCount() || 1) }, (_, index) => (
            <Button
              key={index + 1}
              type="button"
              variant={pagination.pageIndex === index ? "default" : "outline"}
              size="sm"
              onClick={() => setPagination((current) => ({ ...current, pageIndex: index }))}
              className="h-7 min-w-7 px-2 text-xs"
            >
              {index + 1}
            </Button>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setPagination((current) => ({
                ...current,
                pageIndex: Math.max(0, current.pageIndex - 1),
              }))
            }
            disabled={pagination.pageIndex <= 0}
            className="h-7 px-2.5 rounded-lg text-xs border-border/60"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setPagination((current) => ({
                ...current,
                pageIndex: Math.min(
                  Math.max(0, table.getPageCount() - 1),
                  current.pageIndex + 1
                ),
              }))
            }
            disabled={pagination.pageIndex >= Math.max(0, table.getPageCount() - 1)}
            className="h-7 px-2.5 rounded-lg text-xs border-border/60"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
};

const VentasPage = () => {
  const { user } = useAuth();
  const [ventasData, setVentasData] = useState([]);
  const [presupuestosData, setPresupuestosData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteMessage, setDeleteMessage] = useState("");
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);
  const [deleteType, setDeleteType] = useState("");
  const [motivoAnulacion, setMotivoAnulacion] = useState("");

  const [mostrarAnuladosPresupuestos, setMostrarAnuladosPresupuestos] = useState(false);
  const [mostrarAnuladosVentas, setMostrarAnuladosVentas] = useState(false);
  const [periodoPresupuestos, setPeriodoPresupuestos] = useState("30dias");
  const [periodoVentas, setPeriodoVentas] = useState("30dias");
  const [ventaEstadoFiltro, setVentaEstadoFiltro] = useState("todos");
  const [busquedaPresupuestos, setBusquedaPresupuestos] = useState("");
  const [busquedaVentas, setBusquedaVentas] = useState("");
  const [loadingBusquedaVentas, setLoadingBusquedaVentas] = useState(false);
  const [loadingBusquedaPresupuestos, setLoadingBusquedaPresupuestos] = useState(false);
  const modoCargaVentasRef = useRef("limitado");
  const modoCargaPresupuestosRef = useRef("limitado");

  const router = useRouter();
  const params = useParams();
  const { lang } = params;

  const cargarListas = useCallback(async ({
    limitado,
    mostrarCarga = true,
    esBusqueda = false,
    tipo = "ambas",
  }) => {
    const cargarVentas = tipo === "ambas" || tipo === "ventas";
    const cargarPresupuestos = tipo === "ambas" || tipo === "presupuestos";
    try {
      if (mostrarCarga) setLoading(true);
      if (esBusqueda && cargarVentas) setLoadingBusquedaVentas(true);
      if (esBusqueda && cargarPresupuestos) setLoadingBusquedaPresupuestos(true);
      const ventasRef = cargarVentas
        ? (limitado ? query(collection(db, "ventas"), limit(500)) : collection(db, "ventas"))
        : null;
      const presupuestosRef = cargarPresupuestos
        ? (limitado ? query(collection(db, "presupuestos"), limit(500)) : collection(db, "presupuestos"))
        : null;
      const [ventasSnap, presupuestosSnap] = await Promise.all([
        ventasRef ? getDocs(ventasRef) : Promise.resolve(null),
        presupuestosRef ? getDocs(presupuestosRef) : Promise.resolve(null),
      ]);
      if (ventasSnap) {
        setVentasData(ventasSnap.docs.map((d) => ({ ...d.data(), id: d.id })));
        modoCargaVentasRef.current = limitado ? "limitado" : "completo";
      }
      if (presupuestosSnap) {
        setPresupuestosData(presupuestosSnap.docs.map((d) => ({ ...d.data(), id: d.id })));
        modoCargaPresupuestosRef.current = limitado ? "limitado" : "completo";
      }
    } catch (error) {
      console.error("Error al cargar datos:", error);
    } finally {
      if (mostrarCarga) setLoading(false);
      if (esBusqueda && cargarVentas) setLoadingBusquedaVentas(false);
      if (esBusqueda && cargarPresupuestos) setLoadingBusquedaPresupuestos(false);
    }
  }, []);

  useEffect(() => {
    cargarListas({ limitado: true });
  }, [cargarListas]);

  useEffect(() => {
    const hayBusqueda = Boolean(normalize(busquedaVentas));
    const modoNecesario = hayBusqueda ? "completo" : "limitado";
    if (modoCargaVentasRef.current === modoNecesario) return undefined;

    const timeoutId = setTimeout(() => {
      cargarListas({
        limitado: !hayBusqueda,
        mostrarCarga: false,
        esBusqueda: true,
        tipo: "ventas",
      });
    }, 250);

    return () => clearTimeout(timeoutId);
  }, [busquedaVentas, cargarListas]);

  useEffect(() => {
    const hayBusqueda = Boolean(normalize(busquedaPresupuestos));
    const modoNecesario = hayBusqueda ? "completo" : "limitado";
    if (modoCargaPresupuestosRef.current === modoNecesario) return undefined;

    const timeoutId = setTimeout(() => {
      cargarListas({
        limitado: !hayBusqueda,
        mostrarCarga: false,
        esBusqueda: true,
        tipo: "presupuestos",
      });
    }, 250);

    return () => clearTimeout(timeoutId);
  }, [busquedaPresupuestos, cargarListas]);

  const showDeleteConfirmation = useCallback((id, type, itemName) => {
    setItemToDelete({ id, name: itemName });
    setDeleteType(type);
    setMotivoAnulacion("");
    setShowDeleteDialog(true);
  }, []);

  const confirmDelete = async () => {
    if (!itemToDelete || !user) {
      setShowDeleteDialog(false);
      return;
    }

    try {
      setDeleting(true);
      setDeleteMessage("");

      if (deleteType === "venta") {
        const motivo = String(motivoAnulacion || "").trim();
        if (typeof user.getIdToken !== "function") {
          throw new Error("No hay sesion valida");
        }
        const idToken = await user.getIdToken();
        const response = await fetch(
          `/api/erp/ventas/${encodeURIComponent(itemToDelete.id)}/anular`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${idToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ motivo, origen: "ui_ventas_list" }),
          }
        );
        const result = await response.json();
        if (!response.ok || !result?.ok) {
          throw new Error(result?.error || "Error al anular la venta");
        }
        setVentasData((prev) =>
          prev.map((v) =>
            v.id === itemToDelete.id
              ? {
                  ...v,
                  estado: "anulada",
                  anulada: true,
                  anuladoEn: new Date().toISOString(),
                  anulacionMotivo: motivo,
                }
              : v
          )
        );
        setDeleteMessage("✅ Venta anulada exitosamente");
        setTimeout(() => setDeleteMessage(""), 3000);
        return;
      }

      const presupuestoRef = doc(db, "presupuestos", itemToDelete.id);
      await updateDoc(presupuestoRef, {
        estado: "anulada",
        anulada: true,
        anuladoEn: serverTimestamp(),
        anulacionMotivo: String(motivoAnulacion || "").trim(),
        fechaActualizacion: serverTimestamp(),
      });

      setPresupuestosData((prev) =>
        prev.map((p) =>
          p.id === itemToDelete.id
            ? {
                ...p,
                estado: "anulada",
                anulada: true,
                anuladoEn: new Date().toISOString(),
                anulacionMotivo: String(motivoAnulacion || "").trim(),
              }
            : p
        )
      );

      setDeleteMessage("✅ Presupuesto anulado exitosamente");
      setTimeout(() => setDeleteMessage(""), 3000);
    } catch (error) {
      console.error(`Error al anular ${deleteType}:`, error);
      setDeleteMessage(`❌ Error: ${error.message}`);
      setTimeout(() => setDeleteMessage(""), 5000);
    } finally {
      setDeleting(false);
      setShowDeleteDialog(false);
      setItemToDelete(null);
    }
  };

  useEffect(() => {
    const handleDeletePresupuestoEvent = (event) => {
      const presupuesto = presupuestosData.find((p) => p.id === event.detail.id);
      if (presupuesto) {
        showDeleteConfirmation(
          event.detail.id,
          "presupuesto",
          presupuesto.cliente?.nombre || "Presupuesto"
        );
      }
    };

    const handleEditPresupuestoEvent = (event) => {
      if (!event?.detail?.id) return;
      router.push(`/${lang}/presupuestos/${event.detail.id}`);
    };

    const handleAnularVentaEvent = (event) => {
      const venta = ventasData.find((v) => v.id === event.detail.id);
      if (venta) {
        showDeleteConfirmation(
          event.detail.id,
          "venta",
          venta.cliente?.nombre || "Venta"
        );
      }
    };

    const handleEditVentaEvent = (event) => {
      if (!event?.detail?.id) return;
      router.push(`/${lang}/ventas/${event.detail.id}`);
    };

    window.addEventListener("deletePresupuesto", handleDeletePresupuestoEvent);
    window.addEventListener("editPresupuesto", handleEditPresupuestoEvent);
    window.addEventListener("anularVenta", handleAnularVentaEvent);
    window.addEventListener("editVenta", handleEditVentaEvent);

    return () => {
      window.removeEventListener("deletePresupuesto", handleDeletePresupuestoEvent);
      window.removeEventListener("editPresupuesto", handleEditPresupuestoEvent);
      window.removeEventListener("anularVenta", handleAnularVentaEvent);
      window.removeEventListener("editVenta", handleEditVentaEvent);
    };
  }, [presupuestosData, ventasData, showDeleteConfirmation, router, lang]);

  const presupuestosFiltrados = useMemo(() => {
    const search = normalize(busquedaPresupuestos);
    const hayBusqueda = Boolean(search);

    return presupuestosData.filter((presupuesto) => {
      if (!mostrarAnuladosPresupuestos && isPresupuestoAnulado(presupuesto)) return false;
      if (!hayBusqueda && !matchesPeriodo(presupuesto.fechaCreacion || presupuesto.fecha, periodoPresupuestos)) {
        return false;
      }

      if (!search) return true;

      const haystack = normalize(
        [
          presupuesto.numeroPedido,
          presupuesto.id,
          ...getClienteSearchFields(presupuesto.cliente),
          presupuesto.vendedor,
        ].join(" ")
      );

      return haystack.includes(search);
    });
  }, [presupuestosData, mostrarAnuladosPresupuestos, periodoPresupuestos, busquedaPresupuestos]);

  const ventasFiltradas = useMemo(() => {
    const search = normalize(busquedaVentas);
    const hayBusqueda = Boolean(search);

    return ventasData.filter((venta) => {
      if (!mostrarAnuladosVentas && isVentaAnulada(venta)) return false;
      if (!hayBusqueda && !matchesPeriodo(venta.fechaCreacion || venta.fecha, periodoVentas)) return false;

      if (ventaEstadoFiltro !== "todos") {
        const estado = normalize(venta.estadoPago || venta.status);
        if (estado !== normalize(ventaEstadoFiltro)) return false;
      }

      if (!search) return true;

      const haystack = normalize(
        [
          venta.numeroPedido,
          venta.id,
          ...getClienteSearchFields(venta.cliente),
          venta.vendedor,
          venta.estadoPago,
        ].join(" ")
      );

      return haystack.includes(search);
    });
  }, [ventasData, mostrarAnuladosVentas, periodoVentas, ventaEstadoFiltro, busquedaVentas]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-gray-600">Cargando ventas...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 py-4 sm:py-6 px-2 sm:px-4 font-sans w-full max-w-none">
      {deleteMessage && (
        <div
          className={`p-3 rounded-xl flex items-center gap-3 text-sm font-medium shadow-sm border transition-all duration-500 ${
            deleteMessage.startsWith("✅")
              ? "bg-gradient-to-r from-green-50 to-emerald-50 border-green-200 text-green-800"
              : "bg-gradient-to-r from-red-50 to-rose-50 border-red-200 text-red-800"
          }`}
        >
          {deleteMessage.startsWith("✅") ? (
            <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center shrink-0">
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
          ) : (
            <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center shrink-0">
              <AlertCircle className="w-5 h-5 text-red-600" />
            </div>
          )}
          <span className="font-semibold flex-1">{deleteMessage}</span>
          <button
            onClick={() => setDeleteMessage("")}
            className="w-6 h-6 rounded-full hover:bg-white/50 flex items-center justify-center transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 w-full">
        <CompactTableCard
          title="Presupuestos"
          count={presupuestosFiltrados.length}
          icon={FileText}
          accent="bg-blue-100/80 text-blue-700"
          data={presupuestosFiltrados}
          columns={columnsPresupuestos}
          searchValue={busquedaPresupuestos}
          onSearchChange={setBusquedaPresupuestos}
          searchPlaceholder="Buscar cliente, teléfono o doc..."
          periodo={periodoPresupuestos}
          onPeriodoChange={setPeriodoPresupuestos}
          mostrarAnulados={mostrarAnuladosPresupuestos}
          onMostrarAnuladosChange={setMostrarAnuladosPresupuestos}
          onCreateClick={() => router.push(OPCIONES_CREACION.presupuesto.href(lang))}
          createLabel="Nuevo presupuesto"
          onRowClick={(item) => router.push(`/${lang}/presupuestos/${item.id}`)}
          isAnuladoFn={isPresupuestoAnulado}
          loadingBusqueda={loadingBusquedaPresupuestos}
        />

        <CompactTableCard
          title="Ventas"
          count={ventasFiltradas.length}
          icon={ShoppingCart}
          accent="bg-emerald-100/80 text-emerald-700"
          data={ventasFiltradas}
          columns={columnsVentas}
          searchValue={busquedaVentas}
          onSearchChange={setBusquedaVentas}
          searchPlaceholder="Buscar cliente, teléfono o doc..."
          periodo={periodoVentas}
          onPeriodoChange={setPeriodoVentas}
          estadoFiltro={ventaEstadoFiltro}
          onEstadoFiltroChange={setVentaEstadoFiltro}
          showEstadoFiltro
          mostrarAnulados={mostrarAnuladosVentas}
          onMostrarAnuladosChange={setMostrarAnuladosVentas}
          onCreateClick={() => router.push(OPCIONES_CREACION.venta.href(lang))}
          createLabel="Nueva venta"
          onRowClick={(item) => router.push(`/${lang}/ventas/${item.id}`)}
          isAnuladoFn={isVentaAnulada}
          loadingBusqueda={loadingBusquedaVentas}
        />
      </div>

      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="w-[95vw] max-w-md rounded-2xl border border-border/60 shadow-2xl bg-card">
          <DialogHeader className="text-center pb-4">
            <div className="w-14 h-14 bg-gradient-to-br from-red-500/15 to-red-500/5 rounded-full flex items-center justify-center mx-auto mb-3">
              <AlertTriangle className="w-7 h-7 text-red-700 dark:text-red-300" />
            </div>
            <DialogTitle className="text-lg font-bold text-foreground">
              Confirmar anulación
            </DialogTitle>
            <DialogDescription className="text-muted-foreground mt-1 text-sm">
              {deleteType === "venta"
                ? "La venta quedará anulada y se repondrá el stock."
                : "El presupuesto quedará anulado y seguirá almacenado."}
            </DialogDescription>
          </DialogHeader>

          <div className="bg-gradient-to-r from-red-500/15 to-red-500/5 rounded-xl p-3.5 mb-5 border border-red-500/20">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-red-500/10 rounded-full flex items-center justify-center shrink-0">
                <Info className="w-5 h-5 text-red-700 dark:text-red-300" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-red-800 dark:text-red-200 text-sm truncate">
                  {itemToDelete?.name || "Elemento"}
                </div>
                <div className="text-xs text-red-700 dark:text-red-300">
                  {deleteType === "venta"
                    ? "Esta acción anulará la venta y restaurará el stock."
                    : "Esta acción anulará el presupuesto sin borrarlo."}
                </div>
              </div>
            </div>
          </div>

          {(deleteType === "venta" || deleteType === "presupuesto") && (
            <div className="mb-5">
              <label className="block text-xs font-semibold text-foreground mb-1.5">
                Motivo de anulación
              </label>
              <Textarea
                value={motivoAnulacion}
                onChange={(e) => setMotivoAnulacion(e.target.value)}
                placeholder="Ej: Pedido cancelado / error de carga / cambio de productos..."
                className="min-h-[80px] text-sm"
                disabled={deleting}
              />
            </div>
          )}

          <DialogFooter className="flex flex-col sm:flex-row gap-2.5 pt-2">
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl border-border text-foreground hover:bg-muted/50 transition-all duration-200 font-medium text-sm"
              disabled={deleting}
            >
              <X className="w-4 h-4 mr-2" />
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 shadow-md transition-all duration-200 font-medium text-sm"
              disabled={deleting}
            >
              {deleting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Procesando...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Anular
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default VentasPage;
