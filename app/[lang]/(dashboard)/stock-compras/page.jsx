"use client";
import React, { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Plus, ArrowDown, ArrowUp, RefreshCw, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { db } from "@/lib/firebase";
import { collection, addDoc, doc, updateDoc, increment, serverTimestamp, onSnapshot, query, orderBy } from "firebase/firestore";

function StockComprasPage() {
  const [tab, setTab] = useState("inventario");
  const [openRepo, setOpenRepo] = useState(false);
  const [openMov, setOpenMov] = useState(false);
  const [filtro, setFiltro] = useState("");
  const [filtroMov, setFiltroMov] = useState("");
  const [productos, setProductos] = useState([]);
  const [movimientos, setMovimientos] = useState([]);
  const [loadingProd, setLoadingProd] = useState(true);
  const [loadingMov, setLoadingMov] = useState(true);
  const [error, setError] = useState(null);
  // Formulario reposición
  const [repoProductoId, setRepoProductoId] = useState("");
  const [repoCantidad, setRepoCantidad] = useState(1);
  const [repoObs, setRepoObs] = useState("");
  const [repoStatus, setRepoStatus] = useState(null); // 'success' | 'error' | null
  const [repoMsg, setRepoMsg] = useState("");
  const [repoLoading, setRepoLoading] = useState(false);
  // Formulario movimiento
  const [movProductoId, setMovProductoId] = useState("");
  const [movTipo, setMovTipo] = useState("entrada");
  const [movCantidad, setMovCantidad] = useState(1);
  const [movObs, setMovObs] = useState("");
  const [movStatus, setMovStatus] = useState(null);
  const [movMsg, setMovMsg] = useState("");
  const [movLoading, setMovLoading] = useState(false);

  // Cargar productos en tiempo real
  useEffect(() => {
    setLoadingProd(true);
    const q = query(collection(db, "productos"), orderBy("nombre"));
    const unsub = onSnapshot(q, (snap) => {
      setProductos(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoadingProd(false);
    }, (err) => {
      setError("Error al cargar productos: " + err.message);
      setLoadingProd(false);
    });
    return () => unsub();
  }, []);

  // Cargar movimientos en tiempo real
  useEffect(() => {
    setLoadingMov(true);
    const q = query(collection(db, "movimientos"), orderBy("fecha", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setMovimientos(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoadingMov(false);
    }, (err) => {
      setError("Error al cargar movimientos: " + err.message);
      setLoadingMov(false);
    });
    return () => unsub();
  }, []);

  // Función profesional para registrar movimiento y actualizar stock
  async function registrarMovimiento({ productoId, tipo, cantidad, usuario, observaciones }) {
    try {
      // 1. Registrar el movimiento
      await addDoc(collection(db, "movimientos"), {
        productoId,
        tipo,
        cantidad,
        usuario,
        observaciones,
        fecha: serverTimestamp(),
      });
      // 2. Actualizar el stock del producto
      const productoRef = doc(db, "productos", productoId);
      let cantidadFinal = cantidad;
      if (tipo === "salida") cantidadFinal = -Math.abs(cantidad);
      if (tipo === "ajuste") cantidadFinal = cantidad; // Para ajuste, puede ser positivo o negativo
      await updateDoc(productoRef, {
        stock: increment(cantidadFinal),
        fechaActualizacion: serverTimestamp(),
      });
      return true;
    } catch (e) {
      throw e;
    }
  }

  // Inventario filtrado
  const productosFiltrados = productos.filter(p => p.nombre?.toLowerCase().includes(filtro.toLowerCase()));

  // Movimientos con join de nombre de producto
  const movimientosFiltrados = movimientos
    .map(m => ({
      ...m,
      productoNombre: productos.find(p => p.id === m.productoId)?.nombre || "(eliminado)"
    }))
    .filter(m =>
      m.productoNombre.toLowerCase().includes(filtroMov.toLowerCase()) ||
      (m.usuario || "").toLowerCase().includes(filtroMov.toLowerCase())
    );

  // Handlers para formularios
  const handleRepoGuardar = async () => {
    setRepoStatus(null); setRepoMsg("");
    if (!repoProductoId || repoCantidad <= 0) {
      setRepoStatus("error"); setRepoMsg("Completa todos los campos correctamente."); return;
    }
    setRepoLoading(true);
    try {
      await registrarMovimiento({
        productoId: repoProductoId,
        tipo: "entrada",
        cantidad: Number(repoCantidad),
        usuario: "Admin", // TODO: usuario real
        observaciones: repoObs
      });
      setRepoStatus("success"); setRepoMsg("Reposición registrada y stock actualizado.");
      setTimeout(() => { setOpenRepo(false); setRepoProductoId(""); setRepoCantidad(1); setRepoObs(""); setRepoStatus(null); setRepoLoading(false); }, 1200);
    } catch (e) {
      setRepoStatus("error"); setRepoMsg("Error: " + e.message); setRepoLoading(false);
    }
  };
  const handleMovGuardar = async () => {
    setMovStatus(null); setMovMsg("");
    if (!movProductoId || movCantidad <= 0) {
      setMovStatus("error"); setMovMsg("Completa todos los campos correctamente."); return;
    }
    setMovLoading(true);
    try {
      await registrarMovimiento({
        productoId: movProductoId,
        tipo: movTipo,
        cantidad: Number(movCantidad),
        usuario: "Admin", // TODO: usuario real
        observaciones: movObs
      });
      setMovStatus("success"); setMovMsg("Movimiento registrado y stock actualizado.");
      setTimeout(() => { setOpenMov(false); setMovProductoId(""); setMovTipo("entrada"); setMovCantidad(1); setMovObs(""); setMovStatus(null); setMovLoading(false); }, 1200);
    } catch (e) {
      setMovStatus("error"); setMovMsg("Error: " + e.message); setMovLoading(false);
    }
  };

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
              {loadingProd ? (
                <div className="flex justify-center items-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
              ) : error ? (
                <div className="text-red-600 py-4 text-center">{error}</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Producto</TableHead>
                      <TableHead>Categoría</TableHead>
                      <TableHead>Stock</TableHead>
                      <TableHead>Unidad</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {productosFiltrados.map(p => (
                      <TableRow key={p.id} className={p.stock <= (p.min || 0) ? "bg-yellow-50" : ""}>
                        <TableCell>{p.nombre}</TableCell>
                        <TableCell>{p.categoria}</TableCell>
                        <TableCell>{p.stock}</TableCell>
                        <TableCell>{p.unidadMedida || p.unidadVenta || p.unidadVentaHerraje || p.unidadVentaQuimico || p.unidadVentaHerramienta}</TableCell>
                        <TableCell>
                          {p.stock <= (p.min || 0) ? <span className="text-yellow-700 font-semibold">Bajo</span> : <span className="text-green-600 font-semibold">OK</span>}
                        </TableCell>
                        <TableCell>
                          <Button size="sm" variant="outline" onClick={() => { setOpenRepo(true); setRepoProductoId(p.id); }}><ArrowDown className="w-4 h-4 mr-1" />Reposición</Button>
                          <Button size="sm" variant="ghost" onClick={() => { setOpenMov(true); setMovProductoId(p.id); }}><RefreshCw className="w-4 h-4 mr-1" />Movimientos</Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
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
              {loadingMov ? (
                <div className="flex justify-center items-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
              ) : error ? (
                <div className="text-red-600 py-4 text-center">{error}</div>
              ) : (
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
                    {movimientosFiltrados.map(m => (
                      <TableRow key={m.id}>
                        <TableCell>{m.fecha?.toDate ? m.fecha.toDate().toLocaleDateString() : "-"}</TableCell>
                        <TableCell>{m.productoNombre}</TableCell>
                        <TableCell>
                          {m.tipo === "entrada" && <span className="text-green-600 font-semibold flex items-center"><ArrowDown className="w-4 h-4 mr-1" />Entrada</span>}
                          {m.tipo === "salida" && <span className="text-red-600 font-semibold flex items-center"><ArrowUp className="w-4 h-4 mr-1" />Salida</span>}
                          {m.tipo === "ajuste" && <span className="text-blue-600 font-semibold flex items-center"><RefreshCw className="w-4 h-4 mr-1" />Ajuste</span>}
                        </TableCell>
                        <TableCell>{m.cantidad}</TableCell>
                        <TableCell>{m.usuario}</TableCell>
                        <TableCell>{m.observaciones}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
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
            {repoStatus && (
              <div className={`mb-2 p-2 rounded flex items-center gap-2 text-sm ${repoStatus === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
                {repoStatus === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                {repoMsg}
              </div>
            )}
            <label className="font-semibold">Producto</label>
            <select className="border rounded px-2 py-2" value={repoProductoId} onChange={e => setRepoProductoId(e.target.value)}>
              <option value="">Seleccionar producto</option>
              {productos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
            <label className="font-semibold">Cantidad</label>
            <Input type="number" min={1} className="w-full" value={repoCantidad} onChange={e => setRepoCantidad(e.target.value)} />
            <label className="font-semibold">Motivo/Observaciones</label>
            <Input type="text" className="w-full" value={repoObs} onChange={e => setRepoObs(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenRepo(false)}>Cancelar</Button>
            <Button variant="default" onClick={handleRepoGuardar} disabled={loadingProd || repoLoading}>Guardar</Button>
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
            {movStatus && (
              <div className={`mb-2 p-2 rounded flex items-center gap-2 text-sm ${movStatus === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
                {movStatus === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                {movMsg}
              </div>
            )}
            <label className="font-semibold">Producto</label>
            <select className="border rounded px-2 py-2" value={movProductoId} onChange={e => setMovProductoId(e.target.value)}>
              <option value="">Seleccionar producto</option>
              {productos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
            <label className="font-semibold">Tipo de movimiento</label>
            <select className="border rounded px-2 py-2" value={movTipo} onChange={e => setMovTipo(e.target.value)}>
              <option value="entrada">Entrada</option>
              <option value="salida">Salida</option>
              <option value="ajuste">Ajuste</option>
            </select>
            <label className="font-semibold">Cantidad</label>
            <Input type="number" min={1} className="w-full" value={movCantidad} onChange={e => setMovCantidad(e.target.value)} />
            <label className="font-semibold">Motivo/Observaciones</label>
            <Input type="text" className="w-full" value={movObs} onChange={e => setMovObs(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenMov(false)}>Cancelar</Button>
            <Button variant="default" onClick={handleMovGuardar} disabled={loadingProd || movLoading}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default StockComprasPage; 