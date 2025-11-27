"use client";
import React, { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Truck, Plus, Save, X, Eye, Building2, Phone, Mail, FileText } from "lucide-react";
import { db } from "@/lib/firebase";
import { collection, getDocs, addDoc, updateDoc, doc, query, where } from "firebase/firestore";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

const ProveedoresPage = () => {
  const [open, setOpen] = useState(false);
  const [filtro, setFiltro] = useState("");
  const [proveedores, setProveedores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedProveedor, setSelectedProveedor] = useState(null);
  const [detalleOpen, setDetalleOpen] = useState(false);
  const [compras, setCompras] = useState([]);
  const [cuentasPorPagar, setCuentasPorPagar] = useState([]);
  const [form, setForm] = useState({ 
    nombre: "", 
    cuit: "", 
    rubro: "",
    direccion: "", 
    telefono: "", 
    email: "", 
    contacto: "",
    estado: "Activo",
    condicionPago: "Contado",
    observaciones: ""
  });
  const [saving, setSaving] = useState(false);
  const [editProveedor, setEditProveedor] = useState(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editMsg, setEditMsg] = useState("");
  const [activeTab, setActiveTab] = useState('datos');
  const [detalleTab, setDetalleTab] = useState('datos');
  const lang = typeof window !== "undefined" ? window.location.pathname.split("/")[1] : "";

  useEffect(() => {
    const fetchProveedores = async () => {
      setLoading(true);
      const snap = await getDocs(collection(db, "proveedores"));
      setProveedores(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    };
    fetchProveedores();
  }, []);

  const handleVerDetalle = async (proveedor) => {
    setSelectedProveedor(proveedor);
    setEditProveedor({ ...proveedor });
    setEditMsg("");
    setDetalleOpen(true);
    
    // Consultar cuentas por pagar (gastos de tipo proveedor)
    const gastosSnap = await getDocs(
      query(collection(db, "gastos"), 
      where("tipo", "==", "proveedor"),
      where("proveedorId", "==", proveedor.id))
    );
    const gastosData = gastosSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    setCuentasPorPagar(gastosData);
  };

  const handleGuardar = async () => {
    if (!form.nombre || !form.telefono) return;
    setSaving(true);
    await addDoc(collection(db, "proveedores"), {
      ...form,
      fechaCreacion: new Date().toISOString()
    });
    setForm({ 
      nombre: "", 
      cuit: "", 
      rubro: "",
      direccion: "", 
      telefono: "", 
      email: "", 
      contacto: "",
      estado: "Activo",
      condicionPago: "Contado",
      observaciones: ""
    });
    setOpen(false);
    // Refrescar lista
    const snap = await getDocs(collection(db, "proveedores"));
    setProveedores(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    setSaving(false);
  };

  const handleGuardarEdicion = async () => {
    if (!editProveedor.nombre || !editProveedor.telefono) {
      setEditMsg("Nombre y teléfono son obligatorios.");
      return;
    }
    setEditSaving(true);
    setEditMsg("");
    try {
      await updateDoc(doc(db, "proveedores", editProveedor.id), editProveedor);
      setEditMsg("Datos actualizados correctamente.");
      // Refrescar lista
      const snap = await getDocs(collection(db, "proveedores"));
      setProveedores(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setSelectedProveedor({ ...editProveedor });
      setTimeout(() => setEditMsg(""), 1200);
    } catch (e) {
      setEditMsg("Error al guardar: " + e.message);
    }
    setEditSaving(false);
  };

  // Calcular totales del proveedor
  const calcularTotales = (cuentas) => {
    const total = cuentas.reduce((acc, c) => acc + (Number(c.monto) || 0), 0);
    const pagado = cuentas.reduce((acc, c) => acc + (Number(c.montoPagado) || 0), 0);
    const pendiente = total - pagado;
    return { total, pagado, pendiente };
  };

  return (
    <div className="py-8 px-2 max-w-7xl mx-auto">
      <div className="mb-8 flex items-center gap-4">
        <Truck className="w-10 h-10 text-primary" />
        <div>
          <h1 className="text-3xl font-bold mb-1">Proveedores</h1>
          <p className="text-lg text-gray-500">Gestión de proveedores y cuentas por pagar.</p>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle>Listado de Proveedores</CardTitle>
          <div className="flex gap-2">
            <Input 
              placeholder="Buscar proveedor..." 
              value={filtro} 
              onChange={e => setFiltro(e.target.value)} 
              className="w-56" 
            />
            <Button variant="default" onClick={() => setOpen(true)}>
              <Plus className="w-4 h-4 mr-1" />
              Agregar Proveedor
            </Button>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table className="[&_th]:uppercase [&_td]:uppercase">
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>CUIT</TableHead>
                <TableHead>Rubro</TableHead>
                <TableHead>Teléfono</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Condición de Pago</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={8}>Cargando...</TableCell></TableRow>
              ) : proveedores.filter(p => 
                p.nombre.toLowerCase().includes(filtro.toLowerCase()) || 
                (p.cuit || "").includes(filtro) ||
                (p.rubro || "").toLowerCase().includes(filtro.toLowerCase())
              ).map(p => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.nombre}</TableCell>
                  <TableCell>{p.cuit || "-"}</TableCell>
                  <TableCell>{p.rubro || "-"}</TableCell>
                  <TableCell>{p.telefono}</TableCell>
                  <TableCell>{p.email || "-"}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={
                      p.condicionPago === "Contado" ? "bg-green-50 text-green-700 border-green-200" :
                      p.condicionPago === "Cuenta Corriente" ? "bg-blue-50 text-blue-700 border-blue-200" :
                      "bg-yellow-50 text-yellow-700 border-yellow-200"
                    }>
                      {p.condicionPago || "Contado"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={p.estado === "Activo" ? "default" : "secondary"}>
                      {p.estado}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button size="sm" variant="outline" onClick={() => handleVerDetalle(p)}>
                      Ver
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Modal alta proveedor */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[95vw] max-w-[600px] max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Agregar Proveedor</DialogTitle>
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
                  activeTab === 'comercial' 
                    ? 'border-blue-500 text-blue-600' 
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
                onClick={() => setActiveTab('comercial')}
              >
                Info Comercial
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
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Nombre/Razón Social *
                      </label>
                      <Input 
                        placeholder="Nombre del proveedor" 
                        value={form.nombre} 
                        onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} 
                        required 
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        CUIT
                      </label>
                      <Input 
                        placeholder="Ej: 20-12345678-9" 
                        value={form.cuit} 
                        onChange={e => setForm(f => ({ ...f, cuit: e.target.value }))} 
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Rubro
                      </label>
                      <Input 
                        placeholder="Ej: Maderas, Ferretería, Transporte" 
                        value={form.rubro} 
                        onChange={e => setForm(f => ({ ...f, rubro: e.target.value }))} 
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Teléfono *
                      </label>
                      <Input 
                        placeholder="Ej: 221-555-1234" 
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
                        placeholder="Ej: proveedor@email.com" 
                        type="email"
                        value={form.email} 
                        onChange={e => setForm(f => ({ ...f, email: e.target.value }))} 
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Persona de Contacto
                      </label>
                      <Input 
                        placeholder="Nombre de la persona de contacto" 
                        value={form.contacto} 
                        onChange={e => setForm(f => ({ ...f, contacto: e.target.value }))} 
                      />
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'comercial' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Condición de Pago
                      </label>
                      <select 
                        className="w-full border rounded-md px-3 py-2 h-10" 
                        value={form.condicionPago} 
                        onChange={e => setForm(f => ({ ...f, condicionPago: e.target.value }))}
                      >
                        <option value="Contado">Contado</option>
                        <option value="7 días">7 días</option>
                        <option value="15 días">15 días</option>
                        <option value="30 días">30 días</option>
                        <option value="60 días">60 días</option>
                        <option value="Cuenta Corriente">Cuenta Corriente</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Estado
                      </label>
                      <select 
                        className="w-full border rounded-md px-3 py-2 h-10" 
                        value={form.estado} 
                        onChange={e => setForm(f => ({ ...f, estado: e.target.value }))}
                      >
                        <option value="Activo">Activo</option>
                        <option value="Inactivo">Inactivo</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Dirección
                    </label>
                    <Input 
                      placeholder="Dirección del proveedor" 
                      value={form.direccion} 
                      onChange={e => setForm(f => ({ ...f, direccion: e.target.value }))} 
                    />
                  </div>
                </div>
              )}

              {activeTab === 'adicional' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Observaciones
                    </label>
                    <Textarea 
                      placeholder="Notas, referencias, condiciones especiales, horarios de entrega, etc." 
                      value={form.observaciones} 
                      onChange={e => setForm(f => ({ ...f, observaciones: e.target.value }))} 
                      rows={6}
                      className="resize-none"
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
                    onClick={() => {
                      if (activeTab === 'comercial') setActiveTab('datos');
                      if (activeTab === 'adicional') setActiveTab('comercial');
                    }}
                  >
                    Anterior
                  </Button>
                )}
                {activeTab !== 'adicional' && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      if (activeTab === 'datos') setActiveTab('comercial');
                      else if (activeTab === 'comercial') setActiveTab('adicional');
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
                  disabled={saving || !form.nombre || !form.telefono}
                >
                  {saving ? "Guardando..." : "Guardar"}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal detalle proveedor */}
      <Dialog open={detalleOpen} onOpenChange={setDetalleOpen}>
        <DialogContent hiddenCloseIcon className="w-[98vw] max-w-[960px] max-h-[92vh] p-0 gap-0 overflow-hidden rounded-2xl shadow-2xl border-0 outline-none focus:outline-none bg-white">
          <div className="h-14 shrink-0 flex items-center justify-between px-5 border-b bg-gradient-to-r from-gray-50 to-white">
            <DialogTitle className="text-xl font-bold tracking-tight">Detalle del Proveedor</DialogTitle>
            <DialogClose asChild>
              <button type="button" className="inline-flex items-center justify-center h-9 w-9 rounded-full border border-gray-200 bg-white hover:bg-gray-100 text-gray-600 focus-visible:ring-2 focus-visible:ring-blue-500">
                <X className="w-5 h-5" />
              </button>
            </DialogClose>
          </div>
          {selectedProveedor && editProveedor && (
            <div className="flex flex-col h-full min-h-0">
              {/* Header con nombre destacado */}
              <div className="px-5 pt-3">
                <div className="font-bold text-2xl mb-2 leading-tight uppercase">{editProveedor.nombre || ''}</div>
                {/* Tabs del modal */}
                <div className="flex gap-2 items-center">
                  <div className="inline-flex items-center gap-1 bg-gray-100 rounded-full p-1">
                  {['datos','cuentas'].map(tab => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setDetalleTab(tab)}
                      className={`px-3 py-1.5 text-sm font-medium rounded-full transition-colors ${
                        detalleTab === tab ? 'bg-white text-blue-600 shadow border border-gray-200' : 'text-gray-600 hover:text-gray-800'
                      }`}
                    >
                      {tab === 'datos' && 'Datos'}
                      {tab === 'cuentas' && 'Cuentas por Pagar'}
                    </button>
                  ))}
                  </div>
                </div>
              </div>

              <div className={`${detalleTab !== 'cuentas' ? 'flex-1 overflow-y-auto overscroll-contain pb-28' : 'pb-5'} px-5`}>
                {detalleTab === 'datos' && (
                  <div className="space-y-4 mt-4">
                    {/* Información del proveedor */}
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                      <h4 className="text-sm font-semibold text-gray-900 mb-3">Información General</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <Label htmlFor="nombre">Nombre/Razón Social *</Label>
                          <Input
                            id="nombre"
                            placeholder="Nombre del proveedor"
                            className="w-full h-9 rounded-lg"
                            value={editProveedor.nombre || ""}
                            onChange={(e) => setEditProveedor((p) => ({ ...p, nombre: e.target.value }))}
                          />
                        </div>
                        <div>
                          <Label htmlFor="cuit">CUIT</Label>
                          <Input
                            id="cuit"
                            placeholder="Ej: 20-12345678-9"
                            className="w-full h-9 rounded-lg"
                            value={editProveedor.cuit || ""}
                            onChange={(e) => setEditProveedor((p) => ({ ...p, cuit: e.target.value }))}
                          />
                        </div>
                        <div>
                          <Label htmlFor="rubro">Rubro</Label>
                          <Input
                            id="rubro"
                            placeholder="Ej: Maderas, Ferretería"
                            className="w-full h-9 rounded-lg"
                            value={editProveedor.rubro || ""}
                            onChange={(e) => setEditProveedor((p) => ({ ...p, rubro: e.target.value }))}
                          />
                        </div>
                        <div>
                          <Label htmlFor="telefono">Teléfono *</Label>
                          <Input
                            id="telefono"
                            placeholder="Teléfono"
                            className="w-full h-9 rounded-lg"
                            value={editProveedor.telefono || ""}
                            onChange={(e) => setEditProveedor((p) => ({ ...p, telefono: e.target.value }))}
                          />
                        </div>
                        <div>
                          <Label htmlFor="email">Email</Label>
                          <Input
                            id="email"
                            type="email"
                            placeholder="ejemplo@proveedor.com"
                            className="w-full h-9 rounded-lg"
                            value={editProveedor.email || ""}
                            onChange={(e) => setEditProveedor((p) => ({ ...p, email: e.target.value }))}
                          />
                        </div>
                        <div>
                          <Label htmlFor="contacto">Persona de Contacto</Label>
                          <Input
                            id="contacto"
                            placeholder="Nombre del contacto"
                            className="w-full h-9 rounded-lg"
                            value={editProveedor.contacto || ""}
                            onChange={(e) => setEditProveedor((p) => ({ ...p, contacto: e.target.value }))}
                          />
                        </div>
                        <div className="md:col-span-2">
                          <Label htmlFor="direccion">Dirección</Label>
                          <Input
                            id="direccion"
                            placeholder="Dirección completa"
                            className="w-full h-9 rounded-lg"
                            value={editProveedor.direccion || ""}
                            onChange={(e) => setEditProveedor((p) => ({ ...p, direccion: e.target.value }))}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Condiciones comerciales */}
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                      <h4 className="text-sm font-semibold text-gray-900 mb-3">Condiciones Comerciales</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <Label htmlFor="condicionPago">Condición de Pago</Label>
                          <select 
                            id="condicionPago"
                            className="w-full border rounded-md px-3 py-2 h-9" 
                            value={editProveedor.condicionPago || "Contado"} 
                            onChange={e => setEditProveedor(p => ({ ...p, condicionPago: e.target.value }))}
                          >
                            <option value="Contado">Contado</option>
                            <option value="7 días">7 días</option>
                            <option value="15 días">15 días</option>
                            <option value="30 días">30 días</option>
                            <option value="60 días">60 días</option>
                            <option value="Cuenta Corriente">Cuenta Corriente</option>
                          </select>
                        </div>
                        <div className="flex items-center justify-between gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                          <div>
                            <p className="text-sm font-medium text-gray-700">Estado</p>
                            <p className="text-xs text-gray-500">Activo o Inactivo</p>
                          </div>
                          <Switch
                            checked={editProveedor.estado === 'Activo'}
                            onCheckedChange={(checked) => setEditProveedor((p) => ({ ...p, estado: checked ? 'Activo' : 'Inactivo' }))}
                            aria-label="Cambiar estado"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Observaciones */}
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                      <h4 className="text-sm font-semibold text-gray-900 mb-3">Observaciones</h4>
                      <Textarea
                        id="observaciones"
                        placeholder="Notas, condiciones especiales, horarios de entrega..."
                        className="w-full rounded-lg"
                        rows={4}
                        value={editProveedor.observaciones || ""}
                        onChange={(e) => setEditProveedor((p) => ({ ...p, observaciones: e.target.value }))}
                      />
                    </div>
                  </div>
                )}

                {detalleTab === 'cuentas' && (
                  <div className="mt-4">
                    {/* Resumen financiero */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                      <Card>
                        <CardContent className="p-4">
                          <div className="text-sm text-gray-500">Total Compras</div>
                          <div className="text-2xl font-bold text-blue-600">
                            ${calcularTotales(cuentasPorPagar).total.toLocaleString("es-AR")}
                          </div>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="p-4">
                          <div className="text-sm text-gray-500">Total Pagado</div>
                          <div className="text-2xl font-bold text-green-600">
                            ${calcularTotales(cuentasPorPagar).pagado.toLocaleString("es-AR")}
                          </div>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="p-4">
                          <div className="text-sm text-gray-500">Saldo Pendiente</div>
                          <div className="text-2xl font-bold text-red-600">
                            ${calcularTotales(cuentasPorPagar).pendiente.toLocaleString("es-AR")}
                          </div>
                        </CardContent>
                      </Card>
                    </div>

                    {/* Listado de cuentas por pagar */}
                    <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                      <h4 className="font-semibold text-gray-900 mb-3">Historial de Cuentas</h4>
                      {cuentasPorPagar.length === 0 ? (
                        <div className="text-gray-500 text-sm text-center py-8">
                          No hay cuentas registradas para este proveedor.
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {cuentasPorPagar.map(cuenta => {
                            const montoPagado = Number(cuenta.montoPagado) || 0;
                            const montoTotal = Number(cuenta.monto) || 0;
                            const saldo = montoTotal - montoPagado;
                            const porcentajePagado = montoTotal > 0 ? (montoPagado / montoTotal) * 100 : 0;
                            
                            return (
                              <div key={cuenta.id} className="bg-white p-3 rounded-lg border border-gray-200">
                                <div className="flex items-start justify-between mb-2">
                                  <div className="flex-1">
                                    <div className="font-medium text-gray-900">{cuenta.concepto}</div>
                                    <div className="text-sm text-gray-500">
                                      Fecha: {cuenta.fecha || "-"}
                                      {cuenta.numeroComprobante && ` • Nº ${cuenta.numeroComprobante}`}
                                    </div>
                                  </div>
                                  <Badge className={
                                    cuenta.estadoPago === "Pagado" ? "bg-green-100 text-green-800 border-green-200" :
                                    cuenta.estadoPago === "Pagado Parcial" ? "bg-yellow-100 text-yellow-800 border-yellow-200" :
                                    "bg-red-100 text-red-800 border-red-200"
                                  }>
                                    {cuenta.estadoPago || "Pendiente"}
                                  </Badge>
                                </div>
                                <div className="grid grid-cols-3 gap-2 text-sm">
                                  <div>
                                    <span className="text-gray-500">Total:</span>
                                    <span className="font-semibold ml-1">${montoTotal.toLocaleString("es-AR")}</span>
                                  </div>
                                  <div>
                                    <span className="text-gray-500">Pagado:</span>
                                    <span className="font-semibold text-green-600 ml-1">${montoPagado.toLocaleString("es-AR")}</span>
                                  </div>
                                  <div>
                                    <span className="text-gray-500">Saldo:</span>
                                    <span className="font-semibold text-red-600 ml-1">${saldo.toLocaleString("es-AR")}</span>
                                  </div>
                                </div>
                                {/* Barra de progreso */}
                                <div className="mt-2">
                                  <div className="w-full bg-gray-200 rounded-full h-2">
                                    <div 
                                      className="bg-green-600 h-2 rounded-full transition-all" 
                                      style={{ width: `${porcentajePagado}%` }}
                                    />
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
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
                <div className="text-xs text-gray-500">ID: {selectedProveedor.id}</div>
                <Button
                  onClick={handleGuardarEdicion}
                  disabled={editSaving || !editProveedor.nombre || !editProveedor.telefono}
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

export default ProveedoresPage;

