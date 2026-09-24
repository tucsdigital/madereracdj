"use client";
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { db } from "@/lib/firebase";
import { collection, getDocs, addDoc, doc, getDoc, setDoc } from "firebase/firestore";
import { getNextObraPresupuestoNumber } from "@/lib/obra-numbering";
import FormularioClienteObras from "@/components/obras/FormularioClienteObras";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Filter, Search, RefreshCw, Plus, X, Edit3, Trash2, Check, Loader2, Save } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Icon } from "@iconify/react";
import { detalleMedidaProducto } from "@/lib/obra-utils";

// Formateo regional simple
function formatARNumber(value) {
  const num = Number(value || 0);
  if (Number.isNaN(num)) return "0";
  return num.toLocaleString("es-AR", { minimumFractionDigits: 0 });
}

function capitalizarInicial(value, fallback = "") {
  const texto = String(value || fallback).trim();
  return texto.replace(
    /^[a-záéíóúüñ]/i,
    (letra) => letra.toLocaleUpperCase("es-AR")
  );
}

function normalizarPorcentaje(value, fallback) {
  if (value === null || value === undefined || value === "") return fallback;
  const numero = Number(String(value).replace(",", "."));
  return Number.isFinite(numero) ? Math.max(0, numero) : fallback;
}

function calcularTotalesBloque(bloque = {}) {
  const items = Array.isArray(bloque.items) ? bloque.items : [];
  const subtotal = items.reduce(
    (acumulado, producto) => acumulado + (Number(producto.precio) || 0),
    0
  );
  const descuentoTotal = items.reduce((acumulado, producto) => {
    const descuento = Math.min(
      100,
      Math.max(0, Number(producto.descuento) || 0)
    );
    return acumulado + (Number(producto.precio) || 0) * (descuento / 100);
  }, 0);
  const base = Math.max(0, subtotal - descuentoTotal);
  const aplicarIva = Boolean(bloque.aplicarIva);
  const ivaPorcentaje = normalizarPorcentaje(bloque.ivaPorcentaje, 21);
  const ivaMonto = aplicarIva ? Math.round(base * (ivaPorcentaje / 100)) : 0;
  const aplicarTransferencia = Boolean(bloque.aplicarTransferencia);
  const transferenciaPorcentaje = normalizarPorcentaje(
    bloque.transferenciaPorcentaje,
    10
  );
  const transferenciaMonto = aplicarTransferencia
    ? Math.round(base * (transferenciaPorcentaje / 100))
    : 0;

  return {
    subtotal: Math.round(subtotal),
    descuentoTotal: Math.round(descuentoTotal),
    base: Math.round(base),
    aplicarIva,
    ivaPorcentaje,
    ivaMonto,
    aplicarTransferencia,
    transferenciaPorcentaje,
    transferenciaMonto,
    total: Math.round(base + ivaMonto + transferenciaMonto),
  };
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
  const DEFAULT_CLIENTE_ID = "consumidor_final";
  const DEFAULT_CLIENTE_DATA = useMemo(
    () => ({
      nombre: "CONSUMIDOR FINAL",
      email: "",
      telefono: "",
      direccion: "",
      cuit: "",
      localidad: "",
      esClienteDefault: true,
    }),
    []
  );

  // Clientes
  const [clientes, setClientes] = useState([]);
  const [clienteId, setClienteId] = useState("");
  const clienteSeleccionado = clientes.find((c) => c.id === clienteId);
  const [busquedaCliente, setBusquedaCliente] = useState("");
  const [clientesLoading, setClientesLoading] = useState(false);
  const [dropdownClientesOpen, setDropdownClientesOpen] = useState(false);
  const [showFormularioCliente, setShowFormularioCliente] = useState(false);

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

  // Bloques de presupuesto
  const [bloques, setBloques] = useState([
    {
      id: `presupuesto-${Date.now()}`,
      nombre: "Presupuesto 1",
      items: [],
      descripcion: "",
      aplicarIva: false,
      ivaPorcentaje: 21,
      aplicarTransferencia: false,
      transferenciaPorcentaje: 10,
    }
  ]);
  const [bloqueActivo, setBloqueActivo] = useState(0);
  const [editandoNombreBloque, setEditandoNombreBloque] = useState(null);
  const [nuevoNombreBloque, setNuevoNombreBloque] = useState("");
  // const [descripcionGeneral, setDescripcionGeneral] = useState("");

  // Carga inicial
  useEffect(() => {
    async function fetchData() {
      // Clientes
      setClientesLoading(true);
      let defaultCliente = { id: DEFAULT_CLIENTE_ID, ...DEFAULT_CLIENTE_DATA };
      try {
        const defaultRef = doc(db, "clientes", DEFAULT_CLIENTE_ID);
        const defaultSnap = await getDoc(defaultRef);
        if (!defaultSnap.exists()) {
          await setDoc(defaultRef, {
            ...DEFAULT_CLIENTE_DATA,
            creadoEn: new Date().toISOString(),
          });
        } else {
          defaultCliente = { id: defaultSnap.id, ...defaultSnap.data() };
        }
      } catch (e) {
        console.warn("No se pudo asegurar el cliente por defecto:", e);
      }

      const snapClientes = await getDocs(collection(db, "clientes"));
      const list = snapClientes.docs.map((d) => ({ id: d.id, ...d.data() }));
      const tieneDefault = list.some((c) => c.id === DEFAULT_CLIENTE_ID);
      const next = tieneDefault ? list : [defaultCliente, ...list];
      setClientes(next);
      setClientesLoading(false);
      setClienteId((prev) => prev || DEFAULT_CLIENTE_ID);

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
  }, [DEFAULT_CLIENTE_DATA, DEFAULT_CLIENTE_ID]);

  // Normalizador de texto
  const normalizarTexto = useCallback((texto) => {
    if (!texto) return "";
    return texto.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "");
  }, []);

  const productosSeleccionadosPorId = useMemo(() => {
    const items = bloques[bloqueActivo]?.items || [];
    return items.reduce((conteo, producto) => {
      if (producto._esManual) return conteo;
      const productoId = producto.originalId || producto.id;
      conteo.set(productoId, (conteo.get(productoId) || 0) + 1);
      return conteo;
    }, new Map());
  }, [bloques, bloqueActivo]);

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
    const filtrados = fuente
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

    return filtrados
      .map((producto, indice) => ({ producto, indice }))
      .sort((a, b) => {
        const seleccionadoA = productosSeleccionadosPorId.has(a.producto.id);
        const seleccionadoB = productosSeleccionadosPorId.has(b.producto.id);
        if (seleccionadoA === seleccionadoB) return a.indice - b.indice;
        return seleccionadoA ? -1 : 1;
      })
      .map(({ producto }) => producto);
  }, [
    productos,
    productosPorCategoria,
    categoriaId,
    busquedaDefer,
    normalizarTexto,
    productosSeleccionadosPorId,
  ]);

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
  }, [categoriaId, busquedaDefer, bloqueActivo]);

  // Acciones de bloques
  const agregarBloque = useCallback(() => {
    const nuevoBloque = {
      id: `presupuesto-${Date.now()}`,
      nombre: `Presupuesto ${bloques.length + 1}`,
      items: [],
      descripcion: "",
      aplicarIva: false,
      ivaPorcentaje: 21,
      aplicarTransferencia: false,
      transferenciaPorcentaje: 10,
    };
    setBloques(prev => [...prev, nuevoBloque]);
    setBloqueActivo(bloques.length);
  }, [bloques.length]);

  const eliminarBloque = useCallback((bloqueIndex) => {
    if (bloques.length <= 1) return; // No permitir eliminar el último bloque
    
    setBloques(prev => prev.filter((_, index) => index !== bloqueIndex));
    
    // Ajustar bloque activo si es necesario
    if (bloqueActivo >= bloqueIndex) {
      setBloqueActivo(prev => Math.max(0, prev - 1));
    }
  }, [bloques.length, bloqueActivo]);

  const actualizarNombreBloque = useCallback((bloqueIndex, nuevoNombre) => {
    setBloques(prev => prev.map((bloque, index) => 
      index === bloqueIndex ? { ...bloque, nombre: nuevoNombre } : bloque
    ));
  }, []);

  const actualizarDescripcionBloque = useCallback((bloqueIndex, descripcion) => {
    setBloques(prev => prev.map((bloque, index) => 
      index === bloqueIndex ? { ...bloque, descripcion } : bloque
    ));
  }, []);

  const actualizarConfiguracionBloque = useCallback((campo, valor) => {
    setBloques((prev) =>
      prev.map((bloque, index) =>
        index === bloqueActivo ? { ...bloque, [campo]: valor } : bloque
      )
    );
  }, [bloqueActivo]);

  // Acciones selección de productos
  const agregarProducto = useCallback((prod) => {
    const bloqueActual = bloques[bloqueActivo];
    if (!bloqueActual) return;
    
    // Generar ID único para cada instancia del producto
    const instanceId = `${prod.id}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const unidadMedida = prod.unidadMedida || "UN";
    const valorVenta = Number(prod.valorVenta) || 0;
    const nuevo = {
      id: instanceId, // ID único para la instancia
      originalId: prod.id, // ID original del producto para referencia
      nombre: prod.nombre,
      categoria: prod.categoria || "",
      subCategoria: prod.subCategoria || prod.subcategoria || "",
      unidadMedida,
      valorVenta,
      alto: 1,
      largo: 1,
      cantidad: 1,
      descuento: 0,
      descripcion: "",
    };
    
    const precio = calcularPrecioProductoObra({
      unidadMedida,
      alto: nuevo.alto,
      largo: nuevo.largo,
      valorVenta: nuevo.valorVenta,
      cantidad: nuevo.cantidad,
    });
    nuevo.precio = precio;
    
    setBloques(prev => prev.map((bloque, index) => 
      index === bloqueActivo 
        ? { ...bloque, items: [...bloque.items, nuevo] }
        : bloque
    ));
    setPaginaActual(1);
  }, [bloques, bloqueActivo]);

  const agregarProductoManual = useCallback(() => {
    const bloqueActual = bloques[bloqueActivo];
    if (!bloqueActual) return;
    
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
      descripcion: "",
      _esManual: true,
    };
    
    nuevo.precio = calcularPrecioProductoObra({ 
      unidadMedida: nuevo.unidadMedida, 
      alto: nuevo.alto, 
      largo: nuevo.largo, 
      valorVenta: nuevo.valorVenta, 
      cantidad: nuevo.cantidad 
    });
    
    setBloques(prev => prev.map((bloque, index) => 
      index === bloqueActivo 
        ? { ...bloque, items: [nuevo, ...bloque.items] }
        : bloque
    ));
  }, [bloques, bloqueActivo]);

  const quitarProducto = useCallback((id) => {
    setBloques(prev => prev.map((bloque, index) => 
      index === bloqueActivo 
        ? { ...bloque, items: bloque.items.filter((p) => p.id !== id) }
        : bloque
    ));
  }, [bloqueActivo]);

  const quitarProductoDesdeCatalogo = useCallback((productoCatalogoId) => {
    setBloques((prev) =>
      prev.map((bloque, index) => {
        if (index !== bloqueActivo) return bloque;

        const indiceProducto = bloque.items.findIndex(
          (producto) =>
            (producto.originalId || producto.id) === productoCatalogoId
        );
        if (indiceProducto === -1) return bloque;

        return {
          ...bloque,
          items: bloque.items.filter(
            (_, productoIndex) => productoIndex !== indiceProducto
          ),
        };
      })
    );
    setPaginaActual(1);
  }, [bloqueActivo]);

  const duplicarProducto = useCallback((producto) => {
    const bloqueActual = bloques[bloqueActivo];
    if (!bloqueActual) return;
    
    // Generar ID único para el producto duplicado
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substr(2, 5);
    const uniqueId = `${producto.originalId || producto.id}-${timestamp}-${randomSuffix}`;
    
    const duplicado = {
      ...producto,
      id: uniqueId,
      originalId: producto.originalId || producto.id,
    };
    
    setBloques(prev => prev.map((bloque, index) => 
      index === bloqueActivo 
        ? { ...bloque, items: [...bloque.items, duplicado] }
        : bloque
    ));
  }, [bloques, bloqueActivo]);

  // Handlers de edición por fila
  const actualizarCampo = (id, campo, valor) => {
    setBloques(prev => prev.map((bloque, bloqueIndex) => 
      bloqueIndex === bloqueActivo 
        ? {
            ...bloque,
            items: bloque.items.map((p) => {
      if (p.id !== id) return p;
      
      const actualizado = { ...p };
      
      if (campo === "unidadMedida") {
        actualizado.unidadMedida = valor;
      } else if (campo === "descuento") {
        actualizado[campo] = Math.min(100, Math.max(0, Number(valor) || 0));
      } else if (campo === "valorVenta") {
        actualizado[campo] = valor === "" ? "" : Number(valor);
      } else if (campo === "descripcion") {
        actualizado[campo] = valor;
      } else {
        actualizado[campo] = valor === "" ? "" : Number(valor);
      }
      
      if (campo !== "descripcion") {
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
      }
      
      return actualizado;
            })
          }
        : bloque
    ));
  };
  
  const actualizarNombreManual = (id, nombre) => {
    setBloques(prev => prev.map((bloque, bloqueIndex) => 
      bloqueIndex === bloqueActivo 
        ? {
            ...bloque,
            items: bloque.items.map((p) => (p.id === id ? { ...p, nombre } : p))
          }
        : bloque
    ));
  };

  // Cálculos de totales por bloque
  const totalesPorBloque = useMemo(() => {
    return bloques.map(calcularTotalesBloque);
  }, [bloques]);

  // Bloque actual
  const bloqueActual = bloques[bloqueActivo];
  const itemsSeleccionados = bloqueActual?.items || [];

  // Guardar
  const [guardando, setGuardando] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [errorAccion, setErrorAccion] = useState("");

  const cancelarCreacion = () => {
    if (guardando || cancelando) return;
    setErrorAccion("");
    setCancelando(true);
    router.push(`/${lang}/obras`);
  };

  const guardarPresupuesto = async () => {
    if (guardando || cancelando) return;
    const finalClienteId = clienteId || DEFAULT_CLIENTE_ID;
    const clienteSel = clientes.find((c) => c.id === finalClienteId) || null;
    if (bloques.every(bloque => bloque.items.length === 0)) {
      setErrorAccion("Agregá al menos un producto antes de guardar.");
      return;
    }
    
    setErrorAccion("");
    setGuardando(true);
    try {
      const numeroPedido = await getNextObraPresupuestoNumber();
      const totalesBloqueUnico = bloques.length === 1 ? totalesPorBloque[0] : null;
      
      const presupuestoData = {
        tipo: "presupuesto",
        numeroPedido,
        fecha: new Date().toISOString().split("T")[0],
        clienteId: finalClienteId,
        cliente: clienteSel || null,
        bloques: bloques.map((bloque, index) => {
          const totales = totalesPorBloque[index];
          return {
            id: bloque.id,
            nombre: bloque.nombre,
            descripcion: bloque.descripcion,
            productos: bloque.items.map((p) => {
              const u = String(p.unidadMedida || "UN").toUpperCase();
              const altoNum = Number(p.alto) || 0;
              const largoNum = Number(p.largo) || 0;
              const cantNum = Number(p.cantidad) || 1;
              const m2 = u === "M2" ? altoNum * largoNum * cantNum : 0;
              const ml = u === "ML" ? largoNum * cantNum : 0;
              return {
                id: p.id,
                originalId: p.originalId || p.id,
                nombre: p.nombre,
                categoria: p.categoria,
                subCategoria: p.subCategoria,
                subcategoria: p.subCategoria,
                unidadMedida: p.unidadMedida,
                valorVenta: p.valorVenta,
                alto: altoNum,
                largo: largoNum,
                largoNum: largoNum,
                cantidad: cantNum,
                descuento: Math.min(100, Math.max(0, Number(p.descuento) || 0)),
                precio: Number(p.precio) || 0,
                precioIncluyeCantidad: true,
                descripcion: p.descripcion || "",
                m2,
                ml,
              };
            }),
            subtotal: totales.subtotal,
            descuentoTotal: totales.descuentoTotal,
            baseImponible: totales.base,
            aplicarIva: totales.aplicarIva,
            aplicaIva: totales.aplicarIva,
            ivaPorcentaje: totales.ivaPorcentaje,
            ivaMonto: totales.ivaMonto,
            aplicarTransferencia: totales.aplicarTransferencia,
            aplicaTransferencia: totales.aplicarTransferencia,
            transferenciaPorcentaje: totales.transferenciaPorcentaje,
            transferenciaMonto: totales.transferenciaMonto,
            total: totales.total,
          };
        }),
        totalesPorBloque: true,
        aplicarIva: totalesBloqueUnico?.aplicarIva || false,
        aplicaIva: totalesBloqueUnico?.aplicarIva || false,
        ivaPorcentaje: totalesBloqueUnico?.ivaPorcentaje || 0,
        ivaMonto: totalesBloqueUnico?.ivaMonto || 0,
        aplicarTransferencia:
          totalesBloqueUnico?.aplicarTransferencia || false,
        aplicaTransferencia:
          totalesBloqueUnico?.aplicarTransferencia || false,
        transferenciaPorcentaje:
          totalesBloqueUnico?.transferenciaPorcentaje || 0,
        transferenciaMonto: totalesBloqueUnico?.transferenciaMonto || 0,
        subtotal: totalesBloqueUnico?.subtotal || 0,
        descuentoTotal: totalesBloqueUnico?.descuentoTotal || 0,
        total: totalesBloqueUnico?.total || 0,
        fechaCreacion: new Date().toISOString(),
        estado: "Activo",
      };
      
      const presupuestoCreado = await addDoc(collection(db, "obras"), presupuestoData);
      router.push(`/${lang}/obras/presupuesto/${presupuestoCreado.id}`);
    } catch (error) {
      console.error("Error al guardar el presupuesto de obra:", error);
      setErrorAccion("No se pudo guardar el presupuesto. Revisá la conexión e intentá nuevamente.");
      setGuardando(false);
    }
  };

  // Handler para cuando se guarda un cliente desde el nuevo formulario
  const handleClienteGuardado = (clienteId, clienteData) => {
    setClientes((prev) => {
      // Verificar si ya existe para evitar duplicados
      const existe = prev.find(c => c.id === clienteId);
      if (existe) return prev;
      return [...prev, clienteData];
    });
    setClienteId(clienteId);
    setShowFormularioCliente(false);
    setDropdownClientesOpen(false);
  };

  return (
    <div className="flex flex-col gap-6 py-8">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Nuevo Presupuesto (Obras)</h1>
          <p className="text-gray-600 mt-1">Crea presupuestos organizados por bloques para diferentes secciones de tu obra</p>
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
                {clienteSeleccionado ? `${clienteSeleccionado.nombre} - ${clienteSeleccionado.telefono || ""}` : "Seleccionar cliente..."}
              </span>
              <div className="flex items-center gap-2">
                <Button type="button" variant="ghost" size="sm" className="text-primary font-semibold" onClick={(e) => { e.stopPropagation(); setShowFormularioCliente(true); }} disabled={clientesLoading}>Nuevo</Button>
                <svg className="w-5 h-5 text-default-600" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.21 8.27a.75.75 0 01.02-1.06z" clipRule="evenodd"/></svg>
              </div>
            </div>
            {dropdownClientesOpen && (
              <div className="absolute z-50 min-w-[8rem] overflow-hidden rounded-md border border-default-300 bg-card text-default-900 shadow-md mt-1 max-h-72 w-full">
                <div className="p-2">
                  <Input
                    type="text"
                    placeholder="Buscar por nombre o teléfono..."
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
                          String(c.telefono || "").toLowerCase().includes(q)
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
                          aria-selected={c.id === clienteId}
                          tabIndex={0}
                        >
                          {c.nombre} - {c.telefono || ""}
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
      <Card className="overflow-hidden border-slate-200 shadow-sm">
        <CardHeader className="border-b border-slate-200 bg-slate-50/70 px-5 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Filter className="h-5 w-5 text-primary" />
                Catálogo de productos
                {bloqueActual && (
                  <Badge variant="outline" className="ml-1 bg-white">
                    {bloqueActual.nombre}
                  </Badge>
                )}
              </CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Elegí los productos que querés agregar al presupuesto.
              </p>
            </div>
            <Button onClick={agregarProductoManual} variant="outline" size="sm">
              <Plus className="mr-2 h-4 w-4" />
              Agregar ítem manual
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="flex flex-1 flex-wrap gap-2">
              {categorias.map((categoria) => (
                <button
                  key={categoria}
                  type="button"
                  onClick={() =>
                    setCategoriaId((actual) =>
                      actual === categoria ? "" : categoria
                    )
                  }
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${categoriaId === categoria
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-slate-200 bg-white text-slate-600 hover:border-primary/40 hover:text-primary"
                    }`}
                >
                  {capitalizarInicial(categoria)}
                </button>
              ))}
            </div>
            <div className="relative w-full lg:w-80">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Buscar productos..."
                value={busquedaProducto}
                onChange={(event) => setBusquedaProducto(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.preventDefault();
                }}
                className="pl-9"
              />
            </div>
          </div>

          <div className="min-h-56 rounded-xl border border-slate-200 bg-slate-50/40 p-4">
            {categorias.length === 0 ? (
              <div className="flex min-h-48 flex-col items-center justify-center text-center">
                <Icon icon="heroicons:cube-transparent" className="mb-2 h-9 w-9 text-slate-300" />
                <p className="font-medium text-slate-700">No hay productos disponibles</p>
              </div>
            ) : productosFiltrados.length === 0 ? (
              <div className="flex min-h-48 flex-col items-center justify-center text-center">
                <Search className="mb-2 h-8 w-8 text-slate-300" />
                <p className="font-medium text-slate-700">No encontramos productos</p>
                <p className="mt-1 text-sm text-slate-500">Probá con otra búsqueda o categoría.</p>
              </div>
            ) : (
              <div className="relative grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {isPending && (
                  <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-white/80 backdrop-blur-sm">
                    <span className="text-sm font-medium text-slate-600">Actualizando catálogo…</span>
                  </div>
                )}
                {productosPaginados.map((prod) => {
                  const vecesAgregado = productosSeleccionadosPorId.get(prod.id) || 0;
                  const precio = Number(prod.valorVenta) || 0;

                  return (
                    <div
                      key={prod.id}
                      className={`group relative flex h-full flex-col rounded-xl border bg-white transition-all hover:-translate-y-0.5 hover:shadow-md ${vecesAgregado > 0
                        ? "border-primary/40 ring-1 ring-primary/10"
                        : "border-slate-200 hover:border-primary/30"
                        }`}
                    >
                      <div className="flex h-full flex-col p-4">
                        <div className="mb-3 flex items-start gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm">
                            🏗️
                          </div>
                          <div className="min-w-0 flex-1">
                            <h4
                              className="line-clamp-2 min-h-10 text-sm font-semibold leading-5 text-slate-900"
                              title={prod.nombre}
                            >
                              {capitalizarInicial(prod.nombre, "Producto sin nombre")}
                            </h4>
                            {vecesAgregado > 0 && (
                              <Badge className="mt-1 bg-primary/10 text-[10px] text-primary hover:bg-primary/10">
                                Agregado {vecesAgregado}×
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-1 items-end justify-between gap-3 border-t border-slate-100 pt-3">
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Valor unitario</p>
                            <p className="mt-1 font-bold tabular-nums text-slate-900">$ {formatARNumber(precio)}</p>
                          </div>
                          <Badge variant="outline" className="bg-slate-50 text-[10px] text-slate-600">
                            {String(prod.unidadMedida || "UN").toUpperCase()}
                          </Badge>
                        </div>
                        <div className={`mt-3 grid gap-2 ${vecesAgregado > 0 ? "grid-cols-2" : "grid-cols-1"}`}>
                          {vecesAgregado > 0 && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => quitarProductoDesdeCatalogo(prod.id)}
                              className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                              aria-label={`Quitar ${prod.nombre || "producto"} del bloque`}
                            >
                              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                              {vecesAgregado > 1 ? "Quitar uno" : "Quitar"}
                            </Button>
                          )}
                          <Button
                            type="button"
                            onClick={() => agregarProducto(prod)}
                            size="sm"
                            className="w-full"
                          >
                            {vecesAgregado > 0 ? "Agregar otro" : "Agregar"}
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {productosFiltrados.length > 0 && (
            <div className="flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-500">
                Mostrando {(paginaActual - 1) * productosPorPagina + 1}–{Math.min(paginaActual * productosPorPagina, totalProductos)} de {totalProductos}
              </p>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={paginaActual === 1 || isPending}
                  onClick={() => startTransition(() => setPaginaActual(1))}
                >
                  «
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={paginaActual === 1 || isPending}
                  onClick={() => startTransition(() => setPaginaActual((pagina) => Math.max(1, pagina - 1)))}
                >
                  Anterior
                </Button>
                <span className="min-w-20 px-2 text-center text-sm font-medium text-slate-600">
                  {paginaActual} / {totalPaginas}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={paginaActual === totalPaginas || isPending}
                  onClick={() => startTransition(() => setPaginaActual((pagina) => Math.min(totalPaginas, pagina + 1)))}
                >
                  Siguiente
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={paginaActual === totalPaginas || isPending}
                  onClick={() => startTransition(() => setPaginaActual(totalPaginas))}
                >
                  »
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Gestión de Bloques */}
      <Card className="overflow-hidden border-slate-200 shadow-sm">
        <CardHeader className="border-b border-slate-200 bg-slate-50/70 px-5 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Icon icon="heroicons:squares-2x2" className="h-5 w-5 text-primary" />
                Resumen del presupuesto
              </CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Creá y organizá las opciones de este presupuesto.
              </p>
            </div>
            <Button onClick={agregarBloque} size="sm" className="shrink-0">
              <Plus className="mr-2 h-4 w-4" />
              Nuevo bloque
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-5 p-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {bloques.map((bloque, index) => (
              <div
                key={bloque.id}
                role="button"
                tabIndex={0}
                className={`group rounded-xl border p-3 transition-all ${index === bloqueActivo
                  ? "border-primary bg-primary/5 shadow-sm ring-1 ring-primary/20"
                  : "border-slate-200 bg-white hover:border-primary/40 hover:shadow-sm"
                  }`}
                onClick={() => setBloqueActivo(index)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setBloqueActivo(index);
                  }
                }}
              >
                {editandoNombreBloque === index ? (
                  <div className="flex items-center gap-2" onClick={(event) => event.stopPropagation()}>
                    <Input
                      value={nuevoNombreBloque}
                      onChange={(event) => setNuevoNombreBloque(event.target.value)}
                      className="h-9 flex-1"
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          actualizarNombreBloque(index, nuevoNombreBloque);
                          setEditandoNombreBloque(null);
                          setNuevoNombreBloque("");
                        }
                        if (event.key === "Escape") {
                          setEditandoNombreBloque(null);
                          setNuevoNombreBloque("");
                        }
                      }}
                      autoFocus
                    />
                    <Button
                      size="sm"
                      className="h-9 w-9 p-0"
                      onClick={() => {
                        actualizarNombreBloque(index, nuevoNombreBloque);
                        setEditandoNombreBloque(null);
                        setNuevoNombreBloque("");
                      }}
                    >
                      <Check className="h-3 w-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-9 w-9 p-0"
                      onClick={() => {
                        setEditandoNombreBloque(null);
                        setNuevoNombreBloque("");
                      }}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-start gap-3">
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${index === bloqueActivo ? "bg-primary text-primary-foreground" : "bg-slate-100 text-slate-600"}`}>
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-slate-900">{bloque.nombre}</p>
                          <p className="mt-0.5 text-xs text-slate-500">
                            {bloque.items.length} {bloque.items.length === 1 ? "producto" : "productos"}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-slate-500"
                            onClick={(event) => {
                              event.stopPropagation();
                              setEditandoNombreBloque(index);
                              setNuevoNombreBloque(bloque.nombre);
                            }}
                            title="Renombrar bloque"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                          </Button>
                          {bloques.length > 1 && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0 text-red-500 hover:bg-red-50 hover:text-red-600"
                              onClick={(event) => {
                                event.stopPropagation();
                                eliminarBloque(index);
                              }}
                              title="Eliminar bloque"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-1.5">
                        <Badge variant="outline" className="bg-white text-[10px]">
                          {bloque.aplicarIva ? `IVA ${normalizarPorcentaje(bloque.ivaPorcentaje, 21)}%` : "Sin IVA"}
                        </Badge>
                        <Badge variant="outline" className="bg-white text-[10px]">
                          {bloque.aplicarTransferencia ? `Transferencia ${normalizarPorcentaje(bloque.transferenciaPorcentaje, 10)}%` : "Sin transferencia"}
                        </Badge>
                      </div>
                      <p className="mt-3 text-base font-bold tabular-nums text-emerald-600">
                        $ {formatARNumber(totalesPorBloque[index]?.total || 0)}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {bloqueActual && (
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Bloque activo</p>
                  <h3 className="mt-1 text-lg font-semibold text-slate-900">{bloqueActual.nombre}</h3>
                </div>
                <div className="grid flex-1 gap-3 sm:grid-cols-2 xl:max-w-2xl">
                  <div className={`rounded-lg border p-3 ${bloqueActual.aplicarIva ? "border-amber-200 bg-amber-50/60" : "border-slate-200"}`}>
                    <label className="flex cursor-pointer items-center justify-between gap-3 text-sm font-semibold">
                      <span>Aplicar IVA</span>
                      <input
                        type="checkbox"
                        checked={Boolean(bloqueActual.aplicarIva)}
                        onChange={(event) => actualizarConfiguracionBloque("aplicarIva", event.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                      />
                    </label>
                    <div className="mt-2 flex items-center justify-self-end gap-2">
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={bloqueActual.ivaPorcentaje ?? 21}
                        onChange={(event) => actualizarConfiguracionBloque("ivaPorcentaje", event.target.value)}
                        disabled={!bloqueActual.aplicarIva}
                        className="h-8 text-right"
                      />
                      <span className="text-sm text-muted-foreground">%</span>
                    </div>
                  </div>
                  <div className={`rounded-lg border p-3 ${bloqueActual.aplicarTransferencia ? "border-blue-200 bg-blue-50/60" : "border-slate-200"}`}>
                    <label className="flex cursor-pointer items-center justify-between gap-3 text-sm font-semibold">
                      <span>Transferencia</span>
                      <input
                        type="checkbox"
                        checked={Boolean(bloqueActual.aplicarTransferencia)}
                        onChange={(event) => actualizarConfiguracionBloque("aplicarTransferencia", event.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                      />
                    </label>
                    <div className="mt-2 flex items-center justify-self-end gap-2">
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={bloqueActual.transferenciaPorcentaje ?? 10}
                        onChange={(event) => actualizarConfiguracionBloque("transferenciaPorcentaje", event.target.value)}
                        disabled={!bloqueActual.aplicarTransferencia}
                        className="h-8 text-right"
                      />
                      <span className="text-sm text-muted-foreground">%</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 sm:grid-cols-3 lg:grid-cols-5">
                {[
                  ["Subtotal", totalesPorBloque[bloqueActivo]?.subtotal, "text-slate-900"],
                  ["Descuentos", totalesPorBloque[bloqueActivo]?.descuentoTotal, "text-amber-600"],
                  [`IVA ${totalesPorBloque[bloqueActivo]?.aplicarIva ? `(${totalesPorBloque[bloqueActivo]?.ivaPorcentaje}%)` : ""}`, totalesPorBloque[bloqueActivo]?.ivaMonto, "text-amber-600"],
                  [`Transferencia ${totalesPorBloque[bloqueActivo]?.aplicarTransferencia ? `(${totalesPorBloque[bloqueActivo]?.transferenciaPorcentaje}%)` : ""}`, totalesPorBloque[bloqueActivo]?.transferenciaMonto, "text-blue-600"],
                  ["Total del bloque", totalesPorBloque[bloqueActivo]?.total, "text-emerald-600"],
                ].map(([label, value, color]) => (
                  <div key={label} className="bg-white px-3 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
                    <p className={`mt-1 text-sm font-bold tabular-nums ${color}`}>$ {formatARNumber(value || 0)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Seleccionados */}
      {itemsSeleccionados.length > 0 && (
        <Card className="overflow-hidden border-slate-200 shadow-sm">
          <CardHeader className="border-b border-slate-200 bg-slate-50/70 px-5 py-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Icon icon="heroicons:clipboard-document-list" className="h-5 w-5 text-primary" />
                  Productos del bloque
                  <Badge variant="outline" className="bg-white">{bloqueActual?.nombre}</Badge>
                </CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Revisá y ajustá los productos agregados.
                </p>
              </div>
              <div className="text-left sm:text-right">
                <p className="text-xs text-slate-500">{itemsSeleccionados.length} {itemsSeleccionados.length === 1 ? "producto" : "productos"}</p>
                <p className="text-lg font-bold tabular-nums text-emerald-600">
                  $ {formatARNumber(totalesPorBloque[bloqueActivo]?.total || 0)}
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="min-w-[1100px] w-full text-sm">
                <thead className="bg-slate-800">
                  <tr className="border-b border-slate-700">
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-100">Producto</th>
                    <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-100">Cant.</th>
                    <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-100">Unidad</th>
                    <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-100">Alto</th>
                    <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-100">Largo</th>
                    <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-100">Medida</th>
                    <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-100">Precio unitario</th>
                    <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-100">Desc. %</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-100">Total línea</th>
                    <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-100">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {itemsSeleccionados.map((p) => {
                    const medida = detalleMedidaProducto(p);
                    const u = medida.unidad;
                    const descuento = Math.min(100, Math.max(0, Number(p.descuento) || 0));
                    const sub = (Number(p.precio) || 0) * (1 - descuento / 100);
                    const requiereAlto = u === "M2";
                    const requiereLargo = u === "M2" || u === "ML";

                    return (
                      <React.Fragment key={p.id}>
                        <tr className="border-b border-slate-100 bg-white hover:bg-slate-50/60">
                          <td className="px-4 py-3">
                            <div className="font-medium">
                              {p._esManual ? (
                                <Input
                                  value={p.nombre}
                                  onChange={(event) => actualizarNombreManual(p.id, event.target.value)}
                                  className="h-8"
                                />
                              ) : (
                                <div className="flex items-center gap-2">
                                  <span>{capitalizarInicial(p.nombre, "Producto sin nombre")}</span>
                                  {itemsSeleccionados.filter((item) => (item.originalId || item.id) === (p.originalId || p.id)).length > 1 && (
                                    <Badge variant="outline" className="border-blue-200 bg-blue-50 text-xs text-blue-600">
                                      Duplicado
                                    </Badge>
                                  )}
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-3 text-center">
                            <Input
                              type="number"
                              min={1}
                              value={p.cantidad}
                              onChange={(event) => actualizarCampo(p.id, "cantidad", event.target.value)}
                              className="mx-auto h-9 w-20 text-center"
                            />
                          </td>
                          <td className="px-3 py-3 text-center">
                            {p._esManual ? (
                              <Select value={u} onValueChange={(value) => actualizarCampo(p.id, "unidadMedida", value)}>
                                <SelectTrigger className="mx-auto h-8 w-24">
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
                          <td className="px-3 py-3 text-center">
                            {requiereAlto ? (
                              <Input
                                type="number"
                                min={0}
                                step="0.01"
                                value={p.alto}
                                onChange={(event) => actualizarCampo(p.id, "alto", event.target.value)}
                                className="mx-auto h-9 w-24 text-center"
                              />
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                          <td className="px-3 py-3 text-center">
                            {requiereLargo ? (
                              <Input
                                type="number"
                                min={0}
                                step="0.01"
                                value={p.largo ?? p.largoNum ?? ""}
                                onChange={(event) => actualizarCampo(p.id, "largo", event.target.value)}
                                className="mx-auto h-9 w-24 text-center"
                              />
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                          <td className="px-3 py-3 text-center">
                            <span className="text-xs font-medium text-gray-700">{medida.medidaTxt}</span>
                          </td>
                          <td className="px-3 py-3 text-right">
                            <div className="relative ml-auto w-32">
                              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-slate-400">$</span>
                              <Input
                                type="number"
                                min={0}
                                step="0.01"
                                value={p.valorVenta ?? ""}
                                onChange={(event) => actualizarCampo(p.id, "valorVenta", event.target.value)}
                                className="h-9 pl-6 pr-2 text-right font-medium tabular-nums"
                                aria-label={`Precio unitario de ${p.nombre || "producto"}`}
                              />
                            </div>
                          </td>
                          <td className="px-3 py-3 text-center">
                            <Input
                              type="number"
                              min={0}
                              max={100}
                              value={p.descuento}
                              onChange={(event) => actualizarCampo(p.id, "descuento", event.target.value)}
                              className="mx-auto h-9 w-20 text-center"
                            />
                          </td>
                          <td className="px-4 py-3 text-right font-bold tabular-nums text-slate-900">
                            $ {formatARNumber(Math.round(sub))}
                          </td>
                          <td className="px-3 py-3 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                variant="outline"
                                onClick={() => duplicarProducto(p)}
                                size="sm"
                                className="h-8 w-8 p-0 text-blue-600 hover:bg-blue-50 hover:text-blue-700"
                                title="Duplicar producto"
                              >
                                <Plus className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="outline"
                                onClick={() => quitarProducto(p.id)}
                                size="sm"
                                className="h-8 w-8 p-0 text-red-600 hover:bg-red-50 hover:text-red-700"
                                title="Quitar producto"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                        <tr className="border-b border-slate-100 bg-slate-50/60">
                          <td colSpan={10} className="px-4 py-3">
                            <div className="flex items-start gap-3">
                              <span className="w-20 shrink-0 pt-2 text-xs font-semibold text-slate-500">Descripción</span>
                              <Textarea
                                placeholder="Escribe una descripción específica para este producto..."
                                value={p.descripcion || ""}
                                onChange={(event) => actualizarCampo(p.id, "descripcion", event.target.value)}
                                className="min-h-10 flex-1 resize-y bg-white"
                                rows={1}
                              />
                            </div>
                          </td>
                        </tr>
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Descripción del Presupuesto (Bloque) - siempre visible */}
      {bloqueActual && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Icon icon="heroicons:document-text" className="w-5 h-5" />
              Descripción del Presupuesto (Bloque actual)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              placeholder="Escribe una descripción para este presupuesto (bloque) que aparecerá en la impresión"
              value={bloqueActual?.descripcion || ""}
              onChange={(e) => actualizarDescripcionBloque(bloqueActivo, e.target.value)}
              className="min-h-[80px] resize-none"
              rows={3}
            />
          </CardContent>
        </Card>
      )}

      {/* Acciones */}
      <div className="sticky bottom-4 z-20 flex flex-col gap-3 rounded-xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between">
        <div className="min-h-5 text-sm">
          {errorAccion ? (
            <p className="font-medium text-red-600" role="alert">{errorAccion}</p>
          ) : bloques.every((bloque) => bloque.items.length === 0) ? (
            <p className="text-slate-500">Agregá al menos un producto para guardar.</p>
          ) : (
            <p className="text-slate-500">Al guardar, vas a ver el detalle del presupuesto.</p>
          )}
        </div>
        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={cancelarCreacion}
            disabled={guardando || cancelando}
            className="min-w-28"
          >
            {cancelando ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <X className="mr-2 h-4 w-4" />
            )}
            {cancelando ? "Cancelando…" : "Cancelar"}
          </Button>
          <Button
            type="button"
            onClick={guardarPresupuesto}
            disabled={guardando || cancelando || bloques.every((bloque) => bloque.items.length === 0)}
            className="min-w-48"
          >
            {guardando ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            {guardando ? "Guardando presupuesto…" : "Guardar presupuesto"}
          </Button>
        </div>
      </div>

      {/* Formulario de Cliente */}
      <FormularioClienteObras
        open={showFormularioCliente}
        onClose={() => setShowFormularioCliente(false)}
        clienteExistente={null}
        onClienteGuardado={handleClienteGuardado}
      />
    </div>
  );
}


