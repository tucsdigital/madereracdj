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
    const fecha = new Date(dateString);
    return (
      fecha.toLocaleDateString("es-AR") +
      " " +
      fecha.toLocaleTimeString("es-AR", {
        hour: "2-digit",
        minute: "2-digit",
      })
    );
  } catch {
    return dateString;
  }
};

// Función para obtener el color del estado
const getStatusColor = (status) => {
  switch (status?.toLowerCase()) {
    case "pagado":
    case "paid":
    case "confirmed":
      return "success";
    case "pendiente":
    case "pending":
    case "closed":
      return "warning";
    default:
      return "default";
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
          {row.getValue("nombre") ||
            `Documento ${row.getValue("id")?.slice(-8)}`}
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
          {(row?.original?.cliente?.nombre || "-").toUpperCase()}
        </span>
        <span className="text-xs text-default-500 whitespace-nowrap">
          {row?.original?.cliente?.cuit || row?.original?.cliente?.email || "-"}
        </span>
      </div>
    ),
  },
  {
    accessorKey: "fechaCreacion",
    header: "Fecha",
    cell: ({ row }) => {
      const fecha = row.getValue("fechaCreacion");
      return (
        <span className="inline-block px-2 py-1 rounded bg-muted/50 text-muted-foreground font-semibold text-xs">
          {formatDate(fecha)}
        </span>
      );
    },
    enableSorting: true,
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
            className="h-8 w-8 rounded bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted"
            title="Ver detalle"
          >
            <Icon icon="heroicons:eye" className="w-4 h-4" />
          </Button>
          <Button
            size="icon"
            className="h-8 w-8 rounded bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted"
            title="Editar"
          >
            <Icon icon="heroicons:pencil-square" className="w-4 h-4" />
          </Button>
          <Button
            size="icon"
            className="h-8 w-8 rounded bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted"
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
    ),
  },
  {
    accessorKey: "cliente",
    header: "Cliente",
    cell: ({ row }) => (
      <span className="font-semibold text-foreground">
        {(row.original.cliente?.nombre || "-").toUpperCase()}
      </span>
    ),
    enableSorting: true,
  },
  {
    accessorKey: "fechaCreacion",
    header: "Fecha",
    cell: ({ row }) => {
      const fecha = row.getValue("fechaCreacion");
      return (
        <span className="inline-block px-2 py-1 rounded bg-muted/50 text-muted-foreground font-semibold text-xs">
          {formatDate(fecha)}
        </span>
      );
    },
  },
  {
    accessorKey: "total",
    header: "Total",
    cell: ({ row }) => {
      const total = row.original.total ?? 0;
      return (
        <span className="inline-block px-2 py-1 rounded border border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-semibold text-base">
          {`$${total.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`}
        </span>
      );
    },
    enableSorting: true,
  },
  {
    accessorKey: "costoEnvio",
    header: "Costo Envío",
    cell: ({ row }) => {
      const costo = row.getValue("costoEnvio");
      return costo && !isNaN(Number(costo)) ? (
        <span className="inline-block px-2 py-1 rounded border border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-300 font-medium">
          ${Number(costo).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
        </span>
      ) : (
        <span className="inline-block px-2 py-1 rounded bg-muted/30 text-muted-foreground">
          -
        </span>
      );
    },
  },
  {
    accessorKey: "vendedor",
    header: "Vendedor",
    cell: ({ row }) => (
      <span className="text-foreground">
        {row.getValue("vendedor") || "-"}
      </span>
    ),
    enableSorting: true,
  },
  {
    id: "actions",
    header: "Acciones",
    cell: ({ row }) => {
      const presupuesto = row.original;
      return (
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/es/presupuestos/${presupuesto.id}`}>
              <Icon icon="heroicons:eye" className="w-4 h-4" />
            </Link>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/es/presupuestos/${presupuesto.id}?edit=true`}>
              <Icon icon="heroicons:pencil" className="w-4 h-4" />
            </Link>
          </Button>
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => {
              if (window.confirm('¿Estás seguro de que quieres eliminar este presupuesto? Esta acción no se puede deshacer.')) {
                // La función de borrado se manejará en el componente padre
                window.dispatchEvent(new CustomEvent('deletePresupuesto', { 
                  detail: { id: presupuesto.id, tipo: 'presupuesto' } 
                }));
              }
            }}
            className="text-red-700 dark:text-red-300 hover:text-red-700 hover:bg-red-500/10"
          >
            <Icon icon="heroicons:trash" className="w-4 h-4" />
          </Button>
        </div>
      );
    },
    enableSorting: false,
    enableHiding: false,
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
    ),
  },
  {
    accessorKey: "cliente.nombre",
    header: "Cliente",
    cell: ({ row }) => (
      <span className="font-semibold text-foreground">
        {(row.original.cliente?.nombre || "-").toUpperCase()}
      </span>
    ),
    enableSorting: true,
  },
  {
    accessorKey: "fechaCreacion",
    header: "Fecha",
    cell: ({ row }) => {
      const fecha = row.getValue("fechaCreacion");
      return (
        <span className="inline-block px-2 py-1 rounded bg-muted/50 text-muted-foreground font-semibold text-xs">
          {formatDate(fecha)}
        </span>
      );
    },
    enableSorting: true,
  },
  {
    accessorKey: "total",
    header: "Total",
    cell: ({ row }) => {
      const total = row.original.total ?? 0;
      return (
        <span className="inline-block px-2 py-1 rounded border border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-semibold text-base">
          {total
            ? `$${total.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`
            : "-"}
        </span>
      );
    },
    enableSorting: true,
  },
  {
    accessorKey: "estadoPago",
    header: "Estado Pago",
    cell: ({ row }) => {
      const venta = row.original;
      const total = venta.total || 0;

      // Calcular monto abonado correctamente: priorizar array pagos, sino usar montoAbonado
      const montoAbonado =
        Array.isArray(venta.pagos) && venta.pagos.length > 0
          ? venta.pagos.reduce((acc, p) => acc + Number(p.monto), 0)
          : Number(venta.montoAbonado || 0);

      const saldoPendiente = total - montoAbonado;

      // Determinar estado de pago
      let color = "",
        texto = "";

      if (montoAbonado >= total) {
        color =
          "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20";
        texto = "Completo";
      } else if (montoAbonado > 0) {
        color =
          "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20";
        texto = `Parcial (Falta $${saldoPendiente.toLocaleString("es-AR", {
          minimumFractionDigits: 2,
        })})`;
      } else {
        color =
          "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/20";
        texto = `Pendiente ($${total.toLocaleString("es-AR", {
          minimumFractionDigits: 2,
        })})`;
      }

      return (
        <span
          className={`inline-block px-2 py-1 rounded border ${color} font-medium text-xs`}
        >
          {texto}
        </span>
      );
    },
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
        <span className="inline-block px-2 py-1 rounded border border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-300 font-medium">
          {tipos[tipo] || tipo}
        </span>
      );
    },
  },
  {
    accessorKey: "vendedor",
    header: "Vendedor",
    cell: ({ row }) => (
      <span className="text-foreground">
        {row.getValue("vendedor") || "-"}
      </span>
    ),
    enableSorting: true,
  },
  {
    accessorKey: "prioridad",
    header: "Prioridad",
    cell: ({ row }) => (
      <span className="inline-block px-2 py-1 rounded border border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300 font-medium">
        {row.getValue("prioridad") || "-"}
      </span>
    ),
  },
  {
    id: "actions",
    header: "Acciones",
    cell: ({ row }) => {
      const venta = row.original;
      return (
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/es/ventas/${venta.id}`}>
              <Icon icon="heroicons:eye" className="w-4 h-4" />
            </Link>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/es/ventas/${venta.id}?edit=true`}>
              <Icon icon="heroicons:pencil" className="w-4 h-4" />
            </Link>
          </Button>
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => {
              if (window.confirm('¿Estás seguro de que quieres eliminar esta venta? Esta acción no se puede deshacer y repondrá el stock de los productos.')) {
                // La función de borrado se manejará en el componente padre
                window.dispatchEvent(new CustomEvent('deleteVenta', { 
                  detail: { id: venta.id, tipo: 'venta' } 
                }));
              }
            }}
            className="text-red-700 dark:text-red-300 hover:text-red-700 hover:bg-red-500/10"
          >
            <Icon icon="heroicons:trash" className="w-4 h-4" />
          </Button>
        </div>
      );
    },
    enableSorting: false,
    enableHiding: false,
  },
];

export const columnsObras = [
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
    accessorKey: "numeroPedido",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Número" />
    ),
    cell: ({ row }) => (
      <div className="w-[120px] font-mono text-xs">
        {row.getValue("numeroPedido") || row.getValue("id")?.slice(-8) || "-"}
      </div>
    ),
    enableSorting: true,
    enableHiding: false,
  },
  {
    accessorKey: "fecha",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Fecha" />
    ),
    cell: ({ row }) => (
      <div className="w-[100px]">{formatDate(row.getValue("fecha"))}</div>
    ),
    enableSorting: true,
  },
  {
    accessorKey: "cliente",
    header: "Cliente",
    cell: ({ row }) => (
      <div className="flex flex-col">
        <span className="text-sm font-medium text-default-600 whitespace-nowrap">
          {(row?.original?.cliente?.nombre || "-").toUpperCase()}
        </span>
        <span className="text-xs text-default-500 whitespace-nowrap">
          {row?.original?.cliente?.cuit || row?.original?.cliente?.email || "-"}
        </span>
      </div>
    ),
  },
  {
    accessorKey: "tipo",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Tipo" />
    ),
    cell: ({ row }) => {
      const tipo = row.getValue("tipo");
      return (
        <Badge variant={tipo === "obra" ? "default" : "secondary"}>
          {tipo === "obra" ? "Obra" : "Proyecto"}
        </Badge>
      );
    },
    enableSorting: true,
  },
  {
    accessorKey: "total",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Total" />
    ),
    cell: ({ row }) => {
      const total = row.getValue("total");
      return (
        <div className="text-right font-medium">
          $
          {total
            ? Number(total).toLocaleString("es-AR", {
                minimumFractionDigits: 2,
              })
            : "0.00"}
        </div>
      );
    },
    enableSorting: true,
  },
  {
    accessorKey: "estado",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Estado" />
    ),
    cell: ({ row }) => {
      const estado = row.getValue("estado");
      const color = getStatusColor(estado);
      return <Badge variant={color}>{estado || "Pendiente"}</Badge>;
    },
    enableSorting: true,
  },
  {
    id: "actions",
    header: "Acciones",
    cell: ({ row }) => {
      const obra = row.original;
      return (
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/es/obras/${obra.id}`}>
              <Icon icon="heroicons:eye" className="w-4 h-4" />
            </Link>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/es/obras/${obra.id}?edit=true`}>
              <Icon icon="heroicons:pencil" className="w-4 h-4" />
            </Link>
          </Button>
        </div>
      );
    },
    enableSorting: false,
    enableHiding: false,
  },
];
