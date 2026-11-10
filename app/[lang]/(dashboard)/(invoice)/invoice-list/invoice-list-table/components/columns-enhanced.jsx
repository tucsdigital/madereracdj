"use client";

import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ExternalLink, MapPin, MoreHorizontal, Pencil, Phone, Trash2 } from "lucide-react";

// Función para formatear fecha
const formatDate = (dateString) => {
  if (!dateString) return "-";
  try {
    const fecha = new Date(dateString);
    return (
      fecha.toLocaleDateString("es-AR", {
        timeZone: "America/Argentina/Buenos_Aires",
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
      }) +
      " " +
      fecha.toLocaleTimeString("es-AR", {
        timeZone: "America/Argentina/Buenos_Aires",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
      })
    );
  } catch {
    return dateString;
  }
};

const getStatusInfo = (value) => {
  const raw = String(value || "Sin estado").trim();
  const normalized = raw.toLocaleLowerCase("es-AR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const labels = {
    pagado: "Pagado",
    paid: "Pagado",
    confirmed: "Confirmado",
    parcial: "Pago parcial",
    partial: "Pago parcial",
    pendiente: "Pendiente",
    pending: "Pendiente",
    anulada: "Anulada",
    anulado: "Anulado",
    cancelada: "Anulada",
    cancelado: "Anulado",
    canceled: "Anulado",
    cancelled: "Anulado",
    vigente: "Vigente",
    activo: "Vigente",
    activa: "Vigente",
    active: "Vigente",
    borrador: "Borrador",
    draft: "Borrador",
    enviado: "Enviado",
    sent: "Enviado",
    vencido: "Vencido",
    expired: "Vencido",
  };
  const rose = ["pendiente", "pending", "anulada", "anulado", "cancelada", "cancelado", "canceled", "cancelled", "vencido", "expired"].includes(normalized);
  const amber = ["parcial", "partial", "enviado", "sent"].includes(normalized);
  const green = ["pagado", "paid", "confirmed", "vigente", "activo", "activa", "active"].includes(normalized);

  return {
    label: labels[normalized] || raw.charAt(0).toLocaleUpperCase("es-AR") + raw.slice(1),
    tone: rose
      ? "bg-rose-50 text-rose-700 ring-rose-200"
      : amber
        ? "bg-amber-50 text-amber-800 ring-amber-200"
        : green
          ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
          : "bg-slate-50 text-slate-700 ring-slate-200",
    dot: rose ? "bg-rose-500" : amber ? "bg-amber-500" : green ? "bg-emerald-500" : "bg-slate-500",
  };
};

// Función para formatear moneda
const formatCurrency = (amount) => {
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount)) return "0";
  const roundedAmount = Math.round(numericAmount * 100) / 100;
  return "$" + new Intl.NumberFormat("es-AR", {
    style: "decimal",
    minimumFractionDigits: Number.isInteger(roundedAmount) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(roundedAmount);
};

const formatVendedorName = (value) => {
  if (!value) return "-";
  const raw = String(value).trim();
  if (!raw) return "-";
  if (!raw.includes("@")) return raw;
  const local = raw.split("@")[0] || raw;
  const parts = local
    .split(/[._-]+/g)
    .map((p) => p.trim())
    .filter(Boolean);
  const formatted = parts
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
  return formatted || local;
};

const getClienteNombre = (registro) =>
  registro?.cliente?.nombre || registro?.nombreCliente || "Sin nombre";

const getClienteSecondaryLabel = (cliente, registro) => {
  const datosCliente = cliente || {};

  return (
    datosCliente.telefono ||
    datosCliente.celular ||
    datosCliente.whatsapp ||
    datosCliente.email ||
    registro?.telefonoCliente ||
    "-"
  );
};

const getDireccionRegistro = (registro) => {
  if (registro?.usarDireccionCliente === false) {
    const direccionEnvio = [registro.direccionEnvio, registro.localidadEnvio].filter(Boolean).join(", ");
    if (direccionEnvio) return direccionEnvio;
  }
  return registro?.cliente?.direccion || registro?.direccion || "";
};

const getClienteExportLabel = (registro) => {
  const contacto = getClienteSecondaryLabel(registro?.cliente, registro);
  return [
    String(getClienteNombre(registro)).toLocaleUpperCase("es-AR"),
    contacto === "-" ? "" : contacto,
    getDireccionRegistro(registro),
  ].filter(Boolean).join(" · ");
};

const isVentaAnulada = (venta) => {
  if (!venta) return false;
  return String(venta.estado || "").toLowerCase() === "anulada" || venta.anulada === true;
};

const isPresupuestoAnulado = (presupuesto) => {
  if (!presupuesto) return false;
  return String(presupuesto.estado || "").toLowerCase() === "anulada" || presupuesto.anulada === true;
};

const getEstadoPresupuesto = (presupuesto) => {
  if (isPresupuestoAnulado(presupuesto)) return "anulado";
  return presupuesto?.estado || "vigente";
};

const getMontoAbonado = (venta) => {
  const pagos = venta?.pagos || [];
  return Array.isArray(pagos) && pagos.length > 0
    ? pagos.reduce((total, pago) => total + Number(pago.monto || 0), 0)
    : Number(venta?.montoAbonado || 0);
};

// Columnas para la tabla de presupuestos
export const columnsPresupuestos = [
  {
    accessorKey: "numeroPedido",
    header: "N° presupuesto",
    exportValue: (presupuesto) => presupuesto.numeroPedido || presupuesto.id?.slice(-8) || "",
    cell: ({ row }) => (
      <div className="min-w-0">
        <span className="block truncate font-mono text-xs font-semibold tracking-wide text-slate-900">
          {row.getValue("numeroPedido") || row.original.id?.slice(-8)}
        </span>
      </div>
    ),
    enableSorting: true,
  },
  {
    accessorKey: "cliente",
    header: "Cliente",
    exportHeader: "Cliente / contacto / dirección",
    exportValue: getClienteExportLabel,
    cell: ({ row }) => {
      const presupuesto = row.original;
      const contacto = getClienteSecondaryLabel(presupuesto.cliente, presupuesto);
      const direccion = getDireccionRegistro(presupuesto);
      return (
        <div className="min-w-0">
          <span className="block truncate text-sm font-semibold text-slate-900">
            {String(getClienteNombre(presupuesto)).toLocaleUpperCase("es-AR")}
          </span>
          <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-600">
            {contacto !== "-" ? <span className="inline-flex min-w-0 items-center gap-1.5"><Phone aria-hidden="true" className="h-3 w-3 shrink-0 text-slate-500" /><span className="truncate">{contacto}</span></span> : null}
            {direccion ? <span className="inline-flex min-w-0 items-center gap-1.5"><MapPin aria-hidden="true" className="h-3 w-3 shrink-0 text-slate-500" /><span className="truncate">{direccion}</span></span> : null}
          </div>
        </div>
      );
    },
    sortingFn: (rowA, rowB) => String(getClienteNombre(rowA.original)).localeCompare(String(getClienteNombre(rowB.original)), "es-AR", { sensitivity: "base" }),
    enableSorting: true,
  },
  {
    id: "estadoPresupuesto",
    accessorFn: getEstadoPresupuesto,
    header: "Estado",
    exportValue: (presupuesto) => getStatusInfo(getEstadoPresupuesto(presupuesto)).label,
    cell: ({ row }) => <StatusText status={getEstadoPresupuesto(row.original)} />,
    enableSorting: true,
  },
  {
    accessorKey: "fechaCreacion",
    header: "Fecha",
    exportValue: (presupuesto) => formatDate(presupuesto.fechaCreacion),
    cell: ({ row }) => {
      const fecha = row.getValue("fechaCreacion");
      return (
        <span className="text-xs tabular-nums text-slate-600">{formatDate(fecha)}</span>
      );
    },
    enableSorting: true,
  },
  {
    accessorKey: "total",
    header: "Total",
    exportValue: (presupuesto) => formatCurrency(presupuesto.total || 0),
    cell: ({ row }) => <span className="font-semibold tabular-nums text-slate-950">{formatCurrency(row.getValue("total") || 0)}</span>,
    enableSorting: true,
  },
  {
    accessorKey: "vendedor",
    header: "Vendedor",
    exportValue: (presupuesto) => formatVendedorName(presupuesto.vendedor),
    cell: ({ row }) => <span className="text-xs text-slate-600">{formatVendedorName(row.original.vendedor)}</span>,
  },
  {
    id: "actions",
    header: "Acciones",
    cell: ({ row }) => {
      const anulado = isPresupuestoAnulado(row.original);
      return (
        <div className="flex items-center justify-end gap-1">
          <Button
            size="sm"
            variant="outline"
            className="h-8 rounded-md border-slate-200 px-2.5 text-[11px] font-medium"
            title="Abrir presupuesto"
            onClick={(e) => {
              e.stopPropagation();
              window.dispatchEvent(new CustomEvent("openPresupuesto", { detail: { id: row.original.id } }));
            }}
          >
            Abrir<ExternalLink className="ml-1.5 h-3 w-3" />
          </Button>
          {!anulado ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" className="h-8 w-8 rounded-md" aria-label="Más acciones para el presupuesto" onClick={(e) => e.stopPropagation()}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onSelect={() => window.dispatchEvent(new CustomEvent("editPresupuesto", { detail: { id: row.original.id } }))}><Pencil className="mr-2 h-4 w-4" />Editar</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-rose-700 focus:text-rose-700" onSelect={() => window.dispatchEvent(new CustomEvent("deletePresupuesto", { detail: { id: row.original.id } }))}><Trash2 className="mr-2 h-4 w-4" />Anular</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      );
    },
    enableSorting: false,
  },
];

// Columnas para la tabla de ventas
export const columnsVentas = [
  {
    accessorKey: "numeroPedido",
    header: "N° venta",
    exportValue: (venta) => venta.numeroPedido || venta.id?.slice(-8) || "",
    cell: ({ row }) => (
      <div className="min-w-0">
        <span className="block truncate font-mono text-xs font-semibold tracking-wide text-slate-900">
          {row.getValue("numeroPedido") || row.original.id?.slice(-8)}
        </span>
      </div>
    ),
    enableSorting: true,
  },
  {
    accessorKey: "cliente",
    header: "Cliente",
    exportHeader: "Cliente / contacto / dirección",
    exportValue: getClienteExportLabel,
    cell: ({ row }) => {
      const venta = row.original;
      const contacto = getClienteSecondaryLabel(venta.cliente, venta);
      const direccion = getDireccionRegistro(venta);
      return (
        <div className="min-w-0">
          <span className="block truncate text-sm font-semibold text-slate-900">
            {String(getClienteNombre(venta)).toLocaleUpperCase("es-AR")}
          </span>
          <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-600">
            {contacto !== "-" ? <span className="inline-flex min-w-0 items-center gap-1.5"><Phone aria-hidden="true" className="h-3 w-3 shrink-0 text-slate-500" /><span className="truncate">{contacto}</span></span> : null}
            {direccion ? <span className="inline-flex min-w-0 items-center gap-1.5"><MapPin aria-hidden="true" className="h-3 w-3 shrink-0 text-slate-500" /><span className="truncate">{direccion}</span></span> : null}
          </div>
        </div>
      );
    },
    sortingFn: (rowA, rowB) => String(getClienteNombre(rowA.original)).localeCompare(String(getClienteNombre(rowB.original)), "es-AR", { sensitivity: "base" }),
    enableSorting: true,
  },
  {
    accessorKey: "estadoPago",
    header: "Estado",
    exportValue: (venta) => isVentaAnulada(venta) ? "Anulada" : venta.estadoPago || venta.status || "Sin estado",
    cell: ({ row }) => {
      if (isVentaAnulada(row.original)) {
        return <StatusText status="Anulada" />;
      }

      const status = row.getValue("estadoPago") || row.getValue("status");
      return <StatusText status={status || "Sin estado"} />;
    },
    enableSorting: true,
  },
  {
    accessorKey: "fechaCreacion",
    header: "Fecha",
    exportValue: (venta) => formatDate(venta.fechaCreacion),
    cell: ({ row }) => {
      const fecha = row.getValue("fechaCreacion");
      return (
        <span className="text-xs tabular-nums text-slate-600">{formatDate(fecha)}</span>
      );
    },
    enableSorting: true,
  },
  {
    accessorKey: "total",
    header: "Total",
    exportValue: (venta) => formatCurrency(venta.total || 0),
    cell: ({ row }) => <span className="font-semibold tabular-nums text-slate-950">{formatCurrency(row.getValue("total") || 0)}</span>,
    enableSorting: true,
  },
  {
    accessorKey: "montoAbonado",
    header: "Abonado",
    exportValue: (venta) => formatCurrency(getMontoAbonado(venta)),
    cell: ({ row }) => {
      const montoAbonado = getMontoAbonado(row.original);
      const estadoPago = row.original.estadoPago;
      return (
        <span className={`font-medium tabular-nums ${estadoPago === "pagado" ? "text-emerald-700" : estadoPago === "parcial" ? "text-amber-800" : "text-slate-700"}`}>{formatCurrency(montoAbonado)}</span>
      );
    },
    enableSorting: true,
  },
  {
    accessorKey: "vendedor",
    header: "Vendedor",
    exportValue: (venta) => formatVendedorName(venta.vendedor),
    cell: ({ row }) => <span className="text-xs text-slate-600">{formatVendedorName(row.original.vendedor)}</span>,
    enableSorting: true,
  },
  {
    id: "actions",
    header: "Acciones",
    cell: ({ row }) => {
      const anulado = isVentaAnulada(row.original);
      return (
        <div className="flex items-center justify-end gap-1">
          <Button
            size="sm"
            variant="outline"
            className="h-8 rounded-md border-slate-200 px-2.5 text-[11px] font-medium"
            title="Abrir venta"
            onClick={(e) => {
              e.stopPropagation();
              window.dispatchEvent(new CustomEvent("openVenta", { detail: { id: row.original.id } }));
            }}
          >
            Abrir<ExternalLink className="ml-1.5 h-3 w-3" />
          </Button>
          {!anulado ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" className="h-8 w-8 rounded-md" aria-label="Más acciones para la venta" onClick={(e) => e.stopPropagation()}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onSelect={() => window.dispatchEvent(new CustomEvent("editVenta", { detail: { id: row.original.id } }))}><Pencil className="mr-2 h-4 w-4" />Editar</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-rose-700 focus:text-rose-700" onSelect={() => window.dispatchEvent(new CustomEvent("anularVenta", { detail: { id: row.original.id } }))}><Trash2 className="mr-2 h-4 w-4" />Anular</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      );
    },
    enableSorting: false,
  },
];

function StatusText({ status }) {
  const statusInfo = getStatusInfo(status);
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ring-inset ${statusInfo.tone}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${statusInfo.dot}`} aria-hidden="true" />
      {statusInfo.label}
    </span>
  );
}
