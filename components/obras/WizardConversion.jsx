"use client";
import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@iconify/react";
import {
  ChevronRight,
  ChevronLeft,
  Building,
  MapPin,
  Calendar,
  FileText,
  User,
  Loader2,
  CheckCircle,
  X,
  Edit,
  Plus,
  Phone,
} from "lucide-react";
import { db } from "@/lib/firebase";
import { collection, addDoc, serverTimestamp, doc, getDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";
import SelectorClienteObras from "./SelectorClienteObras";
import { getNextObraNumber } from "@/lib/obra-numbering";

const opcionActiva = (valor) =>
  valor === true || valor === 1 || valor === "1" || valor === "true";

const precioLineaProducto = (producto = {}) => {
  const precio = Math.max(0, Number(producto.precio) || 0);
  const cantidad = Math.max(1, Number(producto.cantidad) || 1);
  const esMadera = String(producto.categoria || "").toLowerCase() === "maderas";
  const subcategoria = String(
    producto.subcategoria || producto.subCategoria || ""
  ).toLowerCase();
  const esMachimbreODeck =
    esMadera && (subcategoria === "machimbre" || subcategoria === "deck");

  if (producto.precioIncluyeCantidad === false) {
    return esMachimbreODeck ? precio : precio * cantidad;
  }
  return precio;
};

const calcularResumenBloque = (fuente = {}) => {
  const productos = Array.isArray(fuente.productos) ? fuente.productos : [];
  const subtotal = productos.reduce(
    (acumulado, producto) => acumulado + precioLineaProducto(producto),
    0
  );
  const descuentoTotal = productos.reduce((acumulado, producto) => {
    const descuento = Math.min(
      100,
      Math.max(0, Number(producto.descuento) || 0)
    );
    return acumulado + precioLineaProducto(producto) * (descuento / 100);
  }, 0);
  const descuentoEfectivo = Math.max(
    0,
    Number(fuente.descuentoEfectivo) || 0
  );
  const base = Math.max(0, subtotal - descuentoTotal - descuentoEfectivo);
  const aplicarIva = opcionActiva(fuente.aplicarIva ?? fuente.aplicaIva);
  const ivaPorcentaje = Math.max(0, Number(fuente.ivaPorcentaje) || 0);
  const ivaMonto = aplicarIva
    ? Math.round(base * (ivaPorcentaje / 100))
    : 0;
  const aplicarTransferencia = opcionActiva(
    fuente.aplicarTransferencia ?? fuente.aplicaTransferencia
  );
  const transferenciaPorcentaje = Math.max(
    0,
    Number(fuente.transferenciaPorcentaje) || 0
  );
  const transferenciaMonto = aplicarTransferencia
    ? Math.round(base * (transferenciaPorcentaje / 100))
    : 0;
  const adicionales = ivaMonto + transferenciaMonto;

  return {
    subtotal: Math.round(subtotal),
    descuentoTotal: Math.round(descuentoTotal),
    descuentoEfectivo: Math.round(descuentoEfectivo),
    base: Math.round(base),
    aplicarIva,
    ivaPorcentaje,
    ivaMonto,
    aplicarTransferencia,
    transferenciaPorcentaje,
    transferenciaMonto,
    adicionales,
    total: Math.round(base + adicionales),
  };
};

const WizardConversion = ({
  presupuesto,
  open,
  onClose,
  user,
  lang,
  onSuccess,
}) => {
  const router = useRouter();
  const [pasoActual, setPasoActual] = useState(1);
  const [convirtiendo, setConvirtiendo] = useState(false);
  const [error, setError] = useState("");

  // Estado para gestión de cliente
  const [clienteConfirmado, setClienteConfirmado] = useState(null); // Cliente que se usará en la obra
  const [clienteConfirmadoExplicitamente, setClienteConfirmadoExplicitamente] = useState(false); // Flag para saber si el usuario confirmó explícitamente
  const [opcionCliente, setOpcionCliente] = useState("confirmar"); // "confirmar" o "cambiar" - predeterminado: confirmar
  const [showFormularioCliente, setShowFormularioCliente] = useState(false);
  const [clienteConfirmadoId, setClienteConfirmadoId] = useState(null);
  const clienteSeleccionadoEnSelectorRef = useRef(false);

  // Estados del wizard
  const [datos, setDatos] = useState({
    bloqueSeleccionado: "",
    ubicacionTipo: "cliente", // "cliente" o "nueva"
    direccion: "",
    localidad: "",
    provincia: "",
    barrio: "",
    area: "",
    lote: "",
    fechaInicio: "",
    fechaFin: "",
    descripcionGeneral: "",
  });

  // Inicializar datos cuando se abre el wizard
  useEffect(() => {
    if (presupuesto && open) {
      const hoy = new Date().toISOString().split("T")[0];

      // Inicializar con opción predeterminada: confirmar cliente actual
      setOpcionCliente("confirmar");
      
      // Confirmar automáticamente el cliente del presupuesto si existe
      if (presupuesto.cliente || presupuesto.clienteId) {
        setClienteConfirmado(presupuesto.cliente || null);
        setClienteConfirmadoId(presupuesto.clienteId || null);
        setClienteConfirmadoExplicitamente(true);
      } else {
        setClienteConfirmado(null);
        setClienteConfirmadoId(null);
        setClienteConfirmadoExplicitamente(false);
      }
      
      setShowFormularioCliente(false);
      clienteSeleccionadoEnSelectorRef.current = false;

      setDatos({
        bloqueSeleccionado: presupuesto.bloques?.length > 0 ? presupuesto.bloques[0].id : "",
        ubicacionTipo: "cliente",
        direccion: presupuesto.cliente?.direccion || "",
        localidad: presupuesto.cliente?.localidad || "",
        provincia: presupuesto.cliente?.provincia || "",
        barrio: presupuesto.cliente?.barrio || "",
        area: presupuesto.cliente?.area || "",
        lote: presupuesto.cliente?.lote || "",
        fechaInicio: hoy,
        fechaFin: "", // Eliminado del wizard
        descripcionGeneral: presupuesto.descripcionGeneral || "",
      });
      setPasoActual(1);
      setError("");
    }
  }, [presupuesto, open]);

  // Handler para cuando se selecciona un cliente (existente o nuevo)
  const handleClienteSeleccionado = async (clienteId, clienteData) => {
    // El selector puede cerrarse antes de que React procese los setState. Esta marca
    // preserva la intención del usuario aunque haya renders pendientes.
    clienteSeleccionadoEnSelectorRef.current = true;
    setClienteConfirmadoId(clienteId);
    setClienteConfirmado(clienteData);
    setClienteConfirmadoExplicitamente(true); // Marcar como confirmado explícitamente
    setOpcionCliente("cambiar"); // Cambiar a opción "cambiar" ya que se seleccionó un cliente diferente
    setShowFormularioCliente(false);
    setError(""); // Limpiar errores
    
    // Si el cliente tiene direccion/localidad, actualizar datos de ubicación
    if (clienteData.direccion || clienteData.localidad) {
      setDatos(prev => ({
        ...prev,
        direccion: clienteData.direccion || prev.direccion,
        localidad: clienteData.localidad || prev.localidad,
        provincia: clienteData.provincia || prev.provincia,
        barrio: clienteData.barrio || prev.barrio,
        lote: clienteData.lote || prev.lote,
      }));
    }
  };

  // Manejar cambio de opción de cliente
  const handleOpcionClienteChange = (opcion) => {
    setError(""); // Limpiar errores anteriores
    if (opcion === "confirmar") {
      clienteSeleccionadoEnSelectorRef.current = false;
      setOpcionCliente("confirmar");
      // Confirmar cliente actual automáticamente
      if (presupuesto?.cliente || presupuesto?.clienteId) {
        setClienteConfirmado(presupuesto.cliente || null);
        setClienteConfirmadoId(presupuesto.clienteId || null);
        setClienteConfirmadoExplicitamente(true);
        setShowFormularioCliente(false);
      } else {
        setError("El presupuesto no tiene un cliente asociado. Por favor seleccione 'Cambiar / Cargar cliente'.");
        setClienteConfirmadoExplicitamente(false);
      }
    } else {
      // No se marca el cambio hasta que el usuario haya elegido realmente un cliente.
      clienteSeleccionadoEnSelectorRef.current = false;
      setShowFormularioCliente(true);
    }
  };

  const cerrarSelectorCliente = () => {
    setShowFormularioCliente(false);
    if (clienteSeleccionadoEnSelectorRef.current) {
      clienteSeleccionadoEnSelectorRef.current = false;
      return;
    }
    const clienteOriginalId = presupuesto?.clienteId || presupuesto?.cliente?.id || null;
    if (!clienteConfirmadoId || clienteConfirmadoId === clienteOriginalId) {
      setOpcionCliente("confirmar");
    }
  };

  // Validar paso 1
  const validarPaso1 = () => {
    // Validar que el cliente fue confirmado explícitamente
    if (!clienteConfirmadoExplicitamente || (!clienteConfirmado && !clienteConfirmadoId)) {
      setError("Por favor confirme o seleccione un cliente");
      return false;
    }
    
    // Validar el bloque que se convertirá. Nunca se combinan alternativas.
    if (presupuesto?.bloques && presupuesto.bloques.length > 0) {
      if (!datos.bloqueSeleccionado) {
        setError("Por favor seleccione un bloque");
        return false;
      }
      const bloqueElegido = presupuesto.bloques.find(
        (bloque) => bloque.id === datos.bloqueSeleccionado
      );
      if (!bloqueElegido || !Array.isArray(bloqueElegido.productos) || bloqueElegido.productos.length === 0) {
        setError("El bloque seleccionado no tiene productos para convertir");
        return false;
      }
    } else if (!Array.isArray(presupuesto?.productos) || presupuesto.productos.length === 0) {
      setError("El presupuesto no tiene productos para convertir");
      return false;
    }
    return true;
  };

  // Validar paso 2
  const validarPaso2 = () => {
    if (datos.ubicacionTipo === "nueva") {
      if (!datos.direccion || !datos.localidad || !datos.provincia) {
        setError("Por favor complete todos los campos de ubicación obligatorios");
        return false;
      }
    }
    if (!datos.fechaInicio) {
      setError("Por favor complete la fecha de inicio");
      return false;
    }
    return true;
  };

  // Avanzar al siguiente paso
  const handleSiguiente = () => {
    setError("");
    if (pasoActual === 1) {
      if (validarPaso1()) {
        setPasoActual(2);
      }
    }
  };

  // Retroceder al paso anterior
  const handleAnterior = () => {
    setError("");
    if (pasoActual === 2) {
      setPasoActual(1);
    }
  };

  // Convertir presupuesto a obra
  const handleConvertir = async () => {
    if (!validarPaso2()) return;

    try {
      setConvirtiendo(true);
      setError("");

      const numeroPedido = await getNextObraNumber();

      // Sanitizar productos del bloque seleccionado
      const sanitizarProductos = (lista) =>
        (Array.isArray(lista) ? lista : []).map((p) => {
          const precio = Number(p.precio) || 0;
          const cantidad = Number(p.cantidad) || 1;
          const descuento = Math.min(
            100,
            Math.max(0, Number(p.descuento) || 0)
          );
          const base = precioLineaProducto(p);
          const subtotal = Math.round(base * (1 - descuento / 100));
          const item = {
            id: p.id,
            originalId: p.originalId || p.id,
            nombre: p.nombre || "",
            categoria: p.categoria || "",
            subCategoria: p.subCategoria || p.subcategoria || "",
            subcategoria: p.subcategoria || p.subCategoria || "",
            unidad: p.unidad || p.unidadMedida || "",
            unidadMedida: p.unidadMedida || p.unidad || "",
            cantidad,
            descuento,
            precio,
            valorVenta: Number(p.valorVenta) || 0,
            precioIncluyeCantidad: true,
            subtotal,
            descripcion: p.descripcion || p.description || "",
          };
          if (p.alto !== undefined) item.alto = Number(p.alto) || 0;
          if (p.ancho !== undefined) item.ancho = Number(p.ancho) || 0;
          if (p.largo !== undefined || p.largoNum !== undefined) {
            item.largo = Number(p.largo ?? p.largoNum) || 0;
            item.largoNum = item.largo;
          }
          if (p.m2 !== undefined) item.m2 = Number(p.m2) || 0;
          if (p.ml !== undefined) item.ml = Number(p.ml) || 0;
          if (p.precioPorPie !== undefined) item.precioPorPie = Number(p.precioPorPie) || 0;
          if (p.cepilladoAplicado !== undefined) item.cepilladoAplicado = !!p.cepilladoAplicado;
          return item;
        });

      let productosObraSanitizados = [];
      let bloqueSeleccionadoNombre = null;
      let bloqueSeleccionadoDatos = null;

      // Si hay bloques y se seleccionó uno específico
      if (presupuesto.bloques && presupuesto.bloques.length > 0 && datos.bloqueSeleccionado) {
        const bloqueSeleccionado = presupuesto.bloques.find(b => b.id === datos.bloqueSeleccionado);
        if (bloqueSeleccionado) {
          bloqueSeleccionadoDatos = bloqueSeleccionado;
          productosObraSanitizados = sanitizarProductos(bloqueSeleccionado.productos || []);
          bloqueSeleccionadoNombre = bloqueSeleccionado.nombre || null;
        }
      } else {
        // Fallback para presupuestos sin bloques (estructura antigua)
        productosObraSanitizados = sanitizarProductos(presupuesto.productos || []);
      }

      // NO hay materiales adicionales en el wizard (según requisitos)
      const materialesSanitizados = [];

      // Calcular exclusivamente desde el bloque seleccionado. No se consultan
      // ni se acumulan los totales de los demás bloques del presupuesto.
      const fuenteCondiciones = bloqueSeleccionadoDatos || presupuesto;
      const resumenSeleccionado = calcularResumenBloque(fuenteCondiciones);
      const productosObraSubtotal = resumenSeleccionado.subtotal;
      const productosObraDescuento = resumenSeleccionado.descuentoTotal;
      const subtotalCombinado = resumenSeleccionado.subtotal;
      const descuentoTotalCombinado = resumenSeleccionado.descuentoTotal;
      const descuentoEfectivoCombinado = resumenSeleccionado.descuentoEfectivo;
      const baseCombinada = resumenSeleccionado.base;
      const aplicaIvaPres = resumenSeleccionado.aplicarIva;
      const ivaPorcentajePres = resumenSeleccionado.ivaPorcentaje;
      const ivaMontoPres = resumenSeleccionado.ivaMonto;
      const aplicaTransfPres = resumenSeleccionado.aplicarTransferencia;
      const transfPorcentajePres = resumenSeleccionado.transferenciaPorcentaje;
      const transfMontoPres = resumenSeleccionado.transferenciaMonto;
      const totalCombinado = resumenSeleccionado.total;

      // Usar cliente confirmado explícitamente o el del presupuesto como fallback
      const clienteFinal = clienteConfirmadoExplicitamente 
        ? (clienteConfirmado || presupuesto.cliente || null)
        : (presupuesto.cliente || null);
      const clienteIdFinal = clienteConfirmadoExplicitamente
        ? (clienteConfirmadoId || presupuesto.clienteId || presupuesto.cliente?.id || null)
        : (presupuesto.clienteId || presupuesto.cliente?.id || null);

      // Construir ubicación usando cliente confirmado o el del presupuesto
      const clienteParaUbicacion = clienteFinal || presupuesto.cliente || {};
      const ubicacion = datos.ubicacionTipo === "cliente" ? {
        direccion: clienteParaUbicacion.direccion || "",
        localidad: clienteParaUbicacion.localidad || "",
        provincia: clienteParaUbicacion.provincia || "",
        barrio: clienteParaUbicacion.barrio || "",
        area: clienteParaUbicacion.area || "",
        lote: clienteParaUbicacion.lote || "",
      } : {
        direccion: datos.direccion || "",
        localidad: datos.localidad || "",
        provincia: datos.provincia || "",
        barrio: datos.barrio || "",
        area: datos.area || "",
        lote: datos.lote || "",
      };

      const nuevaObra = {
        tipo: "obra",
        numeroPedido,
        fecha: new Date().toISOString().split("T")[0],
        clienteId: clienteIdFinal,
        cliente: clienteFinal,
        productos: productosObraSanitizados,
        materialesCatalogo: materialesSanitizados,
        subtotal: subtotalCombinado,
        descuentoTotal: descuentoTotalCombinado,
        descuentoEfectivo: descuentoEfectivoCombinado,
        baseImponible: Math.round(baseCombinada),
        adicionalesTotal: ivaMontoPres + transfMontoPres,
        total: totalCombinado,
        aplicarIva: aplicaIvaPres,
        aplicaIva: aplicaIvaPres,
        ivaPorcentaje: ivaPorcentajePres,
        ivaMonto: ivaMontoPres,
        aplicarTransferencia: aplicaTransfPres,
        aplicaTransferencia: aplicaTransfPres,
        transferenciaPorcentaje: transfPorcentajePres,
        transferenciaMonto: transfMontoPres,
        descripcionGeneral:
          datos.descripcionGeneral ||
          bloqueSeleccionadoDatos?.descripcion ||
          presupuesto.descripcionGeneral ||
          "",
        fechaCreacion: new Date().toISOString(),
        estado: "pendiente_inicio",
        presupuestoInicialId: presupuesto.id,
        presupuestoInicialBloqueId: datos.bloqueSeleccionado || null,
        presupuestoInicialBloqueNombre: bloqueSeleccionadoNombre,
        ubicacion,
        fechas: {
          inicio: datos.fechaInicio,
          fin: null, // Fecha fin no se establece en el wizard, solo en edición
        },
        gastoObraManual: 0,
        materialesSubtotal: 0,
        materialesDescuento: 0,
        materialesTotal: 0,
        productosSubtotal: productosObraSubtotal,
        productosDescuento: productosObraDescuento,
        productosTotal: productosObraSubtotal - productosObraDescuento,
        usarDireccionCliente: datos.ubicacionTipo === "cliente",
      };

      // Crear obra en Firestore
      const created = await addDoc(collection(db, "obras"), nuevaObra);

      // Crear registro de auditoría
      const auditoriaData = {
        accion: 'CONVERSION_PRESUPUESTO_A_OBRA',
        coleccion: 'obras',
        documentoId: created.id,
        presupuestoOriginalId: presupuesto.id,
        datosPresupuesto: presupuesto,
        datosObra: nuevaObra,
        usuarioId: user?.uid || 'sistema',
        usuarioEmail: user?.email || 'sistema@audit.com',
        fechaConversion: serverTimestamp(),
        tipo: 'conversion_presupuesto_obra'
      };

      await addDoc(collection(db, "auditoria"), auditoriaData);

      // Cerrar wizard
      onClose();

      // Llamar callback de éxito si existe
      if (onSuccess) {
        onSuccess(created.id, nuevaObra);
      }

      // Mostrar mensaje de éxito (toast)
      // El componente padre puede manejar esto o podemos usar un toast library
      
    } catch (error) {
      console.error("Error al convertir presupuesto a obra:", error);
      setError(`Error: ${error.message || "Error al convertir el presupuesto"}`);
    } finally {
      setConvirtiendo(false);
    }
  };

  if (!presupuesto) return null;

  const tieneBloques = presupuesto.bloques && presupuesto.bloques.length > 0;
  const totalBloques = presupuesto.bloques?.length || 0;
  const bloqueSeleccionadoVista = tieneBloques
    ? presupuesto.bloques.find((bloque) => bloque.id === datos.bloqueSeleccionado) || presupuesto.bloques[0]
    : null;
  const condicionesVista = bloqueSeleccionadoVista || presupuesto;
  const resumenBloqueVista = calcularResumenBloque(condicionesVista);
  const aplicaIvaPresupuesto = resumenBloqueVista.aplicarIva;
  const aplicaTransfPresupuesto = resumenBloqueVista.aplicarTransferencia;
  const ivaPctPresupuesto = resumenBloqueVista.ivaPorcentaje;
  const transfPctPresupuesto = resumenBloqueVista.transferenciaPorcentaje;
  const ivaMontoPresupuesto = resumenBloqueVista.ivaMonto;
  const transfMontoPresupuesto = resumenBloqueVista.transferenciaMonto;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="w-[96vw] max-w-3xl max-h-[88vh] overflow-hidden flex flex-col p-0 rounded-2xl">
        <DialogHeader className="border-b pb-4 px-6 pt-6 bg-gradient-to-r from-purple-50 to-indigo-50">
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-md">
              <Building className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <DialogTitle className="text-lg font-bold tracking-tight text-gray-900 mb-0.5">
                Crear obra desde presupuesto
              </DialogTitle>
              <DialogDescription className="text-xs text-gray-600">
                <span className="font-semibold">{presupuesto.numeroPedido || "Sin número"}</span>
                {presupuesto.cliente?.nombre && (
                  <>
                    {" · "}
                    <span className="text-gray-600">{presupuesto.cliente.nombre}</span>
                  </>
                )}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Indicador de pasos mejorado */}
        <div className="px-6 pt-4 pb-3 bg-white">
          <div className="flex items-center justify-between max-w-2xl mx-auto">
            <div className={`flex items-center gap-3 flex-1 ${pasoActual >= 1 ? "text-blue-600" : "text-gray-400"}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all ${
                pasoActual >= 1 
                  ? "bg-blue-600 text-white shadow-lg scale-110" 
                  : "bg-gray-200 text-gray-500"
              }`}>
                {pasoActual > 1 ? <CheckCircle className="w-4 h-4" /> : "1"}
              </div>
              <div className="flex-1">
                <p className={`text-xs font-semibold ${pasoActual >= 1 ? "text-blue-600" : "text-gray-500"}`}>
                  Selección
                </p>
                <p className="text-xs text-gray-500">Cliente y Bloque</p>
              </div>
            </div>
            <div className={`flex-1 h-0.5 mx-3 rounded-full transition-all ${
              pasoActual >= 2 ? "bg-blue-600" : "bg-gray-200"
            }`} />
            <div className={`flex items-center gap-3 flex-1 ${pasoActual >= 2 ? "text-blue-600" : "text-gray-400"}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all ${
                pasoActual >= 2 
                  ? "bg-blue-600 text-white shadow-lg scale-110" 
                  : "bg-gray-200 text-gray-500"
              }`}>
                2
              </div>
              <div className="flex-1">
                <p className={`text-xs font-semibold ${pasoActual >= 2 ? "text-blue-600" : "text-gray-500"}`}>
                  Configuración
                </p>
                <p className="text-xs text-gray-500">Ubicación y Fechas</p>
              </div>
            </div>
          </div>
        </div>

        {/* Contenedor principal con scroll */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {/* Mensaje de error */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 rounded-lg text-red-800 text-sm shadow-sm">
              <div className="flex items-center gap-2">
                <X className="w-5 h-5" />
                <span className="font-medium">{error}</span>
              </div>
            </div>
          )}

          {/* Paso 1: Cliente + Bloque (misma pantalla) */}
          {pasoActual === 1 && (
            <div className="space-y-4 max-w-4xl mx-auto">
              <div className="mb-4">
                <h3 className="text-base font-bold text-gray-900 mb-1 flex items-center gap-2.5">
                  <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                    <FileText className="w-4 h-4 text-blue-600" />
                  </div>
                  <span>Paso 1: Cliente y Bloque</span>
                </h3>
                <p className="text-xs text-gray-600 ml-10">
                  Confirma el cliente y selecciona el bloque a convertir
                </p>
              </div>

              {/* Sección Cliente */}
              <div className="space-y-3 p-4 bg-gradient-to-br from-gray-50 to-white rounded-xl border border-gray-200 shadow-sm">
                <label className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                    <User className="w-4 h-4 text-blue-600" />
                  </div>
                  Cliente
                </label>
                
                {/* Mostrar cliente actual del presupuesto */}
                <div className="grid gap-3 lg:grid-cols-2">
                  <div className="p-3 bg-white rounded-lg border border-gray-200 shadow-sm">
                    <p className="font-semibold text-base text-gray-900 mb-1">
                      {(clienteConfirmado?.nombre || presupuesto.cliente?.nombre || "Sin cliente").toUpperCase()}
                    </p>
                    {(clienteConfirmado?.telefono || presupuesto.cliente?.telefono) && (
                      <p className="text-xs text-gray-600 flex items-center gap-1.5 mt-1">
                        <Phone className="w-3.5 h-3.5" />
                        {clienteConfirmado?.telefono || presupuesto.cliente.telefono}
                      </p>
                    )}
                    {(clienteConfirmado?.direccion || presupuesto.cliente?.direccion) && (
                      <p className="text-xs text-gray-600 flex items-center gap-1.5 mt-1">
                        <MapPin className="w-3.5 h-3.5" />
                        {clienteConfirmado?.direccion || presupuesto.cliente.direccion}
                        {(clienteConfirmado?.localidad || presupuesto.cliente?.localidad) && `, ${clienteConfirmado?.localidad || presupuesto.cliente.localidad}`}
                      </p>
                    )}
                  </div>

                  {/* Switches de opción de cliente */}
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-gray-700 mb-1 block">
                      Opción de Cliente <span className="text-red-500">*</span>
                    </label>
                    <div className="grid gap-2">
                      <label className={`flex items-start space-x-3 p-3 border rounded-lg cursor-pointer transition-all ${
                        opcionCliente === "confirmar" 
                          ? "border-blue-500 bg-blue-50 shadow-md" 
                          : "border-gray-200 hover:border-blue-300 hover:bg-gray-50"
                      }`}>
                        <input
                          type="radio"
                          name="opcionCliente"
                          value="confirmar"
                          checked={opcionCliente === "confirmar"}
                          onChange={(e) => handleOpcionClienteChange(e.target.value)}
                          className="w-5 h-5 text-blue-600 focus:ring-blue-500 mt-0.5"
                          disabled={convirtiendo}
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <CheckCircle className={`w-4 h-4 ${opcionCliente === "confirmar" ? "text-green-600" : "text-gray-400"}`} />
                            <span className="text-sm font-semibold text-gray-900">Cliente actual</span>
                          </div>
                          <p className="text-xs text-gray-600">
                            Usar el cliente del presupuesto: <span className="font-medium">{presupuesto.cliente?.nombre || "Sin nombre"}</span>
                          </p>
                        </div>
                      </label>
                      <label className={`flex items-start space-x-3 p-3 border rounded-lg cursor-pointer transition-all ${
                        opcionCliente === "cambiar" 
                          ? "border-blue-500 bg-blue-50 shadow-md" 
                          : "border-gray-200 hover:border-blue-300 hover:bg-gray-50"
                      }`}>
                        <input
                          type="radio"
                          name="opcionCliente"
                          value="cambiar"
                          checked={opcionCliente === "cambiar"}
                          onChange={(e) => handleOpcionClienteChange(e.target.value)}
                          className="w-5 h-5 text-blue-600 focus:ring-blue-500 mt-0.5"
                          disabled={convirtiendo}
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <Edit className={`w-4 h-4 ${opcionCliente === "cambiar" ? "text-blue-600" : "text-gray-400"}`} />
                            <span className="text-sm font-semibold text-gray-900">Cambiar cliente</span>
                          </div>
                          <p className="text-xs text-gray-600">
                            {opcionCliente === "cambiar" && clienteConfirmado?.nombre ? `Cliente seleccionado: ${clienteConfirmado.nombre}` : "Seleccionar o crear un cliente para esta obra"}
                          </p>
                        </div>
                      </label>
                    </div>
                  </div>

                </div>
              </div>

              {/* Sección Bloques */}
              {tieneBloques && totalBloques > 1 && (
                <div className="space-y-3 p-4 bg-gradient-to-br from-gray-50 to-white rounded-xl border border-gray-200 shadow-sm">
                  <label className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center">
                      <FileText className="w-4 h-4 text-indigo-600" />
                    </div>
                    Seleccionar Bloque <span className="text-red-500">*</span>
                  </label>
                  {/* Tabs/Pills para bloques */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {presupuesto.bloques.map((bloque) => {
                      const resumenBloque = calcularResumenBloque(bloque);
                      return (
                        <button
                        key={bloque.id}
                        onClick={() => setDatos({ ...datos, bloqueSeleccionado: bloque.id })}
                        className={`p-3 rounded-lg border transition-all text-left ${
                          datos.bloqueSeleccionado === bloque.id
                            ? "bg-gradient-to-br from-blue-600 to-indigo-600 text-white border-blue-600 shadow-lg scale-105"
                            : "bg-white text-gray-700 border-gray-300 hover:border-blue-400 hover:bg-blue-50 hover:shadow-md"
                        }`}
                        disabled={convirtiendo}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <span className="font-semibold text-sm">{bloque.nombre || "Sin nombre"}</span>
                          <Badge
                            variant={datos.bloqueSeleccionado === bloque.id ? "secondary" : "outline"}
                            className={
                              datos.bloqueSeleccionado === bloque.id
                                ? "bg-white text-blue-600 border-white"
                                : "bg-gray-100"
                            }
                          >
                            ${resumenBloque.total.toLocaleString("es-AR", {
                              minimumFractionDigits: 2,
                            })}
                          </Badge>
                        </div>
                        <p className={`text-xs ${datos.bloqueSeleccionado === bloque.id ? "text-blue-100" : "text-gray-500"}`}>
                          {bloque.productos?.length || 0} productos
                        </p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {tieneBloques && totalBloques === 1 && (
                <div className="p-4 bg-blue-50 rounded-xl border-2 border-blue-200 shadow-sm">
                  <p className="text-sm font-semibold text-blue-900 mb-1">
                    Bloque único: <span className="font-bold">{presupuesto.bloques[0].nombre}</span>
                  </p>
                  <p className="text-xs text-blue-700">
                    {presupuesto.bloques[0].productos?.length || 0} productos · ${calcularResumenBloque(presupuesto.bloques[0]).total.toLocaleString("es-AR", {
                      minimumFractionDigits: 2,
                    })}
                  </p>
                </div>
              )}

              {!tieneBloques && (
                <div className="p-4 bg-gray-50 rounded-xl border-2 border-gray-200 shadow-sm">
                  <p className="text-sm text-gray-700 font-medium">
                    Este presupuesto no tiene bloques. Se convertirán todos los productos.
                  </p>
                </div>
              )}

              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 shadow-sm">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-emerald-900">
                    Resumen del bloque elegido
                  </p>
                  {bloqueSeleccionadoVista?.nombre && (
                    <Badge variant="outline" className="border-emerald-300 bg-white text-emerald-700">
                      {bloqueSeleccionadoVista.nombre}
                    </Badge>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-x-5 gap-y-1 text-xs text-emerald-800">
                  <div className="flex justify-between gap-4">
                    <span>Subtotal</span>
                    <span className="font-bold tabular-nums">${resumenBloqueVista.subtotal.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
                  </div>
                  {resumenBloqueVista.descuentoTotal > 0 && (
                    <div className="flex justify-between gap-4">
                      <span>Descuentos</span>
                      <span className="font-bold tabular-nums">- ${resumenBloqueVista.descuentoTotal.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
                    </div>
                  )}
                  {aplicaIvaPresupuesto && (
                    <div className="flex justify-between gap-4">
                      <span>IVA ({ivaPctPresupuesto}%)</span>
                      <span className="font-bold tabular-nums">$ {ivaMontoPresupuesto.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
                    </div>
                  )}
                  {aplicaTransfPresupuesto && (
                    <div className="flex justify-between gap-4">
                      <span>Transferencia ({transfPctPresupuesto}%)</span>
                      <span className="font-bold tabular-nums">$ {transfMontoPresupuesto.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
                    </div>
                  )}
                  <div className="flex justify-between gap-4 border-t border-emerald-200 pt-2">
                    <span className="font-semibold">Adicionales</span>
                    <span className="font-bold tabular-nums">$ {resumenBloqueVista.adicionales.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between gap-4 text-sm text-emerald-950">
                    <span className="font-semibold">Total del bloque</span>
                    <span className="font-bold tabular-nums">$ {resumenBloqueVista.total.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-4 border-t">
                <Button 
                  onClick={handleSiguiente} 
                  disabled={convirtiendo || !clienteConfirmadoExplicitamente}
                  className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white px-5 py-2.5 text-sm font-semibold shadow-lg hover:shadow-xl transition-all"
                >
                  Siguiente
                  <ChevronRight className="w-5 h-5 ml-2" />
                </Button>
              </div>
            </div>
          )}

          {/* Paso 2: Configuración mínima (SIN MATERIALES) */}
          {pasoActual === 2 && (
            <div className="space-y-4 max-w-4xl mx-auto">
              <div className="mb-3">
                <h3 className="text-base font-bold text-gray-900 mb-1 flex items-center gap-2.5">
                  <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
                    <MapPin className="w-5 h-5 text-indigo-600" />
                  </div>
                  <span>Paso 2: Configuración de Obra</span>
                </h3>
                <p className="text-xs text-gray-600 ml-10">
                  Define la ubicación y fecha de inicio de la obra
                </p>
              </div>

            {/* Ubicación */}
            <div className="space-y-3 rounded-xl border border-gray-200 bg-gray-50/60 p-4">
              <label className="text-sm font-medium text-gray-700">Ubicación</label>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="flex items-center space-x-2">
                  <input
                    type="radio"
                    name="ubicacionTipo"
                    value="cliente"
                    checked={datos.ubicacionTipo === "cliente"}
                    onChange={(e) =>
                      setDatos({ ...datos, ubicacionTipo: e.target.value })
                    }
                    className="w-4 h-4"
                  />
                  <span className="text-sm">Usar dirección del cliente</span>
                </label>
                <label className="flex items-center space-x-2">
                  <input
                    type="radio"
                    name="ubicacionTipo"
                    value="nueva"
                    checked={datos.ubicacionTipo === "nueva"}
                    onChange={(e) =>
                      setDatos({ ...datos, ubicacionTipo: e.target.value })
                    }
                    className="w-4 h-4"
                  />
                  <span className="text-sm">Especificar nueva ubicación</span>
                </label>
              </div>

                {datos.ubicacionTipo === "nueva" && (
                  <div className="space-y-3 mt-3 p-4 bg-white rounded-xl border border-gray-200 shadow-sm">
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1 block">
                      Dirección <span className="text-red-500">*</span>
                    </label>
                    <Input
                      value={datos.direccion}
                      onChange={(e) =>
                        setDatos({ ...datos, direccion: e.target.value })
                      }
                      placeholder="Calle y número"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-1 block">
                        Localidad <span className="text-red-500">*</span>
                      </label>
                      <Input
                        value={datos.localidad}
                        onChange={(e) =>
                          setDatos({ ...datos, localidad: e.target.value })
                        }
                        placeholder="Localidad"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-1 block">
                        Provincia <span className="text-red-500">*</span>
                      </label>
                      <Input
                        value={datos.provincia}
                        onChange={(e) =>
                          setDatos({ ...datos, provincia: e.target.value })
                        }
                        placeholder="Provincia"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-1 block">
                        Barrio
                      </label>
                      <Input
                        value={datos.barrio}
                        onChange={(e) =>
                          setDatos({ ...datos, barrio: e.target.value })
                        }
                        placeholder="Barrio"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-1 block">
                        Área
                      </label>
                      <Input
                        value={datos.area}
                        onChange={(e) =>
                          setDatos({ ...datos, area: e.target.value })
                        }
                        placeholder="Área"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-1 block">
                        Lote
                      </label>
                      <Input
                        value={datos.lote}
                        onChange={(e) =>
                          setDatos({ ...datos, lote: e.target.value })
                        }
                        placeholder="Lote"
                      />
                    </div>
                  </div>
                </div>
              )}

                {datos.ubicacionTipo === "cliente" && (
                  <div className="mt-4 p-4 bg-blue-50 rounded-xl border-2 border-blue-200 shadow-sm">
                    <p className="text-sm font-semibold text-blue-900 mb-1">
                      Dirección del cliente:
                    </p>
                    <p className="text-sm text-blue-800">
                      {presupuesto.cliente?.direccion || "No especificada"}
                      {presupuesto.cliente?.localidad && (
                        <span>, {presupuesto.cliente.localidad}</span>
                      )}
                      {presupuesto.cliente?.provincia && (
                        <span>, {presupuesto.cliente.provincia}</span>
                      )}
                    </p>
                  </div>
                )}
              </div>

              {/* Fecha de Inicio */}
              <div className="space-y-3 p-4 bg-gradient-to-br from-gray-50 to-white rounded-xl border border-gray-200 shadow-sm">
                <label className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center">
                    <Calendar className="w-4 h-4 text-orange-600" />
                  </div>
                  Fecha de Inicio <span className="text-red-500">*</span>
                </label>
                <DateInput
                  value={datos.fechaInicio}
                  onChange={(v) => setDatos({ ...datos, fechaInicio: v })}
                  buttonClassName="w-full h-10 text-sm justify-start"
                />
                <p className="text-xs text-gray-500 mt-2">
                  La fecha de fin se puede configurar después en la edición de la obra.
                </p>
              </div>

              {/* Descripción General (opcional) */}
              <div className="space-y-2 p-4 bg-gradient-to-br from-gray-50 to-white rounded-xl border border-gray-200 shadow-sm">
                <label className="text-sm font-semibold text-gray-900">
                  Descripción General (opcional)
                </label>
                <Textarea
                  value={datos.descripcionGeneral}
                  onChange={(e) =>
                    setDatos({ ...datos, descripcionGeneral: e.target.value })
                  }
                  placeholder="Descripción general de la obra..."
                  rows={2}
                  className="text-sm"
                />
              </div>

              {/* Nota importante: Sin materiales */}
              <div className="p-3 bg-yellow-50 rounded-xl border border-yellow-300 shadow-sm">
                <p className="text-xs text-yellow-900 font-medium">
                  <strong>Nota:</strong> Los materiales se pueden agregar después desde la pantalla de edición de la obra.
                </p>
              </div>

              <div className="flex justify-between pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={handleAnterior}
                  disabled={convirtiendo}
                  className="px-5 py-2.5 text-sm font-semibold"
                >
                  <ChevronLeft className="w-5 h-5 mr-2" />
                  Anterior
                </Button>
                <Button
                  onClick={handleConvertir}
                  disabled={convirtiendo}
                  className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white px-5 py-2.5 text-sm font-semibold shadow-lg hover:shadow-xl transition-all"
                >
                  {convirtiendo ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      Convirtiendo...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-5 h-5 mr-2" />
                      Convertir a Obra
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Selector de Cliente */}
        <SelectorClienteObras
          open={showFormularioCliente}
          onClose={cerrarSelectorCliente}
          clienteActual={clienteConfirmado || presupuesto.cliente ? {
            id: clienteConfirmadoId || presupuesto.clienteId,
            ...(clienteConfirmado || presupuesto.cliente || {})
          } : null}
          onClienteSeleccionado={handleClienteSeleccionado}
        />
      </DialogContent>
    </Dialog>
  );
};

export default WizardConversion;

