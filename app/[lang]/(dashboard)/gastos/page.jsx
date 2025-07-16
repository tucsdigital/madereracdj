"use client";
import React, { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Receipt, Plus } from "lucide-react";

const gastos = [
  { id: 1, fecha: "2024-06-10", concepto: "Compra de madera", monto: 15000, responsable: "Admin", obs: "Proveedor: Maderas SA" },
  { id: 2, fecha: "2024-06-09", concepto: "Transporte", monto: 3500, responsable: "Juan", obs: "Flete a obra" },
];

const GastosPage = () => {
  const [open, setOpen] = useState(false);
  const [filtro, setFiltro] = useState("");
  return (
    <div className="py-8 px-2 max-w-5xl mx-auto">
      <div className="mb-8 flex items-center gap-4">
        <Receipt className="w-10 h-10 text-primary" />
        <div>
          <h1 className="text-3xl font-bold mb-1">Gastos</h1>
          <p className="text-lg text-gray-500">Control y registro de gastos de la maderera.</p>
        </div>
      </div>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle>Listado de Gastos</CardTitle>
          <div className="flex gap-2">
            <Input placeholder="Buscar concepto o responsable..." value={filtro} onChange={e => setFiltro(e.target.value)} className="w-56" />
            <Button variant="default" onClick={() => setOpen(true)}><Plus className="w-4 h-4 mr-1" />Registrar Gasto</Button>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Concepto</TableHead>
                <TableHead>Monto</TableHead>
                <TableHead>Responsable</TableHead>
                <TableHead>Observaciones</TableHead>
                <TableHead>Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {gastos.filter(g => g.concepto.toLowerCase().includes(filtro.toLowerCase()) || g.responsable.toLowerCase().includes(filtro.toLowerCase())).map(g => (
                <TableRow key={g.id}>
                  <TableCell>{g.fecha}</TableCell>
                  <TableCell>{g.concepto}</TableCell>
                  <TableCell>${g.monto}</TableCell>
                  <TableCell>{g.responsable}</TableCell>
                  <TableCell>{g.obs}</TableCell>
                  <TableCell>
                    <Button size="sm" variant="outline">Ver</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[95vw] max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Registrar Gasto</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            <Input placeholder="Concepto" className="w-full" />
            <Input placeholder="Monto" type="number" className="w-full" />
            <Input placeholder="Responsable" className="w-full" />
            <Input placeholder="Fecha" type="date" className="w-full" />
            <Input placeholder="Observaciones" className="w-full" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button variant="default">Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default GastosPage; 