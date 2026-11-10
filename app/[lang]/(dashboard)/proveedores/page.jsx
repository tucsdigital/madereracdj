"use client";
import React, { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Truck, Plus, Save, X, Eye, Building2, Phone, Mail, FileText, Search, ExternalLink } from "lucide-react";
import { db } from "@/lib/firebase";
import { collection, getDocs, getDoc, addDoc, updateDoc, doc, query, where } from "firebase/firestore";
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

  // OPTIMIZADO: Cargar datos solo cuando se abre el modal y no están cargados
  const handleVerDetalle = async (proveedor) => {
    setSelectedProveedor(proveedor);
    setEditProveedor({ ...proveedor });
    setEditMsg("");
    setDetalleOpen(true);
    
    // Solo consultar si es un proveedor diferente al actualmente seleccionado
    if (selectedProveedor?.id !== proveedor.id) {
      const proveedorSnap = await getDoc(doc(db, "proveedores", proveedor.id));
      if (proveedorSnap.exists()) {
        const proveedorActualizado = { id: proveedorSnap.id, ...proveedorSnap.data() };
        setSelectedProveedor(proveedorActualizado);
        setEditProveedor({ ...proveedorActualizado });
        setProveedores((prev) => prev.map((p) => (p.id === proveedorActualizado.id ? proveedorActualizado : p)));
      }

      // Consultar cuentas por pagar (gastos de tipo proveedor)
      const gastosSnap = await getDocs(
        query(collection(db, "gastos"), 
        where("tipo", "==", "proveedor"),
        where("proveedorId", "==", proveedor.id))
      );
      const gastosData = gastosSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setCuentasPorPagar(gastosData);
    }
  };

  const handleGuardar = async () => {
    if (!form.nombre || !form.telefono) return;
    setSaving(true);
    // OPTIMIZADO: Agregar directamente a la lista local en lugar de recargar todo
    const docRef = await addDoc(collection(db, "proveedores"), {
      ...form,
      fechaCreacion: new Date().toISOString()
    });
    const nuevoProveedor = { id: docRef.id, ...form, fechaCreacion: new Date().toISOString() };
    setProveedores(prev => [nuevoProveedor, ...prev]);
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
      // OPTIMIZADO: Actualizar solo el proveedor editado en la lista local
      setProveedores(prev => prev.map(p => p.id === editProveedor.id ? { ...editProveedor } : p));
      setSelectedProveedor({ ...editProveedor });
      setTimeout(() => setEditMsg(""), 1200);
    } catch (e) {
      setEditMsg("Error al guardar: " + e.message);
    }
    setEditSaving(false);
  };

  // Calcular totales del proveedor
  const calcularTotales = (cuentas, saldoAFavor) => {
    const total = cuentas.reduce((acc, c) => acc + (Number(c.monto) || 0), 0);
    const pagado = cuentas.reduce((acc, c) => acc + (Number(c.montoPagado) || 0), 0);
    const pendienteBruto = total - pagado;
    const saldoAFavorNum = Number(saldoAFavor) || 0;
    const pendienteNeto = Math.max(pendienteBruto - saldoAFavorNum, 0);
    return { total, pagado, pendienteBruto, saldoAFavor: saldoAFavorNum, pendienteNeto };
  };

  const proveedoresFiltrados = proveedores.filter((proveedor) =>
    [proveedor.nombre, proveedor.cuit, proveedor.rubro, proveedor.telefono, proveedor.email]
      .some((value) => String(value || "").toLocaleLowerCase("es-AR").includes(filtro.toLocaleLowerCase("es-AR")))
  );

  return (
    <main className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-3 py-6 font-sans text-slate-900 sm:px-6 sm:py-8">
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[.18em] text-amber-700">Abastecimiento · Cuentas</p>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="text-3xl font-semibold tracking-[-.04em] sm:text-4xl">Proveedores</h1>
            <span className="text-xs tabular-nums text-slate-500">{proveedoresFiltrados.length} resultados</span>
          </div>
          <p className="mt-2 text-sm text-slate-500">Directorio de proveedores y condiciones de pago.</p>
        </div>
        <Button onClick={() => setOpen(true)} className="h-9 self-start rounded-md px-3 text-xs sm:self-auto">
          <Plus className="mr-2 h-4 w-4" />Agregar proveedor
        </Button>
      </header>

      <div className="flex flex-col gap-2 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <label className="relative min-w-0 flex-1 sm:max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <Input placeholder="Buscar por nombre, CUIT, rubro o contacto..." value={filtro} onChange={(e) => setFiltro(e.target.value)} aria-label="Buscar proveedores" className="h-9 rounded-md border-slate-200 bg-white pl-9 text-xs shadow-sm placeholder:text-slate-500" />
        </label>
      </div>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white" aria-label="Listado de proveedores">
        {loading ? (
          <div className="flex min-h-32 items-center justify-center gap-2 text-sm text-slate-500"><span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-800" />Cargando proveedores…</div>
        ) : proveedoresFiltrados.length === 0 ? (
          <div className="px-4 py-14 text-center"><p className="text-sm font-medium text-slate-800">No se encontraron proveedores</p><p className="mt-1 text-xs text-slate-500">Probá con otro nombre, CUIT, rubro o contacto.</p></div>
        ) : (
          <div role="table" aria-label="Proveedores">
            <div role="row" className="hidden gap-5 border-b border-slate-200 bg-slate-50/70 px-5 py-2.5 text-[10px] font-semibold uppercase tracking-[.12em] text-slate-500 lg:grid lg:grid-cols-[minmax(180px,1.15fr)_minmax(200px,1.2fr)_minmax(170px,1fr)_minmax(95px,.65fr)_auto]">
              <span role="columnheader">Proveedor</span><span role="columnheader">Contacto</span><span role="columnheader">Rubro y pago</span><span role="columnheader">Estado</span><span role="columnheader" className="text-right">Acción</span>
            </div>
            {proveedoresFiltrados.map((proveedor) => (
              <article key={proveedor.id} role="row" className="grid grid-cols-1 gap-x-5 gap-y-3 border-b border-slate-200 px-4 py-4 last:border-0 sm:px-5 lg:grid-cols-[minmax(180px,1.15fr)_minmax(200px,1.2fr)_minmax(170px,1fr)_minmax(95px,.65fr)_auto] lg:items-center">
                <div role="cell" className="min-w-0 border-b border-slate-100 pb-3 lg:border-0 lg:pb-0">
                  <h2 className="truncate text-sm font-semibold uppercase text-slate-900">{proveedor.nombre || "Proveedor sin nombre"}</h2>
                  <p className="mt-1 truncate font-mono text-[11px] text-slate-500">CUIT {proveedor.cuit || "Sin informar"}</p>
                </div>
                <div role="cell" className="grid min-w-0 gap-1 text-xs text-slate-600">
                  <span className="flex min-w-0 justify-between gap-3 lg:block"><span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-slate-400 lg:hidden">Tel.</span><span className="truncate">{proveedor.telefono || "Sin informar"}</span></span>
                  <span className="flex min-w-0 justify-between gap-3 lg:block"><span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-slate-400 lg:hidden">Email</span><span className="truncate">{proveedor.email || "Sin informar"}</span></span>
                </div>
                <div role="cell" className="flex flex-wrap items-center justify-between gap-2 lg:justify-start">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 lg:hidden">Rubro y pago</span>
                  <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                    <span className="mr-1 text-xs text-slate-600">{proveedor.rubro || "Sin rubro"}</span>
                    <Badge variant="outline" className={`rounded-full px-2 py-0.5 text-[10px] ${proveedor.condicionPago === "Contado" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : proveedor.condicionPago === "Cuenta Corriente" ? "border-blue-200 bg-blue-50 text-blue-700" : "border-amber-200 bg-amber-50 text-amber-800"}`}>{proveedor.condicionPago || "Contado"}</Badge>
                  </div>
                </div>
                <div role="cell" className="flex items-center justify-between gap-4 lg:block">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 lg:hidden">Estado</span>
                  <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${proveedor.estado === "Activo" ? "text-emerald-700" : "text-slate-500"}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${proveedor.estado === "Activo" ? "bg-emerald-600" : "bg-slate-400"}`} aria-hidden="true" />{proveedor.estado || "Sin estado"}
                  </span>
                </div>
                <div role="cell" className="flex justify-end border-t border-slate-100 pt-2 lg:border-0 lg:pt-0">
                  <Button size="sm" variant="outline" onClick={() => handleVerDetalle(proveedor)} className="h-8 rounded-md border-slate-200 px-3 text-xs">Ver cuenta <ExternalLink aria-hidden="true" className="ml-2 h-3 w-3" /></Button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* Modal alta proveedor */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[95vw] max-w-[600px] max-h-[90vh] border border-border/60 bg-card">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Agregar Proveedor</DialogTitle>
          </DialogHeader>
          
          <div className="flex flex-col h-full">
            {/* Pestañas */}
            <div className="flex border-b border-border/60 mb-4">
              <button
                type="button"
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'datos' 
                    ? 'border-blue-500 text-blue-600' 
                    : 'border-transparent text-muted-foreground hover:text-foreground'
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
                    : 'border-transparent text-muted-foreground hover:text-foreground'
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
                    : 'border-transparent text-muted-foreground hover:text-foreground'
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
                      <label className="block text-sm font-medium text-foreground mb-1">
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
                      <label className="block text-sm font-medium text-foreground mb-1">
                        CUIT
                      </label>
                      <Input 
                        placeholder="Ej: 20-12345678-9" 
                        value={form.cuit} 
                        onChange={e => setForm(f => ({ ...f, cuit: e.target.value }))} 
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1">
                        Rubro
                      </label>
                      <Input 
                        placeholder="Ej: Maderas, Ferretería, Transporte" 
                        value={form.rubro} 
                        onChange={e => setForm(f => ({ ...f, rubro: e.target.value }))} 
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1">
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
                      <label className="block text-sm font-medium text-foreground mb-1">
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
                      <label className="block text-sm font-medium text-foreground mb-1">
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
                      <label className="block text-sm font-medium text-foreground mb-1">
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
                      <label className="block text-sm font-medium text-foreground mb-1">
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
                    <label className="block text-sm font-medium text-foreground mb-1">
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
                    <label className="block text-sm font-medium text-foreground mb-1">
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
            <div className="flex justify-between items-center pt-4 border-t border-border/60">
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
        <DialogContent hiddenCloseIcon className="w-[98vw] max-w-[960px] max-h-[92vh] p-0 gap-0 overflow-hidden rounded-2xl shadow-2xl border border-border/60 outline-none focus:outline-none bg-card">
          <div className="h-14 shrink-0 flex items-center justify-between px-5 border-b border-border/60 bg-gradient-to-r from-muted/50 to-card">
            <DialogTitle className="text-xl font-bold tracking-tight">Detalle del Proveedor</DialogTitle>
            <DialogClose asChild>
              <button type="button" className="inline-flex items-center justify-center h-9 w-9 rounded-full border border-border/60 bg-card hover:bg-muted text-muted-foreground focus-visible:ring-2 focus-visible:ring-blue-500">
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
                  <div className="inline-flex items-center gap-1 bg-muted/50 rounded-full p-1 border border-border/60">
                  {['datos','cuentas'].map(tab => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setDetalleTab(tab)}
                      className={`px-3 py-1.5 text-sm font-medium rounded-full transition-colors ${
                        detalleTab === tab ? 'bg-card text-blue-600 shadow border border-border/60' : 'text-muted-foreground hover:text-foreground'
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
                    <div className="bg-card rounded-xl border border-border/60 shadow-sm p-4">
                      <h4 className="text-sm font-semibold text-foreground mb-3">Información General</h4>
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
                    <div className="bg-card rounded-xl border border-border/60 shadow-sm p-4">
                      <h4 className="text-sm font-semibold text-foreground mb-3">Condiciones Comerciales</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <Label htmlFor="condicionPago">Condición de Pago</Label>
                          <select 
                            id="condicionPago"
                            className="w-full border border-border/60 bg-background text-foreground rounded-md px-3 py-2 h-9" 
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
                        <div className="flex items-center justify-between gap-3 p-3 bg-muted/50 rounded-lg border border-border/60">
                          <div>
                            <p className="text-sm font-medium text-foreground">Estado</p>
                            <p className="text-xs text-muted-foreground">Activo o Inactivo</p>
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
                    <div className="bg-card rounded-xl border border-border/60 shadow-sm p-4">
                      <h4 className="text-sm font-semibold text-foreground mb-3">Observaciones</h4>
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
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                      <Card>
                        <CardContent className="p-4">
                          <div className="text-sm text-muted-foreground">Total Compras</div>
                          <div className="text-2xl font-bold text-blue-600">
                            ${calcularTotales(cuentasPorPagar, selectedProveedor?.saldoAFavor).total.toLocaleString("es-AR")}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {cuentasPorPagar.length} cuenta{cuentasPorPagar.length !== 1 ? 's' : ''} registrada{cuentasPorPagar.length !== 1 ? 's' : ''}
                          </div>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="p-4">
                          <div className="text-sm text-muted-foreground">Total Pagado</div>
                          <div className="text-2xl font-bold text-green-600">
                            ${calcularTotales(cuentasPorPagar, selectedProveedor?.saldoAFavor).pagado.toLocaleString("es-AR")}
                          </div>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="p-4">
                          <div className="text-sm text-muted-foreground">Saldo Pendiente (neto)</div>
                          <div className="text-2xl font-bold text-red-600">
                            ${calcularTotales(cuentasPorPagar, selectedProveedor?.saldoAFavor).pendienteNeto.toLocaleString("es-AR")}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            Bruto: ${calcularTotales(cuentasPorPagar, selectedProveedor?.saldoAFavor).pendienteBruto.toLocaleString("es-AR")}
                          </div>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="p-4">
                          <div className="text-sm text-muted-foreground">Saldo a Favor</div>
                          <div className="text-2xl font-bold text-green-600">
                            ${calcularTotales(cuentasPorPagar, selectedProveedor?.saldoAFavor).saldoAFavor.toLocaleString("es-AR")}
                          </div>
                        </CardContent>
                      </Card>
                    </div>

                    {/* Listado de cuentas por pagar */}
                    <div className="bg-muted/50 p-4 rounded-lg border border-border/60">
                      <h4 className="font-semibold text-foreground mb-3">Historial de Cuentas</h4>
                      {cuentasPorPagar.length === 0 ? (
                        <div className="text-muted-foreground text-sm text-center py-8">
                          No hay cuentas registradas para este proveedor.
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {cuentasPorPagar.map(cuenta => {
                            const montoPagado = Number(cuenta.montoPagado) || 0;
                            const montoTotal = Number(cuenta.monto) || 0;
                            const saldo = montoTotal - montoPagado;
                            const porcentajePagado = montoTotal > 0 ? (montoPagado / montoTotal) * 100 : 0;
                            const estadoLabel =
                              cuenta.estadoPago === "pagado"
                                ? "Pagado"
                                : cuenta.estadoPago === "parcial"
                                ? "Pagado Parcial"
                                : "Pendiente";
                            
                            return (
                              <div key={cuenta.id} className="bg-card p-3 rounded-lg border border-border/60">
                                <div className="flex items-start justify-between mb-2">
                                  <div className="flex-1">
                                    <div className="font-medium text-foreground">{cuenta.concepto}</div>
                                    <div className="text-sm text-muted-foreground">
                                      Fecha: {cuenta.fecha || "-"}
                                      {cuenta.numeroComprobante && ` • Nº ${cuenta.numeroComprobante}`}
                                    </div>
                                  </div>
                                  <Badge className={
                                    cuenta.estadoPago === "pagado" ? "bg-emerald-500/10 text-emerald-800 dark:text-emerald-200 border-emerald-500/20" :
                                    cuenta.estadoPago === "parcial" ? "bg-amber-500/10 text-amber-800 dark:text-amber-200 border-amber-500/20" :
                                    "bg-red-500/15 text-red-800 dark:text-red-200 border-red-500/20"
                                  }>
                                    {estadoLabel}
                                  </Badge>
                                </div>
                                <div className="grid grid-cols-3 gap-2 text-sm">
                                  <div>
                                    <span className="text-muted-foreground">Total:</span>
                                    <span className="font-semibold ml-1">${montoTotal.toLocaleString("es-AR")}</span>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">Pagado:</span>
                                    <span className="font-semibold text-green-600 ml-1">${montoPagado.toLocaleString("es-AR")}</span>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">Saldo:</span>
                                    <span className="font-semibold text-red-600 ml-1">${saldo.toLocaleString("es-AR")}</span>
                                  </div>
                                </div>
                                {/* Barra de progreso */}
                                <div className="mt-2">
                                  <div className="w-full bg-muted rounded-full h-2">
                                    <div 
                                      className="bg-emerald-600 h-2 rounded-full transition-all" 
                                      style={{ width: `${porcentajePagado}%` }}
                                    />
                                  </div>
                                </div>
                                {cuenta.pagos && cuenta.pagos.length > 0 && (
                                  <div className="mt-3 rounded-md border border-border/60 bg-muted/50 p-2">
                                    <div className="text-xs text-muted-foreground font-semibold mb-1">
                                      Pagos ({cuenta.pagos.length})
                                    </div>
                                    <div className="space-y-1">
                                      {[...cuenta.pagos].slice(-3).reverse().map((pago, idx) => (
                                        <div key={idx} className="flex items-center justify-between text-xs">
                                          <div className="text-muted-foreground">
                                            {pago.fecha || "-"} · {pago.metodo || "Efectivo"}
                                            {pago.pagoGlobalProveedor ? " · Pago global" : ""}
                                          </div>
                                          <div className="font-semibold text-emerald-700 dark:text-emerald-300">
                                            ${Number(pago.monto || 0).toLocaleString("es-AR")}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
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
                      ? "bg-red-500/15 text-red-800 dark:text-red-200 border border-red-500/20" 
                      : "bg-emerald-500/10 text-emerald-800 dark:text-emerald-200 border border-emerald-500/20"
                  }`}>
                    {editMsg}
                  </div>
                )}
              </div>

              {/* Footer fijo */}
              <div className="flex justify-between items-center px-5 py-3 border-t border-border/60 bg-card sticky bottom-0">
                <div className="text-xs text-muted-foreground">ID: {selectedProveedor.id}</div>
                <Button
                  onClick={handleGuardarEdicion}
                  disabled={editSaving || !editProveedor.nombre || !editProveedor.telefono}
                  className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 h-11 rounded-lg shadow-md"
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
    </main>
  );
};

export default ProveedoresPage;

