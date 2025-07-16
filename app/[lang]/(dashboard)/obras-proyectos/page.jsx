"use client";
import React, { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Hammer, Plus } from "lucide-react";

const obras = [
  { id: 1, nombre: "Obra Centro", cliente: "Obras SRL", estado: "En curso", inicio: "2024-06-01", fin: "2024-07-15", responsable: "Juan" },
  { id: 2, nombre: "Proyecto Norte", cliente: "Carpintería El Roble", estado: "Finalizado", inicio: "2024-04-10", fin: "2024-05-30", responsable: "Ana" },
];

const ObrasProyectosPage = () => {
  const [open, setOpen] = useState(false);
  const [filtro, setFiltro] = useState("");
  return (
    <div className="py-8 px-2 max-w-5xl mx-auto">
      <div className="mb-8 flex items-center gap-4">
        <Hammer className="w-10 h-10 text-primary" />
        <div>
          <h1 className="text-3xl font-bold mb-1">Obras / Proyectos</h1>
          <p className="text-lg text-gray-500">Seguimiento de obras y proyectos en curso para clientes de la maderera.</p>
        </div>
      </div>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle>Listado de Obras / Proyectos</CardTitle>
          <div className="flex gap-2">
            <Input placeholder="Buscar obra o cliente..." value={filtro} onChange={e => setFiltro(e.target.value)} className="w-56" />
            <Button variant="default" onClick={() => setOpen(true)}><Plus className="w-4 h-4 mr-1" />Agregar Obra/Proyecto</Button>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Inicio</TableHead>
                <TableHead>Fin</TableHead>
                <TableHead>Responsable</TableHead>
                <TableHead>Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {obras.filter(o => o.nombre.toLowerCase().includes(filtro.toLowerCase()) || o.cliente.toLowerCase().includes(filtro.toLowerCase())).map(o => (
                <TableRow key={o.id}>
                  <TableCell>{o.nombre}</TableCell>
                  <TableCell>{o.cliente}</TableCell>
                  <TableCell>{o.estado}</TableCell>
                  <TableCell>{o.inicio}</TableCell>
                  <TableCell>{o.fin}</TableCell>
                  <TableCell>{o.responsable}</TableCell>
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
            <DialogTitle>Agregar Obra / Proyecto</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            <Input placeholder="Nombre de la obra/proyecto" className="w-full" />
            <Input placeholder="Cliente" className="w-full" />
            <Input placeholder="Estado" className="w-full" />
            <Input placeholder="Fecha de inicio" type="date" className="w-full" />
            <Input placeholder="Fecha de fin" type="date" className="w-full" />
            <Input placeholder="Responsable" className="w-full" />
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

export default ObrasProyectosPage; 