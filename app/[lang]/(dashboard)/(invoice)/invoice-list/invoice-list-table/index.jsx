import { Fragment } from "react";
import { columns } from "./components/columns";
import { DataTable } from "./components/data-table";

const data = [
  {
    id: "DOC-1001",
    nombre: "Factura de venta",
    tipo: "Factura",
    cliente: "Juan Perez",
    vendedor: "Ventas Online",
    date: "2026-07-02T10:30:00.000Z",
    total: 145000,
    amount: "145000",
    status: "confirmed",
    paymentStatus: "paid",
  },
  {
    id: "DOC-1002",
    nombre: "Presupuesto mayorista",
    tipo: "Presupuesto",
    cliente: "Corralon Centro",
    vendedor: "Mostrador",
    date: "2026-07-02T12:15:00.000Z",
    total: 98250,
    amount: "98250",
    status: "confirmed",
    paymentStatus: "pending",
  },
  {
    id: "DOC-1003",
    nombre: "Pedido transferencia",
    tipo: "Pedido",
    cliente: "Maria Gomez",
    vendedor: "Ecommerce",
    date: "2026-07-02T15:45:00.000Z",
    total: 76300,
    amount: "76300",
    status: "closed",
    paymentStatus: "pending",
  },
];

export default function InvoiceListTable() {
  return (
    <Fragment>
      <DataTable data={data} columns={columns} />
    </Fragment>
  );
}
