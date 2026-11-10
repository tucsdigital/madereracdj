"use client";
import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
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
import { Receipt, Plus, Edit, Trash2, Eye, Filter, Download, Calendar, TrendingUp, TrendingDown, BarChart3, X, Search, Building2, Wallet, DollarSign, AlertCircle, FileText, Settings, Loader2, ArrowLeftRight, MoreHorizontal, ChevronLeft, ChevronRight, Copy, Share2, Link2, Clock3 } from "lucide-react";
import { Icon } from "@iconify/react";
import { Switch } from "@/components/ui/switch";
import ComprobantesPagoSection from "@/components/ventas/ComprobantesPagoSection";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/use-toast";
import { db } from "@/lib/firebase";
import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  updateDoc,
  serverTimestamp,
  query,
  where,
} from "firebase/firestore";
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
import CuentasPorPagarWorkspace from "@/components/gastos/CuentasPorPagarWorkspace";
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

const GastosPaginacion = ({ page, pageSize, total, onPageChange, onPageSizeChange }) => {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex flex-col gap-2 border-t border-border/50 bg-muted/10 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>Mostrar:</span>
        <Select value={String(pageSize)} onValueChange={(value) => onPageSizeChange(Number(value) || 10)}>
          <SelectTrigger className="h-7 w-[105px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[10, 20, 50, 100].map((size) => (
              <SelectItem key={size} value={String(size)} className="text-xs">
                {size}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span>Total: {total}</span>
      </div>
      <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
        <span>Pág. {Math.min(page, pageCount)} de {pageCount}</span>
        {Array.from({ length: Math.min(5, pageCount) }, (_, index) => (
          <Button
            key={index + 1}
            type="button"
            variant={page === index + 1 ? "default" : "outline"}
            size="sm"
            className="h-7 min-w-7 px-2 text-xs"
            onClick={() => onPageChange(index + 1)}
          >
            {index + 1}
          </Button>
        ))}
        <Button type="button" variant="outline" size="icon" className="h-7 w-7" onClick={() => onPageChange(page - 1)} disabled={page <= 1}>
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
        <Button type="button" variant="outline" size="icon" className="h-7 w-7" onClick={() => onPageChange(page + 1)} disabled={page >= pageCount}>
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
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
  concepto: yup.string().optional(),
  numeroComprobante: yup.string().optional(),
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
  const [errorCargaDatos, setErrorCargaDatos] = useState("");
  const primeraCargaRef = useRef(true);
  
  // Estados para modales
  const [openInterno, setOpenInterno] = useState(false);
  const [openProveedor, setOpenProveedor] = useState(false);
  const [proveedorFijoEnFormulario, setProveedorFijoEnFormulario] = useState(false);
  const [openPago, setOpenPago] = useState(false);
  const [openAgregarSaldoAFavor, setOpenAgregarSaldoAFavor] = useState(false);
  const [openHistorial, setOpenHistorial] = useState(false);
  const [openMovimientoDetalle, setOpenMovimientoDetalle] = useState(false);
  const [openShareStatement, setOpenShareStatement] = useState(false);
  const [shareProvider, setShareProvider] = useState(null);
  const [shareScope, setShareScope] = useState("all");
  const [shareFrom, setShareFrom] = useState("");
  const [shareTo, setShareTo] = useState("");
  const [shareExpiryDays, setShareExpiryDays] = useState("30");
  const [shareLinks, setShareLinks] = useState([]);
  const [createdShareUrl, setCreatedShareUrl] = useState("");
  const [shareLoading, setShareLoading] = useState(false);
  const [shareError, setShareError] = useState("");
  const [pdfLoadingProviderId, setPdfLoadingProviderId] = useState("");
  const [openGestionCategorias, setOpenGestionCategorias] = useState(false);
  const [editando, setEditando] = useState(null);
  const [cuentaSeleccionada, setCuentaSeleccionada] = useState(null);
  const [movimientoSeleccionado, setMovimientoSeleccionado] = useState(null);
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
  const [paginaInternos, setPaginaInternos] = useState(1);
  const [filasInternos, setFilasInternos] = useState(10);
  const [paginaMovimientos, setPaginaMovimientos] = useState(1);
  const [filasMovimientos, setFilasMovimientos] = useState(10);
  const [paginaCuentas, setPaginaCuentas] = useState(1);
  const [filasCuentas, setFilasCuentas] = useState(10);
  
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
      concepto: "",
      numeroComprobante: "",
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
    const desde = String(opts?.fechaDesde || fechaDesde || "0000-01-01");
    const hasta = String(opts?.fechaHasta || fechaHasta || "9999-12-31");
    try {
      setErrorCargaDatos("");
      if (!silent) setLoading(true);
      if (opts?.refreshOnlyInternal) {
        const internalsSnapshot = await getDocs(query(
          collection(db, "gastos"),
          where("fecha", ">=", desde),
          where("fecha", "<=", hasta)
        ));
        const internos = internalsSnapshot.docs
          .map((item) => {
            const data = item.data();
            return { id: item.id, ...data, fecha: formatFechaSegura(data.fecha) };
          })
          .filter((item) => item.tipo !== "proveedor")
          .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
        setGastosInternos(internos);
        return;
      }
      const gastosInternosQuery = query(
        collection(db, "gastos"),
        where("fecha", ">=", desde),
        where("fecha", "<=", hasta)
      );
      const cuentasProveedorQuery = query(
        collection(db, "gastos"),
        where("tipo", "==", "proveedor")
      );
      const [proveedoresSnap, gastosInternosSnap, cuentasProveedorSnap, pagosProveedoresSnap] = await Promise.all([
        getDocs(collection(db, "proveedores")),
        getDocs(gastosInternosQuery),
        getDocs(cuentasProveedorQuery),
        getDocs(collection(db, "pagosProveedores")),
      ]);
      const proveedoresData = proveedoresSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setProveedores(proveedoresData);
      const normalizarGasto = (doc) => {
        const data = doc.data();
        const proveedorId = String(data.proveedorId || data.proveedor?.id || "");
        const proveedorDirecto = data.proveedor && typeof data.proveedor === "object" ? data.proveedor : null;
        const proveedorListado = proveedoresData.find((item) => String(item.id) === proveedorId);
        return {
          id: doc.id,
          ...data,
          proveedorId,
          proveedor: proveedorDirecto || (proveedorListado ? {
            id: proveedorListado.id,
            nombre: proveedorListado.nombre || "",
            cuit: proveedorListado.cuit || "",
            telefono: proveedorListado.telefono || "",
          } : null),
          fecha: formatFechaSegura(data.fecha),
          fechaVencimiento: formatFechaSegura(data.fechaVencimiento),
        };
      };
      const internos = gastosInternosSnap.docs
        .map(normalizarGasto)
        .filter((g) => g.tipo !== "proveedor");
      const proveedoresGastos = cuentasProveedorSnap.docs.map(normalizarGasto);
      setGastosInternos(internos.sort((a, b) => new Date(b.fecha) - new Date(a.fecha)));
      setCuentasPorPagar(proveedoresGastos.sort((a, b) => new Date(b.fecha) - new Date(a.fecha)));
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
    } catch (error) {
      console.error("Error al cargar datos:", error);
      setErrorCargaDatos("No se pudieron cargar las cuentas y movimientos de proveedores.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [fechaDesde, fechaHasta]);

  // Recargar solo gastos (sin proveedores) — útil al cerrar modal de categorías
  const recargarSoloGastos = useCallback(async () => {
    try {
      const [gastosSnap, cuentasProveedorSnap] = await Promise.all([
        getDocs(query(
        collection(db, "gastos"),
        where("fecha", ">=", fechaDesde || "0000-01-01"),
        where("fecha", "<=", fechaHasta || "9999-12-31")
        )),
        getDocs(query(collection(db, "gastos"), where("tipo", "==", "proveedor"))),
      ]);
      const normalizarGasto = (doc) => {
        const data = doc.data();
        const proveedorId = String(data.proveedorId || data.proveedor?.id || "");
        return {
          id: doc.id,
          ...data,
          proveedorId,
          proveedor: data.proveedor && typeof data.proveedor === "object"
            ? data.proveedor
            : proveedores.find((item) => String(item.id) === proveedorId) || null,
          fecha: formatFechaSegura(data.fecha),
          fechaVencimiento: formatFechaSegura(data.fechaVencimiento),
        };
      };
      const internos = gastosSnap.docs.map(normalizarGasto).filter((g) => g.tipo !== "proveedor");
      const proveedoresGastos = cuentasProveedorSnap.docs.map(normalizarGasto);
      setGastosInternos(internos.sort((a, b) => new Date(b.fecha) - new Date(a.fecha)));
      setCuentasPorPagar(proveedoresGastos.sort((a, b) => new Date(b.fecha) - new Date(a.fecha)));
    } catch (err) {
      console.error("Error al recargar gastos:", err);
    }
  }, [fechaDesde, fechaHasta, proveedores]);

  const getStatementAuthHeaders = useCallback(async () => {
    if (!user || typeof user.getIdToken !== "function") throw new Error("No hay usuario autenticado");
    return { Authorization: `Bearer ${await user.getIdToken()}`, "Content-Type": "application/json" };
  }, [user]);

  const loadStatementLinks = useCallback(async (providerId) => {
    if (!providerId) return;
    try {
      setShareLoading(true);
      setShareError("");
      const headers = await getStatementAuthHeaders();
      const response = await fetch(`/api/erp/cuentas-pagar/compartir?proveedorId=${encodeURIComponent(providerId)}`, { headers, cache: "no-store" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.ok) throw new Error(result?.error || "No se pudieron cargar los enlaces");
      setShareLinks(Array.isArray(result.links) ? result.links : []);
    } catch (error) {
      setShareError(error?.message || "No se pudieron cargar los enlaces");
    } finally {
      setShareLoading(false);
    }
  }, [getStatementAuthHeaders]);

  const openStatementShare = (provider) => {
    const normalizedProvider = provider?.proveedor || provider || {};
    const providerId = String(provider?.proveedorId || normalizedProvider?.id || "");
    if (!providerId) {
      toast({ title: "Proveedor inválido", description: "No se pudo identificar el proveedor.", color: "warning" });
      return;
    }
    setShareProvider({ ...normalizedProvider, id: providerId });
    setShareScope("all");
    setShareFrom(fechaDesde);
    setShareTo(fechaHasta);
    setShareExpiryDays("30");
    setCreatedShareUrl("");
    setShareLinks([]);
    setShareError("");
    setOpenShareStatement(true);
  };

  useEffect(() => {
    if (openShareStatement && shareProvider?.id) loadStatementLinks(shareProvider.id);
  }, [openShareStatement, shareProvider?.id, loadStatementLinks]);

  const createStatementShare = async () => {
    if (!shareProvider?.id) return;
    setShareLoading(true);
    setShareError("");
    try {
      const headers = await getStatementAuthHeaders();
      const lang = typeof window !== "undefined" ? window.location.pathname.split("/").filter(Boolean)[0] || "es" : "es";
      const filters = shareScope === "range"
        ? { scope: "range", from: shareFrom, to: shareTo }
        : { scope: "all" };
      const response = await fetch("/api/erp/cuentas-pagar/compartir", {
        method: "POST",
        headers,
        body: JSON.stringify({ proveedorId: shareProvider.id, filters, expiresDays: Number(shareExpiryDays), lang }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.ok) throw new Error(result?.error || "No se pudo crear el enlace");
      setCreatedShareUrl(result.link.url);
      await loadStatementLinks(shareProvider.id);
      toast({ title: "Enlace creado", description: "El enlace es de solo lectura y vence en el plazo elegido.", color: "success" });
    } catch (error) {
      setShareError(error?.message || "No se pudo crear el enlace");
    } finally {
      setShareLoading(false);
    }
  };

  const copyStatementShare = async () => {
    if (!createdShareUrl) return;
    try {
      await navigator.clipboard.writeText(createdShareUrl);
      toast({ title: "Enlace copiado", description: "Ya podés compartirlo con el proveedor.", color: "success" });
    } catch {
      toast({ title: "No se pudo copiar", description: "Seleccioná y copiá el enlace manualmente.", color: "warning" });
    }
  };

  const downloadProviderStatementPdf = async (providerId) => {
    if (!providerId) return;
    setPdfLoadingProviderId(String(providerId));
    try {
      const headers = await getStatementAuthHeaders();
      delete headers["Content-Type"];
      const response = await fetch(`/api/erp/proveedores/${encodeURIComponent(String(providerId))}/estado-cuenta/pdf`, { headers });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result?.error || "No se pudo generar el PDF");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const providerName = cuentasPorProveedor.find((item) => String(item.proveedorId) === String(providerId))?.proveedor?.nombre || "proveedor";
      const filename = providerName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "proveedor";
      anchor.href = url;
      anchor.download = `estado-de-cuenta-${filename}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30000);
      toast({ title: "PDF generado", description: "El estado de cuenta se descargó correctamente.", color: "success" });
    } catch (error) {
      toast({ title: "Error al generar PDF", description: error?.message || "Intentá nuevamente.", color: "destructive" });
    } finally {
      setPdfLoadingProviderId("");
    }
  };

  const revokeStatementShare = async (linkId) => {
    const confirmed = await confirmAsync({
      title: "Revocar enlace compartido",
      description: "El proveedor dejará de poder consultar este estado de cuenta.",
      confirmText: "Revocar enlace",
      cancelText: "Conservar",
      confirmColor: "destructive",
    });
    if (!confirmed) return;
    setShareLoading(true);
    try {
      const headers = await getStatementAuthHeaders();
      const response = await fetch(`/api/erp/cuentas-pagar/compartir/${encodeURIComponent(linkId)}`, { method: "DELETE", headers });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.ok) throw new Error(result?.error || "No se pudo revocar el enlace");
      await loadStatementLinks(shareProvider?.id);
      toast({ title: "Enlace revocado", description: "El acceso público fue desactivado.", color: "success" });
    } catch (error) {
      setShareError(error?.message || "No se pudo revocar el enlace");
    } finally {
      setShareLoading(false);
    }
  };

  // Cargar datos al montar el componente
  useEffect(() => {
    const esPrimeraCarga = primeraCargaRef.current;
    primeraCargaRef.current = false;
    cargarDatos({ silent: !esPrimeraCarga, refreshOnlyInternal: !esPrimeraCarga });
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
        concepto: String(data.concepto || "").trim(),
        numeroComprobante: String(data.numeroComprobante || "").trim(),
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

  const handleEliminarMovimientoProveedorDoc = async (mov) => {
    if (!mov) return;
    const pagoId = String(mov?.id || "").trim();
    if (!pagoId) return;
    const ok = await confirmAsync({
      title: "Eliminar movimiento",
      description: "Se eliminará definitivamente y se revertirá su impacto en cuentas y saldo a favor. El registro original quedará en Auditoría.",
      confirmText: "Eliminar definitivamente",
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
      const resp = await fetch(`/api/erp/pagos-proveedores/${encodeURIComponent(pagoId)}/eliminar`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${idToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ origen: "ui_gastos", motivo: "Eliminado desde cuentas por pagar" }),
      });
      const out = await resp.json().catch(() => ({}));
      if (!resp.ok || !out?.ok) throw new Error(out?.error || "Error al eliminar");
      await cargarDatos({ silent: true });
      setOpenMovimientoDetalle(false);
      setMovimientoSeleccionado(null);
      toast({ title: "Movimiento eliminado", description: "Se revirtió su impacto y quedó registrado en Auditoría.", color: "success" });
    } catch (e) {
      console.error("Error al eliminar movimiento:", e);
      toast({
        title: "Error",
        description: `Error al eliminar movimiento: ${e?.message || String(e)}`,
        color: "destructive",
      });
    } finally {
      setGuardando(false);
    }
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
        description: "Este movimiento se elimina desde la actividad del proveedor en Cuentas por Pagar.",
        color: "warning",
      });
      return;
    }
    const pagosArr = Array.isArray(cuentaSeleccionada.pagos) ? cuentaSeleccionada.pagos : [];
    const target = pagosArr[idx];
    if (target?.pagoGlobalProveedor) {
      toast({
        title: "Acción no disponible",
        description: "Este pago pertenece a una operación del proveedor. Eliminá la operación desde la actividad de Cuentas por Pagar.",
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

  const handleEliminarMovimientoProveedor = async (item) => {
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
      title: "Eliminar movimiento",
      description: `Se eliminará definitivamente este ${label}; se revertirá el saldo a favor y, si corresponde, los pagos aplicados. El registro original quedará en Auditoría.`,
      confirmText: "Eliminar definitivamente",
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
      const resp = await fetch(`/api/erp/pagos-proveedores/${encodeURIComponent(pagoId)}/eliminar`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${idToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ origen: "ui_gastos", motivo: "Eliminado desde el historial de cuentas por pagar" }),
      });
      const out = await resp.json().catch(() => ({}));
      if (!resp.ok || !out?.ok) {
        throw new Error(out?.error || "Error al eliminar");
      }
      await cargarDatos({ silent: true });
      setOpenHistorial(false);
      setCuentaSeleccionada(null);
    } catch (e) {
      console.error("Error al eliminar movimiento:", e);
      toast({
        title: "Error",
        description: `Error al eliminar movimiento: ${e?.message || String(e)}`,
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
    setProveedorFijoEnFormulario(false);
    setValueProveedor("concepto", cuenta.concepto || cuenta.descripcion || "");
    setValueProveedor("numeroComprobante", cuenta.numeroComprobante || cuenta.nroComprobante || cuenta.comprobanteNumero || "");
    setValueProveedor("monto", cuenta.monto);
    setValueProveedor("proveedorId", cuenta.proveedorId);
    setValueProveedor("fecha", cuenta.fecha);
    setValueProveedor("fechaVencimiento", cuenta.fechaVencimiento || "");
    setValueProveedor("observaciones", cuenta.observaciones || "");
    
    if (cuenta.proveedor) {
      setProveedorSeleccionado(cuenta.proveedor);
        setBusquedaProveedor(`${String(cuenta.proveedor.nombre || "").toLocaleUpperCase("es-AR")} - ${cuenta.proveedor.telefono || ""}`);
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
    setBusquedaProveedor(proveedor ? `${String(proveedor.nombre || "").toLocaleUpperCase("es-AR")} - ${proveedor.telefono || ""}` : "");
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
    setProveedorFijoEnFormulario(false);
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

  // Los gastos internos respetan el rango seleccionado; CxP conserva el saldo global.
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
      cuentas: cuentasPorPagar,
      proveedores,
      movimientos: movimientosProveedor,
    });
    const montoVencido = cuentasPorPagar
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
         anulada: cuentasPorPagar.filter((c) => esCuentaAnulada(c)).length,
      },
      vencidas: resumen.cuentasVencidas,
      montoVencido,
      movimientosAnulados: resumen.movimientosAnulados,
      accountCount: resumen.cantidadCuentas,
    };
  }, [cuentasPorPagar, proveedores, movimientosProveedor]);

  // Agrupar cuentas por proveedor (usando datos filtrados por fecha)
  const cuentasPorProveedor = useMemo(() => {
    const cuentas = Array.isArray(cuentasPorPagar) ? cuentasPorPagar : [];
    const movs = Array.isArray(movimientosProveedor) ? movimientosProveedor : [];
    const proveedoresPorId = new Map((Array.isArray(proveedores) ? proveedores : []).map((provider) => [String(provider.id), provider]));
    for (const cuenta of cuentas) {
      const providerId = String(cuenta?.proveedorId || cuenta?.proveedor?.id || "");
      if (providerId && !proveedoresPorId.has(providerId)) {
        proveedoresPorId.set(providerId, {
          id: providerId,
          ...(cuenta.proveedor || {}),
          nombre: cuenta.proveedor?.nombre || "Proveedor sin registro",
        });
      }
    }
    for (const movimiento of movs) {
      const providerId = String(movimiento?.proveedorId || movimiento?.proveedor?.id || "");
      if (providerId && !proveedoresPorId.has(providerId)) {
        proveedoresPorId.set(providerId, {
          id: providerId,
          ...(movimiento.proveedor || {}),
          nombre: movimiento.proveedor?.nombre || "Proveedor sin registro",
        });
      }
    }
    const provs = Array.from(proveedoresPorId.values());

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

    return items.sort((a, b) => Number(b.saldoPendienteNeto || 0) - Number(a.saldoPendienteNeto || 0));
  }, [cuentasPorPagar, proveedores, movimientosProveedor]);

  // Filtrar datos (aplicando filtros de búsqueda sobre los datos ya filtrados por fecha)
  const gastosInternosFiltrados = useMemo(() => {
    return gastosInternosFiltradosPorFecha.filter(g => {
      const busqueda = filtroInterno.toLowerCase();
      return (g.concepto || "").toLowerCase().includes(busqueda) ||
             (g.observaciones || "").toLowerCase().includes(busqueda);
    });
  }, [gastosInternosFiltradosPorFecha, filtroInterno]);

  const cuentasPorPagarFiltradas = useMemo(() => {
    const cuentasBase = filtroEstadoPago === "vencida" ? cuentasPorPagar : cuentasPorPagarFiltradasPorFecha;
    return cuentasBase.filter((c) => {
      const busqueda = filtroProveedor.toLowerCase();
      const matchBusqueda = (c.proveedor?.nombre || "").toLowerCase().includes(busqueda);
      const estadoCalc = calcularEstadoCuenta(c);
      const matchEstado = !filtroEstadoPago || estadoCalc === filtroEstadoPago;
      const matchProveedorId = !filtroProveedorId || c.proveedorId === filtroProveedorId;
      return matchBusqueda && matchEstado && matchProveedorId;
    });
  }, [cuentasPorPagar, cuentasPorPagarFiltradasPorFecha, filtroProveedor, filtroEstadoPago, filtroProveedorId]);

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

  useEffect(() => {
    setPaginaInternos(1);
  }, [filtroInterno, fechaDesde, fechaHasta, filasInternos]);

  useEffect(() => {
    setPaginaMovimientos(1);
  }, [filtroProveedor, filtroProveedorId, fechaDesde, fechaHasta, filasMovimientos]);

  useEffect(() => {
    setPaginaCuentas(1);
  }, [filtroProveedor, filtroEstadoPago, filtroProveedorId, fechaDesde, fechaHasta, filasCuentas]);

  const gastosInternosPaginados = useMemo(() => {
    const start = (paginaInternos - 1) * filasInternos;
    return gastosInternosFiltrados.slice(start, start + filasInternos);
  }, [gastosInternosFiltrados, paginaInternos, filasInternos]);

  const movimientosProveedorPaginados = useMemo(() => {
    const start = (paginaMovimientos - 1) * filasMovimientos;
    return movimientosProveedorFiltrados.slice(start, start + filasMovimientos);
  }, [movimientosProveedorFiltrados, paginaMovimientos, filasMovimientos]);

  const cuentasPorPagarPaginadas = useMemo(() => {
    const start = (paginaCuentas - 1) * filasCuentas;
    return cuentasPorPagarFiltradas.slice(start, start + filasCuentas);
  }, [cuentasPorPagarFiltradas, paginaCuentas, filasCuentas]);

  // Exportar el historial unificado del proveedor seleccionado
  const exportarReporteCuentas = ({ events = [], provider = {}, from, to } = {}) => {
    if (events.length === 0) {
      toast({ title: "Sin datos", description: "No hay datos para exportar.", color: "warning" });
      return;
    }

    const csvValue = (value) => {
      const text = String(value ?? "");
      const safeText = typeof value === "string" && /^[=+@\-]/.test(text) ? `'${text}` : text;
      return `"${safeText.replace(/"/g, '""')}"`;
    };
    const datos = events.map((event) => ({
      Fecha: formatFechaAR(event.date),
      Proveedor: provider.nombre || "",
      Movimiento: event.title || "",
      Detalle: [event.description, event.detail].filter(Boolean).join(" · "),
      Importe: Number(event.amount || 0),
      Estado: event.status || "",
    }));
    const csv = [
      Object.keys(datos[0]).map(csvValue).join(","),
      ...datos.map((row) => Object.values(row).map(csvValue).join(","))
    ].join('\n');

    const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const providerName = String(provider.nombre || "proveedor").toLocaleLowerCase("es-AR").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    a.download = `cuenta-${providerName || "proveedor"}_${from || "inicio"}_${to || "hoy"}.csv`;
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

    const movimientosPorId = new Map((Array.isArray(movimientosProveedor) ? movimientosProveedor : []).map((movement) => [String(movement?.id || ""), movement]));
    const movimientosConReversion = new Set(
      normalizados
        .filter((payment) => payment?._kind === "reversion" && payment?.pagoGlobalId)
        .map((payment) => String(payment.pagoGlobalId))
    );
    return normalizados
      .filter((payment) => {
        const movementId = String(payment?.pagoGlobalId || "");
        return payment._kind !== "reversion" &&
          movimientosPorId.get(movementId)?.anulado !== true &&
          !movimientosConReversion.has(movementId);
      })
      .sort((a, b) => new Date(b._sortKey || 0) - new Date(a._sortKey || 0));
  }, [cuentaSeleccionada, movimientosProveedor]);

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
      <div className="py-8 px-2 mx-auto">
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
    <main className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-3 py-6 font-sans text-slate-900 sm:px-6 sm:py-8">
      <header className="border-b border-slate-200 pb-5">
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-[.18em] text-amber-700">Finanzas · Administración</p>
        <h1 className="text-3xl font-semibold tracking-[-.04em] sm:text-4xl">Gastos</h1>
        <p className="mt-2 text-sm text-slate-500">Gastos internos y cuentas por pagar a proveedores.</p>
      </header>

      {/* Tabs principales */}
      <Tabs value={vistaActiva} onValueChange={setVistaActiva} className="w-full">
        <TabsList className="mb-2 flex h-auto w-fit flex-wrap gap-1 rounded-none border-b border-slate-200 bg-transparent p-0">
          <TabsTrigger value="internos" className="h-10 rounded-none border-b-2 border-transparent px-4 text-sm text-slate-500 shadow-none data-[state=active]:border-slate-900 data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:text-slate-900 data-[state=active]:shadow-none">
            <BarChart3 className="w-4 h-4" />
            Gastos Internos
          </TabsTrigger>
          <TabsTrigger value="proveedores" className="h-10 rounded-none border-b-2 border-transparent px-4 text-sm text-slate-500 shadow-none data-[state=active]:border-slate-900 data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:text-slate-900 data-[state=active]:shadow-none">
            <Building2 className="w-4 h-4" />
            Cuentas por Pagar
          </TabsTrigger>
        </TabsList>

        {vistaActiva === "internos" ? (
          <Card className="mb-1 rounded-lg border-slate-200 bg-white shadow-none">
            <CardHeader className="p-3 sm:p-4">
              <div className="flex flex-col gap-3">
                <CardTitle className="text-sm font-semibold text-slate-900">
                  Período
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
                <div className="mt-3 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
                  <div className="flex items-center gap-2">
                    <span className="whitespace-nowrap text-sm text-muted-foreground">
                      Desde
                    </span>
                    <DateInput
                      value={fechaDesde}
                      onChange={(v) => setFechaDesde(v)}
                      buttonClassName="h-9 w-full justify-start rounded-md border-slate-200 bg-white text-xs shadow-sm sm:w-auto"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="whitespace-nowrap text-sm text-muted-foreground">
                      Hasta
                    </span>
                    <DateInput
                      value={fechaHasta}
                      min={fechaDesde || undefined}
                      onChange={(v) => setFechaHasta(v)}
                      buttonClassName="h-9 w-full justify-start rounded-md border-slate-200 bg-white text-xs shadow-sm sm:w-auto"
                    />
                  </div>
                </div>
              )}
            </CardHeader>
          </Card>
        ) : null}


        {/* Vista de Gastos Internos */}
        <TabsContent value="internos" className="space-y-6">
          {/* Dashboard de gastos internos */}
          <section className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-start sm:justify-between" aria-label="Resumen de gastos internos">
            <div className="min-w-0">
              <p className="text-xs font-medium text-slate-500">Total en el período</p>
              <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums text-rose-700">{formatMoneyARS(totalesInternos.total)}</p>
              <p className="mt-1 text-xs text-slate-500">{gastosInternosFiltradosPorFecha.length} registros</p>
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-3 sm:justify-end">
            {categoriasActivas.map((cat) => {
              const totalCategoria = totalesInternos.porCategoria[cat.id] || 0;
              const cantidadGastos = gastosInternosFiltradosPorFecha.filter(
                g => g.categoria === cat.id || g.categoriaNombre === cat.nombre || g.categoria === cat.nombre
              ).length;
              
              // Solo mostrar categorías que tienen gastos en el período
              if (cantidadGastos === 0) return null;
              
              return (
                <div key={cat.id} className="min-w-[115px] border-l border-slate-200 pl-3">
                  <div className="text-xs text-slate-500">{cat.nombre}</div>
                  <div className="mt-1 text-sm font-semibold tabular-nums text-slate-800">{formatMoneyARS(totalCategoria)}</div>
                  <div className="mt-0.5 text-[10px] text-slate-500">{cantidadGastos} gastos</div>
                </div>
              );
            })}
            </div>
          </section>

          {/* Estadísticas y gráficos por categoría */}
          <EstadisticasCategorias
            gastosInternos={gastosInternosFiltradosPorFecha}
            categoriasActivas={categoriasActivas}
            fechaDesde={fechaDesde}
            fechaHasta={fechaHasta}
          />

          {/* Tabla gastos internos */}
          <Card className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-none">
            <CardHeader className="flex flex-col gap-4 border-b border-slate-200 p-4 sm:p-5 xl:flex-row xl:items-end xl:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <CardTitle className="text-lg font-semibold tracking-tight text-slate-950">Libro de gastos</CardTitle>
                  <span className="text-xs tabular-nums text-slate-500">{gastosInternosFiltrados.length} registros</span>
                </div>
                <p className="mt-1 text-sm text-slate-500">Cada gasto, su responsable y la categoría asignada.</p>
              </div>
              <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2 xl:flex xl:w-auto xl:items-center">
                <label className="relative min-w-0 sm:col-span-2 xl:w-[270px]">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input placeholder="Concepto, responsable o categoría" value={filtroInterno} onChange={(event) => setFiltroInterno(event.target.value)} aria-label="Buscar gastos internos" className="h-9 rounded-md border-slate-200 pl-9 text-xs shadow-none" />
                </label>
                <Button variant="outline" onClick={() => setOpenGestionCategorias(true)} title="Gestionar categorías" className="h-9 rounded-md border-slate-200 px-3 text-xs font-medium shadow-none">
                  <Settings className="mr-1.5 h-4 w-4" />Categorías
                </Button>
                <Button onClick={() => setOpenInterno(true)} className="h-9 rounded-md px-3 text-xs font-semibold shadow-none">
                  <Plus className="mr-1.5 h-4 w-4" />Nuevo gasto
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div role="table" aria-label="Libro de gastos internos">
                <div role="row" className="hidden gap-4 border-b border-slate-200 bg-slate-50/70 px-5 py-2.5 text-[10px] font-semibold uppercase tracking-[.12em] text-slate-500 lg:grid lg:grid-cols-[minmax(220px,1.6fr)_minmax(145px,.9fr)_minmax(125px,.8fr)_minmax(130px,.85fr)_auto]">
                  <span role="columnheader">Concepto</span><span role="columnheader">Categoría</span><span role="columnheader">Fecha</span><span role="columnheader" className="text-right">Importe</span><span role="columnheader" className="text-right">Acciones</span>
                </div>
                {gastosInternosPaginados.length === 0 ? (
                  <div className="px-4 py-14 text-center"><p className="text-sm font-medium text-slate-800">No hay gastos para este período</p><p className="mt-1 text-xs text-slate-500">Probá cambiar el período o el texto de búsqueda.</p></div>
                ) : gastosInternosPaginados.map((g) => {
                  const categoria = obtenerCategoriaPorId(g.categoria) || categoriasActivas.find((item) => item.nombre === g.categoriaNombre || item.nombre === g.categoria);
                  return (
                    <article key={g.id} role="row" className="grid grid-cols-1 gap-x-4 gap-y-2 border-b border-slate-200 px-4 py-4 last:border-0 hover:bg-slate-50/50 sm:px-5 lg:grid-cols-[minmax(220px,1.6fr)_minmax(145px,.9fr)_minmax(125px,.8fr)_minmax(130px,.85fr)_auto] lg:items-center lg:py-3">
                      <div role="cell" className="min-w-0 border-b border-slate-100 pb-2 lg:border-0 lg:pb-0">
                        <h3 className="break-words text-sm font-semibold text-slate-900">{g.concepto || "Gasto sin concepto"}</h3>
                        <p className="mt-1 truncate text-[11px] text-slate-500">{g.responsable || "Responsable sin informar"} <span className="mx-1 text-slate-300">·</span><span className="font-mono">#{String(g.id || "").slice(-7)}</span></p>
                      </div>
                      <div role="cell" className="flex items-center justify-between gap-4 lg:block">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 lg:hidden">Categoría</span>
                        <span className="text-xs text-slate-700">{categoria?.nombre || g.categoriaNombre || g.categoria || "Sin categoría"}</span>
                      </div>
                      <div role="cell" className="flex items-center justify-between gap-4 lg:block">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 lg:hidden">Fecha</span>
                        <span className="text-xs tabular-nums text-slate-600">{g.fecha || "Sin fecha"}</span>
                      </div>
                      <div role="cell" className="flex items-center justify-between gap-4 lg:block lg:text-right">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 lg:hidden">Importe</span>
                        <span className="text-sm font-semibold tabular-nums text-rose-700">{formatMoneyARS(Number(g.monto) || 0)}</span>
                      </div>
                      <div role="cell" className="flex items-center justify-end gap-1 border-t border-slate-100 pt-2 lg:border-0 lg:pt-0">
                        <Button size="sm" variant="outline" onClick={() => handleEditarInterno(g)} className="h-8 rounded-md border-slate-200 px-2.5 text-[11px]">Editar</Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild><Button type="button" size="icon" variant="ghost" aria-label={`Más acciones para gasto ${g.concepto || ""}`} className="h-8 w-8 rounded-md"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem className="text-rose-700 focus:text-rose-700" onSelect={() => handleEliminar("interno", g.id)}><Trash2 className="mr-2 h-4 w-4" />Eliminar gasto</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </article>
                  );
                })}
              </div>
              <GastosPaginacion
                page={paginaInternos}
                pageSize={filasInternos}
                total={gastosInternosFiltrados.length}
                onPageChange={(page) => setPaginaInternos(Math.max(1, page))}
                onPageSizeChange={(size) => {
                  setFilasInternos(Math.min(100, Math.max(10, size)));
                  setPaginaInternos(1);
                }}
              />
            </CardContent>
          </Card>

        </TabsContent>

        <TabsContent value="proveedores" className="space-y-6">
          <CuentasPorPagarWorkspace
            providerGroups={cuentasPorProveedor}
            movements={movimientosProveedor}
            suppliers={proveedores}
            loadError={errorCargaDatos}
            onRetry={() => cargarDatos()}
            onNewAccount={(providerId = "") => {
              setEditando(null);
              resetProveedor();
              const providerGroup = cuentasPorProveedor.find((item) => String(item.proveedorId || item.proveedor?.id || "") === String(providerId));
              const supplier = proveedores.find((item) => String(item.id) === String(providerId)) || providerGroup?.proveedor || null;
              setProveedorFijoEnFormulario(Boolean(providerId));
              if (supplier) {
                setProveedorSeleccionado(supplier);
                setBusquedaProveedor(`${String(supplier.nombre || "").toLocaleUpperCase("es-AR")} - ${supplier.telefono || ""}`);
                setValueProveedor("proveedorId", providerId || supplier.id);
              } else if (providerId) {
                setProveedorSeleccionado({ id: providerId, nombre: "Proveedor" });
                setBusquedaProveedor("Proveedor");
                setValueProveedor("proveedorId", providerId);
              } else {
                setBusquedaProveedor("");
                setProveedorSeleccionado(null);
                setValueProveedor("proveedorId", "");
              }
              setMostrarDropdownProveedor(false);
              setOpenProveedor(true);
            }}
            onExport={exportarReporteCuentas}
            onShareProvider={openStatementShare}
            onDownloadProviderPdf={downloadProviderStatementPdf}
            pdfLoadingProviderId={pdfLoadingProviderId}
            onOpenAdvance={(provider) => abrirAgregarSaldoAFavor(provider)}
            onAccountHistory={(account) => {
              setCuentaSeleccionada(account);
              setOpenHistorial(true);
            }}
            onAccountPayment={(account) => {
              setPagoModo("cuenta");
              setCuentaSeleccionada(account);
              setMontoPago(String(calcularSaldoCuenta(account)));
              setPagoEnDolares(!!account.pagoEnDolares);
              setValorOficialDolar(account.valorOficialDolar ?? null);
              setComprobantesPago(account.comprobantes || []);
              setOpenPago(true);
            }}
            onAccountEdit={handleEditarProveedor}
            onAccountCancel={handleAnularCuentaProveedor}
            onMovementDetail={(movement) => {
              setMovimientoSeleccionado(movement);
              setOpenMovimientoDetalle(true);
            }}
            onMovementDelete={handleEliminarMovimientoProveedorDoc}
            busy={guardando}
          />
        </TabsContent>
      </Tabs>

      <Dialog open={openShareStatement} onOpenChange={setOpenShareStatement}>
        <DialogContent className="max-h-[90vh] w-[95vw] max-w-2xl overflow-y-auto rounded-[20px] border-0 bg-white shadow-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 pr-8">
              <Share2 className="h-5 w-5 text-blue-700" />Compartir estado de cuenta
            </DialogTitle>
            <p className="text-sm text-muted-foreground">
              <span className="uppercase">{shareProvider?.nombre || "Proveedor"}</span> · El enlace es de solo lectura. Cualquier persona que lo tenga podrá consultar la información incluida.
            </p>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="share-scope">Historial a compartir</Label>
                <Select value={shareScope} onValueChange={setShareScope}>
                  <SelectTrigger id="share-scope"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Historial completo</SelectItem>
                    <SelectItem value="range">Filtrar por período</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="share-expiry">Vigencia del enlace</Label>
                <Select value={shareExpiryDays} onValueChange={setShareExpiryDays}>
                  <SelectTrigger id="share-expiry"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">7 días</SelectItem>
                    <SelectItem value="30">30 días</SelectItem>
                    <SelectItem value="90">90 días</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {shareScope === "range" ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-2"><Label htmlFor="share-from">Desde</Label><Input id="share-from" type="date" value={shareFrom} onChange={(event) => setShareFrom(event.target.value)} /></div>
                <div className="space-y-2"><Label htmlFor="share-to">Hasta</Label><Input id="share-to" type="date" value={shareTo} onChange={(event) => setShareTo(event.target.value)} /></div>
              </div>
            ) : null}

            <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-3 text-sm text-blue-950">
              La vista compartida oculta notas internas y responsables. Los saldos muestran el estado actual; los movimientos respetan el período elegido.
            </div>

            {createdShareUrl ? (
              <div className="space-y-2 border-l-2 border-emerald-600 py-1 pl-3">
                <Label htmlFor="created-share-url" className="text-emerald-900">Enlace listo para compartir</Label>
                <div className="flex gap-2">
                  <Input id="created-share-url" readOnly value={createdShareUrl} className="bg-white" onFocus={(event) => event.target.select()} />
                  <Button type="button" variant="outline" onClick={copyStatementShare} aria-label="Copiar enlace"><Copy className="h-4 w-4" /></Button>
                </div>
                <a href={createdShareUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-blue-800 underline">
                  Abrir vista del proveedor <Link2 className="h-3 w-3" />
                </a>
              </div>
            ) : null}

            {shareError ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{shareError}</p> : null}

            <div className="flex flex-col-reverse justify-between gap-2 border-t pt-4 sm:flex-row sm:items-center">
              <Button type="button" variant="outline" onClick={() => setOpenShareStatement(false)}>Cerrar</Button>
              <Button
                type="button"
                onClick={createStatementShare}
                disabled={shareLoading || (shareScope === "range" && (!shareFrom || !shareTo || shareFrom > shareTo))}
              >
                {shareLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Share2 className="mr-2 h-4 w-4" />}
                Crear enlace seguro
              </Button>
            </div>

            <div className="space-y-2 border-t pt-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-semibold">Enlaces creados</h3>
                <Button type="button" variant="ghost" size="sm" onClick={() => loadStatementLinks(shareProvider?.id)} disabled={shareLoading}>Actualizar</Button>
              </div>
              {shareLoading && shareLinks.length === 0 ? (
                <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Cargando enlaces…</div>
              ) : shareLinks.length ? (
                <ul className="divide-y divide-slate-200/80 border-y border-slate-200/80">
                  {shareLinks.map((link) => {
                    const expired = link.expiresAt && new Date(link.expiresAt).getTime() <= Date.now();
                    const active = !link.revokedAt && !expired;
                    return (
                    <li key={link.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                            <span>{link.filters?.scope === "range" ? `${formatFechaAR(link.filters.from)} — ${formatFechaAR(link.filters.to)}` : "Historial completo"}</span>
                            <Badge variant="outline" className={active ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-slate-100 text-slate-600"}>
                              {active ? "Activo" : link.revokedAt ? "Revocado" : "Vencido"}
                            </Badge>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Creado {formatFechaHoraArgentina(link.createdAt)} · {link.expiresAt ? `vence ${formatFechaHoraArgentina(link.expiresAt)}` : "sin vencimiento"}
                          </p>
                        </div>
                        {active ? (
                          <Button type="button" size="sm" variant="outline" className="shrink-0 text-red-700" onClick={() => revokeStatementShare(link.id)} disabled={shareLoading}>
                            <X className="mr-1.5 h-3.5 w-3.5" />Revocar
                          </Button>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              ) : <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">Todavía no hay enlaces para este proveedor.</p>}
            </div>
          </div>
        </DialogContent>
      </Dialog>

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
      <Dialog
        open={openProveedor}
        onOpenChange={(open) => {
          setOpenProveedor(open);
          if (!open) setProveedorFijoEnFormulario(false);
        }}
      >
        <DialogContent className="w-[95vw] max-w-[600px] border border-border/60 bg-card">
          <DialogHeader>
            <DialogTitle>{editando ? "Editar Cuenta por Pagar" : "Nueva Factura"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmitProveedor(onSubmitProveedor)} className="flex flex-col gap-4 py-2">
            <div>
              <Label>Proveedor *</Label>
              {proveedorFijoEnFormulario ? (
                <div className="mt-1 rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5">
                  <p className="text-sm font-semibold uppercase text-slate-900">{proveedorSeleccionado?.nombre || "Proveedor"}</p>
                  <p className="mt-0.5 text-xs text-slate-500">Factura asociada a este proveedor</p>
                </div>
              ) : (
                <div className="relative mt-1">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 transform text-muted-foreground" />
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
                        className="absolute right-3 top-1/2 z-10 -translate-y-1/2 transform text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  {mostrarDropdownProveedor && busquedaProveedor.trim() && (
                    <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-y-auto rounded-md border border-border/60 bg-card shadow-lg">
                      {proveedoresFiltrados.length === 0 ? (
                        <div className="p-3 text-center text-sm text-muted-foreground">
                          No se encontraron proveedores que coincidan con &quot;{busquedaProveedor}&quot;
                        </div>
                      ) : (
                        proveedoresFiltrados.map(proveedor => (
                          <button
                            key={proveedor.id}
                            type="button"
                            onClick={() => seleccionarProveedor(proveedor)}
                            className={`w-full border-b border-border/60 px-3 py-2 text-left transition-colors last:border-b-0 hover:bg-muted/50 ${
                              proveedorSeleccionado?.id === proveedor.id ? "bg-blue-500/10" : ""
                            }`}
                          >
                            <div className="font-medium uppercase">{proveedor.nombre}</div>
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
              )}

              {errorsProveedor.proveedorId && (
                <span className="text-xs text-red-500">{errorsProveedor.proveedorId.message}</span>
              )}
              {proveedorSeleccionado && !errorsProveedor.proveedorId && !proveedorFijoEnFormulario && (
                <span className="mt-1 flex items-center gap-1 text-xs text-green-600">
                  <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  Proveedor seleccionado
                </span>
              )}
            </div>
            
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="cuenta-proveedor-concepto">Concepto</Label>
                <Input
                  id="cuenta-proveedor-concepto"
                  placeholder="Ej.: compra de madera"
                  maxLength={160}
                  {...registerProveedor("concepto")}
                />
              </div>
              <div>
                <Label htmlFor="cuenta-proveedor-comprobante">N.º de comprobante</Label>
                <Input
                  id="cuenta-proveedor-comprobante"
                  placeholder="Factura, remito u otro"
                  maxLength={100}
                  {...registerProveedor("numeroComprobante")}
                />
              </div>
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
                  <div className="font-medium uppercase text-foreground">{resumenProveedorParaPago.proveedorNombre}</div>
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
                <div className="font-semibold uppercase text-foreground">{proveedorAgregarSaldo.nombre}</div>
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
                <div className="font-bold text-lg uppercase text-foreground">{cuentaSeleccionada.proveedor?.nombre}</div>
                {(cuentaSeleccionada.movimientoPagoGlobalProveedor || cuentaSeleccionada.movimientoSaldoAFavor) && (
                  <div className="mt-1 text-xs text-muted-foreground">
                    Este registro es un movimiento de saldo (no una factura); eliminarlo revierte su impacto.
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
                      onClick={() => handleEliminarMovimientoProveedor(cuentaSeleccionada)}
                      disabled={guardando}
                    >
                      <Trash2 className="w-4 h-4 mr-1" />
                      Eliminar movimiento
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
                  {String(movimientoSeleccionado?.proveedor?.nombre ||
                    proveedores.find((p) => p.id === movimientoSeleccionado?.proveedorId)?.nombre ||
                    "Proveedor").toLocaleUpperCase("es-AR")}
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
                  <div className="text-xs text-muted-foreground">Tipo</div>
                  <div className="font-bold">Movimiento activo</div>
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
                onClick={() => handleEliminarMovimientoProveedorDoc(movimientoSeleccionado)}
                disabled={guardando}
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
    </main>
  );
};

export default GastosPage;
