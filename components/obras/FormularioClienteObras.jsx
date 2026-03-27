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
import { Label } from "@/components/ui/label";
import { Loader2, User, Phone, MapPin, Home, FileText } from "lucide-react";
import { db } from "@/lib/firebase";
import { doc, addDoc, updateDoc, collection, getDoc } from "firebase/firestore";

const FormularioClienteObras = ({
  open,
  onClose,
  clienteExistente = null,
  onClienteGuardado,
  mode = "obras",
  submitLabel = null,
}) => {
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [formData, setFormData] = useState({
    nombre: "",
    telefono: "",
    lugar: "",
    direccion: "",
    cuit: "",
    lote: "",
    barrio: "",
  });

  useEffect(() => {
    if (open) {
      if (clienteExistente) {
        if (clienteExistente.nombre || clienteExistente.telefono) {
          setFormData({
            nombre: clienteExistente.nombre || "",
            telefono: clienteExistente.telefono || "",
            lugar: clienteExistente.direccion || clienteExistente.localidad || "",
            direccion: clienteExistente.direccion || "",
            cuit: clienteExistente.cuit || "",
            lote: clienteExistente.lote || "",
            barrio: clienteExistente.barrio || "",
          });
        } else if (clienteExistente.id) {
          const cargarCliente = async () => {
            try {
              const clienteDoc = await getDoc(doc(db, "clientes", clienteExistente.id));
              if (clienteDoc.exists()) {
                const data = clienteDoc.data();
                setFormData({
                  nombre: data.nombre || "",
                  telefono: data.telefono || "",
                  lugar: data.direccion || data.localidad || "",
                  direccion: data.direccion || "",
                  cuit: data.cuit || "",
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
        setFormData({
          nombre: "",
          telefono: "",
          lugar: "",
          direccion: "",
          cuit: "",
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
      const esModoGeneral = mode === "general";
      const direccionGeneral = formData.direccion.trim();
      const cuitGeneral = formData.cuit.trim();
      const lugarObras = formData.lugar.trim();

      if (clienteExistente?.id) {
        clienteId = clienteExistente.id;
        const clienteDoc = await getDoc(doc(db, "clientes", clienteId));
        if (!clienteDoc.exists()) {
          throw new Error("Cliente no encontrado");
        }
        const datosActuales = clienteDoc.data();
        const datosActualizados = {
          ...datosActuales,
          nombre: formData.nombre.trim(),
          telefono: formData.telefono.trim(),
          direccion: esModoGeneral
            ? direccionGeneral
            : lugarObras || datosActuales.direccion || "",
          localidad: esModoGeneral
            ? datosActuales.localidad || ""
            : lugarObras || datosActuales.localidad || "",
          cuit: esModoGeneral ? cuitGeneral : datosActuales.cuit || "",
          lote: esModoGeneral ? datosActuales.lote || "" : formData.lote.trim() || "",
          barrio: esModoGeneral
            ? datosActuales.barrio || ""
            : formData.barrio.trim() || "",
          actualizadoEn: new Date().toISOString(),
        };

        await updateDoc(doc(db, "clientes", clienteId), datosActualizados);
        clienteData = { id: clienteId, ...datosActualizados };
      } else {
        const nuevoCliente = esModoGeneral
          ? {
              nombre: formData.nombre.trim(),
              telefono: formData.telefono.trim(),
              direccion: direccionGeneral,
              cuit: cuitGeneral,
              email: "",
              localidad: "",
              partido: "",
              barrio: "",
              area: "",
              lote: "",
              descripcion: "",
              esClienteViejo: false,
              codigoPostal: "",
              provincia: "",
              estado: "Activo",
              creadoEn: new Date().toISOString(),
              actualizadoEn: new Date().toISOString(),
            }
          : {
              nombre: formData.nombre.trim(),
              telefono: formData.telefono.trim(),
              direccion: lugarObras,
              localidad: lugarObras,
              lote: formData.lote.trim() || "",
              barrio: formData.barrio.trim() || "",
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

      if (onClienteGuardado) {
        onClienteGuardado(clienteId, clienteData);
      }

      onClose();
    } catch (error) {
      console.error("Error al guardar cliente:", error);
      setError(error.message || "Error al guardar el cliente");
    } finally {
      setGuardando(false);
    }
  };

  const esEdicion = !!clienteExistente;
  const esModoGeneral = mode === "general";
  const submitText =
    submitLabel || (esEdicion ? "Actualizar Cliente" : "Crear Cliente");

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="w-[95vw] max-w-[600px] max-h-[90vh] overflow-y-auto p-0">
        <DialogHeader className="border-b px-6 pt-6 pb-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center shadow-md">
              <User className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <DialogTitle className="text-lg font-bold text-gray-900">
                {esEdicion ? "Editar Cliente" : "Nuevo Cliente"}
              </DialogTitle>
              <DialogDescription className="text-sm text-gray-600 mt-1">
                {esEdicion
                  ? "Modifica los datos del cliente"
                  : "Completa los datos básicos del cliente"}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-6 px-6 pb-6">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
              {error}
            </div>
          )}

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

          {esModoGeneral ? (
            <div className="space-y-2">
              <Label htmlFor="direccion" className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-gray-500" />
                Dirección
              </Label>
              <Input
                id="direccion"
                value={formData.direccion}
                onChange={(e) => handleInputChange("direccion", e.target.value)}
                placeholder="Dirección completa"
                className="w-full"
                disabled={guardando}
              />
            </div>
          ) : (
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
          )}

          {esModoGeneral && (
            <div className="space-y-2">
              <Label htmlFor="cuit" className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-gray-500" />
                CUIT
              </Label>
              <Input
                id="cuit"
                value={formData.cuit}
                onChange={(e) => handleInputChange("cuit", e.target.value)}
                placeholder="Opcional"
                className="w-full"
                disabled={guardando}
              />
            </div>
          )}

          {!esModoGeneral && (
            <>
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
            </>
          )}

          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
            <p className="font-medium mb-1">Información importante:</p>
            <p className="text-xs">
              {esEdicion
                ? "Los demás datos del cliente (CUIT, email, etc.) se mantienen sin cambios."
                : esModoGeneral
                  ? "Podés completar más datos del cliente más adelante desde la sección de Clientes."
                  : "Los demás campos (CUIT, email, etc.) pueden completarse más tarde desde la sección de Clientes."}
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 pt-6 border-t mt-6 px-6 pb-6">
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
              <>{submitText}</>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default FormularioClienteObras;

