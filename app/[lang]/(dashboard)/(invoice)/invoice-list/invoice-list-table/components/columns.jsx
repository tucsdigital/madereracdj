"use client";

import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTableColumnHeader } from "./data-table-column-header";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Icon } from "@iconify/react";
import Link from "next/link";

// Función para formatear fecha
const formatDate = (dateString) => {
  if (!dateString) return "-";
  try {
    return new Date(dateString).toLocaleDateString('es-AR');
  } catch {
    return dateString;
  }
};

// Función para obtener el color del estado
const getStatusColor = (status) => {
  switch (status?.toLowerCase()) {
    case 'pagado':
    case 'paid':
    case 'confirmed':
      return 'success';
    case 'pendiente':
    case 'pending':
    case 'closed':
      return 'warning';
    default:
      return 'default';
  }
};

export const columns = [
  {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && "indeterminate")
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
        className="translate-y-[2px]"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Select row"
        className="translate-y-[2px]"
      />
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: "id",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="ID" />
    ),
    cell: ({ row }) => (
      <div className="w-[80px] font-mono text-xs">
        {row.getValue("id")?.slice(-8) || "-"}
      </div>
    ),
    enableSorting: true,
    enableHiding: false,
  },
  {
    accessorKey: "nombre",
    header: "Nombre",
    cell: ({ row }) => (
        <div className="flex flex-col">
        <span className="text-sm font-medium text-default-600 whitespace-nowrap">
          {row.getValue("nombre") || `Documento ${row.getValue("id")?.slice(-8)}`}
        </span>
        <span className="text-xs text-default-500 whitespace-nowrap">
          {row.original?.tipo || "Documento"}
        </span>
        </div>
    ),
  },
  {
    accessorKey: "cliente",
    header: "Cliente",
    cell: ({ row }) => (
      <div className="flex flex-col">
        <span className="text-sm font-medium text-default-600 whitespace-nowrap">
          {row?.original?.cliente?.nombre || "-"}
        </span>
        <span className="text-xs text-default-500 whitespace-nowrap">
          {row?.original?.cliente?.cuit || row?.original?.cliente?.email || "-"}
        </span>
      </div>
    ),
  },
  {
    accessorKey: "fecha",
    header: "Fecha",
    cell: ({ row }) => (
      <span className="whitespace-nowrap text-sm">
        {formatDate(row.getValue("fecha"))}
      </span>
    ),
  },
  {
    accessorKey: "total",
    header: "Total",
    cell: ({ row }) => (
      <span className="font-medium text-sm">
        ${(row.getValue("total") || 0).toFixed(2)}
      </span>
    ),
  },
  {
    accessorKey: "estadoPago",
    header: "Estado",
    cell: ({ row }) => {
      const status = row.getValue("estadoPago") || row.getValue("status");
      return (
      <Badge
        className="rounded capitalize whitespace-nowrap"
        variant="soft"
          color={getStatusColor(status)}
      >
          {status || "No especificado"}
      </Badge>
      );
    },
  },
  {
    accessorKey: "vencimiento",
    header: "Vencimiento",
    cell: ({ row }) => (
      <span className="whitespace-nowrap text-sm">
        {formatDate(row.getValue("vencimiento"))}
      </span>
    ),
  },
  {
    id: "actions",
    header: "Acciones",
    cell: ({ row }) => {
      return (
        <div className="flex gap-2 items-center justify-end">
        <Button
          size="icon"
            className="h-8 w-8 rounded bg-default-100 dark:bg-default-200 text-default-500 hover:text-primary-foreground hover:bg-primary hover:text-white"
            title="Ver detalle"
        >
            <Icon icon="heroicons:eye" className="w-4 h-4" />
        </Button>
        <Button
          size="icon"
            className="h-8 w-8 rounded bg-default-100 dark:bg-default-200 text-default-500 hover:text-primary-foreground"
            title="Editar"
        >
            <Icon icon="heroicons:pencil-square" className="w-4 h-4" />
        </Button>
        <Button
          size="icon"
            className="h-8 w-8 rounded bg-default-100 dark:bg-default-200 text-default-500 hover:text-primary-foreground"
            title="Eliminar"
        >
            <Icon icon="heroicons:trash" className="w-4 h-4" />
        </Button>
      </div>
      );
    },
  },
];

// Columnas para la tabla de presupuestos
export const columnsPresupuestos = [
  {
    accessorKey: "numeroPedido",
    header: "N° Pedido",
    cell: ({ row }) => (
      <span className="font-mono text-sm text-primary dark:text-primary-300">{row.getValue("numeroPedido") || row.getValue("id")}</span>
    )
  },
  {
    accessorKey: "fecha",
    header: "Fecha",
    cell: ({ row }) => {
      const fecha = row.getValue("fecha");
      if (!fecha) return "-";
      const dateObj = new Date(fecha);
      return (
        <span className="whitespace-nowrap text-sm text-default-700 dark:text-default-200">
          {dateObj.toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}
        </span>
      );
    }
  },
  {
    accessorKey: "total",
    header: "Total",
    cell: ({ row }) => {
      const subtotal = row.original.subtotal ?? 0;
      const descuento = row.original.descuentoTotal ?? 0;
      const costoEnvio = row.original.costoEnvio;
      const total = subtotal - descuento + (costoEnvio !== undefined && costoEnvio !== "" && !isNaN(Number(costoEnvio)) ? Number(costoEnvio) : 0);
      return (
        <span className="font-semibold text-base text-green-700 dark:text-green-400">
          {`$${total.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`}
        </span>
      );
    }
  },
  {
    accessorKey: "costoEnvio",
    header: "Costo Envío",
    cell: ({ row }) => {
      const costo = row.getValue("costoEnvio");
      return costo && !isNaN(Number(costo)) ? (
        <span className="text-base text-blue-700 dark:text-blue-400">${Number(costo).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
      ) : (
        <span className="text-default-400 dark:text-default-500">-</span>
      );
    }
  },
];

// Columnas para la tabla de ventas
export const columnsVentas = [
  {
    accessorKey: "numeroPedido",
    header: "N° Pedido",
    cell: ({ row }) => row.getValue("numeroPedido") || row.getValue("id")
  },
  {
    accessorKey: "cliente.nombre",
    header: "Cliente",
    cell: ({ row }) => row.original.cliente?.nombre || "-"
  },
  {
    accessorKey: "fecha",
    header: "Fecha",
    cell: ({ row }) => {
      const fecha = row.getValue("fecha");
      if (!fecha) return "-";
      const dateObj = new Date(fecha);
      return dateObj.toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });
    }
  },
  {
    accessorKey: "total",
    header: "Total",
    cell: ({ row }) => {
      const subtotal = row.original.subtotal ?? 0;
      const descuento = row.original.descuentoTotal ?? 0;
      const costoEnvio = row.original.costoEnvio;
      const total = subtotal - descuento + (costoEnvio !== undefined && costoEnvio !== "" && !isNaN(Number(costoEnvio)) ? Number(costoEnvio) : 0);
      return total ? `$${total.toLocaleString('es-AR', { minimumFractionDigits: 2 })}` : "-";
    }
  },
  {
    accessorKey: "tipoEnvio",
    header: "Tipo Envío",
    cell: ({ row }) => {
      const tipo = row.getValue("tipoEnvio");
      const tipos = {
        retiro_local: "Retiro Local",
        envio_domicilio: "Domicilio",
        envio_obra: "Obra",
        transporte_propio: "Transporte Propio",
      };
      return tipos[tipo] || tipo;
    }
  },
  {
    accessorKey: "vendedor",
    header: "Vendedor",
    cell: ({ row }) => row.getValue("vendedor") || "-"
  },
  {
    accessorKey: "prioridad",
    header: "Prioridad",
    cell: ({ row }) => row.getValue("prioridad") || "-"
  },
  {
    accessorKey: "estado",
    header: "Estado",
    cell: ({ row }) => row.getValue("estado") || "-"
  },
];
