"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowDown, ArrowDownUp, ArrowUp, ChevronLeft, ChevronRight, Download, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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

const getMobileColumnLabel = (column) => {
  const header = column.columnDef.header;
  if (typeof header === "string") return header;

  const labels = {
    numeroPedido: "Número",
    cliente: "Cliente",
    fechaCreacion: "Fecha",
    presupuestoTotal: "Total",
    estadoUI: "Estado",
    estado: "Estado",
    bloques: "Bloques",
    pago: "Pago",
    debe: "Debe",
    actions: "Acciones",
  };

  return labels[column.id] || String(column.id).replace(/([A-Z])/g, " $1");
};

const escaparCSV = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;

const getExportValue = (record, column) => {
  if (typeof column.exportValue === "function") return column.exportValue(record);

  const accessor = column.accessorKey || column.id;
  if (!accessor || accessor === "actions") return "";
  const value = String(accessor).split(".").reduce((current, key) => current?.[key], record);
  if (accessor === "cliente") return value?.nombre?.toLocaleUpperCase("es-AR") || "Sin nombre";
  if (typeof value?.toDate === "function") return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return value && typeof value === "object" ? JSON.stringify(value) : value ?? "";
};

const isNumericColumn = (columnId) =>
  ["presupuestoTotal", "pago", "debe"].includes(String(columnId));

export function ObrasListTable({
  tabs = [],
  activeTab,
  onActiveTabChange,
  data,
  columns,
  searchValue,
  onSearchChange,
  searchPlaceholder = "Buscar...",
  toolbarLeft = null,
  toolbarRight = null,
  toolbarAction = null,
  defaultSorting = [],
  onRowClick,
  rowClassName,
  cellClassName,
  title = "Listado",
  description = "Consultá y gestioná los registros de esta lista.",
  loading = false,
}) {
  const [sorting, setSorting] = useState(defaultSorting);
  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize: 10,
  });

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

  const table = useReactTable({
    data,
    columns: columnsWithCorrelativeSort,
    state: {
      sorting,
      pagination,
    },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  useEffect(() => {
    setPagination((current) => ({ ...current, pageIndex: 0 }));
  }, [data, searchValue]);

  const totalRows = table.getRowCount();
  const currentPage = table.getState().pagination.pageIndex + 1;
  const totalPages = Math.max(table.getPageCount(), 1);
  const pageSize = table.getState().pagination.pageSize;
  const gridTemplate = table.getVisibleLeafColumns().map((column) => {
    if (column.id === "numeroPedido") return "minmax(120px, .9fr)";
    if (column.id === "cliente") return "minmax(180px, 1.6fr)";
    if (column.id === "actions") return "minmax(115px, auto)";
    if (["presupuestoTotal", "pago", "debe"].includes(column.id)) return "minmax(105px, .8fr)";
    if (["estado", "estadoUI", "bloques"].includes(column.id)) return "minmax(100px, .8fr)";
    return "minmax(105px, .9fr)";
  }).join(" ");
  const startRow = totalRows === 0 ? 0 : table.getState().pagination.pageIndex * pageSize + 1;
  const endRow =
    totalRows === 0
      ? 0
      : Math.min((table.getState().pagination.pageIndex + 1) * pageSize, totalRows);

  const exportarCSV = () => {
    const exportableColumns = columnsWithCorrelativeSort.filter(
      (column) => String(column.id || column.accessorKey || "") !== "actions"
    );
    const encabezados = exportableColumns.map(getMobileColumnLabel);
    const filas = data.map((record) =>
      exportableColumns.map((column) => getExportValue(record, column))
    );
    const contenido = [encabezados, ...filas]
      .map((fila) => fila.map(escaparCSV).join(","))
      .join("\r\n");
    const blob = new Blob([`\uFEFF${contenido}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${String(title).toLocaleLowerCase("es-AR").replace(/[^a-z0-9]+/g, "-")}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const visiblePages = useMemo(() => {
    if (totalPages <= 5) {
      return Array.from({ length: totalPages }, (_, index) => index + 1);
    }

    if (currentPage <= 3) {
      return [1, 2, 3, 4, 5];
    }

    if (currentPage >= totalPages - 2) {
      return [
        totalPages - 4,
        totalPages - 3,
        totalPages - 2,
        totalPages - 1,
        totalPages,
      ];
    }

    return [
      currentPage - 2,
      currentPage - 1,
      currentPage,
      currentPage + 1,
      currentPage + 2,
    ];
  }, [currentPage, totalPages]);

  return (
    <Tabs value={activeTab} onValueChange={onActiveTabChange} className="space-y-3">
      {tabs.length > 0 && (
        <TabsList className="h-auto rounded-none border-b border-slate-200 bg-transparent p-0">
          {tabs.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value} className="h-10 rounded-none border-b-2 border-transparent px-4 text-sm text-slate-500 shadow-none data-[state=active]:border-[#183f38] data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:text-[#183f38] data-[state=active]:shadow-none">
              <span>{tab.label}</span>
              <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">{tab.count}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      )}

      <TabsContent value={activeTab} className="mt-0">
        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="flex flex-col gap-4 border-b border-slate-200 px-4 py-4 sm:px-5 xl:flex-row xl:items-end xl:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 className="text-lg font-semibold tracking-tight text-slate-950">{title}</h2>
                <span className="text-xs tabular-nums text-slate-500">{totalRows} registros</span>
              </div>
              <p className="mt-1 text-sm text-slate-500">{description}</p>
            </div>

            <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2 xl:flex xl:w-auto xl:flex-nowrap xl:items-center xl:justify-end">
              <div className="relative min-w-0 sm:col-span-2 xl:w-[280px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <Input
                  value={searchValue}
                  onChange={(event) => onSearchChange(event.target.value)}
                  placeholder={searchPlaceholder}
                  aria-label={`Buscar en ${title}`}
                  className="h-9 rounded-md border border-slate-200 bg-white pl-9 pr-3 text-xs shadow-none placeholder:text-slate-500 focus-visible:border-slate-400 focus-visible:ring-1 focus-visible:ring-slate-300"
                />
              </div>
              {toolbarRight}
              <Button
                type="button"
                variant="outline"
                onClick={exportarCSV}
                disabled={loading || totalRows === 0}
                className="h-9 justify-center rounded-md border-slate-200 bg-white px-3 text-xs font-medium text-slate-800 shadow-none hover:bg-slate-50"
              >
                <Download className="mr-2 h-4 w-4" />Exportar
              </Button>
              {toolbarAction}
            </div>
          </div>

          <div role="table" aria-label={title}>
            {table.getHeaderGroups().map((headerGroup) => (
              <div key={headerGroup.id} role="row" className="hidden gap-4 border-b border-slate-200 bg-slate-50/70 px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[.12em] text-slate-500 lg:grid lg:px-5" style={{ gridTemplateColumns: gridTemplate }}>
                {headerGroup.headers.map((header) => {
                  const sorted = header.column.getIsSorted();
                  const SortIcon = sorted === "asc" ? ArrowUp : sorted === "desc" ? ArrowDown : ArrowDownUp;
                  const right = isNumericColumn(header.column.id) || header.column.id === "actions";
                  return (
                    <div key={header.id} role="columnheader" aria-sort={sorted ? (sorted === "asc" ? "ascending" : "descending") : "none"} className={right ? "text-right" : ""}>
                      {header.isPlaceholder ? null : header.column.getCanSort() ? (
                        <button type="button" onClick={header.column.getToggleSortingHandler()} className={`inline-flex items-center gap-1.5 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 ${right ? "justify-end" : ""}`}>
                          {flexRender(header.column.columnDef.header, header.getContext())}<SortIcon aria-hidden="true" className="h-3 w-3 shrink-0" />
                        </button>
                      ) : flexRender(header.column.columnDef.header, header.getContext())}
                    </div>
                  );
                })}
              </div>
            ))}
            {loading ? (
              <div className="flex min-h-32 items-center justify-center gap-2 text-sm text-slate-500"><span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-800" />Cargando resultados…</div>
            ) : table.getRowModel().rows.length ? table.getRowModel().rows.map((row) => (
              <article
                key={row.id}
                role="row"
                tabIndex={onRowClick ? 0 : undefined}
                onClick={(event) => {
                  if (!onRowClick || (event.target instanceof Element && event.target.closest("button, a, [role='button'], input, select"))) return;
                  onRowClick(row.original);
                }}
                onKeyDown={(event) => {
                  if (onRowClick && event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
                    event.preventDefault();
                    onRowClick(row.original);
                  }
                }}
                className={`grid grid-cols-1 gap-x-4 gap-y-2 border-b border-slate-200 px-3 py-4 transition-colors last:border-0 hover:bg-slate-50/60 motion-reduce:transition-none sm:px-4 lg:grid-cols-[var(--list-grid)] lg:items-center lg:px-5 lg:py-3 ${onRowClick ? "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-400" : ""} ${rowClassName ? rowClassName(row.original) : ""}`}
                style={{ "--list-grid": gridTemplate }}
              >
                {row.getVisibleCells().map((cell, index) => (
                  <div key={cell.id} role="cell" className={`flex min-w-0 items-start justify-between gap-3 text-xs text-slate-700 lg:block ${index === 0 ? "border-b border-slate-100 pb-2 lg:border-0 lg:pb-0" : ""} ${isNumericColumn(cell.column.id) ? "lg:text-right" : "lg:text-left"} ${cell.column.id === "actions" ? "justify-end border-t border-slate-100 pt-2 lg:border-0 lg:pt-0" : ""} ${cellClassName ? cellClassName(row.original, cell.column.id) : ""}`}>
                    <span className="w-[34%] shrink-0 pt-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400 lg:hidden">{getMobileColumnLabel(cell.column)}</span>
                    <div className={`min-w-0 flex-1 ${cell.column.id === "actions" ? "flex justify-end" : isNumericColumn(cell.column.id) ? "text-right lg:text-right" : "text-right lg:text-left"}`}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </div>
                  </div>
                ))}
              </article>
            )) : (
              <div className="px-4 py-14 text-center"><p className="text-sm font-medium text-slate-800">No hay registros para esta vista</p><p className="mt-1 text-xs text-slate-500">Probá modificar la búsqueda o los filtros.</p></div>
            )}
          </div>

          <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="text-xs text-slate-500">
              Mostrando {startRow} a {endRow} de {totalRows} resultados
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span>Mostrar:</span>
                <Select
                  value={String(pageSize)}
                  onValueChange={(value) =>
                    table.setPageSize(Number(value))
                  }
                >
                  <SelectTrigger className="h-8 w-[74px] border-0 bg-transparent text-xs shadow-none">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[10, 20, 50, 100].map((size) => (
                      <SelectItem key={size} value={String(size)}>
                        {size}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-full text-slate-500 hover:bg-slate-100"
                  onClick={() => table.previousPage()}
                  disabled={!table.getCanPreviousPage()}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>

                {visiblePages.map((pageNumber) => (
                  <Button
                    key={pageNumber}
                    variant={pageNumber === currentPage ? "default" : "ghost"}
                    size="icon"
                    className={`h-8 w-8 rounded-full ${
                      pageNumber === currentPage
                        ? "bg-[#183f38] text-white hover:bg-[#24574d]"
                        : "text-slate-500 hover:bg-slate-100"
                    }`}
                    onClick={() => table.setPageIndex(pageNumber - 1)}
                  >
                    {pageNumber}
                  </Button>
                ))}

                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-full text-slate-500 hover:bg-slate-100"
                  onClick={() => table.nextPage()}
                  disabled={!table.getCanNextPage()}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </section>
      </TabsContent>
    </Tabs>
  );
}
