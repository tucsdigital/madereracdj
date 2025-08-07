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
  const [openMov, setOpenMov] = useState(false);
  const [filtro, setFiltro] = useState("");
  const [filtroMov, setFiltroMov] = useState("");
  const [productos, setProductos] = useState([]);
  const [movimientos, setMovimientos] = useState([]);
  const [loadingProd, setLoadingProd] = useState(true);
  const [loadingMov, setLoadingMov] = useState(true);
  const [error, setError] = useState(null);
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
  const [buscadorMov, setBuscadorMov] = useState("");

  // Estado para modal de detalle de producto
  const [detalleProducto, setDetalleProducto] = useState(null);
  const [detalleMovimientos, setDetalleMovimientos] = useState([]);
  const [detalleOpen, setDetalleOpen] = useState(false);

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
    const prod = productos.find(p => p.id === movProductoId);
    // setMovCosto(prod ? prod.costo : ""); // Eliminado
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
  const productosFiltrados = productos.filter(p => {
    // Función para normalizar texto (eliminar espacios y convertir a minúsculas)
    const normalizarTexto = (texto) => {
      return texto.toLowerCase().replace(/\s+/g, '');
    };

    // Normalizar el término de búsqueda
    const filtroNormalizado = normalizarTexto(filtro || "");
    
    // Normalizar el nombre del producto
    const nombreNormalizado = normalizarTexto(p.nombre || "");

    return nombreNormalizado.includes(filtroNormalizado);
  });

  // Movimientos con join de nombre de producto
  const movimientosFiltrados = movimientos
    .map(m => ({
      ...m,
      productoNombre: productos.find(p => p.id === m.productoId)?.nombre || "(eliminado)"
    }))
    .filter(m => {
      // Función para normalizar texto (eliminar espacios y convertir a minúsculas)
      const normalizarTexto = (texto) => {
        return texto.toLowerCase().replace(/\s+/g, '');
      };

      // Normalizar el término de búsqueda
      const filtroNormalizado = normalizarTexto(filtroMov || "");
      
      // Normalizar el nombre del producto
      const nombreNormalizado = normalizarTexto(m.productoNombre || "");
      
      // Normalizar el usuario
      const usuarioNormalizado = normalizarTexto(m.usuario || "");

      return nombreNormalizado.includes(filtroNormalizado) ||
             usuarioNormalizado.includes(filtroNormalizado);
    });

  // Filtrar productos en buscador dinámico
  const productosMovFiltrados = productos.filter(p => {
    // Función para normalizar texto (eliminar espacios y convertir a minúsculas)
    const normalizarTexto = (texto) => {
      return texto.toLowerCase().replace(/\s+/g, '');
    };

    // Normalizar el término de búsqueda
    const buscadorNormalizado = normalizarTexto(buscadorMov || "");
    
    // Normalizar el nombre del producto
    const nombreNormalizado = normalizarTexto(p.nombre || "");
    
    // Normalizar el ID del producto
    const idNormalizado = normalizarTexto(p.id || "");

    return nombreNormalizado.includes(buscadorNormalizado) ||
           idNormalizado.includes(buscadorNormalizado);
  });

  // Handlers para formularios
  const handleMovGuardar = async () => {
    setMovStatus(null); 
    setMovMsg("");
    
    // Validaciones inteligentes
    if (!movProductoId) {
      setMovStatus("error"); 
      setMovMsg("Debe seleccionar un producto."); 
      return;
    }
    
    if (movCantidad <= 0 && movTipo !== "ajuste") {
      setMovStatus("error"); 
      setMovMsg("La cantidad debe ser mayor a 0."); 
      return;
    }

    // Validación especial para salidas
    if (movTipo === "salida") {
      const producto = productos.find(p => p.id === movProductoId);
      if (producto && producto.stock < movCantidad) {
        setMovStatus("error"); 
        setMovMsg(`Stock insuficiente. Stock actual: ${producto.stock}, intenta vender: ${movCantidad}`);
        return;
      }
    }

    // Validación para ajustes
    if (movTipo === "ajuste") {
      const producto = productos.find(p => p.id === movProductoId);
      const nuevoStock = calcularStockResultante(producto.stock, movTipo, movCantidad);
      if (nuevoStock < 0) {
        setMovStatus("error"); 
        setMovMsg(`Ajuste inválido. El stock no puede ser negativo. Stock actual: ${producto.stock}`);
        return;
      }
    }

    setMovLoading(true);
    try {
      // Registrar movimiento y stock
      await registrarMovimiento({
        productoId: movProductoId,
        tipo: movTipo,
        cantidad: Number(movCantidad),
        usuario: "Admin",
        observaciones: movObs || `Movimiento ${movTipo} registrado manualmente`
      });
      
      setMovStatus("success"); 
      setMovMsg(`Movimiento de ${movTipo} registrado exitosamente. Stock actualizado.`);
      
      setTimeout(() => { 
        setOpenMov(false); 
        setMovProductoId(""); 
        setMovTipo("entrada"); 
        setMovCantidad(1); 
        setMovObs(""); 
        setMovStatus(null); 
        setMovLoading(false); 
      }, 1500);
    } catch (e) {
      setMovStatus("error"); 
      setMovMsg("Error: " + e.message); 
      setMovLoading(false);
    }
  };

  // Función para calcular stock resultante
  const calcularStockResultante = (stockActual, tipo, cantidad) => {
    if (tipo === "entrada") {
      return stockActual + cantidad;
    } else if (tipo === "salida") {
      return stockActual - cantidad;
    } else if (tipo === "ajuste") {
      return stockActual + cantidad; // cantidad puede ser positiva o negativa
    }
    return stockActual;
  };

  // Función para prellenar datos inteligentemente
  const handleSeleccionarProducto = (productoId) => {
    setMovProductoId(productoId);
    const producto = productos.find(p => p.id === productoId);
    
    // Prellenar observaciones según el tipo de producto
    if (producto) {
      let observacionSugerida = "";
      if (producto.stock === 0) {
        observacionSugerida = "Reposición de stock agotado";
      } else if (producto.stock <= (producto.min || 0)) {
        observacionSugerida = "Reposición de stock bajo";
      } else {
        observacionSugerida = "Movimiento de stock";
      }
      setMovObs(observacionSugerida);
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
                            <Button size="sm" variant="ghost" onClick={() => { setOpenMov(true); handleSeleccionarProducto(p.id); }}><RefreshCw className="w-4 h-4 mr-1" />Movimientos</Button>
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
                  {/* <Button variant="default" onClick={() => setOpenMov(true)}><Plus className="w-4 h-4 mr-1" />Registrar Movimiento</Button> */}
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
        {/* Modal de Movimiento */}
        <Dialog open={openMov} onOpenChange={setOpenMov}>
          <DialogContent className="w-[95vw] max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Registrar Movimiento de Stock</DialogTitle>
              <DialogDescription>Gestiona el inventario del producto seleccionado.</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-4 py-2">
              {movStatus && (
                <div className={`mb-2 p-3 rounded-lg flex items-center gap-2 text-sm ${movStatus === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                  {movStatus === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                  {movMsg}
                </div>
              )}
              
              {/* Información del producto seleccionado */}
              {movProductoId && (
                <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-semibold text-blue-900 dark:text-blue-100">Producto Seleccionado</h4>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      productos.find(p => p.id === movProductoId)?.stock === 0 
                        ? 'bg-red-100 text-red-800' 
                        : productos.find(p => p.id === movProductoId)?.stock <= (productos.find(p => p.id === movProductoId)?.min || 0)
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-green-100 text-green-800'
                    }`}>
                      {productos.find(p => p.id === movProductoId)?.stock === 0 
                        ? 'Sin stock' 
                        : productos.find(p => p.id === movProductoId)?.stock <= (productos.find(p => p.id === movProductoId)?.min || 0)
                        ? 'Stock bajo'
                        : 'Stock OK'
                      }
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div><span className="font-medium">Nombre:</span> {productos.find(p => p.id === movProductoId)?.nombre}</div>
                    <div><span className="font-medium">Categoría:</span> {productos.find(p => p.id === movProductoId)?.categoria}</div>
                    <div><span className="font-medium">Stock actual:</span> <span className="font-bold">{productos.find(p => p.id === movProductoId)?.stock || 0}</span></div>
                    <div><span className="font-medium">Stock mínimo:</span> {productos.find(p => p.id === movProductoId)?.min || 0}</div>
                  </div>
                </div>
              )}

              {/* Tipo de movimiento */}
              <div>
                <label className="font-semibold text-sm mb-2 block">Tipo de movimiento</label>
                <select 
                  className="border rounded-lg px-3 py-2 w-full focus:ring-2 focus:ring-blue-500 focus:border-blue-500" 
                  value={movTipo} 
                  onChange={e => setMovTipo(e.target.value)}
                >
                  <option value="entrada">📥 Entrada (Aumentar stock)</option>
                  <option value="salida">📤 Salida (Disminuir stock)</option>
                  <option value="ajuste">⚖️ Ajuste (Corregir stock)</option>
              </select>
              </div>

              {/* Cantidad con validación visual */}
              <div>
                <label className="font-semibold text-sm mb-2 block">
                  Cantidad
                  {movTipo === "salida" && movProductoId && (
                    <span className="text-xs text-gray-500 ml-2">
                      (Máx: {productos.find(p => p.id === movProductoId)?.stock || 0})
                    </span>
                  )}
                </label>
                <Input 
                  type="number" 
                  min={movTipo === "ajuste" ? undefined : 1} 
                  max={movTipo === "salida" ? productos.find(p => p.id === movProductoId)?.stock || 0 : undefined}
                  className={`w-full ${movTipo === "salida" && movCantidad > (productos.find(p => p.id === movProductoId)?.stock || 0) ? 'border-red-500 focus:border-red-500' : ''}`}
                  value={movCantidad} 
                  onChange={e => setMovCantidad(Number(e.target.value))} 
                />
                {movTipo === "salida" && movCantidad > (productos.find(p => p.id === movProductoId)?.stock || 0) && (
                  <p className="text-red-600 text-xs mt-1">⚠️ Cantidad excede el stock disponible</p>
                )}
              </div>

              {/* Observaciones */}
              <div>
                <label className="font-semibold text-sm mb-2 block">Observaciones</label>
                <Input 
                  type="text" 
                  className="w-full" 
                  value={movObs} 
                  onChange={e => setMovObs(e.target.value)}
                  placeholder="Motivo del movimiento..."
                />
              </div>

              {/* Resumen del movimiento */}
              {movProductoId && (movCantidad > 0 || movTipo === "ajuste") && (
                <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                  <h5 className="font-medium text-sm mb-2">Resumen del movimiento:</h5>
                  <div className="text-sm">
                    <p><span className="font-medium">Stock actual:</span> {productos.find(p => p.id === movProductoId)?.stock || 0}</p>
                    <p><span className="font-medium">Movimiento:</span> {movTipo === "entrada" ? "+" : movTipo === "salida" ? "-" : "±"} {movCantidad}</p>
                    <p><span className="font-medium">Stock resultante:</span> 
                      <span className={`font-bold ml-1 ${
                        movTipo === "entrada" 
                          ? "text-green-600" 
                          : movTipo === "salida" 
                          ? "text-red-600" 
                          : "text-blue-600"
                      }`}>
                        {calcularStockResultante(productos.find(p => p.id === movProductoId)?.stock || 0, movTipo, movCantidad)}
                      </span>
                    </p>
                  </div>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpenMov(false)}>Cancelar</Button>
              <Button 
                variant="default" 
                onClick={handleMovGuardar} 
                disabled={loadingProd || movLoading || !movProductoId || (movCantidad <= 0 && movTipo !== "ajuste") || (movTipo === "salida" && movCantidad > (productos.find(p => p.id === movProductoId)?.stock || 0))}
              >
                {movLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Registrar Movimiento
              </Button>
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