"use client";
import React, { useState, useMemo } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Icon } from "@iconify/react";
import {
  Building,
  User,
  MapPin,
  Calendar,
  DollarSign,
  FileText,
  Printer,
  ExternalLink,
  Loader2,
  X,
  Trash2,
} from "lucide-react";
import { db } from "@/lib/firebase";
import { doc, updateDoc, getDoc, deleteDoc } from "firebase/firestore";
import { useAuth } from "@/provider/auth.provider";
import {
  formatearNumeroArgentino,
  formatearFecha,
  generarContenidoImpresion,
  descargarPDFDesdeIframe,
} from "@/lib/obra-utils";

const estadosObra = [
  { value: "pendiente_inicio", label: "Pendiente de Inicio" },
  { value: "en_ejecucion", label: "En Ejecución" },
  { value: "pausada", label: "Pausada" },
  { value: "completada", label: "Completada" },
  { value: "cancelada", label: "Cancelada" },
];

const coloresEstado = {
  pendiente_inicio: "bg-yellow-100 text-yellow-800 border-yellow-200",
  en_ejecucion: "bg-blue-100 text-blue-800 border-blue-200",
  pausada: "bg-gray-100 text-gray-800 border-gray-200",
  completada: "bg-green-100 text-green-800 border-green-200",
  cancelada: "bg-red-100 text-red-800 border-red-200",
};

const ObraSidePanel = ({
  obra,
  open,
  onClose,
  onVerDetalle,
  onObraUpdate,
  onObraDelete,
  user,
  lang,
}) => {
  const { user: authUser } = useAuth();
  const [cambiandoEstado, setCambiandoEstado] = useState(false);
  const [nuevoEstado, setNuevoEstado] = useState(obra?.estado || "");
  const [showNotaDialog, setShowNotaDialog] = useState(false);
  const [notaForm, setNotaForm] = useState({
    nombreObra: "",
    productos: "",
    fecha: "",
  });
  const [guardandoNota, setGuardandoNota] = useState(false);
  const [imprimiendo, setImprimiendo] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Calcular totales
  const totales = useMemo(() => {
    if (!obra) return { total: 0, abonado: 0, saldo: 0 };
    
    const total = obra.presupuestoTotal || obra.total || 0;
    const cobr = obra.cobranzas || {};
    const abonado =
      (Number(cobr.senia) || 0) +
      (Number(cobr.monto) || 0) +
      (Array.isArray(cobr.historialPagos)
        ? cobr.historialPagos.reduce((a, p) => a + (Number(p.monto) || 0), 0)
        : 0);
    const saldo = total - abonado;

    return { total, abonado, saldo };
  }, [obra]);

  // Estado de pago
  const estadoPago = useMemo(() => {
    if (totales.total > 0) {
      if (totales.abonado >= totales.total) return "pagado";
      if (totales.abonado > 0) return "parcial";
    }
    return "pendiente";
  }, [totales]);

  // Inicializar estado cuando se abre el panel
  React.useEffect(() => {
    if (obra && open) {
      setNuevoEstado(obra.estado || "pendiente_inicio");
      const fechaHoy = new Date().toISOString().split("T")[0];
      setNotaForm({
        nombreObra: obra.numeroPedido || obra.cliente?.nombre || "",
        productos: "",
        fecha: fechaHoy,
      });
    }
  }, [obra, open]);

  // Cambiar estado de la obra
  const handleCambiarEstado = async () => {
    if (!obra || nuevoEstado === obra.estado) return;

    try {
      setCambiandoEstado(true);
      await updateDoc(doc(db, "obras", obra.id), {
        estado: nuevoEstado,
        fechaModificacion: new Date().toISOString(),
      });

      // Actualizar obra local
      const obraActualizada = { ...obra, estado: nuevoEstado };
      if (onObraUpdate) {
        onObraUpdate(obraActualizada);
      }

      // Cerrar panel después de un breve delay para mostrar feedback
      setTimeout(() => {
        onClose();
      }, 500);
    } catch (error) {
      console.error("Error al cambiar estado:", error);
      alert("Error al cambiar el estado de la obra");
    } finally {
      setCambiandoEstado(false);
    }
  };

  // Guardar nota rápida
  const handleGuardarNota = async () => {
    if (!notaForm.nombreObra || !notaForm.fecha || !user) {
      alert("Por favor completa todos los campos obligatorios");
      return;
    }

    try {
      setGuardandoNota(true);
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

      setShowNotaDialog(false);
      setNotaForm({ nombreObra: "", productos: "", fecha: "" });
      
      // Cerrar panel después de guardar
      setTimeout(() => {
        onClose();
      }, 500);
    } catch (error) {
      console.error("Error al guardar nota:", error);
      alert("Error al guardar la nota");
    } finally {
      setGuardandoNota(false);
    }
  };

  // Eliminar obra
  const handleEliminarObra = async () => {
    if (!obra || !authUser) return;

    try {
      setEliminando(true);
      
      // Usar la API de eliminación
      const response = await fetch("/api/delete-document", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          documentId: obra.id,
          collectionName: "obras",
          userId: authUser.uid,
          userEmail: authUser.email,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Error al eliminar la obra");
      }

      // Notificar al componente padre
      if (onObraDelete) {
        onObraDelete(obra.id);
      }

      // Cerrar panel
      onClose();
    } catch (error) {
      console.error("Error al eliminar obra:", error);
      alert(`Error al eliminar la obra: ${error.message}`);
    } finally {
      setEliminando(false);
      setShowDeleteDialog(false);
    }
  };

  // Imprimir/Exportar PDF
  const handleImprimir = async () => {
    if (!obra) return;

    try {
      setImprimiendo(true);
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
      setImprimiendo(false);
    }
  };

  if (!obra) return null;

  return (
    <>
      <Sheet open={open} onOpenChange={onClose}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader className="border-b pb-4 mb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center shadow-md">
                <Building className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1">
                <SheetTitle className="text-xl font-bold text-gray-900">
                  {obra.numeroPedido || "Sin número"}
                </SheetTitle>
                <SheetDescription className="text-sm text-gray-600 mt-1">
                  {obra.cliente?.nombre || "Sin cliente"}
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>

          <div className="space-y-6">
            {/* Datos Básicos */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                Datos Básicos
              </h3>

              {/* Cliente */}
              <div className="flex items-start gap-3">
                <User className="w-5 h-5 text-gray-400 mt-0.5" />
                <div className="flex-1">
                  <div className="text-xs text-gray-500 mb-1">Cliente</div>
                  <div className="text-sm font-medium text-gray-900">
                    {obra.cliente?.nombre || "Sin cliente"}
                  </div>
                  {obra.cliente?.cuit && (
                    <div className="text-xs text-gray-500 mt-0.5">
                      CUIT: {obra.cliente.cuit}
                    </div>
                  )}
                </div>
              </div>

              {/* Dirección */}
              <div className="flex items-start gap-3">
                <MapPin className="w-5 h-5 text-gray-400 mt-0.5" />
                <div className="flex-1">
                  <div className="text-xs text-gray-500 mb-1">Dirección</div>
                  {obra.ubicacion ? (
                    <div className="text-sm text-gray-900">
                      {obra.ubicacion.direccion || "Sin dirección"}
                      {obra.ubicacion.localidad && (
                        <span className="text-gray-600">
                          , {obra.ubicacion.localidad}
                        </span>
                      )}
                      {obra.ubicacion.provincia && (
                        <span className="text-gray-600">
                          , {obra.ubicacion.provincia}
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="text-sm text-gray-500">
                      {obra.cliente?.direccion || "Sin dirección"}
                    </div>
                  )}
                </div>
              </div>

              {/* Estado */}
              <div className="flex items-start gap-3">
                <Building className="w-5 h-5 text-gray-400 mt-0.5" />
                <div className="flex-1">
                  <div className="text-xs text-gray-500 mb-2">Estado</div>
                  <Select
                    value={nuevoEstado || obra?.estado || "pendiente_inicio"}
                    onValueChange={(value) => {
                      setNuevoEstado(value);
                    }}
                    disabled={cambiandoEstado}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Seleccionar estado" />
                    </SelectTrigger>
                    <SelectContent 
                      position="popper"
                      sideOffset={5}
                      className="z-[1001]"
                      onCloseAutoFocus={(e) => {
                        // Prevenir que el foco vuelva al trigger cuando se cierra dentro del Sheet
                        // Esto evita el conflicto de aria-hidden
                        e.preventDefault();
                      }}
                      onPointerDownOutside={(e) => {
                        // Permitir que el Select se cierre al hacer clic fuera
                        // pero prevenir el conflicto de accesibilidad
                        const target = e.target;
                        if (target && target.closest && target.closest('[role="dialog"]')) {
                          e.preventDefault();
                        }
                      }}
                    >
                      {estadosObra.map((estado) => (
                        <SelectItem key={estado.value} value={estado.value}>
                          {estado.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {nuevoEstado && nuevoEstado !== obra?.estado && (
                    <Button
                      size="sm"
                      onClick={handleCambiarEstado}
                      disabled={cambiandoEstado}
                      className="mt-2 w-full bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      {cambiandoEstado ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Guardando...
                        </>
                      ) : (
                        <>
                          Guardar Cambio de Estado
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </div>

              {/* Fechas */}
              {obra.fechas && (
                <div className="flex items-start gap-3">
                  <Calendar className="w-5 h-5 text-gray-400 mt-0.5" />
                  <div className="flex-1">
                    <div className="text-xs text-gray-500 mb-1">Fechas</div>
                    <div className="text-sm text-gray-900">
                      <div>
                        <span className="font-medium">Inicio:</span>{" "}
                        {formatearFecha(obra.fechas.inicio)}
                      </div>
                      <div className="mt-1">
                        <span className="font-medium">Fin:</span>{" "}
                        {formatearFecha(obra.fechas.fin)}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Resumen Financiero */}
            <div className="space-y-4 border-t pt-4">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                Resumen Financiero
              </h3>

              <div className="space-y-3">
                {/* Total */}
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-gray-500" />
                    <span className="text-sm font-medium text-gray-700">
                      Total
                    </span>
                  </div>
                  <span className="text-lg font-bold text-gray-900">
                    {formatearNumeroArgentino(totales.total)}
                  </span>
                </div>

                {/* Abonado */}
                <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-blue-600" />
                    <span className="text-sm font-medium text-blue-700">
                      Abonado
                    </span>
                  </div>
                  <span className="text-lg font-bold text-blue-900">
                    {formatearNumeroArgentino(totales.abonado)}
                  </span>
                </div>

                {/* Saldo */}
                <div className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-red-600" />
                    <span className="text-sm font-medium text-red-700">
                      Saldo Pendiente
                    </span>
                  </div>
                  <span className="text-lg font-bold text-red-900">
                    {formatearNumeroArgentino(totales.saldo)}
                  </span>
                </div>

                {/* Estado de Pago */}
                <div className="flex items-center justify-center">
                  <Badge
                    variant="outline"
                    className={
                      estadoPago === "pagado"
                        ? "bg-green-100 text-green-800 border-green-200"
                        : estadoPago === "parcial"
                        ? "bg-yellow-100 text-yellow-800 border-yellow-200"
                        : "bg-red-100 text-red-800 border-red-200"
                    }
                  >
                    {estadoPago === "pagado"
                      ? "Pagado"
                      : estadoPago === "parcial"
                      ? "Pago Parcial"
                      : "Pendiente"}
                  </Badge>
                </div>
              </div>
            </div>

            {/* Acciones Rápidas */}
            <div className="space-y-3 border-t pt-4">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                Acciones Rápidas
              </h3>

              <div className="space-y-2">
                <Button
                  variant="default"
                  className="w-full justify-start"
                  onClick={onVerDetalle}
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Ver Detalle Completo
                </Button>

                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => setShowNotaDialog(true)}
                >
                  <FileText className="w-4 h-4 mr-2" />
                  Agregar Nota Rápida
                </Button>

                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={handleImprimir}
                  disabled={imprimiendo}
                >
                  {imprimiendo ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Generando PDF...
                    </>
                  ) : (
                    <>
                      <Printer className="w-4 h-4 mr-2" />
                      Imprimir / Exportar PDF
                    </>
                  )}
                </Button>

                <Button
                  variant="outline"
                  className="w-full justify-start text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300"
                  onClick={() => setShowDeleteDialog(true)}
                  disabled={eliminando}
                >
                  {eliminando ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Eliminando...
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4 mr-2" />
                      Eliminar Obra
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Diálogo de confirmación de eliminación */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Eliminación</DialogTitle>
            <DialogDescription>
              ¿Estás seguro de que deseas eliminar la obra <strong>{obra?.numeroPedido || "sin número"}</strong>?
              <br />
              <span className="text-red-600 font-medium">Esta acción no se puede deshacer.</span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
              disabled={eliminando}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleEliminarObra}
              disabled={eliminando}
            >
              {eliminando ? (
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

      {/* Diálogo para Nota Rápida */}
      <Dialog open={showNotaDialog} onOpenChange={setShowNotaDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agregar Nota Rápida</DialogTitle>
            <DialogDescription>
              Agrega una nota asociada a esta obra
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">
                Nombre de Obra
              </label>
              <Input
                value={notaForm.nombreObra}
                onChange={(e) =>
                  setNotaForm({ ...notaForm, nombreObra: e.target.value })
                }
                placeholder="Nombre de la obra"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">
                Productos / Detalles
              </label>
              <Textarea
                value={notaForm.productos}
                onChange={(e) =>
                  setNotaForm({ ...notaForm, productos: e.target.value })
                }
                placeholder="Productos, detalles, observaciones..."
                rows={4}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">
                Fecha
              </label>
              <Input
                type="date"
                value={notaForm.fecha}
                onChange={(e) =>
                  setNotaForm({ ...notaForm, fecha: e.target.value })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowNotaDialog(false)}
            >
              Cancelar
            </Button>
            <Button onClick={handleGuardarNota} disabled={guardandoNota}>
              {guardandoNota ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Guardando...
                </>
              ) : (
                "Guardar Nota"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ObraSidePanel;

