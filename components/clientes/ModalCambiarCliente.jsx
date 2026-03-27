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
import { Icon } from "@iconify/react";
import FormularioClienteObras from "@/components/obras/FormularioClienteObras";

/**
 * Modal para cambiar cliente en presupuestos y ventas
 * Reutiliza el mismo diseño que se usa en la creación
 */
const ModalCambiarCliente = ({
  open,
  onClose,
  clienteActual = null,
  clientes = [],
  onClienteSeleccionado,
  onClienteCreado,
}) => {
  const [dropdownClientesOpen, setDropdownClientesOpen] = useState(false);
  const [busquedaCliente, setBusquedaCliente] = useState("");
  const [busquedaClienteDebounced, setBusquedaClienteDebounced] = useState("");
  const [openNuevoCliente, setOpenNuevoCliente] = useState(false);

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

  return (
    <>
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

      <FormularioClienteObras
        open={openNuevoCliente}
        onClose={() => setOpenNuevoCliente(false)}
        onClienteGuardado={(clienteId, clienteData) => {
          const callback = onClienteCreado || onClienteSeleccionado;
          if (callback) {
            callback(clienteId, clienteData);
          }
          setOpenNuevoCliente(false);
          onClose();
        }}
        mode="general"
        submitLabel="Guardar y Asignar"
      />
    </>
  );
};

export default ModalCambiarCliente;
