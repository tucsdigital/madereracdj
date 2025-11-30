"use client";
import React, { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Icon } from "@iconify/react";
import {
  Printer,
  Edit,
  Save,
  X,
  Building,
  MapPin,
  User,
  FileText,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { db } from "@/lib/firebase";
import {
  doc,
  getDoc,
  updateDoc,
  collection,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";
import { useObra } from "@/hooks/useObra";
import {
  formatearNumeroArgentino,
  formatearFecha,
  generarContenidoImpresion,
} from "@/lib/obra-utils";
import ObraHeader from "@/components/obras/ObraHeader";
import ObraInfoGeneral from "@/components/obras/ObraInfoGeneral";
import ObraResumenFinanciero from "@/components/obras/ObraResumenFinanciero";
import PresupuestoDetalle from "@/components/obras/PresupuestoDetalle";
import PrintDownloadButtons from "@/components/ui/print-download-buttons";
import { useAuth } from "@/provider/auth.provider";
import { useRouter } from "next/navigation";
import WizardConversion from "@/components/obras/WizardConversion";
import FormularioClienteObras from "@/components/obras/FormularioClienteObras";

const PresupuestoPage = () => {
  const params = useParams();
  const { id, lang } = params;
  const [openPrint, setOpenPrint] = useState(false);
  const [showWizardConversion, setShowWizardConversion] = useState(false);
  const [showFormularioCliente, setShowFormularioCliente] = useState(false);

  // Estado para controlar cuándo guardar desde el componente PresupuestoDetalle
  const [shouldSave, setShouldSave] = useState(false);

  const router = useRouter();
  const { user } = useAuth();

  const {
    obra,
    loading,
    error,
    editando,
    itemsPresupuesto,
    productosObraCatalogo,
    productosObraPorCategoria,
    categoriasObra,
    categoriaObraId,
    busquedaProductoObra,
    descripcionGeneral,
    productosCatalogo,
    productosPorCategoria,
    categorias,
    cargarCatalogoProductos,
    catalogoCargado,
    setObra,
    setEditando,
    setCategoriaObraId,
    setBusquedaProductoObra,
    setItemsPresupuesto,
    setDescripcionGeneral,
    guardarEdicion,
  } = useObra(id);




  const handlePrint = () => {
    setOpenPrint(true);
  };

  const handleToggleEdit = async () => {
    console.log("🔘 handleToggleEdit llamado, editando:", editando);
    console.log("🔘 obra?.bloques:", obra?.bloques);
    console.log("🔘 shouldSave actual:", shouldSave);
    
    if (editando) {
      // FORZAR ACTUALIZACIÓN - SIEMPRE USAR PRESUPUESTODETALLE
      console.log("🔥🔥🔥 NUEVA VERSIÓN - ACTIVANDO GUARDADO 🔥🔥🔥");
      setShouldSave(true);
      console.log("🔥🔥🔥 shouldSave = true 🔥🔥🔥");
      setEditando(false);
    } else {
      console.log("🔄 Activando modo edición...");
      setEditando(true);
    }
  };

  // Función para actualizar el estado local de la obra
  const handleObraUpdate = (obraActualizada) => {
    console.log("🔄 Actualizando estado local de la obra:", obraActualizada);
    // Actualizar el estado local sin refrescar la página
    setObra(obraActualizada);
    console.log("✅ Estado local actualizado exitosamente");
  };

  // Función para resetear el flag shouldSave
  const handleResetShouldSave = () => {
    setShouldSave(false);
  };

  // Handler para cuando se guarda un cliente desde el formulario
  const handleClienteGuardado = async (clienteId, clienteData) => {
    try {
      // Actualizar el presupuesto en Firestore
      await updateDoc(doc(db, "obras", obra.id), {
        clienteId: clienteId,
        cliente: clienteData,
        fechaModificacion: new Date().toISOString(),
      });

      // Actualizar el estado local de la obra
      const obraActualizada = {
        ...obra,
        clienteId: clienteId,
        cliente: clienteData,
      };
      setObra(obraActualizada);
      handleObraUpdate(obraActualizada);

      setShowFormularioCliente(false);
    } catch (error) {
      console.error("Error al actualizar cliente:", error);
      alert("Error al actualizar el cliente");
    }
  };

  // Formateador para números en formato argentino
  const formatearNumeroArgentino = (numero) => {
    if (numero === null || numero === undefined || isNaN(numero)) return "0";
    return new Intl.NumberFormat("es-AR").format(Number(numero));
  };



  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Cargando presupuesto...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-red-600 text-6xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Error</h1>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  if (!obra || obra.tipo !== "presupuesto") {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-yellow-600 text-6xl mb-4">📋</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            No es un presupuesto
          </h1>
          <p className="text-gray-600">Esta página solo muestra presupuestos</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6">
      <ObraHeader
        obra={obra}
        editando={editando}
        onToggleEdit={handleToggleEdit}
        onPrint={handlePrint}
        onConvertToObra={
          obra?.tipo === "presupuesto" ? () => setShowWizardConversion(true) : undefined
        }
        converting={false}
        showBackButton={true}
        backUrl={`/${lang}/obras`}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Columna principal */}
        <div className="lg:col-span-2 space-y-6">
          {/* Sección Cliente Editable - PRIMERA SECCIÓN */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <User className="w-5 h-5" />
                  Cliente
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowFormularioCliente(true)}
                  className="flex items-center gap-2"
                >
                  <Edit className="w-4 h-4" />
                  Cambiar Cliente
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {obra?.cliente ? (
                <div className="space-y-2">
                  <p className="font-medium text-gray-900">{obra.cliente.nombre || "Sin nombre"}</p>
                  {obra.cliente.telefono && (
                    <p className="text-sm text-gray-600">Tel: {obra.cliente.telefono}</p>
                  )}
                  {obra.cliente.direccion && (
                    <p className="text-sm text-gray-600">
                      {obra.cliente.direccion}
                      {obra.cliente.localidad && `, ${obra.cliente.localidad}`}
                      {obra.cliente.provincia && `, ${obra.cliente.provincia}`}
                    </p>
                  )}
                  {(obra.cliente.barrio || obra.cliente.lote) && (
                    <div className="flex gap-4 text-sm text-gray-600">
                      {obra.cliente.barrio && <span>Barrio: {obra.cliente.barrio}</span>}
                      {obra.cliente.lote && <span>Lote: {obra.cliente.lote}</span>}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-gray-500">No hay cliente asignado</p>
              )}
            </CardContent>
          </Card>

          {/* Componente PresupuestoDetalle - maneja tanto bloques como presupuestos sin bloques */}
          <PresupuestoDetalle
            obra={obra}
            editando={editando}
            formatearNumeroArgentino={formatearNumeroArgentino}
            onObraUpdate={handleObraUpdate}
            shouldSave={shouldSave}
            onResetShouldSave={handleResetShouldSave}
          />

        </div>

        {/* Barra lateral */}
        <div className="space-y-6">
          <ObraInfoGeneral obra={obra} formatearFecha={formatearFecha} />

          {/* Resumen Financiero por Bloques */}
          {obra?.bloques && obra.bloques.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Icon icon="heroicons:calculator" className="w-5 h-5" />
                  Resumen Financiero por Bloques
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {obra.bloques.map((bloque, index) => (
                    <div key={bloque.id} className="p-4 bg-gray-50 rounded-lg border">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-semibold text-lg">{bloque.nombre}</h3>
                      </div>
                      
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div className="text-center">
                          <div className="text-gray-500">Subtotal</div>
                          <div className="font-semibold">${formatearNumeroArgentino(bloque.subtotal || 0)}</div>
                        </div>
                        <div className="text-center">
                          <div className="text-gray-500">Descuento</div>
                          <div className="font-semibold text-orange-600">${formatearNumeroArgentino(bloque.descuentoTotal || 0)}</div>
                        </div>
                        <div className="text-center">
                          <div className="text-gray-500">Total</div>
                          <div className="font-bold text-green-600">${formatearNumeroArgentino(bloque.total || 0)}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : (
            <ObraResumenFinanciero
              obra={obra}
              presupuesto={null}
              modoCosto="presupuesto"
              formatearNumeroArgentino={formatearNumeroArgentino}
            />
          )}

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
        </div>
      </div>

      {/* Modal: Vista previa de impresión */}
      <Dialog open={openPrint} onOpenChange={setOpenPrint}>
        <DialogContent className="max-w-6xl max-h-[90vh] w-full">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Printer className="w-5 h-5" />
              Vista Previa de Impresión - Presupuesto
            </DialogTitle>
            <DialogDescription>
              Revise el documento antes de imprimir. Use los botones de acción
              para imprimir, descargar PDF o cerrar.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0">
            <iframe
              srcDoc={generarContenidoImpresion(obra, null, "presupuesto")}
              className="w-full h-[70vh] border border-gray-200 rounded-lg"
              title="Vista previa de impresión"
              sandbox="allow-scripts allow-same-origin allow-modals"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpenPrint(false)}>
              Cerrar
            </Button>

            {/* Botones de impresión y descarga PDF */}
            <PrintDownloadButtons
              obra={obra}
              presupuesto={null}
              modoCosto="presupuesto"
              movimientos={[]}
              variant="default"
              size="sm"
            />
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Wizard de Conversión */}
      <WizardConversion
        presupuesto={obra}
        open={showWizardConversion}
        onClose={() => setShowWizardConversion(false)}
        user={user}
        lang={lang}
        onSuccess={(obraId, nuevaObra) => {
          // Redirigir a la nueva obra
          router.push(`/${lang}/obras/${obraId}`);
        }}
      />

      {/* Formulario de Cliente */}
      <FormularioClienteObras
        open={showFormularioCliente}
        onClose={() => setShowFormularioCliente(false)}
        clienteExistente={obra?.cliente ? {
          id: obra.clienteId,
          ...(obra.cliente || {})
        } : null}
        onClienteGuardado={handleClienteGuardado}
      />
    </div>
  );
};

export default PresupuestoPage;
