"use client";
import React, { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { db } from "@/lib/firebase";
import { collection, getDocs, updateDoc, doc, query, orderBy } from "firebase/firestore";
import { Loader2, Pencil } from "lucide-react";

const PreciosPage = () => {
  const [productos, setProductos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editProd, setEditProd] = useState(null);
  const [editForm, setEditForm] = useState({ costo: "", precioVenta: "", precioCompra: "" });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const fetchProductos = async () => {
      setLoading(true);
      const q = query(collection(db, "productos"), orderBy("nombre"));
      const snap = await getDocs(q);
      setProductos(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    };
    fetchProductos();
  }, []);

  const handleEditar = (prod) => {
    setEditProd(prod);
    setEditForm({
      costo: prod.costo ?? "",
      precioVenta: prod.precioVenta ?? "",
      precioCompra: prod.precioCompra ?? ""
    });
    setMsg("");
    setModalOpen(true);
  };

  const handleGuardar = async () => {
    setSaving(true);
    setMsg("");
    try {
      await updateDoc(doc(db, "productos", editProd.id), {
        costo: Number(editForm.costo),
        precioVenta: Number(editForm.precioVenta),
        precioCompra: Number(editForm.precioCompra)
      });
      setMsg("Precios actualizados correctamente.");
      // Refrescar productos
      const q = query(collection(db, "productos"), orderBy("nombre"));
      const snap = await getDocs(q);
      setProductos(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setTimeout(() => { setModalOpen(false); setEditProd(null); }, 1000);
    } catch (e) {
      setMsg("Error al guardar: " + e.message);
    }
    setSaving(false);
  };

  const productosFiltrados = productos.filter(p =>
    p.nombre?.toLowerCase().includes(filtro.toLowerCase()) ||
    (p.categoria || "").toLowerCase().includes(filtro.toLowerCase())
  );

  return (
    <div className="py-8 px-2 max-w-6xl mx-auto">
      <div className="mb-8 flex items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold mb-1">Gestión de Precios</h1>
          <p className="text-lg text-gray-500">Edita el costo, precio de venta y precio de compra de tus productos.</p>
        </div>
      </div>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle>Listado de Productos</CardTitle>
          <Input placeholder="Buscar producto o categoría..." value={filtro} onChange={e => setFiltro(e.target.value)} className="w-64" />
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {loading ? (
            <div className="flex justify-center items-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead>Unidad</TableHead>
                  <TableHead>Stock</TableHead>
                  <TableHead>Costo</TableHead>
                  <TableHead>Precio Venta</TableHead>
                  <TableHead>Precio Compra</TableHead>
                  <TableHead>Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {productosFiltrados.map(p => (
                  <TableRow key={p.id}>
                    <TableCell>{p.nombre}</TableCell>
                    <TableCell>{p.categoria}</TableCell>
                    <TableCell>{p.unidadMedida || p.unidadVenta || p.unidadVentaHerraje || p.unidadVentaQuimico || p.unidadVentaHerramienta}</TableCell>
                    <TableCell>{p.stock}</TableCell>
                    <TableCell>${p.costo?.toFixed(2) ?? "-"}</TableCell>
                    <TableCell>${p.precioVenta?.toFixed(2) ?? "-"}</TableCell>
                    <TableCell>${p.precioCompra?.toFixed(2) ?? "-"}</TableCell>
                    <TableCell>
                      <Button size="sm" variant="outline" onClick={() => handleEditar(p)}><Pencil className="w-4 h-4 mr-1" />Editar</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      {/* Modal edición */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="w-[95vw] max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Editar Precios</DialogTitle>
          </DialogHeader>
          {editProd && (
            <div className="flex flex-col gap-3 py-2">
              <div className="font-bold text-lg mb-2">{editProd.nombre}</div>
              <Input type="number" min={0} step={0.01} placeholder="Costo" className="w-full" value={editForm.costo} onChange={e => setEditForm(f => ({ ...f, costo: e.target.value }))} />
              <Input type="number" min={0} step={0.01} placeholder="Precio de venta" className="w-full" value={editForm.precioVenta} onChange={e => setEditForm(f => ({ ...f, precioVenta: e.target.value }))} />
              <Input type="number" min={0} step={0.01} placeholder="Precio de compra" className="w-full" value={editForm.precioCompra} onChange={e => setEditForm(f => ({ ...f, precioCompra: e.target.value }))} />
              {msg && <div className={`p-2 rounded text-sm ${msg.startsWith("Error") ? "bg-red-50 text-red-800" : "bg-green-50 text-green-800"}`}>{msg}</div>}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button variant="default" onClick={handleGuardar} disabled={saving}>{saving ? "Guardando..." : "Guardar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PreciosPage; 