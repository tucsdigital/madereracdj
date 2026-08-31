"use client";
import React, { useCallback, useEffect, useState, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { db } from "@/lib/firebase";
import { collection, getDocs, doc, getDoc } from "firebase/firestore";
import { generarContenidoImpresion, descargarPDFDesdeIframe } from "@/lib/obra-utils";
import { repairObraPedidosByCreationDate } from "@/lib/obra-numbering";
import {
  Building,
  CheckCircle,
  Clock,
  AlertCircle,
  Trash2,
  X,
  AlertTriangle,
  Info,
  Loader2,
  ChevronDown,
  ChevronUp,
  Printer,
  Eye,
  Pencil,
  ArrowRightCircle,
  Plus,
} from "lucide-react";
import { useRouter, useParams } from "next/navigation";
import { Icon } from "@iconify/react";
import { useAuth } from "@/provider/auth.provider";
import { DateInput } from "@/components/ui/date-input";
import ObrasHeader from "@/components/obras/ObrasHeader";
import CalendarioObras from "@/components/obras/CalendarioObras";
import ObraSidePanel from "@/components/obras/ObraSidePanel";
import WizardConversion from "@/components/obras/WizardConversion";
import { ObrasListTable } from "@/components/obras/ObrasListTable";

const estadosObra = {
  pendiente_inicio: {
    label: "Pendiente de Inicio",
    color: "bg-yellow-100 text-yellow-800 border-yellow-200",
    icon: Clock,
  },
  en_ejecucion: {
    label: "En Ejecución",
    color: "bg-blue-100 text-blue-800 border-blue-200",
    icon: Building,
  },
  pausada: {
    label: "Pausada",
    color: "bg-orange-100 text-orange-800 border-orange-200",
    icon: Clock,
  },
  completada: {
    label: "Completada",
    color: "bg-green-100 text-green-800 border-green-200",
    icon: CheckCircle,
  },
  cancelada: {
    label: "Cancelada",
    color: "bg-red-100 text-red-800 border-red-200",
    icon: AlertCircle,
  },
  // Para presupuestos de obra, el estado mostrado/filtrado es siempre "Activo"
  activo: {
    label: "Activo",
    color: "bg-green-100 text-green-800 border-green-200",
    icon: CheckCircle,
  },
};

const PERIODOS_LISTA = [
  { value: "7dias", label: "Fecha: Ultimos 7 dias" },
  { value: "30dias", label: "Fecha: Ultimos 30 dias" },
  { value: "90dias", label: "Fecha: Ultimos 90 dias" },
  { value: "todos", label: "Fecha: Todo el periodo" },
];

const formatCurrency = (value) =>
  `$${Number(value || 0).toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const normalizeSearch = (value) =>
  String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

const getClienteSearchFields = (cliente = {}) => [
  cliente.nombre,
  cliente.telefono,
  cliente.celular,
  cliente.whatsapp,
  cliente.cuil,
  cliente.dni,
  cliente.cuit,
  cliente.email,
  cliente.direccion,
  cliente.localidad,
  cliente.provincia,
];

const getClienteSecondaryLabel = (cliente = {}) =>
  cliente.telefono ||
  cliente.celular ||
  cliente.whatsapp ||
  cliente.cuil ||
  cliente.dni ||
  cliente.cuit ||
  cliente.email ||
  "-";

const buildSearchHaystack = (item = {}) =>
  normalizeSearch(
    [
      item.numeroPedido,
      item.id,
      ...getClienteSearchFields(item.cliente),
      item.vendedor,
      item.ubicacion?.direccion,
    ].join(" ")
  );

const parseMaybeDate = (value) => {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;

  const normalized =
    typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? `${value}T12:00:00`
      : value;

  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatDateLabel = (value, { includeTime = true } = {}) => {
  const parsed = parseMaybeDate(value);
  if (!parsed) {
    return {
      date: "Sin fecha",
      time: "",
    };
  }

  return {
    date: parsed.toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: "America/Argentina/Buenos_Aires",
    }),
    time: includeTime
      ? `${parsed.toLocaleTimeString("es-AR", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
          timeZone: "America/Argentina/Buenos_Aires",
        })} hs`
      : "",
  };
};

const getObraPaymentMetrics = (obra) => {
  const cobranzas = obra?.cobranzas || {};
  const senia = Number(cobranzas.senia) || 0;
  const monto = Number(cobranzas.monto) || 0;
  const historialPagos = Array.isArray(cobranzas.historialPagos)
    ? cobranzas.historialPagos
    : [];
  const totalHistorial = historialPagos.reduce(
    (sum, pago) => sum + (Number(pago?.monto) || 0),
    0
  );
  const totalAbonado = senia + monto + totalHistorial;
  const total = Number(obra?.presupuestoTotal) || 0;
  const debe = Math.max(total - totalAbonado, 0);

  return {
    total,
    totalAbonado,
    debe,
  };
};

const getObraProgress = (obra) => {
  if (obra?.estado === "completada") return 100;
  if (obra?.estado === "cancelada" || obra?.estado === "pendiente_inicio") return 0;

  const inicio = parseMaybeDate(obra?.fechas?.inicio);
  const fin = parseMaybeDate(obra?.fechas?.fin);

  if (!inicio || !fin) {
    return obra?.estado === "en_ejecucion" ? 50 : 0;
  }

  const now = new Date();
  const totalMs = Math.max(fin.getTime() - inicio.getTime(), 1);
  const elapsedMs = now.getTime() - inicio.getTime();
  const progress = Math.round((elapsedMs / totalMs) * 100);

  return Math.max(0, Math.min(progress, 100));
};

const getListReferenceDate = (item, tipo) =>
  tipo === "obra"
    ? item?.fechaCreacion || item?.fechas?.inicio || ""
    : item?.fechaCreacion || "";

const matchesPeriodoLista = (referenceValue, periodo) => {
  if (!referenceValue || periodo === "todos") return true;

  const parsed = parseMaybeDate(referenceValue);
  if (!parsed) return true;

  const today = new Date();
  today.setHours(23, 59, 59, 999);

  const from = new Date(today);

  if (periodo === "7dias") {
    from.setDate(today.getDate() - 7);
  } else if (periodo === "30dias") {
    from.setDate(today.getDate() - 30);
  } else if (periodo === "90dias") {
    from.setDate(today.getDate() - 90);
  }

  from.setHours(0, 0, 0, 0);
  return parsed >= from && parsed <= today;
};

// Componente para la celda de total con desplegable (maneja su propio estado)
const TotalCellWithDropdown = ({ bloques }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsExpanded(false);
      }
    };

    if (isExpanded) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isExpanded]);

  // Si solo hay un bloque, mostrar el total directamente
  if (bloques.length === 1) {
    const total = Number(bloques[0]?.total) || 0;
    return (
      <div>
        <div className="font-medium">
          $
          {total.toLocaleString("es-AR", {
            minimumFractionDigits: 2,
          })}
        </div>
        <div className="text-xs text-gray-500 mt-0.5">1 bloque</div>
      </div>
    );
  }

  // Si hay múltiples bloques, mostrar desplegable
  if (bloques.length > 1) {
    return (
      <div className="relative" ref={dropdownRef}>
        <div
          className="flex items-center gap-2 cursor-pointer hover:bg-purple-50 rounded p-1 transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            setIsExpanded(!isExpanded);
          }}
        >
          <div className="flex-1">
            <div className="font-medium text-purple-700">
              1: $
              {(Number(bloques[0]?.total) || 0).toLocaleString("es-AR", {
                minimumFractionDigits: 2,
              })}
            </div>
            <div className="text-xs text-gray-500 mt-0.5">
              {bloques.length} bloques
            </div>
          </div>
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-purple-600" />
          ) : (
            <ChevronDown className="w-4 h-4 text-purple-600" />
          )}
        </div>

        {isExpanded && (
          <div
            className="absolute top-full left-0 mt-1 bg-white border border-purple-200 rounded-lg shadow-lg z-50 min-w-[200px] p-2"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-1">
              {bloques.map((bloque, index) => (
                <div
                  key={bloque.id || index}
                  className="flex items-center justify-between p-2 hover:bg-purple-50 rounded transition-colors cursor-default"
                >
                  <div className="flex-1">
                    <div className="text-xs font-semibold text-gray-700">
                      {bloque.nombre || `Bloque ${index + 1}`}
                    </div>
                    <div className="text-xs text-purple-700 font-medium mt-0.5">
                      ${(Number(bloque.total) || 0).toLocaleString("es-AR", {
                        minimumFractionDigits: 2,
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Fallback si no hay bloques
  return <div className="font-medium text-gray-400">$0.00</div>;
};

const ObrasPage = () => {
  const [obrasData, setObrasData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteMessage, setDeleteMessage] = useState("");
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);
  const [deleteType, setDeleteType] = useState("");
  
  // Estados para el nuevo header (deben ir antes de los useMemo que los usan)
  const [vistaCalendario, setVistaCalendario] = useState("15dias");
  const [busquedaGlobal, setBusquedaGlobal] = useState("");
  const [busquedaPresupuestos, setBusquedaPresupuestos] = useState("");
  const [busquedaObras, setBusquedaObras] = useState("");
  const [busquedaGlobalAplicada, setBusquedaGlobalAplicada] = useState("");
  const [busquedaPresupuestosAplicada, setBusquedaPresupuestosAplicada] = useState("");
  const [busquedaObrasAplicada, setBusquedaObrasAplicada] = useState("");
  const [loadingBusquedaPresupuestos, setLoadingBusquedaPresupuestos] = useState(false);
  const [loadingBusquedaObras, setLoadingBusquedaObras] = useState(false);
  const [filtros, setFiltros] = useState({
    estado: "",
    cliente: "",
    estadoPago: "",
    fechaDesde: "",
    fechaHasta: "",
  });
  const [listaActiva, setListaActiva] = useState("presupuestos");
  const [periodoLista, setPeriodoLista] = useState("30dias");
  const [vistaPresupuestos, setVistaPresupuestos] = useState("todos");
  
  // Estados para el calendario
  const [currentWeekStart, setCurrentWeekStart] = useState(() => {
    const today = new Date();
    const day = today.getDay();
    const diff = day === 0 ? -6 : 1 - day; // Lunes como primer día
    const monday = new Date(today);
    monday.setDate(today.getDate() + diff);
    monday.setHours(0, 0, 0, 0);
    return monday;
  });

  const [current15Start, setCurrent15Start] = useState(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  });
  
  // Estado para fecha de inicio del mes (cuando vista es "mes")
  const [currentMonthStart, setCurrentMonthStart] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  
  // Obra seleccionada para panel lateral (etapa 3)
  const [obraSeleccionada, setObraSeleccionada] = useState(null);
  const [showObraPanel, setShowObraPanel] = useState(false);
  
  // Wizard de conversión (etapa 4)
  const [presupuestoParaConvertir, setPresupuestoParaConvertir] = useState(null);
  const [showWizardConversion, setShowWizardConversion] = useState(false);
  
  // Estado para impresión de obras
  const [imprimiendoObraId, setImprimiendoObraId] = useState(null);
  const initialLoadDoneRef = useRef(false);
  const lastRepairKeyRef = useRef("obras_last_repair_run_at");
  
  // Función para imprimir obra
  const handleImprimirObra = async (obra) => {
    if (!obra) return;

    try {
      setImprimiendoObraId(obra.id);
      // Cargar presupuesto si existe
      let presupuesto = null;
      if (obra.presupuestoInicialId) {
        try {
          const presDoc = await getDoc(doc(db, "obras", obra.presupuestoInicialId));
          if (presDoc.exists()) {
            presupuesto = { id: presDoc.id, ...presDoc.data() };
          }
        } catch (e) {
          console.error("Error al cargar presupuesto:", e);
        }
      }

      const movimientos = obra.cobranzas?.historialPagos || [];
      const contenido = generarContenidoImpresion(
        obra,
        presupuesto,
        obra.presupuestoInicialId ? "presupuesto" : "gasto",
        movimientos
      );

      // Crear iframe temporal para generar PDF
      const iframe = document.createElement("iframe");
      iframe.style.display = "none";
      document.body.appendChild(iframe);
      iframe.contentDocument.write(contenido);
      iframe.contentDocument.close();

      await new Promise((resolve) => setTimeout(resolve, 500));

      await descargarPDFDesdeIframe(obra, presupuesto, obra.presupuestoInicialId ? "presupuesto" : "gasto", movimientos, iframe);

      document.body.removeChild(iframe);
    } catch (error) {
      console.error("Error al imprimir:", error);
      alert("Error al generar el PDF");
    } finally {
      setImprimiendoObraId(null);
    }
  };
  
  // Obtener fecha de inicio según la vista
  const fechaInicioCalendario = useMemo(() => {
    if (vistaCalendario === "mes") return currentMonthStart;
    if (vistaCalendario === "semana") return currentWeekStart;
    return current15Start;
  }, [vistaCalendario, currentWeekStart, currentMonthStart, current15Start]);
  
  // Handler para cambiar fecha de inicio del calendario
  const handleFechaInicioChange = (nuevaFecha) => {
    if (vistaCalendario === "mes") {
      setCurrentMonthStart(nuevaFecha);
    } else if (vistaCalendario === "semana") {
      setCurrentWeekStart(nuevaFecha);
    } else {
      setCurrent15Start(nuevaFecha);
    }
  };
  
  const [notas, setNotas] = useState([]);
  const [showNotaDialog, setShowNotaDialog] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [editingNotaId, setEditingNotaId] = useState(null);
  const [editingNotaGroupId, setEditingNotaGroupId] = useState(null);
  const [notaForm, setNotaForm] = useState({
    empleadoId: "",
    empleadoNombre: "",
    barrioLote: "",
    numObra: "",
    telefono: "",
    detalle: "",
    fechaDesde: "",
    fechaHasta: "",
  });
  const [savingNota, setSavingNota] = useState(false);
  const [deletingNota, setDeletingNota] = useState(null);
  const [showDeleteNotaDialog, setShowDeleteNotaDialog] = useState(false);
  const [notaToDelete, setNotaToDelete] = useState(null);
  const [loadingNotas, setLoadingNotas] = useState(true);
  const [clientes, setClientes] = useState([]);
  const [empleados, setEmpleados] = useState([]);
  
  const router = useRouter();
  const params = useParams();
  const { lang } = params || {};
  const { user } = useAuth();

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setBusquedaGlobalAplicada(busquedaGlobal);
    }, 180);
    return () => clearTimeout(timeoutId);
  }, [busquedaGlobal]);

  useEffect(() => {
    setLoadingBusquedaPresupuestos(true);
    const timeoutId = setTimeout(() => {
      setBusquedaPresupuestosAplicada(busquedaPresupuestos);
      setLoadingBusquedaPresupuestos(false);
    }, 180);
    return () => clearTimeout(timeoutId);
  }, [busquedaPresupuestos]);

  useEffect(() => {
    setLoadingBusquedaObras(true);
    const timeoutId = setTimeout(() => {
      setBusquedaObrasAplicada(busquedaObras);
      setLoadingBusquedaObras(false);
    }, 180);
    return () => clearTimeout(timeoutId);
  }, [busquedaObras]);

  const formatNombreEmpleado = useCallback((value) => {
    const s = String(value || "").trim();
    if (!s) return "";
    return s
      .toLowerCase()
      .split(/\s+/)
      .map((w) => (w ? w.slice(0, 1).toUpperCase() + w.slice(1) : ""))
      .join(" ");
  }, []);

  // Funciones del calendario ahora están en CalendarioObras component

  // Cargar notas desde Firestore
  const loadNotas = useCallback(async () => {
    if (!user) return;
    try {
      setLoadingNotas(true);
      const notasSnap = await getDocs(collection(db, "notasObras"));
      const notasData = notasSnap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setNotas(notasData);
    } catch (error) {
      console.error("Error al cargar notas:", error);
      setDeleteMessage("❌ Error al cargar las notas");
      setTimeout(() => setDeleteMessage(""), 5000);
    } finally {
      setLoadingNotas(false);
    }
  }, [user]);

  useEffect(() => {
    loadNotas();
  }, [loadNotas]);

  // Cargar clientes para el filtro
  useEffect(() => {
    const fetchClientes = async () => {
      try {
        const clientesSnap = await getDocs(collection(db, "clientes"));
        const clientesData = clientesSnap.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setClientes(clientesData);
      } catch (error) {
        console.error("Error al cargar clientes:", error);
      }
    };
    fetchClientes();
  }, []);

  useEffect(() => {
    const fetchEmpleados = async () => {
      try {
        const snap = await getDocs(collection(db, "empleados"));
        const data = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((e) => e?.activo !== false);
        data.sort((a, b) => String(a?.nombre || "").localeCompare(String(b?.nombre || ""), "es", { sensitivity: "base" }));
        setEmpleados(data);
      } catch (error) {
        console.error("Error al cargar empleados:", error);
      }
    };
    fetchEmpleados();
  }, []);

  // Guardar o actualizar nota
  const saveNota = async () => {
    if (!notaForm.empleadoId || !notaForm.fechaDesde || !notaForm.fechaHasta || !notaForm.detalle || !user) {
      setDeleteMessage("⚠️ Por favor completa todos los campos obligatorios");
      setTimeout(() => setDeleteMessage(""), 3000);
      return;
    }

    if (String(notaForm.fechaHasta) < String(notaForm.fechaDesde)) {
      setDeleteMessage("⚠️ La fecha hasta no puede ser menor que la fecha desde");
      setTimeout(() => setDeleteMessage(""), 3000);
      return;
    }

    try {
      setSavingNota(true);
      
      if (editingNotaId) {
        // Editar nota existente
        const response = await fetch("/api/notas-obras", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            notaId: editingNotaId,
            groupId: editingNotaGroupId,
            ...notaForm,
            userId: user.uid,
          }),
        });

        if (!response.ok) throw new Error("Error al actualizar nota");
        await response.json().catch(() => ({}));
        await loadNotas();
        setDeleteMessage("✅ Nota actualizada exitosamente");
      } else {
        // Crear nueva nota
        const response = await fetch("/api/notas-obras", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...notaForm,
            userId: user.uid,
            userEmail: user.email,
          }),
        });

        if (!response.ok) throw new Error("Error al crear nota");
        await response.json().catch(() => ({}));
        await loadNotas();
        setDeleteMessage("✅ Nota creada exitosamente");
      }

      setShowNotaDialog(false);
      setNotaForm({
        empleadoId: "",
        empleadoNombre: "",
        barrioLote: "",
        numObra: "",
        telefono: "",
        detalle: "",
        fechaDesde: "",
        fechaHasta: "",
      });
      setEditingNotaId(null);
      setEditingNotaGroupId(null);
      setTimeout(() => setDeleteMessage(""), 3000);
    } catch (error) {
      console.error("Error al guardar nota:", error);
      setDeleteMessage(`❌ Error: ${error.message}`);
      setTimeout(() => setDeleteMessage(""), 5000);
    } finally {
      setSavingNota(false);
    }
  };

  // Abrir diálogo para editar nota
  const openEditDialog = (nota) => {
    setEditingNotaId(nota.id);
    setEditingNotaGroupId(nota.groupId || null);
    setNotaForm({
      empleadoId: nota.empleadoId || "",
      empleadoNombre: nota.empleadoNombre || "",
      barrioLote: nota.barrioLote || "",
      numObra: nota.numObra || "",
      telefono: nota.telefono || "",
      detalle: nota.detalle || nota.productos || "",
      fechaDesde: nota.fechaDesde || nota.fecha || "",
      fechaHasta: nota.fechaHasta || nota.fecha || "",
    });
    setShowNotaDialog(true);
  };

  // Mostrar confirmación de eliminación
  const confirmDeleteNota = (nota) => {
    setNotaToDelete(nota);
    setShowDeleteNotaDialog(true);
  };

  // Eliminar nota
  const deleteNota = async () => {
    if (!user || !notaToDelete) return;
    
    try {
      setDeletingNota(notaToDelete.id);
      
      const response = await fetch("/api/notas-obras", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notaId: notaToDelete.id,
          groupId: notaToDelete.groupId || null,
          userId: user.uid,
        }),
      });

      if (!response.ok) throw new Error("Error al eliminar nota");
      await response.json().catch(() => ({}));
      await loadNotas();
      
      setDeleteMessage("✅ Nota eliminada exitosamente");
      setTimeout(() => setDeleteMessage(""), 3000);
      
      setShowDeleteNotaDialog(false);
      setNotaToDelete(null);
    } catch (error) {
      console.error("Error al eliminar nota:", error);
      setDeleteMessage("❌ Error al eliminar la nota");
      setTimeout(() => setDeleteMessage(""), 5000);
    } finally {
      setDeletingNota(null);
    }
  };

  // Columnas para presupuestos
  const presupuestosColumns = useMemo(() => [
    {
      accessorKey: "numeroPedido",
      header: "N° Presupuesto",
      cell: ({ row }) => {
        const numero = row.getValue("numeroPedido");
        return (
          <div className="flex items-center gap-2">
            <div className="font-medium cursor-pointer hover:underline text-purple-600">
              {numero || "Sin número"}
            </div>
            <Badge
              variant="outline"
              className="text-xs bg-purple-50 text-purple-700 border-purple-200"
            >
              PO
            </Badge>
          </div>
        );
      },
    },
    {
      accessorKey: "cliente",
      header: "Cliente",
      cell: ({ row }) => {
        const cliente = row.original.cliente;
        return (
          <div>
            <div className="font-medium">{cliente?.nombre || "Sin nombre"}</div>
            <div className="text-xs text-gray-500">
              {getClienteSecondaryLabel(cliente)}
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: "fechaCreacion",
      header: "Fecha",
      enableSorting: true,
      cell: ({ row }) => {
        const fecha = formatDateLabel(row.getValue("fechaCreacion"));
        return (
          <div>
            <div className="font-medium text-foreground">{fecha.date}</div>
            {fecha.time ? (
              <div className="text-xs text-muted-foreground">{fecha.time}</div>
            ) : null}
          </div>
        );
      },
    },
    {
      accessorKey: "presupuestoTotal",
      header: "Total",
      cell: ({ row }) => {
        const bloques = row.original.bloques || [];
        return <TotalCellWithDropdown bloques={bloques} />;
      },
    },
    {
      id: "bloques",
      header: "Bloques",
      cell: ({ row }) => {
        const totalBloques = Array.isArray(row.original.bloques)
          ? row.original.bloques.length
          : 0;
        const label = totalBloques === 1 ? "1 bloque" : `${totalBloques} bloques`;
        return <div className="text-sm font-medium text-foreground">{label}</div>;
      },
    },
    {
      accessorKey: "estadoUI",
      header: "Estado",
      cell: ({ row }) => {
        const estado = row.getValue("estadoUI");
        const estadoInfo = estadosObra[estado] || estadosObra.activo;
        const EstadoIcon = estadoInfo.icon;

        return (
          <Badge
            variant="outline"
            className={`inline-flex h-7 w-7 items-center justify-center rounded-full border-0 p-0 ${estadoInfo.color}`}
            title={estadoInfo.label}
            aria-label={`Estado: ${estadoInfo.label}`}
          >
            <EstadoIcon className="h-4 w-4" aria-hidden="true" />
          </Badge>
        );
      },
    },
    {
      id: "actions",
      header: "Acciones",
      cell: ({ row }) => {
        return (
          <div className="flex items-center gap-2">
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 rounded-full text-blue-600 hover:bg-blue-50 hover:text-blue-700"
              title="Convertir a Obra"
              onClick={(e) => {
                e.stopPropagation();
                setPresupuestoParaConvertir(row.original);
                setShowWizardConversion(true);
              }}
            >
              <ArrowRightCircle className="w-4 h-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
              title="Editar"
              onClick={(e) => {
                e.stopPropagation();
                router.push(`/${lang}/obras/presupuesto/${row.original.id}`);
              }}
            >
              <Pencil className="w-4 h-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 rounded-full text-red-600 hover:bg-red-50 hover:text-red-700"
              title="Eliminar"
              onClick={(e) => {
                e.stopPropagation();
                window.dispatchEvent(
                  new CustomEvent("deletePresupuesto", {
                    detail: { id: row.original.id },
                  })
                );
              }}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        );
      },
      enableSorting: false,
    },
  ], [lang, router, setPresupuestoParaConvertir, setShowWizardConversion]);

  // Función para mostrar el diálogo de confirmación
  const showDeleteConfirmation = useCallback((id, type, itemName) => {
    setItemToDelete({ id, name: itemName });
    setDeleteType(type);
    setShowDeleteDialog(true);
  }, []);

  // Columnas para obras
  const obrasColumns = useMemo(() => [
    {
      accessorKey: "numeroPedido",
      header: "N° Obra",
      cell: ({ row }) => {
        const numero = row.getValue("numeroPedido");
        const obra = row.original;
        const tieneDocumentacion = obra.documentacion?.links && Array.isArray(obra.documentacion.links) && obra.documentacion.links.length > 0;
        // Verificar si hay notas asociadas (por número de obra o nombre de cliente)
        const tieneNotas = notas.some(n => {
          const nombreNota = (n.numObra || n.nombreObra || "").toLowerCase();
          const numeroObra = (numero || "").toLowerCase();
          const nombreCliente = (obra.cliente?.nombre || "").toLowerCase();
          return nombreNota === numeroObra || nombreNota === nombreCliente;
        });
        // Verificar si está en ejecución actualmente según fechas
        const estaEnEjecucion = obra.estado === "en_ejecucion" && obra.fechas?.inicio && obra.fechas?.fin;
        const hoy = new Date().toISOString().split("T")[0];
        const enRangoFechas = estaEnEjecucion && hoy >= obra.fechas.inicio && hoy <= obra.fechas.fin;
        
        return (
          <div className="flex items-center gap-2">
          <div className="font-medium cursor-pointer hover:underline text-blue-600">
            {numero || "Sin número"}
            </div>
            <div className="flex items-center gap-1">
              {tieneDocumentacion && (
                <Icon
                  icon="heroicons:paper-clip"
                  className="w-4 h-4 text-blue-500"
                  title="Tiene documentación"
                />
              )}
              {tieneNotas && (
                <Icon
                  icon="heroicons:document-text"
                  className="w-4 h-4 text-yellow-500"
                  title="Tiene notas asociadas"
                />
              )}
              {enRangoFechas && (
                <Icon
                  icon="heroicons:play-circle"
                  className="w-4 h-4 text-green-500 animate-pulse"
                  title="En ejecución actualmente"
                />
              )}
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: "cliente",
      header: "Cliente",
      cell: ({ row }) => {
        const cliente = row.original.cliente;
        return (
          <div>
            <div className="font-medium">{cliente?.nombre || "Sin nombre"}</div>
            <div className="text-xs text-gray-500">
              {getClienteSecondaryLabel(cliente)}
            </div>
          </div>
        );
      },
    },
    {
      accessorFn: (row) => row?.fechas?.inicio || row?.fechaCreacion || "",
      id: "fechaInicio",
      header: "Fecha Inicio",
      enableSorting: true,
      cell: ({ row }) => {
        const fecha = formatDateLabel(row.getValue("fechaInicio"));
        return (
          <div>
            <div className="font-medium text-foreground">{fecha.date}</div>
            {fecha.time ? (
              <div className="text-xs text-muted-foreground">{fecha.time}</div>
            ) : null}
          </div>
        );
      },
    },
    {
      accessorKey: "estado",
      header: "Estado",
      cell: ({ row }) => {
        const estado = row.getValue("estado");
        const estadoInfo = estadosObra[estado] || estadosObra.pendiente_inicio;
        const EstadoIcon = estadoInfo.icon;

        return (
          <Badge
            variant="outline"
            className={`inline-flex h-7 w-7 items-center justify-center rounded-full border-0 p-0 ${estadoInfo.color}`}
            title={estadoInfo.label}
            aria-label={`Estado: ${estadoInfo.label}`}
          >
            <EstadoIcon className="h-4 w-4" aria-hidden="true" />
          </Badge>
        );
      },
    },
    {
      accessorKey: "presupuestoTotal",
      header: "Total",
      cell: ({ row }) => {
        return <div className="font-semibold text-foreground">{formatCurrency(row.getValue("presupuestoTotal"))}</div>;
      },
    },
    {
      id: "pago",
      header: "Pago",
      cell: ({ row }) => {
        const { total, totalAbonado } = getObraPaymentMetrics(row.original);
        const paidRatio = total > 0 ? Math.min((totalAbonado / total) * 100, 100) : 0;

        return (
          <div>
            <div className="font-semibold text-foreground">{formatCurrency(totalAbonado)}</div>
            <div className="text-xs text-muted-foreground">{Math.round(paidRatio)}%</div>
          </div>
        );
      },
    },
    {
      id: "debe",
      header: "Debe",
      cell: ({ row }) => {
        const { debe } = getObraPaymentMetrics(row.original);

        return (
          <div className={`font-semibold ${debe > 0 ? "text-foreground" : "text-emerald-600"}`}>
            {formatCurrency(debe)}
          </div>
        );
      },
    },
    {
      id: "actions",
      header: "Acciones",
      cell: ({ row }) => {
        const obra = row.original;
        
        return (
          <div className="flex items-center gap-2">
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 rounded-full text-blue-600 hover:bg-blue-50 hover:text-blue-700"
              title="Ver panel"
              onClick={(e) => {
                e.stopPropagation();
                setObraSeleccionada(obra);
                setShowObraPanel(true);
              }}
            >
              <Eye className="w-4 h-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
              title="Editar"
              onClick={(e) => {
                e.stopPropagation();
                router.push(`/${lang}/obras/${obra.id}`);
              }}
            >
              <Pencil className="w-4 h-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 rounded-full text-red-600 hover:bg-red-50 hover:text-red-700"
              title="Eliminar obra"
              onClick={(e) => {
                e.stopPropagation();
                showDeleteConfirmation(obra.id, "obra", obra.numeroPedido || "obra");
              }}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        );
      },
      enableSorting: false,
    },
  ], [notas, lang, router, setObraSeleccionada, setShowObraPanel, showDeleteConfirmation]);

  // Función para confirmar la eliminación
  const confirmDelete = async () => {
    if (!itemToDelete || !user) {
      console.error(
        "Error: No hay item para eliminar o usuario no autenticado",
        { itemToDelete, user }
      );
      setShowDeleteDialog(false);
      return;
    }

    try {
      setDeleting(true);
      setDeleteMessage("");

      console.log("Iniciando proceso de eliminación:", {
        itemToDelete,
        deleteType,
        user,
      });

      // Usar la API como en ventas
      const response = await fetch("/api/delete-document", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          documentId: itemToDelete.id,
          collectionName: "obras", // Siempre es 'obras' para esta página
          userId: user.uid,
          userEmail: user.email,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || `Error al eliminar ${deleteType}`);
      }

      const result = await response.json();

      // Actualizar la lista local
      setObrasData((prev) =>
        prev.filter((item) => item.id !== itemToDelete.id)
      );

      setDeleteMessage(`✅ ${result.message}`);

      // Limpiar mensaje después de 3 segundos
      setTimeout(() => setDeleteMessage(""), 3000);
    } catch (error) {
      console.error(`Error al eliminar ${deleteType}:`, error);
      console.error("Detalles del error:", {
        error: error.message,
        code: error.code,
        stack: error.stack,
        itemToDelete,
        deleteType,
        user: user?.uid,
      });

      setDeleteMessage(`❌ Error: ${error.message}`);

      // Limpiar mensaje después de 5 segundos
      setTimeout(() => setDeleteMessage(""), 5000);
    } finally {
      setDeleting(false);
      setShowDeleteDialog(false);
      setItemToDelete(null);
    }
  };


  // Event listeners para los botones de borrado
  useEffect(() => {
    const handleDeletePresupuestoEvent = (event) => {
      const presupuesto = obrasData.find(
        (p) => p.id === event.detail.id && p.tipo === "presupuesto"
      );
      if (presupuesto) {
        showDeleteConfirmation(
          event.detail.id,
          "presupuesto",
          presupuesto.cliente?.nombre || "Presupuesto"
        );
      }
    };

    const handleDeleteObraEvent = (event) => {
      const obra = obrasData.find(
        (o) => o.id === event.detail.id && o.tipo === "obra"
      );
      if (obra) {
        showDeleteConfirmation(
          event.detail.id,
          "obra",
          obra.cliente?.nombre || "Obra"
        );
      }
    };

    window.addEventListener("deletePresupuesto", handleDeletePresupuestoEvent);
    window.addEventListener("deleteObra", handleDeleteObraEvent);

    return () => {
      window.removeEventListener(
        "deletePresupuesto",
        handleDeletePresupuestoEvent
      );
      window.removeEventListener("deleteObra", handleDeleteObraEvent);
    };
  }, [obrasData, showDeleteConfirmation]);

  // Función para cargar datos (reutilizable)
  const fetchData = useCallback(async ({ showLoader = true } = {}) => {
      try {
        if (showLoader) setLoading(true);
        const obrasSnap = await getDocs(collection(db, "obras"));
        const base = obrasSnap.docs.map((d) => ({ ...d.data(), id: d.id }));
        // Enriquecer con presupuestoTotal, estadoPago y fechaListado
        const enriched = await Promise.all(
          base.map(async (o) => {
            let presupuestoTotal = 0;
            // Totales según tipo
            if (o.tipo === "presupuesto") {
              // Para presupuestos con bloques, usar el total del primer bloque como referencia
              if (o.bloques && Array.isArray(o.bloques) && o.bloques.length > 0) {
                presupuestoTotal = Number(o.bloques[0]?.total) || 0;
              } else {
                // Fallback a campos antiguos si no hay bloques
                presupuestoTotal =
                  Number(o.total) || Number(o.productosTotal) || 0;
              }
            } else if (o.tipo === "obra") {
              // Preferir el total de la obra si está presente
              const totalLocalObra =
                Number(o.total) ||
                Number(o.subtotal) ||
                (Number(o.productosTotal) || 0) +
                  (Number(o.materialesTotal) || 0) +
                  (Number(o.gastoObraManual) || 0) +
                  (Number(o.costoEnvio) || 0) -
                  (Number(o.descuentoTotal) || 0);

              presupuestoTotal = Number(totalLocalObra) || 0;

              // Si no hay total local, intentar obtenerlo del presupuesto inicial (fallback)
              if (
                (!presupuestoTotal || Number.isNaN(presupuestoTotal)) &&
                o.presupuestoInicialId
              ) {
                try {
                  const pres = await getDoc(
                    doc(db, "obras", o.presupuestoInicialId)
                  );
                  if (pres.exists()) {
                    const pd = pres.data();
                    const totalPresupuesto =
                      Number(pd.total) ||
                      Number(pd.subtotal) ||
                      (Number(pd.productosTotal) || 0) +
                        (Number(pd.materialesTotal) || 0);
                    presupuestoTotal = Number(totalPresupuesto) || 0;
                  }
                } catch (_) {}
              }
            }
            // Fecha de la columna: usar fechaCreacion para ordenamiento y visualización
            const fechaCreacion = o.fechaCreacion || "";

            const cobr = o.cobranzas || {};
            const abonado =
              (Number(cobr.senia) || 0) +
              (Number(cobr.monto) || 0) +
              (cobr.historialPagos || []).reduce(
                (a, p) => a + (Number(p.monto) || 0),
                0
              );
          let estadoPago = "pendiente";
          if (presupuestoTotal > 0) {
            if (abonado >= presupuestoTotal) {
              estadoPago = "pagado";
            } else if (abonado > 0) {
              estadoPago = "parcial";
            }
          }
            // estadoUI: para presupuestos siempre "activo"; para obras conservar su estado
            const estadoUI =
              o.tipo === "presupuesto" ? "activo" : o.estado || "";
            return {
              ...o,
              presupuestoTotal,
              estadoPago,
              fechaCreacion,
              estadoUI,
            };
          })
        );
        setObrasData(enriched);
      } catch (error) {
        console.error("Error al cargar datos:", error);
      } finally {
        if (showLoader) setLoading(false);
      }
  }, []);

  useEffect(() => {
    if (initialLoadDoneRef.current) return;
    initialLoadDoneRef.current = true;

    const syncPedidosAndFetch = async () => {
      await fetchData();

      try {
        const now = Date.now();
        const lastRunRaw =
          typeof window !== "undefined"
            ? window.localStorage.getItem(lastRepairKeyRef.current)
            : null;
        const lastRun = Number(lastRunRaw || 0);
        const shouldRunRepair = !lastRun || now - lastRun > 24 * 60 * 60 * 1000;
        if (!shouldRunRepair) return;

        if (typeof window !== "undefined") {
          window.localStorage.setItem(lastRepairKeyRef.current, String(now));
        }

        const summary = await repairObraPedidosByCreationDate();
        if (summary.updatedCount > 0) {
          const rangoCorregido =
            summary.firstUpdated && summary.lastUpdated
              ? ` (${summary.firstUpdated.numeroPedido} a ${summary.lastUpdated.numeroPedido})`
              : "";
          setDeleteMessage(
            `✅ Pedidos de obras normalizados: ${summary.updatedCount} registro(s) actualizado(s)${rangoCorregido}`
          );
          setTimeout(() => setDeleteMessage(""), 7000);
          await fetchData({ showLoader: false });
        }
      } catch (error) {
        console.error("Error al normalizar pedidos de obras:", error);
      }
    };
    syncPedidosAndFetch();
  }, [fetchData]);

  // Separar presupuestos y obras
  const presupuestosBase = obrasData.filter((o) => o.tipo === "presupuesto");
  const obrasBase = obrasData.filter((o) => o.tipo === "obra");

  // Aplicar filtros y búsqueda
  const presupuestos = useMemo(() => {
    let filtered = [...presupuestosBase];

    // Filtro por cliente
    if (filtros.cliente) {
      filtered = filtered.filter((p) => p.clienteId === filtros.cliente);
    }

    // Filtro por rango de fechas
    if (filtros.fechaDesde) {
      filtered = filtered.filter((p) => {
        const fechaCreacion = p.fechaCreacion || "";
        return fechaCreacion >= filtros.fechaDesde;
      });
    }
    if (filtros.fechaHasta) {
      filtered = filtered.filter((p) => {
        const fechaCreacion = p.fechaCreacion || "";
        return fechaCreacion <= filtros.fechaHasta + "T23:59:59";
      });
    }

    // Búsqueda global
    const searchQueries = [busquedaGlobalAplicada, busquedaPresupuestosAplicada]
      .map((q) => normalizeSearch(q))
      .filter(Boolean);

    if (searchQueries.length > 0) {
      filtered = filtered.filter((p) => {
        const haystack = buildSearchHaystack(p);
        return searchQueries.every((query) => haystack.includes(query));
      });
    }

    return filtered;
  }, [presupuestosBase, filtros, busquedaGlobalAplicada, busquedaPresupuestosAplicada]);

  const obras = useMemo(() => {
    let filtered = [...obrasBase];

    // Filtro por estado
    if (filtros.estado) {
      filtered = filtered.filter((o) => o.estado === filtros.estado);
    }

    // Filtro por cliente
    if (filtros.cliente) {
      filtered = filtered.filter((o) => o.clienteId === filtros.cliente);
    }

    // Filtro por estado de pago
    if (filtros.estadoPago) {
      filtered = filtered.filter((o) => o.estadoPago === filtros.estadoPago);
    }

    // Filtro por rango de fechas
    if (filtros.fechaDesde) {
      filtered = filtered.filter((o) => {
        const fechaCreacion = o.fechaCreacion || "";
        const fechaInicio = o.fechas?.inicio || "";
        return fechaCreacion >= filtros.fechaDesde || fechaInicio >= filtros.fechaDesde;
      });
    }
    if (filtros.fechaHasta) {
      filtered = filtered.filter((o) => {
        const fechaCreacion = o.fechaCreacion || "";
        const fechaFin = o.fechas?.fin || "";
        const hasta = filtros.fechaHasta + "T23:59:59";
        return fechaCreacion <= hasta || fechaFin <= filtros.fechaHasta;
      });
    }

    // Búsqueda global
    const searchQueries = [busquedaGlobalAplicada, busquedaObrasAplicada]
      .map((q) => normalizeSearch(q))
      .filter(Boolean);

    if (searchQueries.length > 0) {
      filtered = filtered.filter((o) => {
        const haystack = buildSearchHaystack(o);
        return searchQueries.every((query) => haystack.includes(query));
      });
    }

    return filtered;
  }, [obrasBase, filtros, busquedaGlobalAplicada, busquedaObrasAplicada]);

  // Filtrar obras que tienen fechas válidas para el calendario
  const obrasParaCalendario = useMemo(() => {
    return obras.filter((obra) => {
      if (!obra.fechas) return false;
      const fechaInicio = obra.fechas.inicio;
      const fechaFin = obra.fechas.fin;
      return fechaInicio && fechaFin;
    });
  }, [obras]);

  const presupuestosTabla = useMemo(() => {
    let filtered = [...presupuestos];
    const hayBusquedaPresupuestos = Boolean(
      normalizeSearch(busquedaGlobalAplicada) ||
      normalizeSearch(busquedaPresupuestosAplicada)
    );

    if (vistaPresupuestos === "activos") {
      filtered = filtered.filter((item) => item.estadoUI === "activo");
    }

    if (hayBusquedaPresupuestos) {
      return filtered;
    }

    return filtered.filter((item) =>
      matchesPeriodoLista(getListReferenceDate(item, "presupuesto"), periodoLista)
    );
  }, [presupuestos, vistaPresupuestos, periodoLista, busquedaGlobalAplicada, busquedaPresupuestosAplicada]);

  const obrasTabla = useMemo(
    () => {
      const hayBusquedaObras = Boolean(
        normalizeSearch(busquedaGlobalAplicada) ||
        normalizeSearch(busquedaObrasAplicada)
      );

      if (hayBusquedaObras) {
        return obras;
      }

      return obras.filter((item) =>
        matchesPeriodoLista(getListReferenceDate(item, "obra"), periodoLista)
      );
    },
    [obras, periodoLista, busquedaGlobalAplicada, busquedaObrasAplicada]
  );

  const filtrosAvanzadosActivos = useMemo(() => {
    let count = 0;
    if (filtros.cliente) count += 1;
    if (filtros.fechaDesde || filtros.fechaHasta) count += 1;
    if (listaActiva === "obras" && filtros.estado) count += 1;
    if (listaActiva === "obras" && filtros.estadoPago) count += 1;
    return count;
  }, [filtros, listaActiva]);

  const limpiarFiltrosTabla = () => {
    setFiltros({
      estado: "",
      cliente: "",
      estadoPago: "",
      fechaDesde: "",
      fechaHasta: "",
    });
  };

  const tabsTabla = [
    {
      value: "presupuestos",
      label: "Presupuestos",
      count: presupuestosTabla.length,
    },
    {
      value: "obras",
      label: "Obras",
      count: obrasTabla.length,
    },
  ];

  const toolbarLeft =
    listaActiva === "presupuestos" ? (
      <>
        <Select value="todos-presupuestos" onValueChange={() => {}}>
          <SelectTrigger className="h-10 w-[210px] rounded-xl border-border/60 bg-background">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos-presupuestos">Todos los presupuestos</SelectItem>
          </SelectContent>
        </Select>

        <Select value={vistaPresupuestos} onValueChange={setVistaPresupuestos}>
          <SelectTrigger className="h-10 w-[170px] rounded-xl border-border/60 bg-background">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Estado: Todos</SelectItem>
            <SelectItem value="activos">Estado: Activos</SelectItem>
          </SelectContent>
        </Select>

        <Select value={periodoLista} onValueChange={setPeriodoLista}>
          <SelectTrigger className="h-10 w-[200px] rounded-xl border-border/60 bg-background">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERIODOS_LISTA.map((periodo) => (
              <SelectItem key={periodo.value} value={periodo.value}>
                {periodo.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </>
    ) : (
      <>
        <Select value="todas-obras" onValueChange={() => {}}>
          <SelectTrigger className="h-10 w-[180px] rounded-xl border-border/60 bg-background">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas-obras">Todas las obras</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={filtros.estado || "todos"}
          onValueChange={(value) =>
            setFiltros((prev) => ({
              ...prev,
              estado: value === "todos" ? "" : value,
            }))
          }
        >
          <SelectTrigger className="h-10 w-[170px] rounded-xl border-border/60 bg-background">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Estado: Todos</SelectItem>
            <SelectItem value="pendiente_inicio">Pendiente de Inicio</SelectItem>
            <SelectItem value="en_ejecucion">En Ejecucion</SelectItem>
            <SelectItem value="pausada">Pausada</SelectItem>
            <SelectItem value="completada">Completada</SelectItem>
            <SelectItem value="cancelada">Cancelada</SelectItem>
          </SelectContent>
        </Select>

        <Select value={periodoLista} onValueChange={setPeriodoLista}>
          <SelectTrigger className="h-10 w-[200px] rounded-xl border-border/60 bg-background">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERIODOS_LISTA.map((periodo) => (
              <SelectItem key={periodo.value} value={periodo.value}>
                {periodo.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </>
    );

  const toolbarRightPresupuestos = (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        onClick={() => router.push(`/${lang}/obras/presupuesto/create`)}
        className="h-10 rounded-xl px-4"
      >
        <Plus className="mr-2 h-4 w-4" />
        Nuevo Presupuesto
      </Button>

      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="h-10 rounded-xl border-border/60 bg-background px-4"
          >
            <Icon icon="heroicons:adjustments-horizontal" className="mr-2 h-4 w-4" />
            Filtros
            {filtrosAvanzadosActivos > 0 ? (
              <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                {filtrosAvanzadosActivos}
              </span>
            ) : null}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-[320px] rounded-2xl border-border/60 p-4">
          <div className="space-y-4">
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Cliente
              </div>
              <Select
                value={filtros.cliente || "todos"}
                onValueChange={(value) =>
                  setFiltros((prev) => ({
                    ...prev,
                    cliente: value === "todos" ? "" : value,
                  }))
                }
              >
                <SelectTrigger className="h-10 rounded-xl border-border/60 bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos los clientes</SelectItem>
                  {clientes.map((cliente) => (
                    <SelectItem key={cliente.id} value={cliente.id}>
                      {cliente.nombre || "Sin nombre"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {listaActiva === "obras" ? (
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Estado de pago
                </div>
                <Select
                  value={filtros.estadoPago || "todos"}
                  onValueChange={(value) =>
                    setFiltros((prev) => ({
                      ...prev,
                      estadoPago: value === "todos" ? "" : value,
                    }))
                  }
                >
                  <SelectTrigger className="h-10 rounded-xl border-border/60 bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    <SelectItem value="pagado">Pagado</SelectItem>
                    <SelectItem value="parcial">Parcial</SelectItem>
                    <SelectItem value="pendiente">Pendiente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Desde
                </div>
                <DateInput
                  value={filtros.fechaDesde || ""}
                  onChange={(value) =>
                    setFiltros((prev) => ({
                      ...prev,
                      fechaDesde: value,
                    }))
                  }
                  buttonClassName="h-10 w-full justify-start rounded-xl border-border/60 bg-background"
                />
              </div>

              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Hasta
                </div>
                <DateInput
                  value={filtros.fechaHasta || ""}
                  min={filtros.fechaDesde || undefined}
                  onChange={(value) =>
                    setFiltros((prev) => ({
                      ...prev,
                      fechaHasta: value,
                    }))
                  }
                  buttonClassName="h-10 w-full justify-start rounded-xl border-border/60 bg-background"
                />
              </div>
            </div>

            <Button
              variant="ghost"
              className="w-full justify-center rounded-xl"
              onClick={limpiarFiltrosTabla}
            >
              Limpiar filtros avanzados
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );

  const toolbarRightObras = (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        onClick={() => router.push(`/${lang}/obras/create`)}
        className="h-10 rounded-xl px-4"
      >
        <Plus className="mr-2 h-4 w-4" />
        Nueva Obra
      </Button>

      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="h-10 rounded-xl border-border/60 bg-background px-4"
          >
            <Icon icon="heroicons:adjustments-horizontal" className="mr-2 h-4 w-4" />
            Filtros
            {filtrosAvanzadosActivos > 0 ? (
              <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                {filtrosAvanzadosActivos}
              </span>
            ) : null}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-[320px] rounded-2xl border-border/60 p-4">
          <div className="space-y-4">
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Cliente
              </div>
              <Select
                value={filtros.cliente || "todos"}
                onValueChange={(value) =>
                  setFiltros((prev) => ({
                    ...prev,
                    cliente: value === "todos" ? "" : value,
                  }))
                }
              >
                <SelectTrigger className="h-10 rounded-xl border-border/60 bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos los clientes</SelectItem>
                  {clientes.map((cliente) => (
                    <SelectItem key={cliente.id} value={cliente.id}>
                      {cliente.nombre || "Sin nombre"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {listaActiva === "obras" ? (
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Estado de pago
                </div>
                <Select
                  value={filtros.estadoPago || "todos"}
                  onValueChange={(value) =>
                    setFiltros((prev) => ({
                      ...prev,
                      estadoPago: value === "todos" ? "" : value,
                    }))
                  }
                >
                  <SelectTrigger className="h-10 rounded-xl border-border/60 bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    <SelectItem value="pagado">Pagado</SelectItem>
                    <SelectItem value="parcial">Parcial</SelectItem>
                    <SelectItem value="pendiente">Pendiente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Desde
                </div>
                <DateInput
                  value={filtros.fechaDesde || ""}
                  onChange={(value) =>
                    setFiltros((prev) => ({
                      ...prev,
                      fechaDesde: value,
                    }))
                  }
                  buttonClassName="h-10 w-full justify-start rounded-xl border-border/60 bg-background"
                />
              </div>

              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Hasta
                </div>
                <DateInput
                  value={filtros.fechaHasta || ""}
                  min={filtros.fechaDesde || undefined}
                  onChange={(value) =>
                    setFiltros((prev) => ({
                      ...prev,
                      fechaHasta: value,
                    }))
                  }
                  buttonClassName="h-10 w-full justify-start rounded-xl border-border/60 bg-background"
                />
              </div>
            </div>

            <Button
              variant="ghost"
              className="w-full justify-center rounded-xl"
              onClick={limpiarFiltrosTabla}
            >
              Limpiar filtros avanzados
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-gray-600">Cargando obras...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 py-8 mx-auto font-sans">
      {/* Mensaje de estado - Mejorado con animación */}
      {deleteMessage && (
        <div
          className={`mb-6 p-4 rounded-xl flex items-center gap-3 text-sm md:text-base font-medium shadow-lg border transition-all duration-500 animate-in slide-in-from-top-2 fade-in ${
            deleteMessage.startsWith("✅")
              ? "bg-gradient-to-r from-green-50 to-emerald-50 border-green-200 text-green-800 shadow-green-100"
              : deleteMessage.startsWith("⚠️")
              ? "bg-gradient-to-r from-yellow-50 to-amber-50 border-yellow-200 text-yellow-800 shadow-yellow-100"
              : "bg-gradient-to-r from-red-50 to-rose-50 border-red-200 text-red-800 shadow-red-100"
          }`}
        >
          {deleteMessage.startsWith("✅") ? (
            <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center animate-in zoom-in duration-300">
              <CheckCircle className="w-6 h-6 text-green-600" />
            </div>
          ) : deleteMessage.startsWith("⚠️") ? (
            <div className="w-10 h-10 bg-yellow-100 rounded-full flex items-center justify-center animate-in zoom-in duration-300">
              <AlertTriangle className="w-6 h-6 text-yellow-600" />
            </div>
          ) : (
            <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center animate-in zoom-in duration-300">
              <AlertCircle className="w-6 h-6 text-red-600" />
            </div>
          )}
          <span className="font-semibold flex-1">{deleteMessage}</span>
          <button
            onClick={() => setDeleteMessage("")}
            className="w-6 h-6 rounded-full hover:bg-white/50 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header Funcional */}
      <ObrasHeader
        vistaCalendario={vistaCalendario}
        onVistaCalendarioChange={setVistaCalendario}
        busquedaGlobal={busquedaGlobal}
        onBusquedaGlobalChange={setBusquedaGlobal}
        filtros={filtros}
        onFiltrosChange={setFiltros}
        clientes={clientes}
            disabled={deleting}
      />

      {/* Calendario Inteligente de Obras y Notas */}
      <CalendarioObras
        obras={obrasParaCalendario}
        notas={notas}
        vista={vistaCalendario}
        fechaInicio={fechaInicioCalendario}
        onFechaInicioChange={handleFechaInicioChange}
        onObraClick={(obra) => {
          setObraSeleccionada(obra);
          setShowObraPanel(true);
        }}
        onObraDelete={(obraId) => {
          setObrasData((prev) => prev.filter((o) => o.id !== obraId));
          setShowObraPanel(false);
          setObraSeleccionada(null);
        }}
        onNotaClick={(nota) => {
          openEditDialog(nota);
        }}
        onAgregarNota={(dateKey) => {
          setSelectedDate(dateKey);
          setEditingNotaId(null);
          setEditingNotaGroupId(null);
          setNotaForm({
            empleadoId: "",
            empleadoNombre: "",
            barrioLote: "",
            numObra: "",
            telefono: "",
            detalle: "",
            fechaDesde: dateKey,
            fechaHasta: dateKey,
          });
          setShowNotaDialog(true);
        }}
        loadingNotas={loadingNotas}
        deletingNota={deletingNota}
        onEditNota={openEditDialog}
        onDeleteNota={confirmDeleteNota}
      />

      <div className="grid grid-cols-1 gap-4 px-2 xl:grid-cols-2">
        <ObrasListTable
          tabs={[]}
          activeTab="presupuestos"
          data={presupuestosTabla}
          columns={presupuestosColumns}
          title="Presupuestos"
          searchValue={busquedaPresupuestos}
          onSearchChange={setBusquedaPresupuestos}
          searchPlaceholder="Buscar cliente, teléfono o documento..."
          toolbarRight={toolbarRightPresupuestos}
          loading={loadingBusquedaPresupuestos}
          defaultSorting={[{ id: "numeroPedido", desc: true }]}
          onRowClick={(item) => router.push(`/${lang}/obras/presupuesto/${item.id}`)}
        />
        <ObrasListTable
          tabs={[]}
          activeTab="obras"
          data={obrasTabla}
          columns={obrasColumns}
          title="Obras"
          searchValue={busquedaObras}
          onSearchChange={setBusquedaObras}
          searchPlaceholder="Buscar cliente, teléfono o documento..."
          toolbarRight={toolbarRightObras}
          loading={loadingBusquedaObras}
          defaultSorting={[{ id: "numeroPedido", desc: true }]}
          onRowClick={(item) => router.push(`/${lang}/obras/${item.id}`)}
        />
      </div>

      {/* Diálogo de confirmación de eliminación mejorado */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="w-[95vw] max-w-md rounded-2xl border-0 shadow-2xl bg-white">
          <DialogHeader className="text-center pb-4">
            <div className="w-16 h-16 bg-gradient-to-br from-red-100 to-rose-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-8 h-8 text-red-600" />
            </div>
            <DialogTitle className="text-xl font-bold text-gray-900">
              Confirmar Eliminación
            </DialogTitle>
            <DialogDescription className="text-gray-600 mt-2">
              ¿Estás seguro de que quieres eliminar este{" "}
              {deleteType === "obra" ? "obra" : "presupuesto"}?
            </DialogDescription>
          </DialogHeader>

          <div className="bg-gradient-to-r from-red-50 to-rose-50 rounded-xl p-4 mb-6 border border-red-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                <Info className="w-5 h-5 text-red-600" />
              </div>
              <div className="flex-1">
                <div className="font-semibold text-red-800">
                  {itemToDelete?.name || "Elemento"}
                </div>
                <div className="text-sm text-red-700">
                  {deleteType === "obra"
                    ? "Esta acción eliminará la obra permanentemente."
                    : "Esta acción eliminará el presupuesto permanentemente."}
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="flex flex-col sm:flex-row gap-3 pt-4">
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
              className="w-full sm:w-auto px-6 py-3 rounded-xl border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition-all duration-200 font-medium"
              disabled={deleting}
            >
              <X className="w-4 h-4 mr-2" />
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              className="w-full sm:w-auto px-6 py-3 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 shadow-lg hover:shadow-xl transition-all duration-200 font-medium transform hover:scale-105"
              disabled={deleting}
            >
              {deleting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Eliminando...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-1" />
                  Eliminar
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo para agregar/editar nota */}
      <Dialog open={showNotaDialog} onOpenChange={(open) => {
        setShowNotaDialog(open);
        if (!open) {
          setEditingNotaId(null);
          setEditingNotaGroupId(null);
          setNotaForm({
            empleadoId: "",
            empleadoNombre: "",
            barrioLote: "",
            numObra: "",
            telefono: "",
            detalle: "",
            fechaDesde: "",
            fechaHasta: "",
          });
        }
      }}>
        <DialogContent className="w-[95vw] max-w-lg rounded-2xl border-0 shadow-2xl bg-white">
          <DialogHeader className="pb-4">
            <div className={`w-16 h-16 bg-gradient-to-br ${editingNotaId ? 'from-amber-100 to-orange-100' : 'from-blue-100 to-indigo-100'} rounded-full flex items-center justify-center mx-auto mb-4`}>
              <Icon icon={editingNotaId ? "heroicons:pencil" : "heroicons:pencil-square"} className={`w-8 h-8 ${editingNotaId ? 'text-amber-600' : 'text-blue-600'}`} />
            </div>
            <DialogTitle className="text-xl font-bold text-gray-900 text-center">
              {editingNotaId ? "Editar Nota de Obra" : "Nueva Nota de Obra"}
            </DialogTitle>
            <DialogDescription className="text-gray-600 mt-2 text-center">
              {editingNotaId 
                ? "Modifica los detalles de tu nota"
                : "Agrega una nota rápida para recordar entregas o trabajos pendientes"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">
                ¿Quién va a hacer la obra? <span className="text-red-500">*</span>
              </label>
              <select
                value={notaForm.empleadoId}
                onChange={(e) => {
                  const id = e.target.value;
                  const emp = empleados.find((x) => x.id === id);
                  const empleadoNombre = formatNombreEmpleado(emp?.nombre || "");
                  setNotaForm((prev) => ({
                    ...prev,
                    empleadoId: id,
                    empleadoNombre,
                  }));
                }}
                className="w-full h-10 px-3 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Seleccionar empleado</option>
                {empleados.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {formatNombreEmpleado(emp.nombre)}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">
                  Barrio y Lote
                </label>
                <Input
                  placeholder="Ej: Barrio Norte - Lote 12"
                  value={notaForm.barrioLote}
                  onChange={(e) => setNotaForm({ ...notaForm, barrioLote: e.target.value })}
                  className="w-full"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">
                  N° Obra
                </label>
                <Input
                  placeholder="Ej: 1023"
                  value={notaForm.numObra}
                  onChange={(e) => setNotaForm({ ...notaForm, numObra: e.target.value })}
                  className="w-full"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">
                  N° Teléfono
                </label>
                <Input
                  placeholder="Ej: 3794..."
                  value={notaForm.telefono}
                  onChange={(e) => setNotaForm({ ...notaForm, telefono: e.target.value })}
                  className="w-full"
                />
              </div>
              <div className="hidden sm:block" />
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">
                Detalle <span className="text-red-500">*</span>
              </label>
              <textarea
                placeholder="Ej: Entregar materiales / medir / avanzar con estructura..."
                value={notaForm.detalle}
                onChange={(e) => setNotaForm({ ...notaForm, detalle: e.target.value })}
                className="w-full min-h-[100px] px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">
                  Fecha desde <span className="text-red-500">*</span>
                </label>
                <DateInput
                  value={notaForm.fechaDesde}
                  onChange={(v) => {
                    setNotaForm((prev) => ({
                      ...prev,
                      fechaDesde: v,
                      fechaHasta: String(prev.fechaHasta || "") < String(v) ? v : prev.fechaHasta,
                    }));
                  }}
                  buttonClassName="w-full h-10 px-3 border-gray-300 rounded-lg bg-white"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">
                  Fecha hasta <span className="text-red-500">*</span>
                </label>
                <DateInput
                  value={notaForm.fechaHasta}
                  min={notaForm.fechaDesde || undefined}
                  onChange={(v) => setNotaForm({ ...notaForm, fechaHasta: v })}
                  buttonClassName="w-full h-10 px-3 border-gray-300 rounded-lg bg-white"
                />
              </div>
              <div className="sm:col-span-2 text-xs text-gray-500">
                Se duplica la nota en cada día del rango.
              </div>
            </div>
          </div>

          <DialogFooter className="flex flex-col sm:flex-row gap-3 pt-4">
            <Button
              variant="outline"
              onClick={() => {
                setShowNotaDialog(false);
                setEditingNotaId(null);
                setEditingNotaGroupId(null);
                setNotaForm({
                  empleadoId: "",
                  empleadoNombre: "",
                  barrioLote: "",
                  numObra: "",
                  telefono: "",
                  detalle: "",
                  fechaDesde: "",
                  fechaHasta: "",
                });
              }}
              className="w-full sm:w-auto px-6 py-3 rounded-xl border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition-all duration-200 font-medium cursor-pointer"
              disabled={savingNota}
            >
              <X className="w-4 h-4 mr-2" />
              Cancelar
            </Button>
            <Button
              onClick={saveNota}
              disabled={savingNota}
              className={`w-full sm:w-auto px-6 py-3 rounded-xl ${
                editingNotaId
                  ? 'bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700'
                  : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700'
              } shadow-lg hover:shadow-xl transition-all duration-200 font-medium transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none`}
            >
              {savingNota ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {editingNotaId ? "Actualizando..." : "Guardando..."}
                </>
              ) : (
                <>
                  <Icon icon="heroicons:check" className="w-4 h-4 mr-2" />
                  {editingNotaId ? "Actualizar Nota" : "Guardar Nota"}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo de confirmación para eliminar nota */}
      <Dialog open={showDeleteNotaDialog} onOpenChange={setShowDeleteNotaDialog}>
        <DialogContent className="w-[95vw] max-w-sm rounded-2xl border-0 shadow-2xl bg-white">
          <DialogHeader className="text-center pb-4">
            <div className="w-16 h-16 bg-gradient-to-br from-red-100 to-rose-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-8 h-8 text-red-600" />
            </div>
            <DialogTitle className="text-lg font-bold text-gray-900">
              ¿Eliminar esta nota?
            </DialogTitle>
            <DialogDescription className="text-gray-600 mt-2">
              Esta acción no se puede deshacer
            </DialogDescription>
          </DialogHeader>

          {notaToDelete && (
            <div className="bg-gradient-to-r from-yellow-50 to-amber-50 rounded-xl p-3 mb-4 border border-yellow-200">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-yellow-100 rounded-full flex items-center justify-center">
                  <Icon icon="heroicons:document-text" className="w-4 h-4 text-yellow-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-gray-800 text-sm truncate">
                    {notaToDelete.numObra || notaToDelete.nombreObra || notaToDelete.barrioLote || "Nota"}
                  </div>
                  {(notaToDelete.detalle || notaToDelete.productos) && (
                    <div className="text-xs text-gray-600 truncate">
                      {notaToDelete.detalle || notaToDelete.productos}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="flex flex-col sm:flex-row gap-3">
            <Button
              variant="outline"
              onClick={() => {
                setShowDeleteNotaDialog(false);
                setNotaToDelete(null);
              }}
              className="w-full sm:w-auto px-4 py-2 rounded-lg border-gray-300 text-gray-700 hover:bg-gray-50 transition-all duration-200 cursor-pointer"
              disabled={deletingNota}
            >
              <X className="w-4 h-4 mr-2" />
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={deleteNota}
              disabled={deletingNota}
              className="w-full sm:w-auto px-4 py-2 rounded-lg bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 shadow-lg hover:shadow-xl transition-all duration-200 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {deletingNota ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Eliminando...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Eliminar
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Panel Lateral de Obra */}
      <ObraSidePanel
        obra={obraSeleccionada}
        open={showObraPanel}
        onClose={() => {
          setShowObraPanel(false);
          setObraSeleccionada(null);
        }}
        onVerDetalle={() => {
          if (obraSeleccionada) {
            router.push(`/${lang}/obras/${obraSeleccionada.id}`);
          }
        }}
        onObraUpdate={(obraActualizada) => {
          // Actualizar la obra en el estado local
          setObrasData((prev) =>
            prev.map((o) => (o.id === obraActualizada.id ? obraActualizada : o))
          );
          // Actualizar la obra seleccionada
          setObraSeleccionada(obraActualizada);
        }}
        onObraDelete={(obraId) => {
          setObrasData((prev) => prev.filter((o) => o.id !== obraId));
          setShowObraPanel(false);
          setObraSeleccionada(null);
        }}
        user={user}
        lang={lang}
      />

      {/* Wizard de Conversión Presupuesto → Obra */}
      <WizardConversion
        presupuesto={presupuestoParaConvertir}
        open={showWizardConversion}
        onClose={() => {
          setShowWizardConversion(false);
          setPresupuestoParaConvertir(null);
        }}
        user={user}
        lang={lang}
        onSuccess={(obraId, nuevaObra) => {
          // Mostrar mensaje de éxito
          setDeleteMessage(`✅ Obra ${nuevaObra.numeroPedido} creada exitosamente`);
          setTimeout(() => setDeleteMessage(""), 5000);
          
          // Recargar datos para que aparezca la nueva obra
          fetchData();
        }}
      />
    </div>
  );
};

export default ObrasPage;
