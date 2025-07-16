"use client";
import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { columns } from "../(invoice)/invoice-list/invoice-list-table/components/columns";
import { DataTable } from "../(invoice)/invoice-list/invoice-list-table/components/data-table";
import avatar1 from "@/public/images/avatar/avatar-1.jpg";
import { Dialog, DialogContent, DialogHeader as ModalHeader, DialogTitle as ModalTitle } from "@/components/ui/dialog";
import { Icon } from "@iconify/react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, Upload } from "lucide-react";
import Flatpickr from "react-flatpickr";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Datos de ejemplo para presupuestos
const presupuestosData = [
  {
    id: "#P-001",
    customer: { name: "Juan Pérez", email: "juan@mail.com", avatar: avatar1 },
    date: "01-06-2024",
    amount: "15000",
    status: "pendiente",
    paymentStatus: "-"
  },
  {
    id: "#P-002",
    customer: { name: "Ana López", email: "ana@mail.com", avatar: avatar1 },
    date: "02-06-2024",
    amount: "22000",
    status: "aceptado",
    paymentStatus: "-"
  },
];

// Datos de ejemplo para ventas
const ventasData = [
  {
    id: "#V-001",
    customer: { name: "Carlos Gómez", email: "carlos@mail.com", avatar: avatar1 },
    date: "03-06-2024",
    amount: "18000",
    status: "confirmado",
    paymentStatus: "pagado"
  },
  {
    id: "#V-002",
    customer: { name: "Lucía Torres", email: "lucia@mail.com", avatar: avatar1 },
    date: "04-06-2024",
    amount: "25000",
    status: "entregado",
    paymentStatus: "pagado"
  },
];

function FormularioVentaPresupuesto({ tipo }) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-4">
        <div className="flex-1 min-w-[250px]">
          <div className="w-full md:w-[248px] space-y-2">
            <Input type="text" placeholder={tipo === 'presupuesto' ? "Nombre del presupuesto" : "Nombre de la venta"} size="lg" />
            <Input type="text" placeholder={tipo === 'presupuesto' ? "ID Presupuesto" : "ID Venta"} size="lg" />
            <div className="relative">
              <Flatpickr
                className="w-full border border-default-300 bg-background text-default-500  focus:outline-hidden h-10 rounded-md px-2 placeholder:text-default-500"
                placeholder={tipo === 'presupuesto' ? "Fecha del presupuesto" : "Fecha de la venta"}
              />
              <Icon icon="heroicons:calendar-days" className="w-5 h-5 absolute top-1/2 -translate-y-1/2 ltr:right-4 rtl:left-4 text-default-400" />
            </div>
            <div className="relative">
              <Flatpickr
                className="w-full border border-default-300 bg-background text-default-500  focus:outline-hidden h-10 rounded-md px-2 placeholder:text-default-500"
                placeholder="Fecha de vencimiento"
              />
              <Icon icon="heroicons:calendar-days" className="w-5 h-5 absolute top-1/2 -translate-y-1/2 ltr:right-4 rtl:left-4 text-default-400 " />
            </div>
            <div className="flex items-center gap-1.5 pt-2">
              <Button
                className="w-5 h-5 rounded-md bg-transparent hover:bg-transparent p-0"
                variant="outline">
                <Plus className="w-3.5 h-3.5 text-default-500" />
              </Button>
              <span className="text-xs font-medium text-default-600"> Agregar campo extra</span>
            </div>
          </div>
        </div>
        {/* Se eliminó el input de imagen/logo */}
      </div>
      <div className="mt-8 flex justify-between flex-wrap gap-4">
        <div className="w-full 2xl:max-w-[400px] space-y-2">
          <div className="text-base font-semibold text-default-800 pb-1">Datos de la empresa:</div>
          <Input type="text" placeholder="Nombre de la empresa" />
          <Input type="email" placeholder="Email de la empresa" />
          <Input type="number" placeholder="Teléfono de la empresa" />
          <Textarea placeholder="Dirección de la empresa" />
        </div>
        <div className="w-full 2xl:max-w-[400px] space-y-2">
          <div className="text-base font-semibold text-default-800 pb-1">Datos del cliente:</div>
          <Input type="text" placeholder="Nombre del cliente" />
          <Input type="email" placeholder="Email del cliente" />
          <Input type="number" placeholder="Teléfono del cliente" />
          <Textarea placeholder="Dirección del cliente" />
        </div>
      </div>
      <div className="border border-default-300 rounded-md mt-9 overflow-x-auto">
        <div className="min-w-[600px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-default-600 uppercase">Ítem</TableHead>
                <TableHead className="text-default-600 uppercase">Cantidad</TableHead>
                <TableHead className="text-default-600 uppercase">Precio</TableHead>
                <TableHead className="text-default-600 uppercase text-end pr-7">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="[&_tr:last-child]:border-1">
              <TableRow>
                <TableCell className="min-w-[220px] w-full max-w-[432px]">
                  <Input
                    type="text"
                    placeholder="Ejemplo: Madera Pino 2x4"
                    className="text-default-800 rounded "
                  />
                </TableCell>
                <TableCell>
                  <div className="max-w-[130px] flex">
                    <Input
                      className="w-[70px] appearance-none accent-transparent rounded ltr:rounded-r-none ltr:border-r-0 rtl:rounded-l-none rtl:border-l-0"
                      type="number"
                      defaultValue="1"
                    />
                    <Select className="ltr:rounded-l-none ltr:border-l-[0px] rtl:rounded-r-none rtl:border-r-[0px] text-xs">
                      <SelectTrigger className="rounded ltr:rounded-l-none rtl:rounded-r-none h-9  pr-1 [&>svg]:h-4 [&>svg]:w-4 [&>svg]:mt-1 ">
                        <SelectValue placeholder="unidades" />
                      </SelectTrigger>
                      <SelectContent >
                        <SelectItem value="unidades">unidades</SelectItem>
                        <SelectItem value="kg">kg</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="max-w-[130px] flex">
                    <Input
                      className="w-[70px] appearance-none accent-transparent rounded ltr:rounded-r-none ltr:border-r-0 rtl:rounded-l-none rtl:border-l-0"
                      type="number"
                      defaultValue="20"
                    />
                    <Select className="ltr:rounded-l-none ltr:border-l-[0px] rtl:rounded-r-none rtl:border-r-[0px] text-xs" >
                      <SelectTrigger className="rounded ltr:rounded-l-none rtl:rounded-r-none h-9  pr-1 [&>svg]:h-4 [&>svg]:w-4 [&>svg]:mt-1 ">
                        <SelectValue placeholder="$" />
                      </SelectTrigger>
                      <SelectContent >
                        <SelectItem value="$">$</SelectItem>
                        <SelectItem value="eur">eur</SelectItem>
                        <SelectItem value="jpy">jpy</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2 ">
                    <Input defaultValue="$0.00" className="text-end font-medium  text-default-900 rounded min-w-[140px]" />
                    <Trash2 className="w-4 h-4 text-warning" />
                  </div>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}

const VentasPage = () => {
  const [open, setOpen] = useState(null); // null | 'presupuesto' | 'venta'
  return (
    <div className="flex flex-col gap-6 py-8">
      <div className="flex gap-4 mb-4 justify-end">
        <Button variant="default" onClick={() => setOpen('presupuesto')}>Agregar Presupuesto</Button>
        <Button variant="default" onClick={() => setOpen('venta')}>Agregar Venta</Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Presupuestos</CardTitle>
          </CardHeader>
          <CardContent>
            <DataTable data={presupuestosData} columns={columns} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Ventas</CardTitle>
          </CardHeader>
          <CardContent>
            <DataTable data={ventasData} columns={columns} />
          </CardContent>
        </Card>
      </div>
      <Dialog open={!!open} onOpenChange={() => setOpen(null)}>
        <DialogContent className="max-w-5xl w-full">
          <ModalHeader>
            <ModalTitle>{open === 'presupuesto' ? 'Nuevo Presupuesto' : 'Nueva Venta'}</ModalTitle>
          </ModalHeader>
          <FormularioVentaPresupuesto tipo={open} />
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default VentasPage; 