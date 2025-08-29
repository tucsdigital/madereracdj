"use client";
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { db } from "@/lib/firebase";
import { collection, getDocs, addDoc } from "firebase/firestore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Filter, Search, RefreshCw } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Icon } from "@iconify/react";

// Genera un número incremental tipo OBRA-00001 (solo para presupuestos de obra)
async function getNextObraNumber() {
  const snap = await getDocs(collection(db, "obras"));
  let maxNum = 0;
  snap.docs.forEach((docSnap) => {
    const data = docSnap.data();
    if (data.numeroPedido && data.numeroPedido.startsWith("OBRA-")) {
      const num = parseInt(String(data.numeroPedido).replace("OBRA-", ""), 10);
      if (!Number.isNaN(num) && num > maxNum) maxNum = num;
    }
  });
  return `OBRA-${String(maxNum + 1).padStart(5, "0")}`;
}

// Formateo regional simple
function formatARNumber(value) {
  const num = Number(value || 0);
  if (Number.isNaN(num)) return "0";
  return num.toLocaleString("es-AR", { minimumFractionDigits: 0 });
}

// Cálculo para productos de obras
// - M2: alto × largo × valorVenta × cantidad
// - ML: largo × valorVenta × cantidad
// - Cualquier otro: valorVenta × cantidad
function calcularPrecioProductoObra({
  unidadMedida,
  alto,
  largo,
  valorVenta,
  cantidad,
}) {
  const u = String(unidadMedida || "").toUpperCase();
  const altoNum = Number(alto) || 0;
  const largoNum = Number(largo) || 0;
  const valorNum = Number(valorVenta) || 0;
  const cantNum = Number(cantidad) || 1;

  if (u === "M2") {
    return Math.round(altoNum * largoNum * valorNum * cantNum);
  }
  if (u === "ML") {
    return Math.round(largoNum * valorNum * cantNum);
  }
  return Math.round(valorNum * cantNum);
}

export default function CrearPresupuestoObraPage() {
  const router = useRouter();
  const params = useParams();
  const { lang } = params || {};

  // Clientes
  const [clientes, setClientes] = useState([]);
  const [clienteId, setClienteId] = useState("");
  const clienteSeleccionado = clientes.find((c) => c.id === clienteId);
  const [busquedaCliente, setBusquedaCliente] = useState("");
  const [clientesLoading, setClientesLoading] = useState(false);
  const [dropdownClientesOpen, setDropdownClientesOpen] = useState(false);
  const [openNuevoCliente, setOpenNuevoCliente] = useState(false);
  const [nuevoCliente, setNuevoCliente] = useState({
    nombre: "",
    cuit: "",
    direccion: "",
    telefono: "",
    email: "",
    localidad: "",
    partido: "",
    barrio: "",
    area: "",
    lote: "",
    descripcion: "",
    esClienteViejo: false,
  });
  const [activeTab, setActiveTab] = useState("datos");

  // Catálogo (productos_obras)
  const [productos, setProductos] = useState([]);
  const [productosPorCategoria, setProductosPorCategoria] = useState({});
  const [categorias, setCategorias] = useState([]);
  const [categoriaId, setCategoriaId] = useState("");
  const [busquedaProducto, setBusquedaProducto] = useState("");
  // Búsqueda local con debounce + deferred
  const [busquedaDebounced, setBusquedaDebounced] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setBusquedaDebounced(busquedaProducto), 100);
    return () => clearTimeout(id);
  }, [busquedaProducto]);
  const busquedaDefer = React.useDeferredValue(busquedaDebounced);
  // Paginación
  const [paginaActual, setPaginaActual] = useState(1);
  const [productosPorPagina] = useState(12);
  const [isPending, startTransition] = React.useTransition();

  // Selección
  const [itemsSeleccionados, setItemsSeleccionados] = useState([]);
  const [manualNombre, setManualNombre] = useState("");
  const [manualPrecio, setManualPrecio] = useState("");
  const [descripcionGeneral, setDescripcionGeneral] = useState("");

  // Carga inicial
  useEffect(() => {
    async function fetchData() {
      // Clientes
      setClientesLoading(true);
      const snapClientes = await getDocs(collection(db, "clientes"));
      setClientes(snapClientes.docs.map((d) => ({ id: d.id, ...d.data() })));
      setClientesLoading(false);

      // Productos de obras
      const snapProd = await getDocs(collection(db, "productos_obras"));
      const prods = snapProd.docs.map((d) => ({ id: d.id, ...d.data() }));
      setProductos(prods);
      const agrupados = {};
      prods.forEach((p) => {
        const cat = p.categoria || "Sin categoría";
        (agrupados[cat] = agrupados[cat] || []).push(p);
      });
      setProductosPorCategoria(agrupados);
      setCategorias(Object.keys(agrupados));
    }
    fetchData();
  }, []);

  // Normalizador de texto
  const normalizarTexto = useCallback((texto) => {
    if (!texto) return "";
    return texto.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "");
  }, []);

  // Filtro catálogo con deferred value
  const productosFiltrados = useMemo(() => {
    let fuente;
    const hayBusqueda = !!(busquedaDefer && busquedaDefer.trim() !== "");
    if (hayBusqueda) {
      if (categoriaId) {
        const localCat = productosPorCategoria[categoriaId] || [];
        fuente = localCat;
      } else {
        fuente = productos;
      }
    } else if (categoriaId) {
      fuente = productosPorCategoria[categoriaId];
    }
    if (!fuente) fuente = productos;

    const busq = normalizarTexto(busquedaDefer);
    return fuente
      .filter((prod) => {
        const nombre = normalizarTexto(prod.nombre);
        const unidad = normalizarTexto(prod.unidadMedida || "");
        if (busq === "") return true;
        if (busq.endsWith(".")) {
          const sinPunto = busq.slice(0, -1);
          return nombre.startsWith(sinPunto) || unidad.startsWith(sinPunto);
        }
        return nombre.includes(busq) || unidad.includes(busq);
      });
  }, [productos, productosPorCategoria, categoriaId, busquedaDefer, normalizarTexto]);

  // Paginación derivada
  const totalProductos = productosFiltrados.length;
  const totalPaginas = Math.ceil(totalProductos / productosPorPagina) || 1;
  const productosPaginados = useMemo(() => {
    const inicio = (paginaActual - 1) * productosPorPagina;
    const fin = inicio + productosPorPagina;
    return productosFiltrados.slice(inicio, fin);
  }, [productosFiltrados, paginaActual, productosPorPagina]);

  // Reset al cambiar filtros
  useEffect(() => {
    setPaginaActual(1);
  }, [categoriaId, busquedaDefer]);

  // Acciones selección
  const agregarProducto = useCallback((prod) => {
    const ya = itemsSeleccionados.some((x) => x.id === prod.id);
    if (ya) return;
    const unidadMedida = prod.unidadMedida || "UN";
    const nuevo = {
      id: prod.id,
      nombre: prod.nombre,
      categoria: prod.categoria || "",
      subCategoria: prod.subCategoria || prod.subcategoria || "",
      unidadMedida,
      valorVenta: Number(prod.valorVenta) || 0,
      alto: 1,
      largo: 1,
      cantidad: 1,
      descuento: 0,
      descripcion: "", // Nuevo campo para descripción individual
    };
    const precio = calcularPrecioProductoObra({
      unidadMedida,
      alto: nuevo.alto,
      largo: nuevo.largo,
      valorVenta: nuevo.valorVenta,
      cantidad: nuevo.cantidad,
    });
    nuevo.precio = precio;
    setItemsSeleccionados((prev) => [...prev, nuevo]);
  }, [itemsSeleccionados]);

  const agregarProductoManual = useCallback(() => {
    const nuevo = {
      id: `manual-${Date.now()}`,
      nombre: "Nuevo ítem",
      categoria: "Manual",
      subCategoria: "",
      unidadMedida: "UN",
      valorVenta: 0,
      alto: 1,
      largo: 1,
      cantidad: 1,
      descuento: 0,
      descripcion: "", // Nuevo campo para descripción individual
      _esManual: true,
    };
    nuevo.precio = calcularPrecioProductoObra({ unidadMedida: nuevo.unidadMedida, alto: nuevo.alto, largo: nuevo.largo, valorVenta: nuevo.valorVenta, cantidad: nuevo.cantidad });
    setItemsSeleccionados((prev) => [nuevo, ...prev]);
  }, []);

  const quitarProducto = useCallback((id) => {
    setItemsSeleccionados((prev) => prev.filter((p) => p.id !== id));
  }, []);

  // Handlers de edición por fila
  const actualizarCampo = (id, campo, valor) => {
    setItemsSeleccionados((prev) => prev.map((p) => {
      if (p.id !== id) return p;
      if (campo === "unidadMedida") {
        const actualizado = { ...p, unidadMedida: valor };
        const alto = Number(actualizado.alto) || 0;
        const largo = Number(actualizado.largo) || 0;
        const cantidad = Number(actualizado.cantidad) || 1;
        const valorVenta = Number(actualizado.valorVenta) || 0;
        const precioBase = calcularPrecioProductoObra({ unidadMedida: actualizado.unidadMedida, alto, largo, valorVenta, cantidad });
        actualizado.precio = Math.round(precioBase);
        return actualizado;
      }
      const actualizado = { ...p, [campo]: campo === "descuento" ? Number(valor) || 0 : valor === "" ? "" : Number(valor) };
      // Normalizar vacíos a 0 para cálculos
      const alto = Number(actualizado.alto) || 0;
      const largo = Number(actualizado.largo) || 0;
      const cantidad = Number(actualizado.cantidad) || 1;
      const valorVenta = Number(actualizado.valorVenta) || 0;
      const precioBase = calcularPrecioProductoObra({
        unidadMedida: actualizado.unidadMedida,
        alto,
        largo,
        valorVenta,
        cantidad,
      });
      actualizado.precio = Math.round(precioBase);
      return actualizado;
    }));
  };

  const actualizarNombreManual = (id, nombre) => {
    setItemsSeleccionados((prev) => prev.map((p) => (p.id === id ? { ...p, nombre } : p)));
  };

  // Totales
  const subtotal = useMemo(() => itemsSeleccionados.reduce((acc, p) => acc + Number(p.precio || 0), 0), [itemsSeleccionados]);
  const descuentoTotal = useMemo(() => itemsSeleccionados.reduce((acc, p) => acc + Number(p.precio || 0) * (Number(p.descuento || 0) / 100), 0), [itemsSeleccionados]);
  const total = useMemo(() => subtotal - descuentoTotal, [subtotal, descuentoTotal]);

  // Guardar
  const [guardando, setGuardando] = useState(false);
  const guardarPresupuesto = async () => {
    if (!clienteId) return;
    if (itemsSeleccionados.length === 0) return;
    setGuardando(true);
    try {
      const numeroPedido = await getNextObraNumber();
      await addDoc(collection(db, "obras"), {
        tipo: "presupuesto",
        numeroPedido,
        fecha: new Date().toISOString().split("T")[0],
        clienteId,
        cliente: clienteSeleccionado || null,
        productos: itemsSeleccionados.map((p) => {
          const u = String(p.unidadMedida || "UN").toUpperCase();
          const altoNum = Number(p.alto) || 0;
          const largoNum = Number(p.largo) || 0;
          const cantNum = Number(p.cantidad) || 1;
          const m2 = u === "M2" ? altoNum * largoNum * cantNum : 0;
          const ml = u === "ML" ? largoNum * cantNum : 0;
          return {
            id: p.id,
            nombre: p.nombre,
            categoria: p.categoria,
            subCategoria: p.subCategoria,
            unidadMedida: p.unidadMedida,
            valorVenta: p.valorVenta,
            alto: altoNum,
            largo: largoNum,
            cantidad: cantNum,
            descuento: Number(p.descuento) || 0,
            precio: Number(p.precio) || 0,
            descripcion: p.descripcion || "", // Incluir descripción individual
            m2,
            ml,
          };
        }),
        subtotal,
        descuentoTotal,
        total,
        fechaCreacion: new Date().toISOString(),
        estado: "Activo",
        descripcionGeneral: descripcionGeneral || "",
      });
      router.push(`/${lang}/obras`);
    } finally {
      setGuardando(false);
    }
  };

  const handleGuardarNuevoCliente = async () => {
    if (!nuevoCliente.nombre || !nuevoCliente.direccion || !nuevoCliente.telefono) {
      alert("Nombre, dirección y teléfono son obligatorios");
      return;
    }
    const clienteObj = {
      nombre: nuevoCliente.nombre,
      cuit: nuevoCliente.cuit || "",
      direccion: nuevoCliente.direccion,
      telefono: nuevoCliente.telefono,
      email: nuevoCliente.email || "",
      localidad: nuevoCliente.localidad || "",
      partido: nuevoCliente.partido || "",
      barrio: nuevoCliente.barrio || "",
      area: nuevoCliente.area || "",
      lote: nuevoCliente.lote || "",
      descripcion: nuevoCliente.descripcion || "",
      esClienteViejo: nuevoCliente.esClienteViejo || false,
    };
    const docRef = await addDoc(collection(db, "clientes"), clienteObj);
    const agregado = { ...clienteObj, id: docRef.id };
    setClientes((prev) => [...prev, agregado]);
    setClienteId(docRef.id);
    setNuevoCliente({ nombre: "", cuit: "", direccion: "", telefono: "", email: "", localidad: "", partido: "", barrio: "", area: "", lote: "", descripcion: "", esClienteViejo: false });
    setOpenNuevoCliente(false);
    setDropdownClientesOpen(false);
  };

  return (
    <div className="flex flex-col gap-6 py-8">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Nuevo Presupuesto (Obras)</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => window.location.reload()}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Actualizar
          </Button>
        </div>
      </div>

      {/* Cliente */}
      <Card>
        <CardHeader>
          <CardTitle>Cliente</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="relative w-full">
            <div
              className="w-full flex items-center cursor-pointer bg-card border border-default-300 rounded-lg h-10 px-3 text-sm justify-between transition duration-300"
              onClick={() => setDropdownClientesOpen(true)}
              tabIndex={0}
              role="button"
              aria-haspopup="listbox"
              aria-expanded={dropdownClientesOpen}
            >
              <span className="flex-1 truncate">
                {clienteSeleccionado ? `${clienteSeleccionado.nombre} - ${clienteSeleccionado.cuit || ""}` : "Seleccionar cliente..."}
              </span>
              <div className="flex items-center gap-2">
                <Button type="button" variant="ghost" size="sm" className="text-primary font-semibold" onClick={(e) => { e.stopPropagation(); setOpenNuevoCliente(true); }} disabled={clientesLoading}>Nuevo</Button>
                <svg className="w-5 h-5 text-default-600" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.21 8.27a.75.75 0 01.02-1.06z" clipRule="evenodd"/></svg>
              </div>
            </div>
            {dropdownClientesOpen && (
              <div className="absolute z-50 min-w-[8rem] overflow-hidden rounded-md border border-default-300 bg-card text-default-900 shadow-md mt-1 max-h-72 w-full">
                <div className="p-2">
                  <Input
                    type="text"
                    placeholder="Buscar cliente..."
                    value={busquedaCliente}
                    onChange={(e) => setBusquedaCliente(e.target.value)}
                    className="w-full mb-2"
                    autoFocus
                    disabled={clientesLoading}
                  />
                  <div className="divide-y divide-gray-100 max-h-52 overflow-auto">
                    {clientes
                      .filter((c) => {
                        const q = busquedaCliente.trim().toLowerCase();
                        if (!q) return true;
                        return (
                          String(c.nombre || "").toLowerCase().includes(q) ||
                          String(c.cuit || "").toLowerCase().includes(q)
                        );
                      })
                      .map((c) => (
                        <div
                          key={c.id}
                          className="relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 px-2 text-sm hover:bg-accent hover:text-accent-foreground"
                          onClick={() => {
                            setClienteId(c.id);
                            setDropdownClientesOpen(false);
                          }}
                          role="option"
                          tabIndex={0}
                        >
                          {c.nombre} - {c.cuit || ""}
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Catálogo */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="w-5 h-5" /> Catálogo de productos (obras)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Agregar ítem manual: botón que agrega fila editable en la tabla */}
          <div className="flex justify-end">
            <Button variant="outline" onClick={agregarProductoManual}>Agregar ítem manual</Button>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <div className="flex bg-white rounded-lg p-1 shadow-sm border border-gray-200">
                {categorias.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    className={`rounded-full px-4 py-1 text-sm mr-2 ${categoriaId === cat ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
                    onClick={() => setCategoriaId((prev) => (prev === cat ? "" : cat))}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1 relative flex items-center gap-2">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="text"
                placeholder="Buscar productos..."
                value={busquedaProducto}
                onChange={(e) => setBusquedaProducto(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
                className="w-full pl-10 pr-10 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 bg-card"
              />
            </div>
          </div>
          {/* Lista de productos con paginación, estilo ventas */}
          <div className="max-h-150 overflow-y-auto">
            {categorias.length === 0 ? (
              <div className="p-8 text-center text-gray-500">No hay categorías disponibles</div>
            ) : !categoriaId && (!busquedaDefer || busquedaDefer.trim() === "") ? (
              <div className="p-8 text-center">
                <h3 className="text-lg font-medium mb-2">Selecciona una categoría</h3>
                <p className="text-gray-500">Elige una categoría para ver los productos disponibles</p>
              </div>
            ) : productosFiltrados.length === 0 ? (
              <div className="p-8 text-center">
                <h3 className="text-lg font-medium mb-2">No se encontraron productos</h3>
                <p className="text-gray-500">Intenta cambiar los filtros o la búsqueda</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 p-4 relative">
                  {isPending && (
                    <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-10 flex items-center justify-center rounded-lg">
                      <div className="flex items-center gap-3 bg-white px-4 py-3 rounded-lg shadow-lg border border-gray-200">
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                        <span className="text-sm font-medium text-gray-700">Cargando productos...</span>
                      </div>
                    </div>
                  )}

                  {productosPaginados.map((prod) => {
                    const yaAgregado = itemsSeleccionados.some((p) => p.id === prod.id);
                    const precio = Number(prod.valorVenta) || 0;
                    return (
                      <div key={prod.id} className={`group relative rounded-lg border-2 transition-all duration-200 hover:shadow-md h-full flex flex-col ${yaAgregado ? "border-green-200 bg-green-50" : "border-gray-200 hover:border-blue-300"}`}>
                        <div className="p-4 flex flex-col h-full">
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-3 mb-2">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold bg-blue-100 text-blue-700`}>
                                  🏗️
                                </div>
                                <div className="flex-1 min-w-0">
                                  <h4 className="text-sm font-semibold truncate">{prod.nombre}</h4>
                                  {prod.subCategoria && (
                                    <div className="text-xs text-blue-600 mt-1">{prod.subCategoria}</div>
                                  )}
                                </div>
                                {yaAgregado && (
                                  <div className="flex items-center gap-1 text-green-600">
                                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg>
                                    <span className="text-xs font-medium">Agregado</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex-1 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-gray-500">Precio:</span>
                              <span className="text-sm font-semibold">$ {formatARNumber(precio)}</span>
                            </div>
                            {prod.unidadMedida && (
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-gray-500">Unidad:</span>
                                <span className="text-xs text-gray-700">{prod.unidadMedida}</span>
                              </div>
                            )}
                          </div>

                          <div className="mt-4">
                            <button
                              onClick={() => {
                                if (yaAgregado) return;
                                agregarProducto(prod);
                              }}
                              disabled={yaAgregado}
                              className={`w-full py-2 px-3 rounded-md text-sm font-medium transition-colors ${yaAgregado ? "bg-green-100 text-green-700 cursor-not-allowed" : "bg-blue-600 text-white hover:bg-blue-700"}`}
                            >
                              {yaAgregado ? "Ya agregado" : "Agregar"}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Paginación */}
                {totalPaginas > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-t border-gray-200">
                    <div className="text-sm text-gray-700 flex items-center gap-2">
                      {isPending && (<div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-600"></div>)}
                      <span>Mostrando {paginaActual}-{Math.min(paginaActual + productosPorPagina - 1, totalProductos)} de {totalProductos} productos</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => startTransition(() => setPaginaActual(1))} disabled={paginaActual === 1 || isPending} className="p-2 rounded-md text-gray-500 hover:text-gray-700 disabled:opacity-50" title="Primera página">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 19l-7-7 7-7m8 14l-7-7 7-7"/></svg>
                      </button>
                      <button onClick={() => startTransition(() => setPaginaActual(Math.max(1, paginaActual - 1)))} disabled={paginaActual === 1 || isPending} className="p-2 rounded-md text-gray-500 hover:text-gray-700 disabled:opacity-50" title="Página anterior">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7"/></svg>
                      </button>
                      <div className="flex items-center gap-1">
                        {Array.from({ length: Math.min(5, totalPaginas) }, (_, i) => {
                          let pageNum;
                          if (totalPaginas <= 5) pageNum = i + 1;
                          else if (paginaActual <= 3) pageNum = i + 1;
                          else if (paginaActual >= totalPaginas - 2) pageNum = totalPaginas - 4 + i;
                          else pageNum = paginaActual - 2 + i;
                          return (
                            <button key={pageNum} onClick={() => startTransition(() => setPaginaActual(pageNum))} disabled={isPending} className={`px-3 py-1 rounded-md text-sm font-medium ${paginaActual === pageNum ? "bg-blue-600 text-white" : "text-gray-600 hover:text-gray-900"}`}>
                              {pageNum}
                            </button>
                          );
                        })}
                      </div>
                      <button onClick={() => startTransition(() => setPaginaActual(Math.min(totalPaginas, paginaActual + 1)))} disabled={paginaActual === totalPaginas || isPending} className="p-2 rounded-md text-gray-500 hover:text-gray-700 disabled:opacity-50" title="Página siguiente">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"/></svg>
                      </button>
                      <button onClick={() => startTransition(() => setPaginaActual(totalPaginas))} disabled={paginaActual === totalPaginas || isPending} className="p-2 rounded-md text-gray-500 hover:text-gray-700 disabled:opacity-50" title="Última página">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 5l7 7-7 7M5 5l7 7-7 7"/></svg>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Seleccionados */}
      {itemsSeleccionados.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Productos seleccionados</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="p-2 text-left">Producto</th>
                  <th className="p-2 text-center">Cant.</th>
                  <th className="p-2 text-center">Unidad</th>
                  <th className="p-2 text-center">Alto</th>
                  <th className="p-2 text-center">Largo</th>
                  <th className="p-2 text-right">Valor</th>
                  <th className="p-2 text-center">Desc. %</th>
                  <th className="p-2 text-right">Subtotal</th>
                  <th className="p-2 text-center">Acción</th>
                </tr>
              </thead>
              <tbody>
                {itemsSeleccionados.map((p) => {
                  const sub = Number(p.precio || 0) * (1 - Number(p.descuento || 0) / 100);
                  const u = String(p.unidadMedida || "UN").toUpperCase();
                  const requiereAlto = u === "M2"; // Para m2 pedimos alto y largo. Para ml solo largo.
                  const requiereLargo = u === "M2" || u === "ML";
                  return (
                    <React.Fragment key={p.id}>
                      <tr className="border-b">
                        <td className="p-2">
                          <div className="font-medium">
                            {p._esManual ? (
                              <Input value={p.nombre} onChange={(e) => actualizarNombreManual(p.id, e.target.value)} className="h-8" />
                            ) : (
                              p.nombre
                            )}
                          </div>
                          <div className="text-xs text-gray-500">{p.categoria}</div>
                        </td>
                        <td className="p-2 text-center">
                          <Input type="number" min={1} value={p.cantidad} onChange={(e) => actualizarCampo(p.id, "cantidad", e.target.value)} className="w-20 mx-auto" />
                        </td>
                        <td className="p-2 text-center">
                          {p._esManual ? (
                            <Select value={u} onValueChange={(v) => actualizarCampo(p.id, "unidadMedida", v)}>
                              <SelectTrigger className="w-24 mx-auto h-8">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="UN">UN</SelectItem>
                                <SelectItem value="M2">M2</SelectItem>
                                <SelectItem value="ML">ML</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (
                            <Badge variant="outline">{u}</Badge>
                          )}
                        </td>
                        <td className="p-2 text-center">
                          {requiereAlto ? (
                            <Input type="number" min={0} step="0.01" value={p.alto} onChange={(e) => actualizarCampo(p.id, "alto", e.target.value)} className="w-24 mx-auto" />
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="p-2 text-center">
                          {requiereLargo ? (
                            <Input type="number" min={0} step="0.01" value={p.largo} onChange={(e) => actualizarCampo(p.id, "largo", e.target.value)} className="w-24 mx-auto" />
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="p-2 text-right">
                          {p._esManual ? (
                            <div className="relative w-28 ml-auto">
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-sm text-default-500">$</span>
                              <Input type="number" min={0} step="0.01" value={p.valorVenta} onChange={(e) => actualizarCampo(p.id, "valorVenta", e.target.value)} className="pl-5 pr-2 h-8 text-right" />
                            </div>
                          ) : (
                            `$ ${formatARNumber(p.valorVenta)}`
                          )}
                        </td>
                        <td className="p-2 text-center">
                          <Input type="number" min={0} max={100} value={p.descuento} onChange={(e) => actualizarCampo(p.id, "descuento", e.target.value)} className="w-20 mx-auto" />
                        </td>
                        <td className="p-2 text-right font-semibold">$ {formatARNumber(sub)}</td>
                        <td className="p-2 text-center">
                          <Button variant="outline" onClick={() => quitarProducto(p.id)} size="sm">Quitar</Button>
                        </td>
                      </tr>
                      {/* Fila adicional para descripción del producto */}
                      <tr className="border-b bg-gray-50">
                        <td colSpan={9} className="p-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-gray-600 w-20">Descripción:</span>
                            <Textarea
                              placeholder="Escribe una descripción específica para este producto..."
                              value={p.descripcion || ""}
                              onChange={(e) => actualizarCampo(p.id, "descripcion", e.target.value)}
                              className="flex-1 min-h-[60px] resize-none"
                              rows={2}
                            />
                          </div>
                        </td>
                      </tr>
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Totales */}
      {itemsSeleccionados.length > 0 && (
        <div className="flex justify-end">
          <div className="bg-primary/5 border border-primary/20 rounded-lg px-6 py-3 text-lg shadow-sm font-semibold flex gap-6">
            <div>
              Subtotal: <span className="font-bold">$ {formatARNumber(subtotal)}</span>
            </div>
            <div>
              Descuento: <span className="font-bold">$ {formatARNumber(descuentoTotal)}</span>
            </div>
            <div>
              Total: <span className="font-bold text-primary">$ {formatARNumber(total)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Campo de descripción general del presupuesto */}
      {itemsSeleccionados.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-lg">Descripción General del Presupuesto</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              placeholder="Escribe una descripción general del presupuesto, especificaciones técnicas, notas importantes, etc..."
              value={descripcionGeneral}
              onChange={(e) => setDescripcionGeneral(e.target.value)}
              className="min-h-[100px] resize-none"
              rows={4}
            />
          </CardContent>
        </Card>
      )}

      {/* Acciones */}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => router.push(`/${lang}/obras`)}>
          Cancelar
        </Button>
        <Button onClick={guardarPresupuesto} disabled={guardando || !clienteId || itemsSeleccionados.length === 0}>
          {guardando ? "Guardando..." : "Guardar Presupuesto"}
        </Button>
      </div>
      <Dialog open={openNuevoCliente} onOpenChange={setOpenNuevoCliente}>
        <DialogContent className="w-[95vw] max-w-[600px] max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <Icon icon="heroicons:user-plus" className="w-6 h-6" />
              Agregar Cliente
            </DialogTitle>
            <DialogDescription className="text-base text-default-600">
              Complete los datos del nuevo cliente para agregarlo al sistema.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col h-full">
            <div className="flex border-b border-gray-200 mb-4">
              <button type="button" className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === "datos" ? "border-blue-500 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"}`} onClick={() => setActiveTab("datos")}>
                Datos Básicos
              </button>
              <button type="button" className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === "ubicacion" ? "border-blue-500 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"}`} onClick={() => setActiveTab("ubicacion")}>
                Ubicación
              </button>
              <button type="button" className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === "adicional" ? "border-blue-500 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"}`} onClick={() => setActiveTab("adicional")}>
                Adicional
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {activeTab === "datos" && (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                    <input type="checkbox" id="esClienteViejo" checked={nuevoCliente.esClienteViejo} onChange={(e) => setNuevoCliente({ ...nuevoCliente, esClienteViejo: e.target.checked })} className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600" />
                    <label htmlFor="esClienteViejo" className="text-sm font-medium text-blue-800 dark:text-blue-200">¿Es un cliente antiguo?</label>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nombre *</label>
                      <Input placeholder="Nombre completo" className="w-full" value={nuevoCliente.nombre} onChange={(e) => setNuevoCliente({ ...nuevoCliente, nombre: e.target.value })} required />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">CUIT / DNI</label>
                      <Input placeholder="CUIT o DNI" className="w-full" value={nuevoCliente.cuit || ""} onChange={(e) => setNuevoCliente({ ...nuevoCliente, cuit: e.target.value })} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Teléfono *</label>
                      <Input placeholder="Teléfono" className="w-full" value={nuevoCliente.telefono} onChange={(e) => setNuevoCliente({ ...nuevoCliente, telefono: e.target.value })} required />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
                      <Input placeholder="Email" type="email" className="w-full" value={nuevoCliente.email} onChange={(e) => setNuevoCliente({ ...nuevoCliente, email: e.target.value })} />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Dirección *</label>
                      <Input placeholder="Dirección completa" className="w-full" value={nuevoCliente.direccion} onChange={(e) => setNuevoCliente({ ...nuevoCliente, direccion: e.target.value })} required />
                    </div>
                  </div>
                </div>
              )}
              {activeTab === "ubicacion" && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Localidad</label>
                      <Input placeholder="Localidad" className="w-full" value={nuevoCliente.localidad || ""} onChange={(e) => setNuevoCliente({ ...nuevoCliente, localidad: e.target.value })} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Partido</label>
                      <Input placeholder="Partido" className="w-full" value={nuevoCliente.partido || ""} onChange={(e) => setNuevoCliente({ ...nuevoCliente, partido: e.target.value })} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Barrio</label>
                      <Input placeholder="Barrio" className="w-full" value={nuevoCliente.barrio || ""} onChange={(e) => setNuevoCliente({ ...nuevoCliente, barrio: e.target.value })} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Área</label>
                      <Input placeholder="Área" className="w-full" value={nuevoCliente.area || ""} onChange={(e) => setNuevoCliente({ ...nuevoCliente, area: e.target.value })} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Lote</label>
                      <Input placeholder="Lote" className="w-full" value={nuevoCliente.lote || ""} onChange={(e) => setNuevoCliente({ ...nuevoCliente, lote: e.target.value })} />
                    </div>
                  </div>
                </div>
              )}
              {activeTab === "adicional" && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Descripción</label>
                    <Textarea placeholder="Información adicional sobre el cliente" className="w-full min-h-[120px]" value={nuevoCliente.descripcion || ""} onChange={(e) => setNuevoCliente({ ...nuevoCliente, descripcion: e.target.value })} />
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-gray-200">
              <div className="flex gap-2">
                {activeTab !== "datos" && (
                  <Button type="button" variant="outline" onClick={() => { if (activeTab === "ubicacion") setActiveTab("datos"); if (activeTab === "adicional") setActiveTab("ubicacion"); }} className="text-sm">Anterior</Button>
                )}
                {activeTab !== "adicional" && (
                  <Button type="button" variant="outline" onClick={() => { if (activeTab === "datos") setActiveTab("ubicacion"); if (activeTab === "ubicacion") setActiveTab("adicional"); }} disabled={(activeTab === "datos" && (!nuevoCliente.nombre || !nuevoCliente.direccion || !nuevoCliente.telefono)) || (activeTab === "ubicacion" && (!nuevoCliente.nombre || !nuevoCliente.direccion || !nuevoCliente.telefono))} className="text-sm">Siguiente</Button>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setOpenNuevoCliente(false)} className="text-sm">Cancelar</Button>
                <Button variant="default" onClick={async () => { if (!nuevoCliente.nombre || !nuevoCliente.direccion || !nuevoCliente.telefono) { alert("Nombre, dirección y teléfono son obligatorios"); return; } const clienteObj = { nombre: nuevoCliente.nombre, cuit: nuevoCliente.cuit || "", direccion: nuevoCliente.direccion, telefono: nuevoCliente.telefono, email: nuevoCliente.email || "", localidad: nuevoCliente.localidad || "", partido: nuevoCliente.partido || "", barrio: nuevoCliente.barrio || "", area: nuevoCliente.area || "", lote: nuevoCliente.lote || "", descripcion: nuevoCliente.descripcion || "", esClienteViejo: nuevoCliente.esClienteViejo || false, }; const docRef = await addDoc(collection(db, "clientes"), clienteObj); setClientes([ ...clientes, { ...clienteObj, id: docRef.id }, ]); setClienteId(docRef.id); setNuevoCliente({ nombre: "", cuit: "", direccion: "", telefono: "", email: "", localidad: "", partido: "", barrio: "", area: "", lote: "", descripcion: "", esClienteViejo: false, }); setOpenNuevoCliente(false); setDropdownClientesOpen(false); }} disabled={!nuevoCliente.nombre || !nuevoCliente.direccion || !nuevoCliente.telefono} className="text-sm">Guardar Cliente</Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {/* Modal Nuevo Cliente */}
      <Dialog open={openNuevoCliente} onOpenChange={setOpenNuevoCliente}>
        <DialogContent className="w-[95vw] max-w-[600px] max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Agregar Cliente</DialogTitle>
            <DialogDescription className="text-base text-default-600">Complete los datos del nuevo cliente para agregarlo al sistema.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <Input placeholder="Nombre *" value={nuevoCliente.nombre} onChange={(e) => setNuevoCliente({ ...nuevoCliente, nombre: e.target.value })} />
            <Input placeholder="CUIT / DNI" value={nuevoCliente.cuit} onChange={(e) => setNuevoCliente({ ...nuevoCliente, cuit: e.target.value })} />
            <Input placeholder="Dirección *" value={nuevoCliente.direccion} onChange={(e) => setNuevoCliente({ ...nuevoCliente, direccion: e.target.value })} />
            <Input placeholder="Teléfono *" value={nuevoCliente.telefono} onChange={(e) => setNuevoCliente({ ...nuevoCliente, telefono: e.target.value })} />
            <Input placeholder="Email" value={nuevoCliente.email} onChange={(e) => setNuevoCliente({ ...nuevoCliente, email: e.target.value })} />
            <Input placeholder="Localidad" value={nuevoCliente.localidad} onChange={(e) => setNuevoCliente({ ...nuevoCliente, localidad: e.target.value })} />
            <Input placeholder="Partido" value={nuevoCliente.partido} onChange={(e) => setNuevoCliente({ ...nuevoCliente, partido: e.target.value })} />
            <Input placeholder="Barrio" value={nuevoCliente.barrio} onChange={(e) => setNuevoCliente({ ...nuevoCliente, barrio: e.target.value })} />
            <Input placeholder="Área" value={nuevoCliente.area} onChange={(e) => setNuevoCliente({ ...nuevoCliente, area: e.target.value })} />
            <Input placeholder="Lote" value={nuevoCliente.lote} onChange={(e) => setNuevoCliente({ ...nuevoCliente, lote: e.target.value })} />
            <Input placeholder="Descripción" value={nuevoCliente.descripcion} onChange={(e) => setNuevoCliente({ ...nuevoCliente, descripcion: e.target.value })} />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpenNuevoCliente(false)}>Cancelar</Button>
            <Button onClick={handleGuardarNuevoCliente}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


