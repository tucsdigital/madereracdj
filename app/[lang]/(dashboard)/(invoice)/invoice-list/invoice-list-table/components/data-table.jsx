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

export function DataTable({ columns, data }) {
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
      <div className="overflow-x-auto">
        <Table className="w-full bg-card">
          <TableHeader className="bg-muted/50">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="bg-muted/50">
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
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                  className="border-b border-border/50 cursor-pointer hover:bg-muted/30 bg-card transition-colors"
                  onClick={() => handleRowClick(row)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className="px-4 py-2 text-foreground"
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
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
