"use client";
import React, { useCallback, useEffect, useState, useMemo, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
} from "lucide-react";
import { useRouter, useParams } from "next/navigation";
import { Icon } from "@iconify/react";
import { DataTableEnhanced } from "@/components/ui/data-table-enhanced";
import { useAuth } from "@/provider/auth.provider";
import ObrasHeader from "@/components/obras/ObrasHeader";
import CalendarioObras from "@/components/obras/CalendarioObras";
import ObraSidePanel from "@/components/obras/ObraSidePanel";
import WizardConversion from "@/components/obras/WizardConversion";

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
    return vistaCalendario === "semana" ? currentWeekStart : currentMonthStart;
  }, [vistaCalendario, currentWeekStart, currentMonthStart]);
  
  // Handler para cambiar fecha de inicio del calendario
  const handleFechaInicioChange = (nuevaFecha) => {
    if (vistaCalendario === "semana") {
      setCurrentWeekStart(nuevaFecha);
    } else {
      setCurrentMonthStart(nuevaFecha);
    }
  };
  
  // Filtrar obras que tienen fechas válidas para el calendario
  const obrasParaCalendario = useMemo(() => {
    return obras.filter((obra) => {
      if (!obra.fechas) return false;
      const fechaInicio = obra.fechas.inicio;
      const fechaFin = obra.fechas.fin;
      return fechaInicio && fechaFin;
    });
  }, [obras]);
  const [notas, setNotas] = useState([]);
  const [showNotaDialog, setShowNotaDialog] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [editingNotaId, setEditingNotaId] = useState(null);
  const [notaForm, setNotaForm] = useState({
    nombreObra: "",
    productos: "",
    fecha: "",
  });
  const [savingNota, setSavingNota] = useState(false);
  const [deletingNota, setDeletingNota] = useState(null);
  const [showDeleteNotaDialog, setShowDeleteNotaDialog] = useState(false);
  const [notaToDelete, setNotaToDelete] = useState(null);
  const [loadingNotas, setLoadingNotas] = useState(true);
  
  // Estados para el nuevo header
  const [vistaCalendario, setVistaCalendario] = useState("semana");
  const [busquedaGlobal, setBusquedaGlobal] = useState("");
  const [filtros, setFiltros] = useState({
    estado: "",
    cliente: "",
    estadoPago: "",
    fechaDesde: "",
    fechaHasta: "",
  });
  const [clientes, setClientes] = useState([]);
  
  const router = useRouter();
  const params = useParams();
  const { lang } = params || {};
  const { user } = useAuth();

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

  // Guardar o actualizar nota
  const saveNota = async () => {
    if (!notaForm.nombreObra || !notaForm.fecha || !user) {
      setDeleteMessage("⚠️ Por favor completa todos los campos obligatorios");
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
            ...notaForm,
            userId: user.uid,
          }),
        });

        if (!response.ok) throw new Error("Error al actualizar nota");

        const result = await response.json();
        
        // Actualizar el estado local con animación
        setNotas(
          notas.map((nota) =>
            nota.id === editingNotaId
              ? { ...nota, ...notaForm, updatedAt: result.nota.updatedAt }
              : nota
          )
        );
        
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

        const result = await response.json();
        
        // Agregar al estado local con animación
        setNotas([...notas, { id: result.id, ...notaForm }]);
        
        setDeleteMessage("✅ Nota creada exitosamente");
      }

      setShowNotaDialog(false);
      setNotaForm({ nombreObra: "", productos: "", fecha: "" });
      setEditingNotaId(null);
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
    setNotaForm({
      nombreObra: nota.nombreObra,
      productos: nota.productos || "",
      fecha: nota.fecha,
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
          userId: user.uid,
        }),
      });

      if (!response.ok) throw new Error("Error al eliminar nota");

      // Actualizar estado local con animación
      setNotas(notas.filter((n) => n.id !== notaToDelete.id));
      
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
              {cliente?.cuit || "Sin CUIT"}
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: "fechaCreacion",
      header: ({ column }) => (
        <div
          className="flex items-center gap-2 cursor-pointer select-none"
          onClick={() => column.toggleSorting()}
        >
          <span>Fecha</span>
          <div className="flex flex-col">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
              <path d="M7 14l5-5 5 5z" />
            </svg>
            <svg
              className="w-3 h-3 -mt-1"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M7 10l5 5 5-5z" />
            </svg>
          </div>
        </div>
      ),
      enableSorting: true,
      cell: ({ row }) => {
        const fechaCreacion = row.getValue("fechaCreacion");
        if (!fechaCreacion)
          return <span className="text-gray-400">Sin fecha</span>;

        try {
          const fecha = new Date(fechaCreacion);

          return (
            <div className="text-gray-600">
              <div className="font-medium">
                {fecha.toLocaleDateString("es-AR", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                  timeZone: "America/Argentina/Buenos_Aires",
                })}
              </div>
              <div className="text-xs text-gray-500">
                {fecha.toLocaleTimeString("es-AR", {
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                  timeZone: "America/Argentina/Buenos_Aires",
                })}{" "}
                hs
              </div>
            </div>
          );
        } catch (error) {
          return <span className="text-gray-400">Fecha inválida</span>;
        }
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
      id: "actions",
      header: "Acciones",
      cell: ({ row }) => {
        return (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="default"
              className="h-8 px-3 bg-blue-600 hover:bg-blue-700 text-white transition-all duration-200"
              title="Convertir a Obra"
              onClick={(e) => {
                e.stopPropagation();
                setPresupuestoParaConvertir(row.original);
                setShowWizardConversion(true);
              }}
            >
              <Icon icon="heroicons:arrow-right-circle" className="w-4 h-4 mr-1" />
              Convertir
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 px-3 bg-gray-50 border-gray-300 text-gray-700 hover:bg-gray-100 hover:border-gray-400 transition-all duration-200"
              title="Editar"
              onClick={(e) => {
                e.stopPropagation();
                router.push(`/${lang}/obras/presupuesto/${row.original.id}`);
              }}
            >
              <Icon icon="heroicons:pencil" className="w-4 h-4 mr-1" />
              Editar
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 px-3 bg-red-50 border-red-200 text-red-700 hover:bg-red-100 hover:border-red-300 transition-all duration-200"
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
              <Trash2 className="w-4 h-4 mr-1" />
              Eliminar
            </Button>
          </div>
        );
      },
      enableSorting: false,
    },
  ], [lang, router]);

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
          const nombreNota = (n.nombreObra || "").toLowerCase();
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
              {cliente?.cuit || "Sin CUIT"}
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: "fechaCreacion",
      header: ({ column }) => (
        <div
          className="flex items-center gap-2 cursor-pointer select-none"
          onClick={() => column.toggleSorting()}
        >
          <span>Fecha</span>
          <div className="flex flex-col">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
              <path d="M7 14l5-5 5 5z" />
            </svg>
            <svg
              className="w-3 h-3 -mt-1"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M7 10l5 5 5-5z" />
            </svg>
          </div>
        </div>
      ),
      enableSorting: true,
      cell: ({ row }) => {
        const fechaCreacion = row.getValue("fechaCreacion");
        if (!fechaCreacion)
          return <span className="text-gray-400">Sin fecha</span>;

        try {
          const fecha = new Date(fechaCreacion);

          return (
            <div className="text-gray-600">
              <div className="font-medium">
                {fecha.toLocaleDateString("es-AR", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                  timeZone: "America/Argentina/Buenos_Aires",
                })}
              </div>
              <div className="text-xs text-gray-500">
                {fecha.toLocaleTimeString("es-AR", {
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                  timeZone: "America/Argentina/Buenos_Aires",
                })}{" "}
                hs
              </div>
            </div>
          );
        } catch (error) {
          return <span className="text-gray-400">Fecha inválida</span>;
        }
      },
    },
    {
      accessorKey: "estado",
      header: "Estado",
      cell: ({ row }) => {
        const estado = row.getValue("estado");
        const estadoInfo = estadosObra[estado] || {
          label: estado,
          color: "bg-gray-100 text-gray-800 border-gray-200",
          icon: Clock,
        };
        const IconCmp = estadoInfo.icon || Clock;

        // Colores para los iconos según el estado
        const iconColors = {
          pendiente_inicio: "text-yellow-600",
          en_ejecucion: "text-blue-600",
          pausada: "text-orange-600",
          completada: "text-green-600",
          cancelada: "text-red-600",
        };

        return (
          <div
            className="flex items-center justify-center"
            title={estadoInfo.label}
          >
            <IconCmp
              className={`w-5 h-5 ${iconColors[estado] || "text-gray-600"}`}
            />
          </div>
        );
      },
    },
    {
      accessorKey: "presupuestoTotal",
      header: "Total",
      cell: ({ row }) => {
        const total = row.getValue("presupuestoTotal");
        return (
          <div className="font-medium">
            $
            {total
              ? Number(total).toLocaleString("es-AR", {
                  minimumFractionDigits: 2,
                })
              : "0.00"}
          </div>
        );
      },
    },
    {
      id: "pago",
      header: "Pago",
      cell: ({ row }) => {
        const cobranzas = row.original.cobranzas || {};
        const senia = Number(cobranzas.senia) || 0;
        const monto = Number(cobranzas.monto) || 0;
        const historialPagos = cobranzas.historialPagos || [];
        const totalHistorial = historialPagos.reduce(
          (sum, pago) => sum + (Number(pago.monto) || 0),
          0
        );
        const totalAbonado = senia + monto + totalHistorial;
        const presupuestoTotal = row.original.presupuestoTotal || 0;

        // Determinar estado del pago
        let estadoPago = "pendiente";
        let icono = Clock;
        let color = "text-yellow-600";
        let titulo = "Pendiente de pago";

        if (totalAbonado >= presupuestoTotal && presupuestoTotal > 0) {
          estadoPago = "pagado";
          icono = CheckCircle;
          color = "text-green-600";
          titulo = "Pagado completamente";
        } else if (totalAbonado > 0) {
          estadoPago = "parcial";
          icono = AlertCircle;
          color = "text-orange-600";
          titulo = "Pago parcial";
        }

        const IconComponent = icono;
        return (
          <div className="flex items-center justify-center" title={titulo}>
            <IconComponent className={`w-5 h-5 ${color}`} />
          </div>
        );
      },
    },
    {
      id: "debe",
      header: "DEBE",
      cell: ({ row }) => {
        const cobranzas = row.original.cobranzas || {};
        const senia = Number(cobranzas.senia) || 0;
        const monto = Number(cobranzas.monto) || 0;
        const historialPagos = cobranzas.historialPagos || [];
        const totalHistorial = historialPagos.reduce(
          (sum, pago) => sum + (Number(pago.monto) || 0),
          0
        );
        const totalAbonado = senia + monto + totalHistorial;
        const presupuestoTotal = row.original.presupuestoTotal || 0;
        const debe = presupuestoTotal - totalAbonado;

        return (
          <div className="font-medium">
            $
            {debe > 0
              ? debe.toLocaleString("es-AR", { minimumFractionDigits: 2 })
              : "0.00"}
          </div>
        );
      },
    },
    {
      id: "actions",
      header: "Acciones",
      cell: ({ row }) => {
        const obra = row.original;
        const estaImprimiendo = imprimiendoObraId === obra.id;
        
        return (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="default"
              className="h-8 px-3 bg-blue-600 hover:bg-blue-700 text-white transition-all duration-200"
              title="Ver panel"
              onClick={(e) => {
                e.stopPropagation();
                setObraSeleccionada(obra);
                setShowObraPanel(true);
              }}
            >
              <Eye className="w-4 h-4 mr-1" />
              Ver panel
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 px-3 bg-gray-50 border-gray-300 text-gray-700 hover:bg-gray-100 hover:border-gray-400 transition-all duration-200"
              title="Imprimir / Exportar PDF"
              onClick={(e) => {
                e.stopPropagation();
                handleImprimirObra(obra);
              }}
              disabled={estaImprimiendo}
            >
              {estaImprimiendo ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <Printer className="w-4 h-4 mr-1" />
              )}
              Imprimir
            </Button>
          </div>
        );
      },
      enableSorting: false,
    },
  ], [notas, imprimiendoObraId]);

  // Función para mostrar el diálogo de confirmación
  const showDeleteConfirmation = (id, type, itemName) => {
    setItemToDelete({ id, name: itemName });
    setDeleteType(type);
    setShowDeleteDialog(true);
  };

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
  }, [obrasData]);

  // Función para cargar datos (reutilizable)
  const fetchData = useCallback(async () => {
      try {
        setLoading(true);
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
        setLoading(false);
      }
  }, []);

  useEffect(() => {
    fetchData();
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
    if (busquedaGlobal) {
      const searchLower = busquedaGlobal.toLowerCase();
      filtered = filtered.filter((p) => {
        const numeroPedido = (p.numeroPedido || "").toLowerCase();
        const clienteNombre = (p.cliente?.nombre || "").toLowerCase();
        const clienteCuit = (p.cliente?.cuit || "").toLowerCase();
        const clienteDireccion = (p.cliente?.direccion || "").toLowerCase();
        return (
          numeroPedido.includes(searchLower) ||
          clienteNombre.includes(searchLower) ||
          clienteCuit.includes(searchLower) ||
          clienteDireccion.includes(searchLower)
        );
      });
    }

    return filtered;
  }, [presupuestosBase, filtros, busquedaGlobal]);

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
    if (busquedaGlobal) {
      const searchLower = busquedaGlobal.toLowerCase();
      filtered = filtered.filter((o) => {
        const numeroPedido = (o.numeroPedido || "").toLowerCase();
        const clienteNombre = (o.cliente?.nombre || "").toLowerCase();
        const clienteCuit = (o.cliente?.cuit || "").toLowerCase();
        const clienteDireccion = (o.cliente?.direccion || "").toLowerCase();
        const ubicacionDireccion = (o.ubicacion?.direccion || "").toLowerCase();
        return (
          numeroPedido.includes(searchLower) ||
          clienteNombre.includes(searchLower) ||
          clienteCuit.includes(searchLower) ||
          clienteDireccion.includes(searchLower) ||
          ubicacionDireccion.includes(searchLower)
        );
      });
    }

    return filtered;
  }, [obrasBase, filtros, busquedaGlobal]);

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
        onNuevaObra={() => {
          // Por ahora navega a la página de creación, en etapa 4 abriremos el wizard
          router.push(`/${lang}/obras/create`);
        }}
        onNuevoPresupuesto={() => {
          router.push(`/${lang}/obras/presupuesto/create`);
        }}
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
        onNotaClick={(nota) => {
          openEditDialog(nota);
        }}
        onAgregarNota={(dateKey) => {
          setSelectedDate(dateKey);
                      setEditingNotaId(null);
                      setNotaForm({
                        nombreObra: "",
                        productos: "",
            fecha: dateKey,
                      });
                      setShowNotaDialog(true);
                    }}
        loadingNotas={loadingNotas}
        deletingNota={deletingNota}
        onEditNota={openEditDialog}
        onDeleteNota={confirmDeleteNota}
      />

      {/* Tablas mejoradas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 px-2">
        {/* Tabla de Presupuestos - IZQUIERDA */}
        <Card className="rounded-2xl shadow-2xl border-0 bg-gradient-to-br from-white to-gray-50/50 overflow-hidden">
          <CardHeader className="pb-4 border-b border-gray-100 bg-gradient-to-r from-purple-50 to-indigo-50 rounded-t-2xl">
            <CardTitle className="text-2xl font-bold text-gray-900 flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg">
                <Icon
                  icon="heroicons:document-text"
                  className="w-7 h-7 text-white"
                />
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-900">
                  Presupuestos
                </div>
                <div className="text-sm font-medium text-gray-600">
                  Gestión de cotizaciones
                </div>
              </div>
              {deleting && (
                <div className="flex items-center gap-2 ml-auto">
                  <div className="w-6 h-6 bg-purple-100 rounded-full flex items-center justify-center">
                    <Loader2 className="w-4 h-4 animate-spin text-purple-600" />
                  </div>
                  <span className="text-sm font-medium text-purple-600">
                    Procesando...
                  </span>
                </div>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6 p-0">
            <div className="overflow-hidden rounded-b-2xl">
              <DataTableEnhanced
                data={presupuestos}
                columns={presupuestosColumns}
                searchPlaceholder="Buscar presupuestos..."
                className="border-0"
                defaultSorting={[{ id: "numeroPedido", desc: true }]}
                onRowClick={(presupuesto) => {
                  router.push(`/${lang}/obras/presupuesto/${presupuesto.id}`);
                }}
                compact={true}
              />
            </div>
          </CardContent>
        </Card>

        {/* Tabla de Obras - DERECHA */}
        <Card className="rounded-2xl shadow-2xl border-0 bg-gradient-to-br from-white to-blue-50/50 overflow-hidden">
          <CardHeader className="pb-4 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-teal-50 rounded-t-2xl">
            <CardTitle className="text-2xl font-bold text-gray-900 flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-teal-600 rounded-xl flex items-center justify-center shadow-lg">
                <Icon
                  icon="heroicons:building-office"
                  className="w-7 h-7 text-white"
                />
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-900">Obras</div>
                <div className="text-sm font-medium text-gray-600">
                  Proyectos en ejecución
                </div>
              </div>
              {deleting && (
                <div className="flex items-center gap-2 ml-auto">
                  <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center">
                    <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                  </div>
                  <span className="text-sm font-medium text-blue-600">
                    Procesando...
                  </span>
                </div>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6 p-0">
            <div className="overflow-hidden rounded-b-2xl">
              <DataTableEnhanced
                data={obras}
                columns={obrasColumns}
                searchPlaceholder="Buscar obras..."
                className="border-0"
                defaultSorting={[{ id: "numeroPedido", desc: true }]}
                onRowClick={(obra) => {
                  router.push(`/${lang}/obras/${obra.id}`);
                }}
                compact={true}
              />
            </div>
          </CardContent>
        </Card>
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
          setNotaForm({ nombreObra: "", productos: "", fecha: "" });
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
                Nombre de Obra <span className="text-red-500">*</span>
              </label>
              <Input
                placeholder="Ej: Casa Rodriguez"
                value={notaForm.nombreObra}
                onChange={(e) =>
                  setNotaForm({ ...notaForm, nombreObra: e.target.value })
                }
                className="w-full"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">
                Productos / Detalles
              </label>
              <textarea
                placeholder="Ej: 10 tablas de pino, 5kg de clavos..."
                value={notaForm.productos}
                onChange={(e) =>
                  setNotaForm({ ...notaForm, productos: e.target.value })
                }
                className="w-full min-h-[100px] px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">
                Fecha <span className="text-red-500">*</span>
              </label>
              <Input
                type="date"
                value={notaForm.fecha}
                onChange={(e) =>
                  setNotaForm({ ...notaForm, fecha: e.target.value })
                }
                className="w-full"
              />
            </div>
          </div>

          <DialogFooter className="flex flex-col sm:flex-row gap-3 pt-4">
            <Button
              variant="outline"
              onClick={() => {
                setShowNotaDialog(false);
                setEditingNotaId(null);
                setNotaForm({ nombreObra: "", productos: "", fecha: "" });
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
                    {notaToDelete.nombreObra}
                  </div>
                  {notaToDelete.productos && (
                    <div className="text-xs text-gray-600 truncate">
                      {notaToDelete.productos}
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
