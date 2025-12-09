"use client";
import React, { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Icon } from "@iconify/react";
import { db } from "@/lib/firebase";
import { collection, addDoc } from "firebase/firestore";

/**
 * Modal para cambiar cliente en presupuestos y ventas
 * Reutiliza el mismo diseño que se usa en la creación
 */
const ModalCambiarCliente = ({
  open,
  onClose,
  clienteActual = null, // { id, nombre, cuit, ... }
  clientes = [], // Lista de clientes disponibles
  onClienteSeleccionado, // Callback: (clienteId, clienteData) => void
  onClienteCreado, // Callback opcional: (clienteId, clienteData) => void - si no se provee, usa onClienteSeleccionado
}) => {
  const [dropdownClientesOpen, setDropdownClientesOpen] = useState(false);
  const [busquedaCliente, setBusquedaCliente] = useState("");
  const [busquedaClienteDebounced, setBusquedaClienteDebounced] = useState("");
  const [openNuevoCliente, setOpenNuevoCliente] = useState(false);
  const [activeTab, setActiveTab] = useState("datos");
  const [nuevoCliente, setNuevoCliente] = useState({
    nombre: "",
    direccion: "",
    telefono: "",
    cuit: "",
    email: "",
    localidad: "",
    partido: "",
    barrio: "",
    area: "",
    lote: "",
    descripcion: "",
    esClienteViejo: false,
  });

  // Debounce para búsqueda de clientes
  useEffect(() => {
    const id = setTimeout(() => setBusquedaClienteDebounced(busquedaCliente), 300);
    return () => clearTimeout(id);
  }, [busquedaCliente]);

  // Resetear estados cuando se abre/cierra el modal
  useEffect(() => {
    if (open) {
      setBusquedaCliente("");
      setDropdownClientesOpen(false);
      setOpenNuevoCliente(false);
      setActiveTab("datos");
    }
  }, [open]);

  // Filtrar clientes
  const clientesFiltrados = useMemo(() => {
    if (!busquedaClienteDebounced.trim()) return clientes;
    const q = busquedaClienteDebounced.toLowerCase();
    return clientes.filter(
      (c) =>
        (c.nombre || "").toLowerCase().includes(q) ||
        (c.telefono || "").toLowerCase().includes(q) ||
        (c.cuit || "").toLowerCase().includes(q)
    );
  }, [clientes, busquedaClienteDebounced]);

  // Handler para seleccionar cliente existente
  const handleClienteSeleccionado = (clienteId) => {
    const clienteSeleccionado = clientes.find((c) => c.id === clienteId);
    if (!clienteSeleccionado) {
      alert("Cliente no encontrado");
      return;
    }

    if (onClienteSeleccionado) {
      onClienteSeleccionado(clienteId, clienteSeleccionado);
    }
    setDropdownClientesOpen(false);
    onClose();
  };

  // Handler para guardar nuevo cliente y asignarlo
  const handleGuardarNuevoClienteYAsignar = async () => {
    try {
      if (!nuevoCliente.nombre || !nuevoCliente.direccion || !nuevoCliente.telefono) {
        alert("Nombre, dirección y teléfono son obligatorios");
        return;
      }

      const clienteObj = {
        nombre: nuevoCliente.nombre,
        cuit: nuevoCliente.cuit || "",
        direccion: nuevoCliente.direccion,
        telefono: nuevoCliente.telefono,
        email: nuevoCliente.email || "",
        localidad: nuevoCliente.localidad || "",
        partido: nuevoCliente.partido || "",
        barrio: nuevoCliente.barrio || "",
        area: nuevoCliente.area || "",
        lote: nuevoCliente.lote || "",
        descripcion: nuevoCliente.descripcion || "",
        esClienteViejo: nuevoCliente.esClienteViejo || false,
      };

      // Crear cliente en Firestore
      const docRef = await addDoc(collection(db, "clientes"), clienteObj);
      const nuevoClienteConId = { ...clienteObj, id: docRef.id };

      // Usar callback específico o el genérico
      const callback = onClienteCreado || onClienteSeleccionado;
      if (callback) {
        callback(docRef.id, nuevoClienteConId);
      }

      // Resetear formulario y cerrar modales
      setNuevoCliente({
        nombre: "",
        direccion: "",
        telefono: "",
        cuit: "",
        email: "",
        localidad: "",
        partido: "",
        barrio: "",
        area: "",
        lote: "",
        descripcion: "",
        esClienteViejo: false,
      });
      setOpenNuevoCliente(false);
      onClose();
      setActiveTab("datos");
    } catch (error) {
      console.error("Error al crear cliente:", error);
      alert("Error al crear el cliente");
    }
  };

  return (
    <>
      {/* Modal principal para cambiar cliente */}
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="w-[95vw] max-w-[600px] max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <Icon icon="heroicons:user-circle" className="w-6 h-6" />
              Cambiar Cliente
            </DialogTitle>
            <DialogDescription className="text-base text-default-600">
              Selecciona un cliente existente o crea uno nuevo
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col h-full">
            {/* Selector de clientes existentes */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Seleccionar Cliente Existente
              </label>
              <div className="relative w-full">
                <div
                  className="w-full flex items-center cursor-pointer bg-card border border-default-300 rounded-lg h-10 px-3 text-sm justify-between items-center transition duration-300 focus-within:border-default-500/50 focus-within:outline-none"
                  onClick={() => setDropdownClientesOpen(!dropdownClientesOpen)}
                  tabIndex={0}
                  role="button"
                  aria-haspopup="listbox"
                  aria-expanded={dropdownClientesOpen}
                >
                  <span className="flex-1 truncate">
                    {clienteActual
                      ? `${(clienteActual.nombre || "").toUpperCase()} - ${(clienteActual.cuit || "").toUpperCase()}`
                      : "Seleccionar cliente..."}
                  </span>
                  <Icon
                    icon="heroicons:chevron-down"
                    className="w-5 h-5 ml-2 text-default-600"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-primary dark:text-primary-300 font-semibold ml-2"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenNuevoCliente(true);
                    }}
                  >
                    <Icon icon="heroicons:user-plus" className="w-4 h-4 mr-1" />
                    Nuevo
                  </Button>
                </div>
                {dropdownClientesOpen && (
                  <div className="absolute z-50 min-w-[8rem] overflow-hidden rounded-md border border-solid border-default-300 bg-card text-default-900 shadow-md mt-1 max-h-72 w-full animate-fade-in">
                    <div className="p-2">
                      <Input
                        type="text"
                        placeholder="Buscar por nombre o teléfono..."
                        value={busquedaCliente}
                        onChange={(e) => setBusquedaCliente(e.target.value)}
                        className="w-full mb-2"
                        autoFocus
                      />
                      <div className="divide-y divide-gray-100 max-h-60 overflow-y-auto">
                        {clientesFiltrados.length === 0 && (
                          <div className="p-2 text-gray-400 dark:text-default-500 text-sm">
                            No hay clientes
                          </div>
                        )}
                        {clientesFiltrados.map((c) => (
                          <div
                            key={c.id}
                            className={`relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 px-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground hover:bg-accent hover:text-accent-foreground transition-colors ${
                              clienteActual?.id === c.id ? "bg-blue-50" : ""
                            }`}
                            onClick={() => {
                              handleClienteSeleccionado(c.id);
                            }}
                            role="option"
                            tabIndex={0}
                          >
                            {c.nombre?.toUpperCase() || ""} - {c.telefono || ""}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                onClose();
                setDropdownClientesOpen(false);
                setBusquedaCliente("");
              }}
            >
              Cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal para nuevo cliente - Mismo diseño que en creación */}
      <Dialog open={openNuevoCliente} onOpenChange={setOpenNuevoCliente}>
        <DialogContent className="w-[95vw] max-w-[600px] max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <Icon icon="heroicons:user-plus" className="w-6 h-6" />
              Agregar Cliente
            </DialogTitle>
            <DialogDescription className="text-base text-default-600">
              Complete los datos del nuevo cliente para agregarlo al sistema.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col h-full">
            {/* Pestañas */}
            <div className="flex border-b border-gray-200 mb-4">
              <button
                type="button"
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === "datos"
                    ? "border-blue-500 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
                onClick={() => setActiveTab("datos")}
              >
                Datos Básicos
              </button>
              <button
                type="button"
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === "ubicacion"
                    ? "border-blue-500 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
                onClick={() => setActiveTab("ubicacion")}
              >
                Ubicación
              </button>
              <button
                type="button"
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === "adicional"
                    ? "border-blue-500 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
                onClick={() => setActiveTab("adicional")}
              >
                Adicional
              </button>
            </div>

            {/* Contenido de las pestañas */}
            <div className="flex-1 overflow-y-auto">
              {activeTab === "datos" && (
                <div className="space-y-4">
                  {/* Checkbox para cliente antiguo */}
                  <div className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                    <input
                      type="checkbox"
                      id="esClienteViejo"
                      checked={nuevoCliente.esClienteViejo}
                      onChange={(e) =>
                        setNuevoCliente({
                          ...nuevoCliente,
                          esClienteViejo: e.target.checked,
                        })
                      }
                      className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                    />
                    <label
                      htmlFor="esClienteViejo"
                      className="text-sm font-medium text-blue-800 dark:text-blue-200"
                    >
                      ¿Es un cliente antiguo?
                    </label>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Nombre *
                      </label>
                      <Input
                        placeholder="Nombre completo"
                        className="w-full"
                        value={nuevoCliente.nombre}
                        onChange={(e) =>
                          setNuevoCliente({
                            ...nuevoCliente,
                            nombre: e.target.value,
                          })
                        }
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        CUIT / DNI
                      </label>
                      <Input
                        placeholder="CUIT o DNI"
                        className="w-full"
                        value={nuevoCliente.cuit || ""}
                        onChange={(e) =>
                          setNuevoCliente({
                            ...nuevoCliente,
                            cuit: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Teléfono *
                      </label>
                      <Input
                        placeholder="Teléfono"
                        className="w-full"
                        value={nuevoCliente.telefono}
                        onChange={(e) =>
                          setNuevoCliente({
                            ...nuevoCliente,
                            telefono: e.target.value,
                          })
                        }
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Email
                      </label>
                      <Input
                        placeholder="Email"
                        type="email"
                        className="w-full"
                        value={nuevoCliente.email || ""}
                        onChange={(e) =>
                          setNuevoCliente({
                            ...nuevoCliente,
                            email: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Dirección *
                      </label>
                      <Input
                        placeholder="Dirección completa"
                        className="w-full"
                        value={nuevoCliente.direccion}
                        onChange={(e) =>
                          setNuevoCliente({
                            ...nuevoCliente,
                            direccion: e.target.value,
                          })
                        }
                        required
                      />
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "ubicacion" && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Localidad
                      </label>
                      <Input
                        placeholder="Localidad"
                        className="w-full"
                        value={nuevoCliente.localidad || ""}
                        onChange={(e) =>
                          setNuevoCliente({
                            ...nuevoCliente,
                            localidad: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Partido
                      </label>
                      <Input
                        placeholder="Partido"
                        className="w-full"
                        value={nuevoCliente.partido || ""}
                        onChange={(e) =>
                          setNuevoCliente({
                            ...nuevoCliente,
                            partido: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Barrio
                      </label>
                      <Input
                        placeholder="Barrio"
                        className="w-full"
                        value={nuevoCliente.barrio || ""}
                        onChange={(e) =>
                          setNuevoCliente({
                            ...nuevoCliente,
                            barrio: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Área
                      </label>
                      <Input
                        placeholder="Área"
                        className="w-full"
                        value={nuevoCliente.area || ""}
                        onChange={(e) =>
                          setNuevoCliente({
                            ...nuevoCliente,
                            area: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Lote
                      </label>
                      <Input
                        placeholder="Lote"
                        className="w-full"
                        value={nuevoCliente.lote || ""}
                        onChange={(e) =>
                          setNuevoCliente({
                            ...nuevoCliente,
                            lote: e.target.value,
                          })
                        }
                      />
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "adicional" && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Descripción
                    </label>
                    <Textarea
                      placeholder="Información adicional sobre el cliente"
                      className="w-full min-h-[120px]"
                      value={nuevoCliente.descripcion || ""}
                      onChange={(e) =>
                        setNuevoCliente({
                          ...nuevoCliente,
                          descripcion: e.target.value,
                        })
                      }
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Navegación y botones */}
            <div className="flex items-center justify-between pt-4 border-t border-gray-200">
              <div className="flex gap-2">
                {activeTab !== "datos" && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      if (activeTab === "ubicacion") setActiveTab("datos");
                      if (activeTab === "adicional") setActiveTab("ubicacion");
                    }}
                    className="text-sm"
                  >
                    Anterior
                  </Button>
                )}
                {activeTab !== "adicional" && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      if (activeTab === "datos") setActiveTab("ubicacion");
                      if (activeTab === "ubicacion") setActiveTab("adicional");
                    }}
                    disabled={
                      (activeTab === "datos" &&
                        (!nuevoCliente.nombre ||
                          !nuevoCliente.direccion ||
                          !nuevoCliente.telefono)) ||
                      (activeTab === "ubicacion" &&
                        (!nuevoCliente.nombre ||
                          !nuevoCliente.direccion ||
                          !nuevoCliente.telefono))
                    }
                    className="text-sm"
                  >
                    Siguiente
                  </Button>
                )}
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setOpenNuevoCliente(false);
                    setActiveTab("datos");
                  }}
                  className="text-sm"
                >
                  Cancelar
                </Button>
                <Button
                  variant="default"
                  onClick={handleGuardarNuevoClienteYAsignar}
                  disabled={
                    !nuevoCliente.nombre ||
                    !nuevoCliente.direccion ||
                    !nuevoCliente.telefono
                  }
                  className="text-sm"
                >
                  Guardar y Asignar
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ModalCambiarCliente;
