"use client";
import React, { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Users, Plus } from "lucide-react";
import { useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, getDocs, addDoc, query, where, updateDoc, doc } from "firebase/firestore";
import { Textarea } from "@/components/ui/textarea";

const ClientesPage = () => {
  const [open, setOpen] = useState(false);
  const [filtro, setFiltro] = useState("");
  const [clientes, setClientes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCliente, setSelectedCliente] = useState(null);
  const [detalleOpen, setDetalleOpen] = useState(false);
  const [ventas, setVentas] = useState([]);
  const [presupuestos, setPresupuestos] = useState([]);
  const [form, setForm] = useState({ nombre: "", cuit: "", direccion: "", telefono: "", email: "", estado: "Activo", localidad: "", partido: "", barrio: "", area: "", lote: "", descripcion: "" });
  const [saving, setSaving] = useState(false);
  const [editCliente, setEditCliente] = useState(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editMsg, setEditMsg] = useState("");

  useEffect(() => {
    const fetchClientes = async () => {
      setLoading(true);
      const snap = await getDocs(collection(db, "clientes"));
      setClientes(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    };
    fetchClientes();
  }, []);

  const handleVerDetalle = async (cliente) => {
    setSelectedCliente(cliente);
    setEditCliente({ ...cliente });
    setEditMsg("");
    setDetalleOpen(true);
    // Consultar ventas asociadas por clienteId
    const ventasSnap = await getDocs(query(collection(db, "ventas"), where("clienteId", "==", cliente.id)));
    setVentas(ventasSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    // Consultar presupuestos asociados por cliente.cuit
    const presupuestosSnap = await getDocs(query(collection(db, "presupuestos"), where("cliente.cuit", "==", cliente.cuit)));
    setPresupuestos(presupuestosSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
  };

  const handleGuardar = async () => {
    if (!form.nombre || !form.direccion || !form.telefono) return;
    setSaving(true);
    await addDoc(collection(db, "clientes"), form);
    setForm({ nombre: "", cuit: "", direccion: "", telefono: "", email: "", estado: "Activo", localidad: "", partido: "", barrio: "", area: "", lote: "", descripcion: "" });
    setOpen(false);
    // Refrescar lista
    const snap = await getDocs(collection(db, "clientes"));
    setClientes(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    setSaving(false);
  };

  const handleGuardarEdicion = async () => {
    if (!editCliente.nombre || !editCliente.direccion || !editCliente.telefono) {
      setEditMsg("Nombre, dirección y teléfono son obligatorios.");
      return;
    }
    setEditSaving(true);
    setEditMsg("");
    try {
      await updateDoc(doc(db, "clientes", editCliente.id), editCliente);
      setEditMsg("Datos actualizados correctamente.");
      // Refrescar lista
      const snap = await getDocs(collection(db, "clientes"));
      setClientes(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setSelectedCliente({ ...editCliente });
      setTimeout(() => setEditMsg(""), 1200);
    } catch (e) {
      setEditMsg("Error al guardar: " + e.message);
    }
    setEditSaving(false);
  };

  return (
    <div className="py-8 px-2 max-w-5xl mx-auto">
      <div className="mb-8 flex items-center gap-4">
        <Users className="w-10 h-10 text-primary" />
        <div>
          <h1 className="text-3xl font-bold mb-1">Clientes</h1>
          <p className="text-lg text-gray-500">Gestión de clientes de la maderera.</p>
        </div>
      </div>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle>Listado de Clientes</CardTitle>
          <div className="flex gap-2">
            <Input placeholder="Buscar cliente o CUIT..." value={filtro} onChange={e => setFiltro(e.target.value)} className="w-56" />
            <Button variant="default" onClick={() => setOpen(true)}><Plus className="w-4 h-4 mr-1" />Agregar Cliente</Button>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>CUIT</TableHead>
                <TableHead>Dirección</TableHead>
                <TableHead>Teléfono</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={7}>Cargando...</TableCell></TableRow>
              ) : clientes.filter(c => c.nombre.toLowerCase().includes(filtro.toLowerCase()) || (c.cuit || "").includes(filtro)).map(c => (
                <TableRow key={c.id}>
                  <TableCell>{c.nombre}</TableCell>
                  <TableCell>{c.cuit}</TableCell>
                  <TableCell>{c.direccion}</TableCell>
                  <TableCell>{c.telefono}</TableCell>
                  <TableCell>{c.email}</TableCell>
                  <TableCell>{c.estado}</TableCell>
                  <TableCell>
                    <Button size="sm" variant="outline" onClick={() => handleVerDetalle(c)}>Ver</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {/* Modal alta cliente */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[95vw] max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Agregar Cliente</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            <Input placeholder="Nombre *" className="w-full" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} required />
            <Input placeholder="CUIT / DNI" className="w-full" value={form.cuit} onChange={e => setForm(f => ({ ...f, cuit: e.target.value }))} />
            <Input placeholder="Dirección *" className="w-full" value={form.direccion} onChange={e => setForm(f => ({ ...f, direccion: e.target.value }))} required />
            <Input placeholder="Teléfono *" className="w-full" value={form.telefono} onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))} required />
            <Input placeholder="Email" className="w-full" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            <Input placeholder="Localidad" className="w-full" value={form.localidad} onChange={e => setForm(f => ({ ...f, localidad: e.target.value }))} />
            <Input placeholder="Partido" className="w-full" value={form.partido} onChange={e => setForm(f => ({ ...f, partido: e.target.value }))} />
            <Input placeholder="Barrio" className="w-full" value={form.barrio} onChange={e => setForm(f => ({ ...f, barrio: e.target.value }))} />
            <Input placeholder="Área" className="w-full" value={form.area} onChange={e => setForm(f => ({ ...f, area: e.target.value }))} />
            <Input placeholder="Lote" className="w-full" value={form.lote} onChange={e => setForm(f => ({ ...f, lote: e.target.value }))} />
            <Textarea placeholder="Descripción" className="w-full" value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} />
            <select className="border rounded px-2 py-2" value={form.estado} onChange={e => setForm(f => ({ ...f, estado: e.target.value }))}>
              <option value="Activo">Activo</option>
              <option value="Inactivo">Inactivo</option>
            </select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button variant="default" onClick={handleGuardar} disabled={saving}>{saving ? "Guardando..." : "Guardar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Modal detalle cliente */}
      <Dialog open={detalleOpen} onOpenChange={setDetalleOpen}>
        <DialogContent className="w-[95vw] max-w-[700px]">
          <DialogHeader>
            <DialogTitle>Detalle del Cliente</DialogTitle>
          </DialogHeader>
          {selectedCliente && editCliente && (
            <div className="flex flex-col gap-2">
              <div className="font-bold text-lg mb-2">{editCliente.nombre}</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-2">
                <div>
                  <b>Nombre:</b>
                  <Input className="w-full mt-1" value={editCliente.nombre || ""} onChange={e => setEditCliente(c => ({ ...c, nombre: e.target.value }))} />
                </div>
                <div>
                  <b>CUIT/DNI:</b>
                  <Input className="w-full mt-1" value={editCliente.cuit || ""} onChange={e => setEditCliente(c => ({ ...c, cuit: e.target.value }))} />
                </div>
                <div>
                  <b>Dirección:</b>
                  <Input className="w-full mt-1" value={editCliente.direccion || ""} onChange={e => setEditCliente(c => ({ ...c, direccion: e.target.value }))} />
                </div>
                <div>
                  <b>Teléfono:</b>
                  <Input className="w-full mt-1" value={editCliente.telefono || ""} onChange={e => setEditCliente(c => ({ ...c, telefono: e.target.value }))} />
                </div>
                <div>
                  <b>Email:</b>
                  <Input className="w-full mt-1" value={editCliente.email || ""} onChange={e => setEditCliente(c => ({ ...c, email: e.target.value }))} />
                </div>
                <div>
                  <b>Localidad:</b>
                  <Input className="w-full mt-1" value={editCliente.localidad || ""} onChange={e => setEditCliente(c => ({ ...c, localidad: e.target.value }))} />
                </div>
                <div>
                  <b>Partido:</b>
                  <Input className="w-full mt-1" value={editCliente.partido || ""} onChange={e => setEditCliente(c => ({ ...c, partido: e.target.value }))} />
                </div>
                <div>
                  <b>Barrio:</b>
                  <Input className="w-full mt-1" value={editCliente.barrio || ""} onChange={e => setEditCliente(c => ({ ...c, barrio: e.target.value }))} />
                </div>
                <div>
                  <b>Área:</b>
                  <Input className="w-full mt-1" value={editCliente.area || ""} onChange={e => setEditCliente(c => ({ ...c, area: e.target.value }))} />
                </div>
                <div>
                  <b>Lote:</b>
                  <Input className="w-full mt-1" value={editCliente.lote || ""} onChange={e => setEditCliente(c => ({ ...c, lote: e.target.value }))} />
                </div>
                <div className="md:col-span-2">
                  <b>Descripción:</b>
                  <Textarea className="w-full mt-1" value={editCliente.descripcion || ""} onChange={e => setEditCliente(c => ({ ...c, descripcion: e.target.value }))} />
                </div>
                <div>
                  <b>Estado:</b>
                  <select className="w-full mt-1 border rounded px-2 py-2" value={editCliente.estado} onChange={e => setEditCliente(c => ({ ...c, estado: e.target.value }))}>
                    <option value="Activo">Activo</option>
                    <option value="Inactivo">Inactivo</option>
                  </select>
                </div>
              </div>
              {editMsg && <div className={`p-2 rounded text-sm ${editMsg.startsWith("Error") ? "bg-red-50 text-red-800" : "bg-green-50 text-green-800"}`}>{editMsg}</div>}
              <Button variant="default" onClick={handleGuardarEdicion} disabled={editSaving}>{editSaving ? "Guardando..." : "Guardar cambios"}</Button>
              <div className="mt-2">
                <b>Ventas asociadas:</b>
                {ventas.length === 0 ? (
                  <div className="text-gray-500 text-sm">No hay ventas registradas.</div>
                ) : (
                  <ul className="list-disc ml-6">
                    {ventas.map(v => (
                      <li key={v.id} className="mb-1">
                        <b>{v.numeroPedido || v.id}</b> - {v.fecha} - <span className="font-semibold text-primary">${v.total?.toFixed(2) || "-"}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="mt-2">
                <b>Presupuestos asociados:</b>
                {presupuestos.length === 0 ? (
                  <div className="text-gray-500 text-sm">No hay presupuestos registrados.</div>
                ) : (
                  <ul className="list-disc ml-6">
                    {presupuestos.map(p => (
                      <li key={p.id} className="mb-1">
                        <b>{p.numeroPedido || p.id}</b> - {p.fecha} - <span className="font-semibold text-primary">${p.total?.toFixed(2) || "-"}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ClientesPage; 