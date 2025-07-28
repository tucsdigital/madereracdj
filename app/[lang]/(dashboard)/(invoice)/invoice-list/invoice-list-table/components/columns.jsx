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
    // Corregir el cálculo de la fecha para evitar el problema de zona horaria
    const fecha = new Date(dateString + 'T00:00:00');
    return fecha.toLocaleDateString('es-AR');
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
      <span className="font-mono text-sm px-2 py-1 rounded bg-primary/10 dark:bg-primary/20 text-primary dark:text-primary-300 inline-block">
        {row.getValue("numeroPedido") || row.getValue("id")}
      </span>
    )
  },
  {
    accessorKey: "cliente",
    header: "Cliente",
    cell: ({ row }) => (
      <span className="font-semibold text-default-800 dark:text-default-200">
        {row.original.cliente?.nombre || "-"}
      </span>
    )
  },
  {
    accessorKey: "fecha",
    header: "Fecha",
    cell: ({ row }) => {
      const fecha = row.getValue("fecha");
      if (!fecha) return <span className="text-default-400 dark:text-default-500">-</span>;
      // Corregir el cálculo de la fecha para evitar el problema de zona horaria
      const dateObj = new Date(fecha + 'T00:00:00');
      return (
        <span className="inline-block px-2 py-1 rounded bg-gray-100 dark:bg-default-800 text-default-700 dark:text-default-200 font-semibold text-xs">
          {dateObj.toLocaleDateString('es-AR')}
        </span>
      );
    }
  },
  {
    accessorKey: "total",
    header: "Total",
    cell: ({ row }) => {
      const total = row.original.total ?? 0;
      return (
        <span className="inline-block px-2 py-1 rounded bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-400 font-semibold text-base">
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
        <span className="inline-block px-2 py-1 rounded bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-400 font-medium">
          ${Number(costo).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
        </span>
      ) : (
        <span className="inline-block px-2 py-1 rounded bg-gray-100 dark:bg-default-800 text-default-400 dark:text-default-500">-</span>
      );
    }
  },
];

// Columnas para la tabla de ventas
export const columnsVentas = [
  {
    accessorKey: "numeroPedido",
    header: "N° Pedido",
    cell: ({ row }) => (
      <span className="font-mono text-sm px-2 py-1 rounded bg-primary/10 dark:bg-primary/20 text-primary dark:text-primary-300 inline-block">
        {row.getValue("numeroPedido") || row.getValue("id")}
      </span>
    )
  },
  {
    accessorKey: "cliente.nombre",
    header: "Cliente",
    cell: ({ row }) => (
      <span className="font-semibold text-default-800 dark:text-default-200">
        {row.original.cliente?.nombre || "-"}
      </span>
    )
  },
  {
    accessorKey: "fecha",
    header: "Fecha",
    cell: ({ row }) => {
      const fecha = row.getValue("fecha");
      if (!fecha) return <span className="text-default-400 dark:text-default-500">-</span>;
      // Corregir el cálculo de la fecha para evitar el problema de zona horaria
      const dateObj = new Date(fecha + 'T00:00:00');
      return (
        <span className="inline-block px-2 py-1 rounded bg-gray-100 dark:bg-default-800 text-default-700 dark:text-default-200 font-semibold text-xs">
          {dateObj.toLocaleDateString('es-AR')}
        </span>
      );
    }
  },
  {
    accessorKey: "total",
    header: "Total",
    cell: ({ row }) => {
      const total = row.original.total ?? 0;
      return (
        <span className="inline-block px-2 py-1 rounded bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-400 font-semibold text-base">
          {total ? `$${total.toLocaleString('es-AR', { minimumFractionDigits: 2 })}` : "-"}
        </span>
      );
    }
  },
  {
    accessorKey: "estadoPago",
    header: "Estado Pago",
    cell: ({ row }) => {
      const venta = row.original;
      const total = venta.total || 0;
      
      // Calcular monto abonado correctamente: priorizar array pagos, sino usar montoAbonado
      const montoAbonado = Array.isArray(venta.pagos) && venta.pagos.length > 0
        ? venta.pagos.reduce((acc, p) => acc + Number(p.monto), 0)
        : Number(venta.montoAbonado || 0);
      
      const saldoPendiente = total - montoAbonado;
      
      // Determinar estado de pago
      let estadoPago, color, texto;
      
      if (montoAbonado >= total) {
        estadoPago = "completo";
        color = "bg-green-100 text-green-800 border-green-200";
        texto = "Completo";
      } else if (montoAbonado > 0) {
        estadoPago = "parcial";
        color = "bg-yellow-100 text-yellow-800 border-yellow-200";
        texto = `Parcial (Falta $${saldoPendiente.toFixed(2)})`;
      } else {
        estadoPago = "pendiente";
        color = "bg-red-100 text-red-800 border-red-200";
        texto = `Pendiente ($${total.toFixed(2)})`;
      }
      
      return (
        <span className={`inline-block px-2 py-1 rounded border ${color} font-medium text-xs`}>
          {texto}
        </span>
      );
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
      return (
        <span className="inline-block px-2 py-1 rounded bg-blue-50 dark:bg-blue-900 text-blue-700 dark:text-blue-300 font-medium">
          {tipos[tipo] || tipo}
        </span>
      );
    }
  },
  {
    accessorKey: "vendedor",
    header: "Vendedor",
    cell: ({ row }) => (
      <span className="text-default-700 dark:text-default-300">{row.getValue("vendedor") || "-"}</span>
    )
  },
  {
    accessorKey: "prioridad",
    header: "Prioridad",
    cell: ({ row }) => (
      <span className="inline-block px-2 py-1 rounded bg-yellow-50 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300 font-medium">
        {row.getValue("prioridad") || "-"}
      </span>
    )
  },
  {
    accessorKey: "estado",
    header: "Estado",
    cell: ({ row }) => (
      <span className="inline-block px-2 py-1 rounded bg-gray-200 dark:bg-default-700 text-default-700 dark:text-default-200 font-medium">
        {row.getValue("estado") || "-"}
      </span>
    )
  },
];
