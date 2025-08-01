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
  const [form, setForm] = useState({ 
    nombre: "", 
    cuit: "", 
    direccion: "", 
    telefono: "", 
    email: "", 
    estado: "Activo", 
    localidad: "", 
    partido: "", 
    barrio: "", 
    area: "", 
    lote: "", 
    descripcion: "",
    esClienteViejo: false
  });
  const [saving, setSaving] = useState(false);
  const [editCliente, setEditCliente] = useState(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editMsg, setEditMsg] = useState("");
  const [activeTab, setActiveTab] = useState('datos');

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
    setForm({ nombre: "", cuit: "", direccion: "", telefono: "", email: "", estado: "Activo", localidad: "", partido: "", barrio: "", area: "", lote: "", descripcion: "", esClienteViejo: false });
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
                <TableHead>Tipo</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={8}>Cargando...</TableCell></TableRow>
              ) : clientes.filter(c => c.nombre.toLowerCase().includes(filtro.toLowerCase()) || (c.cuit || "").includes(filtro)).map(c => (
                <TableRow key={c.id}>
                  <TableCell>{c.nombre}</TableCell>
                  <TableCell>{c.cuit}</TableCell>
                  <TableCell>{c.direccion}</TableCell>
                  <TableCell>{c.telefono}</TableCell>
                  <TableCell>{c.email}</TableCell>
                  <TableCell>{c.esClienteViejo ? "Antiguo" : "Nuevo"}</TableCell>
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
        <DialogContent className="w-[95vw] max-w-[600px] max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Agregar Cliente</DialogTitle>
          </DialogHeader>
          
          <div className="flex flex-col h-full">
            {/* Pestañas */}
            <div className="flex border-b border-gray-200 mb-4">
              <button
                type="button"
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'datos' 
                    ? 'border-blue-500 text-blue-600' 
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
                onClick={() => setActiveTab('datos')}
              >
                Datos Básicos
              </button>
              <button
                type="button"
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'ubicacion' 
                    ? 'border-blue-500 text-blue-600' 
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
                onClick={() => setActiveTab('ubicacion')}
              >
                Ubicación
              </button>
              <button
                type="button"
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'adicional' 
                    ? 'border-blue-500 text-blue-600' 
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
                onClick={() => setActiveTab('adicional')}
              >
                Adicional
              </button>
            </div>

            {/* Contenido de las pestañas */}
            <div className="flex-1 overflow-y-auto">
              {activeTab === 'datos' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Nombre *
                      </label>
                      <Input 
                        placeholder="Nombre completo" 
                        value={form.nombre} 
                        onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} 
                        required 
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        CUIT / DNI
                      </label>
                      <Input 
                        placeholder="CUIT o DNI" 
                        value={form.cuit} 
                        onChange={e => setForm(f => ({ ...f, cuit: e.target.value }))} 
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Teléfono *
                      </label>
                      <Input 
                        placeholder="Teléfono" 
                        value={form.telefono} 
                        onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))} 
                        required 
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Email
                      </label>
                      <Input 
                        placeholder="Email" 
                        type="email"
                        value={form.email} 
                        onChange={e => setForm(f => ({ ...f, email: e.target.value }))} 
                      />
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Dirección *
                    </label>
                    <Input 
                      placeholder="Dirección completa" 
                      value={form.direccion} 
                      onChange={e => setForm(f => ({ ...f, direccion: e.target.value }))} 
                      required 
                    />
                  </div>

                  {/* Checkbox para cliente antiguo */}
                  <div className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                    <input
                      type="checkbox"
                      id="esClienteViejo"
                      checked={form.esClienteViejo}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          esClienteViejo: e.target.checked,
                        })
                      }
                      className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                    />
                    <label
                      htmlFor="esClienteViejo"
                      className="text-sm font-medium text-blue-800 dark:text-blue-200"
                    >
                      ¿Es un cliente antiguo?
                    </label>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Estado
                    </label>
                    <select 
                      className="w-full border rounded-md px-3 py-2" 
                      value={form.estado} 
                      onChange={e => setForm(f => ({ ...f, estado: e.target.value }))}
                    >
                      <option value="Activo">Activo</option>
                      <option value="Inactivo">Inactivo</option>
                    </select>
                  </div>
                </div>
              )}

              {activeTab === 'ubicacion' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Localidad
                      </label>
                      <Input 
                        placeholder="Localidad" 
                        value={form.localidad} 
                        onChange={e => setForm(f => ({ ...f, localidad: e.target.value }))} 
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Partido
                      </label>
                      <Input 
                        placeholder="Partido" 
                        value={form.partido} 
                        onChange={e => setForm(f => ({ ...f, partido: e.target.value }))} 
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Barrio
                      </label>
                      <Input 
                        placeholder="Barrio" 
                        value={form.barrio} 
                        onChange={e => setForm(f => ({ ...f, barrio: e.target.value }))} 
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Área
                      </label>
                      <Input 
                        placeholder="Área" 
                        value={form.area} 
                        onChange={e => setForm(f => ({ ...f, area: e.target.value }))} 
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Lote
                      </label>
                      <Input 
                        placeholder="Lote" 
                        value={form.lote} 
                        onChange={e => setForm(f => ({ ...f, lote: e.target.value }))} 
                      />
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'adicional' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Descripción
                    </label>
                    <Textarea 
                      placeholder="Información adicional sobre el cliente" 
                      value={form.descripcion} 
                      onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} 
                      rows={4}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Footer con navegación */}
            <div className="flex justify-between items-center pt-4 border-t border-gray-200">
              <div className="flex gap-2">
                {activeTab !== 'datos' && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setActiveTab('datos')}
                  >
                    Anterior
                  </Button>
                )}
                {activeTab !== 'adicional' && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      if (activeTab === 'datos') setActiveTab('ubicacion');
                      else if (activeTab === 'ubicacion') setActiveTab('adicional');
                    }}
                  >
                    Siguiente
                  </Button>
                )}
              </div>
              
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Cancelar
                </Button>
                <Button 
                  variant="default" 
                  onClick={handleGuardar} 
                  disabled={saving || !form.nombre || !form.direccion || !form.telefono}
                >
                  {saving ? "Guardando..." : "Guardar"}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {/* Modal detalle cliente */}
      <Dialog open={detalleOpen} onOpenChange={setDetalleOpen}>
        <DialogContent className="w-[95vw] max-w-[700px] max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Detalle del Cliente</DialogTitle>
          </DialogHeader>
          {selectedCliente && editCliente && (
            <div className="flex flex-col h-full">
              <div className="font-bold text-lg mb-4 text-center bg-gray-50 p-3 rounded-lg">
                {editCliente.nombre}
              </div>
              
              <div className="flex-1 overflow-y-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Nombre *
                    </label>
                    <Input 
                      className="w-full" 
                      value={editCliente.nombre || ""} 
                      onChange={e => setEditCliente(c => ({ ...c, nombre: e.target.value }))} 
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      CUIT/DNI
                    </label>
                    <Input 
                      className="w-full" 
                      value={editCliente.cuit || ""} 
                      onChange={e => setEditCliente(c => ({ ...c, cuit: e.target.value }))} 
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Teléfono *
                    </label>
                    <Input 
                      className="w-full" 
                      value={editCliente.telefono || ""} 
                      onChange={e => setEditCliente(c => ({ ...c, telefono: e.target.value }))} 
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Email
                    </label>
                    <Input 
                      className="w-full" 
                      value={editCliente.email || ""} 
                      onChange={e => setEditCliente(c => ({ ...c, email: e.target.value }))} 
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Dirección *
                    </label>
                    <Input 
                      className="w-full" 
                      value={editCliente.direccion || ""} 
                      onChange={e => setEditCliente(c => ({ ...c, direccion: e.target.value }))} 
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Localidad
                    </label>
                    <Input 
                      className="w-full" 
                      value={editCliente.localidad || ""} 
                      onChange={e => setEditCliente(c => ({ ...c, localidad: e.target.value }))} 
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Partido
                    </label>
                    <Input 
                      className="w-full" 
                      value={editCliente.partido || ""} 
                      onChange={e => setEditCliente(c => ({ ...c, partido: e.target.value }))} 
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Barrio
                    </label>
                    <Input 
                      className="w-full" 
                      value={editCliente.barrio || ""} 
                      onChange={e => setEditCliente(c => ({ ...c, barrio: e.target.value }))} 
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Área
                    </label>
                    <Input 
                      className="w-full" 
                      value={editCliente.area || ""} 
                      onChange={e => setEditCliente(c => ({ ...c, area: e.target.value }))} 
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Lote
                    </label>
                    <Input 
                      className="w-full" 
                      value={editCliente.lote || ""} 
                      onChange={e => setEditCliente(c => ({ ...c, lote: e.target.value }))} 
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Estado
                    </label>
                    <select 
                      className="w-full border rounded-md px-3 py-2" 
                      value={editCliente.estado} 
                      onChange={e => setEditCliente(c => ({ ...c, estado: e.target.value }))}
                    >
                      <option value="Activo">Activo</option>
                      <option value="Inactivo">Inactivo</option>
                    </select>
                  </div>
                  
                  {/* Checkbox para cliente antiguo en edición */}
                  <div className="md:col-span-2">
                    <div className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                      <input
                        type="checkbox"
                        id="editEsClienteViejo"
                        checked={editCliente.esClienteViejo || false}
                        onChange={(e) =>
                          setEditCliente({
                            ...editCliente,
                            esClienteViejo: e.target.checked,
                          })
                        }
                        className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                      />
                      <label
                        htmlFor="editEsClienteViejo"
                        className="text-sm font-medium text-blue-800 dark:text-blue-200"
                      >
                        ¿Es un cliente antiguo?
                      </label>
                    </div>
                  </div>
                  
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Descripción
                    </label>
                    <Textarea 
                      className="w-full" 
                      value={editCliente.descripcion || ""} 
                      onChange={e => setEditCliente(c => ({ ...c, descripcion: e.target.value }))} 
                      rows={3}
                    />
                  </div>
                </div>
                
                {editMsg && (
                  <div className={`p-3 rounded-lg text-sm mt-4 ${
                    editMsg.startsWith("Error") 
                      ? "bg-red-50 text-red-800 border border-red-200" 
                      : "bg-green-50 text-green-800 border border-green-200"
                  }`}>
                    {editMsg}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="flex justify-between items-center pt-4 border-t border-gray-200">
                <Button 
                  variant="default" 
                  onClick={handleGuardarEdicion} 
                  disabled={editSaving || !editCliente.nombre || !editCliente.direccion || !editCliente.telefono}
                >
                  {editSaving ? "Guardando..." : "Guardar cambios"}
                </Button>
              </div>

              {/* Información de ventas y presupuestos */}
              <div className="mt-6 space-y-4">
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h4 className="font-semibold text-gray-900 mb-2">Ventas asociadas</h4>
                  {ventas.length === 0 ? (
                    <div className="text-gray-500 text-sm">No hay ventas registradas.</div>
                  ) : (
                    <div className="space-y-1">
                      {ventas.map(v => (
                        <div key={v.id} className="text-sm">
                          <span className="font-medium">{v.numeroPedido || v.id}</span> - {v.fecha} - 
                          <span className="font-semibold text-primary ml-1">${v.total?.toFixed(2) || "-"}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h4 className="font-semibold text-gray-900 mb-2">Presupuestos asociados</h4>
                  {presupuestos.length === 0 ? (
                    <div className="text-gray-500 text-sm">No hay presupuestos registrados.</div>
                  ) : (
                    <div className="space-y-1">
                      {presupuestos.map(p => (
                        <div key={p.id} className="text-sm">
                          <span className="font-medium">{p.numeroPedido || p.id}</span> - {p.fecha} - 
                          <span className="font-semibold text-primary ml-1">${p.total?.toFixed(2) || "-"}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ClientesPage; 