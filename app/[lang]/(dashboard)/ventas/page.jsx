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
  Download,
  Plus,
  Search,
  Wallet,
  ArrowDown,
  ArrowDownUp,
  ArrowUp,
} from "lucide-react";
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
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
  orderBy,
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

const getCorrelativeNumber = (value) => {
  const text = String(value || "");
  const matches = text.match(/\d+/g);
  if (!matches || matches.length === 0) return Number.NEGATIVE_INFINITY;
  const lastChunk = matches[matches.length - 1];
  const parsed = Number(lastChunk);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
};

const compareByNumeroPedidoDesc = (rowA, rowB, columnId) => {
  const a = getCorrelativeNumber(rowA.getValue(columnId));
  const b = getCorrelativeNumber(rowB.getValue(columnId));
  if (a === b) return 0;
  return a > b ? 1 : -1;
};

const escaparCSV = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;

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
  onRowClick,
  rowClassName,
  cellClassName,
  isAnuladoFn,
  loadingBusqueda = false,
}) => {
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 });
  const [sorting, setSorting] = useState([{ id: "numeroPedido", desc: true }]);

  const columnsWithCorrelativeSort = useMemo(
    () =>
      (Array.isArray(columns) ? columns : []).map((column) => {
        const columnId = String(column?.id || column?.accessorKey || "");
        if (columnId !== "numeroPedido") return column;
        return {
          ...column,
          sortingFn: compareByNumeroPedidoDesc,
        };
      }),
    [columns]
  );

  useEffect(() => {
    setPagination((current) => ({ ...current, pageIndex: 0 }));
  }, [data]);

  const table = useReactTable({
    data,
    columns: columnsWithCorrelativeSort,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    autoResetPageIndex: false,
    state: { sorting, pagination },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
  });

  const gridTemplate = table.getVisibleLeafColumns().map((column, index) => {
    if (column.id === "numeroPedido") return "minmax(125px, 0.9fr)";
    if (column.id === "cliente") return "minmax(205px, 1.7fr)";
    if (column.id === "estadoPago" || column.id === "estadoPresupuesto") return "minmax(105px, 0.8fr)";
    if (column.id === "fechaCreacion") return "minmax(125px, 1fr)";
    if (column.id === "total" || column.id === "montoAbonado") return "minmax(115px, 0.9fr)";
    if (column.id === "actions") return "minmax(140px, auto)";
    return index === 0 ? "minmax(150px, 1.2fr)" : "minmax(110px, 0.85fr)";
  }).join(" ");
  const columnLabels = {
    numeroPedido: title === "Ventas" ? "N° venta" : "N° presupuesto",
    cliente: "Cliente",
    estadoPresupuesto: "Estado",
    fechaCreacion: "Fecha",
    total: "Total",
    estadoPago: "Estado",
    montoAbonado: "Abonado",
    vendedor: "Vendedor",
    actions: "Acciones",
  };
  const pageCount = Math.max(table.getPageCount(), 1);
  const startRow = data.length === 0 ? 0 : pagination.pageIndex * pagination.pageSize + 1;
  const endRow = Math.min((pagination.pageIndex + 1) * pagination.pageSize, data.length);
  const headingId = `${title.toLocaleLowerCase("es-AR")}-list-heading`;

  const exportarCSV = () => {
    const columnasExportables = columns.filter((column) => column.id !== "actions");
    const filas = [
      columnasExportables.map((column) => column.exportHeader || column.header),
      ...data.map((record) => columnasExportables.map((column) => {
        if (typeof column.exportValue === "function") return column.exportValue(record);
        const accessor = column.accessorKey || column.id;
        return String(accessor || "").split(".").reduce((value, key) => value?.[key], record) ?? "";
      })),
    ];
    const contenido = filas.map((fila) => fila.map(escaparCSV).join(",")).join("\r\n");
    const blob = new Blob([`\uFEFF${contenido}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${title.toLocaleLowerCase("es-AR")}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <section aria-labelledby={headingId}>
      <div className="flex flex-col gap-4 pb-4 2xl:flex-row 2xl:items-start 2xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 id={headingId} className="text-lg font-semibold tracking-tight text-slate-900">{title}</h2>
              <span className="text-xs tabular-nums text-slate-500">{count} resultados</span>
            </div>
            <p className="mt-1 text-sm text-slate-500">{title === "Ventas" ? "Operaciones, cobros y estado de cada venta." : "Propuestas vigentes e historial de presupuestos."}</p>
          </div>
          <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:flex 2xl:w-auto 2xl:flex-none 2xl:flex-wrap 2xl:items-center 2xl:justify-end">
            <label className="relative min-w-0 sm:col-span-2 2xl:w-[280px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <Input
                value={searchValue}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                className="h-9 rounded-md border border-slate-200 bg-white pl-9 pr-3 text-xs shadow-sm placeholder:text-slate-500 focus-visible:border-slate-400 focus-visible:ring-2 focus-visible:ring-slate-200"
              />
            </label>
            <Select value={periodo} onValueChange={onPeriodoChange}>
              <SelectTrigger className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-xs shadow-sm focus:ring-2 focus:ring-slate-200 2xl:w-[170px]"><SelectValue /></SelectTrigger>
              <SelectContent>{PERIODOS_LISTA.map((p) => <SelectItem key={p.value} value={p.value} className="text-xs">{p.label}</SelectItem>)}</SelectContent>
            </Select>
            {showEstadoFiltro ? (
              <Select value={estadoFiltro} onValueChange={onEstadoFiltroChange}>
                <SelectTrigger className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-xs shadow-sm focus:ring-2 focus:ring-slate-200 2xl:w-[145px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos" className="text-xs">Todos los estados</SelectItem>
                  <SelectItem value="pagado" className="text-xs">Pagado</SelectItem>
                  <SelectItem value="parcial" className="text-xs">Parcial</SelectItem>
                  <SelectItem value="pendiente" className="text-xs">Pendiente</SelectItem>
                </SelectContent>
              </Select>
            ) : null}
            <Select
              value={`${sorting[0]?.id || "numeroPedido"}-${sorting[0]?.desc ? "desc" : "asc"}`}
              onValueChange={(value) => {
                const [id, direction] = value.split("-");
                setSorting([{ id, desc: direction === "desc" }]);
                setPagination((current) => ({ ...current, pageIndex: 0 }));
              }}
            >
              <SelectTrigger className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-xs shadow-sm focus:ring-2 focus:ring-slate-200 2xl:w-[175px]" aria-label="Ordenar registros"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="numeroPedido-desc" className="text-xs">Orden: número reciente</SelectItem>
                <SelectItem value="fechaCreacion-desc" className="text-xs">Orden: fecha reciente</SelectItem>
                <SelectItem value="total-desc" className="text-xs">Orden: mayor importe</SelectItem>
                <SelectItem value="cliente-asc" className="text-xs">Orden: cliente A–Z</SelectItem>
              </SelectContent>
            </Select>
            <label className="flex h-9 cursor-pointer items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 xl:justify-start">
              <Checkbox checked={mostrarAnulados} onCheckedChange={(checked) => onMostrarAnuladosChange(Boolean(checked))} className="h-3.5 w-3.5" />
              <span className="text-xs font-medium text-slate-700">Anulados</span>
            </label>
            <Button type="button" variant="outline" onClick={exportarCSV} disabled={loadingBusqueda || data.length === 0} className="h-9 rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-800 shadow-sm hover:bg-slate-50">
              <Download className="mr-2 h-4 w-4" />Exportar
            </Button>
          </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm shadow-slate-200/40">
      <div role="table" aria-label={title}>
        {table.getHeaderGroups().map((headerGroup) => (
          <div key={headerGroup.id} role="row" className="hidden gap-3 border-b border-slate-200 bg-slate-50/70 px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[.09em] text-slate-500 xl:grid xl:px-5" style={{ gridTemplateColumns: gridTemplate }}>
            {headerGroup.headers.map((header) => {
              const sorted = header.column.getIsSorted();
              const SortIcon = sorted === "asc" ? ArrowUp : sorted === "desc" ? ArrowDown : ArrowDownUp;
              const alignRight = header.column.id === "actions" || ["total", "montoAbonado"].includes(header.column.id);
              return (
                <div key={header.id} role="columnheader" aria-sort={sorted ? (sorted === "asc" ? "ascending" : "descending") : "none"} className={alignRight ? "text-right" : ""}>
                  {header.isPlaceholder ? null : header.column.getCanSort() ? (
                      <button type="button" onClick={header.column.getToggleSortingHandler()} aria-label={`Ordenar por ${columnLabels[header.column.id] || header.column.id}`} className={`inline-flex items-center gap-1.5 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 ${alignRight ? "justify-end" : ""}`}>
                      {flexRender(header.column.columnDef.header, header.getContext())}<SortIcon aria-hidden="true" className="h-3 w-3 shrink-0" />
                    </button>
                  ) : flexRender(header.column.columnDef.header, header.getContext())}
                </div>
              );
            })}
          </div>
        ))}
        {loadingBusqueda ? (
          <div className="flex min-h-36 items-center justify-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Buscando resultados…</div>
        ) : table.getRowModel().rows?.length ? table.getRowModel().rows.map((row) => {
          const rowOriginal = row.original;
          const anulado = isAnuladoFn?.(rowOriginal);
          const customRowClass = rowClassName?.(rowOriginal) || "";
          return (
            <article key={row.id} role="row" aria-label={`${rowOriginal.cliente?.nombre || (title === "Ventas" ? "Venta" : "Presupuesto")}, ${rowOriginal.numeroPedido || rowOriginal.id?.slice(-8) || "sin número"}`} onClick={(event) => {
              if (event.target instanceof Element && event.target.closest("button, a, [role='button'], [role='menuitem'], input, select")) return;
              onRowClick?.(rowOriginal);
            }} className={`grid cursor-pointer grid-cols-1 gap-x-3 gap-y-2 border-b border-slate-200 px-3 py-3 transition-colors last:border-0 hover:bg-slate-50/70 sm:px-4 xl:grid-cols-[var(--record-columns)] xl:items-center xl:gap-3 xl:px-5 ${anulado ? "bg-rose-50/40" : ""} ${customRowClass}`} style={{ "--record-columns": gridTemplate }}>
              {row.getVisibleCells().map((cell) => {
                const customCellClass = cellClassName?.(rowOriginal, cell.column.id) || "";
                const numeric = ["total", "montoAbonado"].includes(cell.column.id);
                return (
                  <div key={cell.id} role="cell" className={`flex min-w-0 items-start justify-between gap-4 border-b border-slate-100 pb-2 text-right last:border-0 last:pb-0 xl:block xl:border-0 xl:pb-0 xl:text-left ${cell.column.id === "cliente" ? "text-left" : ""} ${cell.column.id === "actions" ? "justify-end border-t pt-2 xl:justify-end xl:border-0 xl:pt-0" : ""} ${numeric ? "tabular-nums xl:text-right" : ""} ${anulado && cell.column.id !== "actions" ? "text-rose-700" : ""} ${customCellClass}`}>
                    <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-slate-400 xl:hidden">{columnLabels[cell.column.id] || cell.column.id}</span>
                    <div className={`min-w-0 ${cell.column.id === "actions" ? "w-auto" : "flex-1 xl:flex-none"} ${numeric ? "text-right" : cell.column.id === "cliente" ? "text-left" : "text-right xl:text-left"}`}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </div>
                  </div>
                );
              })}
            </article>
          );
        }) : (
          <div className="px-4 py-14 text-center">
            <p className="text-sm font-medium text-slate-800">Sin resultados para mostrar</p>
            <p className="mt-1 text-xs text-slate-500">Probá cambiar la búsqueda, el período{showEstadoFiltro ? " o el estado" : ""}.</p>
          </div>
        )}
      </div>
      </div>

      <footer className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-slate-500">{startRow}–{endRow} de {data.length} {title.toLocaleLowerCase("es-AR")}</p>
        <div className="flex items-center justify-between gap-2 sm:justify-end">
          <Select
            value={String(pagination.pageSize)}
            onValueChange={(value) =>
              setPagination({ pageIndex: 0, pageSize: Math.min(100, Number(value) || 10) })
            }
          >
            <SelectTrigger className="h-9 w-28 border-0 bg-transparent text-xs shadow-none">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[10, 20, 50, 100].map((size) => (
                <SelectItem key={size} value={String(size)} className="text-xs">
                  {size} por página
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              setPagination((current) => ({
                ...current,
                pageIndex: Math.max(0, current.pageIndex - 1),
              }))
            }
            disabled={pagination.pageIndex <= 0}
            className="h-8 px-2.5 text-xs"
          >
            <ChevronLeft className="mr-1 h-3.5 w-3.5" />Anterior
          </Button>
          <span className="min-w-12 text-center text-xs tabular-nums text-slate-500">{pagination.pageIndex + 1} / {pageCount}</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              setPagination((current) => ({
                ...current,
                pageIndex: Math.min(pageCount - 1, current.pageIndex + 1),
              }))
            }
            disabled={pagination.pageIndex >= pageCount - 1}
            className="h-8 px-2.5 text-xs"
          >
            Siguiente<ChevronRight className="ml-1 h-3.5 w-3.5" />
          </Button>
        </div>
      </footer>
    </section>
  );
};

const VentasPage = () => {
  const { user } = useAuth();
  const [activeList, setActiveList] = useState("ventas");
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
  const [errorCarga, setErrorCarga] = useState("");
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
      setErrorCarga("");
      if (mostrarCarga) setLoading(true);
      if (esBusqueda && cargarVentas) setLoadingBusquedaVentas(true);
      if (esBusqueda && cargarPresupuestos) setLoadingBusquedaPresupuestos(true);
      const ventasRef = cargarVentas
        ? (limitado
            ? query(collection(db, "ventas"), orderBy("numeroPedido", "desc"), limit(500))
            : collection(db, "ventas"))
        : null;
      const presupuestosRef = cargarPresupuestos
        ? (limitado
            ? query(collection(db, "presupuestos"), orderBy("numeroPedido", "desc"), limit(500))
            : collection(db, "presupuestos"))
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
      setErrorCarga("No se pudieron actualizar las listas. Revisá tu conexión e intentá nuevamente.");
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

    const handleOpenPresupuestoEvent = (event) => {
      if (!event?.detail?.id) return;
      router.push(`/${lang}/presupuestos/${event.detail.id}`);
    };

    const handleOpenVentaEvent = (event) => {
      if (!event?.detail?.id) return;
      router.push(`/${lang}/ventas/${event.detail.id}`);
    };

    window.addEventListener("deletePresupuesto", handleDeletePresupuestoEvent);
    window.addEventListener("editPresupuesto", handleEditPresupuestoEvent);
    window.addEventListener("anularVenta", handleAnularVentaEvent);
    window.addEventListener("editVenta", handleEditVentaEvent);
    window.addEventListener("openPresupuesto", handleOpenPresupuestoEvent);
    window.addEventListener("openVenta", handleOpenVentaEvent);

    return () => {
      window.removeEventListener("deletePresupuesto", handleDeletePresupuestoEvent);
      window.removeEventListener("editPresupuesto", handleEditPresupuestoEvent);
      window.removeEventListener("anularVenta", handleAnularVentaEvent);
      window.removeEventListener("editVenta", handleEditVentaEvent);
      window.removeEventListener("openPresupuesto", handleOpenPresupuestoEvent);
      window.removeEventListener("openVenta", handleOpenVentaEvent);
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
          presupuesto.nombreCliente,
          ...getClienteSearchFields(presupuesto.cliente),
          presupuesto.vendedor,
          presupuesto.estado,
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
          venta.nombreCliente,
          ...getClienteSearchFields(venta.cliente),
          venta.direccionEnvio,
          venta.localidadEnvio,
          venta.vendedor,
          venta.estadoPago,
          venta.estado,
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
    <main className="mx-auto flex min-h-screen w-full max-w-[1500px] flex-col gap-7 px-4 py-6 font-sans text-slate-900 sm:px-7 sm:py-9">
      <header className="flex flex-col gap-5 border-b border-slate-200/80 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[.2em] text-amber-700">Comercial · Gestión</p>
          <h1 className="text-3xl font-semibold tracking-[-.045em] sm:text-4xl">Ventas y presupuestos</h1>
          <p className="mt-2 max-w-xl text-sm text-slate-500">Buscá operaciones, revisá estados y gestioná nuevos registros.</p>
        </div>
        <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:justify-end">
          <Button type="button" onClick={() => router.push(OPCIONES_CREACION.venta.href(lang))} className="h-9 px-3 text-xs font-semibold shadow-none">
            <Plus className="mr-1.5 h-4 w-4" />Nueva venta
          </Button>
          <Button type="button" onClick={() => router.push(OPCIONES_CREACION.presupuesto.href(lang))} className="h-9 px-3 text-xs font-semibold shadow-none">
            <Plus className="mr-1.5 h-4 w-4" />Nuevo presupuesto
          </Button>
          <Button type="button" onClick={() => router.push(`/${lang}/ventas/deudores`)} className="h-9 px-3 text-xs font-semibold shadow-none">
            <Wallet className="mr-1.5 h-4 w-4" />
            Deudores
          </Button>
        </div>
      </header>
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

      {errorCarga ? (
        <p role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          <span>{errorCarga}</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => cargarListas({ limitado: !Boolean(normalize(busquedaVentas) || normalize(busquedaPresupuestos)) })}
            className="h-7 px-2 text-rose-800"
          >
            Reintentar
          </Button>
        </p>
      ) : null}

      <div className="border-b border-slate-200">
        <div role="tablist" aria-label="Tipo de registro" className="flex gap-6">
          {[
            { value: "ventas", label: "Ventas" },
            { value: "presupuestos", label: "Presupuestos" },
          ].map((tab) => (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={activeList === tab.value}
              onClick={() => setActiveList(tab.value)}
              className={`-mb-px flex min-h-11 items-center gap-2 border-b-2 px-1 text-sm transition-colors ${activeList === tab.value ? "border-slate-900 font-semibold text-slate-950" : "border-transparent text-slate-500 hover:text-slate-800"}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeList === "ventas" ? (
        <CompactTableCard
          title="Ventas"
          count={ventasFiltradas.length}
          data={ventasFiltradas}
          columns={columnsVentas}
          searchValue={busquedaVentas}
          onSearchChange={setBusquedaVentas}
          searchPlaceholder="Cliente, número de venta o contacto"
          periodo={periodoVentas}
          onPeriodoChange={setPeriodoVentas}
          estadoFiltro={ventaEstadoFiltro}
          onEstadoFiltroChange={setVentaEstadoFiltro}
          showEstadoFiltro
          mostrarAnulados={mostrarAnuladosVentas}
          onMostrarAnuladosChange={setMostrarAnuladosVentas}
          onRowClick={(item) => router.push(`/${lang}/ventas/${item.id}`)}
          isAnuladoFn={isVentaAnulada}
          loadingBusqueda={loadingBusquedaVentas}
        />
      ) : (
        <CompactTableCard
          title="Presupuestos"
          count={presupuestosFiltrados.length}
          data={presupuestosFiltrados}
          columns={columnsPresupuestos}
          searchValue={busquedaPresupuestos}
          onSearchChange={setBusquedaPresupuestos}
          searchPlaceholder="Cliente, número de presupuesto o contacto"
          periodo={periodoPresupuestos}
          onPeriodoChange={setPeriodoPresupuestos}
          mostrarAnulados={mostrarAnuladosPresupuestos}
          onMostrarAnuladosChange={setMostrarAnuladosPresupuestos}
          onRowClick={(item) => router.push(`/${lang}/presupuestos/${item.id}`)}
          isAnuladoFn={isPresupuestoAnulado}
          loadingBusqueda={loadingBusquedaPresupuestos}
        />
      )}

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
    </main>
  );
};

export default VentasPage;
