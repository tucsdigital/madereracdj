"use client";
import React, { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Printer, Edit, User, MapPin, Calendar, ChevronDown, ChevronUp } from "lucide-react";
import { useObra } from "@/hooks/useObra";
import {
  formatearNumeroArgentino,
  formatearFecha,
  generarContenidoImpresion,
  parseNumericValue,
  calcularPrecioMachimbre,
  calcularPrecioCorteMadera,
} from "@/lib/obra-utils";
import ObraHeader from "@/components/obras/ObraHeader";
import ObraResumenFinanciero from "@/components/obras/ObraResumenFinanciero";
import ObraCobranza from "@/components/obras/ObraCobranza";
import ObraDocumentacion from "@/components/obras/ObraDocumentacion";
import PrintDownloadButtons from "@/components/ui/print-download-buttons";
import CatalogoVentas from "@/components/ventas/CatalogoVentas";
import TablaProductosVentas from "@/components/ventas/TablaProductosVentas";
import FormularioClienteObras from "@/components/obras/FormularioClienteObras";
import { db } from "@/lib/firebase";
import { doc, updateDoc } from "firebase/firestore";

const ObraDetallePage = () => {
  const params = useParams();
  const router = useRouter();
  const { id, lang } = params;
  const [openPrint, setOpenPrint] = useState(false);
  const [showFormularioCliente, setShowFormularioCliente] = useState(false);
  const [showCamposSecundarios, setShowCamposSecundarios] = useState(false);

  const {
    obra,
    loading,
    error,
    presupuesto,
    editando,
    docLinks,
    movimientos,
    estadoObra,
    fechasEdit,
    productosCatalogo,
    productosPorCategoria,
    categorias,
    itemsCatalogo,
    gastoObraManual,
    modoCosto,
    setEditando,
    setDocLinks,
    setMovimientos,
    setEstadoObra,
    setFechasEdit,
    setClienteId,
    setCliente,
    setItemsCatalogo,
    guardarEdicion,
  } = useObra(id);

  const handlePrint = () => {
    setOpenPrint(true);
  };

  const handleToggleEdit = () => {
    if (editando) {
      guardarEdicion();
    } else {
      setEditando(true);
    }
  };

  // Handler para cuando se guarda un cliente desde el formulario
  const handleClienteGuardado = async (clienteId, clienteData) => {
    if (!obra?.id) {
      console.error("No se puede actualizar: obra no disponible");
      return;
    }
    
    try {
      // Actualizar la obra en Firestore
      await updateDoc(doc(db, "obras", obra.id), {
        clienteId: clienteId,
        cliente: clienteData,
        fechaModificacion: new Date().toISOString(),
      });

      // Actualizar el estado local usando los setters del hook
      setClienteId(clienteId);
      setCliente(clienteData);

      setShowFormularioCliente(false);
    } catch (error) {
      console.error("Error al actualizar cliente:", error);
      alert("Error al actualizar el cliente");
    }
  };


  const handleCantidadChange = (id, cantidad) => {
    const parsedCantidad = parseNumericValue(cantidad);
    setItemsCatalogo((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
        const esMadera = (p.categoria || "").toLowerCase() === "maderas";
        if (
          esMadera &&
          (p.subcategoria === "machimbre" || p.subcategoria === "deck")
        ) {
          const alto = Number(p.alto) || 0;
          const largo = Number(p.largo) || 0;
          const precioPorPie = Number(p.precioPorPie) || 0;
          const cant = parsedCantidad === "" ? 1 : Number(parsedCantidad) || 1;
          let base = calcularPrecioMachimbre({
            alto,
            largo,
            cantidad: cant,
            precioPorPie,
          });
          const final = p.cepilladoAplicado ? base * 1.066 : base;
          const precioRedondeado = Math.round(final / 100) * 100;
          return { ...p, cantidad: parsedCantidad, precio: precioRedondeado };
        }
        return { ...p, cantidad: parsedCantidad };
      })
    );
  };

  const handlePrecioPorPieChange = (id, nuevo) => {
    const parsed = parseNumericValue(nuevo);
    setItemsCatalogo((prev) =>
      prev.map((p) => {
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
          base = calcularPrecioMachimbre({
            alto,
            largo,
            cantidad,
            precioPorPie,
          });
        } else {
          base = calcularPrecioCorteMadera({
            alto,
            ancho,
            largo,
            precioPorPie,
          });
        }
        const final = p.cepilladoAplicado ? base * 1.066 : base;
        const precioRedondeado = Math.round(final / 100) * 100;
        return { ...p, precioPorPie: parsed, precio: precioRedondeado };
      })
    );
  };

  const handleAltoChange = (id, nuevo) => {
    const parsed = parseNumericValue(nuevo);
    setItemsCatalogo((prev) =>
      prev.map((p) => {
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
          base = calcularPrecioMachimbre({
            alto,
            largo,
            cantidad,
            precioPorPie,
          });
        } else {
          base = calcularPrecioCorteMadera({
            alto,
            ancho,
            largo,
            precioPorPie,
          });
        }
        const final = p.cepilladoAplicado ? base * 1.066 : base;
        const precioRedondeado = Math.round(final / 100) * 100;
        return { ...p, alto: parsed, precio: precioRedondeado };
      })
    );
  };

  const handleAnchoChange = (id, nuevo) => {
    const parsed = parseNumericValue(nuevo);
    setItemsCatalogo((prev) =>
      prev.map((p) => {
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
        const base = calcularPrecioCorteMadera({
          alto,
          ancho,
          largo,
          precioPorPie,
        });
        const final = p.cepilladoAplicado ? base * 1.066 : base;
        const precioRedondeado = Math.round(final / 100) * 100;
        return { ...p, ancho: parsed, precio: precioRedondeado };
      })
    );
  };

  const handleLargoChange = (id, nuevo) => {
    const parsed = parseNumericValue(nuevo);
    setItemsCatalogo((prev) =>
      prev.map((p) => {
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
          base = calcularPrecioMachimbre({
            alto,
            largo,
            cantidad,
            precioPorPie,
          });
        } else {
          base = calcularPrecioCorteMadera({
            alto,
            ancho,
            largo,
            precioPorPie,
          });
        }
        const final = p.cepilladoAplicado ? base * 1.066 : base;
        const precioRedondeado = Math.round(final / 100) * 100;
        return { ...p, largo: parsed, precio: precioRedondeado };
      })
    );
  };

  const toggleCepillado = (id, aplicar) => {
    setItemsCatalogo((prev) =>
      prev.map((p) => {
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
          base = calcularPrecioMachimbre({
            alto,
            largo,
            cantidad,
            precioPorPie,
          });
        } else {
          base = calcularPrecioCorteMadera({
            alto,
            ancho,
            largo,
            precioPorPie,
          });
        }
        const final = aplicar ? base * 1.066 : base;
        const precioRedondeado = Math.round(final / 100) * 100;
        return { ...p, precio: precioRedondeado, cepilladoAplicado: aplicar };
      })
    );
  };

  const agregarProductoCatalogo = (prod) => {
    const ya = itemsCatalogo.some((x) => x.id === prod.id);
    if (ya) return;

    let precioInicial = Number(prod.valorVenta) || 0;

    // Si es madera, calcular el precio inicial basado en dimensiones
    if (prod.categoria?.toLowerCase() === "maderas") {
      const alto = Number(prod.alto) || 0;
      const ancho = Number(prod.ancho) || 0;
      const largo = Number(prod.largo) || 0;
      const precioPorPie = Number(prod.precioPorPie) || 0;

      if (alto > 0 && largo > 0 && precioPorPie > 0) {
        if (prod.subcategoria === "machimbre" || prod.subcategoria === "deck") {
          // Para machimbre/deck: alto × largo × precioPorPie
          precioInicial = calcularPrecioMachimbre({
            alto,
            largo,
            cantidad: 1,
            precioPorPie,
          });
        } else if (ancho > 0) {
          // Para madera cortada: alto × ancho × largo × precioPorPie × factor
          precioInicial = calcularPrecioCorteMadera({
            alto,
            ancho,
            largo,
            precioPorPie,
          });
        }
        // Redondear a centenas
        precioInicial = Math.round(precioInicial / 100) * 100;
      }
    }

    const nuevo = {
      id: prod.id,
      nombre: prod.nombre,
      categoria: prod.categoria || "",
      subcategoria: prod.subcategoria || "",
      unidad: prod.unidad || "UN",
      cantidad: 1,
      descuento: 0,
      precio: precioInicial,
      valorVenta: Number(prod.valorVenta) || 0,
    };

    if (prod.categoria?.toLowerCase() === "maderas") {
      nuevo.alto = Number(prod.alto) || 0;
      nuevo.ancho = Number(prod.ancho) || 0;
      nuevo.largo = Number(prod.largo) || 0;
      nuevo.precioPorPie = Number(prod.precioPorPie) || 0;
      nuevo.cepilladoAplicado = false;
    }

    setItemsCatalogo((prev) => [...prev, nuevo]);
  };

  const quitarProductoCatalogo = (id) => {
    setItemsCatalogo((prev) => prev.filter((p) => p.id !== id));
  };

  const actualizarCantidadProductoCatalogo = (id, cantidad) => {
    handleCantidadChange(id, cantidad);
  };

  const actualizarDescuento = (id, descuento) => {
    setItemsCatalogo((prev) =>
      prev.map((p) =>
        p.id === id ? { ...p, descuento: Number(descuento) || 0 } : p
      )
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Cargando obra...</p>
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

  if (!obra || obra.tipo !== "obra") {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-yellow-600 text-6xl mb-4">🏗️</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            No es una obra
          </h1>
          <p className="text-gray-600">Esta página solo muestra obras</p>
          {obra?.tipo === "presupuesto" && (
            <Button
              onClick={() => router.push(`/${lang}/obras/presupuesto/${id}`)}
              className="mt-4"
            >
              Ver como Presupuesto
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <ObraHeader
        obra={obra}
        editando={editando}
        onToggleEdit={handleToggleEdit}
        onPrint={handlePrint}
        showBackButton={true}
        backUrl={`/${lang}/obras`}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* PRIMER BLOQUE: Cliente, Dirección, Estado, Fechas */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <User className="w-5 h-5" />
                  Información Principal
                </div>
                {!editando && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowFormularioCliente(true)}
                    className="flex items-center gap-2"
                  >
                    <Edit className="w-4 h-4" />
                    Cambiar Cliente
                  </Button>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Cliente */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Cliente</label>
                {obra?.cliente ? (
                  <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <p className="font-medium text-gray-900">{obra.cliente.nombre || "Sin nombre"}</p>
                    {obra.cliente.telefono && (
                      <p className="text-sm text-gray-600 mt-1">Tel: {obra.cliente.telefono}</p>
                    )}
                  </div>
                ) : (
                  <p className="text-gray-500 text-sm">No hay cliente asignado</p>
                )}
              </div>

              {/* Dirección */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                  <MapPin className="w-4 h-4" />
                  Dirección
                </label>
                {obra?.ubicacion?.direccion || obra?.cliente?.direccion ? (
                  <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <p className="text-sm text-gray-900">
                      {obra.ubicacion?.direccion || obra.cliente?.direccion || ""}
                      {obra.ubicacion?.localidad || obra.cliente?.localidad ? (
                        <span>, {obra.ubicacion?.localidad || obra.cliente?.localidad}</span>
                      ) : null}
                      {obra.ubicacion?.provincia || obra.cliente?.provincia ? (
                        <span>, {obra.ubicacion?.provincia || obra.cliente?.provincia}</span>
                      ) : null}
                    </p>
                    {(obra.ubicacion?.barrio || obra.cliente?.barrio || obra.ubicacion?.lote || obra.cliente?.lote) && (
                      <div className="flex gap-4 text-xs text-gray-600 mt-1">
                        {obra.ubicacion?.barrio || obra.cliente?.barrio ? (
                          <span>Barrio: {obra.ubicacion?.barrio || obra.cliente?.barrio}</span>
                        ) : null}
                        {obra.ubicacion?.lote || obra.cliente?.lote ? (
                          <span>Lote: {obra.ubicacion?.lote || obra.cliente?.lote}</span>
                        ) : null}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-gray-500 text-sm">No hay dirección especificada</p>
                )}
              </div>

              {/* Estado y Fechas en grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Estado */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Estado</label>
                  {editando ? (
                    <Select value={estadoObra} onValueChange={setEstadoObra}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pendiente_inicio">Pendiente Inicio</SelectItem>
                        <SelectItem value="en_ejecucion">En Ejecución</SelectItem>
                        <SelectItem value="pausada">Pausada</SelectItem>
                        <SelectItem value="completada">Completada</SelectItem>
                        <SelectItem value="cancelada">Cancelada</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge
                      className={
                        estadoObra === "pendiente_inicio"
                          ? "bg-yellow-100 text-yellow-800"
                          : estadoObra === "en_ejecucion"
                          ? "bg-blue-100 text-blue-800"
                          : estadoObra === "pausada"
                          ? "bg-gray-100 text-gray-800"
                          : estadoObra === "completada"
                          ? "bg-green-100 text-green-800"
                          : "bg-red-100 text-red-800"
                      }
                    >
                      {estadoObra === "pendiente_inicio"
                        ? "Pendiente Inicio"
                        : estadoObra === "en_ejecucion"
                        ? "En Ejecución"
                        : estadoObra === "pausada"
                        ? "Pausada"
                        : estadoObra === "completada"
                        ? "Completada"
                        : "Cancelada"}
                    </Badge>
                  )}
                </div>

                {/* Fecha Inicio */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    Fecha Inicio
                  </label>
                  {editando ? (
                    <Input
                      type="date"
                      value={fechasEdit?.inicio || ""}
                      onChange={(e) =>
                        setFechasEdit({ ...fechasEdit, inicio: e.target.value })
                      }
                    />
                  ) : (
                    <p className="text-sm text-gray-900">
                      {fechasEdit?.inicio || obra?.fechas?.inicio
                        ? formatearFecha(fechasEdit?.inicio || obra.fechas.inicio)
                        : "No especificada"}
                    </p>
                  )}
                </div>

                {/* Fecha Fin (opcional) */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">
                    Fecha Fin <span className="text-gray-400 text-xs">(opcional)</span>
                  </label>
                  {editando ? (
                    <Input
                      type="date"
                      value={fechasEdit?.fin || ""}
                      onChange={(e) =>
                        setFechasEdit({ ...fechasEdit, fin: e.target.value || null })
                      }
                      min={fechasEdit?.inicio || obra?.fechas?.inicio}
                    />
                  ) : (
                    <p className="text-sm text-gray-900">
                      {fechasEdit?.fin || obra?.fechas?.fin
                        ? formatearFecha(fechasEdit?.fin || obra.fechas.fin)
                        : "No especificada"}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* SEGUNDO BLOQUE: Pagos / cobranzas, Saldo, Acciones rápidas */}
          <ObraCobranza
            movimientos={movimientos}
            onMovimientosChange={setMovimientos}
            editando={editando}
            formatearNumeroArgentino={formatearNumeroArgentino}
            totalObra={
              typeof obra?.total === "number" && !Number.isNaN(obra.total)
                ? obra.total
                : (modoCosto === "presupuesto" && presupuesto
                ? presupuesto.total
                  : obra.gastoObraManual)
            }
            totalAbonado={movimientos.reduce(
              (acc, m) =>
                m.tipo === "pago" ? acc + Number(m.monto || 0) : acc,
              0
            )}
            onEstadoPagoChange={(estaPagado) => {
              // Aquí podrías actualizar el estado de la obra si es necesario
              console.log(
                "Estado de pago:",
                estaPagado ? "PAGADO" : "PENDIENTE"
              );
            }}
          />
          {/* TERCER BLOQUE: Materiales / productos (editables inline) */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Materiales y Productos</h3>
            
            {/* Selector de Materiales del Catálogo */}
            <CatalogoVentas
              titulo="Materiales a Utilizar"
              productos={productosCatalogo}
              productosPorCategoria={productosPorCategoria}
              categorias={categorias}
              itemsSeleccionados={itemsCatalogo}
              onAgregarProducto={agregarProductoCatalogo}
              onAgregarProductoManual={() => {}}
              onActualizarCantidad={actualizarCantidadProductoCatalogo}
              onQuitarProducto={quitarProductoCatalogo}
              editando={editando}
              maxProductos={48}
              showFilters={true}
              showSearch={true}
              showPagination={true}
              productosPorPagina={12}
            />

            {/* Tabla de Materiales Seleccionados */}
            <TablaProductosVentas
              titulo="Materiales Seleccionados"
              items={itemsCatalogo}
              editando={editando}
              onQuitarProducto={quitarProductoCatalogo}
              onActualizarCampo={(id, campo, valor) => {
                if (campo === "cantidad") handleCantidadChange(id, valor);
                else if (campo === "alto") handleAltoChange(id, valor);
                else if (campo === "ancho") handleAnchoChange(id, valor);
                else if (campo === "largo") handleLargoChange(id, valor);
                else if (campo === "precioPorPie")
                  handlePrecioPorPieChange(id, valor);
                else if (campo === "cepilladoAplicado")
                  toggleCepillado(id, valor);
                else if (campo === "descuento") actualizarDescuento(id, valor);
              }}
              onActualizarNombreManual={() => {}}
              formatearNumeroArgentino={formatearNumeroArgentino}
              showTotals={true}
              showDescripcionGeneral={false}
            />
          </div>

          {/* CUARTO BLOQUE: Documentación, Notas, Campos secundarios (colapsable) */}
          <Card>
            <CardHeader>
              <CardTitle 
                className="flex items-center justify-between cursor-pointer"
                onClick={() => setShowCamposSecundarios(!showCamposSecundarios)}
              >
                <span>Información Adicional</span>
                {showCamposSecundarios ? (
                  <ChevronUp className="w-5 h-5" />
                ) : (
                  <ChevronDown className="w-5 h-5" />
                )}
              </CardTitle>
            </CardHeader>
            {showCamposSecundarios && (
              <CardContent className="space-y-6">
                {/* Documentación */}
                <ObraDocumentacion
                  docLinks={docLinks}
                  onDocLinksChange={setDocLinks}
                  editando={editando}
                />

                {/* Presupuesto Inicial (si existe) */}
                {presupuesto && (
                  <div className="space-y-4">
                    <h4 className="font-medium text-gray-900">Presupuesto Inicial</h4>
                    <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-blue-900">
                            Presupuesto Vinculado: {presupuesto.numeroPedido}
                          </p>
                          <p className="text-sm text-blue-700 mt-1">
                            Total: ${formatearNumeroArgentino(presupuesto.total || 0)}
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => router.push(`/${lang}/obras/presupuesto/${presupuesto.id}`)}
                        >
                          Ver Presupuesto
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Información de envío (si existe) */}
                {obra.tipoEnvio && obra.tipoEnvio !== "retiro_local" && (
                  <div className="space-y-4">
                    <h4 className="font-medium text-gray-900">Información de Envío</h4>
                    <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 space-y-2">
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
                          <p className="font-medium">{formatearFecha(obra.fechaEntrega)}</p>
                        </div>
                      )}
                      {obra.rangoHorario && (
                        <div>
                          <p className="text-sm text-gray-500">Rango Horario</p>
                          <p className="font-medium">{obra.rangoHorario}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            )}
          </Card>
        </div>

        {/* Barra lateral - Solo Resumen Financiero */}
        <div className="space-y-6">
          <ObraResumenFinanciero
            obra={obra}
            presupuesto={presupuesto}
            modoCosto={modoCosto}
            formatearNumeroArgentino={formatearNumeroArgentino}
          />
        </div>
      </div>

      {/* Modal: Vista previa de impresión */}
      <Dialog open={openPrint} onOpenChange={setOpenPrint}>
        <DialogContent className="max-w-6xl max-h-[90vh] w-full">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Printer className="w-5 h-5" />
              Vista Previa de Impresión - Obra
            </DialogTitle>
            <DialogDescription>
              Revise el documento antes de imprimir. Use los botones de acción
              para imprimir, descargar PDF o cerrar.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0">
            <iframe
              srcDoc={generarContenidoImpresion(obra, presupuesto, modoCosto)}
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
              presupuesto={presupuesto}
              modoCosto={modoCosto}
              movimientos={movimientos}
              variant="default"
              size="sm"
            />
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

export default ObraDetallePage;
