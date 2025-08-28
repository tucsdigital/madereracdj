"use client";
import React, { useState, useEffect } from "react";
import { computeLineBase } from "@/lib/pricing";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Edit, Printer, Download, Filter, Search } from "lucide-react";
import { db } from "@/lib/firebase";
import { collection, doc, getDoc, getDocs, updateDoc, addDoc } from "firebase/firestore";
import { Icon } from "@iconify/react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SiteLogo } from "@/components/svg";

const ObraDetallePage = () => {
  const params = useParams();
  const router = useRouter();
  const { id, lang } = params;
  const [obra, setObra] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [presupuesto, setPresupuesto] = useState(null);
  const [editando, setEditando] = useState(false);
  const [docLinks, setDocLinks] = useState([]);
  const [linkInput, setLinkInput] = useState("");
  // Ledger/Movimientos de cobranza (estilo bancario)
  const [movimientos, setMovimientos] = useState([]); // {fecha, tipo, metodo, monto, nota}
  const [movDraft, setMovDraft] = useState({ fecha: "", tipo: "pago", metodo: "efectivo", monto: "", nota: "" });

  // Estados de edición de Datos Generales (solo para tipo "obra")
  const [nombreObra, setNombreObra] = useState("");
  const [tipoObra, setTipoObra] = useState("");
  const [prioridad, setPrioridad] = useState("");
  const [estadoObra, setEstadoObra] = useState("pendiente_inicio");
  const [responsable, setResponsable] = useState("");
  const [responsables, setResponsables] = useState(["Braian", "Damian", "Jonathan"]);
  const [openNuevoResponsable, setOpenNuevoResponsable] = useState(false);
  const [nuevoResponsable, setNuevoResponsable] = useState("");
  const [openPrint, setOpenPrint] = useState(false);
  const [fechasEdit, setFechasEdit] = useState({
    inicio: "",
    fin: "",
  });
  const [ubicacionEdit, setUbicacionEdit] = useState({
    direccion: "",
    localidad: "",
    provincia: "",
  });

  // Catálogo para Materiales (colección: productos)
  const [productosCatalogo, setProductosCatalogo] = useState([]);
  const [productosPorCategoria, setProductosPorCategoria] = useState({});
  const [categorias, setCategorias] = useState([]);
  const [categoriaId, setCategoriaId] = useState("");
  const [busquedaProducto, setBusquedaProducto] = useState("");
  const [busquedaDebounced, setBusquedaDebounced] = useState("");
  const [itemsCatalogo, setItemsCatalogo] = useState([]); // edición de materialesCatalogo
  const [isPendingCat, setIsPendingCat] = useState(false);

  // Catálogo para Presupuesto inicial (colección: productos_obras)
  const [productosObraCatalogo, setProductosObraCatalogo] = useState([]);
  const [productosObraPorCategoria, setProductosObraPorCategoria] = useState({});
  const [categoriasObra, setCategoriasObra] = useState([]);
  const [categoriaObraId, setCategoriaObraId] = useState("");
  const [busquedaProductoObra, setBusquedaProductoObra] = useState("");
  const [busquedaDebouncedObra, setBusquedaDebouncedObra] = useState("");
  const [itemsPresupuesto, setItemsPresupuesto] = useState([]); // edición de presupuesto.productos
  const [isPendingObra, setIsPendingObra] = useState(false);
  // Ítem manual para presupuesto durante edición
  const [manualNombrePres, setManualNombrePres] = useState("");
  const [manualPrecioPres, setManualPrecioPres] = useState("");
  // Gasto manual de obra (cuando no hay presupuesto inicial)
  const [gastoObraManual, setGastoObraManual] = useState(0);
  // Vinculación de presupuesto inicial
  const [presupuestosDisponibles, setPresupuestosDisponibles] = useState([]);
  const [presupuestoSeleccionadoId, setPresupuestoSeleccionadoId] = useState("");
  // Modo de costo para resumen (presupuesto | gasto)
  const [modoCosto, setModoCosto] = useState("gasto");

  useEffect(() => {
    const fetchObra = async () => {
      try {
        setLoading(true);
        const obraDoc = await getDoc(doc(db, "obras", id));

        if (obraDoc.exists()) {
          const data = { id: obraDoc.id, ...obraDoc.data() };
          setObra(data);
          // Inicializar estados de edición de datos generales (si es obra)
          if (data.tipo === "obra") {
            setNombreObra(data.nombreObra || "");
            setTipoObra(data.tipoObra || "");
            setPrioridad(data.prioridad || "");
            setEstadoObra(data.estado || "pendiente_inicio");
            setResponsable(data.responsable || "");
            const f = data.fechas || {};
            const today = new Date().toISOString().split("T")[0];
            setFechasEdit({
              inicio: f.inicio || today,
              fin: f.fin || today,
            });
            const u = data.ubicacion || {};
            setUbicacionEdit({
              direccion: u.direccion || "",
              localidad: u.localidad || "",
              provincia: u.provincia || "",
            });
            setItemsCatalogo(Array.isArray(data.materialesCatalogo) ? data.materialesCatalogo : []);
            setGastoObraManual(Number(data.gastoObraManual) || 0);
            setModoCosto(data.presupuestoInicialId ? "presupuesto" : "gasto");
          } else if (data.tipo === "presupuesto") {
            setEstadoObra(data.estado || "Activo");
            setItemsPresupuesto(Array.isArray(data.productos) ? data.productos : []);
          }
          // Si tiene presupuesto inicial, cargarlo
          if (data.presupuestoInicialId) {
            const presSnap = await getDoc(
              doc(db, "obras", data.presupuestoInicialId)
            );
            if (presSnap.exists())
              setPresupuesto({ id: presSnap.id, ...presSnap.data() });
          }
          // Inicializar estados de edición si existen
          const d = data.documentacion || {};
          setDocLinks(Array.isArray(d.links) ? d.links : []);

          const c = data.cobranzas || {};
          const inicial = [];
          const forma = c.formaPago || "efectivo";
          const sen = Number(c.senia) || 0;
          const mon = Number(c.monto) || 0;
          if (sen > 0) inicial.push({ fecha: c.fechaSenia || "", tipo: "seña", metodo: forma, monto: sen, nota: "Seña" });
          if (mon > 0) inicial.push({ fecha: c.fechaMonto || "", tipo: "pago", metodo: forma, monto: mon, nota: "Pago" });
          const hist = Array.isArray(c.historialPagos) ? c.historialPagos : [];
          hist.forEach((p) => {
            inicial.push({
              fecha: p.fecha || "",
              tipo: p.tipo || "pago",
              metodo: p.metodo || "efectivo",
              monto: Number(p.monto) || 0,
              nota: p.nota || "",
            });
          });
          setMovimientos(inicial);
        } else {
          setError("Obra no encontrada");
        }
      } catch (err) {
        console.error("Error al cargar la obra:", err);
        setError("Error al cargar la obra");
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      fetchObra();
    }
  }, [id]);

  // Inicializar edición de presupuesto cuando se carga
  useEffect(() => {
    if (presupuesto) {
      const prods = Array.isArray(presupuesto.productos) ? presupuesto.productos : [];
      setItemsPresupuesto(prods);
    }
  }, [presupuesto]);

  // Debounce búsquedas
  useEffect(() => {
    const t = setTimeout(() => setBusquedaDebounced(busquedaProducto), 150);
    return () => clearTimeout(t);
  }, [busquedaProducto]);
  useEffect(() => {
    const t = setTimeout(() => setBusquedaDebouncedObra(busquedaProductoObra), 150);
    return () => clearTimeout(t);
  }, [busquedaProductoObra]);

  // Cargar catálogos al entrar en modo edición
  useEffect(() => {
    async function cargarCatalogos() {
      if (!editando) return;
      // productos
      if (productosCatalogo.length === 0) {
        const snap = await getDocs(collection(db, "productos"));
        const prods = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setProductosCatalogo(prods);
        const agrup = {};
        prods.forEach((p) => {
          const cat = p.categoria || "Sin categoría";
          (agrup[cat] = agrup[cat] || []).push(p);
        });
        setProductosPorCategoria(agrup);
        setCategorias(Object.keys(agrup));
      }
      // productos_obras
      if (productosObraCatalogo.length === 0) {
        const snap2 = await getDocs(collection(db, "productos_obras"));
        const prods2 = snap2.docs.map((d) => ({ id: d.id, ...d.data() }));
        setProductosObraCatalogo(prods2);
        const agrup2 = {};
        prods2.forEach((p) => {
          const cat = p.categoria || "Sin categoría";
          (agrup2[cat] = agrup2[cat] || []).push(p);
        });
        setProductosObraPorCategoria(agrup2);
        setCategoriasObra(Object.keys(agrup2));
      }
      // presupuestos disponibles (obras tipo presupuesto)
      const snapObras = await getDocs(collection(db, "obras"));
      const lista = snapObras.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((x) => x.tipo === "presupuesto");
      setPresupuestosDisponibles(lista);
    }
    cargarCatalogos();
  }, [editando]);

  // Generar número para presupuesto nuevo
  const getNextObraNumber = async () => {
    const snap = await getDocs(collection(db, "obras"));
    let maxNum = 0;
    snap.docs.forEach((docSnap) => {
      const data = docSnap.data();
      if (data.numeroPedido && String(data.numeroPedido).startsWith("OBRA-")) {
        const num = parseInt(String(data.numeroPedido).replace("OBRA-", ""), 10);
        if (!Number.isNaN(num) && num > maxNum) maxNum = num;
      }
    });
    return `OBRA-${String(maxNum + 1).padStart(5, "0")}`;
  };

  const handleDesvincularPresupuesto = async () => {
    if (!obra) return;
    await updateDoc(doc(db, "obras", obra.id), { presupuestoInicialId: null });
    setPresupuesto(null);
    setObra((prev) => (prev ? { ...prev, presupuestoInicialId: null } : prev));
  };

  const handleVincularPresupuesto = async () => {
    if (!obra || !presupuestoSeleccionadoId) return;
    await updateDoc(doc(db, "obras", obra.id), { presupuestoInicialId: presupuestoSeleccionadoId });
    const presSnap = await getDoc(doc(db, "obras", presupuestoSeleccionadoId));
    if (presSnap.exists()) setPresupuesto({ id: presSnap.id, ...presSnap.data() });
    setObra((prev) => (prev ? { ...prev, presupuestoInicialId: presupuestoSeleccionadoId } : prev));
  };

  const handleCrearPresupuestoDesdeAqui = async () => {
    if (!obra) return;
    const numeroPedido = await getNextObraNumber();
    const nuevo = {
      tipo: "presupuesto",
      numeroPedido,
      fecha: new Date().toISOString().split("T")[0],
      clienteId: obra.clienteId || obra.cliente?.id || null,
      cliente: obra.cliente || null,
      productos: [],
      subtotal: 0,
      descuentoTotal: 0,
      total: 0,
      fechaCreacion: new Date().toISOString(),
      estado: "Activo",
    };
    const created = await addDoc(collection(db, "obras"), nuevo);
    await updateDoc(doc(db, "obras", obra.id), { presupuestoInicialId: created.id });
    const presSnap = await getDoc(doc(db, "obras", created.id));
    if (presSnap.exists()) setPresupuesto({ id: presSnap.id, ...presSnap.data() });
    setObra((prev) => (prev ? { ...prev, presupuestoInicialId: created.id } : prev));
    // refrescar lista disponibles
    setPresupuestosDisponibles((prev) => [{ id: created.id, ...nuevo }, ...prev]);
  };

  const formatearNumeroArgentino = (numero) => {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
    }).format(numero);
  };

  const formatearFecha = (fecha) => {
    if (!fecha) return "No especificada";
    return new Date(fecha).toLocaleDateString("es-AR", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const getEstadoColor = (estado) => {
    switch (estado) {
      case "pendiente":
        return "bg-yellow-100 text-yellow-800";
      case "en_progreso":
        return "bg-blue-100 text-blue-800";
      case "completada":
        return "bg-green-100 text-green-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };
  const getEstadoLabel = (estado) => {
    switch (estado) {
      case "pendiente_inicio":
        return "Pendiente de Inicio";
      case "en_ejecucion":
        return "En Ejecución";
      case "pausada":
        return "Pausada";
      case "finalizada":
        return "Finalizada";
      case "cancelada":
        return "Cancelada";
      default:
        return estado || "-";
    }
  };

  const getTipoColor = (tipo) => {
    switch (tipo) {
      case "obra":
        return "bg-orange-100 text-orange-800";
      case "presupuesto":
        return "bg-purple-100 text-purple-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const formatNumber = (n) =>
    new Intl.NumberFormat("es-AR").format(Number(n || 0));

  const productosSubtotal = React.useMemo(() => {
    const items = obra?.materialesCatalogo || [];
    return items.reduce((acc, p) => {
      const esMadera = String(p.categoria || "").toLowerCase() === "maderas";
      const isMachDeck =
        esMadera &&
        (p.subcategoria === "machimbre" || p.subcategoria === "deck");
      const base = isMachDeck
        ? Number(p.precio) || 0
        : (Number(p.precio) || 0) * (Number(p.cantidad) || 0);
      return acc + base;
    }, 0);
  }, [obra]);
  const productosDescuentoTotal = React.useMemo(() => {
    const items = obra?.materialesCatalogo || [];
    return items.reduce((acc, p) => {
      const esMadera = String(p.categoria || "").toLowerCase() === "maderas";
      const isMachDeck =
        esMadera &&
        (p.subcategoria === "machimbre" || p.subcategoria === "deck");
      const base = isMachDeck
        ? Number(p.precio) || 0
        : (Number(p.precio) || 0) * (Number(p.cantidad) || 0);
      return acc + base * ((Number(p.descuento) || 0) / 100);
    }, 0);
  }, [obra]);
  const productosTotal = React.useMemo(
    () => productosSubtotal - productosDescuentoTotal,
    [productosSubtotal, productosDescuentoTotal]
  );

  // Totales visuales en edición para materiales (obra)
  const materialesSubtotalUI = React.useMemo(() => {
    if (obra?.tipo !== "obra") return 0;
    return (itemsCatalogo || []).reduce((acc, p) => {
      const esMadera = String(p.categoria || '').toLowerCase() === 'maderas';
      const isMachDeck = esMadera && (p.subcategoria === 'machimbre' || p.subcategoria === 'deck');
      const base = isMachDeck ? (Number(p.precio) || 0) : (Number(p.precio) || 0) * (Number(p.cantidad) || 0);
      return acc + base;
    }, 0);
  }, [obra?.tipo, itemsCatalogo]);
  const materialesDescuentoUI = React.useMemo(() => {
    if (obra?.tipo !== "obra") return 0;
    return (itemsCatalogo || []).reduce((acc, p) => {
      const esMadera = String(p.categoria || '').toLowerCase() === 'maderas';
      const isMachDeck = esMadera && (p.subcategoria === 'machimbre' || p.subcategoria === 'deck');
      const base = isMachDeck ? (Number(p.precio) || 0) : (Number(p.precio) || 0) * (Number(p.cantidad) || 0);
      const desc = base * ((Number(p.descuento) || 0) / 100);
      return acc + desc;
    }, 0);
  }, [obra?.tipo, itemsCatalogo]);
  const materialesTotalUI = React.useMemo(() => materialesSubtotalUI - materialesDescuentoUI, [materialesSubtotalUI, materialesDescuentoUI]);

  // Totales visuales en edición para presupuesto (productos_obras)
  const presupuestoTotalUI = React.useMemo(() => {
    return (itemsPresupuesto || []).reduce((acc, p) => acc + (Number(p.precio || 0) * (1 - (Number(p.descuento || 0) / 100))), 0);
  }, [itemsPresupuesto]);

  // Base total para saldo (visual)
  const baseTotalVisual = React.useMemo(() => {
    if (obra?.tipo === 'obra') {
      // Elegir explícitamente según el modo seleccionado
      if (modoCosto === 'presupuesto') {
        if (!presupuesto) return 0;
        return editando ? (presupuestoTotalUI || 0) : (presupuesto.total || 0);
      }
      // gasto manual
      return editando ? (Number(gastoObraManual) || 0) : (Number(obra?.gastoObraManual) || 0);
    }
    // tipo presupuesto (documento guardado en obras)
    if (obra?.tipo === 'presupuesto') {
      return editando
        ? presupuestoTotalUI
        : (Number(obra?.total) || (Array.isArray(obra?.productos) ? obra.productos.reduce((a, p) => a + (Number(p.precio || 0) * (1 - (Number(p.descuento || 0) / 100))), 0) : 0));
    }
    return 0;
  }, [obra?.tipo, editando, presupuesto, presupuestoTotalUI, gastoObraManual, obra?.gastoObraManual, obra?.total, obra?.productos]);

  // Total movimientos (todos los pagos, señas, ajustes de cobranza positivos restan del saldo)
  const totalMovimientos = React.useMemo(() => {
    return (movimientos || []).reduce((acc, m) => acc + (Number(m.monto) || 0), 0);
  }, [movimientos]);

  // Utilidades de cálculo para Maderas (edición de materiales)
  const calcularPrecioCorteMadera = ({ alto, ancho, largo, precioPorPie, factor = 0.2734 }) => {
    if ([alto, ancho, largo, precioPorPie].some((v) => typeof v !== "number" || v <= 0)) return 0;
    const precio = factor * alto * ancho * largo * precioPorPie;
    return Math.round(precio / 100) * 100;
  };
  const calcularPrecioMachimbre = ({ alto, largo, cantidad, precioPorPie }) => {
    if ([alto, largo, cantidad, precioPorPie].some((v) => typeof v !== "number" || v <= 0)) return 0;
    const m2 = alto * largo;
    const precio = m2 * precioPorPie * cantidad;
    return Math.round(precio / 100) * 100;
  };
  const parseNumericValue = (value) => {
    if (value === "" || value === null || value === undefined) return "";
    const parsed = Number(value);
    if (Number.isNaN(parsed)) return "";
    return parsed;
  };

  // Handlers Materiales (itemsCatalogo)
  const agregarProductoCatalogo = (prod) => {
    const ya = itemsCatalogo.some((x) => x.id === prod.id);
    if (ya) return;
    const subcategoria = prod.subcategoria || prod.subCategoria || "";
    const esMadera = (prod.categoria || "").toLowerCase() === "maderas";
    const nuevoBase = {
      id: prod.id,
      nombre: prod.nombre,
      categoria: prod.categoria || "",
      subcategoria,
      unidad: prod.unidad || prod.unidadMedida || "UN",
      valorVenta: Number(prod.valorVenta) || 0,
      cantidad: 1,
      descuento: 0,
    };
    if (esMadera) {
      const alto = Number(prod.alto) || 1;
      const ancho = Number(prod.ancho) || 1;
      const largo = Number(prod.largo) || 1;
      const precioPorPie = Number(prod.precioPorPie) || 0;
      let precio = 0;
      if (subcategoria === "machimbre" || subcategoria === "deck") {
        precio = calcularPrecioMachimbre({ alto, largo, cantidad: 1, precioPorPie });
      } else {
        precio = calcularPrecioCorteMadera({ alto, ancho, largo, precioPorPie });
      }
      setItemsCatalogo((prev) => [
        ...prev,
        { ...nuevoBase, alto, ancho, largo, precioPorPie, cepilladoAplicado: false, precio },
      ]);
    } else {
      setItemsCatalogo((prev) => [...prev, { ...nuevoBase, precio: Number(prod.valorVenta) || 0 }]);
    }
  };
  const quitarProductoCatalogo = (id) => {
    setItemsCatalogo((prev) => prev.filter((p) => p.id !== id));
  };
  const actualizarCampoCatalogo = (id, campo, valor) => {
    setItemsCatalogo((prev) => prev.map((p) => {
      if (p.id !== id) return p;
      const esMadera = (p.categoria || "").toLowerCase() === "maderas";
      const updated = { ...p, [campo]: campo === "descuento" ? Number(valor) || 0 : valor === "" ? "" : Number(valor) };
      if (!esMadera) return updated;
      const subcategoria = p.subcategoria || "";
      const alto = Number(updated.alto) || 0;
      const ancho = Number(updated.ancho) || 0;
      const largo = Number(updated.largo) || 0;
      const cantidad = Number(updated.cantidad) || 1;
      const precioPorPie = Number(updated.precioPorPie) || 0;
      let base = 0;
      if (subcategoria === "machimbre" || subcategoria === "deck") {
        base = calcularPrecioMachimbre({ alto, largo, cantidad, precioPorPie });
      } else {
        base = calcularPrecioCorteMadera({ alto, ancho, largo, precioPorPie });
      }
      const final = updated.cepilladoAplicado ? base * 1.066 : base;
      return { ...updated, precio: Math.round(final / 100) * 100 };
    }));
  };
  const handleCantidadChange = (id, cantidad) => {
    const parsedCantidad = parseNumericValue(cantidad);
    setItemsCatalogo((prev) => prev.map((p) => {
      if (p.id !== id) return p;
      const esMadera = (p.categoria || "").toLowerCase() === "maderas";
      if (esMadera && (p.subcategoria === "machimbre" || p.subcategoria === "deck")) {
        const alto = Number(p.alto) || 0;
        const largo = Number(p.largo) || 0;
        const precioPorPie = Number(p.precioPorPie) || 0;
        const cant = parsedCantidad === "" ? 1 : Number(parsedCantidad) || 1;
        let base = calcularPrecioMachimbre({ alto, largo, cantidad: cant, precioPorPie });
        const final = p.cepilladoAplicado ? base * 1.066 : base;
        const precioRedondeado = Math.round(final / 100) * 100;
        return { ...p, cantidad: parsedCantidad, precio: precioRedondeado };
      }
      return { ...p, cantidad: parsedCantidad };
    }));
  };
  const handleIncrementarCantidad = (id) => {
    setItemsCatalogo((prev) => prev.map((p) => {
      if (p.id !== id) return p;
      const nuevaCantidad = Number(p.cantidad || 0) + 1;
      const esMadera = (p.categoria || "").toLowerCase() === "maderas";
      if (esMadera && (p.subcategoria === "machimbre" || p.subcategoria === "deck")) {
        const alto = Number(p.alto) || 0;
        const largo = Number(p.largo) || 0;
        const precioPorPie = Number(p.precioPorPie) || 0;
        let base = calcularPrecioMachimbre({ alto, largo, cantidad: nuevaCantidad, precioPorPie });
        const final = p.cepilladoAplicado ? base * 1.066 : base;
        const precioRedondeado = Math.round(final / 100) * 100;
        return { ...p, cantidad: nuevaCantidad, precio: precioRedondeado };
      }
      return { ...p, cantidad: nuevaCantidad };
    }));
  };
  const handleDecrementarCantidad = (id) => {
    setItemsCatalogo((prev) => prev.map((p) => {
      if (p.id !== id) return p;
      const nuevaCantidad = Math.max(1, Number(p.cantidad || 1) - 1);
      const esMadera = (p.categoria || "").toLowerCase() === "maderas";
      if (esMadera && (p.subcategoria === "machimbre" || p.subcategoria === "deck")) {
        const alto = Number(p.alto) || 0;
        const largo = Number(p.largo) || 0;
        const precioPorPie = Number(p.precioPorPie) || 0;
        let base = calcularPrecioMachimbre({ alto, largo, cantidad: nuevaCantidad, precioPorPie });
        const final = p.cepilladoAplicado ? base * 1.066 : base;
        const precioRedondeado = Math.round(final / 100) * 100;
        return { ...p, cantidad: nuevaCantidad, precio: precioRedondeado };
      }
      return { ...p, cantidad: nuevaCantidad };
    }));
  };
  const handlePrecioPorPieChange = (id, nuevo) => {
    const parsed = parseNumericValue(nuevo);
    setItemsCatalogo((prev) => prev.map((p) => {
      if (p.id !== id) return p;
      const esMadera = (p.categoria || "").toLowerCase() === "maderas";
      if (!esMadera) return { ...p, valorVenta: parsed };
      const subcategoria = p.subcategoria || "";
      const alto = Number(p.alto) || 0;
      const ancho = Number(p.ancho) || 0;
      const largo = Number(p.largo) || 0;
      const cantidad = Number(p.cantidad) || 1;
      const precioPorPie = parsed === "" ? 0 : Number(parsed) || 0;
      let base = 0;
      if (subcategoria === "machimbre" || subcategoria === "deck") {
        base = calcularPrecioMachimbre({ alto, largo, cantidad, precioPorPie });
      } else {
        base = calcularPrecioCorteMadera({ alto, ancho, largo, precioPorPie });
      }
      const final = p.cepilladoAplicado ? base * 1.066 : base;
      const precioRedondeado = Math.round(final / 100) * 100;
      return { ...p, precioPorPie: parsed, precio: precioRedondeado };
    }));
  };
  const handleAltoChange = (id, nuevo) => {
    const parsed = parseNumericValue(nuevo);
    setItemsCatalogo((prev) => prev.map((p) => {
      if (p.id !== id) return p;
      const esMadera = (p.categoria || "").toLowerCase() === "maderas";
      if (!esMadera) return p;
      const subcategoria = p.subcategoria || "";
      const alto = parsed === "" ? 0 : Number(parsed) || 0;
      const ancho = Number(p.ancho) || 0;
      const largo = Number(p.largo) || 0;
      const cantidad = Number(p.cantidad) || 1;
      const precioPorPie = Number(p.precioPorPie) || 0;
      let base = 0;
      if (subcategoria === "machimbre" || subcategoria === "deck") {
        base = calcularPrecioMachimbre({ alto, largo, cantidad, precioPorPie });
      } else {
        base = calcularPrecioCorteMadera({ alto, ancho, largo, precioPorPie });
      }
      const final = p.cepilladoAplicado ? base * 1.066 : base;
      const precioRedondeado = Math.round(final / 100) * 100;
      return { ...p, alto: parsed, precio: precioRedondeado };
    }));
  };
  const handleAnchoChange = (id, nuevo) => {
    const parsed = parseNumericValue(nuevo);
    setItemsCatalogo((prev) => prev.map((p) => {
      if (p.id !== id) return p;
      const esMadera = (p.categoria || "").toLowerCase() === "maderas";
      if (!esMadera) return p;
      const subcategoria = p.subcategoria || "";
      if (subcategoria === "machimbre" || subcategoria === "deck") {
        return { ...p, ancho: parsed };
      }
      const alto = Number(p.alto) || 0;
      const ancho = parsed === "" ? 0 : Number(parsed) || 0;
      const largo = Number(p.largo) || 0;
      const precioPorPie = Number(p.precioPorPie) || 0;
      const base = calcularPrecioCorteMadera({ alto, ancho, largo, precioPorPie });
      const final = p.cepilladoAplicado ? base * 1.066 : base;
      const precioRedondeado = Math.round(final / 100) * 100;
      return { ...p, ancho: parsed, precio: precioRedondeado };
    }));
  };
  const handleLargoChange = (id, nuevo) => {
    const parsed = parseNumericValue(nuevo);
    setItemsCatalogo((prev) => prev.map((p) => {
      if (p.id !== id) return p;
      const esMadera = (p.categoria || "").toLowerCase() === "maderas";
      if (!esMadera) return p;
      const subcategoria = p.subcategoria || "";
      const alto = Number(p.alto) || 0;
      const ancho = Number(p.ancho) || 0;
      const largo = parsed === "" ? 0 : Number(parsed) || 0;
      const cantidad = Number(p.cantidad) || 1;
      const precioPorPie = Number(p.precioPorPie) || 0;
      let base = 0;
      if (subcategoria === "machimbre" || subcategoria === "deck") {
        base = calcularPrecioMachimbre({ alto, largo, cantidad, precioPorPie });
      } else {
        base = calcularPrecioCorteMadera({ alto, ancho, largo, precioPorPie });
      }
      const final = p.cepilladoAplicado ? base * 1.066 : base;
      const precioRedondeado = Math.round(final / 100) * 100;
      return { ...p, largo: parsed, precio: precioRedondeado };
    }));
  };
  const toggleCepillado = (id, aplicar) => {
    setItemsCatalogo((prev) => prev.map((p) => {
      if (p.id !== id) return p;
      const esMadera = (p.categoria || "").toLowerCase() === "maderas";
      if (!esMadera) return p;
      const subcategoria = p.subcategoria || "";
      const alto = Number(p.alto) || 0;
      const ancho = Number(p.ancho) || 0;
      const largo = Number(p.largo) || 0;
      const cantidad = Number(p.cantidad) || 1;
      const precioPorPie = Number(p.precioPorPie) || 0;
      let base = 0;
      if (subcategoria === "machimbre" || subcategoria === "deck") {
        base = calcularPrecioMachimbre({ alto, largo, cantidad, precioPorPie });
      } else {
        base = calcularPrecioCorteMadera({ alto, ancho, largo, precioPorPie });
      }
      const final = aplicar ? base * 1.066 : base;
      const precioRedondeado = Math.round(final / 100) * 100;
      return { ...p, precio: precioRedondeado, cepilladoAplicado: aplicar };
    }));
  };

  // Handlers Presupuesto (itemsPresupuesto) usando productos_obras
  const calcularPrecioProductoObra = ({ unidadMedida, alto, largo, valorVenta, cantidad }) => {
    const u = String(unidadMedida || "").toUpperCase();
    const altoNum = Number(alto) || 0;
    const largoNum = Number(largo) || 0;
    const valorNum = Number(valorVenta) || 0;
    const cantNum = Number(cantidad) || 1;
    if (u === "M2") return Math.round(altoNum * largoNum * valorNum * cantNum);
    if (u === "ML") return Math.round(largoNum * valorNum * cantNum);
    return Math.round(valorNum * cantNum);
  };
  const agregarProductoObra = (prod) => {
    const ya = itemsPresupuesto.some((x) => x.id === prod.id);
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
    };
    nuevo.precio = calcularPrecioProductoObra({ unidadMedida, alto: nuevo.alto, largo: nuevo.largo, valorVenta: nuevo.valorVenta, cantidad: nuevo.cantidad });
    setItemsPresupuesto((prev) => [...prev, nuevo]);
  };
  const agregarProductoObraManual = () => {
    const unidadMedida = "UN";
    const nuevo = {
      id: `manual-${Date.now()}`,
      nombre: "Nuevo ítem",
      categoria: "Manual",
      subCategoria: "",
      unidadMedida,
      valorVenta: 0,
      alto: 1,
      largo: 1,
      cantidad: 1,
      descuento: 0,
      _esManual: true,
    };
    nuevo.precio = calcularPrecioProductoObra({ unidadMedida, alto: nuevo.alto, largo: nuevo.largo, valorVenta: nuevo.valorVenta, cantidad: nuevo.cantidad });
    setItemsPresupuesto((prev) => [nuevo, ...prev]);
    setManualNombrePres("");
    setManualPrecioPres("");
  };
  const actualizarNombreObraManual = (id, nombre) => {
    setItemsPresupuesto((prev) => prev.map((p) => (p.id === id ? { ...p, nombre } : p)));
  };
  const quitarProductoObra = (id) => setItemsPresupuesto((prev) => prev.filter((p) => p.id !== id));
  const actualizarCampoObra = (id, campo, valor) => {
    setItemsPresupuesto((prev) => prev.map((p) => {
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
      const alto = Number(actualizado.alto) || 0;
      const largo = Number(actualizado.largo) || 0;
      const cantidad = Number(actualizado.cantidad) || 1;
      const valorVenta = Number(actualizado.valorVenta) || 0;
      const precioBase = calcularPrecioProductoObra({ unidadMedida: actualizado.unidadMedida, alto, largo, valorVenta, cantidad });
      actualizado.precio = Math.round(precioBase);
      return actualizado;
    }));
  };

  const guardarEdicion = async () => {
    const target = doc(db, "obras", obra.id);
    const documentacion = { links: (docLinks || []).filter(Boolean) };
    // Persistimos cobranza como ledger
    const movimientosSan = (movimientos || []).map((m) => ({
      fecha: m.fecha || "",
      tipo: m.tipo || "pago",
      metodo: m.metodo || "efectivo",
      monto: Number(m.monto) || 0,
      nota: m.nota || "",
    }));

    // Recalcular totales de materiales si es obra y estamos editando itemsCatalogo
    let materialesSanitizados = Array.isArray(itemsCatalogo) ? itemsCatalogo.map((p) => {
      const esMadera = String(p.categoria || "").toLowerCase() === "maderas";
      const isMachDeck = esMadera && (p.subcategoria === "machimbre" || p.subcategoria === "deck");
      const precio = Number(p.precio) || 0;
      const cantidad = Number(p.cantidad) || 1;
      const descuento = Number(p.descuento) || 0;
      const base = isMachDeck ? precio : precio * cantidad;
      const subtotal = Math.round(base * (1 - descuento / 100));
      const item = {
        id: p.id,
        nombre: p.nombre || "",
        categoria: p.categoria || "",
        subcategoria: p.subcategoria || "",
        unidad: p.unidad || "",
        cantidad,
        descuento,
        precio,
        subtotal,
      };
      if (esMadera) {
        item.alto = Number(p.alto) || 0;
        item.ancho = Number(p.ancho) || 0;
        item.largo = Number(p.largo) || 0;
        item.precioPorPie = Number(p.precioPorPie) || 0;
        item.cepilladoAplicado = !!p.cepilladoAplicado;
      }
      return item;
    }) : [];

    const productosSubtotalEdit = materialesSanitizados.reduce((acc, p) => {
      const esMadera = String(p.categoria || '').toLowerCase() === 'maderas';
      const isMachDeck = esMadera && (p.subcategoria === 'machimbre' || p.subcategoria === 'deck');
      const base = isMachDeck ? (Number(p.precio) || 0) : (Number(p.precio) || 0) * (Number(p.cantidad) || 0);
      return acc + base;
    }, 0);
    const productosDescuentoEdit = materialesSanitizados.reduce((acc, p) => {
      const esMadera = String(p.categoria || '').toLowerCase() === 'maderas';
      const isMachDeck = esMadera && (p.subcategoria === 'machimbre' || p.subcategoria === 'deck');
      const base = isMachDeck ? (Number(p.precio) || 0) : (Number(p.precio) || 0) * (Number(p.cantidad) || 0);
      return acc + base * ((Number(p.descuento) || 0) / 100);
    }, 0);
    const productosTotalEdit = productosSubtotalEdit - productosDescuentoEdit;

    const totalPresupuestoItems = Array.isArray(itemsPresupuesto)
      ? itemsPresupuesto.reduce((acc, p) => acc + (Number(p.precio || 0) * (1 - (Number(p.descuento || 0) / 100))), 0)
      : 0;
    const totalBase =
      obra?.tipo === "obra"
        ? productosTotalEdit + (presupuesto ? totalPresupuestoItems : 0)
        : totalPresupuestoItems;

    const cobranzas = {
      historialPagos: movimientosSan,
      saldoPendiente: Math.max(0, totalBase - movimientosSan.reduce((a, b) => a + (Number(b.monto) || 0), 0)),
      updatedAt: new Date().toISOString(),
    };

    const updates = { documentacion, cobranzas };
    if (obra?.tipo === "obra") {
      Object.assign(updates, {
        nombreObra: nombreObra || "",
        tipoObra: tipoObra || "",
        prioridad: prioridad || "",
        estado: estadoObra || "pendiente_inicio",
        responsable: responsable || "",
        fechas: {
          inicio: fechasEdit.inicio || new Date().toISOString().split("T")[0],
          fin: fechasEdit.fin || new Date().toISOString().split("T")[0],
        },
        ubicacion: {
          direccion: ubicacionEdit.direccion || "",
          localidad: ubicacionEdit.localidad || "",
          provincia: ubicacionEdit.provincia || "",
        },
        materialesCatalogo: materialesSanitizados,
        productosSubtotal: Math.round(productosSubtotalEdit),
        productosDescuentoTotal: Math.round(productosDescuentoEdit),
        productosTotal: Math.round(productosTotalEdit),
        gastoObraManual: Number(gastoObraManual) || 0,
      });
    } else if (obra?.tipo === "presupuesto") {
      // Actualizar productos del presupuesto en el propio documento
      const prods = (itemsPresupuesto || []).map((p) => {
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
          subCategoria: p.subCategoria || p.subcategoria || "",
          unidadMedida: p.unidadMedida || p.unidad || "UN",
          valorVenta: Number(p.valorVenta) || 0,
          alto: altoNum,
          largo: largoNum,
          cantidad: cantNum,
          descuento: Number(p.descuento) || 0,
          precio: Number(p.precio) || 0,
          m2,
          ml,
        };
      });
      const subtotalP = prods.reduce((acc, p) => acc + (Number(p.precio) || 0), 0);
      const descuentoTotalP = prods.reduce((acc, p) => acc + (Number(p.precio) || 0) * ((Number(p.descuento) || 0) / 100), 0);
      const totalP = subtotalP - descuentoTotalP;
      Object.assign(updates, {
        estado: estadoObra || updates?.estado || "Activo",
        productos: prods,
        subtotal: Math.round(subtotalP),
        descuentoTotal: Math.round(descuentoTotalP),
        total: Math.round(totalP),
        updatedAt: new Date().toISOString(),
      });
    }

    // Asegurar consistencia: si el modo es gasto, desvincular presupuesto; si es presupuesto, conservar gasto manual como referencia pero no usarlo
    if (obra?.tipo === "obra") {
      if (modoCosto === "gasto") {
        updates.presupuestoInicialId = null;
      }
    }
    await updateDoc(target, updates);

    // Si hay presupuesto inicial y estamos editando sus productos, actualizarlo
    if (presupuesto && itemsPresupuesto.length >= 0) {
      const prods = itemsPresupuesto.map((p) => {
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
          subCategoria: p.subCategoria || p.subcategoria || "",
          unidadMedida: p.unidadMedida || p.unidad || "UN",
          valorVenta: Number(p.valorVenta) || 0,
          alto: altoNum,
          largo: largoNum,
          cantidad: cantNum,
          descuento: Number(p.descuento) || 0,
          precio: Number(p.precio) || 0,
          m2,
          ml,
        };
      });
      const subtotalP = prods.reduce((acc, p) => acc + (Number(p.precio) || 0), 0);
      const descuentoTotalP = prods.reduce((acc, p) => acc + (Number(p.precio) || 0) * ((Number(p.descuento) || 0) / 100), 0);
      const totalP = subtotalP - descuentoTotalP;
      await updateDoc(doc(db, "obras", presupuesto.id), {
        productos: prods,
        subtotal: Math.round(subtotalP),
        descuentoTotal: Math.round(descuentoTotalP),
        total: Math.round(totalP),
        updatedAt: new Date().toISOString(),
      });
      setPresupuesto((prev) => (prev ? { ...prev, productos: prods, subtotal: Math.round(subtotalP), descuentoTotal: Math.round(descuentoTotalP), total: Math.round(totalP) } : prev));
    }

    // Refrescar obra local
    setObra((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...(updates || {}) };
      if (!presupuesto) {
        next.gastoObraManual = Number(gastoObraManual) || 0;
      }
      return next;
    });
    setEditando(false);
  };

  // Función para imprimir la obra/presupuesto
  const handleImprimir = () => {
    // Crear un modal moderno con iframe para la vista previa de impresión
    setOpenPrint(true);
  };

  // Función para generar el contenido HTML de impresión
  const generarContenidoImpresion = () => {
    return `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${obra?.tipo === "presupuesto" ? "Presupuesto" : "Obra"} - ${obra?.numeroPedido || ""}</title>
        <style>
          @media print {
            body { margin: 0; padding: 20px; font-family: Arial, sans-serif; }
            .header { margin-bottom: 30px; border-bottom: 1px solid #e5e7eb; padding-bottom: 20px; }
            .logo { width: 60px; height: 60px; margin: 0 auto 20px; }
            .section { margin-bottom: 25px; }
            .section-title { font-size: 18px; font-weight: bold; margin-bottom: 15px; color: #333; }
            .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }
            .info-item { margin-bottom: 10px; }
            .info-label { font-weight: bold; color: #666; font-size: 14px; }
            .info-value { font-size: 16px; margin-top: 5px; }
            .table { width: 100%; border-collapse: collapse; margin-top: 15px; }
            .table th, .table td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            .table th { background-color: #f8f9fa; font-weight: bold; }
            .totals { margin-top: 20px; text-align: right; }
            .total-row { margin-bottom: 8px; }
            .total-label { font-weight: bold; margin-right: 20px; }
            .page-break { page-break-before: always; }
            @page { margin: 1cm; }
          }
          /* Estilos para vista previa */
          body { 
            margin: 0; 
            padding: 20px; 
            font-family: Arial, sans-serif; 
            background: white;
            color: #333;
          }
          .header { 
            margin-bottom: 30px; 
            border-bottom: 1px solid #e5e7eb; 
            padding-bottom: 20px; 
          }
          .logo { 
            width: 60px; 
            height: 60px; 
            margin: 0 auto 20px; 
          }
          .section { margin-bottom: 25px; }
          .section-title { 
            font-size: 18px; 
            font-weight: bold; 
            margin-bottom: 15px; 
            color: #333; 
          }
          .info-grid { 
            display: grid; 
            grid-template-columns: 1fr 1fr; 
            gap: 20px; 
            margin-bottom: 20px; 
          }
          .info-item { margin-bottom: 10px; }
          .info-label { 
            font-weight: bold; 
            color: #666; 
            font-size: 14px; 
          }
          .info-value { 
            font-size: 16px; 
            margin-top: 5px; 
          }
          .table { 
            width: 100%; 
            border-collapse: collapse; 
            margin-top: 15px; 
          }
          .table th, .table td { 
            border: 1px solid #ddd; 
            padding: 8px; 
            text-align: left; 
          }
          .table th { 
            background-color: #f8f9fa; 
            font-weight: bold; 
          }

        </style>
      </head>
      <body>

        
        <div class="header">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 30px;">
            <div style="flex: 1;">
              <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 15px;">
                <img src="/logo-maderera.png" alt="Logo Maderera" style="width: 60px; height: 60px; object-fit: contain;">
                <div>
                  <div style="font-size: 20px; font-weight: bold; color: #333; margin-bottom: 3px;">
                    Maderas Caballero
                  </div>
                  <div style="font-size: 16px; color: #666; margin-bottom: 3px;">
                    ${obra?.tipo === "presupuesto" ? "Presupuesto" : "Obra"} / Comprobante
                  </div>
                  <div style="font-size: 14px; color: #666;">
                    www.caballeromaderas.com
                  </div>
                </div>
              </div>
            </div>
            <div style="text-align: right; flex: 1;">
              <div style="margin-bottom: 8px;">
                <span style="font-weight: bold; color: #666;">Fecha:</span>
                <span style="margin-left: 10px; color: #333;">${new Date().toLocaleDateString('es-AR')}</span>
              </div>
              <div>
                <span style="font-weight: bold; color: #666;">N°:</span>
                <span style="margin-left: 10px; color: #333; font-size: 18px; font-weight: bold;">${obra?.numeroPedido || ""}</span>
              </div>
            </div>
          </div>
        </div>

        <div class="section">
          <div class="section-title">Información General</div>
          <div class="info-grid" style="grid-template-columns: 1fr 1fr 1fr; gap: 15px;">
            <div class="info-item">
              <div class="info-label">Cliente</div>
              <div class="info-value">${obra?.cliente?.nombre || "-"}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Email</div>
              <div class="info-value">${obra?.cliente?.email || "No especificado"}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Teléfono</div>
              <div class="info-value">${obra?.cliente?.telefono || "-"}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Dirección</div>
              <div class="info-value">${obra?.cliente?.direccion || "-"}</div>
            </div>
            ${obra?.cliente?.cuit ? `
            <div class="info-item">
              <div class="info-label">CUIT</div>
              <div class="info-value">${obra?.cliente?.cuit}</div>
            </div>
            ` : ''}
          </div>
        </div>

        ${obra?.tipo === "obra" ? `
        <div class="section">
          <div class="section-title">Detalles de la Obra</div>
          <div class="info-grid" style="grid-template-columns: 1fr 1fr 1fr; gap: 15px;">
            <div class="info-item">
              <div class="info-label">Nombre de la Obra</div>
              <div class="info-value">${obra?.nombreObra || "-"}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Tipo de Obra</div>
              <div class="info-value">${obra?.tipoObra || "-"}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Prioridad</div>
              <div class="info-value">${obra?.prioridad || "-"}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Responsable</div>
              <div class="info-value">${obra?.responsable || "-"}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Estado</div>
              <div class="info-value">${getEstadoLabel(obra?.estado) || "-"}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Fecha de Creación</div>
              <div class="info-value">${formatearFecha(obra?.fechaCreacion) || "-"}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Fecha de Inicio</div>
              <div class="info-value">${obra?.fechas?.inicio ? formatearFecha(obra.fechas.inicio) : "-"}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Fecha de Fin</div>
              <div class="info-value">${obra?.fechas?.fin ? formatearFecha(obra.fechas.fin) : "-"}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Dirección de la Obra</div>
              <div class="info-value">${obra?.ubicacion?.direccion || "-"}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Localidad</div>
              <div class="info-value">${obra?.ubicacion?.localidad || "-"}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Provincia</div>
              <div class="info-value">${obra?.ubicacion?.provincia || "-"}</div>
            </div>
          </div>
        </div>
        ` : ''}

        ${obra?.tipo === "obra" ? `
        <div class="section">
          <div class="section-title">Resumen Financiero</div>
          <div class="info-grid" style="grid-template-columns: 1fr 1fr 1fr; gap: 15px;">
            <div class="info-item">
              <div class="info-label">Base Total</div>
              <div class="info-value">${formatearNumeroArgentino(baseTotalVisual)}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Total Pagado</div>
              <div class="info-value">${formatearNumeroArgentino(totalMovimientos)}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Saldo Pendiente</div>
              <div class="info-value">${formatearNumeroArgentino(Math.max(0, baseTotalVisual - totalMovimientos))}</div>
            </div>
            ${obra?.costoEnvio && obra.costoEnvio > 0 ? `
            <div class="info-item">
              <div class="info-label">Costo de Envío</div>
              <div class="info-value">${formatearNumeroArgentino(obra.costoEnvio)}</div>
            </div>
            ` : ''}
          </div>
        </div>
        ` : ''}

        ${obra?.tipo === "obra" && obra?.materialesCatalogo && obra.materialesCatalogo.length > 0 ? `
        <div class="section">
          <div class="section-title">Materiales de la Obra</div>
          <table class="table">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Cant.</th>
                <th>Alto</th>
                <th>Largo</th>
                <th>m²/ml</th>
                <th>Valor</th>
                <th>Desc. %</th>
                <th>Subtotal</th>
              </tr>
            </thead>
            <tbody>
              ${obra.materialesCatalogo.map((p) => {
                const unidad = String(p.unidad || "UN").toUpperCase();
                const valor = Number(p.precio) || 0;
                const descuento = Number(p.descuento) || 0;
                const esMadera = String(p.categoria || "").toLowerCase() === "maderas";
                const isMachDeck = esMadera && (p.subcategoria === "machimbre" || p.subcategoria === "deck");
                const base = isMachDeck ? valor : valor * (Number(p.cantidad) || 0);
                const sub = Math.round(base * (1 - descuento / 100));
                const altoNum = Number(p.alto) || 0;
                const largoNum = Number(p.largo) || 0;
                const cantNum = Number(p.cantidad) || 1;
                let medidaValor = null;
                if (unidad === "M2") {
                  medidaValor = altoNum * largoNum * cantNum;
                } else if (unidad === "ML") {
                  medidaValor = largoNum * cantNum;
                }
                return `
                  <tr>
                    <td>
                      <div><strong>${p.nombre}</strong></div>
                    </td>
                    <td style="text-align: center;">${cantNum}</td>
                    <td style="text-align: center;">${esMadera ? altoNum : "-"}</td>
                    <td style="text-align: center;">${esMadera ? largoNum : "-"}</td>
                    <td style="text-align: center;">${medidaValor != null ? medidaValor.toLocaleString("es-AR") : "-"}</td>
                    <td style="text-align: center;">${formatearNumeroArgentino(valor)}</td>
                    <td style="text-align: center;">${descuento}</td>
                    <td style="text-align: center; font-weight: bold;">${formatearNumeroArgentino(sub)}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
        ` : ''}

        ${presupuesto && presupuesto.productos && presupuesto.productos.length > 0 ? `
        <div class="section">
          <div class="section-title">Presupuesto Inicial</div>
          <table class="table">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Cant.</th>
                <th>Alto</th>
                <th>Largo</th>
                <th>m²/ml</th>
                <th>Valor</th>
                <th>Desc. %</th>
                <th>Subtotal</th>
              </tr>
            </thead>
            <tbody>
              ${presupuesto.productos.map((p) => {
                const unidad = String(p.unidadMedida || "UN").toUpperCase();
                const valor = Number(p.valorVenta) || 0;
                const descuento = Number(p.descuento) || 0;
                const precio = Number(p.precio) || 0;
                const sub = Math.round(precio * (1 - descuento / 100));
                const altoNum = Number(p.alto) || 0;
                const largoNum = Number(p.largo) || 0;
                const cantNum = Number(p.cantidad) || 1;
                let medidaValor = null;
                if (unidad === "M2") {
                  medidaValor = altoNum * largoNum * cantNum;
                } else if (unidad === "ML") {
                  medidaValor = largoNum * cantNum;
                }
                return `
                  <tr>
                    <td>
                      <div><strong>${p.nombre}</strong></div>
                    </td>
                    <td style="text-align: center;">${cantNum}</td>
                    <td style="text-align: center;">${unidad === "M2" ? altoNum : "-"}</td>
                    <td style="text-align: center;">${unidad === "M2" || unidad === "ML" ? largoNum : "-"}</td>
                    <td style="text-align: center;">${medidaValor != null ? medidaValor.toLocaleString("es-AR") : "-"}</td>
                    <td style="text-align: center;">${formatearNumeroArgentino(valor)}</td>
                    <td style="text-align: center;">${descuento}</td>
                    <td style="text-align: right; font-weight: bold;">${formatearNumeroArgentino(sub)}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
          <div style="margin-top: 20px; text-align: right; font-size: 16px;">
            <div style="margin-bottom: 8px;">
              <span style="font-weight: bold; margin-right: 20px;">Subtotal:</span>
              <span>${formatearNumeroArgentino(presupuesto.subtotal || 0)}</span>
            </div>
            <div style="margin-bottom: 8px;">
              <span style="font-weight: bold; margin-right: 20px;">Descuento total:</span>
              <span>${formatearNumeroArgentino(presupuesto.descuentoTotal || 0)}</span>
            </div>
            <div style="font-weight: bold; font-size: 18px; color: #2563eb;">
              <span style="margin-right: 20px;">Total:</span>
              <span>${formatearNumeroArgentino(presupuesto.total || 0)}</span>
            </div>
          </div>
        </div>
        ` : ''}

        ${obra?.tipo === "presupuesto" && obra?.productos && obra.productos.length > 0 ? `
        <div class="section">
          <div class="section-title">Productos del Presupuesto</div>
          <table class="table">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Cant.</th>
                <th>Alto</th>
                <th>Largo</th>
                <th>m²/ml</th>
                <th>Valor</th>
                <th>Desc. %</th>
                <th>Subtotal</th>
              </tr>
            </thead>
            <tbody>
              ${obra.productos.map((p) => {
                const unidad = String(p.unidadMedida || "UN").toUpperCase();
                const valor = Number(p.valorVenta) || 0;
                const descuento = Number(p.descuento) || 0;
                const precio = Number(p.precio) || 0;
                const sub = Math.round(precio * (1 - descuento / 100));
                const altoNum = Number(p.alto) || 0;
                const largoNum = Number(p.largo) || 0;
                const cantNum = Number(p.cantidad) || 1;
                let medidaValor = null;
                if (unidad === "M2") {
                  medidaValor = altoNum * largoNum * cantNum;
                } else if (unidad === "ML") {
                  medidaValor = largoNum * cantNum;
                }
                return `
                  <tr>
                    <td>
                      <div><strong>${p.nombre}</strong></div>
                    </td>
                    <td style="text-align: center;">${cantNum}</td>
                    <td style="text-align: center;">${unidad === "M2" ? altoNum : "-"}</td>
                    <td style="text-align: center;">${unidad === "M2" || unidad === "ML" ? largoNum : "-"}</td>
                    <td style="text-align: center;">${medidaValor != null ? medidaValor.toLocaleString("es-AR") : "-"}</td>
                    <td style="text-align: center;">${formatearNumeroArgentino(valor)}</td>
                    <td style="text-align: center;">${descuento}</td>
                    <td style="text-align: right; font-weight: bold;">${formatearNumeroArgentino(sub)}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
          <div style="margin-top: 20px; text-align: right; font-size: 16px;">
            <div style="margin-bottom: 8px;">
              <span style="font-weight: bold; margin-right: 20px;">Subtotal:</span>
              <span>${formatearNumeroArgentino(obra.subtotal || 0)}</span>
            </div>
            <div style="margin-bottom: 8px;">
              <span style="font-weight: bold; margin-right: 20px;">Descuento total:</span>
              <span>${formatearNumeroArgentino(obra.descuentoTotal || 0)}</span>
            </div>
            <div style="font-weight: bold; font-size: 18px; color: #2563eb;">
              <span style="margin-right: 20px;">Total:</span>
              <span>${formatearNumeroArgentino(obra.total || 0)}</span>
            </div>
          </div>
        </div>
        ` : ''}

        ${obra?.tipo === "obra" && movimientos && movimientos.length > 0 ? `
        <div class="section">
          <div class="section-title">Movimientos de Cobranza</div>
          <table class="table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Tipo</th>
                <th>Método</th>
                <th>Monto</th>
                <th>Nota</th>
              </tr>
            </thead>
            <tbody>
              ${movimientos.map((m) => `
                <tr>
                  <td>${m.fecha || '-'}</td>
                  <td style="text-transform: capitalize;">${m.tipo}</td>
                  <td style="text-transform: capitalize;">${m.metodo}</td>
                  <td style="text-align: right;">${formatearNumeroArgentino(Number(m.monto || 0))}</td>
                  <td>${m.nota || '-'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        ` : ''}

        ${obra?.tipoEnvio && obra.tipoEnvio !== "retiro_local" ? `
        <div class="section">
          <div class="section-title">Información de Envío</div>
          <div class="info-grid" style="grid-template-columns: 1fr 1fr 1fr; gap: 15px;">
            <div class="info-item">
              <div class="info-label">Tipo de Envío</div>
              <div class="info-value">${obra.tipoEnvio}</div>
            </div>
            ${obra.direccionEnvio ? `
            <div class="info-item">
              <div class="info-label">Dirección de Envío</div>
              <div class="info-value">${obra.direccionEnvio}</div>
            </div>
            ` : ''}
            ${obra.localidadEnvio ? `
            <div class="info-item">
              <div class="info-label">Localidad</div>
              <div class="info-value">${obra.localidadEnvio}</div>
            </div>
            ` : ''}
            ${obra.transportista ? `
            <div class="info-item">
              <div class="info-label">Transportista</div>
              <div class="info-value">${obra.transportista}</div>
            </div>
            ` : ''}
            ${obra.fechaEntrega ? `
            <div class="info-item">
              <div class="info-label">Fecha de Entrega</div>
              <div class="info-value">${formatearFecha(obra.fechaEntrega)}</div>
            </div>
            ` : ''}
            ${obra.rangoHorario ? `
            <div class="info-item">
              <div class="info-label">Rango Horario</div>
              <div class="info-value">${obra.rangoHorario}</div>
            </div>
            ` : ''}
          </div>
        </div>
        ` : ''}

        <div class="section">
          <div class="section-title">Documentación</div>
          ${docLinks && docLinks.length > 0 ? `
          <ul style="list-style: disc; padding-left: 20px; margin: 10px 0;">
            ${docLinks.map((link) => `<li style="margin-bottom: 5px;"><a href="${link}" target="_blank">${link}</a></li>`).join('')}
          </ul>
          ` : '<p style="margin: 10px 0;">Sin documentación</p>'}
        </div>

        <div style="margin-top: 40px; text-align: center; color: #666; font-size: 14px;">
          <p>Documento generado el ${new Date().toLocaleDateString('es-AR')}</p>
        </div>
      </body>
      </html>
    `;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-gray-600">Cargando obra...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-red-600 text-lg mb-4">{error}</p>
          <Button onClick={() => router.back()}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Volver
          </Button>
        </div>
      </div>
    );
  }

  if (!obra) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-gray-600 text-lg mb-4">Obra no encontrada</p>
          <Button onClick={() => router.back()}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Volver
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            onClick={() => router.back()}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver
          </Button>
          <div className="flex items-center gap-3 ml-4">
            <SiteLogo className="w-8 h-8 text-primary" />
            <div className="text-left">
              <h1 className="text-xl font-semibold text-gray-900">
                {obra?.tipo === "presupuesto" ? "Presupuesto" : "Obra"}
              </h1>
              <p className="text-sm text-gray-600">
                {obra?.numeroPedido || "Sin número"}
              </p>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setEditando((v) => !v)}>
            {editando ? "Cancelar" : "Editar Obra"}
          </Button>
          {editando && (
            <Button onClick={guardarEdicion}>Guardar cambios</Button>
          )}
          <Button variant="outline" onClick={handleImprimir}>
            <Printer className="w-4 h-4 mr-2" />
            Imprimir
          </Button>
          <Button variant="outline" onClick={() => setOpenPrint(true)}>
            <Download className="w-4 h-4 mr-2" />
            Exportar
          </Button>
        </div>
      </div>

      {/* Información principal */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Información de la obra (incluye datos de cliente) */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Icon icon="heroicons:document-text" className="w-5 h-5" />
              Información de la{" "}
              {obra.tipo === "presupuesto" ? "Presupuesto" : "Obra"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Badge className={getTipoColor(obra.tipo)}>
                {obra.tipo === "presupuesto" ? "Presupuesto" : "Obra"}
              </Badge>
              <Badge className={getEstadoColor(obra.estado)}>
                {getEstadoLabel(obra.estado)}
              </Badge>
            </div>
            <div>
              <p className="text-sm text-gray-500">Número de Pedido</p>
              <p className="font-medium">{obra.numeroPedido}</p>
            </div>

            {/* Datos del cliente (solo visual) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500">Cliente</p>
                <p className="font-medium">{obra.cliente?.nombre || "-"}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Email</p>
                <p className="font-medium">{obra.cliente?.email || "No especificado"}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Teléfono</p>
                <p className="font-medium">{obra.cliente?.telefono || "-"}</p>
            </div>
            <div>
                <p className="text-sm text-gray-500">Dirección (cliente)</p>
                <p className="font-medium">{obra.cliente?.direccion || "-"}</p>
            </div>
            {obra.cliente?.cuit && (
              <div>
                <p className="text-sm text-gray-500">CUIT</p>
                <p className="font-medium">{obra.cliente.cuit}</p>
              </div>
            )}
            </div>

            {obra.tipo === "obra" ? (
              <>
                <div>
                  <p className="text-sm text-gray-500">Nombre de la Obra</p>
                  {editando ? (
                    <Input value={nombreObra} onChange={(e) => setNombreObra(e.target.value)} placeholder="Nombre de la obra" />
                  ) : (
                    <p className="font-medium">{obra.nombreObra || "-"}</p>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <p className="text-sm text-gray-500">Tipo de Obra</p>
                    {editando ? (
                      <Select value={tipoObra} onValueChange={setTipoObra}>
                        <SelectTrigger><SelectValue placeholder="Seleccione" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Remodelación">Remodelación</SelectItem>
                          <SelectItem value="Obra Nueva">Obra Nueva</SelectItem>
                          <SelectItem value="Mantenimiento">Mantenimiento</SelectItem>
                          <SelectItem value="Ampliación">Ampliación</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <p className="font-medium">{obra.tipoObra || "-"}</p>
                    )}
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Prioridad</p>
                    {editando ? (
                      <Select value={prioridad} onValueChange={setPrioridad}>
                        <SelectTrigger><SelectValue placeholder="Seleccione" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Alta">Alta</SelectItem>
                          <SelectItem value="Media">Media</SelectItem>
                          <SelectItem value="Baja">Baja</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <p className="font-medium">{obra.prioridad || "-"}</p>
                    )}
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Responsable</p>
                    {editando ? (
                      <div className="flex items-center gap-2">
                        <Select value={responsable} onValueChange={setResponsable}>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Seleccione responsable" />
                          </SelectTrigger>
                          <SelectContent>
                            {responsables.map((r) => (
                              <SelectItem key={r} value={r}>{r}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button variant="outline" size="sm" onClick={() => setOpenNuevoResponsable(true)}>+</Button>
                      </div>
                    ) : (
                      <p className="font-medium">{obra.responsable || "-"}</p>
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Fecha de Creación</p>
                  <p className="font-medium">{formatearFecha(obra.fechaCreacion)}</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-500">Inicio</p>
                    {editando ? (
                      <Input type="date" value={fechasEdit.inicio} onChange={(e) => setFechasEdit({ ...fechasEdit, inicio: e.target.value })} />
                    ) : (
                      <p className="font-medium">{obra.fechas?.inicio ? formatearFecha(obra.fechas.inicio) : "-"}</p>
                    )}
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Fin</p>
                    {editando ? (
                      <Input type="date" value={fechasEdit.fin} onChange={(e) => setFechasEdit({ ...fechasEdit, fin: e.target.value })} />
                    ) : (
                      <p className="font-medium">{obra.fechas?.fin ? formatearFecha(obra.fechas.fin) : "-"}</p>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <p className="text-sm text-gray-500">Dirección (obra)</p>
                    {editando ? (
                      <Input value={ubicacionEdit.direccion} onChange={(e) => setUbicacionEdit({ ...ubicacionEdit, direccion: e.target.value })} />
                    ) : (
                      <p className="font-medium">{obra.ubicacion?.direccion || "-"}</p>
                    )}
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Localidad</p>
                    {editando ? (
                      <Input value={ubicacionEdit.localidad} onChange={(e) => setUbicacionEdit({ ...ubicacionEdit, localidad: e.target.value })} />
                    ) : (
                      <p className="font-medium">{obra.ubicacion?.localidad || "-"}</p>
                    )}
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Provincia</p>
                    {editando ? (
                      <Input value={ubicacionEdit.provincia} onChange={(e) => setUbicacionEdit({ ...ubicacionEdit, provincia: e.target.value })} />
                    ) : (
                      <p className="font-medium">{obra.ubicacion?.provincia || "-"}</p>
                    )}
                  </div>
                </div>
              </>
            ) : null}

            {presupuesto && !editando && (
              <div>
                <p className="text-sm text-gray-500">Presupuesto inicial</p>
                <p className="font-medium">{presupuesto.numeroPedido || obra.presupuestoInicialId}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Resumen financiero (incluye cobranza) */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Icon icon="heroicons:currency-dollar" className="w-5 h-5" />
              Resumen Financiero
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Resumen arriba para mayor claridad */}
            {obra.tipo === "obra" && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-primary/5 border border-primary/20 rounded-lg px-4 py-3">
                <div className="text-sm">Base total<br/><span className="font-bold text-base">{formatearNumeroArgentino(baseTotalVisual)}</span></div>
                <div className="text-sm">Pagado<br/><span className="font-bold text-base">{formatearNumeroArgentino(totalMovimientos)}</span></div>
                <div className="text-sm">Saldo calc.<br/><span className="font-bold text-base text-primary">{formatearNumeroArgentino(Math.max(0, baseTotalVisual - totalMovimientos))}</span></div>
              </div>
            )}

            {/* Modo de costo: Presupuesto inicial o Gasto manual */}
            {obra.tipo === "obra" && (
              <div className="space-y-3">
                {editando && (
                  <div className="flex items-center gap-3">
                    <label className="text-sm text-gray-600">Origen del costo:</label>
                    <Select value={modoCosto} onValueChange={setModoCosto}>
                      <SelectTrigger className="w-64">
                        <SelectValue placeholder="Seleccionar" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="presupuesto">Presupuesto inicial</SelectItem>
                        <SelectItem value="gasto">Gasto de obra (manual)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {modoCosto === "presupuesto" ? (
                  presupuesto ? (
                    <div>
                      <p className="text-sm text-gray-500">Presupuesto inicial — Total</p>
                      <p className="font-medium">{formatearNumeroArgentino(editando ? (presupuestoTotalUI || 0) : (presupuesto.total || 0))}</p>
                      {editando && (
                        <div className="mt-2 flex flex-wrap items-end gap-2">
                          <Button size="sm" variant="outline" onClick={handleDesvincularPresupuesto}>Quitar presupuesto</Button>
                          <Select value={presupuestoSeleccionadoId} onValueChange={setPresupuestoSeleccionadoId}>
                            <SelectTrigger className="w-80"><SelectValue placeholder="Cambiar presupuesto" /></SelectTrigger>
                            <SelectContent>
                              {presupuestosDisponibles.map((p) => (
                                <SelectItem key={p.id} value={p.id}>{p.numeroPedido || p.id} — {p.cliente?.nombre || ""}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button size="sm" variant="outline" onClick={handleVincularPresupuesto} disabled={!presupuestoSeleccionadoId}>Vincular</Button>
                          <Button size="sm" onClick={handleCrearPresupuestoDesdeAqui}>Crear presupuesto aquí</Button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-sm text-gray-500">Presupuesto inicial</p>
                      <div className="text-xs text-default-500">Sin presupuesto inicial vinculado.</div>
                      {editando && (
                        <div className="flex flex-wrap items-end gap-2">
                          <Select value={presupuestoSeleccionadoId} onValueChange={setPresupuestoSeleccionadoId}>
                            <SelectTrigger className="w-80"><SelectValue placeholder="Vincular presupuesto existente" /></SelectTrigger>
                            <SelectContent>
                              {presupuestosDisponibles.map((p) => (
                                <SelectItem key={p.id} value={p.id}>{p.numeroPedido || p.id} — {p.cliente?.nombre || ""}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button size="sm" variant="outline" onClick={handleVincularPresupuesto} disabled={!presupuestoSeleccionadoId}>Vincular</Button>
                          <Button size="sm" onClick={handleCrearPresupuestoDesdeAqui}>Crear presupuesto aquí</Button>
                        </div>
                      )}
                    </div>
                  )
                ) : (
                  <div className="space-y-1">
                    <p className="text-sm text-gray-500">Gasto de obra (manual)</p>
                    {editando ? (
                      <Input type="number" min={0} value={gastoObraManual} onChange={(e) => setGastoObraManual(e.target.value)} className="w-full max-w-xs" />
                    ) : (
                      <p className="font-medium">{formatearNumeroArgentino(Number(obra?.gastoObraManual || 0))}</p>
                    )}
                  </div>
                )}
              </div>
            )}

            {obra.costoEnvio && obra.costoEnvio > 0 && (
              <div>
                <p className="text-sm text-gray-500">Costo de Envío</p>
                <p className="font-medium">{formatearNumeroArgentino(obra.costoEnvio)}</p>
              </div>
            )}

            {obra.tipo === "obra" && (
              <>
            <Separator />
                {/* Movimientos (cobranza) */}
                <div className="border rounded-xl p-0 overflow-hidden">
                  <div className="px-4 py-3 bg-gradient-to-r from-default-50 to-default-100 border-b text-sm font-semibold text-default-700">Movimientos</div>

                  {editando && (
                    <div className="p-4 grid grid-cols-1 md:grid-cols-5 gap-3 bg-card/60 border-b">
                      <Input type="date" value={movDraft.fecha} onChange={(e) => setMovDraft({ ...movDraft, fecha: e.target.value })} />
                      <Select value={movDraft.tipo} onValueChange={(v) => setMovDraft({ ...movDraft, tipo: v })}>
                        <SelectTrigger><SelectValue placeholder="Tipo" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pago">Pago</SelectItem>
                          <SelectItem value="seña">Seña</SelectItem>
                          <SelectItem value="ajuste">Ajuste</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select value={movDraft.metodo} onValueChange={(v) => setMovDraft({ ...movDraft, metodo: v })}>
                        <SelectTrigger><SelectValue placeholder="Método" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="efectivo">Efectivo</SelectItem>
                          <SelectItem value="transferencia">Transferencia</SelectItem>
                          <SelectItem value="tarjeta">Tarjeta</SelectItem>
                          <SelectItem value="cheque">Cheque</SelectItem>
                          <SelectItem value="otro">Otro</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input type="number" min={0} placeholder="Monto" value={movDraft.monto} onChange={(e) => setMovDraft({ ...movDraft, monto: e.target.value })} />
                      <div className="flex gap-2">
                        <Input placeholder="Nota (opcional)" value={movDraft.nota} onChange={(e) => setMovDraft({ ...movDraft, nota: e.target.value })} />
                        <Button onClick={() => { if (!movDraft.fecha || !movDraft.monto) return; setMovimientos([ ...movimientos, { ...movDraft } ]); setMovDraft({ fecha: "", tipo: "pago", metodo: "efectivo", monto: "", nota: "" }); }}>Agregar</Button>
            </div>
                    </div>
                  )}

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-default-50">
                        <tr className="border-b">
                          <th className="text-left py-2 px-3">Fecha</th>
                          <th className="text-left py-2 px-3">Tipo</th>
                          <th className="text-left py-2 px-3">Método</th>
                          <th className="text-right py-2 px-3">Monto</th>
                          <th className="text-left py-2 px-3">Nota</th>
                          {editando && <th className="text-center py-2 px-3">Acción</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {movimientos.length === 0 && (
                          <tr>
                            <td colSpan={editando ? 6 : 5} className="py-3 text-center text-gray-500">Sin movimientos</td>
                          </tr>
                        )}
                        {movimientos.map((m, i) => (
                          <tr key={i} className="border-b">
                            <td className="py-2 px-3">{m.fecha || '-'}</td>
                            <td className="py-2 px-3 capitalize">{m.tipo}</td>
                            <td className="py-2 px-3 capitalize">{m.metodo}</td>
                            <td className="py-2 px-3 text-right">{formatearNumeroArgentino(Number(m.monto || 0))}</td>
                            <td className="py-2 px-3 truncate max-w-[280px]" title={m.nota}>{m.nota || '-'}</td>
                            {editando && (
                              <td className="py-2 px-3 text-center">
                                <Button size="sm" variant="outline" onClick={() => setMovimientos(movimientos.filter((_, idx) => idx !== i))}>Quitar</Button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {obra.tipo === "obra" && (
      <div className="grid grid-cols-1 md:grid-cols-1 gap-6">
        {/* Documentación */}
        <Card>
          <CardHeader>
            <CardTitle>Documentación</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {editando && (
              <div className="flex gap-2 mb-2">
                <input
                  className="flex-1 border rounded px-3 py-2"
                  placeholder="https://"
                  value={linkInput}
                  onChange={(e) => setLinkInput(e.target.value)}
                />
                <Button
                  onClick={() => {
                    const v = linkInput.trim();
                    if (!v) return;
                    setDocLinks([...docLinks, v]);
                    setLinkInput("");
                  }}
                >
                  Agregar
                </Button>
              </div>
            )}
            <ul className="list-disc pl-6 text-sm">
              {docLinks.length === 0 && (
                <li className="text-gray-500 list-none">Sin documentación</li>
              )}
              {docLinks.map((u, i) => (
                <li key={i} className="flex justify-between items-center">
                  <a
                    href={u}
                    target="_blank"
                    className="truncate max-w-[80%] text-blue-600 underline"
                  >
                    {u}
                  </a>
                  {editando && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setDocLinks(docLinks.filter((_, idx) => idx !== i))
                      }
                    >
                      Quitar
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

      </div>
      )}
      </div>

      {/* Modal: nuevo responsable */}
      <Dialog open={openNuevoResponsable} onOpenChange={setOpenNuevoResponsable}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Agregar responsable</DialogTitle>
            <DialogDescription>Ingrese el nombre del nuevo responsable para reutilizarlo en futuras ediciones o creaciones.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Input value={nuevoResponsable} onChange={(e) => setNuevoResponsable(e.target.value)} placeholder="Nombre" />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpenNuevoResponsable(false)}>Cancelar</Button>
            <Button onClick={() => {
              const v = (nuevoResponsable || "").trim();
              if (!v) return;
              if (!responsables.includes(v)) setResponsables([...responsables, v]);
              setResponsable(v);
              setNuevoResponsable("");
              setOpenNuevoResponsable(false);
            }}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Materiales de la obra */}
      {obra.tipo === "obra" && !editando && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Icon icon="heroicons:cube" className="w-5 h-5" />
              Materiales de la Obra ({obra.materialesCatalogo?.length || 0})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Accordion type="single" collapsible className="w-full" defaultValue={null}>
              <AccordionItem value="mat-view">
                <AccordionTrigger className="px-3 py-2 bg-default-50 rounded-md">Materiales</AccordionTrigger>
                <AccordionContent>
                  <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2">Producto</th>
                    <th className="text-center py-2">Cant.</th>
                    <th className="text-center py-2">Alto</th>
                    <th className="text-center py-2">Largo</th>
                    <th className="text-center py-2">m2/ml</th>
                    <th className="text-right py-2">Valor</th>
                    <th className="text-center py-2">Desc. %</th>
                    <th className="text-right py-2">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {obra.materialesCatalogo?.map((p, index) => {
                    const unidad = String(p.unidad || "UN").toUpperCase();
                    const valor = Number(p.precio) || 0;
                    const descuento = Number(p.descuento) || 0;
                    const esMadera = String(p.categoria || "").toLowerCase() === "maderas";
                    const isMachDeck = esMadera && (p.subcategoria === "machimbre" || p.subcategoria === "deck");
                    const base = isMachDeck ? valor : valor * (Number(p.cantidad) || 0);
                    const sub = Math.round(base * (1 - descuento / 100));
                    const altoNum = Number(p.alto) || 0;
                    const largoNum = Number(p.largo) || 0;
                    const cantNum = Number(p.cantidad) || 1;
                    const medidaValor = unidad === "M2" ? p.m2 ?? altoNum * largoNum * cantNum : unidad === "ML" ? p.ml ?? largoNum * cantNum : null;
                    return (
                      <tr key={index} className="border-b">
                        <td className="py-2">
                          <div>
                            <p className="font-medium">{p.nombre}</p>
                            {p.categoria && <p className="text-xs text-gray-500">{p.categoria}</p>}
                          </div>
                        </td>
                        <td className="py-2 text-center">{cantNum}</td>
                        <td className="py-2 text-center">{esMadera ? altoNum : <span className="text-gray-400">-</span>}</td>
                        <td className="py-2 text-center">{esMadera ? largoNum : <span className="text-gray-400">-</span>}</td>
                        <td className="py-2 text-center">{medidaValor != null ? medidaValor.toLocaleString("es-AR") : <span className="text-gray-400">-</span>}</td>
                        <td className="py-2 text-right">{formatearNumeroArgentino(valor)}</td>
                        <td className="py-2 text-center">{descuento}</td>
                        <td className="py-2 text-right font-semibold">{formatearNumeroArgentino(sub)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </CardContent>
        </Card>
      )}

      {/* Edición de Materiales (solo en modo edición y tipo obra, desplegable) */}
      {obra.tipo === "obra" && editando && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Filter className="w-5 h-5" /> Editar materiales (catálogo)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Accordion type="single" collapsible className="w-full" defaultValue={null}>
              <AccordionItem value="mat-edit">
                <AccordionTrigger className="px-3 py-2 bg-default-50 rounded-md">Catálogo y seleccionados</AccordionTrigger>
                <AccordionContent>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <div className="flex bg-white rounded-lg p-1 shadow-sm border border-gray-200">
                  {categorias.map((cat) => (
                    <button key={cat} type="button" className={`rounded-full px-4 py-1 text-sm mr-2 ${categoriaId === cat ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`} onClick={() => setCategoriaId((prev) => (prev === cat ? "" : cat))}>{cat}</button>
                  ))}
                </div>
              </div>
              <div className="flex-1 relative flex items-center gap-2">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-5 w-5 text-gray-400" />
                </div>
                <input type="text" placeholder="Buscar productos..." value={busquedaProducto} onChange={(e) => setBusquedaProducto(e.target.value)} className="w-full pl-10 pr-10 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 bg-card" />
              </div>
            </div>
            <div className="max-h-150 overflow-y-auto">
              {(() => {
                const hayBusqueda = !!(busquedaDebounced && busquedaDebounced.trim() !== "");
                const fuente = hayBusqueda ? (categoriaId ? (productosPorCategoria[categoriaId] || []) : productosCatalogo) : (categoriaId ? productosPorCategoria[categoriaId] : productosCatalogo);
                if (!fuente || fuente.length === 0) return <div className="p-6 text-center text-gray-500">No hay productos</div>;
                return (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 p-4 relative">
                    {isPendingObra && (
                      <div className="absolute inset-0 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm z-10 flex items-center justify-center rounded-lg">
                        <div className="flex items-center gap-3 bg-white dark:bg-gray-700 px-4 py-3 rounded-lg shadow-lg border border-gray-200 dark:border-gray-600">
                          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Cargando productos...</span>
                        </div>
                      </div>
                    )}
                    {fuente.filter((prod) => {
                      if (!busquedaDebounced) return true;
                      const q = busquedaDebounced.toLowerCase();
                      return String(prod.nombre || "").toLowerCase().includes(q) || String(prod.unidad || prod.unidadMedida || "").toLowerCase().includes(q);
                    }).slice(0, 48).map((prod) => {
                      const yaAgregado = itemsCatalogo.some((p) => p.id === prod.id);
                      const precio = (() => {
                        if (prod.categoria === "Maderas") return Number(prod.precioPorPie) || 0;
                        if (prod.categoria === "Ferretería") return Number(prod.valorVenta) || 0;
                        return (
                          Number(prod.precioUnidad) ||
                          Number(prod.precioUnidadVenta) ||
                          Number(prod.precioUnidadHerraje) ||
                          Number(prod.precioUnidadQuimico) ||
                          Number(prod.precioUnidadHerramienta) ||
                          0
                        );
                      })();
                      const unidad = prod.unidad || prod.unidadMedida;
                      const stock = prod.stock;
                      return (
                        <div
                          key={prod.id}
                          className={`group relative dark:bg-gray-800 rounded-lg border-2 transition-all duration-200 hover:shadow-md h-full flex flex-col ${
                            yaAgregado
                              ? "border-green-200 bg-green-50 dark:bg-green-900/20 dark:border-green-700"
                              : "border-gray-200 dark:border-gray-600 hover:border-blue-300 dark:hover:border-blue-500"
                          }`}
                        >
                          <div className="p-4 flex flex-col h-full">
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-3 mb-2">
                                  <div
                                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                                      prod.categoria === "Maderas"
                                        ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
                                        : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                                    }`}
                                  >
                                    {prod.categoria === "Maderas" ? "🌲" : "🔧"}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{prod.nombre}</h4>
                                    {prod.categoria === "Maderas" && prod.tipoMadera && (
                                      <div className="flex items-center gap-1 mt-1">
                                        <span className="text-xs text-orange-600 dark:text-orange-400 font-medium">🌲 {prod.tipoMadera}</span>
                                      </div>
                                    )}
                                    {prod.categoria === "Ferretería" && prod.subCategoria && (
                                      <div className="flex items-center gap-1 mt-1">
                                        <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">🔧 {prod.subCategoria}</span>
                                      </div>
                                    )}
                                  </div>
                                  {yaAgregado && (
                                    <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
                                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg>
                                      <span className="text-xs font-medium">Agregado</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Información del producto */}
                            <div className="flex-1 space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-gray-500 dark:text-gray-400">Precio:</span>
                                <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">${formatearNumeroArgentino(precio)}</span>
                              </div>
                              {unidad && (
                                <div className="flex items-center justify-between">
                                  <span className="text-xs text-gray-500 dark:text-gray-400">Unidad:</span>
                                  <span className="text-xs text-gray-700 dark:text-gray-300">{unidad}</span>
                                </div>
                              )}
                              {stock !== undefined && (
                                <div className="flex items-center justify-between">
                                  <span className="text-xs text-gray-500 dark:text-gray-400">Stock:</span>
                                  <span className={`text-xs font-medium ${stock > 10 ? "text-green-600 dark:text-green-400" : stock > 0 ? "text-yellow-600 dark:text-yellow-400" : "text-red-600 dark:text-red-400"}`}>{stock} unidades</span>
                                </div>
                              )}
                            </div>

                            {/* Botón agregar */}
                            <div className="mt-4">
                              <button
                                onClick={() => { if (!yaAgregado) agregarProductoCatalogo(prod); }}
                                disabled={yaAgregado}
                                className={`w-full py-2 px-3 rounded-md text-sm font-medium transition-colors ${yaAgregado ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 cursor-not-allowed" : "bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"}`}
                              >
                                {yaAgregado ? "Ya agregado" : "Agregar"}
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            {/* Seleccionados */}
            {itemsCatalogo.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="p-2 text-left">Producto</th>
                      <th className="p-2 text-center">Cant.</th>
                      <th className="p-2 text-center">Cepillado</th>
                      <th className="p-2 text-right">Precio unit.</th>
                      <th className="p-2 text-center">Desc. %</th>
                      <th className="p-2 text-right">Subtotal</th>
                      <th className="p-2 text-center">Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itemsCatalogo.map((p) => {
                      const esMadera = (p.categoria || "").toLowerCase() === "maderas";
                      const sub = (Number(p.precio) || 0) * (1 - (Number(p.descuento) || 0) / 100) * (esMadera && (p.subcategoria === "machimbre" || p.subcategoria === "deck") ? 1 : Number(p.cantidad) || 1);
                      return (
                        <tr key={p.id} className="border-b">
                          <td className="p-2 align-top">
                            <div className="font-medium">{p.nombre}</div>
                            {esMadera && (
                              <div className="mt-2 flex flex-wrap items-end gap-2">
                                <div className="flex flex-col gap-0.5">
                                  <label className="text-[11px] text-orange-700">Alto</label>
                                  <Input type="number" min={0} step="0.01" value={p.alto === "" ? "" : p.alto || ""} onChange={(e) => handleAltoChange(p.id, e.target.value)} className="h-8 w-[80px]" />
                                </div>
                                {p.subcategoria !== "machimbre" && p.subcategoria !== "deck" && (
                                  <div className="flex flex-col gap-0.5">
                                    <label className="text-[11px] text-orange-700">Ancho</label>
                                    <Input type="number" min={0} step="0.01" value={p.ancho === "" ? "" : p.ancho || ""} onChange={(e) => handleAnchoChange(p.id, e.target.value)} className="h-8 w-[80px]" />
                                  </div>
                                )}
                                <div className="flex flex-col gap-0.5">
                                  <label className="text-[11px] text-orange-700">Largo</label>
                                  <Input type="number" min={0} step="0.01" value={p.largo === "" ? "" : p.largo || ""} onChange={(e) => handleLargoChange(p.id, e.target.value)} className="h-8 w-[80px]" />
                                </div>
                                <div className="flex flex-col gap-0.5">
                                  <label className="text-[11px] text-green-700">Valor</label>
                                  <Input type="number" min={0} step="0.01" value={p.precioPorPie === "" ? "" : p.precioPorPie || ""} onChange={(e) => handlePrecioPorPieChange(p.id, e.target.value)} className="h-8 w-[88px]" />
                                </div>
                              </div>
                            )}
                          </td>
                          <td className="p-2 text-center">
                            <div className="flex items-center justify-center">
                              <div className="flex items-center border rounded-lg overflow-hidden">
                                <button type="button" onClick={() => handleDecrementarCantidad(p.id)} className="px-3 py-2">-</button>
                                <input type="number" min={1} value={p.cantidad === "" ? "" : p.cantidad} onChange={(e) => handleCantidadChange(p.id, e.target.value)} className="w-16 text-center border-0 bg-transparent" />
                                <button type="button" onClick={() => handleIncrementarCantidad(p.id)} className="px-3 py-2">+</button>
                              </div>
                            </div>
                          </td>
                          <td className="p-2 text-center">
                            {esMadera ? (
                              <input type="checkbox" checked={!!p.cepilladoAplicado} onChange={(e) => toggleCepillado(p.id, e.target.checked)} className="w-4 h-4" />
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                          <td className="p-2 text-right">{formatearNumeroArgentino(p.precio || 0)}</td>
                          <td className="p-2 text-center">
                            <Input type="number" min={0} max={100} value={p.descuento === "" ? "" : p.descuento || ""} onChange={(e) => actualizarCampoCatalogo(p.id, "descuento", e.target.value)} className="w-20 mx-auto" />
                          </td>
                          <td className="p-2 text-right font-semibold">{formatearNumeroArgentino(Math.round(sub))}</td>
                          <td className="p-2 text-center"><Button variant="outline" size="sm" onClick={() => quitarProductoCatalogo(p.id)}>Quitar</Button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </CardContent>
        </Card>
      )}

      {/* Presupuesto inicial (si existe) lectura */}
      {presupuesto && !editando && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Icon icon="heroicons:document-text" className="w-5 h-5" />
              Presupuesto inicial ({presupuesto.numeroPedido})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Accordion type="single" collapsible className="w-full" defaultValue={null}>
              <AccordionItem value="presup-view">
                <AccordionTrigger className="px-3 py-2 bg-default-50 rounded-md">Productos del presupuesto</AccordionTrigger>
                <AccordionContent>
                  <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2">Producto</th>
                    <th className="text-center py-2">Unidad</th>
                    <th className="text-center py-2">Cant.</th>
                    <th className="text-center py-2">Alto</th>
                    <th className="text-center py-2">Largo</th>
                    <th className="text-center py-2">m2/ml</th>
                    <th className="text-right py-2">Valor</th>
                    <th className="text-center py-2">Desc. %</th>
                    <th className="text-right py-2">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {(presupuesto.productos || []).map((p, idx) => {
                    const unidad = String(p.unidadMedida || "UN").toUpperCase();
                    const valor = Number(p.valorVenta) || 0;
                    const descuento = Number(p.descuento) || 0;
                    const precio = Number(p.precio) || 0;
                    const sub = Math.round(precio * (1 - descuento / 100));
                    const altoNum = Number(p.alto) || 0;
                    const largoNum = Number(p.largo) || 0;
                    const cantNum = Number(p.cantidad) || 1;
                    const medidaValor = unidad === "M2" ? p.m2 ?? altoNum * largoNum * cantNum : unidad === "ML" ? p.ml ?? largoNum * cantNum : null;
                    return (
                      <tr key={idx} className="border-b">
                        <td className="py-2"><div className="font-medium">{p.nombre}</div><div className="text-xs text-gray-500">{p.categoria}</div></td>
                        <td className="py-2 text-center">{unidad}</td>
                        <td className="py-2 text-center">{cantNum}</td>
                        <td className="py-2 text-center">{unidad === "M2" ? altoNum : <span className="text-gray-400">-</span>}</td>
                        <td className="py-2 text-center">{unidad === "M2" || unidad === "ML" ? largoNum : <span className="text-gray-400">-</span>}</td>
                        <td className="py-2 text-center">{medidaValor != null ? medidaValor.toLocaleString("es-AR") : <span className="text-gray-400">-</span>}</td>
                        <td className="py-2 text-right">{formatearNumeroArgentino(valor)}</td>
                        <td className="py-2 text-center">{descuento}</td>
                        <td className="py-2 text-right font-semibold">{formatearNumeroArgentino(sub)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </CardContent>
        </Card>
      )}

      {/* Edición de Presupuesto inicial (desplegable) */}
      {presupuesto && editando && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Filter className="w-5 h-5" /> Editar Presupuesto inicial</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Accordion type="single" collapsible className="w-full" defaultValue={null}>
              <AccordionItem value="presup-edit">
                <AccordionTrigger className="px-3 py-2 bg-default-50 rounded-md">Catálogo y productos seleccionados</AccordionTrigger>
                <AccordionContent>
            <div className="flex justify-end mb-4">
              <Button variant="outline" onClick={agregarProductoObraManual}>Agregar ítem manual</Button>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <div className="flex bg-white rounded-lg p-1 shadow-sm border border-gray-200">
                  {categoriasObra.map((cat) => (
                    <button key={cat} type="button" className={`rounded-full px-4 py-1 text-sm mr-2 ${categoriaObraId === cat ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`} onClick={() => setCategoriaObraId((prev) => (prev === cat ? "" : cat))}>{cat}</button>
                  ))}
                </div>
              </div>
              <div className="flex-1 relative flex items-center gap-2">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-5 w-5 text-gray-400" />
                </div>
                <input type="text" placeholder="Buscar productos..." value={busquedaProductoObra} onChange={(e) => setBusquedaProductoObra(e.target.value)} className="w-full pl-10 pr-10 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 bg-card" />
              </div>
            </div>
            <div className="max-h-150 overflow-y-auto">
              {(() => {
                const hayBusqueda = !!(busquedaDebouncedObra && busquedaDebouncedObra.trim() !== "");
                const fuente = hayBusqueda ? (categoriaObraId ? (productosObraPorCategoria[categoriaObraId] || []) : productosObraCatalogo) : (categoriaObraId ? productosObraPorCategoria[categoriaObraId] : productosObraCatalogo);
                if (!fuente || fuente.length === 0) return <div className="p-6 text-center text-gray-500">No hay productos</div>;
                return (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 p-4 relative">
                    {isPendingCat && (
                      <div className="absolute inset-0 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm z-10 flex items-center justify-center rounded-lg">
                        <div className="flex items-center gap-3 bg-white dark:bg-gray-700 px-4 py-3 rounded-lg shadow-lg border border-gray-200 dark:border-gray-600">
                          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Cargando productos...</span>
                        </div>
                      </div>
                    )}
                    {fuente.filter((prod) => {
                      if (!busquedaDebouncedObra) return true;
                      const q = busquedaDebouncedObra.toLowerCase();
                      return String(prod.nombre || "").toLowerCase().includes(q) || String(prod.unidadMedida || "").toLowerCase().includes(q);
                    }).slice(0, 48).map((prod) => {
                      const yaAgregado = itemsPresupuesto.some((p) => p.id === prod.id);
                      const precio = Number(prod.valorVenta) || 0;
                      return (
                        <div key={prod.id} className={`group relative rounded-lg border-2 transition-all duration-200 hover:shadow-md h-full flex flex-col ${yaAgregado ? "border-green-200 bg-green-50" : "border-gray-200 hover:border-blue-300"}`}>
                          <div className="p-4 flex flex-col h-full">
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-3 mb-2">
                                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold bg-blue-100 text-blue-700`}>🏗️</div>
                                  <div className="flex-1 min-w-0">
                                    <h4 className="text-sm font-semibold truncate">{prod.nombre}</h4>
                                  </div>
                                </div>
                              </div>
                            </div>
                            <div className="flex-1 space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-gray-500">Precio:</span>
                                <span className="text-sm font-semibold">{formatearNumeroArgentino(precio)}</span>
                              </div>
                            </div>
                            <div className="mt-4">
                              <button onClick={() => { if (!yaAgregado) agregarProductoObra(prod); }} disabled={yaAgregado} className={`w-full py-2 px-3 rounded-md text-sm font-medium transition-colors ${yaAgregado ? "bg-green-100 text-green-700 cursor-not-allowed" : "bg-blue-600 text-white hover:bg-blue-700"}`}>{yaAgregado ? "Ya agregado" : "Agregar"}</button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            {/* Seleccionados */}
            {itemsPresupuesto.length > 0 && (
              <div className="overflow-x-auto">
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
                    {itemsPresupuesto.map((p) => {
                      const u = String(p.unidadMedida || "UN").toUpperCase();
                      const sub = Number(p.precio || 0) * (1 - Number(p.descuento || 0) / 100);
                      const requiereAlto = u === "M2";
                      const requiereLargo = u === "M2" || u === "ML";
                      return (
                        <tr key={p.id} className="border-b">
                          <td className="p-2"><div className="font-medium">{p._esManual ? (<Input value={p.nombre} onChange={(e) => actualizarNombreObraManual(p.id, e.target.value)} className="h-8" />) : (p.nombre)}</div><div className="text-xs text-gray-500">{p.categoria}</div></td>
                          <td className="p-2 text-center"><Input type="number" min={1} value={p.cantidad} onChange={(e) => actualizarCampoObra(p.id, "cantidad", e.target.value)} className="w-20 mx-auto" /></td>
                          <td className="p-2 text-center">{p._esManual ? (
                            <Select value={u} onValueChange={(v) => actualizarCampoObra(p.id, "unidadMedida", v)}>
                              <SelectTrigger className="w-24 mx-auto h-8"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="UN">UN</SelectItem>
                                <SelectItem value="M2">M2</SelectItem>
                                <SelectItem value="ML">ML</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (<Badge variant="outline">{u}</Badge>)}</td>
                          <td className="p-2 text-center">{requiereAlto ? (<Input type="number" min={0} step="0.01" value={p.alto} onChange={(e) => actualizarCampoObra(p.id, "alto", e.target.value)} className="w-24 mx-auto" />) : (<span className="text-gray-400">-</span>)}</td>
                          <td className="p-2 text-center">{requiereLargo ? (<Input type="number" min={0} step="0.01" value={p.largo} onChange={(e) => actualizarCampoObra(p.id, "largo", e.target.value)} className="w-24 mx-auto" />) : (<span className="text-gray-400">-</span>)}</td>
                          <td className="p-2 text-right">{p._esManual ? (
                            <div className="relative w-28 ml-auto">
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-sm text-default-500">$</span>
                              <Input type="number" min={0} step="0.01" value={p.valorVenta || 0} onChange={(e) => actualizarCampoObra(p.id, "valorVenta", e.target.value)} className="pl-5 pr-2 h-8 text-right" />
                            </div>
                          ) : (formatearNumeroArgentino(p.valorVenta || 0))}</td>
                          <td className="p-2 text-center"><Input type="number" min={0} max={100} value={p.descuento} onChange={(e) => actualizarCampoObra(p.id, "descuento", e.target.value)} className="w-20 mx-auto" /></td>
                          <td className="p-2 text-right font-semibold">{formatearNumeroArgentino(Math.round(sub))}</td>
                          <td className="p-2 text-center"><Button variant="outline" size="sm" onClick={() => quitarProductoObra(p.id)}>Quitar</Button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </CardContent>
        </Card>
      )}

      {/* Lectura/Edición para documentos tipo Presupuesto (en esta ruta) */}
      {obra.tipo === "presupuesto" && !editando && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Icon icon="heroicons:document-text" className="w-5 h-5" />
              Productos del Presupuesto ({(obra.productos || []).length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2">Producto</th>
                    <th className="text-center py-2">Unidad</th>
                    <th className="text-center py-2">Cant.</th>
                    <th className="text-center py-2">Alto</th>
                    <th className="text-center py-2">Largo</th>
                    <th className="text-right py-2">Valor</th>
                    <th className="text-center py-2">Desc. %</th>
                    <th className="text-right py-2">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {(obra.productos || []).map((p, idx) => {
                    const unidad = String(p.unidadMedida || "UN").toUpperCase();
                    const valor = Number(p.valorVenta) || 0;
                    const descuento = Number(p.descuento) || 0;
                    const precio = Number(p.precio) || 0;
                    const sub = Math.round(precio * (1 - descuento / 100));
                    const altoNum = Number(p.alto) || 0;
                    const largoNum = Number(p.largo) || 0;
                    const cantNum = Number(p.cantidad) || 1;
                    return (
                      <tr key={idx} className="border-b">
                        <td className="py-2"><div className="font-medium">{p.nombre}</div><div className="text-xs text-gray-500">{p.categoria}</div></td>
                        <td className="py-2 text-center">{unidad}</td>
                        <td className="py-2 text-center">{cantNum}</td>
                        <td className="py-2 text-center">{unidad === "M2" ? altoNum : <span className="text-gray-400">-</span>}</td>
                        <td className="py-2 text-center">{unidad === "M2" || unidad === "ML" ? largoNum : <span className="text-gray-400">-</span>}</td>
                        <td className="py-2 text-right">{formatearNumeroArgentino(valor)}</td>
                        <td className="py-2 text-center">{descuento}</td>
                        <td className="py-2 text-right font-semibold">{formatearNumeroArgentino(sub)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {obra.tipo === "presupuesto" && editando && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Filter className="w-5 h-5" /> Editar productos del Presupuesto</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-end">
              <Button variant="outline" onClick={agregarProductoObraManual}>Agregar ítem manual</Button>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <div className="flex bg-white rounded-lg p-1 shadow-sm border border-gray-200">
                  {categoriasObra.map((cat) => (
                    <button key={cat} type="button" className={`rounded-full px-4 py-1 text-sm mr-2 ${categoriaObraId === cat ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`} onClick={() => setCategoriaObraId((prev) => (prev === cat ? "" : cat))}>{cat}</button>
                  ))}
                </div>
              </div>
              <div className="flex-1 relative flex items-center gap-2">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-5 w-5 text-gray-400" />
                </div>
                <input type="text" placeholder="Buscar productos..." value={busquedaProductoObra} onChange={(e) => setBusquedaProductoObra(e.target.value)} className="w-full pl-10 pr-10 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 bg-card" />
              </div>
            </div>
            <div className="max-h-150 overflow-y-auto">
              {(() => {
                const hayBusqueda = !!(busquedaDebouncedObra && busquedaDebouncedObra.trim() !== "");
                const fuente = hayBusqueda ? (categoriaObraId ? (productosObraPorCategoria[categoriaObraId] || []) : productosObraCatalogo) : (categoriaObraId ? productosObraPorCategoria[categoriaObraId] : productosObraCatalogo);
                if (!fuente || fuente.length === 0) return <div className="p-6 text-center text-gray-500">No hay productos</div>;
                return (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 p-4">
                    {fuente.filter((prod) => {
                      if (!busquedaDebouncedObra) return true;
                      const q = busquedaDebouncedObra.toLowerCase();
                      return String(prod.nombre || "").toLowerCase().includes(q) || String(prod.unidadMedida || "").toLowerCase().includes(q);
                    }).slice(0, 48).map((prod) => {
                      const yaAgregado = itemsPresupuesto.some((p) => p.id === prod.id);
                      const precio = Number(prod.valorVenta) || 0;
                      return (
                        <div key={prod.id} className={`group relative rounded-lg border-2 transition-all duration-200 hover:shadow-md h-full flex flex-col ${yaAgregado ? "border-green-200 bg-green-50" : "border-gray-200 hover:border-blue-300"}`}>
                          <div className="p-4 flex flex-col h-full">
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-3 mb-2">
                                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold bg-blue-100 text-blue-700`}>🏗️</div>
                                  <div className="flex-1 min-w-0">
                                    <h4 className="text-sm font-semibold truncate">{prod.nombre}</h4>
                                  </div>
                                </div>
                              </div>
                            </div>
                            <div className="flex-1 space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-gray-500">Precio:</span>
                                <span className="text-sm font-semibold">{formatearNumeroArgentino(precio)}</span>
                              </div>
                            </div>
                            <div className="mt-4">
                              <button onClick={() => { if (!yaAgregado) agregarProductoObra(prod); }} disabled={yaAgregado} className={`w-full py-2 px-3 rounded-md text-sm font-medium transition-colors ${yaAgregado ? "bg-green-100 text-green-700 cursor-not-allowed" : "bg-blue-600 text-white hover:bg-blue-700"}`}>{yaAgregado ? "Ya agregado" : "Agregar"}</button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
            {itemsPresupuesto.length > 0 && (
              <div className="overflow-x-auto">
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
                    {itemsPresupuesto.map((p) => {
                      const u = String(p.unidadMedida || "UN").toUpperCase();
                      const sub = Number(p.precio || 0) * (1 - Number(p.descuento || 0) / 100);
                      const requiereAlto = u === "M2";
                      const requiereLargo = u === "M2" || u === "ML";
                      return (
                        <tr key={p.id} className="border-b">
                          <td className="p-2"><div className="font-medium">{p._esManual ? (<Input value={p.nombre} onChange={(e) => actualizarNombreObraManual(p.id, e.target.value)} className="h-8" />) : (p.nombre)}</div><div className="text-xs text-gray-500">{p.categoria}</div></td>
                          <td className="p-2 text-center"><Input type="number" min={1} value={p.cantidad} onChange={(e) => actualizarCampoObra(p.id, "cantidad", e.target.value)} className="w-20 mx-auto" /></td>
                          <td className="p-2 text-center">{p._esManual ? (
                            <Select value={u} onValueChange={(v) => actualizarCampoObra(p.id, "unidadMedida", v)}>
                              <SelectTrigger className="w-24 mx-auto h-8"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="UN">UN</SelectItem>
                                <SelectItem value="M2">M2</SelectItem>
                                <SelectItem value="ML">ML</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (<Badge variant="outline">{u}</Badge>)}</td>
                          <td className="p-2 text-center">{requiereAlto ? (<Input type="number" min={0} step="0.01" value={p.alto} onChange={(e) => actualizarCampoObra(p.id, "alto", e.target.value)} className="w-24 mx-auto" />) : (<span className="text-gray-400">-</span>)}</td>
                          <td className="p-2 text-center">{requiereLargo ? (<Input type="number" min={0} step="0.01" value={p.largo} onChange={(e) => actualizarCampoObra(p.id, "largo", e.target.value)} className="w-24 mx-auto" />) : (<span className="text-gray-400">-</span>)}</td>
                          <td className="p-2 text-right">{p._esManual ? (
                            <div className="relative w-28 ml-auto">
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-sm text-default-500">$</span>
                              <Input type="number" min={0} step="0.01" value={p.valorVenta || 0} onChange={(e) => actualizarCampoObra(p.id, "valorVenta", e.target.value)} className="pl-5 pr-2 h-8 text-right" />
                            </div>
                          ) : (formatearNumeroArgentino(p.valorVenta || 0))}</td>
                          <td className="p-2 text-center"><Input type="number" min={0} max={100} value={p.descuento} onChange={(e) => actualizarCampoObra(p.id, "descuento", e.target.value)} className="w-20 mx-auto" /></td>
                          <td className="p-2 text-right font-semibold">{formatearNumeroArgentino(Math.round(sub))}</td>
                          <td className="p-2 text-center"><Button variant="outline" size="sm" onClick={() => quitarProductoObra(p.id)}>Quitar</Button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Documentación: solo para obras (no presupuestos) */}
      {/* Información de envío si existe */}
      {obra.tipoEnvio && obra.tipoEnvio !== "retiro_local" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Icon icon="heroicons:truck" className="w-5 h-5" />
              Información de Envío
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-sm text-gray-500">Tipo de Envío</p>
              <p className="font-medium">{obra.tipoEnvio}</p>
            </div>
            {obra.direccionEnvio && (
              <div>
                <p className="text-sm text-gray-500">Dirección de Envío</p>
                <p className="font-medium">{obra.direccionEnvio}</p>
              </div>
            )}
            {obra.localidadEnvio && (
              <div>
                <p className="text-sm text-gray-500">Localidad</p>
                <p className="font-medium">{obra.localidadEnvio}</p>
              </div>
            )}
            {obra.transportista && (
              <div>
                <p className="text-sm text-gray-500">Transportista</p>
                <p className="font-medium">{obra.transportista}</p>
              </div>
            )}
            {obra.fechaEntrega && (
              <div>
                <p className="text-sm text-gray-500">Fecha de Entrega</p>
                <p className="font-medium">
                  {formatearFecha(obra.fechaEntrega)}
                </p>
              </div>
            )}
            {obra.rangoHorario && (
              <div>
                <p className="text-sm text-gray-500">Rango Horario</p>
                <p className="font-medium">{obra.rangoHorario}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Modal: Vista previa de impresión */}
      <Dialog open={openPrint} onOpenChange={setOpenPrint}>
        <DialogContent className="max-w-6xl max-h-[90vh] w-full">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Printer className="w-5 h-5" />
              Vista Previa de Impresión - {obra?.tipo === "presupuesto" ? "Presupuesto" : "Obra"}
            </DialogTitle>
            <DialogDescription>
              Revise el documento antes de imprimir. Use los botones de acción dentro del documento para imprimir o cerrar.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0">
            <iframe
              srcDoc={generarContenidoImpresion()}
              className="w-full h-[70vh] border border-gray-200 rounded-lg"
              title="Vista previa de impresión"
              sandbox="allow-scripts allow-same-origin allow-modals"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpenPrint(false)}>
              Cerrar
            </Button>
            <Button onClick={() => {
              const iframe = document.querySelector('iframe');
              if (iframe && iframe.contentWindow) {
                iframe.contentWindow.print();
              }
            }}>
              <Printer className="w-4 h-4 mr-2" />
              Imprimir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ObraDetallePage;
