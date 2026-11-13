"use client";
import React, { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DataTable } from "../(invoice)/invoice-list/invoice-list-table/components/data-table";
import { db } from "@/lib/firebase";
import { collection, getDocs, doc, updateDoc } from "firebase/firestore";
import { useAuth } from "@/provider/auth.provider";
import { Clock, CheckCircle, AlertCircle, Search, RefreshCw, Download, Printer, User, Loader2 } from "lucide-react";

// Estados de envío con colores y descripciones
const estadosEnvio = {
  pendiente: { 
    label: "Pendiente", 
    color: "bg-yellow-500/10 text-yellow-800 dark:text-yellow-300 border-yellow-500/20",
    icon: Clock,
    description: "Envío creado, pendiente de entrega"
  },
  entregado: { 
    label: "Entregado", 
    color: "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border-emerald-500/20",
    icon: CheckCircle,
    description: "Envío entregado exitosamente"
  },
  cancelado: { 
    label: "Cancelado", 
    color: "bg-red-500/10 text-red-800 dark:text-red-300 border-red-500/20",
    icon: AlertCircle,
    description: "Envío cancelado"
  },
};

const formatearMonedaEnvio = (value) => {
  const amount = Math.round((Number(value) || 0) * 100) / 100;
  return amount.toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  });
};

// Componente para ver detalles del envío
function DetalleEnvio({ envio, onClose }) {
  const { user } = useAuth();
  const [downloadingPDF, setDownloadingPDF] = useState(false);
  const [downloadingPDFEmpleado, setDownloadingPDFEmpleado] = useState(false);
  const [printingPDF, setPrintingPDF] = useState(false);
  const [printingPDFEmpleado, setPrintingPDFEmpleado] = useState(false);
  const printingRef = useRef(false);
  const printingEmpleadoRef = useRef(false);

  // Inicializar singleton global usando useEffect para evitar problemas con las reglas de hooks
  // DEBE estar antes de cualquier return temprano
  useEffect(() => {
    if (typeof window !== 'undefined' && !window.__printLock) {
      window.__printLock = { active: false, iframe: null, lastPrintTime: 0 };
    }
  }, []);

  // Función para imprimir PDF - Solución simple y básica
  // DEBE estar antes de cualquier return temprano (es un hook useCallback)
  const handlePrintPDF = useCallback(async (paraEmpleado = false, event = null) => {
    // Prevenir propagación del evento
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    
    if (!envio?.ventaId) {
      alert("Este envío no está asociado a una venta");
      return;
    }
    
    // Verificar si ya hay una impresión en proceso
    const currentRef = paraEmpleado ? printingEmpleadoRef : printingRef;
    if (currentRef.current) return;
    
    // Activar flag INMEDIATAMENTE
    currentRef.current = true;
    if (paraEmpleado) {
      setPrintingPDFEmpleado(true);
    } else {
      setPrintingPDF(true);
    }
    
    try {
      // Obtener HTML
      const res = await fetch("/api/pdf/remito-html", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${await user.getIdToken()}`,
        },
        body: JSON.stringify({
          type: "venta",
          id: envio.ventaId,
          empleado: paraEmpleado,
        }),
      });
      
      if (!res.ok) {
        alert("Error al generar el remito. Por favor, intenta nuevamente.");
        currentRef.current = false;
        if (paraEmpleado) {
          setPrintingPDFEmpleado(false);
        } else {
          setPrintingPDF(false);
        }
        return;
      }
      
      const html = await res.text();
      
      // Crear iframe
      const iframe = document.createElement("iframe");
      iframe.style.position = "fixed";
      iframe.style.right = "0";
      iframe.style.bottom = "0";
      iframe.style.width = "0";
      iframe.style.height = "0";
      iframe.style.border = "none";
      document.body.appendChild(iframe);
      
      // Flag simple para asegurar que solo se imprima una vez
      let printed = false;
      let timeoutId = null;
      
      const printOnce = () => {
        if (printed) return;
        printed = true;
        
        // Cancelar timeout si existe
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } catch (e) {
          console.error("Error al imprimir:", e);
        }
        
        // Limpiar después de imprimir
        currentRef.current = false;
        if (paraEmpleado) {
          setPrintingPDFEmpleado(false);
        } else {
          setPrintingPDF(false);
        }
        
        // Remover iframe después de un tiempo
        setTimeout(() => {
          try {
            if (iframe.parentNode) {
              document.body.removeChild(iframe);
            }
          } catch (e) {
            // Ignorar errores
          }
        }, 2000);
      };
      
      // Escribir HTML
      iframe.contentDocument?.open();
      iframe.contentDocument?.write(html);
      iframe.contentDocument?.close();
      
      // SOLO usar timeout - NO usar onload para evitar múltiples disparos
      // Esperar 500ms para que el HTML se cargue completamente
      timeoutId = setTimeout(() => {
        printOnce();
      }, 500);
      
    } catch (e) {
      console.error("Error imprimiendo remito", e);
      alert("Error al generar el remito. Por favor, intenta nuevamente.");
      currentRef.current = false;
      if (paraEmpleado) {
        setPrintingPDFEmpleado(false);
      } else {
        setPrintingPDF(false);
      }
    }
  }, [envio?.ventaId, user]);

  // Función para descargar PDF
  const handleDownloadPDF = async (paraEmpleado = false) => {
    if (!envio?.ventaId) {
      alert("Este envío no está asociado a una venta");
      return;
    }
    
    if (paraEmpleado) {
      setDownloadingPDFEmpleado(true);
    } else {
      setDownloadingPDF(true);
    }
    
    try {
      const res = await fetch("/api/pdf/remito", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${await user.getIdToken()}`,
        },
        body: JSON.stringify({
          type: "venta",
          id: envio.ventaId,
          empleado: paraEmpleado,
        }),
      });
      if (!res.ok) {
        console.error("Error generando remito PDF", await res.text());
        return;
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const numero = envio.numeroPedido || envio.id?.slice(-8) || "documento";
      const suffix = paraEmpleado ? "-empleado" : "";
      a.download = `${numero}${suffix}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Error descargando remito PDF", e);
    } finally {
      if (paraEmpleado) {
        setDownloadingPDFEmpleado(false);
      } else {
        setDownloadingPDF(false);
      }
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="w-[800px] max-h-[80vh] overflow-y-auto bg-card border border-border/60">
        <DialogHeader>
          <DialogTitle>Detalle de Envío - N° {envio.numeroPedido}</DialogTitle>
        </DialogHeader>
        
        {/* Botones de descarga e impresión */}
        {envio.ventaId && (
          <div className="flex flex-wrap gap-2 mb-4 pb-4 border-b border-border/60">
            <Button
              onClick={() => handleDownloadPDF(false)}
              disabled={downloadingPDF || downloadingPDFEmpleado || printingPDF || printingPDFEmpleado}
              className="flex-1 lg:flex-none text-sm lg:text-base relative overflow-hidden group bg-card/60 hover:bg-card/80 border border-border/60 text-foreground shadow-sm hover:shadow-md transition-all duration-300 ease-out hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 rounded-xl backdrop-blur-sm"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-foreground/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-in-out" />
              {downloadingPDF ? (
                <Loader2 className="w-4 h-4 mr-1 lg:mr-2 animate-spin text-muted-foreground relative z-10" />
              ) : (
                <Download className="w-4 h-4 mr-1 lg:mr-2 text-muted-foreground group-hover:text-foreground transition-colors duration-300 relative z-10" />
              )}
              <span className="hidden sm:inline relative z-10 font-medium">Descargar</span>
              <span className="sm:hidden relative z-10">{downloadingPDF ? "⏳" : "📥"}</span>
            </Button>
            <Button
              onClick={() => handleDownloadPDF(true)}
              disabled={downloadingPDF || downloadingPDFEmpleado || printingPDF || printingPDFEmpleado}
              className="flex-1 lg:flex-none text-sm lg:text-base relative overflow-hidden group bg-gradient-to-br from-blue-500/15 to-indigo-500/10 hover:from-blue-500/20 hover:to-indigo-500/15 border border-blue-500/20 text-blue-700 dark:text-blue-300 hover:text-blue-800 dark:hover:text-blue-200 shadow-sm hover:shadow-md transition-all duration-300 ease-out hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 rounded-xl backdrop-blur-sm"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-foreground/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-in-out" />
              {downloadingPDFEmpleado ? (
                <Loader2 className="w-4 h-4 mr-1 lg:mr-2 animate-spin text-blue-700 dark:text-blue-300 relative z-10" />
              ) : (
                <User className="w-4 h-4 mr-1 lg:mr-2 text-blue-700 dark:text-blue-300 group-hover:text-blue-800 dark:group-hover:text-blue-200 transition-colors duration-300 relative z-10" />
              )}
              <span className="hidden sm:inline relative z-10 font-medium">Descargar Empleado</span>
              <span className="sm:hidden relative z-10">{downloadingPDFEmpleado ? "⏳" : "👤"}</span>
            </Button>
            <Button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handlePrintPDF(false, e);
              }}
              disabled={downloadingPDF || downloadingPDFEmpleado || printingPDF || printingPDFEmpleado}
              className="flex-1 lg:flex-none text-sm lg:text-base relative overflow-hidden group bg-card/60 hover:bg-card/80 border border-border/60 text-foreground shadow-sm hover:shadow-md transition-all duration-300 ease-out hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 rounded-xl backdrop-blur-sm"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-foreground/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-in-out" />
              {printingPDF ? (
                <Loader2 className="w-4 h-4 mr-1 lg:mr-2 animate-spin text-muted-foreground relative z-10" />
              ) : (
                <Printer className="w-4 h-4 mr-1 lg:mr-2 text-muted-foreground group-hover:text-foreground transition-colors duration-300 relative z-10" />
              )}
              <span className="hidden sm:inline relative z-10 font-medium">Imprimir</span>
              <span className="sm:hidden relative z-10">{printingPDF ? "⏳" : "🖨️"}</span>
            </Button>
            <Button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handlePrintPDF(true, e);
              }}
              disabled={downloadingPDF || downloadingPDFEmpleado || printingPDF || printingPDFEmpleado}
              className="flex-1 lg:flex-none text-sm lg:text-base relative overflow-hidden group bg-gradient-to-br from-blue-500/15 to-indigo-500/10 hover:from-blue-500/20 hover:to-indigo-500/15 border border-blue-500/20 text-blue-700 dark:text-blue-300 hover:text-blue-800 dark:hover:text-blue-200 shadow-sm hover:shadow-md transition-all duration-300 ease-out hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 rounded-xl backdrop-blur-sm"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-foreground/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-in-out" />
              {printingPDFEmpleado ? (
                <Loader2 className="w-4 h-4 mr-1 lg:mr-2 animate-spin text-blue-700 dark:text-blue-300 relative z-10" />
              ) : (
                <Printer className="w-4 h-4 mr-1 lg:mr-2 text-blue-700 dark:text-blue-300 group-hover:text-blue-800 dark:group-hover:text-blue-200 transition-colors duration-300 relative z-10" />
              )}
              <span className="hidden sm:inline relative z-10 font-medium">Imprimir Empleado</span>
              <span className="sm:hidden relative z-10">{printingPDFEmpleado ? "⏳" : "🖨️"}</span>
            </Button>
          </div>
        )}
        
        <div className="space-y-6">
          {/* Información básica */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <h3 className="font-semibold mb-2">Información del Cliente</h3>
              <div className="space-y-1 text-sm">
                <div><strong>Nombre:</strong> {envio.cliente?.nombre}</div>
                <div><strong>CUIT:</strong> {envio.cliente?.cuit}</div>
                <div><strong>Teléfono:</strong> {envio.cliente?.telefono}</div>
                <div><strong>Email:</strong> {envio.cliente?.email}</div>
              </div>
            </div>
            
            <div>
              <h3 className="font-semibold mb-2">Información de Envío</h3>
              <div className="space-y-1 text-sm">
                <div><strong>Dirección:</strong> {envio.direccionEnvio}</div>
                <div><strong>Localidad:</strong> {envio.localidadEnvio}</div>
                <div><strong>CP:</strong> {envio.codigoPostal}</div>
                <div><strong>Tipo:</strong> {envio.tipoEnvio}</div>
              </div>
            </div>
          </div>
          
          {/* Estado y seguimiento */}
          <div>
            <h3 className="font-semibold mb-2">Estado y Seguimiento</h3>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={estadosEnvio[envio.estado]?.color}>
                  {estadosEnvio[envio.estado]?.label}
                </Badge>
              </div>
              
              <div className="text-sm text-muted-foreground">
                {estadosEnvio[envio.estado]?.description}
              </div>
            </div>
          </div>
          
          {/* Productos */}
          <div>
            <h3 className="font-semibold mb-2">Productos</h3>
            <div className="border border-border/60 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="p-2 text-left">Producto</th>
                    <th className="p-2 text-center">Cantidad</th>
                    <th className="p-2 text-right">Precio</th>
                    <th className="p-2 text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {envio.productos?.map((producto, index) => (
                    <tr key={index} className="border-t border-border/60">
                      <td className="p-2">{producto.nombre}</td>
                      <td className="p-2 text-center">{producto.cantidad}</td>
                      <td className="p-2 text-right">${producto.precio}</td>
                      <td className="p-2 text-right">${(producto.precio * producto.cantidad).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          
          {/* Historial de estados */}
          <div>
            <h3 className="font-semibold mb-2">Historial de Estados</h3>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {envio.historialEstados?.map((historial, index) => (
                <div key={index} className="flex items-start gap-3 p-2 bg-muted/50 border border-border/60 rounded">
                  <Badge variant="outline" className={estadosEnvio[historial.estado]?.color}>
                    {estadosEnvio[historial.estado]?.label}
                  </Badge>
                  <div className="flex-1">
                    <div className="text-sm font-medium">{historial.comentario}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(historial.fecha).toLocaleString('es-AR')}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Modal de edición de envío
function EditarEnvioModal({ envio, onClose, onUpdate }) {
  const [nuevoEstado, setNuevoEstado] = useState(envio.estado);
  const [comentario, setComentario] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleGuardar = async () => {
    if (!nuevoEstado) return;
    setIsSubmitting(true);
    try {
      const envioRef = doc(db, "envios", envio.id);
      let nuevoHistorial = envio.historialEstados || [];
      if (nuevoEstado !== envio.estado) {
        nuevoHistorial = [
          ...nuevoHistorial,
          {
            estado: nuevoEstado,
            fecha: new Date().toISOString(),
            comentario: comentario || `Estado cambiado a ${estadosEnvio[nuevoEstado]?.label || nuevoEstado}`,
            cambiadoPor: "usuario",
          }
        ];
      }
      await updateDoc(envioRef, {
        estado: nuevoEstado,
        historialEstados: nuevoHistorial,
        fechaActualizacion: new Date().toISOString(),
      });
      onUpdate();
      onClose();
    } catch (e) {
      alert("Error al guardar cambios: " + e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="w-[500px]">
        <DialogHeader>
          <DialogTitle>Editar Envío N° {envio.numeroPedido}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Estado</label>
            <select className="border rounded px-2 py-2 w-full mt-1" value={nuevoEstado} onChange={e => setNuevoEstado(e.target.value)}>
              {Object.entries(estadosEnvio).map(([key, value]) => (
                <option key={key} value={key}>{value.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">Comentario (opcional)</label>
            <Textarea value={comentario} onChange={e => setComentario(e.target.value)} placeholder="Comentario sobre el cambio..." />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleGuardar} disabled={isSubmitting || !nuevoEstado}>
            {isSubmitting ? "Guardando..." : "Guardar cambios"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const EnviosPage = () => {
  // Hooks y estados
  const [enviosData, setEnviosData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [envioSeleccionado, setEnvioSeleccionado] = useState(null);
  const [mostrarDetalle, setMostrarDetalle] = useState(false);
  const [mostrarEditar, setMostrarEditar] = useState(false);
  const [envioEdit, setEnvioEdit] = useState(null);

  // Filtro predeterminado a 'pendiente' al cargar
  useEffect(() => {
    setFiltroEstado("pendiente");
  }, []);

  const handleEditarEnvio = (envio) => {
    setEnvioEdit(envio);
    setMostrarEditar(true);
  };
  
  const handleVerDetalle = (envio) => {
    setEnvioSeleccionado(envio);
    setMostrarDetalle(true);
  };

  // Columnas para la tabla de envíos
  const enviosColumns = [
    {
      accessorKey: "numeroPedido",
      header: "Cliente / pedido",
      cell: ({ row }) => {
        const numero = row.getValue("numeroPedido");
        return (
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-slate-900">{String(row.original.cliente?.nombre || "Sin nombre").toLocaleUpperCase("es-AR")}</div>
            <div className="mt-0.5 font-mono text-[10px] text-slate-500">{numero || "Sin número"}</div>
          </div>
        );
      },
    },
    {
      accessorKey: "fechaEntrega",
      header: "Fecha Entrega",
      cell: ({ row }) => {
        const fecha = row.getValue("fechaEntrega");
        const fechaCreacion = row.original.fechaCreacion;
        if (!fecha) return <span className="text-muted-foreground">Sin fecha</span>;
        
        // Corregir el cálculo de la fecha para evitar el problema de zona horaria
        const fechaEntrega = new Date(fecha + 'T00:00:00');
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0); // Resetear la hora para comparar solo fechas
        
        const diasRestantes = Math.ceil((fechaEntrega - hoy) / (1000 * 60 * 60 * 24));
        let color = "text-muted-foreground";
        if (diasRestantes < 0) color = "text-red-600 font-semibold";
        else if (diasRestantes <= 2) color = "text-orange-600 font-semibold";
        else if (diasRestantes <= 7) color = "text-yellow-600";
        return (
          <div className={color}>
            {fechaEntrega.toLocaleDateString('es-AR')}
            {diasRestantes < 0 && <div className="text-xs text-red-500">Vencido</div>}
            {diasRestantes >= 0 && diasRestantes <= 7 && (
              <div className="text-xs">{diasRestantes === 0 ? "Hoy" : `${diasRestantes} días`}</div>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: "estado",
      header: "Estado",
      cell: ({ row }) => {
        const estado = row.getValue("estado");
        const estadoInfo = estadosEnvio[estado] || { 
          label: estado, 
          color: "bg-muted/50 text-foreground border-border/60" 
        };
        return (
          <div className="flex items-center gap-2">
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${estado === "entregado" ? "bg-emerald-500" : estado === "cancelado" ? "bg-rose-500" : "bg-amber-500"}`} aria-hidden="true" />
            <Badge variant="outline" className={`${estadoInfo.color} rounded-full px-2 py-0.5 text-[10px]`}>
              {estadoInfo.label}
            </Badge>
          </div>
        );
      },
    },
    {
      accessorKey: "tipoEnvio",
      header: "Tipo Envío",
      cell: ({ row }) => {
        const tipo = row.getValue("tipoEnvio");
        const tipos = {
          retiro_local: "Retiro Local",
          envio_domicilio: "Domicilio",
          envio_obra: "Obra",
          transporte_propio: "Transporte Propio",
        };
        return tipos[tipo] || tipo;
      },
    },
    {
      accessorKey: "totalVenta",
      header: "Total",
      cell: ({ row }) => {
        const total = row.getValue("totalVenta");
        const costoEnvio = row.original.costoEnvio || 0;
        return (
          <div className="tabular-nums text-slate-800">
            <div className="font-medium">{formatearMonedaEnvio(total)}</div>
            {costoEnvio > 0 && (
              <div className="text-[10px] text-slate-500">+ {formatearMonedaEnvio(costoEnvio)} envío</div>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: "vendedor",
      header: "Vendedor",
      cell: ({ row }) => {
        const vendedor = row.getValue("vendedor");
        return vendedor || <span className="text-muted-foreground">Sin asignar</span>;
      },
    },
    {
      id: "acciones",
      header: "Acciones",
      cell: ({ row }) => {
        const envio = row.original;
        return (
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleVerDetalle(envio)}
            >
              Ver
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleEditarEnvio(envio)}
            >
              Editar
            </Button>
          </div>
        );
      },
    },
  ];

  const cargarEnvios = async () => {
    try {
      setLoading(true);
      const enviosSnap = await getDocs(collection(db, "envios"));
      const envios = enviosSnap.docs.map(doc => ({ ...doc.data(), id: doc.id }));
      setEnviosData(envios);
    } catch (error) {
      console.error("Error al cargar envíos:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarEnvios();
  }, []);

  // Filtrar envíos
  const enviosFiltrados = enviosData.filter(envio => {
    const cumpleEstado = !filtroEstado || envio.estado === filtroEstado;
    const cumpleBusqueda = !busqueda || 
      envio.numeroPedido?.toLowerCase().includes(busqueda.toLowerCase()) ||
      envio.cliente?.nombre?.toLowerCase().includes(busqueda.toLowerCase()) ||
      envio.vendedor?.toLowerCase().includes(busqueda.toLowerCase());
    
    return cumpleEstado && cumpleBusqueda;
  });

  const handleActualizarEnvio = () => {
    cargarEnvios();
  };

  // Estadísticas
  const estadisticas = {
    total: enviosData.length,
    pendientes: enviosData.filter(e => e.estado === 'pendiente').length,
    entregados: enviosData.filter(e => e.estado === 'entregado').length,
    cancelados: enviosData.filter(e => e.estado === 'cancelado').length,
  };

  if (loading) {
    return (
      <div className="mx-auto flex min-h-[60vh] w-full max-w-[1600px] items-center justify-center px-4">
        <div className="flex items-center gap-3 text-sm text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <p>Cargando envíos...</p>
        </div>
      </div>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-3 py-6 font-sans text-slate-900 sm:px-6 sm:py-8">
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[.18em] text-amber-700">Logística · Seguimiento</p>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="text-3xl font-semibold tracking-[-.04em] sm:text-4xl">Envíos</h1>
            <span className="text-xs tabular-nums text-slate-500">{enviosFiltrados.length} resultados</span>
          </div>
          <p className="mt-2 text-sm text-slate-500">Administrá entregas, estados y comprobantes de envío.</p>
        </div>
        <Button variant="outline" onClick={cargarEnvios} className="h-9 self-start rounded-md border-slate-200 bg-white px-3 text-xs font-medium shadow-sm hover:bg-slate-50 sm:self-auto">
          <RefreshCw className="mr-2 h-4 w-4" />Actualizar
        </Button>
      </header>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-slate-200 pb-4" aria-label="Resumen de envíos">
        {[
          ["Total", estadisticas.total, "text-slate-900"],
          ["Pendientes", estadisticas.pendientes, "text-amber-700"],
          ["Entregados", estadisticas.entregados, "text-emerald-700"],
          ["Cancelados", estadisticas.cancelados, "text-rose-700"],
        ].map(([label, count, color]) => (
          <div key={label} className="flex items-baseline gap-2">
            <span className={`text-lg font-semibold tabular-nums ${color}`}>{count}</span>
            <span className="text-xs text-slate-500">{label}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center" aria-label="Buscar y filtrar envíos">
        <label className="relative min-w-0 flex-1 sm:max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <Input
            placeholder="Pedido, cliente o vendedor..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            aria-label="Buscar envíos"
            className="h-9 rounded-md border-slate-200 bg-white pl-9 text-xs shadow-sm placeholder:text-slate-500 focus-visible:ring-slate-200"
          />
        </label>
        <Select value={filtroEstado || "todos"} onValueChange={(value) => setFiltroEstado(value === "todos" ? "" : value)}>
          <SelectTrigger className="h-9 w-full rounded-md border-slate-200 bg-white text-xs shadow-sm sm:w-48"><SelectValue placeholder="Todos los estados" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los estados</SelectItem>
            {Object.entries(estadosEnvio).map(([key, value]) => <SelectItem key={key} value={key}>{value.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button type="button" variant="ghost" onClick={() => { setFiltroEstado(""); setBusqueda(""); }} className="h-9 justify-start px-3 text-xs text-slate-600 hover:bg-slate-100 sm:justify-center">
          Limpiar filtros
        </Button>
      </div>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm shadow-slate-200/40" aria-label="Listado de envíos">
        <DataTable data={enviosFiltrados} columns={enviosColumns} responsive />
      </section>

      {/* Modales */}

      {mostrarDetalle && envioSeleccionado && (
        <DetalleEnvio
          envio={envioSeleccionado}
          onClose={() => {
            setMostrarDetalle(false);
            setEnvioSeleccionado(null);
          }}
        />
      )}
      {mostrarEditar && envioEdit && (
        <EditarEnvioModal
          envio={envioEdit}
          onClose={() => { setMostrarEditar(false); setEnvioEdit(null); }}
          onUpdate={handleActualizarEnvio}
        />
      )}
    </main>
  );
};

export default EnviosPage;
