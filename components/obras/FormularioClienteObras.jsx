"use client";
import React, { useState, useEffect } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, User, Phone, MapPin, Home } from "lucide-react";
import { db } from "@/lib/firebase";
import { doc, addDoc, updateDoc, collection, getDoc } from "firebase/firestore";

/**
 * Formulario exclusivo para crear/editar clientes desde el módulo de Obras y Presupuestos
 * 
 * Campos mostrados:
 * - Nombre completo (obligatorio)
 * - Teléfono (obligatorio)
 * - Lugar (opcional) - mapea a direccion o localidad
 * - Lote (opcional)
 * - Barrio (opcional)
 * 
 * Preserva todos los demás campos existentes del cliente (cuit, email, partido, area, etc.)
 */
const FormularioClienteObras = ({
  open,
  onClose,
  clienteExistente = null, // Si se pasa, es edición
  onClienteGuardado, // Callback: (clienteId, clienteData) => void
}) => {
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  // Campos del formulario (solo los necesarios)
  const [formData, setFormData] = useState({
    nombre: "",
    telefono: "",
    lugar: "", // Se mapea a direccion o localidad
    lote: "",
    barrio: "",
  });

  // Cargar datos del cliente existente si se está editando
  // OPTIMIZADO: Usa datos existentes primero, solo consulta Firestore si faltan datos críticos
  useEffect(() => {
    if (open) {
      if (clienteExistente) {
        // Si el objeto ya tiene los datos necesarios, usarlos directamente (más rápido)
        if (clienteExistente.nombre || clienteExistente.telefono) {
          setFormData({
            nombre: clienteExistente.nombre || "",
            telefono: clienteExistente.telefono || "",
            lugar: clienteExistente.direccion || clienteExistente.localidad || "",
            lote: clienteExistente.lote || "",
            barrio: clienteExistente.barrio || "",
          });
        } else if (clienteExistente.id) {
          // Solo consultar Firestore si NO tenemos los datos básicos
          const cargarCliente = async () => {
            try {
              const clienteDoc = await getDoc(doc(db, "clientes", clienteExistente.id));
              if (clienteDoc.exists()) {
                const data = clienteDoc.data();
                setFormData({
                  nombre: data.nombre || "",
                  telefono: data.telefono || "",
                  lugar: data.direccion || data.localidad || "",
                  lote: data.lote || "",
                  barrio: data.barrio || "",
                });
              }
            } catch (error) {
              console.error("Error al cargar cliente:", error);
              setError("Error al cargar datos del cliente");
            }
          };
          cargarCliente();
        }
      } else {
        // Nuevo cliente - resetear formulario
        setFormData({
          nombre: "",
          telefono: "",
          lugar: "",
          lote: "",
          barrio: "",
        });
      }
      setError("");
    }
  }, [open, clienteExistente]);

  const handleInputChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setError("");
  };

  const handleGuardar = async () => {
    // Validaciones
    if (!formData.nombre?.trim()) {
      setError("El nombre completo es obligatorio");
      return;
    }
    if (!formData.telefono?.trim()) {
      setError("El teléfono es obligatorio");
      return;
    }

    setGuardando(true);
    setError("");

    try {
      let clienteId;
      let clienteData;

      if (clienteExistente?.id) {
        // EDITAR cliente existente
        clienteId = clienteExistente.id;
        const clienteDoc = await getDoc(doc(db, "clientes", clienteId));
        
        if (!clienteDoc.exists()) {
          throw new Error("Cliente no encontrado");
        }

        const datosActuales = clienteDoc.data();
        
        // Preparar datos actualizados - PRESERVAR todos los campos existentes
        const datosActualizados = {
          ...datosActuales, // Preservar todos los campos existentes
          nombre: formData.nombre.trim(),
          telefono: formData.telefono.trim(),
          // Si lugar tiene contenido, actualizar direccion (prioridad sobre localidad)
          direccion: formData.lugar.trim() || datosActuales.direccion || "",
          localidad: formData.lugar.trim() || datosActuales.localidad || "",
          lote: formData.lote.trim() || "",
          barrio: formData.barrio.trim() || "",
          actualizadoEn: new Date().toISOString(),
        };

        await updateDoc(doc(db, "clientes", clienteId), datosActualizados);
        clienteData = { id: clienteId, ...datosActualizados };
      } else {
        // CREAR nuevo cliente
        const nuevoCliente = {
          nombre: formData.nombre.trim(),
          telefono: formData.telefono.trim(),
          direccion: formData.lugar.trim() || "",
          localidad: formData.lugar.trim() || "",
          lote: formData.lote.trim() || "",
          barrio: formData.barrio.trim() || "",
          // Campos opcionales con valores por defecto
          cuit: "",
          email: "",
          partido: "",
          area: "",
          descripcion: "",
          esClienteViejo: false,
          codigoPostal: "",
          provincia: "",
          creadoEn: new Date().toISOString(),
          actualizadoEn: new Date().toISOString(),
        };

        const docRef = await addDoc(collection(db, "clientes"), nuevoCliente);
        clienteId = docRef.id;
        clienteData = { id: clienteId, ...nuevoCliente };
      }

      // Llamar callback con el cliente guardado
      if (onClienteGuardado) {
        onClienteGuardado(clienteId, clienteData);
      }

      // Cerrar formulario
      onClose();
    } catch (error) {
      console.error("Error al guardar cliente:", error);
      setError(error.message || "Error al guardar el cliente");
    } finally {
      setGuardando(false);
    }
  };

  const esEdicion = !!clienteExistente;

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="border-b pb-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center shadow-md">
              <User className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <SheetTitle className="text-lg font-bold text-gray-900">
                {esEdicion ? "Editar Cliente" : "Nuevo Cliente"}
              </SheetTitle>
              <SheetDescription className="text-sm text-gray-600 mt-1">
                {esEdicion
                  ? "Modifica los datos del cliente"
                  : "Completa los datos básicos del cliente"}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="space-y-6 py-4">
          {/* Mensaje de error */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
              {error}
            </div>
          )}

          {/* Nombre completo - OBLIGATORIO */}
          <div className="space-y-2">
            <Label htmlFor="nombre" className="flex items-center gap-2">
              <User className="w-4 h-4 text-gray-500" />
              Nombre completo <span className="text-red-500">*</span>
            </Label>
            <Input
              id="nombre"
              value={formData.nombre}
              onChange={(e) => handleInputChange("nombre", e.target.value)}
              placeholder="Ej: Juan Pérez"
              className="w-full"
              disabled={guardando}
            />
          </div>

          {/* Teléfono - OBLIGATORIO */}
          <div className="space-y-2">
            <Label htmlFor="telefono" className="flex items-center gap-2">
              <Phone className="w-4 h-4 text-gray-500" />
              Teléfono <span className="text-red-500">*</span>
            </Label>
            <Input
              id="telefono"
              value={formData.telefono}
              onChange={(e) => handleInputChange("telefono", e.target.value)}
              placeholder="Ej: 11 1234-5678"
              className="w-full"
              disabled={guardando}
            />
          </div>

          {/* Lugar - OPCIONAL */}
          <div className="space-y-2">
            <Label htmlFor="lugar" className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-gray-500" />
              Lugar
            </Label>
            <Input
              id="lugar"
              value={formData.lugar}
              onChange={(e) => handleInputChange("lugar", e.target.value)}
              placeholder="Dirección o localidad"
              className="w-full"
              disabled={guardando}
            />
            <p className="text-xs text-gray-500">
              Puede ser una dirección completa o solo la localidad
            </p>
          </div>

          {/* Barrio - OPCIONAL */}
          <div className="space-y-2">
            <Label htmlFor="barrio" className="flex items-center gap-2">
              <Home className="w-4 h-4 text-gray-500" />
              Barrio
            </Label>
            <Input
              id="barrio"
              value={formData.barrio}
              onChange={(e) => handleInputChange("barrio", e.target.value)}
              placeholder="Ej: Centro"
              className="w-full"
              disabled={guardando}
            />
          </div>

          {/* Lote - OPCIONAL */}
          <div className="space-y-2">
            <Label htmlFor="lote">Lote</Label>
            <Input
              id="lote"
              value={formData.lote}
              onChange={(e) => handleInputChange("lote", e.target.value)}
              placeholder="Ej: Lote 15"
              className="w-full"
              disabled={guardando}
            />
          </div>

          {/* Nota informativa */}
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
            <p className="font-medium mb-1">Información importante:</p>
            <p className="text-xs">
              {esEdicion
                ? "Los demás datos del cliente (CUIT, email, etc.) se mantienen sin cambios."
                : "Los demás campos (CUIT, email, etc.) pueden completarse más tarde desde la sección de Clientes."}
            </p>
          </div>
        </div>

        <SheetFooter className="flex flex-col sm:flex-row gap-3 pt-6 border-t mt-6">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={guardando}
            className="w-full sm:w-auto"
          >
            Cancelar
          </Button>
          <Button
            onClick={handleGuardar}
            disabled={guardando || !formData.nombre?.trim() || !formData.telefono?.trim()}
            className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white"
          >
            {guardando ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Guardando...
              </>
            ) : (
              <>
                {esEdicion ? "Actualizar Cliente" : "Crear Cliente"}
              </>
            )}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};

export default FormularioClienteObras;

