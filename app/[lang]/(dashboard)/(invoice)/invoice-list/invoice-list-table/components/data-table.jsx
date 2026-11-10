"use client";

import * as React from "react";
import {
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
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

import { DataTablePagination } from "./data-table-pagination";
import { DataTableToolbar } from "./data-table-toolbar";
import { useRouter, useParams } from "next/navigation";
import { Icon } from "@iconify/react";

export function DataTable({ columns, data, rowClassName, cellClassName, responsive = false }) {
  const [rowSelection, setRowSelection] = React.useState({});
  const [columnVisibility, setColumnVisibility] = React.useState({});
  const [columnFilters, setColumnFilters] = React.useState([]);
  const [sorting, setSorting] = React.useState([
    {
      id: "fechaCreacion",
      desc: true,
    },
  ]);
  const [globalFilter, setGlobalFilter] = React.useState("");
  const router = useRouter();
  const params = useParams();
  const { lang } = params;

  // console.log("DataTable data:", data);

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      columnVisibility,
      rowSelection,
      columnFilters,
      globalFilter,
    },
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
  });

  // Función para manejar el click en la fila
  const handleRowClick = (row) => {
    const tipo = row.original?.tipo || 'documento';
    const id = row.original?.id;
    const numeroPedido = row.original?.numeroPedido;
    
    // Si tiene numeroPedido, es del contexto de obras-proyectos
    if (numeroPedido && numeroPedido.startsWith('OBRA-')) {
      router.push(`/${lang}/obras/${id}`);
    } else if (tipo === 'presupuesto') {
      router.push(`/${lang}/presupuestos/${id}`);
    } else if (tipo === 'venta') {
      router.push(`/${lang}/ventas/${id}`);
    }
  };

  return (
    <div className="w-full bg-card">
      <div className="p-4 bg-card">
        <DataTableToolbar table={table} />
      </div>
      <div className={responsive ? "" : "overflow-x-auto"}>
        <Table className={`w-full bg-card ${responsive ? "block min-w-0 lg:table" : ""}`}>
          <TableHeader className={`bg-muted/50 ${responsive ? "hidden lg:table-header-group" : ""}`}>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className={`bg-muted/50 ${responsive ? "hidden lg:table-row" : ""}`}>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className="px-4 py-2 text-left text-muted-foreground font-semibold"
                  >
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody className={responsive ? "block lg:table-row-group" : ""}>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                  className={`border-b border-border/50 cursor-pointer hover:bg-muted/30 bg-card transition-colors ${responsive ? "block py-2 lg:table-row lg:py-0" : ""} ${
                    typeof rowClassName === "function"
                      ? rowClassName(row.original) || ""
                      : rowClassName || ""
                  }`}
                  onClick={() => handleRowClick(row)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className={`px-3 py-2 text-foreground ${responsive ? "block border-0 lg:table-cell lg:border-b lg:px-4" : ""} ${
                        typeof cellClassName === "function"
                          ? cellClassName(row.original, cell.column.id) || ""
                          : cellClassName || ""
                      }`}
                    >
                      {responsive ? (
                        <div className="flex min-w-0 items-start justify-between gap-3 lg:contents">
                          <span className="w-[34%] shrink-0 pt-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground lg:hidden">
                            {typeof cell.column.columnDef.header === "string" ? cell.column.columnDef.header : cell.column.id}
                          </span>
                          <div className="min-w-0 flex-1 text-right lg:text-left">
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </div>
                        </div>
                      ) : flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                  No hay resultados.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      {/* Paginador sin borde */}
      <div className="p-4 bg-card">
        <DataTablePagination table={table} />
      </div>
    </div>
  );
}
