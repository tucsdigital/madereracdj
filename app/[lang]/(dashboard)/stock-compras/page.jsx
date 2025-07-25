"use client";
import React, { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Plus, ArrowDown, ArrowUp, RefreshCw, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { db } from "@/lib/firebase";
import { collection, addDoc, doc, updateDoc, increment, serverTimestamp, onSnapshot, query, orderBy, getDoc } from "firebase/firestore";
import { Tooltip, TooltipProvider } from "@/components/ui/tooltip";

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

  // Estado para proveedores y buscador dinámico
  const [proveedores, setProveedores] = useState([]);
  const [buscadorRepo, setBuscadorRepo] = useState("");
  const [buscadorMov, setBuscadorMov] = useState("");
  const [repoCosto, setRepoCosto] = useState("");
  const [repoProveedor, setRepoProveedor] = useState("");
  const [movCosto, setMovCosto] = useState("");
  const [movProveedor, setMovProveedor] = useState("");

  // Estado para modal de detalle de producto
  const [detalleProducto, setDetalleProducto] = useState(null);
  const [detalleMovimientos, setDetalleMovimientos] = useState([]);
  const [detalleOpen, setDetalleOpen] = useState(false);

  // Proveedores ficticios internos
  const proveedoresFicticios = [
    { id: "1", nombre: "Proveedor A" },
    { id: "2", nombre: "Proveedor B" },
    { id: "3", nombre: "Proveedor C" },
  ];

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

  // Cargar proveedores
  useEffect(() => {
    const q = query(collection(db, "proveedores"));
    const unsub = onSnapshot(q, (snap) => {
      setProveedores(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsub();
  }, []);

  // Al seleccionar producto, prellenar costo
  useEffect(() => {
    const prod = productos.find(p => p.id === repoProductoId);
    setRepoCosto(prod ? prod.costo : "");
  }, [repoProductoId, productos]);
  useEffect(() => {
    const prod = productos.find(p => p.id === movProductoId);
    setMovCosto(prod ? prod.costo : "");
  }, [movProductoId, productos]);

  // Función profesional para registrar movimiento y actualizar stock
  async function registrarMovimiento({ productoId, tipo, cantidad, usuario, observaciones }) {
    try {
      // 1. Obtener el producto para validar existencia
      const productoRef = doc(db, "productos", productoId);
      const productoSnap = await getDoc(productoRef);
      if (!productoSnap.exists()) throw new Error("Producto no encontrado");
      const producto = productoSnap.data();

      // 2. Registrar el movimiento
      await addDoc(collection(db, "movimientos"), {
        productoId,
        tipo,
        cantidad,
        usuario,
        observaciones,
        fecha: serverTimestamp(),
        categoria: producto.categoria,
        nombreProducto: producto.nombre,
      });

      // 3. Actualizar el stock (siempre el campo 'stock')
      let cantidadFinal = cantidad;
      if (tipo === "salida") cantidadFinal = -Math.abs(cantidad);
      if (tipo === "ajuste") cantidadFinal = cantidad; // Puede ser positivo o negativo

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

  // Filtrar productos en buscador dinámico
  const productosRepoFiltrados = productos.filter(p =>
    p.nombre.toLowerCase().includes(buscadorRepo.toLowerCase()) ||
    p.id.toLowerCase().includes(buscadorRepo.toLowerCase())
  );
  const productosMovFiltrados = productos.filter(p =>
    p.nombre.toLowerCase().includes(buscadorMov.toLowerCase()) ||
    p.id.toLowerCase().includes(buscadorMov.toLowerCase())
  );

  // Handlers para formularios
  const handleRepoGuardar = async () => {
    setRepoStatus(null); setRepoMsg("");
    if (!repoProductoId || repoCantidad <= 0 || !repoProveedor) {
      setRepoStatus("error"); setRepoMsg("Completa todos los campos correctamente."); return;
    }
    setRepoLoading(true);
    try {
      // Actualizar costo si cambió
      const prod = productos.find(p => p.id === repoProductoId);
      if (prod && Number(repoCosto) !== Number(prod.costo)) {
        await updateDoc(doc(db, "productos", repoProductoId), { costo: Number(repoCosto) });
      }
      // Registrar movimiento y stock
      await registrarMovimiento({
        productoId: repoProductoId,
        tipo: "entrada",
        cantidad: Number(repoCantidad),
        usuario: "Admin",
        observaciones: repoObs
      });
      // Crear gasto automático
      await addDoc(collection(db, "gastos"), {
        productoId: repoProductoId,
        productoNombre: prod?.nombre || "",
        proveedorId: repoProveedor,
        proveedorNombre: proveedoresFicticios.find(p => p.id === repoProveedor)?.nombre || "",
        cantidad: Number(repoCantidad),
        costoUnitario: Number(repoCosto),
        total: Number(repoCosto) * Number(repoCantidad),
        fecha: serverTimestamp(),
        tipo: "compra_stock"
      });
      setRepoStatus("success"); setRepoMsg("Reposición registrada, stock y gasto actualizados.");
      setTimeout(() => { setOpenRepo(false); setRepoProductoId(""); setRepoCantidad(1); setRepoObs(""); setRepoProveedor(""); setRepoCosto(""); setRepoStatus(null); setRepoLoading(false); }, 1200);
    } catch (e) {
      setRepoStatus("error"); setRepoMsg("Error: " + e.message); setRepoLoading(false);
    }
  };
  const handleMovGuardar = async () => {
    setMovStatus(null); setMovMsg("");
    if (!movProductoId || movCantidad <= 0 || !movProveedor) {
      setMovStatus("error"); setMovMsg("Completa todos los campos correctamente."); return;
    }
    setMovLoading(true);
    try {
      // Actualizar costo si cambió
      const prod = productos.find(p => p.id === movProductoId);
      if (prod && Number(movCosto) !== Number(prod.costo)) {
        await updateDoc(doc(db, "productos", movProductoId), { costo: Number(movCosto) });
      }
      // Registrar movimiento y stock
      await registrarMovimiento({
        productoId: movProductoId,
        tipo: movTipo,
        cantidad: Number(movCantidad),
        usuario: "Admin",
        observaciones: movObs
      });
      // Crear gasto automático solo si es entrada
      if (movTipo === "entrada") {
        await addDoc(collection(db, "gastos"), {
          productoId: movProductoId,
          productoNombre: prod?.nombre || "",
          proveedorId: movProveedor,
          proveedorNombre: proveedoresFicticios.find(p => p.id === movProveedor)?.nombre || "",
          cantidad: Number(movCantidad),
          costoUnitario: Number(movCosto),
          total: Number(movCosto) * Number(movCantidad),
          fecha: serverTimestamp(),
          tipo: "compra_stock"
        });
      }
      setMovStatus("success"); setMovMsg("Movimiento registrado, stock y gasto actualizados.");
      setTimeout(() => { setOpenMov(false); setMovProductoId(""); setMovTipo("entrada"); setMovCantidad(1); setMovObs(""); setMovProveedor(""); setMovCosto(""); setMovStatus(null); setMovLoading(false); }, 1200);
    } catch (e) {
      setMovStatus("error"); setMovMsg("Error: " + e.message); setMovLoading(false);
    }
  };

  // Acción para ver detalle de producto
  const handleVerDetalleProducto = (producto) => {
    setDetalleProducto(producto);
    const movs = movimientos.filter(m => m.productoId === producto.id);
    setDetalleMovimientos(movs);
    setDetalleOpen(true);
  };

  return (
    <TooltipProvider>
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
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold">{p.nombre}</span>
                              {p.stock === 0 && <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded text-xs">Sin stock</span>}
                              {p.stock > 0 && p.stock <= (p.min || 0) && <span className="bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded text-xs">Bajo</span>}
                              {p.stock > (p.min || 0) && <span className="bg-green-100 text-green-800 px-2 py-0.5 rounded text-xs">OK</span>}
                            </div>
                          </TableCell>
                          <TableCell>{p.categoria}</TableCell>
                          <TableCell>
                            <Tooltip content={`Última actualización: ${p.fechaActualizacion?.toDate ? p.fechaActualizacion.toDate().toLocaleString() : "-"}`}>
                              <span>{p.stock}</span>
                            </Tooltip>
                          </TableCell>
                          <TableCell>{p.unidadMedida || p.unidadVenta || p.unidadVentaHerraje || p.unidadVentaQuimico || p.unidadVentaHerramienta}</TableCell>
                          <TableCell>
                            {p.stock === 0 ? <span className="text-red-700 font-semibold">Sin stock</span> : p.stock <= (p.min || 0) ? <span className="text-yellow-700 font-semibold">Bajo</span> : <span className="text-green-600 font-semibold">OK</span>}
                          </TableCell>
                          <TableCell>
                            <Button size="sm" variant="outline" onClick={() => { setOpenRepo(true); setRepoProductoId(p.id); }}><ArrowDown className="w-4 h-4 mr-1" />Reposición</Button>
                            <Button size="sm" variant="ghost" onClick={() => { setOpenMov(true); setMovProductoId(p.id); }}><RefreshCw className="w-4 h-4 mr-1" />Movimientos</Button>
                            <Button size="sm" variant="soft" onClick={() => handleVerDetalleProducto(p)}><Plus className="w-4 h-4 mr-1" />Ver detalle</Button>
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
                          <TableCell>{m.fecha?.toDate ? m.fecha.toDate().toLocaleString() : "-"}</TableCell>
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
              <DialogDescription>Completa los datos para registrar una reposición de stock.</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-3 py-2">
              {repoStatus && (
                <div className={`mb-2 p-2 rounded flex items-center gap-2 text-sm ${repoStatus === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
                  {repoStatus === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                  {repoMsg}
                </div>
              )}
              {/* Nombre del producto */}
              <label className="font-semibold">Producto</label>
              <div className="p-2 bg-gray-50 rounded font-bold text-primary">{productos.find(p => p.id === repoProductoId)?.nombre || ""}</div>
              {/* Costo unitario */}
              <label className="font-semibold">Costo unitario</label>
              <Input type="number" min={0} className="w-full" value={repoCosto} onChange={e => setRepoCosto(e.target.value)} />
              {/* Proveedor */}
              <label className="font-semibold">Proveedor</label>
              <select className="border rounded px-2 py-2" value={repoProveedor} onChange={e => setRepoProveedor(e.target.value)}>
                <option value="">Seleccionar proveedor</option>
                {proveedoresFicticios.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
              {/* Cantidad */}
              <label className="font-semibold">Cantidad</label>
              <Input type="number" min={1} className="w-full" value={repoCantidad} onChange={e => setRepoCantidad(e.target.value)} />
              {/* Motivo/Observaciones */}
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
              <DialogDescription>Completa los datos para registrar un movimiento de stock.</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-3 py-2">
              {movStatus && (
                <div className={`mb-2 p-2 rounded flex items-center gap-2 text-sm ${movStatus === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
                  {movStatus === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                  {movMsg}
                </div>
              )}
              {/* Nombre del producto */}
              <label className="font-semibold">Producto</label>
              <div className="p-2 bg-gray-50 rounded font-bold text-primary">{productos.find(p => p.id === movProductoId)?.nombre || ""}</div>
              {/* Costo unitario */}
              <label className="font-semibold">Costo unitario</label>
              <Input type="number" min={0} className="w-full" value={movCosto} onChange={e => setMovCosto(e.target.value)} />
              {/* Proveedor */}
              <label className="font-semibold">Proveedor</label>
              <select className="border rounded px-2 py-2" value={movProveedor} onChange={e => setMovProveedor(e.target.value)}>
                <option value="">Seleccionar proveedor</option>
                {proveedoresFicticios.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
              {/* Tipo de movimiento */}
              <label className="font-semibold">Tipo de movimiento</label>
              <select className="border rounded px-2 py-2" value={movTipo} onChange={e => setMovTipo(e.target.value)}>
                <option value="entrada">Entrada</option>
                <option value="salida">Salida</option>
                <option value="ajuste">Ajuste</option>
              </select>
              {/* Cantidad */}
              <label className="font-semibold">Cantidad</label>
              <Input type="number" min={1} className="w-full" value={movCantidad} onChange={e => setMovCantidad(e.target.value)} />
              {/* Motivo/Observaciones */}
              <label className="font-semibold">Motivo/Observaciones</label>
              <Input type="text" className="w-full" value={movObs} onChange={e => setMovObs(e.target.value)} />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpenMov(false)}>Cancelar</Button>
              <Button variant="default" onClick={handleMovGuardar} disabled={loadingProd || movLoading}>Guardar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        {/* Modal de detalle de producto */}
        <Dialog open={detalleOpen} onOpenChange={setDetalleOpen}>
          <DialogContent className="w-[95vw] max-w-[600px]">
            <DialogHeader>
              <DialogTitle>Detalle del Producto</DialogTitle>
            </DialogHeader>
            {detalleProducto && (
              <div className="flex flex-col gap-2">
                <div className="font-bold text-lg mb-2">{detalleProducto.nombre}</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-2">
                  <div><b>Categoría:</b> {detalleProducto.categoria}</div>
                  <div><b>Unidad:</b> {detalleProducto.unidadMedida || detalleProducto.unidadVenta || detalleProducto.unidadVentaHerraje || detalleProducto.unidadVentaQuimico || detalleProducto.unidadVentaHerramienta}</div>
                  <div><b>Stock actual:</b> {detalleProducto.stock}</div>
                  <div><b>Mínimo:</b> {detalleProducto.min || "-"}</div>
                  <div><b>Estado:</b> {detalleProducto.stock === 0 ? "Sin stock" : detalleProducto.stock <= (detalleProducto.min || 0) ? "Bajo" : "OK"}</div>
                  <div><b>Última actualización:</b> {detalleProducto.fechaActualizacion?.toDate ? detalleProducto.fechaActualizacion.toDate().toLocaleString() : "-"}</div>
                </div>
                <div className="mt-2">
                  <b>Historial de movimientos:</b>
                  {detalleMovimientos.length === 0 ? (
                    <div className="text-gray-500 text-sm">No hay movimientos registrados.</div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Fecha</TableHead>
                          <TableHead>Tipo</TableHead>
                          <TableHead>Cantidad</TableHead>
                          <TableHead>Usuario</TableHead>
                          <TableHead>Observaciones</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detalleMovimientos.map(m => (
                          <TableRow key={m.id}>
                            <TableCell>{m.fecha?.toDate ? m.fecha.toDate().toLocaleString() : "-"}</TableCell>
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
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}

export default StockComprasPage; 