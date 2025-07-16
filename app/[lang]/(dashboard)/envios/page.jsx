"use client";
import React, { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Truck, Plus } from "lucide-react";

const envios = [
  { id: 1, fecha: "2024-06-10", cliente: "Carpintería El Roble", direccion: "Av. Madera 123", estado: "En camino", transportista: "Transporte Sur" },
  { id: 2, fecha: "2024-06-09", cliente: "Obras SRL", direccion: "Ruta 8 Km 45", estado: "Entregado", transportista: "Logística Norte" },
];

const EnviosPage = () => {
  const [open, setOpen] = useState(false);
  const [filtro, setFiltro] = useState("");
  return (
    <div className="py-8 px-2 max-w-5xl mx-auto">
      <div className="mb-8 flex items-center gap-4">
        <Truck className="w-10 h-10 text-primary" />
        <div>
          <h1 className="text-3xl font-bold mb-1">Envíos</h1>
          <p className="text-lg text-gray-500">Gestión de entregas y logística de productos madereros.</p>
        </div>
      </div>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle>Listado de Envíos</CardTitle>
          <div className="flex gap-2">
            <Input placeholder="Buscar cliente o dirección..." value={filtro} onChange={e => setFiltro(e.target.value)} className="w-56" />
            <Button variant="default" onClick={() => setOpen(true)}><Plus className="w-4 h-4 mr-1" />Registrar Envío</Button>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Dirección</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Transportista</TableHead>
                <TableHead>Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {envios.filter(e => e.cliente.toLowerCase().includes(filtro.toLowerCase()) || e.direccion.toLowerCase().includes(filtro.toLowerCase())).map(e => (
                <TableRow key={e.id}>
                  <TableCell>{e.fecha}</TableCell>
                  <TableCell>{e.cliente}</TableCell>
                  <TableCell>{e.direccion}</TableCell>
                  <TableCell>{e.estado}</TableCell>
                  <TableCell>{e.transportista}</TableCell>
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
            <DialogTitle>Registrar Envío</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            <Input placeholder="Cliente" className="w-full" />
            <Input placeholder="Dirección de entrega" className="w-full" />
            <Input placeholder="Transportista" className="w-full" />
            <Input placeholder="Fecha de envío" type="date" className="w-full" />
            <Input placeholder="Estado" className="w-full" />
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

export default EnviosPage;
