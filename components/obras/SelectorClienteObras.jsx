"use client";
import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Loader2, 
  User, 
  Plus, 
  Search, 
  ChevronLeft, 
  ChevronRight,
  Phone,
  MapPin,
  CreditCard,
  CheckCircle2
} from "lucide-react";
import { db } from "@/lib/firebase";
import { collection, getDocs } from "firebase/firestore";
import FormularioClienteObras from "./FormularioClienteObras";

/**
 * Caché global de clientes para evitar recargas innecesarias
 * Se mantiene en memoria durante la sesión
 */
let clientesCache = null;
let clientesCacheTimestamp = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutos

/**
 * Selector de Cliente para Obras y Presupuestos
 * 
 * Permite:
 * 1. Buscar y seleccionar entre clientes existentes
 * 2. Crear un cliente nuevo (se selecciona automáticamente)
 * 
 * No importa si los clientes tienen el formato nuevo o viejo, todos se muestran.
 * 
 * OPTIMIZADO: Usa caché para evitar recargas innecesarias de Firestore
 */
const SelectorClienteObras = ({
  open,
  onClose,
  clienteActual = null, // Cliente actualmente asignado (si existe)
  onClienteSeleccionado, // Callback: (clienteId, clienteData) => void
}) => {
  const [clientes, setClientes] = useState(clientesCache || []);
  const [loading, setLoading] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [showFormularioNuevo, setShowFormularioNuevo] = useState(false);
  
  // Paginación optimizada
  const [paginaActual, setPaginaActual] = useState(1);
  const CLIENTES_POR_PAGINA = 20; // Renderizar solo 20 clientes a la vez

  // Cargar clientes cuando se abre el diálogo (solo si no hay caché válido)
  useEffect(() => {
    if (open) {
      setBusqueda("");
      setShowFormularioNuevo(false);
      setPaginaActual(1); // Resetear a primera página
      
      // Verificar si el caché es válido
      const ahora = Date.now();
      const cacheValido = 
        clientesCache && 
        clientesCacheTimestamp && 
        (ahora - clientesCacheTimestamp) < CACHE_DURATION;
      
      if (cacheValido) {
        // Usar caché existente
        setClientes(clientesCache);
        setLoading(false);
      } else {
        // Cargar desde Firestore
        cargarClientes();
      }
    }
  }, [open]);
  
  // Resetear página cuando cambia la búsqueda
  useEffect(() => {
    setPaginaActual(1);
  }, [busqueda]);

  const cargarClientes = useCallback(async () => {
    try {
      setLoading(true);
      const clientesSnap = await getDocs(collection(db, "clientes"));
      const clientesData = clientesSnap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      
      // Actualizar caché
      clientesCache = clientesData;
      clientesCacheTimestamp = Date.now();
      
      setClientes(clientesData);
    } catch (error) {
      console.error("Error al cargar clientes:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Filtrar clientes según búsqueda - MEMOIZADO para evitar recálculos innecesarios
  const clientesFiltrados = useMemo(() => {
    if (!busqueda.trim()) return clientes;
    
    const q = busqueda.toLowerCase();
    return clientes.filter((c) => {
      const nombre = (c.nombre || "").toLowerCase();
      const telefono = (c.telefono || "").toLowerCase();
      const cuit = (c.cuit || "").toLowerCase();
      const direccion = (c.direccion || "").toLowerCase();
      const localidad = (c.localidad || "").toLowerCase();
      
      return (
        nombre.includes(q) ||
        telefono.includes(q) ||
        cuit.includes(q) ||
        direccion.includes(q) ||
        localidad.includes(q)
      );
    });
  }, [clientes, busqueda]);
  
  // Paginación: calcular clientes a mostrar
  const totalPaginas = Math.ceil(clientesFiltrados.length / CLIENTES_POR_PAGINA);
  const inicio = (paginaActual - 1) * CLIENTES_POR_PAGINA;
  const fin = inicio + CLIENTES_POR_PAGINA;
  const clientesPaginados = useMemo(() => {
    return clientesFiltrados.slice(inicio, fin);
  }, [clientesFiltrados, inicio, fin]);

  const handleSeleccionarCliente = useCallback((cliente) => {
    if (onClienteSeleccionado) {
      // Asegurar que el cliente tenga todos los datos necesarios
      const clienteCompleto = {
        id: cliente.id,
        ...cliente,
      };
      onClienteSeleccionado(cliente.id, clienteCompleto);
    }
    onClose();
  }, [onClienteSeleccionado, onClose]);

  const handleNuevoClienteGuardado = useCallback(async (clienteId, clienteData) => {
    try {
      // Asegurar que el cliente tenga el ID correcto
      const clienteCompleto = {
        id: clienteId,
        ...clienteData,
      };

      // Actualizar caché con el nuevo cliente (siempre, incluso si no existía antes)
      if (!clientesCache) {
        // Si no hay caché, recargar todos los clientes
        await cargarClientes();
      } else {
        // Si hay caché, agregar el nuevo cliente
        clientesCache = [...clientesCache, clienteCompleto];
        clientesCacheTimestamp = Date.now();
        setClientes(clientesCache);
      }
      
      // IMPORTANTE: Seleccionar el cliente automáticamente ANTES de cerrar
      // Esto asegura que el componente padre reciba el cliente correctamente
      if (onClienteSeleccionado) {
        onClienteSeleccionado(clienteId, clienteCompleto);
      }
      
      // Cerrar el formulario y el selector
      setShowFormularioNuevo(false);
      
      // Pequeño delay para asegurar que el callback se ejecute antes de cerrar
      setTimeout(() => {
        onClose();
      }, 100);
    } catch (error) {
      console.error("Error al procesar nuevo cliente:", error);
    }
  }, [onClienteSeleccionado, onClose, cargarClientes]);

  // Si se está mostrando el formulario de nuevo cliente, mostrar ese componente
  if (showFormularioNuevo) {
    return (
      <FormularioClienteObras
        open={true}
        onClose={() => setShowFormularioNuevo(false)}
        clienteExistente={null}
        onClienteGuardado={handleNuevoClienteGuardado}
      />
    );
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="w-[95vw] max-w-3xl max-h-[90vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="border-b pb-4 px-6 pt-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg">
              <User className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <DialogTitle className="text-xl font-bold text-gray-900">
                {clienteActual ? "Cambiar Cliente" : "Seleccionar Cliente"}
              </DialogTitle>
              <DialogDescription className="text-sm text-gray-600 mt-1">
                {clienteActual 
                  ? "Elige un cliente diferente o crea uno nuevo"
                  : "Busca un cliente existente o crea uno nuevo para continuar"}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col gap-4 px-6 py-4">
          {/* Barra de búsqueda y botón nuevo */}
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <Input
                type="text"
                placeholder="Buscar por nombre, teléfono, CUIT, dirección..."
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                className="pl-11 h-11 text-base"
                autoFocus
              />
            </div>
            <Button
              onClick={() => setShowFormularioNuevo(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2 h-11 px-6 shadow-md hover:shadow-lg transition-all"
            >
              <Plus className="w-5 h-5" />
              <span className="font-medium">Nuevo Cliente</span>
            </Button>
          </div>

          {/* Lista de clientes */}
          <div className="flex-1 overflow-y-auto border border-gray-200 rounded-lg bg-white">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-16">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600 mb-3" />
                <span className="text-gray-600 font-medium">Cargando clientes...</span>
              </div>
            ) : clientesFiltrados.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center px-6">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                  <User className="w-8 h-8 text-gray-400" />
                </div>
                <p className="text-gray-700 font-semibold text-lg mb-2">
                  {busqueda.trim()
                    ? "No se encontraron clientes"
                    : "No hay clientes registrados"}
                </p>
                <p className="text-sm text-gray-500 mb-6 max-w-md">
                  {busqueda.trim()
                    ? "Intenta con otros términos de búsqueda o crea un nuevo cliente"
                    : "Comienza creando tu primer cliente para poder asignarlo a obras y presupuestos"}
                </p>
                <Button
                  onClick={() => setShowFormularioNuevo(true)}
                  className="bg-blue-600 hover:bg-blue-700 text-white shadow-md hover:shadow-lg transition-all"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Crear Cliente
                </Button>
              </div>
            ) : (
              <>
                <div className="divide-y divide-gray-100">
                  {/* OPTIMIZADO: Solo renderizar los clientes de la página actual */}
                  {clientesPaginados.map((cliente) => {
                    const esClienteActual =
                      clienteActual?.id === cliente.id ||
                      (clienteActual &&
                        clienteActual.nombre === cliente.nombre &&
                        clienteActual.telefono === cliente.telefono);

                    return (
                      <div
                        key={cliente.id}
                        onClick={() => handleSeleccionarCliente(cliente)}
                        className={`p-5 cursor-pointer transition-all duration-200 hover:bg-blue-50/50 ${
                          esClienteActual 
                            ? "bg-blue-50 border-l-4 border-blue-600 shadow-sm" 
                            : "hover:shadow-sm"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                              <div className="w-10 h-10 bg-gradient-to-br from-gray-100 to-gray-200 rounded-lg flex items-center justify-center flex-shrink-0">
                                <User className="w-5 h-5 text-gray-600" />
                              </div>
                              <p className="font-semibold text-gray-900 text-base truncate">
                                {cliente.nombre || "Sin nombre"}
                              </p>
                              {esClienteActual && (
                                <span className="inline-flex items-center gap-1 text-xs bg-blue-100 text-blue-700 px-2.5 py-1 rounded-full font-medium flex-shrink-0">
                                  <CheckCircle2 className="w-3 h-3" />
                                  Actual
                                </span>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-4 text-sm text-gray-600 ml-12">
                              {cliente.telefono && (
                                <span className="flex items-center gap-1.5">
                                  <Phone className="w-4 h-4 text-gray-400" />
                                  <span>{cliente.telefono}</span>
                                </span>
                              )}
                              {cliente.cuit && (
                                <span className="flex items-center gap-1.5">
                                  <CreditCard className="w-4 h-4 text-gray-400" />
                                  <span>{cliente.cuit}</span>
                                </span>
                              )}
                              {(cliente.direccion || cliente.localidad) && (
                                <span className="flex items-center gap-1.5">
                                  <MapPin className="w-4 h-4 text-gray-400" />
                                  <span className="truncate max-w-xs">
                                    {cliente.direccion || cliente.localidad}
                                    {cliente.localidad && cliente.direccion && `, ${cliente.localidad}`}
                                  </span>
                                </span>
                              )}
                            </div>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSeleccionarCliente(cliente);
                            }}
                            className={`ml-2 flex-shrink-0 ${
                              esClienteActual 
                                ? "bg-blue-600 text-white border-blue-600 hover:bg-blue-700" 
                                : ""
                            }`}
                          >
                            {esClienteActual ? (
                              <>
                                <CheckCircle2 className="w-4 h-4 mr-1.5" />
                                Seleccionado
                              </>
                            ) : (
                              "Seleccionar"
                            )}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                
                {/* Paginación - Solo mostrar si hay más de una página */}
                {totalPaginas > 1 && (
                  <div className="flex items-center justify-between pt-4 border-t mt-4 px-4 pb-2">
                    <div className="text-sm text-gray-600 font-medium">
                      Mostrando <span className="text-gray-900">{inicio + 1}-{Math.min(fin, clientesFiltrados.length)}</span> de{" "}
                      <span className="text-gray-900">{clientesFiltrados.length}</span> cliente{clientesFiltrados.length !== 1 ? "s" : ""}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPaginaActual(prev => Math.max(1, prev - 1))}
                        disabled={paginaActual === 1}
                        className="flex items-center gap-1.5"
                      >
                        <ChevronLeft className="w-4 h-4" />
                        Anterior
                      </Button>
                      <div className="text-sm text-gray-700 font-medium px-3 py-1.5 bg-gray-50 rounded-md">
                        Página {paginaActual} de {totalPaginas}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPaginaActual(prev => Math.min(totalPaginas, prev + 1))}
                        disabled={paginaActual === totalPaginas}
                        className="flex items-center gap-1.5"
                      >
                        Siguiente
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Información adicional - Solo mostrar si no hay paginación */}
          {clientesFiltrados.length > 0 && totalPaginas === 1 && (
            <div className="text-xs text-gray-500 text-center pt-2 border-t">
              <span className="font-medium text-gray-700">{clientesFiltrados.length}</span> cliente{clientesFiltrados.length !== 1 ? "s" : ""}{" "}
              {busqueda.trim() ? "encontrado(s)" : "disponible(s)"}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SelectorClienteObras;

// Exportar función para invalidar caché desde otros componentes
export const invalidarCacheClientes = () => {
  clientesCache = null;
  clientesCacheTimestamp = null;
};
