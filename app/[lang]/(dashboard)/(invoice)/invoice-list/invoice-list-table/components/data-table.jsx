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
  const [sorting, setSorting] = React.useState([]);
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
    },
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
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
    
    if (tipo === 'presupuesto') {
      router.push(`/${lang}/presupuestos/${id}`);
    } else if (tipo === 'venta') {
      router.push(`/${lang}/ventas/${id}`);
    }
  };

  return (
    <div>
      <div className="p-6">
        <DataTableToolbar table={table} />
      </div>

      <div>
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead
                      key={header.id}
                      colSpan={header.colSpan}
                      className="last:ltr:text-end last:rtl:text-left whitespace-nowrap"
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody className="[&_tr:last-child]:border-1">
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row, idx) => (
                <TableRow
                  key={row.original.id ? String(row.original.id) : String(idx)}
                  data-state={row.getIsSelected() && "selected"}
                  className="cursor-pointer hover:bg-gray-50 transition-colors group relative"
                  onClick={() => handleRowClick(row)}
                  title="Click para ver detalles"
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className="text-sm text-default-600 last:text-end"
                      onClick={(e) => {
                        // Prevenir la navegación si se hace click en botones de acción
                        if (cell.column.id === 'actions' || cell.column.id === 'select') {
                          e.stopPropagation();
                        }
                      }}
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                  {/* Indicador visual de que la fila es clickeable */}
                  <div className="absolute right-2 top-1/2 transform -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Icon icon="heroicons:arrow-right" className="w-4 h-4 text-gray-400" />
                  </div>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  <div className="flex flex-col items-center gap-2">
                    <Icon icon="heroicons:document-text" className="w-8 h-8 text-gray-400" />
                    <p className="text-gray-500">No hay documentos para mostrar</p>
                    <p className="text-sm text-gray-400">Haz click en "Agregar Presupuesto" o "Agregar Venta" para comenzar</p>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      
      {/* Información sobre la funcionalidad */}
      {table.getRowModel().rows?.length > 0 && (
        <div className="px-6 py-3 bg-blue-50 border-t border-blue-200">
          <div className="flex items-center gap-2 text-sm text-blue-700">
            <Icon icon="heroicons:information-circle" className="w-4 h-4" />
            <span>💡 <strong>Tip:</strong> Haz click en cualquier fila para ver los detalles del documento</span>
          </div>
        </div>
      )}
      
      <DataTablePagination table={table} /> 
    </div>
  );
}
