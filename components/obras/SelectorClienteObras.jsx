"use client";
import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, User, Plus, Search } from "lucide-react";
import { db } from "@/lib/firebase";
import { collection, getDocs } from "firebase/firestore";
import FormularioClienteObras from "./FormularioClienteObras";

/**
 * Selector de Cliente para Obras y Presupuestos
 * 
 * Permite:
 * 1. Buscar y seleccionar entre clientes existentes
 * 2. Crear un cliente nuevo
 * 
 * No importa si los clientes tienen el formato nuevo o viejo, todos se muestran.
 */
const SelectorClienteObras = ({
  open,
  onClose,
  clienteActual = null, // Cliente actualmente asignado (si existe)
  onClienteSeleccionado, // Callback: (clienteId, clienteData) => void
}) => {
  const [clientes, setClientes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [showFormularioNuevo, setShowFormularioNuevo] = useState(false);

  // Cargar clientes cuando se abre el diálogo
  useEffect(() => {
    if (open) {
      cargarClientes();
      setBusqueda("");
      setShowFormularioNuevo(false);
    }
  }, [open]);

  const cargarClientes = async () => {
    try {
      setLoading(true);
      const clientesSnap = await getDocs(collection(db, "clientes"));
      const clientesData = clientesSnap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setClientes(clientesData);
    } catch (error) {
      console.error("Error al cargar clientes:", error);
    } finally {
      setLoading(false);
    }
  };

  // Filtrar clientes según búsqueda
  const clientesFiltrados = clientes.filter((c) => {
    if (!busqueda.trim()) return true;
    const q = busqueda.toLowerCase();
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

  const handleSeleccionarCliente = (cliente) => {
    if (onClienteSeleccionado) {
      onClienteSeleccionado(cliente.id, cliente);
    }
    onClose();
  };

  const handleNuevoClienteGuardado = (clienteId, clienteData) => {
    // Cuando se guarda un nuevo cliente, seleccionarlo automáticamente
    if (onClienteSeleccionado) {
      onClienteSeleccionado(clienteId, clienteData);
    }
    setShowFormularioNuevo(false);
    onClose();
  };

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
      <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="border-b pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center shadow-md">
              <User className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <DialogTitle className="text-lg font-bold text-gray-900">
                {clienteActual ? "Cambiar Cliente" : "Seleccionar Cliente"}
              </DialogTitle>
              <DialogDescription className="text-sm text-gray-600 mt-1">
                Elige un cliente existente o crea uno nuevo
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col gap-4 py-4">
          {/* Barra de búsqueda y botón nuevo */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                type="text"
                placeholder="Buscar por nombre, teléfono, CUIT, dirección..."
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                className="pl-10"
                autoFocus
              />
            </div>
            <Button
              onClick={() => setShowFormularioNuevo(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Nuevo Cliente
            </Button>
          </div>

          {/* Lista de clientes */}
          <div className="flex-1 overflow-y-auto border border-gray-200 rounded-lg">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
                <span className="ml-2 text-gray-600">Cargando clientes...</span>
              </div>
            ) : clientesFiltrados.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                <User className="w-12 h-12 text-gray-300 mb-3" />
                <p className="text-gray-600 font-medium mb-1">
                  {busqueda.trim()
                    ? "No se encontraron clientes"
                    : "No hay clientes registrados"}
                </p>
                <p className="text-sm text-gray-500 mb-4">
                  {busqueda.trim()
                    ? "Intenta con otros términos de búsqueda"
                    : "Crea tu primer cliente"}
                </p>
                <Button
                  onClick={() => setShowFormularioNuevo(true)}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Crear Cliente
                </Button>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {clientesFiltrados.map((cliente) => {
                  const esClienteActual =
                    clienteActual?.id === cliente.id ||
                    (clienteActual &&
                      clienteActual.nombre === cliente.nombre &&
                      clienteActual.telefono === cliente.telefono);

                  return (
                    <div
                      key={cliente.id}
                      onClick={() => handleSeleccionarCliente(cliente)}
                      className={`p-4 cursor-pointer transition-colors hover:bg-blue-50 ${
                        esClienteActual ? "bg-blue-50 border-l-4 border-blue-600" : ""
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-semibold text-gray-900">
                              {cliente.nombre || "Sin nombre"}
                            </p>
                            {esClienteActual && (
                              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                                Actual
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-3 text-sm text-gray-600">
                            {cliente.telefono && (
                              <span className="flex items-center gap-1">
                                📞 {cliente.telefono}
                              </span>
                            )}
                            {cliente.cuit && (
                              <span className="flex items-center gap-1">
                                🆔 {cliente.cuit}
                              </span>
                            )}
                            {(cliente.direccion || cliente.localidad) && (
                              <span className="flex items-center gap-1">
                                📍 {cliente.direccion || cliente.localidad}
                                {cliente.localidad && cliente.direccion && `, ${cliente.localidad}`}
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
                          className="ml-2"
                        >
                          Seleccionar
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Información adicional */}
          {clientesFiltrados.length > 0 && (
            <div className="text-xs text-gray-500 text-center pt-2 border-t">
              {clientesFiltrados.length} cliente{clientesFiltrados.length !== 1 ? "s" : ""}{" "}
              {busqueda.trim() ? "encontrado(s)" : "disponible(s)"}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SelectorClienteObras;
