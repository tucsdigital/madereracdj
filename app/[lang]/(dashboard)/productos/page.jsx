"use client";
import React, { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Boxes, Plus } from "lucide-react";

const categorias = ["Maderas", "Tableros", "Accesorios"];
const productos = [
  { id: 1, nombre: "Pino 2x4", categoria: "Maderas", stock: 120, unidad: "m", precio: 1500, estado: "Activo" },
  { id: 2, nombre: "MDF 18mm", categoria: "Tableros", stock: 10, unidad: "pliego", precio: 2500, estado: "Activo" },
  { id: 3, nombre: "Tornillos x100", categoria: "Accesorios", stock: 50, unidad: "caja", precio: 900, estado: "Inactivo" },
];

const ProductosPage = () => {
  const [open, setOpen] = useState(false);
  const [filtro, setFiltro] = useState("");
  const [cat, setCat] = useState("");
  return (
    <div className="py-8 px-2 max-w-5xl mx-auto">
      <div className="mb-8 flex items-center gap-4">
        <Boxes className="w-10 h-10 text-primary" />
        <div>
          <h1 className="text-3xl font-bold mb-1">Productos</h1>
          <p className="text-lg text-gray-500">Catálogo y stock de productos madereros.</p>
        </div>
      </div>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle>Listado de Productos</CardTitle>
          <div className="flex gap-2">
            <select value={cat} onChange={e => setCat(e.target.value)} className="border rounded px-2 py-2">
              <option value="">Todas las categorías</option>
              {categorias.map(c => <option key={c}>{c}</option>)}
            </select>
            <Input placeholder="Buscar producto..." value={filtro} onChange={e => setFiltro(e.target.value)} className="w-48" />
            <Button variant="default" onClick={() => setOpen(true)}><Plus className="w-4 h-4 mr-1" />Agregar Producto</Button>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead>Stock</TableHead>
                <TableHead>Unidad</TableHead>
                <TableHead>Precio</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {productos.filter(p => (cat ? p.categoria === cat : true) && p.nombre.toLowerCase().includes(filtro.toLowerCase())).map(p => (
                <TableRow key={p.id}>
                  <TableCell>{p.nombre}</TableCell>
                  <TableCell>{p.categoria}</TableCell>
                  <TableCell>{p.stock}</TableCell>
                  <TableCell>{p.unidad}</TableCell>
                  <TableCell>${p.precio}</TableCell>
                  <TableCell>{p.estado}</TableCell>
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
            <DialogTitle>Agregar Producto</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            <Input placeholder="Nombre del producto" className="w-full" />
            <select className="border rounded px-2 py-2">
              {categorias.map(c => <option key={c}>{c}</option>)}
            </select>
            <Input placeholder="Stock inicial" type="number" className="w-full" />
            <Input placeholder="Unidad" className="w-full" />
            <Input placeholder="Precio" type="number" className="w-full" />
            <select className="border rounded px-2 py-2">
              <option value="Activo">Activo</option>
              <option value="Inactivo">Inactivo</option>
            </select>
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

export default ProductosPage; 