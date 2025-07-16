"use client";
import React, { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Plus, ArrowDown, ArrowUp, RefreshCw } from "lucide-react";

// Mock de productos
const productos = [
  { id: 1, nombre: "Pino 2x4", categoria: "Maderas", stock: 120, min: 30, unidad: "m", estado: "ok" },
  { id: 2, nombre: "MDF 18mm", categoria: "Tableros", stock: 10, min: 20, unidad: "pliego", estado: "bajo" },
  { id: 3, nombre: "Tornillos x100", categoria: "Accesorios", stock: 50, min: 10, unidad: "caja", estado: "ok" },
];

// Mock de movimientos
const movimientos = [
  { id: 1, fecha: "2024-06-10", producto: "Pino 2x4", tipo: "entrada", cantidad: 50, usuario: "Admin", obs: "Compra proveedor" },
  { id: 2, fecha: "2024-06-09", producto: "MDF 18mm", tipo: "salida", cantidad: 5, usuario: "Juan", obs: "Venta" },
  { id: 3, fecha: "2024-06-08", producto: "Tornillos x100", tipo: "ajuste", cantidad: 2, usuario: "Admin", obs: "Ajuste inventario" },
];

const StockComprasPage = () => {
  const [tab, setTab] = useState("inventario");
  const [openRepo, setOpenRepo] = useState(false);
  const [openMov, setOpenMov] = useState(false);
  const [filtro, setFiltro] = useState("");
  const [filtroMov, setFiltroMov] = useState("");

  return (
    <div className="py-8 px-2 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Stock y Compras</h1>
        <p className="text-lg text-gray-500">Controla el inventario, repón productos y gestiona los movimientos de stock de tu maderera.</p>
      </div>
      <Tabs value={tab} onValueChange={setTab} className="mb-6">
        <TabsList className="mb-4">
          <TabsTrigger value="inventario">Inventario</TabsTrigger>
          <TabsTrigger value="movimientos">Movimientos</TabsTrigger>
        </TabsList>
        <TabsContent value="inventario">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <CardTitle>Inventario</CardTitle>
              <div className="flex gap-2">
                <Input placeholder="Buscar producto..." value={filtro} onChange={e => setFiltro(e.target.value)} className="w-48" />
                <Button variant="default" onClick={() => setOpenRepo(true)}><Plus className="w-4 h-4 mr-1" />Agregar Reposición</Button>
              </div>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto</TableHead>
                    <TableHead>Categoría</TableHead>
                    <TableHead>Stock</TableHead>
                    <TableHead>Mínimo</TableHead>
                    <TableHead>Unidad</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {productos.filter(p => p.nombre.toLowerCase().includes(filtro.toLowerCase())).map(p => (
                    <TableRow key={p.id} className={p.estado === "bajo" ? "bg-yellow-50" : ""}>
                      <TableCell>{p.nombre}</TableCell>
                      <TableCell>{p.categoria}</TableCell>
                      <TableCell>{p.stock}</TableCell>
                      <TableCell>{p.min}</TableCell>
                      <TableCell>{p.unidad}</TableCell>
                      <TableCell>
                        {p.estado === "ok" ? <span className="text-green-600 font-semibold">OK</span> : <span className="text-yellow-700 font-semibold">Bajo</span>}
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline" onClick={() => setOpenRepo(true)}><ArrowDown className="w-4 h-4 mr-1" />Reposición</Button>
                        <Button size="sm" variant="ghost" onClick={() => setOpenMov(true)}><RefreshCw className="w-4 h-4 mr-1" />Movimientos</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="movimientos">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <CardTitle>Movimientos de Stock</CardTitle>
              <div className="flex gap-2">
                <Input placeholder="Buscar producto o usuario..." value={filtroMov} onChange={e => setFiltroMov(e.target.value)} className="w-56" />
                <Button variant="default" onClick={() => setOpenMov(true)}><Plus className="w-4 h-4 mr-1" />Registrar Movimiento</Button>
              </div>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Producto</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Cantidad</TableHead>
                    <TableHead>Usuario</TableHead>
                    <TableHead>Observaciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movimientos.filter(m => m.producto.toLowerCase().includes(filtroMov.toLowerCase()) || m.usuario.toLowerCase().includes(filtroMov.toLowerCase())).map(m => (
                    <TableRow key={m.id}>
                      <TableCell>{m.fecha}</TableCell>
                      <TableCell>{m.producto}</TableCell>
                      <TableCell>
                        {m.tipo === "entrada" && <span className="text-green-600 font-semibold flex items-center"><ArrowDown className="w-4 h-4 mr-1" />Entrada</span>}
                        {m.tipo === "salida" && <span className="text-red-600 font-semibold flex items-center"><ArrowUp className="w-4 h-4 mr-1" />Salida</span>}
                        {m.tipo === "ajuste" && <span className="text-blue-600 font-semibold flex items-center"><RefreshCw className="w-4 h-4 mr-1" />Ajuste</span>}
                      </TableCell>
                      <TableCell>{m.cantidad}</TableCell>
                      <TableCell>{m.usuario}</TableCell>
                      <TableCell>{m.obs}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      {/* Modal de Reposición */}
      <Dialog open={openRepo} onOpenChange={setOpenRepo}>
        <DialogContent className="w-[95vw] max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Agregar Reposición</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            <label className="font-semibold">Producto</label>
            <select className="border rounded px-2 py-2">
              {productos.map(p => <option key={p.id}>{p.nombre}</option>)}
            </select>
            <label className="font-semibold">Cantidad</label>
            <Input type="number" min={1} className="w-full" />
            <label className="font-semibold">Motivo/Observaciones</label>
            <Input type="text" className="w-full" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenRepo(false)}>Cancelar</Button>
            <Button variant="default">Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Modal de Movimiento */}
      <Dialog open={openMov} onOpenChange={setOpenMov}>
        <DialogContent className="w-[95vw] max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Registrar Movimiento</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            <label className="font-semibold">Producto</label>
            <select className="border rounded px-2 py-2">
              {productos.map(p => <option key={p.id}>{p.nombre}</option>)}
            </select>
            <label className="font-semibold">Tipo de movimiento</label>
            <select className="border rounded px-2 py-2">
              <option value="entrada">Entrada</option>
              <option value="salida">Salida</option>
              <option value="ajuste">Ajuste</option>
            </select>
            <label className="font-semibold">Cantidad</label>
            <Input type="number" min={1} className="w-full" />
            <label className="font-semibold">Motivo/Observaciones</label>
            <Input type="text" className="w-full" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenMov(false)}>Cancelar</Button>
            <Button variant="default">Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default StockComprasPage; 