"use client";
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Receipt, Plus, Edit, Trash2, Eye, Filter, Download, Calendar, TrendingUp, TrendingDown, BarChart3, X, Search, Building2, Wallet, DollarSign, AlertCircle, FileText, Settings, Loader2 } from "lucide-react";
import { Icon } from "@iconify/react";
import { Switch } from "@/components/ui/switch";
import ComprobantesPagoSection from "@/components/ventas/ComprobantesPagoSection";
import { db } from "@/lib/firebase";
import { collection, addDoc, getDocs, deleteDoc, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";
import { useAuth } from "@/provider/auth.provider";
import { Label } from "@/components/ui/label";
import { useCategoriasGastos } from "@/hooks/useCategoriasGastos";
import GestionCategorias from "@/components/gastos/GestionCategorias";
import EstadisticasCategorias from "@/components/gastos/EstadisticasCategorias";

// Estados de pago para proveedores
const estadosPago = {
  pendiente: { label: "Pendiente", color: "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/20" },
  parcial: { label: "Pagado Parcial", color: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20" },
  pagado: { label: "Pagado", color: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20" },
};

// Schema para gastos internos
const schemaInterno = yup.object().shape({
  concepto: yup.string().optional(),
  monto: yup.number().positive("El monto debe ser positivo").required("El monto es obligatorio"),
  categoria: yup.string().required("La categoría es obligatoria"),
  fecha: yup.string().required("La fecha es obligatoria"),
  observaciones: yup.string().optional(),
});

// Schema para cuentas por pagar (sin concepto ni nº comprobante)
const schemaProveedor = yup.object().shape({
  monto: yup.number().positive("El monto debe ser positivo").required("El monto es obligatorio"),
  proveedorId: yup.string().required("El proveedor es obligatorio"),
  fecha: yup.string().required("La fecha es obligatoria"),
  fechaVencimiento: yup.string().optional(),
  observaciones: yup.string().optional(),
});

// Función helper para formatear fechas
const formatFechaSegura = (fecha) => {
  if (!fecha) return "";
  try {
    if (typeof fecha === "string" && /^\d{4}-\d{2}-\d{2}$/.test(fecha)) return fecha;
    if (fecha && typeof fecha === "object" && fecha.toDate) {
      return fecha.toDate().toISOString().split("T")[0];
    }
    const dateObj = new Date(fecha);
    if (!isNaN(dateObj.getTime())) return dateObj.toISOString().split("T")[0];
    return "";
  } catch (error) {
    return "";
  }
};

const formatFechaHoraArgentina = (fecha) => {
  if (!fecha) return "-";
  let dateObj = null;
  if (typeof fecha === "string" && /^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    const [y, m, d] = fecha.split("-").map(Number);
    dateObj = new Date(y, m - 1, d, 0, 0, 0);
  } else if (fecha && typeof fecha === "object" && fecha.toDate) {
    dateObj = fecha.toDate();
  } else {
    dateObj = new Date(fecha);
  }
  if (!dateObj || isNaN(dateObj.getTime())) return "-";
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(dateObj);
};

const GastosPage = () => {
  const { user } = useAuth();
  const [vistaActiva, setVistaActiva] = useState("internos"); // internos | proveedores
  
  // Hook para categorías dinámicas
  const {
    categoriasActivas,
    loading: loadingCategorias,
    crearCategoria,
    obtenerCategoriaPorId
  } = useCategoriasGastos();
  
  // Estados para segmentación de fechas
  const hoyISO = new Date().toISOString().split("T")[0];
  const now = new Date();
  const inicioMesISO = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .split("T")[0];
  const inicioAnioISO = new Date(now.getFullYear(), 0, 1)
    .toISOString()
    .split("T")[0];
  const [fechaDesde, setFechaDesde] = useState(inicioMesISO);
  const [fechaHasta, setFechaHasta] = useState(hoyISO);
  const [rangoRapido, setRangoRapido] = useState("month");
  
  // Estados comunes
  const [gastosInternos, setGastosInternos] = useState([]);
  const [cuentasPorPagar, setCuentasPorPagar] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [movimientosSaldoAFavor, setMovimientosSaldoAFavor] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Estados para modales
  const [openInterno, setOpenInterno] = useState(false);
  const [openProveedor, setOpenProveedor] = useState(false);
  const [openPago, setOpenPago] = useState(false);
  const [openPagoGlobal, setOpenPagoGlobal] = useState(false);
  const [openHistorial, setOpenHistorial] = useState(false);
  const [openGestionCategorias, setOpenGestionCategorias] = useState(false);
  const [editando, setEditando] = useState(null);
  const [cuentaSeleccionada, setCuentaSeleccionada] = useState(null);
  const [proveedorPagoGlobal, setProveedorPagoGlobal] = useState(null);
  const [guardando, setGuardando] = useState(false);
  
  // Estado para crear categoría rápida desde el formulario
  const [creandoCategoriaRapida, setCreandoCategoriaRapida] = useState(false);
  const [nuevaCategoriaNombre, setNuevaCategoriaNombre] = useState("");
  
  // Filtros
  const [filtroInterno, setFiltroInterno] = useState("");
  const [filtroProveedor, setFiltroProveedor] = useState("");
  const [filtroEstadoPago, setFiltroEstadoPago] = useState("");
  const [filtroProveedorId, setFiltroProveedorId] = useState("");
  
  // Selector de proveedor con búsqueda
  const [busquedaProveedor, setBusquedaProveedor] = useState("");
  const [mostrarDropdownProveedor, setMostrarDropdownProveedor] = useState(false);
  const [proveedorSeleccionado, setProveedorSeleccionado] = useState(null);

  // Form para gastos internos
  const {
    register: registerInterno,
    handleSubmit: handleSubmitInterno,
    reset: resetInterno,
    setValue: setValueInterno,
    watch: watchInterno,
    formState: { errors: errorsInterno },
  } = useForm({
    resolver: yupResolver(schemaInterno),
    defaultValues: {
      concepto: "",
      monto: "",
      categoria: "varios",
      fecha: new Date().toISOString().split("T")[0],
      observaciones: "",
    },
  });

  // Form para cuentas por pagar
  const {
    register: registerProveedor,
    handleSubmit: handleSubmitProveedor,
    reset: resetProveedor,
    setValue: setValueProveedor,
    watch: watchProveedor,
    formState: { errors: errorsProveedor },
  } = useForm({
    resolver: yupResolver(schemaProveedor),
    defaultValues: {
      monto: "",
      proveedorId: "",
      fecha: new Date().toISOString().split("T")[0],
      fechaVencimiento: "",
      observaciones: "",
    },
  });

  // Helper para convertir fechas de forma segura
  const toDateSafe = useCallback((value) => {
    if (!value) return null;
    try {
      // Si es un Timestamp de Firebase
      if (value && typeof value === 'object' && 'seconds' in value && 'nanoseconds' in value) {
        const d = new Date(value.seconds * 1000);
        return isNaN(d.getTime()) ? null : d;
      }
      // Si es una instancia de Date
      if (value instanceof Date) return value;
      // Si es un string con formato ISO (incluye T)
      if (typeof value === "string" && value.includes("T")) {
        const d = new Date(value);
        return isNaN(d.getTime()) ? null : d;
      }
      // Si es un string en formato YYYY-MM-DD
      if (typeof value === "string" && value.match(/^\d{4}-\d{2}-\d{2}$/)) {
        const [y, m, d] = value.split("-").map(Number);
        if (!y || !m || !d) return null;
        const dt = new Date(y, m - 1, d);
        return isNaN(dt.getTime()) ? null : dt;
      }
      // Si es un string con otro formato de fecha, intentar parsearlo
      if (typeof value === "string") {
        const d = new Date(value);
        return isNaN(d.getTime()) ? null : d;
      }
      // Si es un número (timestamp en milisegundos)
      if (typeof value === "number") {
        const d = new Date(value);
        return isNaN(d.getTime()) ? null : d;
      }
      return null;
    } catch {
      return null;
    }
  }, []);

  // Verificar si una fecha está en el rango seleccionado
  const isInRange = useCallback(
    (dateValue) => {
      const d = toDateSafe(dateValue);
      if (!d) return false;
      const from = toDateSafe(fechaDesde);
      const to = toDateSafe(fechaHasta);
      if (!from || !to) return true;
      const d0 = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const f0 = new Date(from.getFullYear(), from.getMonth(), from.getDate());
      const t0 = new Date(
        to.getFullYear(),
        to.getMonth(),
        to.getDate(),
        23,
        59,
        59
      );
      return d0 >= f0 && d0 <= t0;
    },
    [fechaDesde, fechaHasta, toDateSafe]
  );

  // Efecto para actualizar fechas según el rango rápido
  useEffect(() => {
    const today = new Date();
    const to = today.toISOString().split("T")[0];
    let from = inicioMesISO;
    if (rangoRapido === "7d") {
      from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0];
    } else if (rangoRapido === "ytd") {
      const y = new Date().getFullYear();
      from = new Date(y, 0, 1).toISOString().split("T")[0];
    } else if (rangoRapido === "month") {
      const y = today.getFullYear();
      const m = today.getMonth();
      from = new Date(y, m, 1).toISOString().split("T")[0];
    } else if (rangoRapido === "custom") {
      // no cambia fechas
      return;
    }
    setFechaDesde(from);
    setFechaHasta(to);
  }, [rangoRapido]);

  useEffect(() => {
    setRangoRapido(vistaActiva === "internos" ? "month" : "ytd");
  }, [vistaActiva]);

  // Función para cargar datos desde Firebase (reutilizable)
  const cargarDatos = useCallback(async () => {
    try {
      setLoading(true);
      const [proveedoresSnap, gastosSnap] = await Promise.all([
        getDocs(collection(db, "proveedores")),
        getDocs(collection(db, "gastos")),
      ]);
      const proveedoresData = proveedoresSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setProveedores(proveedoresData);
      const gastosData = gastosSnap.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          fecha: formatFechaSegura(data.fecha),
          fechaVencimiento: formatFechaSegura(data.fechaVencimiento),
        };
      });
      const internos = gastosData.filter(g => g.tipo !== "proveedor");
      const proveedoresGastos = gastosData.filter(g => g.tipo === "proveedor");
      setGastosInternos(internos.sort((a, b) => new Date(b.fecha) - new Date(a.fecha)));
      setCuentasPorPagar(proveedoresGastos.sort((a, b) => new Date(b.fecha) - new Date(a.fecha)));
      try {
        const pagosProveedoresSnap = await getDocs(collection(db, "pagosProveedores"));
        const pagosProveedoresData = pagosProveedoresSnap.docs
          .map((d) => {
            const data = d.data();
            return {
              id: d.id,
              ...data,
              fecha: formatFechaSegura(data.fecha),
            };
          })
          .filter((m) => m.tipo === "saldoAFavor");
        setMovimientosSaldoAFavor(pagosProveedoresData.sort((a, b) => new Date(b.fecha) - new Date(a.fecha)));
      } catch (err) {
        setMovimientosSaldoAFavor([]);
      }
    } catch (error) {
      console.error("Error al cargar datos:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Recargar solo gastos (sin proveedores) — útil al cerrar modal de categorías
  const recargarSoloGastos = useCallback(async () => {
    try {
      const gastosSnap = await getDocs(collection(db, "gastos"));
      const gastosData = gastosSnap.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          fecha: formatFechaSegura(data.fecha),
          fechaVencimiento: formatFechaSegura(data.fechaVencimiento),
        };
      });
      const internos = gastosData.filter(g => g.tipo !== "proveedor");
      const proveedoresGastos = gastosData.filter(g => g.tipo === "proveedor");
      setGastosInternos(internos.sort((a, b) => new Date(b.fecha) - new Date(a.fecha)));
      setCuentasPorPagar(proveedoresGastos.sort((a, b) => new Date(b.fecha) - new Date(a.fecha)));
    } catch (err) {
      console.error("Error al recargar gastos:", err);
    }
  }, []);

  // Cargar datos al montar el componente
  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  // Recargar solo gastos cuando se cierra el modal de categorías (evita re-pedir proveedores)
  const prevOpenCategorias = React.useRef(false);
  useEffect(() => {
    if (prevOpenCategorias.current && !openGestionCategorias) {
      const timer = setTimeout(recargarSoloGastos, 300);
      return () => clearTimeout(timer);
    }
    prevOpenCategorias.current = openGestionCategorias;
  }, [openGestionCategorias, recargarSoloGastos]);

  // Exponer función de migración globalmente para uso en consola
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.migrarCategoriasGastos = async () => {
        try {
          // Verificar si ya existen categorías
          const snapshot = await getDocs(collection(db, "categoriasGastos"));
          
          if (!snapshot.empty) {
            console.log("⚠️ Ya existen categorías en la base de datos. No se realizará la migración.");
            console.log("Categorías existentes:", snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
            return;
          }

          console.log("🚀 Iniciando migración de categorías...");
          
          const categoriasIniciales = [
            { nombre: "Gastos Varios", color: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20", orden: 0 },
            { nombre: "Empleados", color: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20", orden: 1 },
            { nombre: "Gastos Operativos", color: "bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-500/20", orden: 2 },
            { nombre: "Viáticos", color: "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20", orden: 3 },
            { nombre: "Venta y Marketing", color: "bg-pink-500/10 text-pink-700 dark:text-pink-300 border-pink-500/20", orden: 4 },
            { nombre: "Gastos Generales", color: "bg-muted/50 text-foreground border-border/60", orden: 5 }
          ];
          
          // Crear cada categoría
          for (const categoria of categoriasIniciales) {
            const categoriaData = {
              ...categoria,
              activo: true,
              fechaCreacion: serverTimestamp(),
              fechaActualizacion: serverTimestamp(),
              creadoPor: "Sistema (Migración)"
            };
            
            const docRef = await addDoc(collection(db, "categoriasGastos"), categoriaData);
            console.log(`✅ Categoría creada: ${categoria.nombre} (ID: ${docRef.id})`);
          }
          
          console.log("✅ Migración completada exitosamente!");
          console.log("💡 Recarga la página para ver las nuevas categorías.");
        } catch (error) {
          console.error("❌ Error durante la migración:", error);
          throw error;
        }
      };
      
      console.log("💡 Función de migración disponible. Ejecuta: migrarCategoriasGastos()");
    }
  }, []);

  // Guardar gasto interno
  const onSubmitInterno = async (data) => {
    setGuardando(true);
    try {
      // Validar que la categoría existe
      const categoria = obtenerCategoriaPorId(data.categoria);
      if (!categoria) {
        alert("La categoría seleccionada no es válida");
        return;
      }

      const gastoData = {
        tipo: "interno",
        concepto: data.concepto || "", // Permite concepto vacío
        monto: Number(data.monto),
        categoria: data.categoria, // Ahora es el ID de la categoría
        categoriaNombre: categoria.nombre, // Guardamos también el nombre para consultas rápidas
        fecha: data.fecha,
        observaciones: data.observaciones || "",
        responsable: user?.email || "Usuario no identificado",
        fechaCreacion: serverTimestamp(),
        fechaActualizacion: serverTimestamp(),
      };

      if (editando) {
        await updateDoc(doc(db, "gastos", editando.id), {
          ...gastoData,
          fechaActualizacion: serverTimestamp(),
        });
      } else {
        await addDoc(collection(db, "gastos"), gastoData);
      }

      // Recargar datos para reflejar cambios dinámicamente
      await cargarDatos();

      resetInterno();
      setOpenInterno(false);
      setEditando(null);
    } catch (error) {
      console.error("Error al guardar gasto:", error);
      alert("Error al guardar el gasto: " + error.message);
    } finally {
      setGuardando(false);
    }
  };
  
  // Crear categoría rápida desde el formulario
  const handleCrearCategoriaRapida = async () => {
    if (!nuevaCategoriaNombre.trim()) {
      alert("El nombre de la categoría es obligatorio");
      return;
    }

    try {
      const nuevaCategoria = await crearCategoria({
        nombre: nuevaCategoriaNombre.trim(),
        color: "bg-muted/50 text-foreground border-border/60"
      });
      
      // Seleccionar la nueva categoría en el formulario
      setValueInterno("categoria", nuevaCategoria.id);
      setNuevaCategoriaNombre("");
      setCreandoCategoriaRapida(false);
    } catch (error) {
      alert("Error al crear categoría: " + error.message);
    }
  };

  // Guardar cuenta por pagar
  const onSubmitProveedor = async (data) => {
    setGuardando(true);
    try {
      const proveedor = proveedores.find(p => p.id === data.proveedorId);
      
      const cuentaData = {
        tipo: "proveedor",
        monto: Number(data.monto),
        montoPagado: 0,
        estadoPago: "pendiente",
        proveedorId: data.proveedorId,
        proveedor: proveedor ? {
          id: proveedor.id,
          nombre: proveedor.nombre,
          cuit: proveedor.cuit || "",
          telefono: proveedor.telefono || "",
        } : null,
        fecha: data.fecha,
        fechaVencimiento: data.fechaVencimiento || null,
        observaciones: data.observaciones || "",
        responsable: user?.email || "Usuario no identificado",
        pagos: [],
        fechaCreacion: serverTimestamp(),
        fechaActualizacion: serverTimestamp(),
      };

      if (editando) {
        await updateDoc(doc(db, "gastos", editando.id), {
          ...cuentaData,
          montoPagado: editando.montoPagado || 0,
          estadoPago: editando.estadoPago || "pendiente",
          pagos: editando.pagos || [],
          fechaActualizacion: serverTimestamp(),
        });
      } else {
        await addDoc(collection(db, "gastos"), cuentaData);
      }

      // Recargar datos para reflejar cambios dinámicamente
      await cargarDatos();

      resetProveedor();
      setOpenProveedor(false);
      setEditando(null);
      setBusquedaProveedor("");
      setProveedorSeleccionado(null);
    } catch (error) {
      console.error("Error al guardar cuenta:", error);
      alert("Error al guardar la cuenta: " + error.message);
    } finally {
      setGuardando(false);
    }
  };

  // Registrar pago
  const [montoPago, setMontoPago] = useState("");
  const [fechaPago, setFechaPago] = useState(new Date().toISOString().split("T")[0]);
  const [metodoPago, setMetodoPago] = useState("Efectivo");
  const [notasPago, setNotasPago] = useState("");
  // Pago en dólares y comprobantes (para registrar pagos en cuentas por pagar)
  const [pagoEnDolares, setPagoEnDolares] = useState(false);
  const [valorOficialDolar, setValorOficialDolar] = useState(null);
  const [comprobantesPago, setComprobantesPago] = useState([]);
  const [loadingDolar, setLoadingDolar] = useState(false);
  const [ultimaActualizacionDolar, setUltimaActualizacionDolar] = useState(null);
  const [montoPagoGlobal, setMontoPagoGlobal] = useState("");
  const [fechaPagoGlobal, setFechaPagoGlobal] = useState(new Date().toISOString().split("T")[0]);
  const [metodoPagoGlobal, setMetodoPagoGlobal] = useState("Efectivo");
  const [notasPagoGlobal, setNotasPagoGlobal] = useState("");
  const [pagoGlobalEnDolares, setPagoGlobalEnDolares] = useState(false);
  const [valorOficialDolarGlobal, setValorOficialDolarGlobal] = useState(null);
  const [comprobantesPagoGlobal, setComprobantesPagoGlobal] = useState([]);
  const [loadingDolarGlobal, setLoadingDolarGlobal] = useState(false);
  const [ultimaActualizacionDolarGlobal, setUltimaActualizacionDolarGlobal] = useState(null);

  // Editar / eliminar pagos individuales
  const [openEditarPago, setOpenEditarPago] = useState(false);
  const [pagoEdit, setPagoEdit] = useState(null); // { idx, monto, fecha, metodo, notas, pagoEnDolares, valorOficialDolar, comprobantesPago }

  const handleRegistrarPago = async () => {
    if (!cuentaSeleccionada || !montoPago || Number(montoPago) <= 0) return;
    
    setGuardando(true);
    try {
      const montoActual = Number(cuentaSeleccionada.montoPagado) || 0;
      const montoTotal = Number(cuentaSeleccionada.monto) || 0;
      const nuevoMontoPagado = montoActual + Number(montoPago);
      
      let nuevoEstado = "pendiente";
      if (nuevoMontoPagado >= montoTotal) {
        nuevoEstado = "pagado";
      } else if (nuevoMontoPagado > 0) {
        nuevoEstado = "parcial";
      }
      
      const nuevoPago = {
        monto: Number(montoPago),
        fecha: fechaPago,
        metodo: metodoPago,
        notas: notasPago,
        responsable: user?.email || "Usuario no identificado",
        fechaRegistro: new Date().toISOString(),
        pagoEnDolares: !!pagoEnDolares,
        valorOficialDolar: pagoEnDolares ? (valorOficialDolar ?? null) : null,
        comprobantes: comprobantesPago || [],
      };
      
      const pagosActualizados = [...(cuentaSeleccionada.pagos || []), nuevoPago];
      
      await updateDoc(doc(db, "gastos", cuentaSeleccionada.id), {
        montoPagado: nuevoMontoPagado,
        estadoPago: nuevoEstado,
        pagos: pagosActualizados,
        fechaActualizacion: serverTimestamp(),
      });
      
      // Recargar datos para reflejar cambios dinámicamente
      await cargarDatos();
      
      setOpenPago(false);
      setCuentaSeleccionada(null);
      setMontoPago("");
      setFechaPago(new Date().toISOString().split("T")[0]);
      setMetodoPago("Efectivo");
      setNotasPago("");
      setPagoEnDolares(false);
      setValorOficialDolar(null);
      setComprobantesPago([]);
    } catch (error) {
      console.error("Error al registrar pago:", error);
      alert("Error al registrar el pago: " + error.message);
    } finally {
      setGuardando(false);
    }
  };

  const calcularEstadoPago = (montoPagado, montoTotal) => {
    if (montoPagado >= montoTotal) return "pagado";
    if (montoPagado > 0) return "parcial";
    return "pendiente";
  };

  const limpiarEstadoPagoGlobal = () => {
    setMontoPagoGlobal("");
    setFechaPagoGlobal(new Date().toISOString().split("T")[0]);
    setMetodoPagoGlobal("Efectivo");
    setNotasPagoGlobal("");
    setPagoGlobalEnDolares(false);
    setValorOficialDolarGlobal(null);
    setComprobantesPagoGlobal([]);
  };

  const abrirPagoGlobalProveedor = (cuenta) => {
    if (!cuenta?.proveedorId) return;
    const proveedorDoc = proveedores.find((p) => p.id === cuenta.proveedorId) || null;
    const cuentasDelProveedor = cuentasPorPagar
      .filter((c) => c.proveedorId === cuenta.proveedorId)
      .sort((a, b) => new Date(a.fecha || 0) - new Date(b.fecha || 0));
    const total = cuentasDelProveedor.reduce((acc, c) => acc + (Number(c.monto) || 0), 0);
    const pagado = cuentasDelProveedor.reduce((acc, c) => acc + (Number(c.montoPagado) || 0), 0);
    const pendiente = Math.max(total - pagado, 0);
    setProveedorPagoGlobal({
      id: cuenta.proveedorId,
      nombre: cuenta.proveedor?.nombre || proveedorDoc?.nombre || "Proveedor",
      cuentas: cuentasDelProveedor,
      total,
      pagado,
      pendiente,
      saldoAFavor: Number(proveedorDoc?.saldoAFavor || 0),
    });
    setMontoPagoGlobal(pendiente > 0 ? pendiente.toString() : "");
    setOpenPagoGlobal(true);
  };

  const handleRegistrarPagoGlobal = async () => {
    if (!proveedorPagoGlobal?.id) return;
    const montoIngresado = Number(montoPagoGlobal);
    if (!Number.isFinite(montoIngresado) || montoIngresado <= 0) return;
    setGuardando(true);
    try {
      const cuentasDelProveedor = cuentasPorPagar
        .filter((c) => c.proveedorId === proveedorPagoGlobal.id)
        .sort((a, b) => new Date(a.fecha || 0) - new Date(b.fecha || 0));
      const proveedorDoc = proveedores.find((p) => p.id === proveedorPagoGlobal.id);
      const saldoFavorActual = Number(proveedorDoc?.saldoAFavor || 0);
      let restante = saldoFavorActual + montoIngresado;
      let totalAplicado = 0;

      for (const cuenta of cuentasDelProveedor) {
        const totalCuenta = Number(cuenta.monto) || 0;
        const pagadoCuenta = Number(cuenta.montoPagado) || 0;
        const pendienteCuenta = Math.max(totalCuenta - pagadoCuenta, 0);
        if (pendienteCuenta <= 0 || restante <= 0) continue;
        const montoAplicado = Math.min(restante, pendienteCuenta);
        if (montoAplicado <= 0) continue;
        const nuevoMontoPagado = pagadoCuenta + montoAplicado;
        const nuevoPago = {
          monto: montoAplicado,
          fecha: fechaPagoGlobal,
          metodo: metodoPagoGlobal,
          notas: notasPagoGlobal,
          responsable: user?.email || "Usuario no identificado",
          fechaRegistro: new Date().toISOString(),
          pagoEnDolares: !!pagoGlobalEnDolares,
          valorOficialDolar: pagoGlobalEnDolares ? (valorOficialDolarGlobal ?? null) : null,
          comprobantes: comprobantesPagoGlobal || [],
          pagoGlobalProveedor: true,
        };
        await updateDoc(doc(db, "gastos", cuenta.id), {
          montoPagado: nuevoMontoPagado,
          estadoPago: calcularEstadoPago(nuevoMontoPagado, totalCuenta),
          pagos: [...(cuenta.pagos || []), nuevoPago],
          fechaActualizacion: serverTimestamp(),
        });
        totalAplicado += montoAplicado;
        restante -= montoAplicado;
      }

      const saldoAFavorFinal = Number(restante.toFixed(2));
      const saldoAFavorGenerado = Number((saldoAFavorFinal - saldoFavorActual).toFixed(2));

      if (proveedorDoc?.id) {
        await updateDoc(doc(db, "proveedores", proveedorDoc.id), {
          saldoAFavor: saldoAFavorFinal,
          fechaActualizacion: serverTimestamp(),
        });
      }

      if (proveedorDoc?.id && saldoAFavorGenerado > 0) {
        await addDoc(collection(db, "pagosProveedores"), {
          tipo: "saldoAFavor",
          proveedorId: proveedorDoc.id,
          proveedor: {
            id: proveedorDoc.id,
            nombre: proveedorDoc.nombre || "Proveedor",
            cuit: proveedorDoc.cuit || "",
            telefono: proveedorDoc.telefono || "",
          },
          monto: saldoAFavorGenerado,
          fecha: fechaPagoGlobal,
          metodo: metodoPagoGlobal,
          notas: notasPagoGlobal,
          responsable: user?.email || "Usuario no identificado",
          fechaRegistro: new Date().toISOString(),
          pagoEnDolares: !!pagoGlobalEnDolares,
          valorOficialDolar: pagoGlobalEnDolares ? (valorOficialDolarGlobal ?? null) : null,
          comprobantes: comprobantesPagoGlobal || [],
          pagoGlobalProveedor: true,
          pagoIngresado: montoIngresado,
          aplicadoACuentas: Number(totalAplicado.toFixed(2)),
          saldoAFavorAntes: Number(saldoFavorActual.toFixed(2)),
          saldoAFavorDespues: saldoAFavorFinal,
          fechaCreacion: serverTimestamp(),
          fechaActualizacion: serverTimestamp(),
        });
      }

      await cargarDatos();
      alert(
        `Pago global registrado.\nAplicado a cuentas: $${Math.round(totalAplicado).toLocaleString("es-AR")}\nSaldo a favor: $${Math.round(Math.max(restante, 0)).toLocaleString("es-AR")}`
      );
      setOpenPagoGlobal(false);
      setProveedorPagoGlobal(null);
      limpiarEstadoPagoGlobal();
    } catch (error) {
      console.error("Error al registrar pago global:", error);
      alert("Error al registrar pago global: " + error.message);
    } finally {
      setGuardando(false);
    }
  };

  // Fetch Dólar Blue (similar a ventas) - usable cuando se registra pago en dólares
  const fetchDolarBlue = useCallback(async () => {
    setLoadingDolar(true);
    try {
      const res = await fetch("/api/dolar-blue");
      const data = await res.json();
      if (res.ok && data?.venta != null) {
        setValorOficialDolar(data.venta);
        setUltimaActualizacionDolar(data.fechaActualizacion ? new Date(data.fechaActualizacion) : new Date());
      }
    } catch (err) {
      console.warn("Error al obtener dólar blue:", err);
    } finally {
      setLoadingDolar(false);
    }
  }, []);

  const fetchDolarBlueGlobal = useCallback(async () => {
    setLoadingDolarGlobal(true);
    try {
      const res = await fetch("/api/dolar-blue");
      const data = await res.json();
      if (res.ok && data?.venta != null) {
        setValorOficialDolarGlobal(data.venta);
        setUltimaActualizacionDolarGlobal(
          data.fechaActualizacion ? new Date(data.fechaActualizacion) : new Date()
        );
      }
    } catch (err) {
      console.warn("Error al obtener dólar blue:", err);
    } finally {
      setLoadingDolarGlobal(false);
    }
  }, []);

  useEffect(() => {
    if (!openPago || !pagoEnDolares) return;
    fetchDolarBlue();
    const interval = setInterval(fetchDolarBlue, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [openPago, pagoEnDolares, fetchDolarBlue]);

  useEffect(() => {
    if (!openPagoGlobal || !pagoGlobalEnDolares) return;
    fetchDolarBlueGlobal();
    const interval = setInterval(fetchDolarBlueGlobal, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [openPagoGlobal, pagoGlobalEnDolares, fetchDolarBlueGlobal]);

  // Guardar edición de un pago existente
  const handleGuardarEdicionPago = async () => {
    if (!cuentaSeleccionada || !pagoEdit) return;
    setGuardando(true);
    try {
      const pagos = Array.isArray(cuentaSeleccionada.pagos) ? [...cuentaSeleccionada.pagos] : [];
      const idx = pagoEdit.idx;
      const pagoNuevo = {
        monto: Number(pagoEdit.monto),
        fecha: pagoEdit.fecha,
        metodo: pagoEdit.metodo,
        notas: pagoEdit.notas || "",
        responsable: pagoEdit.responsable || user?.email || "Usuario no identificado",
        fechaRegistro: pagoEdit.fechaRegistro || new Date().toISOString(),
        pagoEnDolares: !!pagoEdit.pagoEnDolares,
        valorOficialDolar: pagoEdit.pagoEnDolares ? (pagoEdit.valorOficialDolar ?? null) : null,
        comprobantes: pagoEdit.comprobantes || [],
      };

      pagos[idx] = pagoNuevo;

      const montoPagadoNuevo = pagos.reduce((s, p) => s + (Number(p.monto) || 0), 0);
      const montoTotalCuenta = Number(cuentaSeleccionada.monto) || 0;
      let nuevoEstado = "pendiente";
      if (montoPagadoNuevo >= montoTotalCuenta) nuevoEstado = "pagado";
      else if (montoPagadoNuevo > 0) nuevoEstado = "parcial";

      await updateDoc(doc(db, "gastos", cuentaSeleccionada.id), {
        pagos,
        montoPagado: montoPagadoNuevo,
        estadoPago: nuevoEstado,
        fechaActualizacion: serverTimestamp(),
      });

      await cargarDatos();
      setOpenEditarPago(false);
      setPagoEdit(null);
    } catch (err) {
      console.error("Error al guardar edición de pago:", err);
      alert("Error al guardar la edición: " + err.message);
    } finally {
      setGuardando(false);
    }
  };

  const handleEliminarPago = async (idx) => {
    if (!cuentaSeleccionada) return;
    if (!confirm("¿Eliminar este pago? Esta acción no se puede deshacer.")) return;
    setGuardando(true);
    try {
      const pagos = Array.isArray(cuentaSeleccionada.pagos) ? [...cuentaSeleccionada.pagos] : [];
      const next = pagos.filter((_, i) => i !== idx);
      const montoPagadoNuevo = next.reduce((s, p) => s + (Number(p.monto) || 0), 0);
      const montoTotalCuenta = Number(cuentaSeleccionada.monto) || 0;
      let nuevoEstado = "pendiente";
      if (montoPagadoNuevo >= montoTotalCuenta) nuevoEstado = "pagado";
      else if (montoPagadoNuevo > 0) nuevoEstado = "parcial";

      await updateDoc(doc(db, "gastos", cuentaSeleccionada.id), {
        pagos: next,
        montoPagado: montoPagadoNuevo,
        estadoPago: nuevoEstado,
        fechaActualizacion: serverTimestamp(),
      });

      await cargarDatos();
      // cerrar edición si estaba abierto sobre ese índice
      setOpenEditarPago(false);
      setPagoEdit(null);
    } catch (err) {
      console.error("Error al eliminar pago:", err);
      alert("Error al eliminar el pago: " + err.message);
    } finally {
      setGuardando(false);
    }
  };

  // Editar gasto
  const handleEditarInterno = (gasto) => {
    setEditando(gasto);
    setValueInterno("concepto", gasto.concepto);
    setValueInterno("monto", gasto.monto);
    // Si el gasto tiene categoria como ID, usarlo; si es string antiguo, buscar por nombre
    if (gasto.categoria) {
      // Verificar si es un ID válido o un nombre antiguo
      const categoria = obtenerCategoriaPorId(gasto.categoria);
      if (categoria) {
        setValueInterno("categoria", gasto.categoria);
      } else {
        // Es un nombre antiguo, buscar por nombre
        const catPorNombre = categoriasActivas.find(c => c.nombre === gasto.categoria || c.nombre === gasto.categoriaNombre);
        setValueInterno("categoria", catPorNombre?.id || categoriasActivas[0]?.id || "");
      }
    } else {
      setValueInterno("categoria", categoriasActivas[0]?.id || "");
    }
    setValueInterno("fecha", gasto.fecha);
    setValueInterno("observaciones", gasto.observaciones || "");
    setOpenInterno(true);
  };

  const handleEditarProveedor = (cuenta) => {
    setEditando(cuenta);
    setValueProveedor("monto", cuenta.monto);
    setValueProveedor("proveedorId", cuenta.proveedorId);
    setValueProveedor("fecha", cuenta.fecha);
    setValueProveedor("fechaVencimiento", cuenta.fechaVencimiento || "");
    setValueProveedor("observaciones", cuenta.observaciones || "");
    
    if (cuenta.proveedor) {
      setProveedorSeleccionado(cuenta.proveedor);
      setBusquedaProveedor(`${cuenta.proveedor.nombre} - ${cuenta.proveedor.telefono || ""}`);
    }
    
    // No mostrar dropdown al editar
    setMostrarDropdownProveedor(false);
    setOpenProveedor(true);
  };

  // Eliminar
  const handleEliminar = async (tipo, id) => {
    if (!confirm("¿Estás seguro de que quieres eliminar este registro?")) return;
    
    try {
      await deleteDoc(doc(db, "gastos", id));
      // Recargar datos para reflejar cambios dinámicamente
      await cargarDatos();
    } catch (error) {
      console.error("Error al eliminar:", error);
      alert("Error al eliminar: " + error.message);
    }
  };

  // Filtrar proveedores
  const proveedoresFiltrados = useMemo(() => {
    if (!busquedaProveedor.trim()) return proveedores;
    const busqueda = busquedaProveedor.toLowerCase();
    return proveedores.filter(p => {
      const nombre = (p.nombre || "").toLowerCase();
      const telefono = (p.telefono || "").toLowerCase();
      const cuit = (p.cuit || "").toLowerCase();
      
      // Buscar en cada campo individualmente
      return nombre.includes(busqueda) || 
             telefono.includes(busqueda) || 
             cuit.includes(busqueda) ||
             // También buscar si el texto de búsqueda contiene el nombre del proveedor
             busqueda.includes(nombre);
    });
  }, [proveedores, busquedaProveedor]);

  // Seleccionar proveedor
  const seleccionarProveedor = (proveedor) => {
    setProveedorSeleccionado(proveedor);
    setBusquedaProveedor(proveedor ? `${proveedor.nombre} - ${proveedor.telefono || ""}` : "");
    setValueProveedor("proveedorId", proveedor ? proveedor.id : "");
    setMostrarDropdownProveedor(false);
  };

  // Cerrar modales
  const cerrarModalInterno = () => {
    setOpenInterno(false);
    setEditando(null);
    resetInterno();
  };

  const cerrarModalProveedor = () => {
    setOpenProveedor(false);
    setEditando(null);
    setBusquedaProveedor("");
    setProveedorSeleccionado(null);
    setMostrarDropdownProveedor(false);
    resetProveedor();
  };

  // Filtrar gastos internos por fecha (usar fecha del gasto, no fechaCreacion)
  const gastosInternosFiltradosPorFecha = useMemo(() => {
    return gastosInternos.filter(g => {
      const fechaGasto = g.fecha; // Usar la fecha del gasto, no la fecha de creación
      return isInRange(fechaGasto);
    });
  }, [gastosInternos, isInRange]);

  // Filtrar cuentas por pagar por fecha (usar fecha de la cuenta, no fechaCreacion)
  const cuentasPorPagarFiltradasPorFecha = useMemo(() => {
    return cuentasPorPagar.filter(c => {
      const fechaCuenta = c.fecha; // Usar la fecha de la cuenta, no la fecha de creación
      return isInRange(fechaCuenta);
    });
  }, [cuentasPorPagar, isInRange]);

  const movimientosSaldoAFavorFiltradosPorFecha = useMemo(() => {
    return movimientosSaldoAFavor.filter((m) => isInRange(m.fecha));
  }, [movimientosSaldoAFavor, isInRange]);

  const detalleCuentasPorPagarFiltradasPorFecha = useMemo(() => {
    const movimientosComoItems = movimientosSaldoAFavorFiltradosPorFecha.map((m) => {
      const proveedorInfo =
        m.proveedor ||
        proveedores.find((p) => p.id === m.proveedorId) || {
          id: m.proveedorId,
          nombre: "Proveedor",
        };
      const montoMovimiento = Number(m.monto) || 0;

      return {
        id: `saldoAFavor_${m.id}`,
        movimientoSaldoAFavor: true,
        tipo: "proveedor",
        proveedorId: m.proveedorId,
        proveedor: proveedorInfo,
        monto: 0,
        montoPagado: 0,
        montoSaldoAFavor: montoMovimiento,
        estadoPago: "pagado",
        fecha: m.fecha,
        fechaVencimiento: null,
        observaciones: m.notas || "",
        responsable: m.responsable || "Usuario no identificado",
        metodo: m.metodo || "Efectivo",
        pagoEnDolares: !!m.pagoEnDolares,
        valorOficialDolar: m.valorOficialDolar ?? null,
        comprobantes: m.comprobantes || [],
      };
    });

    return [...cuentasPorPagarFiltradasPorFecha, ...movimientosComoItems].sort(
      (a, b) => new Date(b.fecha || 0) - new Date(a.fecha || 0)
    );
  }, [cuentasPorPagarFiltradasPorFecha, movimientosSaldoAFavorFiltradosPorFecha, proveedores]);

  // Calcular totales (usando datos filtrados por fecha)
  const totalesInternos = useMemo(() => {
    const total = gastosInternosFiltradosPorFecha.reduce((acc, g) => acc + (Number(g.monto) || 0), 0);
    const porCategoria = {};
    
    // Agrupar por categoría (puede ser ID o nombre antiguo)
    categoriasActivas.forEach(cat => {
      porCategoria[cat.id] = gastosInternosFiltradosPorFecha
        .filter(g => g.categoria === cat.id || g.categoriaNombre === cat.nombre || g.categoria === cat.nombre)
        .reduce((acc, g) => acc + (Number(g.monto) || 0), 0);
    });
    
    return { total, porCategoria };
  }, [gastosInternosFiltradosPorFecha, categoriasActivas]);

  const totalesProveedores = useMemo(() => {
    const total = cuentasPorPagarFiltradasPorFecha.reduce((acc, c) => acc + (Number(c.monto) || 0), 0);
    const pagado = cuentasPorPagarFiltradasPorFecha.reduce((acc, c) => acc + (Number(c.montoPagado) || 0), 0);
    const pendienteBruto = total - pagado;
    const proveedoresIds = new Set(cuentasPorPagarFiltradasPorFecha.map((c) => c.proveedorId).filter(Boolean));
    const saldoAFavor = proveedores
      .filter((p) => proveedoresIds.has(p.id))
      .reduce((acc, p) => acc + (Number(p.saldoAFavor) || 0), 0);
    const pendienteNeto = Math.max(pendienteBruto - saldoAFavor, 0);
    const porEstado = {
      pendiente: cuentasPorPagarFiltradasPorFecha.filter(c => c.estadoPago === "pendiente").length,
      parcial: cuentasPorPagarFiltradasPorFecha.filter(c => c.estadoPago === "parcial").length,
      pagado: cuentasPorPagarFiltradasPorFecha.filter(c => c.estadoPago === "pagado").length,
    };
    
    // Calcular deudas vencidas
    const vencidas = cuentasPorPagarFiltradasPorFecha.filter(c => {
      const saldo = (Number(c.monto) || 0) - (Number(c.montoPagado) || 0);
      return c.fechaVencimiento && 
             new Date(c.fechaVencimiento) < new Date() && 
             saldo > 0;
    });
    
    const montoVencido = vencidas.reduce((acc, c) => 
      acc + ((Number(c.monto) || 0) - (Number(c.montoPagado) || 0)), 0
    );
    
    return { total, pagado, pendienteBruto, saldoAFavor, pendienteNeto, porEstado, vencidas: vencidas.length, montoVencido };
  }, [cuentasPorPagarFiltradasPorFecha, proveedores]);

  // Agrupar cuentas por proveedor (usando datos filtrados por fecha)
  const cuentasPorProveedor = useMemo(() => {
    const grupos = {};
    
    cuentasPorPagarFiltradasPorFecha.forEach(cuenta => {
      const provId = cuenta.proveedorId;
      if (!grupos[provId]) {
        grupos[provId] = {
          proveedorId: provId,
          proveedor: cuenta.proveedor,
          cuentas: [],
          total: 0,
          pagado: 0,
          pendiente: 0,
        };
      }
      
      grupos[provId].cuentas.push(cuenta);
      grupos[provId].total += Number(cuenta.monto) || 0;
      grupos[provId].pagado += Number(cuenta.montoPagado) || 0;
    });
    
    Object.keys(grupos).forEach(provId => {
      const saldoAFavor = Number(proveedores.find((p) => p.id === provId)?.saldoAFavor) || 0;
      const pendienteBruto = grupos[provId].total - grupos[provId].pagado;
      grupos[provId].saldoAFavor = saldoAFavor;
      grupos[provId].pendienteBruto = pendienteBruto;
      grupos[provId].pendienteNeto = Math.max(pendienteBruto - saldoAFavor, 0);
    });
    
    return Object.values(grupos).sort((a, b) => b.pendienteNeto - a.pendienteNeto);
  }, [cuentasPorPagarFiltradasPorFecha, proveedores]);

  // Filtrar datos (aplicando filtros de búsqueda sobre los datos ya filtrados por fecha)
  const gastosInternosFiltrados = useMemo(() => {
    return gastosInternosFiltradosPorFecha.filter(g => {
      const busqueda = filtroInterno.toLowerCase();
      return (g.concepto || "").toLowerCase().includes(busqueda) ||
             (g.observaciones || "").toLowerCase().includes(busqueda);
    });
  }, [gastosInternosFiltradosPorFecha, filtroInterno]);

  const cuentasPorPagarFiltradas = useMemo(() => {
    return detalleCuentasPorPagarFiltradasPorFecha.filter(c => {
      const busqueda = filtroProveedor.toLowerCase();
      const matchBusqueda = (c.proveedor?.nombre || "").toLowerCase().includes(busqueda);
      const matchEstado = !filtroEstadoPago || c.estadoPago === filtroEstadoPago;
      const matchProveedorId = !filtroProveedorId || c.proveedorId === filtroProveedorId;
      return matchBusqueda && matchEstado && matchProveedorId;
    });
  }, [detalleCuentasPorPagarFiltradasPorFecha, filtroProveedor, filtroEstadoPago, filtroProveedorId]);

  // Exportar reporte de cuentas por pagar
  const exportarReporteCuentas = () => {
    if (cuentasPorPagarFiltradas.length === 0) {
      alert("No hay datos para exportar");
      return;
    }

    const resumenPorProveedor = cuentasPorProveedor.reduce((acc, g) => {
      if (g?.proveedorId) acc[g.proveedorId] = g;
      return acc;
    }, {});

    const datos = cuentasPorPagarFiltradas.map(c => ({
      Tipo: c.movimientoSaldoAFavor ? "Saldo a favor" : "Cuenta",
      Fecha: c.fecha,
      Proveedor: c.proveedor?.nombre || "",
      Total: c.movimientoSaldoAFavor ? "" : c.monto,
      Pagado: c.movimientoSaldoAFavor ? (Number(c.montoSaldoAFavor) || 0) : (c.montoPagado || 0),
      Saldo: c.movimientoSaldoAFavor ? 0 : (Number(c.monto) || 0) - (Number(c.montoPagado) || 0),
      "Saldo a favor (prov)": Number(resumenPorProveedor[c.proveedorId]?.saldoAFavor || 0),
      "Pendiente bruto (prov)": Number(resumenPorProveedor[c.proveedorId]?.pendienteBruto || 0),
      "Pendiente neto (prov)": Number(resumenPorProveedor[c.proveedorId]?.pendienteNeto || 0),
      Vencimiento: c.movimientoSaldoAFavor ? "" : (c.fechaVencimiento || ""),
      Estado: c.movimientoSaldoAFavor
        ? "Saldo a favor"
        : c.estadoPago === "pagado"
        ? "Pagado"
        : c.estadoPago === "parcial"
        ? "Pagado Parcial"
        : "Pendiente",
    }));

    const csv = [
      Object.keys(datos[0]).join(','),
      ...datos.map(row => Object.values(row).map(val => `"${val}"`).join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cuentas-por-pagar_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  // Componente QuickRangeButton
  const QuickRangeButton = ({ value, label, icon }) => (
    <button
      type="button"
      onClick={() => setRangoRapido(value)}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold border transition-all ${
        rangoRapido === value
          ? "bg-primary text-white border-primary shadow-sm"
          : "bg-card border-border/60 text-foreground hover:bg-muted/50"
      }`}
      aria-pressed={rangoRapido === value}
    >
      {icon ? <Icon icon={icon} className="w-3.5 h-3.5" /> : null}
      {label}
    </button>
  );

  if (loading) {
    return (
      <div className="py-8 px-2 max-w-7xl mx-auto">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Cargando datos...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="py-8 px-2 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Receipt className="w-10 h-10 text-primary" />
          <div>
            <h1 className="text-3xl font-bold mb-1">Gestión de Gastos</h1>
            <p className="text-lg text-muted-foreground">Control de gastos internos y cuentas por pagar</p>
          </div>
        </div>
      </div>

      {/* Tabs principales */}
      <Tabs value={vistaActiva} onValueChange={setVistaActiva} className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2 mb-6">
          <TabsTrigger value="internos" className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            Gastos Internos
          </TabsTrigger>
          <TabsTrigger value="proveedores" className="flex items-center gap-2">
            <Building2 className="w-4 h-4" />
            Cuentas por Pagar
          </TabsTrigger>
        </TabsList>

        {/* Selector de rango de fechas */}
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-3">
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                Filtro de Fechas
              </CardTitle>
              <div className="flex flex-wrap items-center gap-2">
                <QuickRangeButton
                  value="month"
                  label="Mes"
                  icon="heroicons:calendar-days"
                />
                <QuickRangeButton value="7d" label="7d" icon="heroicons:bolt" />
                <QuickRangeButton
                  value="ytd"
                  label="Año actual"
                  icon="heroicons:chart-pie"
                />
                <QuickRangeButton
                  value="custom"
                  label="Custom"
                  icon="heroicons:adjustments-horizontal"
                />
              </div>
            </div>
            {rangoRapido === "custom" && (
              <div className="mt-3 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground whitespace-nowrap">
                    Desde
                  </span>
                  <input
                    type="date"
                    value={fechaDesde}
                    onChange={(e) => setFechaDesde(e.target.value)}
                    className="border border-border/60 bg-background text-foreground rounded-md px-2 py-1 h-9 flex-1 sm:flex-initial w-full sm:w-auto"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground whitespace-nowrap">
                    Hasta
                  </span>
                  <input
                    type="date"
                    value={fechaHasta}
                    onChange={(e) => setFechaHasta(e.target.value)}
                    className="border border-border/60 bg-background text-foreground rounded-md px-2 py-1 h-9 flex-1 sm:flex-initial w-full sm:w-auto"
                  />
                </div>
              </div>
            )}
          </CardHeader>
        </Card>


        {/* Vista de Gastos Internos */}
        <TabsContent value="internos" className="space-y-6">
          {/* Dashboard de gastos internos */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Total principal */}
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-muted-foreground uppercase tracking-wide">Total Gastos Internos</div>
                    <div className="text-4xl font-bold text-red-600">
                      ${totalesInternos.total.toLocaleString("es-AR")}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {gastosInternosFiltradosPorFecha.length} registros en el período
                    </div>
                  </div>
                  <TrendingDown className="w-12 h-12 text-red-500" />
                </div>
              </CardContent>
            </Card>
            
            {/* Por categoría */}
            {categoriasActivas.map((cat) => {
              const totalCategoria = totalesInternos.porCategoria[cat.id] || 0;
              const cantidadGastos = gastosInternosFiltradosPorFecha.filter(
                g => g.categoria === cat.id || g.categoriaNombre === cat.nombre || g.categoria === cat.nombre
              ).length;
              
              // Solo mostrar categorías que tienen gastos en el período
              if (cantidadGastos === 0) return null;
              
              return (
                <Card key={cat.id}>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm text-muted-foreground">{cat.nombre}</div>
                        <div className="text-2xl font-bold">${totalCategoria.toLocaleString("es-AR")}</div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {cantidadGastos} gasto{cantidadGastos !== 1 ? 's' : ''}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Estadísticas y gráficos por categoría */}
          <EstadisticasCategorias
            gastosInternos={gastosInternosFiltradosPorFecha}
            categoriasActivas={categoriasActivas}
            fechaDesde={fechaDesde}
            fechaHasta={fechaHasta}
          />

          {/* Tabla gastos internos */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Gastos Internos</CardTitle>
              <div className="flex gap-2">
                <Input 
                  placeholder="Buscar..." 
                  value={filtroInterno} 
                  onChange={e => setFiltroInterno(e.target.value)} 
                  className="w-56" 
                />
                <Button 
                  variant="outline" 
                  onClick={() => setOpenGestionCategorias(true)}
                  title="Gestionar categorías"
                >
                  <Settings className="w-4 h-4 mr-1" />
                  Categorías
                </Button>
                <Button onClick={() => setOpenInterno(true)}>
                  <Plus className="w-4 h-4 mr-1" />
                  Nuevo Gasto
                </Button>
              </div>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Concepto</TableHead>
                    <TableHead>Categoría</TableHead>
                    <TableHead>Monto</TableHead>
                    <TableHead>Responsable</TableHead>
                    <TableHead>Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {gastosInternosFiltrados.map(g => (
                    <TableRow key={g.id}>
                      <TableCell>{g.fecha}</TableCell>
                      <TableCell className="font-medium">{g.concepto}</TableCell>
                      <TableCell>
                        {(() => {
                          // Buscar categoría por ID o nombre
                          const categoria = obtenerCategoriaPorId(g.categoria) || 
                                          categoriasActivas.find(c => c.nombre === g.categoriaNombre || c.nombre === g.categoria);
                          return categoria ? (
                            <Badge className={categoria.color || "bg-muted/50 text-foreground border border-border/60"}>
                              {categoria.nombre}
                            </Badge>
                          ) : (
                            <Badge className="bg-muted/50 text-foreground border border-border/60">
                              {g.categoriaNombre || g.categoria || "Sin categoría"}
                            </Badge>
                          );
                        })()}
                      </TableCell>
                      <TableCell className="font-bold text-red-600">
                        ${Number(g.monto).toLocaleString("es-AR")}
                      </TableCell>
                      <TableCell className="text-sm">{g.responsable}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button size="sm" variant="outline" onClick={() => handleEditarInterno(g)}>
                            <Edit className="w-3 h-3" />
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => handleEliminar("interno", g.id)}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Vista de Cuentas por Pagar */}
        <TabsContent value="proveedores" className="space-y-6">
          {/* Dashboard de cuentas por pagar */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-muted-foreground">Total Gastado</div>
                    <div className="text-3xl font-bold text-blue-600">
                      ${totalesProveedores.total.toLocaleString("es-AR")}
                    </div>
                  </div>
                  <Receipt className="w-8 h-8 text-blue-500" />
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-muted-foreground">Total Pagado</div>
                    <div className="text-3xl font-bold text-green-600">
                      ${totalesProveedores.pagado.toLocaleString("es-AR")}
                    </div>
                  </div>
                  <TrendingUp className="w-8 h-8 text-green-500" />
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-muted-foreground">Saldo Pendiente</div>
                    <div className="text-3xl font-bold text-red-600">
                      ${totalesProveedores.pendienteNeto.toLocaleString("es-AR")}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Bruto: ${totalesProveedores.pendienteBruto.toLocaleString("es-AR")} · Saldo a favor: $
                      {totalesProveedores.saldoAFavor.toLocaleString("es-AR")}
                    </div>
                  </div>
                  <TrendingDown className="w-8 h-8 text-red-500" />
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-muted-foreground">Deudas Vencidas</div>
                    <div className="text-3xl font-bold text-orange-600">
                      ${totalesProveedores.montoVencido.toLocaleString("es-AR")}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">{totalesProveedores.vencidas} cuentas</div>
                  </div>
                  <AlertCircle className="w-8 h-8 text-orange-500" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Resumen por proveedor */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="w-5 h-5" />
                Resumen por Proveedor
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {cuentasPorProveedor.map((grupo, idx) => {
                  const porcentajePagado = grupo.total > 0 ? (grupo.pagado / grupo.total) * 100 : 0;
                  
                  return (
                    <Card 
                      key={idx} 
                      className="border border-border/60 hover:border-primary/40 transition-all cursor-pointer"
                      onClick={() => setFiltroProveedorId(filtroProveedorId === grupo.proveedor?.id ? "" : grupo.proveedor?.id || "")}
                    >
                      <CardContent className="p-4">
                        <div className="mb-3">
                          <div className="font-bold text-lg flex items-center gap-2">
                            <Building2 className="w-4 h-4 text-blue-600" />
                            {grupo.proveedor?.nombre || "Sin nombre"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {grupo.cuentas.length} cuenta{grupo.cuentas.length !== 1 ? 's' : ''} activa{grupo.cuentas.length !== 1 ? 's' : ''}
                          </div>
                        </div>
                        
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Total:</span>
                            <span className="font-semibold">${grupo.total.toLocaleString("es-AR")}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Pagado:</span>
                            <span className="font-semibold text-green-600">${grupo.pagado.toLocaleString("es-AR")}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Saldo a favor:</span>
                            <span className={`font-semibold ${grupo.saldoAFavor > 0 ? "text-green-600" : "text-muted-foreground"}`}>
                              ${Number(grupo.saldoAFavor || 0).toLocaleString("es-AR")}
                            </span>
                          </div>
                          <div className="flex justify-between border-t pt-2">
                            <span className="text-muted-foreground font-semibold">Pendiente neto:</span>
                            <span className={`font-bold ${grupo.pendienteNeto > 0 ? "text-red-600" : "text-muted-foreground"}`}>
                              ${Number(grupo.pendienteNeto || 0).toLocaleString("es-AR")}
                            </span>
                          </div>
                        </div>
                        
                        {/* Barra de progreso */}
                        <div className="mt-3">
                          <div className="w-full bg-muted rounded-full h-2">
                            <div 
                              className="bg-green-600 h-2 rounded-full transition-all" 
                              style={{ width: `${Math.min(porcentajePagado, 100)}%` }}
                            />
                          </div>
                          <div className="text-xs text-muted-foreground mt-1 text-center">
                            {porcentajePagado.toFixed(1)}% pagado
                          </div>
                        </div>
                        
                        {filtroProveedorId === (grupo.proveedor?.id || "") && (
                          <div className="mt-2 text-xs text-blue-600 text-center">
                            ✓ Filtrado
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Tabla cuentas por pagar */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Detalle de Cuentas por Pagar
              </CardTitle>
              <div className="flex gap-2">
                {filtroProveedorId && (
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={() => setFiltroProveedorId("")}
                    className="text-xs"
                  >
                    <X className="w-3 h-3 mr-1" />
                    Limpiar filtro
                  </Button>
                )}
                <Select value={filtroEstadoPago} onValueChange={setFiltroEstadoPago}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Estado de pago" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Todos</SelectItem>
                    <SelectItem value="pendiente">Pendiente</SelectItem>
                    <SelectItem value="parcial">Pagado Parcial</SelectItem>
                    <SelectItem value="pagado">Pagado</SelectItem>
                  </SelectContent>
                </Select>
                <Input 
                  placeholder="Buscar..." 
                  value={filtroProveedor} 
                  onChange={e => setFiltroProveedor(e.target.value)} 
                  className="w-56" 
                />
                <Button variant="outline" onClick={exportarReporteCuentas} disabled={cuentasPorPagarFiltradas.length === 0}>
                  <Download className="w-4 h-4 mr-1" />
                  Exportar
                </Button>
                <Button onClick={() => setOpenProveedor(true)}>
                  <Plus className="w-4 h-4 mr-1" />
                  Nueva Cuenta
                </Button>
              </div>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Proveedor</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Pagado</TableHead>
                    <TableHead>Saldo</TableHead>
                    <TableHead>Vencimiento</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cuentasPorPagarFiltradas.map(c => {
                    const esMovimientoSaldoAFavor = !!c.movimientoSaldoAFavor;
                    const saldo = esMovimientoSaldoAFavor
                      ? 0
                      : (Number(c.monto) || 0) - (Number(c.montoPagado) || 0);
                    const vencido =
                      !esMovimientoSaldoAFavor &&
                      c.fechaVencimiento &&
                      new Date(c.fechaVencimiento) < new Date();
                    
                    return (
                      <TableRow key={c.id} className={vencido && saldo > 0 ? "bg-red-500/10" : ""}>
                        <TableCell>{formatFechaHoraArgentina(c.fechaActualizacion || c.fechaCreacion || c.fecha)}</TableCell>
                        <TableCell className="font-medium">{c.proveedor?.nombre || "-"}</TableCell>
                        <TableCell className="font-bold">
                          {esMovimientoSaldoAFavor ? "-" : `$${Number(c.monto).toLocaleString("es-AR")}`}
                        </TableCell>
                        <TableCell className="text-green-600 font-semibold">
                          $
                          {Number(
                            esMovimientoSaldoAFavor ? c.montoSaldoAFavor : (c.montoPagado || 0)
                          ).toLocaleString("es-AR")}
                        </TableCell>
                        <TableCell className={`font-bold ${saldo > 0 ? "text-red-600" : "text-muted-foreground"}`}>
                          ${saldo.toLocaleString("es-AR")}
                        </TableCell>
                        <TableCell className={vencido && saldo > 0 ? "text-red-600 font-semibold" : ""}>
                          {esMovimientoSaldoAFavor ? "-" : (c.fechaVencimiento || "-")}
                          {vencido && saldo > 0 && <span className="block text-xs">¡VENCIDA!</span>}
                        </TableCell>
                        <TableCell>
                          {esMovimientoSaldoAFavor ? (
                            <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20">
                              Saldo a favor
                            </Badge>
                          ) : (
                            <Badge className={estadosPago[c.estadoPago]?.color || "bg-muted/50 text-foreground border border-border/60"}>
                              {estadosPago[c.estadoPago]?.label || "Pendiente"}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {(esMovimientoSaldoAFavor || (c.pagos && c.pagos.length > 0)) && (
                              <Button 
                                size="sm" 
                                variant="outline"
                                className="text-blue-600 border-blue-500/20 hover:text-blue-700 hover:bg-blue-500/10 hover:border-blue-500/40 hover:shadow-sm hover:-translate-y-0.5 transition-all duration-200"
                                onClick={() => {
                                  if (esMovimientoSaldoAFavor) {
                                    const montoMovimiento = Number(c.montoSaldoAFavor) || 0;
                                    setCuentaSeleccionada({
                                      ...c,
                                      monto: montoMovimiento,
                                      montoPagado: montoMovimiento,
                                      pagos: [
                                        {
                                          monto: montoMovimiento,
                                          fecha: c.fecha,
                                          metodo: c.metodo || "Efectivo",
                                          notas: c.observaciones || "",
                                          responsable: c.responsable || "Usuario no identificado",
                                          fechaRegistro: new Date().toISOString(),
                                          pagoEnDolares: !!c.pagoEnDolares,
                                          valorOficialDolar: c.valorOficialDolar ?? null,
                                          comprobantes: c.comprobantes || [],
                                          pagoGlobalProveedor: true,
                                        },
                                      ],
                                    });
                                  } else {
                                    setCuentaSeleccionada(c);
                                  }
                                  setOpenHistorial(true);
                                }}
                                title="Ver historial de pagos"
                              >
                                <Eye className="w-3 h-3" />
                              </Button>
                            )}
                            {!esMovimientoSaldoAFavor && saldo > 0 && (
                              <Button 
                                size="sm" 
                                variant="outline"
                                className="text-green-600 border-emerald-500/20 hover:text-green-700 hover:bg-emerald-500/10 hover:border-emerald-500/40 hover:shadow-sm hover:-translate-y-0.5 transition-all duration-200"
                                onClick={() => {
                                  setCuentaSeleccionada(c);
                                  setMontoPago((Number(c.monto) - Number(c.montoPagado || 0)).toString());
                                  // Inicializar opciones de pago en dólares / comprobantes desde la cuenta si hubiera
                                  setPagoEnDolares(!!c.pagoEnDolares);
                                  setValorOficialDolar(c.valorOficialDolar ?? null);
                                  setComprobantesPago(c.comprobantes || []);
                                  setOpenPago(true);
                                }}
                                title="Registrar pago"
                              >
                                <Wallet className="w-3 h-3" />
                              </Button>
                            )}
                            {!esMovimientoSaldoAFavor && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-indigo-600 border-indigo-500/20 hover:text-indigo-700 hover:bg-indigo-500/10 hover:border-indigo-500/40 hover:shadow-sm hover:-translate-y-0.5 transition-all duration-200"
                                  onClick={() => abrirPagoGlobalProveedor(c)}
                                  title="Pago global del proveedor"
                                >
                                  <DollarSign className="w-3 h-3" />
                                </Button>
                                <Button size="sm" variant="outline" className="text-amber-600 border-amber-500/20 hover:text-amber-700 hover:bg-amber-500/10 hover:border-amber-500/40 hover:shadow-sm hover:-translate-y-0.5 transition-all duration-200" onClick={() => handleEditarProveedor(c)} title="Editar cuenta">
                                  <Edit className="w-3 h-3" />
                                </Button>
                                <Button size="sm" variant="outline" className="text-red-600 border-red-500/20 hover:text-red-700 hover:bg-red-500/10 hover:border-red-500/40 hover:shadow-sm hover:-translate-y-0.5 transition-all duration-200" onClick={() => handleEliminar("proveedor", c.id)} title="Eliminar cuenta">
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Modal para gasto interno */}
      <Dialog open={openInterno} onOpenChange={setOpenInterno}>
        <DialogContent className="w-[95vw] max-w-[500px] border border-border/60 bg-card">
          <DialogHeader>
            <DialogTitle>{editando ? "Editar Gasto Interno" : "Nuevo Gasto Interno"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmitInterno(onSubmitInterno)} className="flex flex-col gap-3 py-2">
            <div>
              <Input 
                placeholder="Concepto (opcional)" 
                {...registerInterno("concepto")}
                className={errorsInterno.concepto ? "border-red-500" : ""}
              />
              {errorsInterno.concepto && (
                <span className="text-red-500 text-xs">{errorsInterno.concepto.message}</span>
              )}
            </div>
            
            <div>
              <Input 
                placeholder="Monto *" 
                type="number" 
                step="0.01"
                {...registerInterno("monto")}
                className={errorsInterno.monto ? "border-red-500" : ""}
              />
              {errorsInterno.monto && (
                <span className="text-red-500 text-xs">{errorsInterno.monto.message}</span>
              )}
            </div>
            
            <div>
              <Label>Categoría *</Label>
              {!creandoCategoriaRapida ? (
                <div className="space-y-2">
                  <select 
                    value={watchInterno("categoria") || ""} 
                    onChange={(e) => setValueInterno("categoria", e.target.value)}
                    className="w-full px-3 py-2 border border-border/60 bg-background text-foreground rounded-md"
                  >
                    <option value="">Seleccionar categoría *</option>
                    {categoriasActivas.map((cat) => (
                      <option key={cat.id} value={cat.id}>{cat.nombre}</option>
                    ))}
                  </select>
                  {errorsInterno.categoria && (
                    <span className="text-red-500 text-xs">{errorsInterno.categoria.message}</span>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setCreandoCategoriaRapida(true)}
                    className="w-full text-xs"
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    Crear nueva categoría
                  </Button>
                </div>
              ) : (
                <div className="space-y-2 border border-blue-500/20 bg-blue-500/10 p-3 rounded-md">
                  <Label className="text-sm font-semibold">Nueva Categoría</Label>
                  <Input
                    placeholder="Nombre de la categoría"
                    value={nuevaCategoriaNombre}
                    onChange={(e) => setNuevaCategoriaNombre(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleCrearCategoriaRapida();
                      }
                    }}
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleCrearCategoriaRapida}
                      disabled={!nuevaCategoriaNombre.trim() || guardando}
                    >
                      Crear
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setCreandoCategoriaRapida(false);
                        setNuevaCategoriaNombre("");
                      }}
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              )}
            </div>
            
            <div>
              <Input 
                placeholder="Fecha *" 
                type="date" 
                {...registerInterno("fecha")}
                className={errorsInterno.fecha ? "border-red-500" : ""}
              />
            </div>
            
            <div>
              <Textarea 
                placeholder="Observaciones (opcional)" 
                {...registerInterno("observaciones")}
                rows={3}
              />
            </div>
            
            <div className="text-sm text-muted-foreground bg-muted/50 border border-border/60 p-2 rounded">
              <strong>Responsable:</strong> {user?.email || "Usuario no identificado"}
            </div>
          </form>
          <DialogFooter>
            <Button variant="outline" onClick={cerrarModalInterno} disabled={guardando}>
              Cancelar
            </Button>
            <Button 
              onClick={handleSubmitInterno(onSubmitInterno)}
              disabled={guardando}
            >
              {guardando ? "Guardando..." : (editando ? "Actualizar" : "Guardar")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal para cuenta por pagar */}
      <Dialog open={openProveedor} onOpenChange={setOpenProveedor}>
        <DialogContent className="w-[95vw] max-w-[600px] border border-border/60 bg-card">
          <DialogHeader>
            <DialogTitle>{editando ? "Editar Cuenta por Pagar" : "Nueva Cuenta por Pagar"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmitProveedor(onSubmitProveedor)} className="flex flex-col gap-4 py-2">
            <div>
              <Label>Proveedor *</Label>
              <div className="relative mt-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground z-10" />
                  <Input
                    placeholder="Buscar proveedor por nombre, teléfono o CUIT..."
                    value={busquedaProveedor}
                    onChange={(e) => {
                      setBusquedaProveedor(e.target.value);
                      setMostrarDropdownProveedor(true);
                      if (!e.target.value.trim()) seleccionarProveedor(null);
                    }}
                    onFocus={(e) => {
                      setMostrarDropdownProveedor(true);
                      // Seleccionar todo el texto al hacer foco para facilitar cambio
                      e.target.select();
                    }}
                    className={`pl-10 pr-10 ${errorsProveedor.proveedorId ? "border-red-500" : proveedorSeleccionado ? "border-emerald-500 bg-emerald-500/10" : ""}`}
                  />
                  {busquedaProveedor && (
                    <button
                      type="button"
                      onClick={() => {
                        seleccionarProveedor(null);
                        setMostrarDropdownProveedor(false);
                      }}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground z-10"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                
                {mostrarDropdownProveedor && busquedaProveedor.trim() && (
                  <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-card border border-border/60 rounded-md shadow-lg max-h-60 overflow-y-auto">
                    {proveedoresFiltrados.length === 0 ? (
                      <div className="p-3 text-sm text-muted-foreground text-center">
                        No se encontraron proveedores que coincidan con "{busquedaProveedor}"
                      </div>
                    ) : (
                      proveedoresFiltrados.map(proveedor => (
                        <button
                          key={proveedor.id}
                          type="button"
                          onClick={() => seleccionarProveedor(proveedor)}
                          className={`w-full text-left px-3 py-2 hover:bg-muted/50 border-b border-border/60 last:border-b-0 transition-colors ${
                            proveedorSeleccionado?.id === proveedor.id ? "bg-blue-500/10" : ""
                          }`}
                        >
                          <div className="font-medium">{proveedor.nombre}</div>
                          <div className="text-xs text-muted-foreground">
                            {proveedor.telefono && `Tel: ${proveedor.telefono}`}
                            {proveedor.cuit && ` • CUIT: ${proveedor.cuit}`}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
              {errorsProveedor.proveedorId && (
                <span className="text-red-500 text-xs">{errorsProveedor.proveedorId.message}</span>
              )}
              {proveedorSeleccionado && !errorsProveedor.proveedorId && (
                <span className="text-green-600 text-xs flex items-center gap-1 mt-1">
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  Proveedor seleccionado
                </span>
              )}
            </div>
            
            <div>
              <Label>Monto Total *</Label>
              <Input 
                placeholder="Monto total de la factura" 
                type="number" 
                step="0.01"
                {...registerProveedor("monto")}
                className={errorsProveedor.monto ? "border-red-500" : ""}
              />
              {errorsProveedor.monto && (
                <span className="text-red-500 text-xs">{errorsProveedor.monto.message}</span>
              )}
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Fecha de Emisión *</Label>
                <Input 
                  type="date" 
                  {...registerProveedor("fecha")}
                  className={errorsProveedor.fecha ? "border-red-500" : ""}
                />
              </div>
              
              <div>
                <Label>Fecha de Vencimiento</Label>
                <Input 
                  type="date" 
                  {...registerProveedor("fechaVencimiento")}
                />
              </div>
            </div>
            
            <div>
              <Label>Observaciones</Label>
              <Textarea 
                placeholder="Detalles, condiciones, etc." 
                {...registerProveedor("observaciones")}
                rows={3}
              />
            </div>
            
            <div className="text-sm text-muted-foreground bg-muted/50 border border-border/60 p-2 rounded">
              <strong>Responsable:</strong> {user?.email || "Usuario no identificado"}
            </div>
          </form>
          <DialogFooter>
            <Button variant="outline" onClick={cerrarModalProveedor} disabled={guardando}>
              Cancelar
            </Button>
            <Button 
              onClick={handleSubmitProveedor(onSubmitProveedor)}
              disabled={guardando}
            >
              {guardando ? "Guardando..." : (editando ? "Actualizar" : "Guardar")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal para registrar pago */}
      <Dialog open={openPago} onOpenChange={setOpenPago}>
        <DialogContent className="w-[95vw] max-w-[500px] border border-border/60 bg-card">
          <DialogHeader>
            <DialogTitle>Registrar Pago</DialogTitle>
          </DialogHeader>
          
          {cuentaSeleccionada && (
            <div className="space-y-4 py-2">
              {/* Info de la cuenta */}
              <div className="bg-muted/50 p-3 rounded-lg border border-border/60">
                <div className="font-medium text-foreground">{cuentaSeleccionada.proveedor?.nombre}</div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Total:</span>
                    <span className="font-semibold ml-1">${Number(cuentaSeleccionada.monto).toLocaleString("es-AR")}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Saldo:</span>
                    <span className="font-semibold text-red-600 ml-1">
                      ${(Number(cuentaSeleccionada.monto) - Number(cuentaSeleccionada.montoPagado || 0)).toLocaleString("es-AR")}
                    </span>
                  </div>
                </div>
              </div>

              {/* Switch: pago en dólares y comprobantes */}
              <div className="space-y-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <Switch
                    checked={!!pagoEnDolares}
                    onCheckedChange={(checked) => {
                      setPagoEnDolares(checked);
                      if (!checked) {
                        setValorOficialDolar(null);
                      }
                    }}
                    color="warning"
                  />
                  <span className="text-sm font-medium">Pago en dólares</span>
                </label>
                {pagoEnDolares && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className="w-full md:w-40 px-3 py-2 border border-border/60 bg-background text-foreground rounded-lg"
                        value={valorOficialDolar ?? ""}
                        onChange={(e) => setValorOficialDolar(e.target.value ? Number(e.target.value) : null)}
                        placeholder="Ej: 1440"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={fetchDolarBlue}
                        disabled={loadingDolar}
                        className="shrink-0 h-9"
                      >
                        {loadingDolar ? <Loader2 className="w-4 h-4 animate-spin" /> : "Actualizar"}
                      </Button>
                    </div>
                    {ultimaActualizacionDolar && (
                      <p className="text-xs text-muted-foreground">
                        Última cotización: {ultimaActualizacionDolar.toLocaleString("es-AR", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}{" "}
                        (se actualiza cada 5 min)
                      </p>
                    )}
                  </div>
                )}

                <ComprobantesPagoSection
                  comprobantes={comprobantesPago || []}
                  onComprobantesChange={setComprobantesPago}
                  disabled={loadingDolar || guardando}
                  maxFiles={8}
                />
              </div>

              {/* Historial de pagos */}
              {cuentaSeleccionada.pagos && cuentaSeleccionada.pagos.length > 0 && (
                <div className="bg-blue-500/10 p-3 rounded-lg border border-blue-500/20">
                  <div className="font-semibold text-sm mb-2">Pagos registrados:</div>
                  <div className="space-y-1">
                    {cuentaSeleccionada.pagos.map((pago, idx) => (
                      <div key={idx} className="text-xs text-foreground flex justify-between">
                        <span>{pago.fecha} - {pago.metodo}</span>
                        <span className="font-semibold">${Number(pago.monto).toLocaleString("es-AR")}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <Label>Monto a Pagar *</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="Monto del pago"
                  value={montoPago}
                  onChange={(e) => setMontoPago(e.target.value)}
                  max={Number(cuentaSeleccionada.monto) - Number(cuentaSeleccionada.montoPagado || 0)}
                />
              </div>

              <div>
                <Label>Fecha de Pago *</Label>
                <Input
                  type="date"
                  value={fechaPago}
                  onChange={(e) => setFechaPago(e.target.value)}
                />
              </div>

              <div>
                <Label>Método de Pago</Label>
                <select 
                  value={metodoPago} 
                  onChange={(e) => setMetodoPago(e.target.value)}
                  className="w-full px-3 py-2 border border-border/60 bg-background text-foreground rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/40"
                >
                  <option value="Efectivo">Efectivo</option>
                  <option value="Transferencia">Transferencia</option>
                  <option value="Cheque">Cheque</option>
                  <option value="Tarjeta">Tarjeta</option>
                </select>
              </div>

              <div>
                <Label>Notas del Pago</Label>
                <Textarea
                  placeholder="Detalles del pago..."
                  value={notasPago}
                  onChange={(e) => setNotasPago(e.target.value)}
                  rows={2}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenPago(false)} disabled={guardando}>
              Cancelar
            </Button>
            <Button 
              onClick={handleRegistrarPago}
              disabled={guardando || !montoPago || Number(montoPago) <= 0}
            >
              {guardando ? "Guardando..." : "Registrar Pago"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={openPagoGlobal} onOpenChange={setOpenPagoGlobal}>
        <DialogContent className="w-[95vw] max-w-[560px] border border-border/60 bg-card">
          <DialogHeader>
            <DialogTitle>Pago Global por Proveedor</DialogTitle>
          </DialogHeader>
          {proveedorPagoGlobal && (
            <div className="space-y-4 py-2">
              <div className="bg-indigo-500/10 p-3 rounded-lg border border-indigo-500/20">
                <div className="font-semibold text-foreground">{proveedorPagoGlobal.nombre}</div>
                <div className="grid grid-cols-2 gap-2 mt-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Cuentas asociadas:</span>
                    <span className="font-semibold ml-1">{proveedorPagoGlobal.cuentas.length}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Saldo pendiente:</span>
                    <span className="font-semibold text-red-600 ml-1">
                      ${Number(proveedorPagoGlobal.pendiente || 0).toLocaleString("es-AR")}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Saldo a favor actual:</span>
                    <span className="font-semibold text-green-600 ml-1">
                      ${Number(proveedorPagoGlobal.saldoAFavor || 0).toLocaleString("es-AR")}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Total histórico:</span>
                    <span className="font-semibold ml-1">
                      ${Number(proveedorPagoGlobal.total || 0).toLocaleString("es-AR")}
                    </span>
                  </div>
                </div>
              </div>

              <div>
                <Label>Monto a aplicar globalmente *</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="Monto del pago global"
                  value={montoPagoGlobal}
                  onChange={(e) => setMontoPagoGlobal(e.target.value)}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Se distribuye automáticamente por fecha de emisión y, si sobra, queda como saldo a favor del proveedor.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Fecha de Pago *</Label>
                  <Input
                    type="date"
                    value={fechaPagoGlobal}
                    onChange={(e) => setFechaPagoGlobal(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Método de Pago</Label>
                  <select
                    value={metodoPagoGlobal}
                    onChange={(e) => setMetodoPagoGlobal(e.target.value)}
                    className="w-full px-3 py-2 border border-border/60 bg-background text-foreground rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/40"
                  >
                    <option value="Efectivo">Efectivo</option>
                    <option value="Transferencia">Transferencia</option>
                    <option value="Cheque">Cheque</option>
                    <option value="Tarjeta">Tarjeta</option>
                  </select>
                </div>
              </div>

              <div>
                <Label>Notas del Pago</Label>
                <Textarea
                  placeholder="Detalles del pago global..."
                  value={notasPagoGlobal}
                  onChange={(e) => setNotasPagoGlobal(e.target.value)}
                  rows={2}
                />
              </div>

              <div className="space-y-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <Switch
                    checked={!!pagoGlobalEnDolares}
                    onCheckedChange={(checked) => {
                      setPagoGlobalEnDolares(checked);
                      if (!checked) setValorOficialDolarGlobal(null);
                    }}
                    color="warning"
                  />
                  <span className="text-sm font-medium">Pago en dólares</span>
                </label>
                {pagoGlobalEnDolares && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className="w-full md:w-40 px-3 py-2 border border-border/60 bg-background text-foreground rounded-lg"
                        value={valorOficialDolarGlobal ?? ""}
                        onChange={(e) =>
                          setValorOficialDolarGlobal(
                            e.target.value ? Number(e.target.value) : null
                          )
                        }
                        placeholder="Ej: 1440"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={fetchDolarBlueGlobal}
                        disabled={loadingDolarGlobal}
                        className="shrink-0 h-9"
                      >
                        {loadingDolarGlobal ? <Loader2 className="w-4 h-4 animate-spin" /> : "Actualizar"}
                      </Button>
                    </div>
                    {ultimaActualizacionDolarGlobal && (
                      <p className="text-xs text-muted-foreground">
                        Última cotización: {ultimaActualizacionDolarGlobal.toLocaleString("es-AR", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}{" "}
                        (se actualiza cada 5 min)
                      </p>
                    )}
                  </div>
                )}
              </div>

              <ComprobantesPagoSection
                comprobantes={comprobantesPagoGlobal || []}
                onComprobantesChange={setComprobantesPagoGlobal}
                disabled={loadingDolarGlobal || guardando}
                maxFiles={8}
              />
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setOpenPagoGlobal(false);
                setProveedorPagoGlobal(null);
                limpiarEstadoPagoGlobal();
              }}
              disabled={guardando}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleRegistrarPagoGlobal}
              disabled={guardando || !montoPagoGlobal || Number(montoPagoGlobal) <= 0}
            >
              {guardando ? "Guardando..." : "Registrar Pago Global"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal para ver historial de pagos */}
      <Dialog open={openHistorial} onOpenChange={setOpenHistorial}>
        <DialogContent className="w-[95vw] max-w-[600px] border border-border/60 bg-card">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-600" />
              Historial de Pagos
            </DialogTitle>
          </DialogHeader>
          
          {cuentaSeleccionada && (
            <div className="space-y-4 py-2">
              {/* Info de la cuenta */}
              <div className="bg-gradient-to-r from-blue-500/10 to-indigo-500/10 p-4 rounded-lg border border-blue-500/20">
                <div className="font-bold text-lg text-foreground">{cuentaSeleccionada.proveedor?.nombre}</div>
                <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
                  <div className="bg-card p-2 rounded-md border border-border/60">
                    <div className="text-xs text-muted-foreground">Total</div>
                    <div className="font-bold text-blue-700">${Number(cuentaSeleccionada.monto).toLocaleString("es-AR")}</div>
                  </div>
                  <div className="bg-card p-2 rounded-md border border-border/60">
                    <div className="text-xs text-muted-foreground">Pagado</div>
                    <div className="font-bold text-green-600">${Number(cuentaSeleccionada.montoPagado || 0).toLocaleString("es-AR")}</div>
                  </div>
                  <div className="bg-card p-2 rounded-md border border-border/60">
                    <div className="text-xs text-muted-foreground">Saldo</div>
                    <div className={`font-bold ${(Number(cuentaSeleccionada.monto) - Number(cuentaSeleccionada.montoPagado || 0)) > 0 ? "text-red-600" : "text-muted-foreground"}`}>
                      ${(Number(cuentaSeleccionada.monto) - Number(cuentaSeleccionada.montoPagado || 0)).toLocaleString("es-AR")}
                    </div>
                  </div>
                </div>
              </div>

              {/* Listado de pagos */}
              {cuentaSeleccionada.pagos && cuentaSeleccionada.pagos.length > 0 ? (
                <div className="space-y-2">
                  <div className="font-semibold text-sm text-foreground flex items-center gap-2">
                    <DollarSign className="w-4 h-4" />
                    Pagos Registrados ({cuentaSeleccionada.pagos.length})
                  </div>
                  <div className="max-h-80 overflow-y-auto space-y-2">
                    {cuentaSeleccionada.pagos.map((pago, idx) => (
                      <div 
                        key={idx} 
                        className="bg-card border border-border/60 rounded-lg p-3 hover:shadow-md transition-shadow"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-green-600 text-lg">
                                ${Number(pago.monto).toLocaleString("es-AR")}
                              </span>
                              <Badge variant="outline" className="text-xs">
                                {pago.metodo || "Efectivo"}
                              </Badge>
                              {pago.pagoGlobalProveedor && (
                                <Badge variant="outline" className="text-xs">
                                  Pago global
                                </Badge>
                              )}
                              {pago.pagoEnDolares && (
                                <Badge variant="subtle" className="text-xs ml-1">
                                  USD
                                </Badge>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                              <div className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {pago.fecha}
                              </div>
                              {pago.notas && (
                                <div className="text-muted-foreground italic">"{pago.notas}"</div>
                              )}
                              {pago.responsable && (
                                <div className="text-muted-foreground">Por: {pago.responsable}</div>
                              )}
                              {pago.comprobantes && pago.comprobantes.length > 0 && (
                                <div className="text-xs text-muted-foreground mt-1">
                                  {pago.comprobantes.length} comprobante{pago.comprobantes.length !== 1 ? "s" : ""}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            <div className="text-xs text-muted-foreground">Pago #{idx + 1}</div>
                            <div className="flex gap-1 mt-2">
                              <Button
                                size="xs"
                                variant="outline"
                                onClick={() => {
                                  setPagoEdit({ ...pago, idx });
                                  setOpenEditarPago(true);
                                }}
                                title="Editar pago"
                              >
                                <Edit className="w-3 h-3" />
                              </Button>
                              <Button
                                size="xs"
                                variant="outline"
                                onClick={() => handleEliminarPago(idx)}
                                title="Eliminar pago"
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  <div className="bg-emerald-500/10 p-3 rounded-lg border border-emerald-500/20 mt-3">
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-sm text-emerald-800 dark:text-emerald-200">Total Pagado:</span>
                      <span className="font-bold text-lg text-green-600">
                        ${Number(cuentaSeleccionada.montoPagado || 0).toLocaleString("es-AR")}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Wallet className="w-12 h-12 mx-auto mb-2 opacity-30" />
                  <p>No hay pagos registrados aún</p>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setOpenHistorial(false);
              setCuentaSeleccionada(null);
            }}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de gestión de categorías */}
      <GestionCategorias 
        open={openGestionCategorias} 
        onOpenChange={setOpenGestionCategorias} 
      />
      
      {/* Modal para editar pago individual */}
      <Dialog open={openEditarPago} onOpenChange={setOpenEditarPago}>
        <DialogContent className="w-[95vw] max-w-[500px] border border-border/60 bg-card">
          <DialogHeader>
            <DialogTitle>{pagoEdit ? `Editar Pago #${pagoEdit.idx + 1}` : "Editar Pago"}</DialogTitle>
          </DialogHeader>
          {pagoEdit && (
            <div className="flex flex-col gap-3 py-2">
              <div>
                <Label>Monto *</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={pagoEdit.monto}
                  onChange={(e) => setPagoEdit(prev => ({ ...prev, monto: e.target.value }))}
                />
              </div>
              <div>
                <Label>Fecha *</Label>
                <Input
                  type="date"
                  value={pagoEdit.fecha}
                  onChange={(e) => setPagoEdit(prev => ({ ...prev, fecha: e.target.value }))}
                />
              </div>
              <div>
                <Label>Método</Label>
                <select
                  value={pagoEdit.metodo}
                  onChange={(e) => setPagoEdit(prev => ({ ...prev, metodo: e.target.value }))}
                  className="w-full px-3 py-2 border border-border/60 bg-background text-foreground rounded-md"
                >
                  <option value="Efectivo">Efectivo</option>
                  <option value="Transferencia">Transferencia</option>
                  <option value="Cheque">Cheque</option>
                  <option value="Tarjeta">Tarjeta</option>
                </select>
              </div>
              <div>
                <Label>Notas</Label>
                <Textarea
                  rows={2}
                  value={pagoEdit.notas || ""}
                  onChange={(e) => setPagoEdit(prev => ({ ...prev, notas: e.target.value }))}
                />
              </div>
              <div>
                <label className="flex items-center gap-3 cursor-pointer">
                  <Switch
                    checked={!!pagoEdit.pagoEnDolares}
                    onCheckedChange={(checked) => setPagoEdit(prev => ({ ...prev, pagoEnDolares: checked }))}
                    color="warning"
                  />
                  <span className="text-sm font-medium">Pago en dólares</span>
                </label>
                {pagoEdit.pagoEnDolares && (
                  <div className="mt-2">
                    <Input
                      type="number"
                      step="0.01"
                      value={pagoEdit.valorOficialDolar ?? ""}
                      onChange={(e) => setPagoEdit(prev => ({ ...prev, valorOficialDolar: e.target.value ? Number(e.target.value) : null }))}
                      placeholder="Valor dólar"
                    />
                  </div>
                )}
              </div>
              <div>
                <ComprobantesPagoSection
                  comprobantes={pagoEdit.comprobantes || []}
                  onComprobantesChange={(list) => setPagoEdit(prev => ({ ...prev, comprobantes: list }))}
                  disabled={guardando}
                  maxFiles={6}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setOpenEditarPago(false); setPagoEdit(null); }} disabled={guardando}>
              Cancelar
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => pagoEdit && handleEliminarPago(pagoEdit.idx)} disabled={guardando}>
                Eliminar
              </Button>
              <Button onClick={handleGuardarEdicionPago} disabled={guardando}>
                {guardando ? "Guardando..." : "Guardar cambios"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default GastosPage;
