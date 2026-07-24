"use client";
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DateInput } from "@/components/ui/date-input";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell, TableFooter } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Receipt, Plus, Edit, Trash2, Eye, Filter, Download, Calendar, TrendingUp, TrendingDown, BarChart3, X, Search, Building2, Wallet, DollarSign, AlertCircle, FileText, Settings, Loader2, ArrowLeftRight, MoreHorizontal } from "lucide-react";
import { Icon } from "@iconify/react";
import { Switch } from "@/components/ui/switch";
import ComprobantesPagoSection from "@/components/ventas/ComprobantesPagoSection";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/use-toast";
import { db } from "@/lib/firebase";
import { collection, addDoc, getDocs, deleteDoc, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";
import { useAuth } from "@/provider/auth.provider";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { useCategoriasGastos } from "@/hooks/useCategoriasGastos";
import GestionCategorias from "@/components/gastos/GestionCategorias";
import EstadisticasCategorias from "@/components/gastos/EstadisticasCategorias";
import {
  calcularResumenGeneral,
  calcularResumenProveedor,
  calcularSaldoCuenta,
  calcularEstadoCuenta,
  esCuentaAnulada,
  esCuentaVencida,
  formatMoneyARS,
  parseMoneyARS,
  formatFechaAR,
} from "@/lib/erp/cuentas-pagar-calculos";

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
  const [movimientosProveedor, setMovimientosProveedor] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Estados para modales
  const [openInterno, setOpenInterno] = useState(false);
  const [openProveedor, setOpenProveedor] = useState(false);
  const [openPago, setOpenPago] = useState(false);
  const [openQuitarSaldoAFavor, setOpenQuitarSaldoAFavor] = useState(false);
  const [openAgregarSaldoAFavor, setOpenAgregarSaldoAFavor] = useState(false);
  const [openHistorial, setOpenHistorial] = useState(false);
  const [openPagosProveedor, setOpenPagosProveedor] = useState(false);
  const [openPagoDetalleProveedor, setOpenPagoDetalleProveedor] = useState(false);
  const [openMovimientoDetalle, setOpenMovimientoDetalle] = useState(false);
  const [openGestionCategorias, setOpenGestionCategorias] = useState(false);
  const [editando, setEditando] = useState(null);
  const [cuentaSeleccionada, setCuentaSeleccionada] = useState(null);
  const [proveedorPagosSeleccionadoId, setProveedorPagosSeleccionadoId] = useState("");
  const [pagoDetalleProveedor, setPagoDetalleProveedor] = useState(null);
  const [pagosProveedorSeleccionados, setPagosProveedorSeleccionados] = useState({});
  const [movimientosProveedorSeleccionados, setMovimientosProveedorSeleccionados] = useState({});
  const [movimientoSeleccionado, setMovimientoSeleccionado] = useState(null);
  const [proveedorQuitarSaldo, setProveedorQuitarSaldo] = useState(null);
  const [proveedorAgregarSaldo, setProveedorAgregarSaldo] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [comprobantePreview, setComprobantePreview] = useState(null);
  const [openComprobantePreview, setOpenComprobantePreview] = useState(false);
  
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
  const confirmResolverRef = React.useRef(null);
  const autoFillPagoProveedorRef = React.useRef(false);
  const initSeleccionPagoProveedorRef = React.useRef(false);
  const [confirmDialog, setConfirmDialog] = useState({
    open: false,
    title: "",
    description: "",
    confirmText: "Confirmar",
    cancelText: "Cancelar",
    confirmColor: "success",
  });

  const closeConfirm = useCallback((result) => {
    const resolver = confirmResolverRef.current;
    confirmResolverRef.current = null;
    setConfirmDialog((prev) => ({ ...prev, open: false }));
    if (typeof resolver === "function") resolver(Boolean(result));
  }, []);

  const confirmAsync = useCallback(
    ({ title, description, confirmText, cancelText, confirmColor }) => {
      return new Promise((resolve) => {
        confirmResolverRef.current = resolve;
        setConfirmDialog({
          open: true,
          title: String(title || "Confirmar"),
          description: String(description || ""),
          confirmText: String(confirmText || "Confirmar"),
          cancelText: String(cancelText || "Cancelar"),
          confirmColor: confirmColor || "success",
        });
      });
    },
    []
  );

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
  const cargarDatos = useCallback(async (opts = {}) => {
    const silent = Boolean(opts?.silent);
    try {
      if (!silent) setLoading(true);
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
              fechaRegistro:
                typeof data.fechaRegistro === "string"
                  ? data.fechaRegistro
                  : data.fechaRegistro?.toDate?.()
                    ? data.fechaRegistro.toDate().toISOString()
                    : null,
              fechaCreacion: data.fechaCreacion?.toDate?.() ? data.fechaCreacion.toDate().toISOString() : null,
              fechaActualizacion: data.fechaActualizacion?.toDate?.() ? data.fechaActualizacion.toDate().toISOString() : null,
            };
          })
          .filter((m) => Boolean(m?.tipo));
        const sortKey = (m) => m.fechaRegistro || m.fechaActualizacion || m.fechaCreacion || m.fecha;
        setMovimientosProveedor(
          pagosProveedoresData.sort((a, b) => new Date(sortKey(b) || 0) - new Date(sortKey(a) || 0))
        );
      } catch (err) {
        setMovimientosProveedor([]);
      }
    } catch (error) {
      console.error("Error al cargar datos:", error);
    } finally {
      if (!silent) setLoading(false);
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
        toast({ title: "Categoría inválida", description: "Seleccioná una categoría válida.", color: "warning" });
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
      await cargarDatos({ silent: true });

      resetInterno();
      setOpenInterno(false);
      setEditando(null);
    } catch (error) {
      console.error("Error al guardar gasto:", error);
      toast({ title: "Error", description: `Error al guardar el gasto: ${error.message}`, color: "destructive" });
    } finally {
      setGuardando(false);
    }
  };
  
  // Crear categoría rápida desde el formulario
  const handleCrearCategoriaRapida = async () => {
    if (!nuevaCategoriaNombre.trim()) {
      toast({ title: "Falta el nombre", description: "Ingresá el nombre de la categoría.", color: "warning" });
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
      toast({ title: "Error", description: `Error al crear categoría: ${error.message}`, color: "destructive" });
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
      await cargarDatos({ silent: true });

      resetProveedor();
      setOpenProveedor(false);
      setEditando(null);
      setBusquedaProveedor("");
      setProveedorSeleccionado(null);
    } catch (error) {
      console.error("Error al guardar cuenta:", error);
      toast({ title: "Error", description: `Error al guardar la cuenta: ${error.message}`, color: "destructive" });
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
  const [pagoModo, setPagoModo] = useState("cuenta"); // cuenta | proveedor
  const [cuentasSeleccionadasPagoProveedor, setCuentasSeleccionadasPagoProveedor] = useState({});

  const [montoQuitarSaldo, setMontoQuitarSaldo] = useState("");
  const [fechaQuitarSaldo, setFechaQuitarSaldo] = useState(new Date().toISOString().split("T")[0]);
  const [metodoQuitarSaldo, setMetodoQuitarSaldo] = useState("Ajuste");
  const [notasQuitarSaldo, setNotasQuitarSaldo] = useState("");

  const [montoAgregarSaldo, setMontoAgregarSaldo] = useState("");
  const [fechaAgregarSaldo, setFechaAgregarSaldo] = useState(new Date().toISOString().split("T")[0]);
  const [metodoAgregarSaldo, setMetodoAgregarSaldo] = useState("Efectivo");
  const [notasAgregarSaldo, setNotasAgregarSaldo] = useState("");
  const [comprobantesAgregarSaldo, setComprobantesAgregarSaldo] = useState([]);
  const [adelantoEnDolares, setAdelantoEnDolares] = useState(false);
  const [adelantoValorOficialDolar, setAdelantoValorOficialDolar] = useState(null);

  // Editar / eliminar pagos individuales
  const [openEditarPago, setOpenEditarPago] = useState(false);
  const [pagoEdit, setPagoEdit] = useState(null); // { idx, monto, fecha, metodo, notas, pagoEnDolares, valorOficialDolar, comprobantesPago }

  const cuentasPendientesProveedorParaPago = useMemo(() => {
    const provId = String(cuentaSeleccionada?.proveedorId || "").trim();
    if (!provId) return [];
    const cuentas = Array.isArray(cuentasPorPagar) ? cuentasPorPagar : [];
    return cuentas
      .filter((c) => String(c?.proveedorId || "") === provId)
      .filter((c) => !esCuentaAnulada(c))
      .map((c) => ({ ...c, _saldo: calcularSaldoCuenta(c) }))
      .filter((c) => Number(c._saldo || 0) > 0)
      .sort((a, b) => String(a.fechaVencimiento || a.fecha || "").localeCompare(String(b.fechaVencimiento || b.fecha || "")));
  }, [cuentaSeleccionada?.proveedorId, cuentasPorPagar]);

  const resumenProveedorParaPago = useMemo(() => {
    const provId = String(cuentaSeleccionada?.proveedorId || "").trim();
    if (!provId) return null;
    const proveedor = proveedores.find((p) => String(p?.id || "") === provId) || cuentaSeleccionada?.proveedor || null;
    const cuentas = Array.isArray(cuentasPorPagar) ? cuentasPorPagar : [];
    const cuentasProv = cuentas.filter((c) => String(c?.proveedorId || "") === provId).filter((c) => !esCuentaAnulada(c));
    const total = cuentasProv.reduce((acc, c) => acc + (Number(c?.monto) || 0), 0);
    const pagado = cuentasProv.reduce((acc, c) => acc + (Number(c?.montoPagado) || 0), 0);
    const pendienteBruto = cuentasProv.reduce((acc, c) => acc + calcularSaldoCuenta(c), 0);
    const saldoAFavor = Number(proveedor?.saldoAFavor || 0);
    const pendienteNeto = Math.max(pendienteBruto - saldoAFavor, 0);
    return {
      proveedorId: provId,
      proveedorNombre: proveedor?.nombre || "Proveedor",
      total,
      pagado,
      pendienteBruto,
      saldoAFavor,
      pendienteNeto,
      cuentasPendientes: cuentasPendientesProveedorParaPago,
    };
  }, [cuentaSeleccionada?.proveedorId, cuentaSeleccionada?.proveedor, proveedores, cuentasPorPagar, cuentasPendientesProveedorParaPago]);

  const distribucionPagoProveedor = useMemo(() => {
    let monto = parseMoneyARS(montoPago);
    if (!Number.isFinite(monto) || monto < 0) monto = 0;
    const selectedIds = Object.keys(cuentasSeleccionadasPagoProveedor || {}).filter((id) => cuentasSeleccionadasPagoProveedor?.[id]);
    const saldoAFavor = Number(resumenProveedorParaPago?.saldoAFavor || 0);
    if (selectedIds.length === 0) return { aplicaciones: [], excedente: monto, aplicado: 0 };
    const selectedSet = new Set(selectedIds);
    const cuentas = (resumenProveedorParaPago?.cuentasPendientes || []).filter((c) => selectedSet.has(String(c.id || "")));
    let restante = monto + saldoAFavor;
    const aplicaciones = [];
    let aplicado = 0;
    for (const c of cuentas) {
      if (restante <= 0) break;
      const saldo = Number(c._saldo || 0);
      const aplicar = Math.min(restante, saldo);
      if (aplicar <= 0) continue;
      aplicaciones.push({ cuentaId: c.id, aplicar, saldo });
      aplicado += aplicar;
      restante -= aplicar;
    }
    return { aplicaciones, excedente: Math.max(restante, 0), aplicado };
  }, [montoPago, cuentasSeleccionadasPagoProveedor, resumenProveedorParaPago]);

  useEffect(() => {
    if (!openPago) return;
    setPagoModo("cuenta");
    setCuentasSeleccionadasPagoProveedor({});
    autoFillPagoProveedorRef.current = false;
    initSeleccionPagoProveedorRef.current = false;
  }, [openPago]);

  useEffect(() => {
    if (!openPago) return;
    if (pagoModo !== "proveedor") return;
    if (!initSeleccionPagoProveedorRef.current) {
      initSeleccionPagoProveedorRef.current = true;
      const next = {};
      for (const c of cuentasPendientesProveedorParaPago) next[String(c.id)] = true;
      setCuentasSeleccionadasPagoProveedor(next);
    }
    if (!autoFillPagoProveedorRef.current) {
      autoFillPagoProveedorRef.current = true;
      const sugerido = Number(
        resumenProveedorParaPago?.pendienteNeto ??
          resumenProveedorParaPago?.pendienteBruto ??
          0
      );
      const saldoCuenta = Number(calcularSaldoCuenta(cuentaSeleccionada) || 0);
      const current = parseMoneyARS(montoPago);
      const shouldAutofill =
        !Number.isFinite(current) ||
        current <= 0 ||
        Math.abs(Number(current) - saldoCuenta) < 0.01;
      if (shouldAutofill && Number.isFinite(sugerido) && sugerido > 0) {
        setMontoPago(String(sugerido));
      }
    }
  }, [openPago, pagoModo, cuentasPendientesProveedorParaPago, resumenProveedorParaPago, cuentaSeleccionada, montoPago]);

  const handleRegistrarPago = async () => {
    if (!cuentaSeleccionada) return;
    const montoIngresado = parseMoneyARS(montoPago);
    if (!Number.isFinite(montoIngresado) || montoIngresado <= 0) {
      toast({ title: "Monto inválido", description: "Ingresá un monto válido.", color: "warning" });
      return;
    }
    if (pagoModo === "proveedor") {
      const provId = String(cuentaSeleccionada?.proveedorId || "").trim();
      if (!provId) {
        toast({ title: "Proveedor inválido", description: "No se encontró el proveedor de la cuenta.", color: "warning" });
        return;
      }
      const cuentasSeleccionadas = Object.keys(cuentasSeleccionadasPagoProveedor || {}).filter(
        (id) => cuentasSeleccionadasPagoProveedor?.[id]
      );
      if (cuentasSeleccionadas.length === 0) {
        toast({ title: "Seleccioná cuentas", description: "Elegí al menos una cuenta con saldo pendiente.", color: "warning" });
        return;
      }
    }
    
    setGuardando(true);
    try {
      if (!user || typeof user.getIdToken !== "function") throw new Error("No hay usuario autenticado");
      const idToken = await user.getIdToken();

      if (pagoModo === "proveedor") {
        const provId = String(cuentaSeleccionada?.proveedorId || "").trim();
        const cuentasSeleccionadas = Object.keys(cuentasSeleccionadasPagoProveedor || {}).filter(
          (id) => cuentasSeleccionadasPagoProveedor?.[id]
        );

        const resp = await fetch(`/api/erp/proveedores/${encodeURIComponent(provId)}/pago-global`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${idToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            monto: montoIngresado,
            fecha: fechaPago,
            metodo: metodoPago,
            notas: notasPago,
            pagoEnDolares: !!pagoEnDolares,
            valorOficialDolar: pagoEnDolares ? (valorOficialDolar ?? null) : null,
            comprobantes: comprobantesPago || [],
            cuentasSeleccionadas,
            origen: "ui_gastos_pago_proveedor",
          }),
        });
        const out = await resp.json().catch(() => ({}));
        if (!resp.ok || !out?.ok) throw new Error(out?.error || "Error al registrar el pago");
        await cargarDatos({ silent: true });
        setOpenPago(false);
        setCuentaSeleccionada(null);
        setMontoPago("");
        setFechaPago(new Date().toISOString().split("T")[0]);
        setMetodoPago("Efectivo");
        setNotasPago("");
        setPagoEnDolares(false);
        setValorOficialDolar(null);
        setComprobantesPago([]);
        setPagoModo("cuenta");
        setCuentasSeleccionadasPagoProveedor({});
        toast({
          title: "Pago registrado",
          description: out?.saldoAFavorDespues != null ? `Saldo a favor: ${formatMoneyARS(Number(out.saldoAFavorDespues || 0))}` : "Pago aplicado al proveedor.",
          color: "success",
        });
        return;
      }

      const call = async (permitirExcedenteASaldoAFavor) => {
        const resp = await fetch(
          `/api/erp/cuentas-pagar/${encodeURIComponent(String(cuentaSeleccionada.id))}/registrar-pago`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${idToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              monto: montoIngresado,
              fecha: fechaPago,
              metodo: metodoPago,
              notas: notasPago,
              pagoEnDolares: !!pagoEnDolares,
              valorOficialDolar: pagoEnDolares ? (valorOficialDolar ?? null) : null,
              comprobantes: comprobantesPago || [],
              permitirExcedenteASaldoAFavor: !!permitirExcedenteASaldoAFavor,
              origen: "ui_gastos_pago_manual",
            }),
          }
        );
        const out = await resp.json().catch(() => ({}));
        return { resp, out };
      };

      let { resp, out } = await call(false);
      if (resp.status === 409) {
        const ok = await confirmAsync({
          title: "Excedente de pago",
          description:
            "El monto supera el saldo pendiente de la cuenta. ¿Querés enviar el excedente a saldo a favor del proveedor?",
          confirmText: "Enviar a saldo a favor",
          cancelText: "Cancelar",
          confirmColor: "success",
        });
        if (!ok) throw new Error(out?.error || "Monto excede saldo pendiente");
        ({ resp, out } = await call(true));
      }
      if (!resp.ok || !out?.ok) throw new Error(out?.error || "Error al registrar el pago");
      
      // Recargar datos para reflejar cambios dinámicamente
      await cargarDatos({ silent: true });
      
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
      toast({ title: "Error", description: `Error al registrar el pago: ${error.message}`, color: "destructive" });
    } finally {
      setGuardando(false);
    }
  };

  const calcularEstadoPago = (montoPagado, montoTotal) => {
    if (montoPagado >= montoTotal) return "pagado";
    if (montoPagado > 0) return "parcial";
    return "pendiente";
  };

  const handleAnularCuentaProveedor = async (cuenta) => {
    const cuentaId = String(cuenta?.id || "").trim();
    if (!cuentaId) return;
    const ok = await confirmAsync({
      title: "Anular cuenta",
      description: "¿Anular esta cuenta por pagar? No se borrará información y quedará trazabilidad.",
      confirmText: "Anular",
      cancelText: "Cancelar",
      confirmColor: "destructive",
    });
    if (!ok) return;
    setGuardando(true);
    try {
      if (!user || typeof user.getIdToken !== "function") throw new Error("No hay usuario autenticado");
      const idToken = await user.getIdToken();
      const resp = await fetch(`/api/erp/cuentas-pagar/${encodeURIComponent(cuentaId)}/anular`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${idToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ motivo: "", origen: "ui_gastos_anular_cuenta" }),
      });
      const out = await resp.json().catch(() => ({}));
      if (!resp.ok || !out?.ok) throw new Error(out?.error || "Error al anular la cuenta");
      await cargarDatos({ silent: true });
      if (cuentaSeleccionada?.id === cuentaId) {
        setOpenHistorial(false);
        setCuentaSeleccionada(null);
      }
    } catch (e) {
      console.error("Error al anular cuenta:", e);
      toast({
        title: "Error",
        description: `Error al anular la cuenta: ${e?.message || String(e)}`,
        color: "destructive",
      });
    } finally {
      setGuardando(false);
    }
  };

  const handleAnularMovimientoProveedorDoc = async (mov) => {
    if (!mov) return;
    if (mov?.anulado === true) {
      toast({ title: "Movimiento anulado", description: "Este movimiento ya está anulado.", color: "warning" });
      return;
    }
    const pagoId = String(mov?.id || "").trim();
    if (!pagoId) return;
    const ok = await confirmAsync({
      title: "Anular movimiento",
      description: "¿Anular este movimiento? Esto revertirá su impacto y mantendrá trazabilidad.",
      confirmText: "Anular",
      cancelText: "Cancelar",
      confirmColor: "destructive",
    });
    if (!ok) return;
    if (!user || typeof user.getIdToken !== "function") {
      toast({ title: "Error", description: "No hay usuario autenticado.", color: "destructive" });
      return;
    }
    setGuardando(true);
    try {
      const idToken = await user.getIdToken();
      const resp = await fetch(`/api/erp/pagos-proveedores/${encodeURIComponent(pagoId)}/anular`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${idToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ origen: "ui_gastos", motivo: "" }),
      });
      const out = await resp.json().catch(() => ({}));
      if (!resp.ok || !out?.ok) throw new Error(out?.error || "Error al anular");
      await cargarDatos({ silent: true });
    } catch (e) {
      console.error("Error al anular movimiento:", e);
      toast({
        title: "Error",
        description: `Error al anular movimiento: ${e?.message || String(e)}`,
        color: "destructive",
      });
    } finally {
      setGuardando(false);
    }
  };

  const limpiarEstadoQuitarSaldo = () => {
    setMontoQuitarSaldo("");
    setFechaQuitarSaldo(new Date().toISOString().split("T")[0]);
    setMetodoQuitarSaldo("Ajuste");
    setNotasQuitarSaldo("");
  };

  const limpiarEstadoAgregarSaldo = () => {
    setMontoAgregarSaldo("");
    setFechaAgregarSaldo(new Date().toISOString().split("T")[0]);
    setMetodoAgregarSaldo("Efectivo");
    setNotasAgregarSaldo("");
    setComprobantesAgregarSaldo([]);
    setAdelantoEnDolares(false);
    setAdelantoValorOficialDolar(null);
  };

  const abrirAgregarSaldoAFavor = ({ proveedorId, proveedorNombre, saldoAFavor }) => {
    const provId = String(proveedorId || "").trim();
    if (!provId) return;
    setProveedorAgregarSaldo({
      id: provId,
      nombre: String(proveedorNombre || "Proveedor"),
      saldoAFavor: Number(saldoAFavor || 0),
    });
    setMontoAgregarSaldo("");
    setOpenAgregarSaldoAFavor(true);
  };

  const abrirQuitarSaldoAFavor = (grupo) => {
    const provId = grupo?.proveedor?.id || grupo?.proveedorId || "";
    if (!provId) return;
    const saldo = Number(grupo?.saldoAFavor || 0);
    if (!(saldo > 0)) return;
    setProveedorQuitarSaldo({
      id: provId,
      nombre: grupo?.proveedor?.nombre || "Proveedor",
      saldoAFavor: saldo,
    });
    setMontoQuitarSaldo(String(saldo));
    setOpenQuitarSaldoAFavor(true);
  };

  const handleAplicarSaldoAFavor = async (grupo) => {
    const provId = String(grupo?.proveedor?.id || grupo?.proveedorId || "").trim();
    if (!provId) return;
    const saldo = Number(grupo?.saldoAFavor || 0);
    if (!(saldo > 0)) return;
    const ok = await confirmAsync({
      title: "Aplicar saldo a favor",
      description: "¿Aplicar el saldo a favor a las cuentas pendientes del proveedor?",
      confirmText: "Aplicar",
      cancelText: "Cancelar",
      confirmColor: "success",
    });
    if (!ok) return;
    setGuardando(true);
    try {
      if (!user || typeof user.getIdToken !== "function") throw new Error("No hay usuario autenticado");
      const idToken = await user.getIdToken();
      const resp = await fetch(
        `/api/erp/proveedores/${encodeURIComponent(provId)}/aplicar-saldo-a-favor`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${idToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            fecha: new Date().toISOString().split("T")[0],
            metodo: "Saldo a favor",
            notas: "Aplicación de saldo a favor",
            origen: "ui_gastos_aplicar_saldo_a_favor",
          }),
        }
      );
      const out = await resp.json().catch(() => ({}));
      if (!resp.ok || !out?.ok) throw new Error(out?.error || "Error al aplicar saldo a favor");
      await cargarDatos({ silent: true });
      toast({
        title: "Saldo aplicado",
        description: `Aplicado a cuentas: ${formatMoneyARS(Number(out.aplicadoACuentas || 0))} · Saldo a favor restante: ${formatMoneyARS(
          Number(out.saldoAFavorDespues || 0)
        )}`,
        color: "success",
      });
    } catch (e) {
      toast({
        title: "Error",
        description: `Error al aplicar saldo a favor: ${e?.message || "Error"}`,
        color: "destructive",
      });
    } finally {
      setGuardando(false);
    }
  };

  const handleQuitarSaldoAFavor = async () => {
    if (!proveedorQuitarSaldo?.id) {
      toast({ title: "Proveedor inválido", description: "No se pudo identificar el proveedor.", color: "warning" });
      return;
    }
    const monto = parseMoneyARS(montoQuitarSaldo);
    if (!Number.isFinite(monto) || monto <= 0) {
      toast({ title: "Monto inválido", description: "Ingresá un monto válido para quitar.", color: "warning" });
      return;
    }
    setGuardando(true);
    try {
      if (!user || typeof user.getIdToken !== "function") throw new Error("No hay usuario autenticado");
      const idToken = await user.getIdToken();
      const resp = await fetch(
        `/api/erp/proveedores/${encodeURIComponent(String(proveedorQuitarSaldo.id))}/saldo-a-favor`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${idToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            monto,
            fecha: fechaQuitarSaldo,
            metodo: metodoQuitarSaldo,
            notas: notasQuitarSaldo,
            origen: "ui_gastos_quitar_saldo_a_favor",
          }),
        }
      );
      const out = await resp.json().catch(() => ({}));
      if (!resp.ok || !out?.ok) throw new Error(out?.error || "Error al quitar saldo a favor");
      await cargarDatos({ silent: true });
      setOpenQuitarSaldoAFavor(false);
      setProveedorQuitarSaldo(null);
      limpiarEstadoQuitarSaldo();
    } catch (e) {
      toast({
        title: "Error",
        description: `Error al quitar saldo a favor: ${e?.message || "Error"}`,
        color: "destructive",
      });
    } finally {
      setGuardando(false);
    }
  };

  const handleAgregarSaldoAFavor = async () => {
    if (!proveedorAgregarSaldo?.id) {
      toast({ title: "Proveedor inválido", description: "No se pudo identificar el proveedor.", color: "warning" });
      return;
    }
    const monto = parseMoneyARS(montoAgregarSaldo);
    if (!Number.isFinite(monto) || monto <= 0) {
      toast({ title: "Monto inválido", description: "Ingresá un monto válido para adelantar.", color: "warning" });
      return;
    }
    setGuardando(true);
    try {
      if (!user || typeof user.getIdToken !== "function") throw new Error("No hay usuario autenticado");
      const idToken = await user.getIdToken();
      const resp = await fetch(
        `/api/erp/proveedores/${encodeURIComponent(String(proveedorAgregarSaldo.id))}/saldo-a-favor`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${idToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "agregar",
            monto,
            fecha: fechaAgregarSaldo,
            metodo: metodoAgregarSaldo,
            notas: notasAgregarSaldo,
            pagoEnDolares: !!adelantoEnDolares,
            valorOficialDolar: adelantoEnDolares ? (adelantoValorOficialDolar ?? null) : null,
            comprobantes: comprobantesAgregarSaldo,
            origen: "ui_gastos_agregar_saldo_a_favor",
          }),
        }
      );
      const out = await resp.json().catch(() => ({}));
      if (!resp.ok || !out?.ok) throw new Error(out?.error || "Error al adelantar saldo a favor");
      await cargarDatos({ silent: true });
      setOpenAgregarSaldoAFavor(false);
      setProveedorAgregarSaldo(null);
      limpiarEstadoAgregarSaldo();
      toast({
        title: "Adelanto registrado",
        description: `Saldo a favor actualizado: ${formatMoneyARS(Number(out.saldoAFavorDespues || 0))}`,
        color: "success",
      });
    } catch (e) {
      toast({
        title: "Error",
        description: `Error al adelantar saldo a favor: ${e?.message || "Error"}`,
        color: "destructive",
      });
    } finally {
      setGuardando(false);
    }
  };

  // Cotización oficial BNA: usa el promedio entre compra y venta
  const fetchDolarBlue = useCallback(async ({ target } = {}) => {
    setLoadingDolar(true);
    try {
      const res = await fetch("/api/dolar-blue");
      const data = await res.json();
      if (res.ok && data?.referencia != null) {
        const value = Number(data.referencia);
        const next = Number.isFinite(value) ? value : null;
        const tgt = String(target || "pago");
        if (tgt === "adelanto") {
          setAdelantoValorOficialDolar(next);
        } else {
          setValorOficialDolar(next);
        }
        setUltimaActualizacionDolar(data.fechaActualizacion ? new Date(data.fechaActualizacion) : new Date());
      }
    } catch (err) {
      console.warn("Error al obtener dólar oficial BNA:", err);
    } finally {
      setLoadingDolar(false);
    }
  }, []);

  useEffect(() => {
    const shouldAutoUpdate =
      (openPago && pagoEnDolares) || (openAgregarSaldoAFavor && adelantoEnDolares);
    if (!shouldAutoUpdate) return;
    const target = openAgregarSaldoAFavor && adelantoEnDolares ? "adelanto" : "pago";
    fetchDolarBlue({ target });
    const interval = setInterval(() => fetchDolarBlue({ target }), 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [openPago, pagoEnDolares, openAgregarSaldoAFavor, adelantoEnDolares, fetchDolarBlue]);

  // Guardar edición de un pago existente
  const handleGuardarEdicionPago = async () => {
    if (!cuentaSeleccionada || !pagoEdit) return;
    if (cuentaSeleccionada.movimientoSaldoAFavor || cuentaSeleccionada.movimientoPagoGlobalProveedor) {
      toast({
        title: "Acción no disponible",
        description: "Este movimiento no se edita desde aquí. Anulá el movimiento desde Cuentas por Pagar.",
        color: "warning",
      });
      return;
    }
    if (pagoEdit?.pagoGlobalProveedor) {
      toast({
        title: "Acción no disponible",
        description: "Este pago proviene de un pago global. No se puede editar desde aquí.",
        color: "warning",
      });
      return;
    }
    setGuardando(true);
    try {
      if (!user || typeof user.getIdToken !== "function") throw new Error("No hay usuario autenticado");
      const idToken = await user.getIdToken();

      const resp = await fetch(
        `/api/erp/cuentas-pagar/${encodeURIComponent(String(cuentaSeleccionada.id))}/pagos/mutar`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${idToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "edit",
            idx: pagoEdit.idx,
            pago: {
              monto: Number(pagoEdit.monto),
              fecha: pagoEdit.fecha,
              metodo: pagoEdit.metodo,
              notas: pagoEdit.notas || "",
              responsable: pagoEdit.responsable || user?.email || "Usuario no identificado",
              pagoEnDolares: !!pagoEdit.pagoEnDolares,
              valorOficialDolar: pagoEdit.pagoEnDolares ? (pagoEdit.valorOficialDolar ?? null) : null,
              comprobantes: pagoEdit.comprobantes || [],
            },
            origen: "ui_gastos_editar_pago_manual",
          }),
        }
      );
      const out = await resp.json().catch(() => ({}));
      if (!resp.ok || !out?.ok) throw new Error(out?.error || "Error al guardar la edición");

      await cargarDatos({ silent: true });
      setOpenEditarPago(false);
      setPagoEdit(null);
    } catch (err) {
      console.error("Error al guardar edición de pago:", err);
      toast({
        title: "Error",
        description: `Error al guardar la edición: ${err.message}`,
        color: "destructive",
      });
    } finally {
      setGuardando(false);
    }
  };

  const handleEliminarPago = async (idx) => {
    if (!cuentaSeleccionada) return;
    if (cuentaSeleccionada.movimientoSaldoAFavor || cuentaSeleccionada.movimientoPagoGlobalProveedor) {
      toast({
        title: "Acción no disponible",
        description: "Este movimiento no se elimina desde aquí. Anulá el movimiento desde Cuentas por Pagar.",
        color: "warning",
      });
      return;
    }
    const pagosArr = Array.isArray(cuentaSeleccionada.pagos) ? cuentaSeleccionada.pagos : [];
    const target = pagosArr[idx];
    if (target?.pagoGlobalProveedor) {
      toast({
        title: "Acción no disponible",
        description: "Este pago proviene de un pago global. No se puede eliminar desde aquí.",
        color: "warning",
      });
      return;
    }
    const ok = await confirmAsync({
      title: "Eliminar pago",
      description: "¿Eliminar este pago? Esta acción no se puede deshacer.",
      confirmText: "Eliminar",
      cancelText: "Cancelar",
      confirmColor: "destructive",
    });
    if (!ok) return;
    setGuardando(true);
    try {
      if (!user || typeof user.getIdToken !== "function") throw new Error("No hay usuario autenticado");
      const idToken = await user.getIdToken();

      const resp = await fetch(
        `/api/erp/cuentas-pagar/${encodeURIComponent(String(cuentaSeleccionada.id))}/pagos/mutar`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${idToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "delete",
            idx,
            origen: "ui_gastos_eliminar_pago_manual",
          }),
        }
      );
      const out = await resp.json().catch(() => ({}));
      if (!resp.ok || !out?.ok) throw new Error(out?.error || "Error al eliminar el pago");

      await cargarDatos({ silent: true });
      // cerrar edición si estaba abierto sobre ese índice
      setOpenEditarPago(false);
      setPagoEdit(null);
    } catch (err) {
      console.error("Error al eliminar pago:", err);
      toast({
        title: "Error",
        description: `Error al eliminar el pago: ${err.message}`,
        color: "destructive",
      });
    } finally {
      setGuardando(false);
    }
  };

  const handleAnularMovimientoProveedor = async (item) => {
    if (!item) return;
    const esPagoGlobalProveedor = !!item.movimientoPagoGlobalProveedor;
    const esSaldoAFavor = !!item.movimientoSaldoAFavor;
    if (!esPagoGlobalProveedor && !esSaldoAFavor) return;

    const pagoId = esPagoGlobalProveedor
      ? String(item.id || "").replace(/^pagoGlobal_/, "")
      : String(item.id || "").replace(/^saldoAFavor_/, "");

    if (!pagoId) {
      toast({ title: "Movimiento inválido", description: "No se pudo identificar el movimiento.", color: "warning" });
      return;
    }

    const label = esPagoGlobalProveedor ? "pago global" : "movimiento de saldo a favor";
    const ok = await confirmAsync({
      title: "Anular movimiento",
      description: `¿Anular este ${label}? Esto revertirá el saldo a favor y, si corresponde, los pagos aplicados.`,
      confirmText: "Anular",
      cancelText: "Cancelar",
      confirmColor: "destructive",
    });
    if (!ok) return;

    if (!user || typeof user.getIdToken !== "function") {
      toast({ title: "Error", description: "No hay usuario autenticado.", color: "destructive" });
      return;
    }

    setGuardando(true);
    try {
      const idToken = await user.getIdToken();
      const resp = await fetch(`/api/erp/pagos-proveedores/${encodeURIComponent(pagoId)}/anular`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${idToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ origen: "ui_gastos", motivo: "" }),
      });
      const out = await resp.json().catch(() => ({}));
      if (!resp.ok || !out?.ok) {
        throw new Error(out?.error || "Error al anular");
      }
      await cargarDatos({ silent: true });
      setOpenHistorial(false);
      setCuentaSeleccionada(null);
    } catch (e) {
      console.error("Error al anular movimiento:", e);
      toast({
        title: "Error",
        description: `Error al anular movimiento: ${e?.message || String(e)}`,
        color: "destructive",
      });
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
    if (tipo === "proveedor") {
      toast({
        title: "Acción no disponible",
        description: "Las cuentas por pagar no se eliminan. Usá la acción Anular para mantener trazabilidad.",
        color: "warning",
      });
      return;
    }
    const ok = await confirmAsync({
      title: "Eliminar registro",
      description: "¿Estás seguro de que querés eliminar este registro?",
      confirmText: "Eliminar",
      cancelText: "Cancelar",
      confirmColor: "destructive",
    });
    if (!ok) return;
    
    try {
      await deleteDoc(doc(db, "gastos", id));
      // Recargar datos para reflejar cambios dinámicamente
      await cargarDatos({ silent: true });
    } catch (error) {
      console.error("Error al eliminar:", error);
      toast({ title: "Error", description: `Error al eliminar: ${error.message}`, color: "destructive" });
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

  const movimientosProveedorFiltradosPorFecha = useMemo(() => {
    return movimientosProveedor.filter((m) => isInRange(m.fecha));
  }, [movimientosProveedor, isInRange]);

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
    const resumen = calcularResumenGeneral({
      cuentas: cuentasPorPagarFiltradasPorFecha,
      proveedores,
      movimientos: movimientosProveedorFiltradosPorFecha,
    });
    const montoVencido = cuentasPorPagarFiltradasPorFecha
      .filter((c) => esCuentaVencida(c))
      .reduce((acc, c) => acc + calcularSaldoCuenta(c), 0);
    return {
      total: resumen.totalCuentas,
      pagado: resumen.totalPagado,
      pendienteBruto: resumen.saldoPendienteBruto,
      saldoAFavor: resumen.saldoAFavorTotal,
      pendienteNeto: resumen.saldoPendienteNeto,
      excedenteSaldoAFavor: resumen.excedenteSaldoAFavor,
      porEstado: {
        pendiente: resumen.cuentasPendientes,
        parcial: resumen.cuentasParciales,
        pagado: resumen.cuentasPagadas,
        anulada: cuentasPorPagarFiltradasPorFecha.filter((c) => esCuentaAnulada(c)).length,
      },
      vencidas: resumen.cuentasVencidas,
      montoVencido,
      movimientosAnulados: resumen.movimientosAnulados,
    };
  }, [cuentasPorPagarFiltradasPorFecha, proveedores, movimientosProveedorFiltradosPorFecha]);

  // Agrupar cuentas por proveedor (usando datos filtrados por fecha)
  const cuentasPorProveedor = useMemo(() => {
    const provs = Array.isArray(proveedores) ? proveedores : [];
    const cuentas = Array.isArray(cuentasPorPagarFiltradasPorFecha) ? cuentasPorPagarFiltradasPorFecha : [];
    const movs = Array.isArray(movimientosProveedorFiltradosPorFecha) ? movimientosProveedorFiltradosPorFecha : [];

    const items = provs.map((p) => {
      const resumen = calcularResumenProveedor({
        proveedorId: p.id,
        cuentas,
        proveedor: p,
        movimientos: movs,
      });
      const cuentasProv = cuentas.filter((c) => String(c?.proveedorId || "") === String(p.id || ""));
      return { ...resumen, cuentas: cuentasProv };
    });

    const visibles = items.filter((i) => {
      const tieneCuentas = Array.isArray(i.cuentas) && i.cuentas.length > 0;
      const tieneSaldo = Number(i.saldoAFavor || 0) > 0;
      return tieneCuentas || tieneSaldo;
    });

    return visibles.sort((a, b) => Number(b.saldoPendienteNeto || 0) - Number(a.saldoPendienteNeto || 0));
  }, [cuentasPorPagarFiltradasPorFecha, proveedores, movimientosProveedorFiltradosPorFecha]);

  // Filtrar datos (aplicando filtros de búsqueda sobre los datos ya filtrados por fecha)
  const gastosInternosFiltrados = useMemo(() => {
    return gastosInternosFiltradosPorFecha.filter(g => {
      const busqueda = filtroInterno.toLowerCase();
      return (g.concepto || "").toLowerCase().includes(busqueda) ||
             (g.observaciones || "").toLowerCase().includes(busqueda);
    });
  }, [gastosInternosFiltradosPorFecha, filtroInterno]);

  const cuentasPorPagarFiltradas = useMemo(() => {
    return cuentasPorPagarFiltradasPorFecha.filter((c) => {
      const busqueda = filtroProveedor.toLowerCase();
      const matchBusqueda = (c.proveedor?.nombre || "").toLowerCase().includes(busqueda);
      const estadoCalc = calcularEstadoCuenta(c);
      const matchEstado = !filtroEstadoPago || estadoCalc === filtroEstadoPago;
      const matchProveedorId = !filtroProveedorId || c.proveedorId === filtroProveedorId;
      return matchBusqueda && matchEstado && matchProveedorId;
    });
  }, [cuentasPorPagarFiltradasPorFecha, filtroProveedor, filtroEstadoPago, filtroProveedorId]);

  const movimientosProveedorFiltrados = useMemo(() => {
    const busqueda = filtroProveedor.toLowerCase();
    const getProveedorNombre = (m) =>
      String(
        m?.proveedor?.nombre ||
          proveedores.find((p) => p.id === m?.proveedorId)?.nombre ||
          ""
      ).toLowerCase();
    const sortKey = (m) => m.fechaRegistro || m.fechaActualizacion || m.fechaCreacion || m.fecha;
    return movimientosProveedorFiltradosPorFecha
      .filter((m) => {
        const matchBusqueda = getProveedorNombre(m).includes(busqueda);
        const matchProveedorId = !filtroProveedorId || String(m?.proveedorId || "") === String(filtroProveedorId || "");
        return matchBusqueda && matchProveedorId;
      })
      .sort((a, b) => new Date(sortKey(b) || 0) - new Date(sortKey(a) || 0));
  }, [movimientosProveedorFiltradosPorFecha, filtroProveedor, filtroProveedorId, proveedores]);

  // Exportar reporte de cuentas por pagar
  const exportarReporteCuentas = () => {
    if (cuentasPorPagarFiltradas.length === 0) {
      toast({ title: "Sin datos", description: "No hay datos para exportar.", color: "warning" });
      return;
    }

    const resumenPorProveedor = cuentasPorProveedor.reduce((acc, g) => {
      if (g?.proveedorId) acc[g.proveedorId] = g;
      return acc;
    }, {});

    const datos = cuentasPorPagarFiltradas.map((c) => {
      const estado = calcularEstadoCuenta(c);
      return {
        Fecha: formatFechaAR(c.fecha),
        Proveedor: c.proveedor?.nombre || "",
        Total: Number(c.monto || 0),
        Pagado: Number(c.montoPagado || 0),
        Saldo: Number(calcularSaldoCuenta(c) || 0),
        Vencimiento: c.fechaVencimiento ? formatFechaAR(c.fechaVencimiento) : "",
        Estado: estado,
        Responsable: String(c.responsable || ""),
        "Saldo a favor (prov)": Number(resumenPorProveedor[c.proveedorId]?.saldoAFavor || 0),
        "Pendiente bruto (prov)": Number(resumenPorProveedor[c.proveedorId]?.saldoPendienteBruto || resumenPorProveedor[c.proveedorId]?.pendienteBruto || 0),
        "Pendiente neto (prov)": Number(resumenPorProveedor[c.proveedorId]?.saldoPendienteNeto || resumenPorProveedor[c.proveedorId]?.pendienteNeto || 0),
      };
    });

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

  const pagosDetalleCuentaSeleccionada = useMemo(() => {
    const c = cuentaSeleccionada;
    if (!c) return [];

    const pagos = Array.isArray(c?.pagos) ? c.pagos : [];
    const normalizados = pagos.map((p, idx) => {
      const monto = Number(p?.monto ?? 0);
      const fecha = formatFechaSegura(p?.fecha);
      const fechaRegistro =
        (typeof p?.fechaRegistro === "string" ? p.fechaRegistro : "") ||
        (typeof p?.fechaActualizacion === "string" ? p.fechaActualizacion : "") ||
        (typeof p?.fechaCreacion === "string" ? p.fechaCreacion : "");
      const esReversion = p?.pagoGlobalReversion === true || String(p?.metodo || "") === "Anulación" || monto < 0;
      const esGlobal = p?.pagoGlobalProveedor === true;
      const esSaldoAFavor = p?.saldoAFavorAplicado === true;
      const kind = esReversion ? "reversion" : esSaldoAFavor ? "saldoAFavor" : esGlobal ? "pagoGlobal" : "manual";
      const sortKey = fechaRegistro || fecha || "";
      return {
        ...p,
        _idxOriginal: idx,
        _kind: kind,
        _monto: monto,
        _fecha: fecha,
        _fechaRegistro: fechaRegistro,
        _sortKey: sortKey,
        _origenMovimiento: false,
        _movimientoAnulado: false,
      };
    });

    const yaTieneGlobal = normalizados.some((p) => p._kind !== "manual");
    if (!yaTieneGlobal && c?.id) {
      const movs = Array.isArray(movimientosProveedor) ? movimientosProveedor : [];
      const movimientosRelacionados = movs.filter((m) => {
        const tipo = String(m?.tipo || "");
        if (tipo !== "pagoGlobal" && tipo !== "saldoAFavor") return false;
        const apps = Array.isArray(m?.cuentasAplicadas) ? m.cuentasAplicadas : [];
        return apps.some((a) => String(a?.cuentaId || "") === String(c.id || ""));
      });

      for (const m of movimientosRelacionados) {
        const apps = Array.isArray(m?.cuentasAplicadas) ? m.cuentasAplicadas : [];
        const app = apps.find((a) => String(a?.cuentaId || "") === String(c.id || ""));
        if (!app) continue;
        const montoAplicado = Number(app?.montoAplicado ?? 0);
        normalizados.push({
          monto: montoAplicado,
          fecha: formatFechaSegura(m?.fecha),
          metodo: m?.metodo || "Pago global",
          notas: m?.notas || "",
          responsable: m?.responsable || "",
          fechaRegistro: m?.fechaRegistro || "",
          pagoEnDolares: !!m?.pagoEnDolares,
          valorOficialDolar: m?.valorOficialDolar ?? null,
          comprobantes: Array.isArray(m?.comprobantes) ? m.comprobantes : [],
          pagoGlobalProveedor: true,
          saldoAFavorAplicado: String(m?.tipo || "") === "saldoAFavor",
          pagoGlobalId: m.id,
          _idxOriginal: null,
          _kind: String(m?.tipo || "") === "saldoAFavor" ? "saldoAFavor" : "pagoGlobal",
          _monto: montoAplicado,
          _fecha: formatFechaSegura(m?.fecha),
          _fechaRegistro: typeof m?.fechaRegistro === "string" ? m.fechaRegistro : "",
          _sortKey: m?.fechaRegistro || m?.fecha || "",
          _origenMovimiento: true,
          _movimientoAnulado: m?.anulado === true,
        });
      }
    }

    return normalizados.sort((a, b) => new Date(b._sortKey || 0) - new Date(a._sortKey || 0));
  }, [cuentaSeleccionada, movimientosProveedor]);

  const resumenProveedorPagosSeleccionado = useMemo(() => {
    const id = String(proveedorPagosSeleccionadoId || "");
    const grupo = id
      ? cuentasPorProveedor.find((g) => String(g?.proveedorId || g?.proveedor?.id || "") === id) || null
      : null;
    if (!grupo) return null;
    const cuentasGrupo = Array.isArray(grupo?.cuentas) ? grupo.cuentas : [];
    const cuentasActivasGrupo = cuentasGrupo.filter((c) => !esCuentaAnulada(c));
    const totalActivo = cuentasActivasGrupo.reduce((acc, c) => acc + (Number(c?.monto) || 0), 0);
    const pagadoActivo = cuentasActivasGrupo.reduce((acc, c) => acc + (Number(c?.montoPagado) || 0), 0);
    const saldoPendienteBruto = cuentasActivasGrupo.reduce((acc, c) => acc + calcularSaldoCuenta(c), 0);
    const saldoAFavor = Number(grupo?.saldoAFavor || grupo?.proveedor?.saldoAFavor || 0);
    const saldoPendienteNeto = Math.max(saldoPendienteBruto - saldoAFavor, 0);
    const saldoAFavorRestante = Math.max(saldoAFavor - saldoPendienteBruto, 0);
    const netoLabel = saldoPendienteNeto > 0 ? "Saldo pendiente (neto)" : "Saldo a favor (remanente)";
    const netoValor = saldoPendienteNeto > 0 ? saldoPendienteNeto : saldoAFavorRestante;
    return {
      proveedorId: grupo?.proveedorId || grupo?.proveedor?.id || "",
      proveedorNombre: grupo?.proveedor?.nombre || "Proveedor",
      cuentasActivas: Number(cuentasActivasGrupo.length || 0),
      totalActivo,
      pagadoActivo,
      saldoPendienteBruto,
      saldoAFavor,
      saldoPendienteNeto,
      saldoAFavorRestante,
      netoLabel,
      netoValor,
    };
  }, [proveedorPagosSeleccionadoId, cuentasPorProveedor]);

  const pagosDetalleProveedorSeleccionado = useMemo(() => {
    const id = String(proveedorPagosSeleccionadoId || "");
    const grupo = id
      ? cuentasPorProveedor.find((g) => String(g?.proveedorId || g?.proveedor?.id || "") === id) || null
      : null;
    if (!grupo) return [];

    const cuentasGrupo = Array.isArray(grupo?.cuentas) ? grupo.cuentas : [];
    const provId = String(grupo?.proveedorId || grupo?.proveedor?.id || "");

    const normalizados = [];
    for (const c of cuentasGrupo) {
      const pagos = Array.isArray(c?.pagos) ? c.pagos : [];
      const cuentaId = String(c?.id || "");
      const cuentaFecha = formatFechaSegura(c?.fecha);
      const cuentaAnulada = esCuentaAnulada(c);

      for (let idx = 0; idx < pagos.length; idx += 1) {
        const p = pagos[idx];
        const monto = Number(p?.monto ?? 0);
        const fecha = formatFechaSegura(p?.fecha);
        const fechaRegistro =
          (typeof p?.fechaRegistro === "string" ? p.fechaRegistro : "") ||
          (typeof p?.fechaActualizacion === "string" ? p.fechaActualizacion : "") ||
          (typeof p?.fechaCreacion === "string" ? p.fechaCreacion : "");
        const esReversion = p?.pagoGlobalReversion === true || String(p?.metodo || "") === "Anulación" || monto < 0;
        const esGlobal = p?.pagoGlobalProveedor === true;
        const esSaldoAFavor = p?.saldoAFavorAplicado === true;
        const kind = esReversion ? "reversion" : esSaldoAFavor ? "saldoAFavor" : esGlobal ? "pagoGlobal" : "manual";
        const sortKey = fechaRegistro || fecha || "";

        normalizados.push({
          ...p,
          _idxOriginal: idx,
          _kind: kind,
          _monto: monto,
          _fecha: fecha,
          _fechaRegistro: fechaRegistro,
          _sortKey: sortKey,
          _rowId: `${cuentaId}|idx:${idx}|${sortKey || fecha || ""}`,
          _origenMovimiento: false,
          _movimientoAnulado: false,
          _cuentaId: cuentaId,
          _cuentaFecha: cuentaFecha,
          _cuentaAnulada: cuentaAnulada,
        });
      }
    }

    const movs = Array.isArray(movimientosProveedor) ? movimientosProveedor : [];
    const movimientosRelacionados = movs.filter((m) => {
      const tipo = String(m?.tipo || "");
      if (tipo !== "pagoGlobal" && tipo !== "saldoAFavor") return false;
      return String(m?.proveedorId || "") === provId;
    });

    const movimientosPorCuentaMonto = new Map();
    const movimientoById = movimientosRelacionados.reduce((acc, m) => {
      if (m?.id) acc[String(m.id)] = m;
      return acc;
    }, {});
    for (const m of movimientosRelacionados) {
      const apps = Array.isArray(m?.cuentasAplicadas) ? m.cuentasAplicadas : [];
      for (const a of apps) {
        const cuentaId = String(a?.cuentaId || "");
        const montoAplicado = Number(a?.montoAplicado ?? 0);
        const movimientoId = String(m?.id || "");
        if (!cuentaId || !movimientoId || !Number.isFinite(montoAplicado) || montoAplicado === 0) continue;
        const key = `${cuentaId}|${Number(montoAplicado).toFixed(2)}`;
        const sortKey = String(m?.fechaRegistro || m?.fecha || m?.fechaActualizacion || m?.fechaCreacion || "");
        if (!movimientosPorCuentaMonto.has(key)) movimientosPorCuentaMonto.set(key, []);
        movimientosPorCuentaMonto.get(key).push({ id: movimientoId, sortKey });
      }
    }

    for (const p of normalizados) {
      const kind = String(p?._kind || "");
      const requiereMovimiento =
        kind === "pagoGlobal" ||
        kind === "saldoAFavor" ||
        kind === "reversion" ||
        p?.pagoGlobalProveedor === true ||
        p?.saldoAFavorAplicado === true ||
        p?.pagoGlobalReversion === true;
      if (!requiereMovimiento) continue;

      const existing = String(p?.pagoGlobalId || "");
      if (existing) {
        p._movimientoAnulado = movimientoById?.[existing]?.anulado === true || p?._movimientoAnulado === true;
        p._rowId = `${String(p?._cuentaId || "")}|mov:${existing}|${String(p?._kind || "")}`;
        continue;
      }

      const cuentaId = String(p?._cuentaId || "");
      const montoAbs = Number(Math.abs(Number(p?._monto ?? p?.monto ?? 0)).toFixed(2));
      const key = `${cuentaId}|${Number(montoAbs).toFixed(2)}`;
      const candidates = movimientosPorCuentaMonto.get(key) || [];
      if (candidates.length > 0) {
        const pSort = new Date(String(p?._sortKey || "")).getTime();
        const pick =
          candidates.length === 1
            ? candidates[0]
            : candidates.reduce(
                (best, cur) => {
                  const curT = new Date(String(cur?.sortKey || "")).getTime();
                  const bestT = new Date(String(best?.sortKey || "")).getTime();
                  const curDiff = Number.isFinite(pSort) && Number.isFinite(curT) ? Math.abs(pSort - curT) : Number.POSITIVE_INFINITY;
                  const bestDiff = Number.isFinite(pSort) && Number.isFinite(bestT) ? Math.abs(pSort - bestT) : Number.POSITIVE_INFINITY;
                  return curDiff < bestDiff ? cur : best;
                },
                candidates[0]
              );
        const resolved = String(pick?.id || "");
        if (resolved) {
          p.pagoGlobalId = resolved;
          p._movimientoAnulado = movimientoById?.[resolved]?.anulado === true || p?._movimientoAnulado === true;
          p._rowId = `${String(p?._cuentaId || "")}|mov:${resolved}|${String(p?._kind || "")}`;
        }
      }
    }

    const existingByCuentaYMovimiento = new Set();
    for (const p of normalizados) {
      const movId = String(p?.pagoGlobalId || "");
      const cuentaId = String(p?._cuentaId || "");
      if (movId && cuentaId) existingByCuentaYMovimiento.add(`${cuentaId}|${movId}`);
    }

    for (const m of movimientosRelacionados) {
      const apps = Array.isArray(m?.cuentasAplicadas) ? m.cuentasAplicadas : [];
      for (const app of apps) {
        const cuentaId = String(app?.cuentaId || "");
        const key = `${cuentaId}|${String(m?.id || "")}`;
        if (!cuentaId || !m?.id || existingByCuentaYMovimiento.has(key)) continue;

        const cuenta = cuentasGrupo.find((c) => String(c?.id || "") === cuentaId) || null;
        normalizados.push({
          monto: Number(app?.montoAplicado ?? 0),
          fecha: formatFechaSegura(m?.fecha),
          metodo: m?.metodo || "Pago global",
          notas: m?.notas || "",
          responsable: m?.responsable || "",
          fechaRegistro: m?.fechaRegistro || "",
          pagoEnDolares: !!m?.pagoEnDolares,
          valorOficialDolar: m?.valorOficialDolar ?? null,
          comprobantes: Array.isArray(m?.comprobantes) ? m.comprobantes : [],
          pagoGlobalProveedor: true,
          saldoAFavorAplicado: String(m?.tipo || "") === "saldoAFavor",
          pagoGlobalId: m.id,
          _idxOriginal: null,
          _kind: String(m?.tipo || "") === "saldoAFavor" ? "saldoAFavor" : "pagoGlobal",
          _monto: Number(app?.montoAplicado ?? 0),
          _fecha: formatFechaSegura(m?.fecha),
          _fechaRegistro: typeof m?.fechaRegistro === "string" ? m.fechaRegistro : "",
          _sortKey: m?.fechaRegistro || m?.fecha || "",
          _rowId: `${cuentaId}|mov:${String(m?.id || "")}|${m?.fechaRegistro || m?.fecha || ""}`,
          _origenMovimiento: true,
          _movimientoAnulado: m?.anulado === true,
          _cuentaId: cuentaId,
          _cuentaFecha: formatFechaSegura(cuenta?.fecha),
          _cuentaAnulada: cuenta ? esCuentaAnulada(cuenta) : false,
        });
      }
    }

    const originalByKey = new Map();
    for (const p of normalizados) {
      const kind = String(p?._kind || "");
      const movId = String(p?.pagoGlobalId || "");
      const cuentaId = String(p?._cuentaId || "");
      if (!movId || !cuentaId) continue;
      if (kind === "reversion") continue;
      originalByKey.set(`${cuentaId}|${movId}`, p);
    }

    for (const p of normalizados) {
      const kind = String(p?._kind || "");
      if (kind !== "reversion") continue;
      const movId = String(p?.pagoGlobalId || "");
      const cuentaId = String(p?._cuentaId || "");
      if (!movId || !cuentaId) continue;
      const key = `${cuentaId}|${movId}`;
      const orig = originalByKey.get(key);
      if (orig) {
        orig._tieneReversion = true;
        orig._movimientoAnulado = true;
      }
    }

    const visibles = normalizados.filter((p) => {
      const kind = String(p?._kind || "");
      if (kind !== "reversion") return true;
      const movId = String(p?.pagoGlobalId || "");
      const cuentaId = String(p?._cuentaId || "");
      if (!movId || !cuentaId) return true;
      return !originalByKey.has(`${cuentaId}|${movId}`);
    });

    return visibles.sort((a, b) => new Date(b._sortKey || 0) - new Date(a._sortKey || 0));
  }, [proveedorPagosSeleccionadoId, cuentasPorProveedor, movimientosProveedor]);

  const movimientosDetalleProveedorSeleccionado = useMemo(() => {
    const id = String(proveedorPagosSeleccionadoId || "");
    const grupo = id
      ? cuentasPorProveedor.find((g) => String(g?.proveedorId || g?.proveedor?.id || "") === id) || null
      : null;
    if (!grupo) return [];
    const provId = String(grupo?.proveedorId || grupo?.proveedor?.id || "");
    const movs = Array.isArray(movimientosProveedor) ? movimientosProveedor : [];
    const sortKey = (m) => m.fechaRegistro || m.fechaActualizacion || m.fechaCreacion || m.fecha;
    return movs
      .filter((m) => String(m?.proveedorId || "") === provId)
      .filter((m) => {
        const tipo = String(m?.tipo || "");
        return tipo === "pagoGlobal" || tipo === "saldoAFavor";
      })
      .map((m) => ({
        ...m,
        _rowId: String(m?.id || ""),
      }))
      .sort((a, b) => new Date(sortKey(b) || 0) - new Date(sortKey(a) || 0));
  }, [proveedorPagosSeleccionadoId, cuentasPorProveedor, movimientosProveedor]);

  const cuentasProveedorSeleccionadoById = useMemo(() => {
    const id = String(proveedorPagosSeleccionadoId || "");
    const grupo = id
      ? cuentasPorProveedor.find((g) => String(g?.proveedorId || g?.proveedor?.id || "") === id) || null
      : null;
    const cuentas = Array.isArray(grupo?.cuentas) ? grupo.cuentas : [];
    return cuentas.reduce((acc, c) => {
      if (c?.id) acc[String(c.id)] = c;
      return acc;
    }, {});
  }, [proveedorPagosSeleccionadoId, cuentasPorProveedor]);

  const pagosProveedorByRowId = useMemo(() => {
    return pagosDetalleProveedorSeleccionado.reduce((acc, p) => {
      if (p?._rowId) acc[String(p._rowId)] = p;
      return acc;
    }, {});
  }, [pagosDetalleProveedorSeleccionado]);

  const movimientosProveedorByRowId = useMemo(() => {
    return movimientosDetalleProveedorSeleccionado.reduce((acc, m) => {
      if (m?._rowId) acc[String(m._rowId)] = m;
      return acc;
    }, {});
  }, [movimientosDetalleProveedorSeleccionado]);

  const pagosProveedorIds = useMemo(() => {
    return pagosDetalleProveedorSeleccionado.map((p) => String(p?._rowId || "")).filter(Boolean);
  }, [pagosDetalleProveedorSeleccionado]);

  const movimientosProveedorIds = useMemo(() => {
    return movimientosDetalleProveedorSeleccionado.map((m) => String(m?._rowId || "")).filter(Boolean);
  }, [movimientosDetalleProveedorSeleccionado]);

  const totalesTablaPagosProveedor = useMemo(() => {
    const selectedIds = Object.keys(pagosProveedorSeleccionados || {}).filter((k) => pagosProveedorSeleccionados[k]);
    const efectivo = (p) => {
      if (!p) return 0;
      if (p?._cuentaAnulada === true) return 0;
      if (p?._movimientoAnulado === true || p?._tieneReversion === true) return 0;
      return Number(p?._monto ?? 0);
    };
    const sumAll = pagosDetalleProveedorSeleccionado.reduce((acc, p) => acc + efectivo(p), 0);
    const sumSelected = selectedIds.reduce((acc, id) => acc + efectivo(pagosProveedorByRowId[id]), 0);
    return {
      countAll: pagosDetalleProveedorSeleccionado.length,
      sumAll: Number(sumAll.toFixed(2)),
      countSelected: selectedIds.length,
      sumSelected: Number(sumSelected.toFixed(2)),
    };
  }, [pagosDetalleProveedorSeleccionado, pagosProveedorSeleccionados, pagosProveedorByRowId]);

  const totalesTablaMovimientosProveedor = useMemo(() => {
    const selectedIds = Object.keys(movimientosProveedorSeleccionados || {}).filter((k) => movimientosProveedorSeleccionados[k]);
    const sumIngresado = movimientosDetalleProveedorSeleccionado.reduce((acc, m) => {
      const tipo = String(m?.tipo || "");
      const montoIngresado =
        tipo === "pagoGlobal"
          ? Number(m?.pagoIngresado ?? m?.monto ?? 0)
          : Number(m?.montoDelta ?? m?.monto ?? 0);
      return acc + montoIngresado;
    }, 0);
    const sumAplicado = movimientosDetalleProveedorSeleccionado.reduce((acc, m) => acc + Number(m?.aplicadoACuentas ?? 0), 0);
    const sumDelta = movimientosDetalleProveedorSeleccionado.reduce(
      (acc, m) => acc + Number(m?.montoDeltaSaldoAFavor ?? m?.montoDeltaSaldo ?? 0),
      0
    );
    const sumSelectedIngresado = selectedIds.reduce((acc, id) => {
      const m = movimientosProveedorByRowId[id];
      if (!m) return acc;
      const tipo = String(m?.tipo || "");
      const montoIngresado =
        tipo === "pagoGlobal"
          ? Number(m?.pagoIngresado ?? m?.monto ?? 0)
          : Number(m?.montoDelta ?? m?.monto ?? 0);
      return acc + montoIngresado;
    }, 0);
    return {
      countAll: movimientosDetalleProveedorSeleccionado.length,
      sumIngresado: Number(sumIngresado.toFixed(2)),
      sumAplicado: Number(sumAplicado.toFixed(2)),
      sumDelta: Number(sumDelta.toFixed(2)),
      countSelected: selectedIds.length,
      sumSelectedIngresado: Number(sumSelectedIngresado.toFixed(2)),
    };
  }, [movimientosDetalleProveedorSeleccionado, movimientosProveedorSeleccionados, movimientosProveedorByRowId]);

  const mutarPagoManual = useCallback(
    async ({ cuentaId, action, idx, pago }) => {
      if (!user || typeof user.getIdToken !== "function") throw new Error("No hay usuario autenticado");
      const idToken = await user.getIdToken();
      const resp = await fetch(`/api/erp/cuentas-pagar/${encodeURIComponent(String(cuentaId))}/pagos/mutar`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${idToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action,
          idx,
          pago,
          origen: "ui_gastos_modal_pagos_proveedor",
        }),
      });
      const out = await resp.json().catch(() => ({}));
      if (!resp.ok || !out?.ok) throw new Error(out?.error || "Error al actualizar pago");
      return out;
    },
    [user]
  );

  const anularMovimientoProveedor = useCallback(
    async ({ movimientoId }) => {
      if (!user || typeof user.getIdToken !== "function") throw new Error("No hay usuario autenticado");
      const idToken = await user.getIdToken();
      const resp = await fetch(`/api/erp/pagos-proveedores/${encodeURIComponent(String(movimientoId))}/anular`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${idToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ origen: "ui_gastos_modal_pagos_proveedor", motivo: "" }),
      });
      const out = await resp.json().catch(() => ({}));
      if (!resp.ok || !out?.ok) throw new Error(out?.error || "Error al anular movimiento");
      return out;
    },
    [user]
  );

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
                  <DateInput
                    value={fechaDesde}
                    onChange={(v) => setFechaDesde(v)}
                    buttonClassName="border border-border/60 bg-background text-foreground rounded-md px-2 py-1 h-9 flex-1 sm:flex-initial w-full sm:w-auto justify-start"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground whitespace-nowrap">
                    Hasta
                  </span>
                  <DateInput
                    value={fechaHasta}
                    min={fechaDesde || undefined}
                    onChange={(v) => setFechaHasta(v)}
                    buttonClassName="border border-border/60 bg-background text-foreground rounded-md px-2 py-1 h-9 flex-1 sm:flex-initial w-full sm:w-auto justify-start"
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

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <ArrowLeftRight className="w-5 h-5" />
                Movimientos de Proveedor
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Proveedor</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Monto</TableHead>
                    <TableHead>Aplicado</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movimientosProveedorFiltrados.map((m) => {
                    const tipo = String(m?.tipo || "");
                    const provNombre =
                      m?.proveedor?.nombre || proveedores.find((p) => p.id === m?.proveedorId)?.nombre || "-";
                    const monto =
                      tipo === "pagoGlobal"
                        ? Number(m?.pagoIngresado ?? m?.monto ?? 0)
                        : Number(m?.montoDelta ?? m?.monto ?? 0);
                    const aplicado = Number(m?.aplicadoACuentas ?? 0);
                    const anulado = m?.anulado === true;

                    return (
                      <TableRow key={m.id} className={anulado ? "opacity-60" : ""}>
                        <TableCell>{formatFechaAR(m.fecha)}</TableCell>
                        <TableCell className="font-medium">{provNombre}</TableCell>
                        <TableCell>
                          {tipo === "pagoGlobal"
                            ? "Pago global"
                            : tipo === "saldoAFavor"
                              ? "Saldo a favor"
                              : tipo || "-"}
                        </TableCell>
                        <TableCell className="font-bold">{formatMoneyARS(monto)}</TableCell>
                        <TableCell className="text-muted-foreground">{formatMoneyARS(aplicado)}</TableCell>
                        <TableCell>
                          {anulado ? (
                            <Badge className="bg-muted/50 text-muted-foreground border border-border/60">Anulado</Badge>
                          ) : (
                            <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20">
                              Activo
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-blue-600 border-blue-500/20 hover:text-blue-700 hover:bg-blue-500/10 hover:border-blue-500/40 hover:shadow-sm hover:-translate-y-0.5 transition-all duration-200"
                              onClick={() => {
                                setMovimientoSeleccionado(m);
                                setOpenMovimientoDetalle(true);
                              }}
                              title="Ver detalle"
                            >
                              <Eye className="w-3 h-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-red-600 border-red-500/20 hover:text-red-700 hover:bg-red-500/10 hover:border-red-500/40 hover:shadow-sm hover:-translate-y-0.5 transition-all duration-200"
                              onClick={() => handleAnularMovimientoProveedorDoc(m)}
                              title="Anular movimiento"
                              disabled={guardando || anulado}
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
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
                  const cuentasGrupo = Array.isArray(grupo.cuentas) ? grupo.cuentas : [];
                  const cuentasActivasGrupo = cuentasGrupo.filter((c) => !esCuentaAnulada(c));
                  const totalActivo = cuentasActivasGrupo.reduce((acc, c) => acc + (Number(c?.monto) || 0), 0);
                  const pagadoActivo = cuentasActivasGrupo.reduce((acc, c) => acc + (Number(c?.montoPagado) || 0), 0);
                  const saldoPendienteBruto = cuentasActivasGrupo.reduce((acc, c) => acc + calcularSaldoCuenta(c), 0);
                  const saldoAFavor = Number(grupo.saldoAFavor || 0);
                  const saldoPendienteNeto = Math.max(saldoPendienteBruto - saldoAFavor, 0);
                  const porcentajePagado = totalActivo > 0 ? (pagadoActivo / totalActivo) * 100 : 100;
                  
                  return (
                    <Card 
                      key={idx} 
                      className="border border-border/60 hover:border-primary/40 transition-all cursor-pointer"
                      onClick={() => setFiltroProveedorId(filtroProveedorId === grupo.proveedor?.id ? "" : grupo.proveedor?.id || "")}
                    >
                      <CardContent className="p-4">
                        <div className="mb-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="font-bold text-lg flex items-center gap-2 truncate">
                                <Building2 className="w-4 h-4 text-blue-600 shrink-0" />
                                <span className="truncate">{grupo.proveedor?.nombre || "Sin nombre"}</span>
                              </div>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 w-8 p-0 text-blue-600 border-blue-500/20 hover:text-blue-700 hover:bg-blue-500/10 hover:border-blue-500/40"
                              onClick={(e) => {
                                e.stopPropagation();
                                setProveedorPagosSeleccionadoId(String(grupo?.proveedorId || grupo?.proveedor?.id || ""));
                                setPagosProveedorSeleccionados({});
                                setMovimientosProveedorSeleccionados({});
                                setOpenPagosProveedor(true);
                              }}
                              title="Ver pagos del proveedor"
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {Number(cuentasActivasGrupo.length)} cuenta{Number(cuentasActivasGrupo.length) !== 1 ? "s" : ""} activa{Number(cuentasActivasGrupo.length) !== 1 ? "s" : ""}
                          </div>
                        </div>
                        
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Total activo:</span>
                            <span className="font-semibold">{formatMoneyARS(totalActivo)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Pagado activo:</span>
                            <span className="font-semibold text-green-600">{formatMoneyARS(pagadoActivo)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Saldo a favor:</span>
                            <span className={`font-semibold ${saldoAFavor > 0 ? "text-green-600" : "text-muted-foreground"}`}>
                              {formatMoneyARS(saldoAFavor)}
                            </span>
                          </div>
                        {saldoAFavor > 0 && (
                          <div className="mt-2 space-y-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="w-full text-red-600 border-red-500/20 hover:text-red-700 hover:bg-red-500/10 hover:border-red-500/40"
                              onClick={(e) => {
                                e.stopPropagation();
                                abrirQuitarSaldoAFavor(grupo);
                              }}
                            >
                              Quitar saldo a favor
                            </Button>
                          </div>
                        )}
                          <div className="flex justify-between border-t pt-2">
                            <span className="text-muted-foreground font-semibold">Pendiente neto:</span>
                            <span className={`font-bold ${Number(saldoPendienteNeto || 0) > 0 ? "text-red-600" : "text-muted-foreground"}`}>
                              {formatMoneyARS(Number(saldoPendienteNeto || 0))}
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
                  <SelectItem value="vencida">Vencida</SelectItem>
                  <SelectItem value="anulada">Anulada</SelectItem>
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
                  {cuentasPorPagarFiltradas.map((c) => {
                    const saldo = calcularSaldoCuenta(c);
                    const estadoCalc = calcularEstadoCuenta(c);
                    const vencida = estadoCalc === "vencida";
                    const anulada = estadoCalc === "anulada";

                    return (
                      <TableRow
                        key={c.id}
                        className={vencida && saldo > 0 ? "bg-red-500/10" : anulada ? "opacity-60" : ""}
                      >
                        <TableCell>{formatFechaAR(c.fecha)}</TableCell>
                        <TableCell className="font-medium">{c.proveedor?.nombre || "-"}</TableCell>
                        <TableCell className="font-bold">{formatMoneyARS(c.monto)}</TableCell>
                        <TableCell className="text-green-600 font-semibold">{formatMoneyARS(c.montoPagado || 0)}</TableCell>
                        <TableCell className={`font-bold ${saldo > 0 ? "text-red-600" : "text-muted-foreground"}`}>
                          {formatMoneyARS(saldo)}
                        </TableCell>
                        <TableCell className={vencida && saldo > 0 ? "text-red-600 font-semibold" : ""}>
                          {c.fechaVencimiento ? formatFechaAR(c.fechaVencimiento) : "-"}
                          {vencida && saldo > 0 && <span className="block text-xs">¡VENCIDA!</span>}
                        </TableCell>
                        <TableCell>
                          {estadoCalc === "anulada" ? (
                            <Badge className="bg-muted/50 text-muted-foreground border border-border/60">Anulada</Badge>
                          ) : estadoCalc === "vencida" ? (
                            <Badge className="bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-500/20">
                              Vencida
                            </Badge>
                          ) : (
                            <Badge className={estadosPago[c.estadoPago]?.color || "bg-muted/50 text-foreground border border-border/60"}>
                              {estadosPago[c.estadoPago]?.label || "Pendiente"}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-blue-600 border-blue-500/20 hover:text-blue-700 hover:bg-blue-500/10 hover:border-blue-500/40 hover:shadow-sm hover:-translate-y-0.5 transition-all duration-200"
                              onClick={() => {
                                setCuentaSeleccionada(c);
                                setOpenHistorial(true);
                              }}
                              title="Ver historial de pagos"
                            >
                              <Eye className="w-3 h-3" />
                            </Button>

                            {!anulada && saldo > 0 && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-green-600 border-emerald-500/20 hover:text-green-700 hover:bg-emerald-500/10 hover:border-emerald-500/40 hover:shadow-sm hover:-translate-y-0.5 transition-all duration-200"
                                onClick={() => {
                                  setCuentaSeleccionada(c);
                                  setMontoPago(String(saldo));
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

                            {!anulada && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-amber-600 border-amber-500/20 hover:text-amber-700 hover:bg-amber-500/10 hover:border-amber-500/40 hover:shadow-sm hover:-translate-y-0.5 transition-all duration-200"
                                  onClick={() => handleEditarProveedor(c)}
                                  title="Editar cuenta"
                                >
                                  <Edit className="w-3 h-3" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-red-600 border-red-500/20 hover:text-red-700 hover:bg-red-500/10 hover:border-red-500/40 hover:shadow-sm hover:-translate-y-0.5 transition-all duration-200"
                                  onClick={() => handleAnularCuentaProveedor(c)}
                                  title="Anular cuenta"
                                  disabled={guardando}
                                >
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

      <AlertDialog
        open={confirmDialog.open}
        onOpenChange={(open) => {
          if (!open) closeConfirm(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmDialog.title}</AlertDialogTitle>
            {confirmDialog.description ? (
              <AlertDialogDescription>{confirmDialog.description}</AlertDialogDescription>
            ) : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => closeConfirm(false)}>
              {confirmDialog.cancelText}
            </AlertDialogCancel>
            <AlertDialogAction color={confirmDialog.confirmColor} onClick={() => closeConfirm(true)}>
              {confirmDialog.confirmText}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
              <input type="hidden" {...registerInterno("fecha")} />
              <DateInput
                value={watchInterno("fecha") || ""}
                onChange={(v) =>
                  setValueInterno("fecha", v, {
                    shouldDirty: true,
                    shouldTouch: true,
                    shouldValidate: true,
                  })
                }
                buttonClassName={cn(
                  "w-full justify-start",
                  errorsInterno.fecha ? "border-red-500" : ""
                )}
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
                        No se encontraron proveedores que coincidan con &quot;{busquedaProveedor}&quot;
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
                <input type="hidden" {...registerProveedor("fecha")} />
                <DateInput
                  value={watchProveedor("fecha") || ""}
                  onChange={(v) =>
                    setValueProveedor("fecha", v, {
                      shouldDirty: true,
                      shouldTouch: true,
                      shouldValidate: true,
                    })
                  }
                  buttonClassName={cn(
                    "w-full justify-start",
                    errorsProveedor.fecha ? "border-red-500" : ""
                  )}
                />
              </div>
              
              <div>
                <Label>Fecha de Vencimiento</Label>
                <input type="hidden" {...registerProveedor("fechaVencimiento")} />
                <DateInput
                  value={watchProveedor("fechaVencimiento") || ""}
                  min={watchProveedor("fecha") || undefined}
                  onChange={(v) =>
                    setValueProveedor("fechaVencimiento", v, {
                      shouldDirty: true,
                      shouldTouch: true,
                      shouldValidate: true,
                    })
                  }
                  buttonClassName="w-full justify-start"
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
        <DialogContent className="w-[95vw] max-w-[720px] border border-border/60 bg-card p-0 overflow-hidden">
          <div className="flex max-h-[85vh] flex-col">
            <DialogHeader className="px-5 py-4 border-b border-border/60">
              <DialogTitle>Registrar Pago</DialogTitle>
            </DialogHeader>

            <ScrollArea className="flex-1">
              <div className="px-5 py-4 space-y-4">
                {cuentaSeleccionada && (
                  <>
              {resumenProveedorParaPago && (
                <div className="bg-muted/50 p-3 rounded-lg border border-border/60">
                  <div className="font-medium text-foreground">{resumenProveedorParaPago.proveedorNombre}</div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">Pendiente bruto:</span>
                      <span className="font-semibold text-red-600 ml-1">{formatMoneyARS(Number(resumenProveedorParaPago.pendienteBruto || 0))}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Saldo a favor:</span>
                      <span className="font-semibold text-green-600 ml-1">{formatMoneyARS(Number(resumenProveedorParaPago.saldoAFavor || 0))}</span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-muted-foreground">Pendiente neto:</span>
                      <span className="font-semibold ml-1">{formatMoneyARS(Number(resumenProveedorParaPago.pendienteNeto || 0))}</span>
                    </div>
                  </div>
                </div>
              )}

              <Tabs value={pagoModo} onValueChange={setPagoModo}>
                <TabsList className="grid grid-cols-2 w-full">
                  <TabsTrigger value="cuenta">Esta cuenta</TabsTrigger>
                  <TabsTrigger value="proveedor">Proveedor</TabsTrigger>
                </TabsList>
                <TabsContent value="cuenta" className="space-y-3">
                  <div className="bg-card p-3 rounded-lg border border-border/60">
                    <div className="text-sm text-muted-foreground">Cuenta</div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-muted-foreground">Total:</span>
                        <span className="font-semibold ml-1">{formatMoneyARS(Number(cuentaSeleccionada.monto || 0))}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Saldo:</span>
                        <span className="font-semibold text-red-600 ml-1">
                          {formatMoneyARS(Number(calcularSaldoCuenta(cuentaSeleccionada) || 0))}
                        </span>
                      </div>
                    </div>
                  </div>

                  {cuentaSeleccionada.pagos && cuentaSeleccionada.pagos.length > 0 && (
                    <div className="bg-blue-500/10 p-3 rounded-lg border border-blue-500/20">
                      <div className="font-semibold text-sm mb-2">Pagos registrados:</div>
                      <div className="space-y-1">
                        {cuentaSeleccionada.pagos.map((pago, idx) => (
                          <div key={idx} className="text-xs text-foreground flex justify-between">
                            <span>{pago.fecha} - {pago.metodo}</span>
                            <span className="font-semibold">{formatMoneyARS(Number(pago.monto || 0))}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="proveedor" className="space-y-3">
                  <div className="text-xs text-muted-foreground">
                    Seleccioná las cuentas con saldo pendiente a pagar. Se aplicará en orden de vencimiento y el excedente queda como saldo a favor.
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-medium">Cuentas pendientes</div>
                    <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                      <input
                        type="checkbox"
                        checked={
                          cuentasPendientesProveedorParaPago.length > 0 &&
                          cuentasPendientesProveedorParaPago.every((c) => cuentasSeleccionadasPagoProveedor?.[String(c.id)])
                        }
                        onChange={(e) => {
                          const checked = e.target.checked;
                          const next = {};
                          if (checked) {
                            for (const c of cuentasPendientesProveedorParaPago) next[String(c.id)] = true;
                          }
                          setCuentasSeleccionadasPagoProveedor(next);
                          const sum = cuentasPendientesProveedorParaPago
                            .filter((c) => next[String(c.id)])
                            .reduce((acc, c) => acc + Number(c._saldo || 0), 0);
                          const saldoAFavor = Number(resumenProveedorParaPago?.saldoAFavor || 0);
                          setMontoPago(String(Math.max(sum - saldoAFavor, 0)));
                        }}
                        className="w-4 h-4"
                      />
                      Seleccionar todas
                    </label>
                  </div>

                  {cuentasPendientesProveedorParaPago.length === 0 ? (
                    <div className="text-sm text-muted-foreground border border-border/60 rounded-lg p-3 bg-muted/30">
                      No hay cuentas con saldo pendiente para este proveedor.
                    </div>
                  ) : (
                    <div className="max-h-[28vh] overflow-y-auto space-y-2 border border-border/60 rounded-lg p-2 bg-muted/20">
                      {cuentasPendientesProveedorParaPago.map((c) => (
                        <label
                          key={c.id}
                          className="flex items-center justify-between gap-3 rounded-md px-2 py-2 bg-card border border-border/60 cursor-pointer"
                        >
                          <div className="flex items-start gap-2">
                            <input
                              type="checkbox"
                              checked={!!cuentasSeleccionadasPagoProveedor?.[String(c.id)]}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setCuentasSeleccionadasPagoProveedor((prev) => {
                                  const next = { ...(prev || {}) };
                                  if (checked) next[String(c.id)] = true;
                                  else delete next[String(c.id)];
                                  const sum = cuentasPendientesProveedorParaPago
                                    .filter((acc) => next[String(acc.id)])
                                    .reduce((acc, accObj) => acc + Number(accObj._saldo || 0), 0);
                                  const saldoAFavor = Number(resumenProveedorParaPago?.saldoAFavor || 0);
                                  setMontoPago(String(Math.max(sum - saldoAFavor, 0)));
                                  return next;
                                });
                              }}
                              className="mt-0.5 w-4 h-4"
                            />
                            <div>
                              <div className="text-sm font-medium">
                                {formatFechaAR(c.fecha)}{c.fechaVencimiento ? ` · Vence ${formatFechaAR(c.fechaVencimiento)}` : ""}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                Total {formatMoneyARS(Number(c.monto || 0))} · Pagado {formatMoneyARS(Number(c.montoPagado || 0))}
                              </div>
                            </div>
                          </div>
                          <div className="text-sm font-semibold text-red-600">{formatMoneyARS(Number(c._saldo || 0))}</div>
                        </label>
                      ))}
                    </div>
                  )}

                  {distribucionPagoProveedor.aplicaciones.length > 0 || distribucionPagoProveedor.excedente > 0 ? (
                    <div className="bg-muted/50 p-3 rounded-lg border border-border/60 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Aplicado a cuentas:</span>
                        <span className="font-semibold">{formatMoneyARS(Number(distribucionPagoProveedor.aplicado || 0))}</span>
                      </div>
                      <div className="flex justify-between mt-1">
                        <span className="text-muted-foreground">Excedente a saldo a favor:</span>
                        <span className="font-semibold">{formatMoneyARS(Number(distribucionPagoProveedor.excedente || 0))}</span>
                      </div>
                    </div>
                  ) : null}
                </TabsContent>
              </Tabs>

              <Accordion type="single" collapsible defaultValue="comprobantes" className="space-y-2">
                <AccordionItem value="moneda" className="shadow-none dark:shadow-none py-3 px-3 dark:bg-transparent rounded-lg border border-border/60 bg-muted/20">
                  <AccordionTrigger className="py-0">Moneda</AccordionTrigger>
                  <AccordionContent className="pt-3">
                    <div className="space-y-3">
                      <label className="flex items-center gap-3 cursor-pointer">
                        <Switch
                          checked={!!pagoEnDolares}
                          onCheckedChange={(checked) => {
                            setPagoEnDolares(checked);
                            if (!checked) setValorOficialDolar(null);
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
                              className="w-full md:w-44 px-3 py-2 border border-border/60 bg-background text-foreground rounded-lg"
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
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="comprobantes" className="shadow-none dark:shadow-none py-3 px-3 dark:bg-transparent rounded-lg border border-border/60 bg-muted/20">
                  <AccordionTrigger className="py-0">Comprobantes</AccordionTrigger>
                  <AccordionContent className="pt-3">
                    <ComprobantesPagoSection
                      comprobantes={comprobantesPago || []}
                      onComprobantesChange={setComprobantesPago}
                      disabled={loadingDolar || guardando}
                      maxFiles={8}
                    />
                  </AccordionContent>
                </AccordionItem>
              </Accordion>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <Label>{pagoModo === "proveedor" ? "Monto a pagar al proveedor *" : "Monto a pagar *"}</Label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="Monto del pago"
                    value={montoPago}
                    onChange={(e) => setMontoPago(e.target.value)}
                    max={pagoModo === "cuenta" ? Number(calcularSaldoCuenta(cuentaSeleccionada) || 0) : undefined}
                  />
                </div>

                <div>
                  <Label>Fecha *</Label>
                  <DateInput
                    value={fechaPago}
                    onChange={(v) => setFechaPago(v)}
                    buttonClassName="w-full justify-start"
                  />
                </div>

                <div>
                  <Label>Método</Label>
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
              </div>

              <div>
                <Label>Notas</Label>
                <Textarea
                  placeholder="Detalles del pago..."
                  value={notasPago}
                  onChange={(e) => setNotasPago(e.target.value)}
                  rows={2}
                />
              </div>
                  </>
                )}
              </div>
            </ScrollArea>

            <DialogFooter className="px-5 py-4 border-t border-border/60 bg-card">
              <Button variant="outline" onClick={() => setOpenPago(false)} disabled={guardando}>
                Cancelar
              </Button>
              <Button
                onClick={handleRegistrarPago}
                disabled={
                  guardando ||
                  !Number.isFinite(parseMoneyARS(montoPago)) ||
                  parseMoneyARS(montoPago) <= 0 ||
                  (pagoModo === "proveedor" &&
                    Object.keys(cuentasSeleccionadasPagoProveedor || {}).filter((id) => cuentasSeleccionadasPagoProveedor?.[id]).length === 0)
                }
              >
                {guardando ? "Guardando..." : "Registrar Pago"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={openAgregarSaldoAFavor}
        onOpenChange={(open) => {
          setOpenAgregarSaldoAFavor(open);
          if (!open) {
            setProveedorAgregarSaldo(null);
            limpiarEstadoAgregarSaldo();
          }
        }}
      >
        <DialogContent
          className="z-[10011] w-[95vw] max-w-[560px] border border-border/60 bg-card"
          overlayClass="z-[10010] bg-black/70 backdrop-blur-sm"
        >
          <DialogHeader>
            <DialogTitle className="pr-10">Adelantar saldo a favor</DialogTitle>
          </DialogHeader>
          {proveedorAgregarSaldo && (
            <div className="space-y-4 py-2">
              <div className="bg-emerald-500/10 p-3 rounded-lg border border-emerald-500/20">
                <div className="font-semibold text-foreground">{proveedorAgregarSaldo.nombre}</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  Saldo a favor actual:{" "}
                  <span className="font-semibold text-emerald-600">
                    ${Number(proveedorAgregarSaldo.saldoAFavor || 0).toLocaleString("es-AR")}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <Label>Monto a adelantar *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={montoAgregarSaldo}
                    onChange={(e) => setMontoAgregarSaldo(e.target.value)}
                    placeholder="Monto"
                  />
                </div>
                <div>
                  <Label>Fecha *</Label>
                  <DateInput
                    value={fechaAgregarSaldo}
                    onChange={(v) => setFechaAgregarSaldo(v)}
                    buttonClassName="w-full justify-start"
                  />
                </div>
                <div>
                  <Label>Método</Label>
                  <select
                    value={metodoAgregarSaldo}
                    onChange={(e) => setMetodoAgregarSaldo(e.target.value)}
                    className="w-full px-3 py-2 border border-border/60 bg-background text-foreground rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/40"
                  >
                    <option value="Efectivo">Efectivo</option>
                    <option value="Transferencia">Transferencia</option>
                    <option value="Cheque">Cheque</option>
                    <option value="Tarjeta">Tarjeta</option>
                    <option value="Ajuste">Ajuste</option>
                  </select>
                </div>
              </div>

              <div>
                <Label>Notas</Label>
                <Textarea
                  placeholder="Detalle del adelanto..."
                  value={notasAgregarSaldo}
                  onChange={(e) => setNotasAgregarSaldo(e.target.value)}
                  rows={2}
                />
              </div>

              <Accordion type="single" collapsible defaultValue="moneda" className="space-y-2">
                <AccordionItem
                  value="moneda"
                  className="shadow-none dark:shadow-none py-3 px-3 dark:bg-transparent rounded-lg border border-border/60 bg-muted/20"
                >
                  <AccordionTrigger className="py-0">Moneda</AccordionTrigger>
                  <AccordionContent className="pt-3">
                    <div className="space-y-3">
                      <label className="flex items-center gap-3 cursor-pointer">
                        <Switch
                          checked={!!adelantoEnDolares}
                          onCheckedChange={(checked) => {
                            setAdelantoEnDolares(checked);
                            if (!checked) setAdelantoValorOficialDolar(null);
                          }}
                          color="warning"
                        />
                        <span className="text-sm font-medium">Pago en dólares</span>
                      </label>
                      {adelantoEnDolares && (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              className="w-full md:w-44 px-3 py-2 border border-border/60 bg-background text-foreground rounded-lg"
                              value={adelantoValorOficialDolar ?? ""}
                              onChange={(e) =>
                                setAdelantoValorOficialDolar(e.target.value ? Number(e.target.value) : null)
                              }
                              placeholder="Ej: 1440"
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => fetchDolarBlue({ target: "adelanto" })}
                              disabled={loadingDolar}
                              className="shrink-0 h-9"
                            >
                              {loadingDolar ? <Loader2 className="w-4 h-4 animate-spin" /> : "Actualizar"}
                            </Button>
                          </div>
                          {ultimaActualizacionDolar && (
                            <p className="text-xs text-muted-foreground">
                              Última cotización:{" "}
                              {ultimaActualizacionDolar.toLocaleString("es-AR", {
                                dateStyle: "short",
                                timeStyle: "short",
                              })}{" "}
                              (se actualiza cada 5 min)
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>

              <div className="border border-border/60 rounded-lg p-3 bg-muted/20">
                <ComprobantesPagoSection
                  comprobantes={comprobantesAgregarSaldo || []}
                  onComprobantesChange={setComprobantesAgregarSaldo}
                  disabled={guardando || loadingDolar}
                  maxFiles={8}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setOpenAgregarSaldoAFavor(false);
                setProveedorAgregarSaldo(null);
                limpiarEstadoAgregarSaldo();
              }}
              disabled={guardando}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleAgregarSaldoAFavor}
              disabled={
                guardando ||
                !Number.isFinite(parseMoneyARS(montoAgregarSaldo)) ||
                parseMoneyARS(montoAgregarSaldo) <= 0
              }
            >
              {guardando ? "Guardando..." : "Registrar adelanto"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={openQuitarSaldoAFavor} onOpenChange={setOpenQuitarSaldoAFavor}>
        <DialogContent className="w-[95vw] max-w-[520px] border border-border/60 bg-card">
          <DialogHeader>
            <DialogTitle>Quitar saldo a favor</DialogTitle>
          </DialogHeader>
          {proveedorQuitarSaldo && (
            <div className="space-y-4 py-2">
              <div className="bg-red-500/10 p-3 rounded-lg border border-red-500/20">
                <div className="font-semibold text-foreground">{proveedorQuitarSaldo.nombre}</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  Saldo a favor actual:{" "}
                  <span className="font-semibold text-green-600">
                    ${Number(proveedorQuitarSaldo.saldoAFavor || 0).toLocaleString("es-AR")}
                  </span>
                </div>
              </div>

              <div>
                <Label>Monto a quitar *</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={montoQuitarSaldo}
                  onChange={(e) => setMontoQuitarSaldo(e.target.value)}
                  max={Number(proveedorQuitarSaldo.saldoAFavor || 0)}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Se descuenta del saldo a favor del proveedor (no afecta cuentas individuales).
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Fecha *</Label>
                  <DateInput
                    value={fechaQuitarSaldo}
                    onChange={(v) => setFechaQuitarSaldo(v)}
                    buttonClassName="w-full justify-start"
                  />
                </div>
                <div>
                  <Label>Método</Label>
                  <select
                    value={metodoQuitarSaldo}
                    onChange={(e) => setMetodoQuitarSaldo(e.target.value)}
                    className="w-full px-3 py-2 border border-border/60 bg-background text-foreground rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/40"
                  >
                    <option value="Ajuste">Ajuste</option>
                    <option value="Efectivo">Efectivo</option>
                    <option value="Transferencia">Transferencia</option>
                    <option value="Cheque">Cheque</option>
                    <option value="Tarjeta">Tarjeta</option>
                  </select>
                </div>
              </div>

              <div>
                <Label>Motivo / notas</Label>
                <Textarea
                  placeholder="Motivo del ajuste..."
                  value={notasQuitarSaldo}
                  onChange={(e) => setNotasQuitarSaldo(e.target.value)}
                  rows={2}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setOpenQuitarSaldoAFavor(false);
                setProveedorQuitarSaldo(null);
                limpiarEstadoQuitarSaldo();
              }}
              disabled={guardando}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleQuitarSaldoAFavor}
              disabled={
                guardando ||
                !Number.isFinite(parseMoneyARS(montoQuitarSaldo)) ||
                parseMoneyARS(montoQuitarSaldo) <= 0
              }
            >
              {guardando ? "Guardando..." : "Quitar saldo"}
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
                {(cuentaSeleccionada.movimientoPagoGlobalProveedor || cuentaSeleccionada.movimientoSaldoAFavor) && (
                  <div className="mt-1 text-xs text-muted-foreground">
                    Este registro es un movimiento (no una cuenta). Se anula desde aquí.
                  </div>
                )}
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
                {(cuentaSeleccionada.movimientoPagoGlobalProveedor || cuentaSeleccionada.movimientoSaldoAFavor) && (
                  <div className="mt-3">
                    <Button
                      variant="outline"
                      className="text-red-600 border-red-500/20 hover:text-red-700 hover:bg-red-500/10 hover:border-red-500/40"
                      onClick={() => handleAnularMovimientoProveedor(cuentaSeleccionada)}
                      disabled={guardando}
                    >
                      <Trash2 className="w-4 h-4 mr-1" />
                      Anular movimiento
                    </Button>
                  </div>
                )}
              </div>

              {/* Listado de pagos */}
              {pagosDetalleCuentaSeleccionada.length > 0 ? (
                <div className="space-y-2">
                  <div className="font-semibold text-sm text-foreground flex items-center gap-2">
                    <DollarSign className="w-4 h-4" />
                    Pagos Registrados ({pagosDetalleCuentaSeleccionada.length})
                  </div>
                  <div className="max-h-80 overflow-y-auto space-y-2">
                    {pagosDetalleCuentaSeleccionada.map((pago, idx) => {
                      const monto = Number(pago?._monto ?? pago?.monto ?? 0);
                      const esReversion = pago?._kind === "reversion";
                      const esGlobal = pago?._kind === "pagoGlobal";
                      const esSaldoAFavor = pago?._kind === "saldoAFavor";
                      const anuladoMovimiento = pago?._movimientoAnulado === true;
                      const pagoGlobalProveedor = pago?.pagoGlobalProveedor === true;
                      const fecha = pago?._fecha || formatFechaSegura(pago?.fecha);
                      const fechaRegistro = pago?._fechaRegistro || (typeof pago?.fechaRegistro === "string" ? pago.fechaRegistro : "");
                      const puedeMutar =
                        pago?._kind === "manual" &&
                        !cuentaSeleccionada?.movimientoSaldoAFavor &&
                        !cuentaSeleccionada?.movimientoPagoGlobalProveedor &&
                        typeof pago?._idxOriginal === "number";

                      return (
                      <div 
                        key={idx} 
                        className="bg-card border border-border/60 rounded-lg p-3 hover:shadow-md transition-shadow"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className={`font-bold text-lg ${monto >= 0 ? "text-green-600" : "text-red-600"}`}>
                                {formatMoneyARS(monto)}
                              </span>
                              <Badge variant="outline" className="text-xs">
                                {pago?.metodo || "Efectivo"}
                              </Badge>
                              {pagoGlobalProveedor && (
                                <Badge variant="outline" className="text-xs">
                                  Pago global
                                </Badge>
                              )}
                              {esSaldoAFavor && (
                                <Badge variant="outline" className="text-xs">
                                  Saldo a favor
                                </Badge>
                              )}
                              {esReversion && (
                                <Badge variant="outline" className="text-xs">
                                  Anulación
                                </Badge>
                              )}
                              {anuladoMovimiento && (
                                <Badge variant="outline" className="text-xs">
                                  Movimiento anulado
                                </Badge>
                              )}
                              {pago?.pagoEnDolares && (
                                <Badge variant="subtle" className="text-xs ml-1">
                                  USD
                                </Badge>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                              <div className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {fecha ? formatFechaAR(fecha) : fechaRegistro ? formatFechaHoraArgentina(fechaRegistro) : "-"}
                              </div>
                              {fechaRegistro ? (
                                <div className="text-muted-foreground">Registrado: {formatFechaHoraArgentina(fechaRegistro)}</div>
                              ) : null}
                              {pago?.notas && (
                                <div className="text-muted-foreground italic">&quot;{String(pago.notas)}&quot;</div>
                              )}
                              {pago?.responsable && (
                                <div className="text-muted-foreground">Por: {String(pago.responsable)}</div>
                              )}
                              {pago?.comprobantes && pago.comprobantes.length > 0 && (
                                <div className="mt-2 space-y-2">
                                  <div className="text-xs text-muted-foreground">
                                    {pago.comprobantes.length} comprobante{pago.comprobantes.length !== 1 ? "s" : ""}
                                  </div>
                                  <div className="grid grid-cols-4 gap-2">
                                    {pago.comprobantes.slice(0, 4).map((comp, cidx) => {
                                      const tipo = String(comp?.tipo || "").toLowerCase();
                                      const url = String(comp?.url || "");
                                      const nombre = String(comp?.nombre || `Comprobante ${cidx + 1}`);
                                      if (!url) return null;
                                      return (
                                        <button
                                          key={`${url}_${cidx}`}
                                          type="button"
                                          className="group relative w-full aspect-square rounded-md border border-border/60 bg-muted/20 overflow-hidden hover:border-border hover:shadow-sm transition-all"
                                          onClick={() => {
                                            setComprobantePreview({ url, tipo: tipo || "image", nombre });
                                            setOpenComprobantePreview(true);
                                          }}
                                          title="Ver comprobante"
                                        >
                                          {tipo === "pdf" ? (
                                            <div className="w-full h-full flex items-center justify-center">
                                              <FileText className="w-6 h-6 text-red-600" />
                                            </div>
                                          ) : (
                                            <img src={url} alt={nombre} className="w-full h-full object-cover" />
                                          )}
                                          <div className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                            <Eye className="w-5 h-5 text-white" />
                                          </div>
                                          {cidx === 3 && pago.comprobantes.length > 4 ? (
                                            <div className="absolute inset-0 bg-black/50 text-white text-xs flex items-center justify-center">
                                              +{pago.comprobantes.length - 4}
                                            </div>
                                          ) : null}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            <div className="text-xs text-muted-foreground">Pago #{idx + 1}</div>
                            <div className="flex gap-1 mt-2">
                              {puedeMutar && (
                                <>
                                  <Button
                                    size="xs"
                                    variant="outline"
                                    onClick={() => {
                                      setPagoEdit({ ...pago, idx: pago._idxOriginal });
                                      setOpenEditarPago(true);
                                    }}
                                    title="Editar pago"
                                  >
                                    <Edit className="w-3 h-3" />
                                  </Button>
                                  <Button
                                    size="xs"
                                    variant="outline"
                                    onClick={() => handleEliminarPago(pago._idxOriginal)}
                                    title="Eliminar pago"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </Button>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                      );
                    })}
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

      <Dialog
        open={openPagosProveedor}
        onOpenChange={(open) => {
          setOpenPagosProveedor(open);
          if (!open) {
            setProveedorPagosSeleccionadoId("");
            setPagoDetalleProveedor(null);
            setOpenPagoDetalleProveedor(false);
            setPagosProveedorSeleccionados({});
            setMovimientosProveedorSeleccionados({});
          }
        }}
      >
        <DialogContent className="w-[95vw] max-w-[1000px] border border-border/60 bg-card p-0 overflow-hidden">
          <DialogHeader className="px-5 py-4 border-b border-border/60">
            <DialogTitle className="flex items-center gap-2 pr-10">
              <Building2 className="w-5 h-5 text-blue-600" />
              Pagos — {String(resumenProveedorPagosSeleccionado?.proveedorNombre || "Proveedor")}
            </DialogTitle>
          </DialogHeader>

          <div className="px-5 py-4 space-y-4">
            {resumenProveedorPagosSeleccionado ? (
              <div className="space-y-3">
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-emerald-700 border-emerald-500/20 hover:text-emerald-800 hover:bg-emerald-500/10 hover:border-emerald-500/40"
                    onClick={() =>
                      abrirAgregarSaldoAFavor({
                        proveedorId: resumenProveedorPagosSeleccionado.proveedorId,
                        proveedorNombre: resumenProveedorPagosSeleccionado.proveedorNombre,
                        saldoAFavor: resumenProveedorPagosSeleccionado.saldoAFavor,
                      })
                    }
                    disabled={guardando}
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Adelantar
                  </Button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="bg-card p-3 rounded-md border border-border/60">
                  <div className="text-xs text-muted-foreground">Total proveedor (activo)</div>
                  <div className="text-lg font-bold text-blue-700">{formatMoneyARS(resumenProveedorPagosSeleccionado.totalActivo)}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {resumenProveedorPagosSeleccionado.cuentasActivas} cuenta{resumenProveedorPagosSeleccionado.cuentasActivas !== 1 ? "s" : ""}
                  </div>
                </div>
                <div className="bg-card p-3 rounded-md border border-border/60">
                  <div className="text-xs text-muted-foreground">Total pagado (activo)</div>
                  <div className="text-lg font-bold text-emerald-600">{formatMoneyARS(resumenProveedorPagosSeleccionado.pagadoActivo)}</div>
                </div>
                <div className="bg-card p-3 rounded-md border border-border/60">
                  <div className="text-xs text-muted-foreground">{resumenProveedorPagosSeleccionado.netoLabel}</div>
                  <div
                    className={cn(
                      "text-lg font-bold",
                      resumenProveedorPagosSeleccionado.saldoPendienteNeto > 0 ? "text-red-600" : "text-emerald-600"
                    )}
                  >
                    {formatMoneyARS(resumenProveedorPagosSeleccionado.netoValor)}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Bruto: {formatMoneyARS(resumenProveedorPagosSeleccionado.saldoPendienteBruto)} · Saldo a favor:{" "}
                    {formatMoneyARS(resumenProveedorPagosSeleccionado.saldoAFavor)}
                  </div>
                </div>
                <div className="bg-card p-3 rounded-md border border-border/60">
                  <div className="text-xs text-muted-foreground">Saldo a favor</div>
                  <div className={cn("text-lg font-bold", resumenProveedorPagosSeleccionado.saldoAFavor > 0 ? "text-emerald-600" : "text-muted-foreground")}>
                    {formatMoneyARS(resumenProveedorPagosSeleccionado.saldoAFavor)}
                  </div>
                </div>
                </div>
              </div>
            ) : null}

            <Tabs defaultValue="pagos" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="pagos" className="flex items-center gap-2">
                  <Wallet className="w-4 h-4" />
                  Pagos
                </TabsTrigger>
                <TabsTrigger value="movimientos" className="flex items-center gap-2">
                  <ArrowLeftRight className="w-4 h-4" />
                  Movimientos
                </TabsTrigger>
              </TabsList>

              <TabsContent value="pagos" className="mt-4">
                {pagosDetalleProveedorSeleccionado.length > 0 ? (
                  <div className="border border-border/60 rounded-lg overflow-hidden">
                    {totalesTablaPagosProveedor.countSelected > 0 ? (
                      <div className="px-3 py-2 border-b border-border/60 bg-muted/20 flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
                        <div className="text-sm">
                          <span className="font-semibold">{totalesTablaPagosProveedor.countSelected}</span>{" "}
                          seleccionad{totalesTablaPagosProveedor.countSelected !== 1 ? "os" : "o"} ·{" "}
                          <span className="font-semibold text-emerald-700 dark:text-emerald-300">
                            {formatMoneyARS(totalesTablaPagosProveedor.sumSelected)}
                          </span>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-red-600 border-red-500/20 hover:text-red-700 hover:bg-red-500/10 hover:border-red-500/40"
                            disabled={guardando}
                            onClick={async () => {
                              const selectedIds = Object.keys(pagosProveedorSeleccionados || {}).filter((k) => pagosProveedorSeleccionados[k]);
                              const items = selectedIds.map((id) => pagosProveedorByRowId[id]).filter(Boolean);
                              const movimientoIds = Array.from(
                                new Set(
                                  items
                                    .filter(
                                      (p) =>
                                        String(p?._kind || "") === "pagoGlobal" ||
                                        String(p?._kind || "") === "saldoAFavor" ||
                                        p?._origenMovimiento === true ||
                                        p?.pagoGlobalProveedor === true
                                    )
                                    .map((p) => String(p?.pagoGlobalId || ""))
                                    .filter(Boolean)
                                )
                              );
                              const movimientosAAnular = movimientoIds.filter((id) => movimientosProveedorByRowId?.[id]?.anulado !== true);
                              const eliminables = items.filter(
                                (p) =>
                                  String(p?._kind || "") === "manual" &&
                                  typeof p?._idxOriginal === "number" &&
                                  p?.pagoGlobalProveedor !== true &&
                                  p?._origenMovimiento !== true
                              );
                              if (eliminables.length === 0 && movimientosAAnular.length === 0) {
                                toast({
                                  title: "Sin acciones",
                                  description:
                                    "La selección no tiene pagos manuales para eliminar ni movimientos activos para anular.",
                                  color: "warning",
                                });
                                return;
                              }
                              const ok = await confirmAsync({
                                title: "Eliminar seleccionados",
                                description: `Se eliminarán ${eliminables.length} pago${eliminables.length !== 1 ? "s" : ""} manual${eliminables.length !== 1 ? "es" : ""} y se anularán ${movimientosAAnular.length} movimiento${movimientosAAnular.length !== 1 ? "s" : ""} (pagos globales / saldo a favor).`,
                                confirmText: "Eliminar",
                                cancelText: "Cancelar",
                                confirmColor: "destructive",
                              });
                              if (!ok) return;
                              setGuardando(true);
                              try {
                                let anulados = 0;
                                for (const movimientoId of movimientosAAnular) {
                                  await anularMovimientoProveedor({ movimientoId });
                                  anulados += 1;
                                }
                                const porCuenta = eliminables.reduce((acc, p) => {
                                  const cuentaId = String(p?._cuentaId || "");
                                  const idx = p?._idxOriginal;
                                  if (!cuentaId || typeof idx !== "number") return acc;
                                  if (!acc[cuentaId]) acc[cuentaId] = [];
                                  acc[cuentaId].push(idx);
                                  return acc;
                                }, {});
                                let deleted = 0;
                                const cuentaIds = Object.keys(porCuenta);
                                for (const cuentaId of cuentaIds) {
                                  const indices = (porCuenta[cuentaId] || []).slice().sort((a, b) => b - a);
                                  for (const idx of indices) {
                                    await mutarPagoManual({ cuentaId, action: "delete", idx });
                                    deleted += 1;
                                  }
                                }
                                await cargarDatos({ silent: true });
                                setPagosProveedorSeleccionados({});
                                toast({
                                  title: "Acción aplicada",
                                  description: `Movimientos anulados: ${anulados}. Pagos manuales eliminados: ${deleted}.`,
                                  color: "success",
                                });
                              } catch (e) {
                                console.error("Error al eliminar/anular seleccionados:", e);
                                toast({
                                  title: "Error",
                                  description: `No se pudo completar la acción: ${e?.message || String(e)}`,
                                  color: "destructive",
                                });
                              } finally {
                                setGuardando(false);
                              }
                            }}
                          >
                            <Trash2 className="w-4 h-4 mr-1" />
                            Eliminar
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setPagosProveedorSeleccionados({})}>
                            <X className="w-4 h-4 mr-1" />
                            Limpiar
                          </Button>
                        </div>
                      </div>
                    ) : null}

                    <div className="max-h-[55vh] overflow-auto">
                      <Table className="table-fixed [&_th]:uppercase [&_th]:text-[11px] [&_th]:h-10 [&_th]:px-2 [&_th]:py-2 [&_td]:p-2 [&_td]:align-top">
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-10">
                              <input
                                type="checkbox"
                                checked={pagosProveedorIds.length > 0 && pagosProveedorIds.every((id) => !!pagosProveedorSeleccionados?.[id])}
                                onChange={(e) => {
                                  const checked = e.target.checked;
                                  setPagosProveedorSeleccionados(() => {
                                    if (!checked) return {};
                                    return pagosProveedorIds.reduce((acc, id) => {
                                      acc[id] = true;
                                      return acc;
                                    }, {});
                                  });
                                }}
                                className="w-4 h-4"
                                aria-label="Seleccionar todos los pagos"
                              />
                            </TableHead>
                            <TableHead>Fecha</TableHead>
                            <TableHead>Cuenta</TableHead>
                            <TableHead>Método</TableHead>
                            <TableHead>Origen</TableHead>
                            <TableHead className="w-24">Comp.</TableHead>
                            <TableHead className="text-right">Monto</TableHead>
                            <TableHead className="w-40">Estado</TableHead>
                            <TableHead className="w-14 text-right">Acc.</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {pagosDetalleProveedorSeleccionado.map((pago) => {
                            const rowId = String(pago?._rowId || "");
                            const monto = Number(pago?._monto ?? pago?.monto ?? 0);
                            const fecha = pago?._fecha || formatFechaSegura(pago?.fecha);
                            const fechaRegistro = pago?._fechaRegistro || (typeof pago?.fechaRegistro === "string" ? pago.fechaRegistro : "");
                            const kind = String(pago?._kind || "manual");
                            const origenLabel =
                              kind === "reversion"
                                ? "Anulación"
                                : kind === "saldoAFavor"
                                ? "Saldo a favor"
                                : kind === "pagoGlobal"
                                ? "Pago global"
                                : "Manual";
                            const cuentaLabel = pago?._cuentaFecha
                              ? formatFechaAR(pago._cuentaFecha)
                              : pago?._cuentaId
                                ? `#${String(pago._cuentaId).slice(0, 8)}`
                                : "-";
                            const estadoFlags = [];
                            if (pago?._movimientoAnulado) estadoFlags.push("Movimiento anulado");
                            if (pago?._cuentaAnulada) estadoFlags.push("Cuenta anulada");
                            if (pago?._origenMovimiento) estadoFlags.push("Detectado por movimiento");
                            const comprobantes = Array.isArray(pago?.comprobantes) ? pago.comprobantes : [];
                            const cuenta = cuentasProveedorSeleccionadoById[String(pago?._cuentaId || "")] || null;
                            const puedeEditarEliminar =
                              kind === "manual" &&
                              typeof pago?._idxOriginal === "number" &&
                              pago?.pagoGlobalProveedor !== true &&
                              pago?._origenMovimiento !== true;

                            return (
                              <TableRow key={rowId} className={pago?._cuentaAnulada ? "opacity-70" : ""}>
                                <TableCell className="w-10">
                                  <input
                                    type="checkbox"
                                    checked={!!pagosProveedorSeleccionados?.[rowId]}
                                    onChange={(e) => {
                                      const checked = e.target.checked;
                                      setPagosProveedorSeleccionados((prev) => {
                                        const next = { ...(prev || {}) };
                                        if (checked) next[rowId] = true;
                                        else delete next[rowId];
                                        return next;
                                      });
                                    }}
                                    className="w-4 h-4"
                                    aria-label="Seleccionar pago"
                                  />
                                </TableCell>
                                <TableCell className="whitespace-nowrap">
                                  {fecha ? formatFechaAR(fecha) : fechaRegistro ? formatFechaHoraArgentina(fechaRegistro) : "-"}
                                  {fechaRegistro ? (
                                    <div className="text-xs text-muted-foreground">Reg: {formatFechaHoraArgentina(fechaRegistro)}</div>
                                  ) : null}
                                </TableCell>
                                <TableCell className="whitespace-nowrap">{cuentaLabel}</TableCell>
                                <TableCell className="whitespace-nowrap">{String(pago?.metodo || "Efectivo")}</TableCell>
                                <TableCell className="whitespace-nowrap">
                                  <Badge variant="outline" className="text-xs">
                                    {origenLabel}
                                  </Badge>
                                  {pago?.pagoEnDolares ? (
                                    <Badge variant="subtle" className="text-xs ml-1">
                                      USD
                                    </Badge>
                                  ) : null}
                                </TableCell>
                                <TableCell className="whitespace-nowrap">
                                  {comprobantes.length > 0 ? (
                                    <Badge variant="outline" className="text-xs">
                                      {comprobantes.length}
                                    </Badge>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">-</span>
                                  )}
                                </TableCell>
                                <TableCell
                                  className={cn(
                                    "text-right font-semibold",
                                    pago?._movimientoAnulado
                                      ? "text-muted-foreground line-through"
                                      : monto >= 0
                                        ? "text-emerald-600"
                                        : "text-red-600"
                                  )}
                                >
                                  {formatMoneyARS(monto)}
                                </TableCell>
                                <TableCell>
                                  {estadoFlags.length > 0 ? (
                                    <div className="flex flex-wrap gap-1">
                                      {estadoFlags.slice(0, 2).map((t) => (
                                        <Badge key={t} variant="outline" className="text-xs">
                                          {t}
                                        </Badge>
                                      ))}
                                    </div>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">OK</span>
                                  )}
                                </TableCell>
                                <TableCell className="text-right">
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-8 w-8 p-0"
                                        title="Acciones"
                                      >
                                        <MoreHorizontal className="w-4 h-4" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-[200px] bg-background border-border">
                                      <DropdownMenuItem
                                        className="cursor-pointer"
                                        onSelect={() => {
                                          setPagoDetalleProveedor({ pago, cuenta });
                                          setOpenPagoDetalleProveedor(true);
                                        }}
                                      >
                                        <Eye className="w-4 h-4 mr-2" />
                                        Ver detalle
                                      </DropdownMenuItem>
                                      {!puedeEditarEliminar && String(pago?.pagoGlobalId || "") ? (
                                        <>
                                          <DropdownMenuSeparator />
                                          <DropdownMenuItem
                                            disabled={guardando || movimientosProveedorByRowId?.[String(pago.pagoGlobalId)]?.anulado === true}
                                            className="text-red-600 focus:text-red-700"
                                            onSelect={async () => {
                                              const movimientoId = String(pago?.pagoGlobalId || "");
                                              if (!movimientoId) return;
                                              if (movimientosProveedorByRowId?.[movimientoId]?.anulado === true) {
                                                toast({
                                                  title: "Movimiento anulado",
                                                  description: "Este movimiento ya está anulado.",
                                                  color: "warning",
                                                });
                                                return;
                                              }
                                              const ok = await confirmAsync({
                                                title: "Eliminar pago global",
                                                description:
                                                  "Este pago proviene de un movimiento (pago global / saldo a favor). Se eliminará anulando el movimiento completo.",
                                                confirmText: "Eliminar",
                                                cancelText: "Cancelar",
                                                confirmColor: "destructive",
                                              });
                                              if (!ok) return;
                                              setGuardando(true);
                                              try {
                                                await anularMovimientoProveedor({ movimientoId });
                                                await cargarDatos({ silent: true });
                                                setPagosProveedorSeleccionados((prev) => {
                                                  const next = { ...(prev || {}) };
                                                  delete next[rowId];
                                                  return next;
                                                });
                                                toast({
                                                  title: "Movimiento anulado",
                                                  description: "Se anuló el movimiento asociado al pago global.",
                                                  color: "success",
                                                });
                                              } catch (e) {
                                                console.error("Error al anular movimiento desde pago:", e);
                                                toast({
                                                  title: "Error",
                                                  description: `No se pudo anular el movimiento: ${e?.message || String(e)}`,
                                                  color: "destructive",
                                                });
                                              } finally {
                                                setGuardando(false);
                                              }
                                            }}
                                          >
                                            <Trash2 className="w-4 h-4 mr-2" />
                                            Eliminar (anular mov.)
                                          </DropdownMenuItem>
                                        </>
                                      ) : null}
                                      <DropdownMenuItem
                                        disabled={!puedeEditarEliminar || !cuenta || guardando}
                                        onSelect={() => {
                                          if (!puedeEditarEliminar) return;
                                          if (!cuenta) return;
                                          setCuentaSeleccionada(cuenta);
                                          setPagoEdit({
                                            ...pago,
                                            idx: pago._idxOriginal,
                                            monto: Number(pago?.monto ?? pago?._monto ?? 0),
                                            fecha: formatFechaSegura(pago?.fecha),
                                            metodo: pago?.metodo || "Efectivo",
                                            notas: pago?.notas || "",
                                            responsable: pago?.responsable || user?.email || "Usuario no identificado",
                                            pagoEnDolares: !!pago?.pagoEnDolares,
                                            valorOficialDolar: pago?.pagoEnDolares ? (pago?.valorOficialDolar ?? null) : null,
                                            comprobantes: comprobantes,
                                          });
                                          setOpenEditarPago(true);
                                        }}
                                      >
                                        <Edit className="w-4 h-4 mr-2" />
                                        Editar
                                      </DropdownMenuItem>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem
                                        disabled={!puedeEditarEliminar || guardando}
                                        className="text-red-600 focus:text-red-700"
                                        onSelect={async () => {
                                          if (!puedeEditarEliminar) {
                                            const movimientoId = String(pago?.pagoGlobalId || "");
                                            if (movimientoId) {
                                              if (movimientosProveedorByRowId?.[movimientoId]?.anulado === true) {
                                                toast({
                                                  title: "Movimiento anulado",
                                                  description: "Este movimiento ya está anulado.",
                                                  color: "warning",
                                                });
                                                return;
                                              }
                                              const ok = await confirmAsync({
                                                title: "Eliminar pago global",
                                                description:
                                                  "Este pago proviene de un movimiento. Se eliminará anulando el movimiento completo.",
                                                confirmText: "Eliminar",
                                                cancelText: "Cancelar",
                                                confirmColor: "destructive",
                                              });
                                              if (!ok) return;
                                              setGuardando(true);
                                              try {
                                                await anularMovimientoProveedor({ movimientoId });
                                                await cargarDatos({ silent: true });
                                                setPagosProveedorSeleccionados((prev) => {
                                                  const next = { ...(prev || {}) };
                                                  delete next[rowId];
                                                  return next;
                                                });
                                                toast({
                                                  title: "Movimiento anulado",
                                                  description: "Se anuló el movimiento asociado.",
                                                  color: "success",
                                                });
                                              } catch (e) {
                                                console.error("Error al anular movimiento desde pago:", e);
                                                toast({
                                                  title: "Error",
                                                  description: `No se pudo anular el movimiento: ${e?.message || String(e)}`,
                                                  color: "destructive",
                                                });
                                              } finally {
                                                setGuardando(false);
                                              }
                                              return;
                                            }
                                            toast({
                                              title: "Acción no disponible",
                                              description:
                                                "Este pago proviene de un pago global/saldo a favor. Para revertirlo, anulá el movimiento asociado.",
                                              color: "warning",
                                            });
                                            return;
                                          }
                                          const ok = await confirmAsync({
                                            title: "Eliminar pago",
                                            description: "¿Eliminar este pago manual? Esta acción no se puede deshacer.",
                                            confirmText: "Eliminar",
                                            cancelText: "Cancelar",
                                            confirmColor: "destructive",
                                          });
                                          if (!ok) return;
                                          setGuardando(true);
                                          try {
                                            await mutarPagoManual({
                                              cuentaId: String(pago?._cuentaId || ""),
                                              action: "delete",
                                              idx: pago._idxOriginal,
                                            });
                                            await cargarDatos({ silent: true });
                                            setPagosProveedorSeleccionados((prev) => {
                                              const next = { ...(prev || {}) };
                                              delete next[rowId];
                                              return next;
                                            });
                                            toast({
                                              title: "Pago eliminado",
                                              description: "Se eliminó el pago manual.",
                                              color: "success",
                                            });
                                          } catch (e) {
                                            console.error("Error al eliminar pago manual:", e);
                                            toast({
                                              title: "Error",
                                              description: `No se pudo eliminar: ${e?.message || String(e)}`,
                                              color: "destructive",
                                            });
                                          } finally {
                                            setGuardando(false);
                                          }
                                        }}
                                      >
                                        <Trash2 className="w-4 h-4 mr-2" />
                                        Eliminar
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                        <TableFooter>
                          <TableRow>
                            <TableCell colSpan={9} className="p-3">
                              <div className="flex flex-col sm:flex-row gap-1 sm:items-center sm:justify-between text-sm">
                                <div className="text-muted-foreground">
                                  Filas: <span className="font-semibold text-foreground">{totalesTablaPagosProveedor.countAll}</span>{" "}
                                  · Pagado (activo):{" "}
                                  <span className="font-semibold text-foreground">{formatMoneyARS(totalesTablaPagosProveedor.sumAll)}</span>
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  No incluye cuentas anuladas ni movimientos anulados.
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        </TableFooter>
                      </Table>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-10 text-muted-foreground border border-border/60 rounded-lg">
                    <Wallet className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    <div className="font-medium">Sin pagos registrados</div>
                    <div className="text-sm">Este proveedor no tiene pagos en el rango seleccionado.</div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="movimientos" className="mt-4">
                {movimientosDetalleProveedorSeleccionado.length > 0 ? (
                  <div className="border border-border/60 rounded-lg overflow-hidden">
                    {totalesTablaMovimientosProveedor.countSelected > 0 ? (
                      <div className="px-3 py-2 border-b border-border/60 bg-muted/20 flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
                        <div className="text-sm">
                          <span className="font-semibold">{totalesTablaMovimientosProveedor.countSelected}</span>{" "}
                          seleccionad{totalesTablaMovimientosProveedor.countSelected !== 1 ? "os" : "o"} ·{" "}
                          <span className="font-semibold text-blue-700 dark:text-blue-300">
                            {formatMoneyARS(totalesTablaMovimientosProveedor.sumSelectedIngresado)}
                          </span>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-red-600 border-red-500/20 hover:text-red-700 hover:bg-red-500/10 hover:border-red-500/40"
                            disabled={guardando}
                            onClick={async () => {
                              const selectedIds = Object.keys(movimientosProveedorSeleccionados || {}).filter((k) => movimientosProveedorSeleccionados[k]);
                              const items = selectedIds.map((id) => movimientosProveedorByRowId[id]).filter(Boolean);
                              const activos = items.filter((m) => m?.anulado !== true && m?.id);
                              const ok = await confirmAsync({
                                title: "Anular movimientos seleccionados",
                                description: `Se anularán ${activos.length} movimiento${activos.length !== 1 ? "s" : ""}. Esto revertirá su impacto y mantendrá trazabilidad.`,
                                confirmText: "Anular",
                                cancelText: "Cancelar",
                                confirmColor: "destructive",
                              });
                              if (!ok) return;
                              setGuardando(true);
                              try {
                                let anulados = 0;
                                for (const m of activos) {
                                  await anularMovimientoProveedor({ movimientoId: m.id });
                                  anulados += 1;
                                }
                                await cargarDatos({ silent: true });
                                setMovimientosProveedorSeleccionados({});
                                toast({
                                  title: "Movimientos anulados",
                                  description: `Se anularon ${anulados} movimiento${anulados !== 1 ? "s" : ""}.`,
                                  color: "success",
                                });
                              } catch (e) {
                                console.error("Error al anular movimientos seleccionados:", e);
                                toast({
                                  title: "Error",
                                  description: `No se pudieron anular los movimientos: ${e?.message || String(e)}`,
                                  color: "destructive",
                                });
                              } finally {
                                setGuardando(false);
                              }
                            }}
                          >
                            <Trash2 className="w-4 h-4 mr-1" />
                            Anular
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setMovimientosProveedorSeleccionados({})}>
                            <X className="w-4 h-4 mr-1" />
                            Limpiar
                          </Button>
                        </div>
                      </div>
                    ) : null}
                    <div className="max-h-[55vh] overflow-auto">
                      <Table className="table-fixed [&_th]:uppercase [&_th]:text-[11px] [&_th]:h-10 [&_th]:px-2 [&_th]:py-2 [&_td]:p-2 [&_td]:align-top">
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-10">
                              <input
                                type="checkbox"
                                checked={
                                  movimientosProveedorIds.length > 0 &&
                                  movimientosProveedorIds.every((id) => !!movimientosProveedorSeleccionados?.[id])
                                }
                                onChange={(e) => {
                                  const checked = e.target.checked;
                                  setMovimientosProveedorSeleccionados(() => {
                                    if (!checked) return {};
                                    return movimientosProveedorIds.reduce((acc, id) => {
                                      acc[id] = true;
                                      return acc;
                                    }, {});
                                  });
                                }}
                                className="w-4 h-4"
                                aria-label="Seleccionar todos los movimientos"
                              />
                            </TableHead>
                            <TableHead>Fecha</TableHead>
                            <TableHead>Tipo</TableHead>
                            <TableHead>Comprobantes</TableHead>
                            <TableHead className="text-right">Monto ingresado</TableHead>
                            <TableHead className="text-right">Aplicado</TableHead>
                            <TableHead className="text-right">Δ saldo</TableHead>
                            <TableHead>Estado</TableHead>
                            <TableHead className="w-28 text-right">Acc.</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {movimientosDetalleProveedorSeleccionado.map((m) => {
                            const rowId = String(m?._rowId || "");
                            const tipo = String(m?.tipo || "");
                            const labelTipo = tipo === "saldoAFavor" ? "Saldo a favor" : "Pago global";
                            const montoIngresado =
                              tipo === "pagoGlobal"
                                ? Number(m?.pagoIngresado ?? m?.monto ?? 0)
                                : Number(m?.montoDelta ?? m?.monto ?? 0);
                            const aplicado = Number(m?.aplicadoACuentas ?? 0);
                            const deltaSaldo = Number(m?.montoDeltaSaldoAFavor ?? m?.montoDeltaSaldo ?? 0);
                            const anulado = m?.anulado === true;
                            const comprobantes = Array.isArray(m?.comprobantes) ? m.comprobantes : [];
                            return (
                              <TableRow key={m.id} className={anulado ? "opacity-60" : ""}>
                                <TableCell className="w-10">
                                  <input
                                    type="checkbox"
                                    checked={!!movimientosProveedorSeleccionados?.[rowId]}
                                    onChange={(e) => {
                                      const checked = e.target.checked;
                                      setMovimientosProveedorSeleccionados((prev) => {
                                        const next = { ...(prev || {}) };
                                        if (checked) next[rowId] = true;
                                        else delete next[rowId];
                                        return next;
                                      });
                                    }}
                                    className="w-4 h-4"
                                    aria-label="Seleccionar movimiento"
                                  />
                                </TableCell>
                                <TableCell className="whitespace-nowrap">
                                  {m?.fecha ? formatFechaAR(m.fecha) : m?.fechaRegistro ? formatFechaHoraArgentina(m.fechaRegistro) : "-"}
                                  {m?.fechaRegistro ? (
                                    <div className="text-xs text-muted-foreground">Reg: {formatFechaHoraArgentina(m.fechaRegistro)}</div>
                                  ) : null}
                                </TableCell>
                                <TableCell className="whitespace-nowrap">
                                  <Badge variant="outline" className="text-xs">
                                    {labelTipo}
                                  </Badge>
                                  {m?.pagoEnDolares ? (
                                    <Badge variant="subtle" className="text-xs ml-1">
                                      USD
                                    </Badge>
                                  ) : null}
                                </TableCell>
                                <TableCell className="whitespace-nowrap">
                                  {comprobantes.length > 0 ? (
                                    <Badge variant="outline" className="text-xs">
                                      {comprobantes.length}
                                    </Badge>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">-</span>
                                  )}
                                </TableCell>
                                <TableCell className="text-right font-semibold">{formatMoneyARS(montoIngresado)}</TableCell>
                                <TableCell className="text-right text-muted-foreground">{formatMoneyARS(aplicado)}</TableCell>
                                <TableCell className={cn("text-right font-semibold", deltaSaldo >= 0 ? "text-emerald-600" : "text-red-600")}>
                                  {formatMoneyARS(deltaSaldo)}
                                </TableCell>
                                <TableCell>
                                  {anulado ? (
                                    <Badge className="bg-muted/50 text-muted-foreground border border-border/60">Anulado</Badge>
                                  ) : (
                                    <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20">Activo</Badge>
                                  )}
                                </TableCell>
                                <TableCell>
                                  <div className="flex gap-1 justify-end">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="text-blue-600 border-blue-500/20 hover:text-blue-700 hover:bg-blue-500/10 hover:border-blue-500/40"
                                      onClick={() => {
                                        setMovimientoSeleccionado(m);
                                        setOpenMovimientoDetalle(true);
                                      }}
                                      title="Ver detalle"
                                    >
                                      <Eye className="w-4 h-4" />
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="text-red-600 border-red-500/20 hover:text-red-700 hover:bg-red-500/10 hover:border-red-500/40"
                                      onClick={() => handleAnularMovimientoProveedorDoc(m)}
                                      title="Eliminar (anular) movimiento"
                                      disabled={guardando || anulado}
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                        <TableFooter>
                          <TableRow>
                            <TableCell colSpan={9} className="p-3">
                              <div className="grid grid-cols-1 md:grid-cols-4 gap-2 text-sm">
                                <div className="text-muted-foreground">
                                  Total: <span className="font-semibold text-foreground">{totalesTablaMovimientosProveedor.countAll}</span>{" "}
                                  movimiento{totalesTablaMovimientosProveedor.countAll !== 1 ? "s" : ""}
                                </div>
                                <div className="flex items-center justify-between md:justify-start md:gap-2">
                                  <span className="text-muted-foreground">Ingresado:</span>
                                  <span className="font-semibold text-blue-700 dark:text-blue-300">
                                    {formatMoneyARS(totalesTablaMovimientosProveedor.sumIngresado)}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between md:justify-start md:gap-2">
                                  <span className="text-muted-foreground">Aplicado:</span>
                                  <span className="font-semibold text-muted-foreground">
                                    {formatMoneyARS(totalesTablaMovimientosProveedor.sumAplicado)}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between md:justify-start md:gap-2">
                                  <span className="text-muted-foreground">Δ saldo:</span>
                                  <span
                                    className={cn(
                                      "font-semibold",
                                      totalesTablaMovimientosProveedor.sumDelta >= 0
                                        ? "text-emerald-700 dark:text-emerald-300"
                                        : "text-red-700 dark:text-red-300"
                                    )}
                                  >
                                    {formatMoneyARS(totalesTablaMovimientosProveedor.sumDelta)}
                                  </span>
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        </TableFooter>
                      </Table>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-10 text-muted-foreground border border-border/60 rounded-lg">
                    <ArrowLeftRight className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    <div className="font-medium">Sin movimientos</div>
                    <div className="text-sm">No se encontraron pagos globales ni ajustes de saldo a favor.</div>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>

          <DialogFooter className="px-5 py-4 border-t border-border/60 bg-card">
            <Button
              variant="outline"
              onClick={() => {
                setOpenPagosProveedor(false);
                setProveedorPagosSeleccionadoId("");
              }}
            >
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={openPagoDetalleProveedor}
        onOpenChange={(open) => {
          setOpenPagoDetalleProveedor(open);
          if (!open) setPagoDetalleProveedor(null);
        }}
      >
        <DialogContent className="w-[95vw] max-w-[760px] border border-border/60 bg-card p-0 overflow-hidden">
          <DialogHeader className="px-5 py-4 border-b border-border/60">
            <DialogTitle className="flex items-center gap-2">
              <Wallet className="w-5 h-5 text-blue-600" />
              Detalle de pago
            </DialogTitle>
          </DialogHeader>

          {pagoDetalleProveedor?.pago ? (
            <div className="px-5 py-4 space-y-4">
              {(() => {
                const pago = pagoDetalleProveedor.pago;
                const cuenta = pagoDetalleProveedor.cuenta || null;
                const monto = Number(pago?._monto ?? pago?.monto ?? 0);
                const fecha = pago?._fecha || formatFechaSegura(pago?.fecha);
                const fechaRegistro = pago?._fechaRegistro || (typeof pago?.fechaRegistro === "string" ? pago.fechaRegistro : "");
                const kind = String(pago?._kind || "manual");
                const origenLabel =
                  kind === "reversion"
                    ? "Anulación"
                    : kind === "saldoAFavor"
                    ? "Saldo a favor"
                    : kind === "pagoGlobal"
                    ? "Pago global"
                    : "Manual";
                const comprobantes = Array.isArray(pago?.comprobantes) ? pago.comprobantes : [];
                const puedeEditarEliminar =
                  kind === "manual" &&
                  typeof pago?._idxOriginal === "number" &&
                  pago?.pagoGlobalProveedor !== true &&
                  pago?._origenMovimiento !== true;
                const movimientoId = String(pago?.pagoGlobalId || "");

                return (
                  <>
                    <div className="bg-muted/30 p-4 rounded-lg border border-border/60">
                      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                        <div className="space-y-1">
                          <div className={cn("text-2xl font-extrabold tracking-tight", monto >= 0 ? "text-emerald-600" : "text-red-600")}>
                            {formatMoneyARS(monto)}
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline" className="text-xs">
                              {origenLabel}
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              {String(pago?.metodo || "Efectivo")}
                            </Badge>
                            {pago?.pagoEnDolares ? (
                              <Badge variant="subtle" className="text-xs">
                                USD
                              </Badge>
                            ) : null}
                            {pago?._movimientoAnulado ? (
                              <Badge variant="outline" className="text-xs">
                                Movimiento anulado
                              </Badge>
                            ) : null}
                            {pago?._cuentaAnulada ? (
                              <Badge variant="outline" className="text-xs">
                                Cuenta anulada
                              </Badge>
                            ) : null}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {fecha ? formatFechaAR(fecha) : fechaRegistro ? formatFechaHoraArgentina(fechaRegistro) : "-"}
                            {fechaRegistro ? <span className="ml-2 text-xs">· Reg: {formatFechaHoraArgentina(fechaRegistro)}</span> : null}
                          </div>
                          {pago?.responsable ? (
                            <div className="text-sm text-muted-foreground">Por: {String(pago.responsable)}</div>
                          ) : null}
                        </div>

                        {cuenta ? (
                          <div className="bg-card border border-border/60 rounded-lg p-3 min-w-[240px]">
                            <div className="text-xs text-muted-foreground">Cuenta</div>
                            <div className="font-semibold">
                              {cuenta?.fecha ? formatFechaAR(cuenta.fecha) : `#${String(cuenta?.id || "").slice(0, 8)}`}
                            </div>
                            <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                              <div className="bg-muted/20 border border-border/60 rounded-md p-2">
                                <div className="text-muted-foreground">Total</div>
                                <div className="font-semibold">{formatMoneyARS(Number(cuenta?.monto ?? 0))}</div>
                              </div>
                              <div className="bg-muted/20 border border-border/60 rounded-md p-2">
                                <div className="text-muted-foreground">Pagado</div>
                                <div className="font-semibold text-emerald-600">{formatMoneyARS(Number(cuenta?.montoPagado ?? 0))}</div>
                              </div>
                              <div className="bg-muted/20 border border-border/60 rounded-md p-2">
                                <div className="text-muted-foreground">Saldo</div>
                                <div className="font-semibold text-red-600">
                                  {formatMoneyARS(Math.max(Number(cuenta?.monto ?? 0) - Number(cuenta?.montoPagado ?? 0), 0))}
                                </div>
                              </div>
                            </div>
                          </div>
                        ) : null}
                      </div>

                      {pago?.notas ? (
                        <div className="mt-3 text-sm">
                          <div className="text-xs text-muted-foreground mb-1">Notas</div>
                          <div className="whitespace-pre-wrap">{String(pago.notas)}</div>
                        </div>
                      ) : null}
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="font-semibold text-sm flex items-center gap-2">
                          <FileText className="w-4 h-4" />
                          Comprobantes
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {comprobantes.length} archivo{comprobantes.length !== 1 ? "s" : ""}
                        </div>
                      </div>

                      {comprobantes.length > 0 ? (
                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                          {comprobantes.slice(0, 12).map((comp, cidx) => {
                            const tipo = String(comp?.tipo || "").toLowerCase();
                            const url = String(comp?.url || "");
                            const nombre = String(comp?.nombre || `Comprobante ${cidx + 1}`);
                            if (!url) return null;
                            return (
                              <button
                                key={`${url}_${cidx}`}
                                type="button"
                                className="group relative w-full aspect-square rounded-md border border-border/60 bg-muted/20 overflow-hidden hover:border-border hover:shadow-sm transition-all"
                                onClick={() => {
                                  setComprobantePreview({ url, tipo: tipo || "image", nombre });
                                  setOpenComprobantePreview(true);
                                }}
                                title="Ver comprobante"
                              >
                                {tipo === "pdf" ? (
                                  <div className="w-full h-full flex items-center justify-center">
                                    <FileText className="w-6 h-6 text-red-600" />
                                  </div>
                                ) : (
                                  <img src={url} alt={nombre} className="w-full h-full object-cover" />
                                )}
                                <div className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                  <Eye className="w-5 h-5 text-white" />
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="text-sm text-muted-foreground border border-border/60 bg-muted/20 rounded-lg p-3">
                          Sin comprobantes para este pago.
                        </div>
                      )}
                    </div>

                    {pago?._origenMovimiento ? (
                      <div className="text-sm text-muted-foreground border border-border/60 bg-muted/20 rounded-lg p-3">
                        Este pago está ligado a un movimiento. Para revertirlo, anulá el movimiento en la pestaña Movimientos.
                      </div>
                    ) : null}

                    <div className="flex flex-col sm:flex-row gap-2 sm:justify-end">
                      <Button
                        variant="outline"
                        onClick={() => {
                          setOpenPagoDetalleProveedor(false);
                          setPagoDetalleProveedor(null);
                        }}
                      >
                        Cerrar
                      </Button>
                      {!puedeEditarEliminar && movimientoId ? (
                        <Button
                          variant="outline"
                          disabled={guardando || movimientosProveedorByRowId?.[movimientoId]?.anulado === true}
                          className="text-red-600 border-red-500/20 hover:text-red-700 hover:bg-red-500/10 hover:border-red-500/40 disabled:opacity-50"
                          onClick={async () => {
                            if (movimientosProveedorByRowId?.[movimientoId]?.anulado === true) {
                              toast({
                                title: "Movimiento anulado",
                                description: "Este movimiento ya está anulado.",
                                color: "warning",
                              });
                              return;
                            }
                            const ok = await confirmAsync({
                              title: "Eliminar pago global",
                              description:
                                "Este pago proviene de un movimiento (pago global / saldo a favor). Se eliminará anulando el movimiento completo.",
                              confirmText: "Eliminar",
                              cancelText: "Cancelar",
                              confirmColor: "destructive",
                            });
                            if (!ok) return;
                            setGuardando(true);
                            try {
                              await anularMovimientoProveedor({ movimientoId });
                              await cargarDatos({ silent: true });
                              setOpenPagoDetalleProveedor(false);
                              setPagoDetalleProveedor(null);
                              toast({
                                title: "Movimiento anulado",
                                description: "Se anuló el movimiento asociado al pago.",
                                color: "success",
                              });
                            } catch (e) {
                              console.error("Error al anular movimiento desde detalle de pago:", e);
                              toast({
                                title: "Error",
                                description: `No se pudo anular el movimiento: ${e?.message || String(e)}`,
                                color: "destructive",
                              });
                            } finally {
                              setGuardando(false);
                            }
                          }}
                        >
                          <Trash2 className="w-4 h-4 mr-1" />
                          Eliminar (anular mov.)
                        </Button>
                      ) : null}
                      <Button
                        variant="outline"
                        disabled={!puedeEditarEliminar || guardando || !cuenta}
                        className="text-amber-600 border-amber-500/20 hover:text-amber-700 hover:bg-amber-500/10 hover:border-amber-500/40 disabled:opacity-50"
                        onClick={() => {
                          if (!puedeEditarEliminar || !cuenta) return;
                          setCuentaSeleccionada(cuenta);
                          setPagoEdit({
                            ...pago,
                            idx: pago._idxOriginal,
                            monto: Number(pago?.monto ?? pago?._monto ?? 0),
                            fecha: formatFechaSegura(pago?.fecha),
                            metodo: pago?.metodo || "Efectivo",
                            notas: pago?.notas || "",
                            responsable: pago?.responsable || user?.email || "Usuario no identificado",
                            pagoEnDolares: !!pago?.pagoEnDolares,
                            valorOficialDolar: pago?.pagoEnDolares ? (pago?.valorOficialDolar ?? null) : null,
                            comprobantes: comprobantes,
                          });
                          setOpenEditarPago(true);
                          setOpenPagoDetalleProveedor(false);
                        }}
                      >
                        <Edit className="w-4 h-4 mr-1" />
                        Editar
                      </Button>
                      <Button
                        variant="outline"
                        disabled={!puedeEditarEliminar || guardando}
                        className="text-red-600 border-red-500/20 hover:text-red-700 hover:bg-red-500/10 hover:border-red-500/40 disabled:opacity-50"
                        onClick={async () => {
                          if (!puedeEditarEliminar) {
                            toast({
                              title: "Acción no disponible",
                              description:
                                "Este pago proviene de un pago global/saldo a favor o de un movimiento. Para revertirlo, anulá el movimiento en la pestaña Movimientos.",
                              color: "warning",
                            });
                            return;
                          }
                          const ok = await confirmAsync({
                            title: "Eliminar pago",
                            description: "¿Eliminar este pago manual? Esta acción no se puede deshacer.",
                            confirmText: "Eliminar",
                            cancelText: "Cancelar",
                            confirmColor: "destructive",
                          });
                          if (!ok) return;
                          setGuardando(true);
                          try {
                            await mutarPagoManual({
                              cuentaId: String(pago?._cuentaId || ""),
                              action: "delete",
                              idx: pago._idxOriginal,
                            });
                            await cargarDatos({ silent: true });
                            setOpenPagoDetalleProveedor(false);
                            setPagoDetalleProveedor(null);
                            setPagosProveedorSeleccionados((prev) => {
                              const next = { ...(prev || {}) };
                              const rowId = String(pago?._rowId || "");
                              if (rowId) delete next[rowId];
                              return next;
                            });
                            toast({ title: "Pago eliminado", description: "Se eliminó el pago manual.", color: "success" });
                          } catch (e) {
                            console.error("Error al eliminar pago manual:", e);
                            toast({
                              title: "Error",
                              description: `No se pudo eliminar: ${e?.message || String(e)}`,
                              color: "destructive",
                            });
                          } finally {
                            setGuardando(false);
                          }
                        }}
                      >
                        <Trash2 className="w-4 h-4 mr-1" />
                        Eliminar
                      </Button>
                    </div>
                  </>
                );
              })()}
            </div>
          ) : (
            <div className="px-5 py-8 text-sm text-muted-foreground">Sin detalle disponible.</div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={openComprobantePreview}
        onOpenChange={(open) => {
          setOpenComprobantePreview(open);
          if (!open) setComprobantePreview(null);
        }}
      >
        <DialogContent className="w-[95vw] max-w-[980px] border border-border/60 bg-card">
          <DialogHeader>
            <DialogTitle>{String(comprobantePreview?.nombre || "Comprobante")}</DialogTitle>
          </DialogHeader>
          {comprobantePreview?.url ? (
            String(comprobantePreview?.tipo || "").toLowerCase() === "pdf" ? (
              <iframe
                src={comprobantePreview.url}
                title={String(comprobantePreview?.nombre || "Comprobante")}
                className="w-full h-[70vh] rounded-lg border border-border/60 bg-background"
              />
            ) : (
              <img
                src={comprobantePreview.url}
                alt={String(comprobantePreview?.nombre || "Comprobante")}
                className="w-full max-h-[70vh] object-contain rounded-lg border border-border/60 bg-background"
              />
            )
          ) : (
            <div className="text-sm text-muted-foreground">Sin comprobante</div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={openMovimientoDetalle} onOpenChange={setOpenMovimientoDetalle}>
        <DialogContent className="w-[95vw] max-w-[650px] border border-border/60 bg-card">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowLeftRight className="w-5 h-5 text-blue-600" />
              Detalle de Movimiento
            </DialogTitle>
          </DialogHeader>
          {movimientoSeleccionado && (
            <div className="space-y-3 py-2">
              <div className="bg-muted/40 p-3 rounded-lg border border-border/60">
                <div className="font-bold text-foreground">
                  {movimientoSeleccionado?.proveedor?.nombre ||
                    proveedores.find((p) => p.id === movimientoSeleccionado?.proveedorId)?.nombre ||
                    "Proveedor"}
                </div>
                <div className="text-sm text-muted-foreground">
                  {formatFechaAR(movimientoSeleccionado.fecha)} · {String(movimientoSeleccionado.tipo || "")}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {movimientoSeleccionado?.fechaRegistro ? `Reg: ${formatFechaHoraArgentina(movimientoSeleccionado.fechaRegistro)}` : null}
                  {movimientoSeleccionado?.metodo ? ` · ${String(movimientoSeleccionado.metodo)}` : null}
                  {movimientoSeleccionado?.responsable ? ` · ${String(movimientoSeleccionado.responsable)}` : null}
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                <div className="bg-card p-2 rounded-md border border-border/60">
                  <div className="text-xs text-muted-foreground">Monto</div>
                  <div className="font-bold">
                    {formatMoneyARS(
                      movimientoSeleccionado.tipo === "pagoGlobal"
                        ? Number(movimientoSeleccionado?.pagoIngresado ?? movimientoSeleccionado?.monto ?? 0)
                        : Number(movimientoSeleccionado?.montoDelta ?? movimientoSeleccionado?.monto ?? 0)
                    )}
                  </div>
                </div>
                <div className="bg-card p-2 rounded-md border border-border/60">
                  <div className="text-xs text-muted-foreground">Aplicado a cuentas</div>
                  <div className="font-bold">{formatMoneyARS(Number(movimientoSeleccionado?.aplicadoACuentas ?? 0))}</div>
                </div>
                <div className="bg-card p-2 rounded-md border border-border/60">
                  <div className="text-xs text-muted-foreground">Estado</div>
                  <div className="font-bold">{movimientoSeleccionado?.anulado ? "Anulado" : "Activo"}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-card p-2 rounded-md border border-border/60">
                  <div className="text-xs text-muted-foreground">Saldo a favor antes</div>
                  <div className="font-bold">{formatMoneyARS(Number(movimientoSeleccionado?.saldoAFavorAntes ?? 0))}</div>
                </div>
                <div className="bg-card p-2 rounded-md border border-border/60">
                  <div className="text-xs text-muted-foreground">Saldo a favor después</div>
                  <div className="font-bold">{formatMoneyARS(Number(movimientoSeleccionado?.saldoAFavorDespues ?? 0))}</div>
                </div>
              </div>

              {movimientoSeleccionado?.notas ? (
                <div className="bg-card p-3 rounded-md border border-border/60 text-sm">
                  <div className="text-xs text-muted-foreground mb-1">Notas</div>
                  <div className="text-foreground whitespace-pre-wrap">{String(movimientoSeleccionado.notas)}</div>
                </div>
              ) : null}

              {(() => {
                const comprobantes = Array.isArray(movimientoSeleccionado?.comprobantes) ? movimientoSeleccionado.comprobantes : [];
                const cuentasAplicadas = Array.isArray(movimientoSeleccionado?.cuentasAplicadas) ? movimientoSeleccionado.cuentasAplicadas : [];
                const totalAplicado = cuentasAplicadas.reduce((acc, a) => acc + Number(a?.montoAplicado ?? 0), 0);
                return (
                  <div className="grid grid-cols-1 gap-3">
                    <div className="bg-card p-3 rounded-md border border-border/60">
                      <div className="flex items-center justify-between">
                        <div className="font-semibold text-sm flex items-center gap-2">
                          <FileText className="w-4 h-4" />
                          Comprobantes
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {comprobantes.length} archivo{comprobantes.length !== 1 ? "s" : ""}
                        </div>
                      </div>
                      {comprobantes.length > 0 ? (
                        <div className="mt-3 grid grid-cols-4 sm:grid-cols-6 gap-2">
                          {comprobantes.slice(0, 12).map((comp, cidx) => {
                            const tipo = String(comp?.tipo || "").toLowerCase();
                            const url = String(comp?.url || "");
                            const nombre = String(comp?.nombre || `Comprobante ${cidx + 1}`);
                            if (!url) return null;
                            return (
                              <button
                                key={`${url}_${cidx}`}
                                type="button"
                                className="group relative w-full aspect-square rounded-md border border-border/60 bg-muted/20 overflow-hidden hover:border-border hover:shadow-sm transition-all"
                                onClick={() => {
                                  setComprobantePreview({ url, tipo: tipo || "image", nombre });
                                  setOpenComprobantePreview(true);
                                }}
                                title="Ver comprobante"
                              >
                                {tipo === "pdf" ? (
                                  <div className="w-full h-full flex items-center justify-center">
                                    <FileText className="w-6 h-6 text-red-600" />
                                  </div>
                                ) : (
                                  <img src={url} alt={nombre} className="w-full h-full object-cover" />
                                )}
                                <div className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                  <Eye className="w-5 h-5 text-white" />
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="mt-3 text-sm text-muted-foreground bg-muted/20 border border-border/60 rounded-lg p-3">
                          Sin comprobantes para este movimiento.
                        </div>
                      )}
                    </div>

                    {cuentasAplicadas.length > 0 ? (
                      <div className="bg-card p-3 rounded-md border border-border/60">
                        <div className="flex items-center justify-between">
                          <div className="font-semibold text-sm">Cuentas impactadas</div>
                          <div className="text-xs text-muted-foreground">
                            {cuentasAplicadas.length} cuenta{cuentasAplicadas.length !== 1 ? "s" : ""} ·{" "}
                            <span className="font-semibold">{formatMoneyARS(Number(totalAplicado || 0))}</span>
                          </div>
                        </div>
                        <div className="mt-2 max-h-44 overflow-y-auto space-y-2">
                          {cuentasAplicadas.map((a, idx) => (
                            <div key={`${String(a?.cuentaId || "")}_${idx}`} className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-sm">
                              <div className="min-w-0">
                                <div className="font-medium truncate">#{String(a?.cuentaId || "").slice(0, 10)}</div>
                                <div className="text-xs text-muted-foreground truncate">{String(a?.cuentaId || "")}</div>
                              </div>
                              <div className="font-semibold text-emerald-600 shrink-0">{formatMoneyARS(Number(a?.montoAplicado ?? 0))}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })()}
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setOpenMovimientoDetalle(false);
                setMovimientoSeleccionado(null);
              }}
            >
              Cerrar
            </Button>
            {movimientoSeleccionado && (
              <Button
                variant="outline"
                className="text-red-600 border-red-500/20 hover:text-red-700 hover:bg-red-500/10 hover:border-red-500/40"
                onClick={() => handleAnularMovimientoProveedorDoc(movimientoSeleccionado)}
                disabled={guardando || movimientoSeleccionado?.anulado}
              >
                <Trash2 className="w-4 h-4 mr-1" />
                Eliminar
              </Button>
            )}
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
                <DateInput
                  value={pagoEdit.fecha}
                  onChange={(v) => setPagoEdit((prev) => ({ ...prev, fecha: v }))}
                  buttonClassName="w-full justify-start"
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
