"use client";
import React, { useState, useEffect, useMemo } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
} from "lucide-react";
import { db } from "@/lib/firebase";
import { collection, addDoc, getDocs, serverTimestamp, doc, getDoc, query, where, orderBy, limit } from "firebase/firestore";
import { useRouter } from "next/navigation";
import SelectorClienteObras from "./SelectorClienteObras";

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
    setOpcionCliente(opcion);
    setError(""); // Limpiar errores anteriores
    if (opcion === "confirmar") {
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
      // Abrir formulario para cambiar/cargar cliente
      setShowFormularioCliente(true);
      // No confirmar aún, esperar a que el usuario guarde el cliente
      setClienteConfirmadoExplicitamente(false);
    }
  };

  // Validar paso 1
  const validarPaso1 = () => {
    // Validar que el cliente fue confirmado explícitamente
    if (!clienteConfirmadoExplicitamente || (!clienteConfirmado && !clienteConfirmadoId)) {
      setError("Por favor confirme o seleccione un cliente");
      return false;
    }
    
    // Validar bloque si hay múltiples
    if (presupuesto?.bloques && presupuesto.bloques.length > 1) {
      if (!datos.bloqueSeleccionado) {
        setError("Por favor seleccione un bloque");
        return false;
      }
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

  // Generar número de obra
  // OPTIMIZADO: Usa query limitada en lugar de cargar todas las obras
  const getNextObraNumber = async () => {
    try {
      // Consulta optimizada: solo obtener obras con número OBRA- ordenadas descendente, limitado a 1
      const obrasQuery = query(
        collection(db, "obras"),
        where("tipo", "==", "obra"),
        where("numeroPedido", ">=", "OBRA-"),
        where("numeroPedido", "<", "OBRA-Z"), // Rango para números OBRA-
        orderBy("numeroPedido", "desc"),
        limit(1)
      );
      
      const obrasSnap = await getDocs(obrasQuery);
      
      if (obrasSnap.empty) {
        return "OBRA-00001";
      }

      // Solo procesar el primer resultado (el más reciente)
      const ultimaObra = obrasSnap.docs[0].data();
      const match = ultimaObra.numeroPedido?.match(/OBRA-(\d+)/);
      
      if (match) {
        const ultimoNum = parseInt(match[1], 10);
        const nextNum = ultimoNum + 1;
        return `OBRA-${String(nextNum).padStart(5, "0")}`;
      }
      
      return "OBRA-00001";
    } catch (error) {
      console.error("Error al generar número de obra:", error);
      // Fallback: usar timestamp si falla la consulta optimizada
      return `OBRA-${String(Date.now()).slice(-5)}`;
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
          const esMadera = String(p.categoria || "").toLowerCase() === "maderas";
          const isMachDeck = esMadera && (p.subcategoria === "machimbre" || p.subcategoria === "deck");
          const precio = Number(p.precio) || 0;
          const cantidad = Number(p.cantidad) || 1;
          const descuento = Number(p.descuento) || 0;
          const base = isMachDeck ? precio : precio * cantidad;
          const subtotal = Math.round(base * (1 - descuento / 100));
          const item = {
            id: p.id,
            nombre: p.nombre || "",
            categoria: p.categoria || "",
            subcategoria: p.subcategoria || "",
            unidad: p.unidad || p.unidadMedida || "",
            unidadMedida: p.unidadMedida || p.unidad || "",
            cantidad,
            descuento,
            precio,
            subtotal,
          };
          if (p.alto !== undefined) item.alto = Number(p.alto) || 0;
          if (p.ancho !== undefined) item.ancho = Number(p.ancho) || 0;
          if (p.largo !== undefined) item.largo = Number(p.largo) || 0;
          if (p.precioPorPie !== undefined) item.precioPorPie = Number(p.precioPorPie) || 0;
          if (p.cepilladoAplicado !== undefined) item.cepilladoAplicado = !!p.cepilladoAplicado;
          return item;
        });

      const calcularSubtotal = (lista) =>
        (Array.isArray(lista) ? lista : []).reduce((acc, p) => {
          const esMadera = String(p.categoria || "").toLowerCase() === "maderas";
          const isMachDeck = esMadera && (p.subcategoria === "machimbre" || p.subcategoria === "deck");
          const precio = Number(p.precio) || 0;
          const cantidad = Number(p.cantidad) || 1;
          const base = isMachDeck ? precio : precio * cantidad;
          return acc + base;
        }, 0);

      const calcularDescuento = (lista) =>
        (Array.isArray(lista) ? lista : []).reduce((acc, p) => {
          const esMadera = String(p.categoria || "").toLowerCase() === "maderas";
          const isMachDeck = esMadera && (p.subcategoria === "machimbre" || p.subcategoria === "deck");
          const precio = Number(p.precio) || 0;
          const cantidad = Number(p.cantidad) || 1;
          const base = isMachDeck ? precio : precio * cantidad;
          const desc = Number(p.descuento) || 0;
          return acc + Math.round(base * desc / 100);
        }, 0);

      let productosObraSanitizados = [];
      let bloqueSeleccionadoNombre = null;

      // Si hay bloques y se seleccionó uno específico
      if (presupuesto.bloques && presupuesto.bloques.length > 0 && datos.bloqueSeleccionado) {
        const bloqueSeleccionado = presupuesto.bloques.find(b => b.id === datos.bloqueSeleccionado);
        if (bloqueSeleccionado) {
          productosObraSanitizados = sanitizarProductos(bloqueSeleccionado.productos || []);
          bloqueSeleccionadoNombre = bloqueSeleccionado.nombre || null;
        }
      } else {
        // Fallback para presupuestos sin bloques (estructura antigua)
        productosObraSanitizados = sanitizarProductos(presupuesto.productos || []);
      }

      // NO hay materiales adicionales en el wizard (según requisitos)
      const materialesSanitizados = [];

      // Calcular totales
      const productosObraSubtotal = calcularSubtotal(productosObraSanitizados);
      const productosObraDescuento = calcularDescuento(productosObraSanitizados);
      const materialesSubtotal = 0;
      const materialesDescuento = 0;
      const subtotalCombinado = productosObraSubtotal + materialesSubtotal;
      const descuentoTotalCombinado = productosObraDescuento + materialesDescuento;
      const totalCombinado = subtotalCombinado - descuentoTotalCombinado;

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
        total: totalCombinado,
        descripcionGeneral: datos.descripcionGeneral || presupuesto.descripcionGeneral || "",
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

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader className="border-b pb-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-lg flex items-center justify-center shadow-md">
              <Building className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <SheetTitle className="text-xl font-bold text-gray-900">
                Convertir Presupuesto a Obra
              </SheetTitle>
              <SheetDescription className="text-sm text-gray-600 mt-1">
                {presupuesto.numeroPedido || "Sin número"} - {presupuesto.cliente?.nombre || "Sin cliente"}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        {/* Indicador de pasos */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2 flex-1">
            <div className={`flex items-center gap-2 ${pasoActual >= 1 ? "text-blue-600" : "text-gray-400"}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                pasoActual >= 1 ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-500"
              }`}>
                {pasoActual > 1 ? <CheckCircle className="w-5 h-5" /> : "1"}
              </div>
              <span className="text-sm font-medium hidden sm:inline">Selección</span>
            </div>
            <div className={`flex-1 h-0.5 ${pasoActual >= 2 ? "bg-blue-600" : "bg-gray-200"}`} />
            <div className={`flex items-center gap-2 ${pasoActual >= 2 ? "text-blue-600" : "text-gray-400"}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                pasoActual >= 2 ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-500"
              }`}>
                2
              </div>
              <span className="text-sm font-medium hidden sm:inline">Configuración</span>
            </div>
          </div>
        </div>

        {/* Mensaje de error */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
            {error}
          </div>
        )}

        {/* Paso 1: Cliente + Bloque (misma pantalla) */}
        {pasoActual === 1 && (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Paso 1: Cliente y Bloque
              </h3>
            </div>

            {/* Sección Cliente */}
            <div className="space-y-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
              <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                <User className="w-4 h-4" />
                Cliente
              </label>
              
              {/* Mostrar cliente actual del presupuesto */}
              <div className="space-y-3">
                <div className="p-3 bg-white rounded-lg border border-gray-300">
                  <p className="font-medium text-gray-900">
                    {presupuesto.cliente?.nombre || "Sin cliente"}
                  </p>
                  {presupuesto.cliente?.telefono && (
                    <p className="text-sm text-gray-600 mt-1">
                      Tel: {presupuesto.cliente.telefono}
                    </p>
                  )}
                  {presupuesto.cliente?.direccion && (
                    <p className="text-sm text-gray-600 mt-1">
                      {presupuesto.cliente.direccion}
                      {presupuesto.cliente.localidad && `, ${presupuesto.cliente.localidad}`}
                    </p>
                  )}
                </div>

                {/* Switches de opción de cliente */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700 mb-2 block">
                    Opción de Cliente <span className="text-red-500">*</span>
                  </label>
                  <div className="space-y-2">
                    <label className="flex items-center space-x-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                      <input
                        type="radio"
                        name="opcionCliente"
                        value="confirmar"
                        checked={opcionCliente === "confirmar"}
                        onChange={(e) => handleOpcionClienteChange(e.target.value)}
                        className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                        disabled={convirtiendo}
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <CheckCircle className="w-4 h-4 text-green-600" />
                          <span className="font-medium text-gray-900">Confirmar cliente actual</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                          Usar el cliente del presupuesto: {presupuesto.cliente?.nombre || "Sin nombre"}
                        </p>
                      </div>
                    </label>
                    <label className="flex items-center space-x-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                      <input
                        type="radio"
                        name="opcionCliente"
                        value="cambiar"
                        checked={opcionCliente === "cambiar"}
                        onChange={(e) => handleOpcionClienteChange(e.target.value)}
                        className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                        disabled={convirtiendo}
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Edit className="w-4 h-4 text-blue-600" />
                          <span className="font-medium text-gray-900">Cambiar / Cargar cliente</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                          Seleccionar o crear un nuevo cliente
                        </p>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Indicador de cliente confirmado - Solo mostrar si fue confirmado explícitamente */}
                {clienteConfirmadoExplicitamente && clienteConfirmado && (
                  <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-green-600" />
                      <p className="text-sm font-medium text-green-800">
                        Cliente confirmado: {clienteConfirmado.nombre}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Sección Bloques */}
            {tieneBloques && totalBloques > 1 && (
              <div className="space-y-3">
                <label className="text-sm font-medium text-gray-700">
                  Seleccionar Bloque <span className="text-red-500">*</span>
                </label>
                {/* Tabs/Pills para bloques */}
                <div className="flex flex-wrap gap-2">
                  {presupuesto.bloques.map((bloque) => (
                    <button
                      key={bloque.id}
                      onClick={() => setDatos({ ...datos, bloqueSeleccionado: bloque.id })}
                      className={`px-4 py-2 rounded-lg border-2 transition-all ${
                        datos.bloqueSeleccionado === bloque.id
                          ? "bg-blue-600 text-white border-blue-600 shadow-md"
                          : "bg-white text-gray-700 border-gray-300 hover:border-blue-400 hover:bg-blue-50"
                      }`}
                      disabled={convirtiendo}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{bloque.nombre || "Sin nombre"}</span>
                        <Badge
                          variant={datos.bloqueSeleccionado === bloque.id ? "secondary" : "outline"}
                          className={
                            datos.bloqueSeleccionado === bloque.id
                              ? "bg-blue-500 text-white"
                              : ""
                          }
                        >
                          ${(Number(bloque.total) || 0).toLocaleString("es-AR", {
                            minimumFractionDigits: 2,
                          })}
                        </Badge>
                      </div>
                      <p className="text-xs mt-1 opacity-75">
                        {bloque.productos?.length || 0} productos
                      </p>
                    </button>
                  ))}
                </div>
                {datos.bloqueSeleccionado && (
                  <div className="mt-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <p className="text-sm text-blue-800">
                      <strong>Bloque seleccionado:</strong>{" "}
                      {presupuesto.bloques.find((b) => b.id === datos.bloqueSeleccionado)?.nombre}
                    </p>
                    <p className="text-xs text-blue-600 mt-1">
                      {presupuesto.bloques.find((b) => b.id === datos.bloqueSeleccionado)?.productos?.length || 0} productos
                    </p>
                  </div>
                )}
              </div>
            )}

            {tieneBloques && totalBloques === 1 && (
              <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                <p className="text-sm text-blue-800">
                  <strong>Bloque único:</strong> {presupuesto.bloques[0].nombre}
                </p>
                <p className="text-xs text-blue-600 mt-1">
                  {presupuesto.bloques[0].productos?.length || 0} productos - ${(Number(presupuesto.bloques[0].total) || 0).toLocaleString("es-AR", {
                    minimumFractionDigits: 2,
                  })}
                </p>
              </div>
            )}

            {!tieneBloques && (
              <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                <p className="text-sm text-gray-600">
                  Este presupuesto no tiene bloques. Se convertirán todos los productos.
                </p>
              </div>
            )}

            <div className="flex justify-end pt-4">
              <Button 
                onClick={handleSiguiente} 
                disabled={convirtiendo || !clienteConfirmadoExplicitamente}
              >
                Siguiente
                <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
        )}

        {/* Paso 2: Configuración mínima (SIN MATERIALES) */}
        {pasoActual === 2 && (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <MapPin className="w-5 h-5" />
                Paso 2: Configuración de Obra
              </h3>
            </div>

            {/* Ubicación */}
            <div className="space-y-4">
              <label className="text-sm font-medium text-gray-700">Ubicación</label>
              <div className="flex items-center gap-4">
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
                <div className="space-y-3 mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
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
                <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <p className="text-sm text-blue-800">
                    <strong>Dirección del cliente:</strong>{" "}
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
            <div className="space-y-4">
              <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Fecha de Inicio <span className="text-red-500">*</span>
              </label>
              <Input
                type="date"
                value={datos.fechaInicio}
                onChange={(e) =>
                  setDatos({ ...datos, fechaInicio: e.target.value })
                }
                className="w-full"
              />
              <p className="text-xs text-gray-500">
                La fecha de fin se puede configurar después en la edición de la obra.
              </p>
            </div>

            {/* Descripción General (opcional) */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">
                Descripción General (opcional)
              </label>
              <Textarea
                value={datos.descripcionGeneral}
                onChange={(e) =>
                  setDatos({ ...datos, descripcionGeneral: e.target.value })
                }
                placeholder="Descripción general de la obra..."
                rows={3}
              />
            </div>

            {/* Nota importante: Sin materiales */}
            <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
              <p className="text-sm text-yellow-800">
                <strong>Nota:</strong> Los materiales se pueden agregar después desde la pantalla de edición de la obra.
              </p>
            </div>

            <div className="flex justify-between pt-4">
              <Button
                variant="outline"
                onClick={handleAnterior}
                disabled={convirtiendo}
              >
                <ChevronLeft className="w-4 h-4 mr-2" />
                Anterior
              </Button>
              <Button
                onClick={handleConvertir}
                disabled={convirtiendo}
                className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
              >
                {convirtiendo ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Convirtiendo...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Convertir a Obra
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Selector de Cliente */}
        <SelectorClienteObras
          open={showFormularioCliente}
          onClose={() => setShowFormularioCliente(false)}
          clienteActual={clienteConfirmado || presupuesto.cliente ? {
            id: clienteConfirmadoId || presupuesto.clienteId,
            ...(clienteConfirmado || presupuesto.cliente || {})
          } : null}
          onClienteSeleccionado={handleClienteSeleccionado}
        />
      </SheetContent>
    </Sheet>
  );
};

export default WizardConversion;

