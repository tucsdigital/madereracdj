"use client";
import React, { useState } from "react";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogTitle, DialogClose } from "@/components/ui/dialog";
import { Users, Plus, Save, X } from "lucide-react";
import { useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, where, updateDoc, doc } from "firebase/firestore";
import FormularioClienteObras from "@/components/obras/FormularioClienteObras";

const ClientesPage = () => {
  const [open, setOpen] = useState(false);
  const [filtro, setFiltro] = useState("");
  const [clientes, setClientes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCliente, setSelectedCliente] = useState(null);
  const [detalleOpen, setDetalleOpen] = useState(false);
  const [ventas, setVentas] = useState([]);
  const [presupuestos, setPresupuestos] = useState([]);
  const [editCliente, setEditCliente] = useState(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editMsg, setEditMsg] = useState("");
  const [detalleTab, setDetalleTab] = useState('datos');
  const lang = typeof window !== "undefined" ? window.location.pathname.split("/")[1] : "";

  // Utilidades de validación en tiempo real
  const onlyDigits = (s) => (s || "").replace(/\D/g, "");
  const isValidEmail = (email) => !email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const isValidPhone = (phone) => {
    const d = onlyDigits(phone);
    return d.length === 0 || d.length >= 8; // al menos 8 dígitos
  };
  const isValidCuit = (cuit) => {
    const d = onlyDigits(cuit);
    return d.length === 0 || d.length === 11; // CUIT de 11 dígitos
  };

  useEffect(() => {
    const fetchClientes = async () => {
      setLoading(true);
      const snap = await getDocs(collection(db, "clientes"));
      setClientes(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    };
    fetchClientes();
  }, []);

  // OPTIMIZADO: Cargar datos solo cuando se abre el modal y no están cargados
  const handleVerDetalle = async (cliente) => {
    setSelectedCliente(cliente);
    setEditCliente({ ...cliente, estado: "Activo" });
    setEditMsg("");
    setDetalleOpen(true);
    
    // Cargar datos en paralelo solo si no están ya cargados para este cliente
    if (selectedCliente?.id !== cliente.id) {
      // Consultar ventas y presupuestos en paralelo
      const [ventasSnap, presupuestosSnap] = await Promise.all([
        getDocs(query(collection(db, "ventas"), where("clienteId", "==", cliente.id))),
        getDocs(query(collection(db, "presupuestos"), where("cliente.cuit", "==", cliente.cuit)))
      ]);
      
      setVentas(ventasSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setPresupuestos(presupuestosSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }
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
      // OPTIMIZADO: Actualizar solo el cliente editado en la lista local
      setClientes(prev => prev.map(c => c.id === editCliente.id ? { ...editCliente } : c));
      setSelectedCliente({ ...editCliente });
      setTimeout(() => setEditMsg(""), 1200);
    } catch (e) {
      setEditMsg("Error al guardar: " + e.message);
    }
    setEditSaving(false);
  };

  return (
    <div className="py-8 px-2 max-w-7xl mx-auto">
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
          <Table className="[&_th]:uppercase [&_td]:uppercase">
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
      <FormularioClienteObras
        open={open}
        onClose={() => setOpen(false)}
        onClienteGuardado={(clienteId, clienteData) => {
          setClientes((prev) => {
            if (prev.some((c) => c.id === clienteId)) return prev;
            return [{ id: clienteId, ...clienteData }, ...prev];
          });
          setOpen(false);
        }}
        mode="general"
        submitLabel="Guardar"
      />
      {/* Modal detalle cliente */}
      <Dialog open={detalleOpen} onOpenChange={setDetalleOpen}>
        <DialogContent hiddenCloseIcon className="w-[98vw] max-w-[960px] max-h-[92vh] p-0 gap-0 overflow-hidden rounded-2xl shadow-2xl border-0 outline-none focus:outline-none bg-white">
          <div className="h-14 shrink-0 flex items-center justify-between px-5 border-b bg-gradient-to-r from-gray-50 to-white">
            <DialogTitle className="text-xl font-bold tracking-tight">Detalle del Cliente</DialogTitle>
            <DialogClose asChild>
              <button type="button" className="inline-flex items-center justify-center h-9 w-9 rounded-full border border-gray-200 bg-white hover:bg-gray-100 text-gray-600 focus-visible:ring-2 focus-visible:ring-blue-500">
                <X className="w-5 h-5" />
              </button>
            </DialogClose>
          </div>
          {selectedCliente && editCliente && (
            <div className="flex flex-col h-full min-h-0">
              {/* Header con nombre destacado */}
              <div className="px-5 pt-3">
                <div className="font-bold text-2xl mb-2 leading-tight uppercase">{(editCliente.nombre || '').toString()}</div>
                {/* Tabs del modal */}
                <div className="flex gap-2 items-center">
                  <div className="inline-flex items-center gap-1 bg-gray-100 rounded-full p-1">
                  {['datos','actividad'].map(tab => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setDetalleTab(tab)}
                      className={`px-3 py-1.5 text-sm font-medium rounded-full transition-colors ${
                        detalleTab === tab ? 'bg-white text-blue-600 shadow border border-gray-200' : 'text-gray-600 hover:text-gray-800'
                      }`}
                    >
                      {tab === 'datos' && 'Datos'}
                      {tab === 'actividad' && 'Actividad'}
                    </button>
                  ))}
                  </div>
                </div>
              </div>

              <div className={`${detalleTab !== 'actividad' ? 'flex-1 overflow-y-auto overscroll-contain pb-28' : 'pb-5'} px-5`}>
                {detalleTab !== 'actividad' && (
                  <div className="space-y-6 mt-4">
                    {/* Datos personales + Datos de contacto (lado a lado en desktop) */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {/* Datos personales */}
                      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3">
                        <h4 className="text-sm font-semibold text-gray-900 mb-3">Datos personales</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div>
                            <Label htmlFor="nombre">Nombre *</Label>
                            <Input
                              id="nombre"
                              placeholder="Nombre y apellido del cliente"
                              className="w-full h-9 rounded-lg"
                              value={editCliente.nombre || ""}
                              onChange={(e) => setEditCliente((c) => ({ ...c, nombre: e.target.value }))}
                            />
                          </div>
                          <div>
                            <div className="flex items-center gap-1 mb-1">
                              <Label htmlFor="cuit">CUIT/DNI</Label>
                            </div>
                            <Input
                              id="cuit"
                              placeholder="Ej: 20301234567"
                              className="w-full h-9 rounded-lg"
                              value={editCliente.cuit || ""}
                              onChange={(e) => setEditCliente((c) => ({ ...c, cuit: e.target.value }))}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Datos de contacto */}
                      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3">
                        <h4 className="text-sm font-semibold text-gray-900 mb-3">Datos de contacto</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div className="md:max-w-sm">
                            <div className="flex items-center gap-1 mb-1">
                              <Label htmlFor="telefono">Teléfono *</Label>
                            </div>
                            <Input
                              id="telefono"
                              placeholder="Ej: 1156781234"
                              inputMode="numeric"
                              className={`w-full h-9 rounded-lg ${!isValidPhone(editCliente.telefono) ? 'border-red-300 focus-visible:ring-red-500' : ''}`}
                              value={editCliente.telefono || ""}
                              onChange={(e) => setEditCliente((c) => ({ ...c, telefono: e.target.value }))}
                              aria-invalid={!isValidPhone(editCliente.telefono)}
                            />
                            {!isValidPhone(editCliente.telefono) && (
                              <p className="mt-1 text-xs text-red-600">El teléfono debe tener al menos 8 dígitos.</p>
                            )}
                          </div>
                          <div>
                            <Label htmlFor="email">Email</Label>
                            <Input
                              id="email"
                              type="email"
                              placeholder="ejemplo@correo.com"
                              className={`w-full h-9 rounded-lg ${!isValidEmail(editCliente.email) ? 'border-red-300 focus-visible:ring-red-500' : ''}`}
                              value={editCliente.email || ""}
                              onChange={(e) => setEditCliente((c) => ({ ...c, email: e.target.value }))}
                              aria-invalid={!isValidEmail(editCliente.email)}
                            />
                            {!isValidEmail(editCliente.email) && (
                              <p className="mt-1 text-xs text-red-600">Formato de correo inválido.</p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Ubicación */}
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3">
                      <h4 className="text-sm font-semibold text-gray-900 mb-3">Ubicación</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <Label htmlFor="direccion">Dirección *</Label>
                          <Input
                            id="direccion"
                            placeholder="Calle, número, piso..."
                            className="w-full h-9 rounded-lg"
                            value={editCliente.direccion || ""}
                            onChange={(e) => setEditCliente((c) => ({ ...c, direccion: e.target.value }))}
                          />
                        </div>
                        <div>
                          <Label htmlFor="localidad">Localidad</Label>
                          <Input
                            id="localidad"
                            placeholder="Ej: La Plata"
                            className="w-full h-9 rounded-lg"
                            value={editCliente.localidad || ""}
                            onChange={(e) => setEditCliente((c) => ({ ...c, localidad: e.target.value }))}
                          />
                        </div>
                        <div>
                          <Label htmlFor="partido">Partido</Label>
                          <Input
                            id="partido"
                            placeholder="Ej: La Plata"
                            className="w-full h-9 rounded-lg"
                            value={editCliente.partido || ""}
                            onChange={(e) => setEditCliente((c) => ({ ...c, partido: e.target.value }))}
                          />
                        </div>
                        <div>
                          <Label htmlFor="barrio">Barrio</Label>
                          <Input
                            id="barrio"
                            placeholder="Ej: Centro"
                            className="w-full h-9 rounded-lg"
                            value={editCliente.barrio || ""}
                            onChange={(e) => setEditCliente((c) => ({ ...c, barrio: e.target.value }))}
                          />
                        </div>
                        <div>
                          <Label htmlFor="area">Área</Label>
                          <Input
                            id="area"
                            placeholder="Ej: Manzana 3"
                            className="w-full h-9 rounded-lg"
                            value={editCliente.area || ""}
                            onChange={(e) => setEditCliente((c) => ({ ...c, area: e.target.value }))}
                          />
                        </div>
                        <div>
                          <Label htmlFor="lote">Lote</Label>
                          <Input
                            id="lote"
                            placeholder="Ej: 12"
                            className="w-full h-9 rounded-lg"
                            value={editCliente.lote || ""}
                            onChange={(e) => setEditCliente((c) => ({ ...c, lote: e.target.value }))}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Información adicional */}
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3">
                      <h4 className="text-sm font-semibold text-gray-900 mb-3">Información adicional</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="flex items-center justify-between gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                          <div>
                            <p className="text-sm font-medium text-gray-700">Estado</p>
                            <p className="text-xs text-gray-500">Activa o desactiva al cliente</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`text-xs ${editCliente.estado === 'Activo' ? 'text-green-600' : 'text-gray-500'}`}>{editCliente.estado === 'Activo' ? 'Activo' : 'Inactivo'}</span>
                            <Switch
                              color="success"
                              checked={true}
                              onCheckedChange={() => setEditCliente((c) => ({ ...c, estado: 'Activo' }))}
                              aria-label="Cambiar estado"
                            />
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                          <div>
                            <p className="text-sm font-medium text-gray-700">Cliente antiguo</p>
                            <p className="text-xs text-gray-500">Marca si ya existía previo al sistema</p>
                          </div>
                          <Switch
                            checked={editCliente.esClienteViejo || false}
                            onCheckedChange={(checked) => setEditCliente((c) => ({ ...c, esClienteViejo: checked }))}
                            aria-label="Cliente antiguo"
                          />
                        </div>

                        <div className="md:col-span-2">
                          <Label htmlFor="descripcion">Descripción</Label>
                          <Textarea
                            id="descripcion"
                            placeholder="Notas, preferencias, referencias..."
                            className="w-full rounded-lg h-24"
                            rows={3}
                            value={editCliente.descripcion || ""}
                            onChange={(e) => setEditCliente((c) => ({ ...c, descripcion: e.target.value }))}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {detalleTab === 'actividad' && (
                  <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* Ventas */}
                    <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                      <h4 className="font-semibold text-gray-900 mb-2">Ventas asociadas</h4>
                      {ventas.length === 0 ? (
                        <div className="text-gray-500 text-sm">No hay ventas registradas.</div>
                      ) : (
                        <ul className="divide-y divide-gray-200">
                          {ventas.map(v => (
                            <li key={v.id} className="py-2 flex items-center justify-between">
                              <div className="text-sm">
                                <span className="font-medium">{v.numeroPedido || v.id}</span>
                                <span className="text-gray-500 ml-2">{v.fecha}</span>
                                <span className="font-semibold text-primary ml-2">${v.total?.toFixed(2) || '-'}</span>
                              </div>
                              <Link href={`/${lang}/ventas/${v.id}`} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-blue-200 text-blue-700 hover:bg-blue-50 text-sm font-medium">Ver<svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M12.293 2.293a1 1 0 011.414 0l4 4a1 1 0 01-.707 1.707H15a1 1 0 110-2h.586L13 4.414V7a1 1 0 11-2 0V3a1 1 0 011-1h.293z"/><path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 112 0v3a4 4 0 01-4 4H5a4 4 0 01-4-4V7a4 4 0 014-4h3a1 1 0 110 2H5z"/></svg></Link>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    {/* Presupuestos */}
                    <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                      <h4 className="font-semibold text-gray-900 mb-2">Presupuestos asociados</h4>
                      {presupuestos.length === 0 ? (
                        <div className="text-gray-500 text-sm">No hay presupuestos registrados.</div>
                      ) : (
                        <ul className="divide-y divide-gray-200">
                          {presupuestos.map(p => (
                            <li key={p.id} className="py-2 flex items-center justify-between">
                              <div className="text-sm">
                                <span className="font-medium">{p.numeroPedido || p.id}</span>
                                <span className="text-gray-500 ml-2">{p.fecha}</span>
                                <span className="font-semibold text-primary ml-2">${p.total?.toFixed(2) || '-'}</span>
                              </div>
                              <Link href={`/${lang}/presupuestos/${p.id}`} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-blue-200 text-blue-700 hover:bg-blue-50 text-sm font-medium">Ver<svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M12.293 2.293a1 1 0 011.414 0l4 4a1 1 0 01-.707 1.707H15a1 1 0 110-2h.586L13 4.414V7a1 1 0 11-2 0V3a1 1 0 011-1h.293z"/><path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 112 0v3a4 4 0 01-4 4H5a4 4 0 01-4-4V7a4 4 0 014-4h3a1 1 0 110 2H5z"/></svg></Link>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                )}

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

              {/* Footer fijo */}
              <div className="flex justify-between items-center px-5 py-3 border-t bg-white sticky bottom-0">
                <div className="text-xs text-gray-500">ID: {selectedCliente.id}</div>
                <Button
                  onClick={handleGuardarEdicion}
                  disabled={editSaving || !editCliente.nombre || !editCliente.direccion || !editCliente.telefono}
                  className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-5 h-11 rounded-lg shadow-md"
                >
                  {editSaving ? (
                    <span>Guardando...</span>
                  ) : (
                    <>
                      <Save className="w-5 h-5" />
                      <span>Guardar cambios</span>
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ClientesPage; 
