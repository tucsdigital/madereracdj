"use client";
import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, User, Phone, MapPin, Home, FileText, X } from "lucide-react";
import { db } from "@/lib/firebase";
import { doc, addDoc, updateDoc, collection, getDoc } from "firebase/firestore";
import GoogleAddressInput from "@/components/ui/google-address-input";

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
    localidad: "",
    dni: "",
    cuit: "",
    lote: "",
    barrio: "",
    mapsUrl: "",
    lat: null,
    lng: null,
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
            localidad: clienteExistente.localidad || "",
            dni: clienteExistente.dni || "",
            cuit: clienteExistente.cuit || "",
            lote: clienteExistente.lote || "",
            barrio: clienteExistente.barrio || "",
              mapsUrl: clienteExistente.mapsUrl || "",
              lat: clienteExistente.lat ?? null,
              lng: clienteExistente.lng ?? null,
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
                  localidad: data.localidad || "",
                  dni: data.dni || "",
                  cuit: data.cuit || "",
                  lote: data.lote || "",
                  barrio: data.barrio || "",
                  mapsUrl: data.mapsUrl || "",
                  lat: data.lat ?? null,
                  lng: data.lng ?? null,
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
          localidad: "",
          dni: "",
          cuit: "",
          lote: "",
          barrio: "",
          mapsUrl: "",
          lat: null,
          lng: null,
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
      const localidadGeneral = formData.localidad.trim();
      const dniGeneral = formData.dni.trim().replace(/\D/g, "");
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
            ? localidadGeneral
            : lugarObras || datosActuales.localidad || "",
          cuit: datosActuales.cuit || "",
          dni: esModoGeneral ? dniGeneral : datosActuales.dni || "",
          lote: esModoGeneral ? datosActuales.lote || "" : formData.lote.trim() || "",
          barrio: esModoGeneral
            ? datosActuales.barrio || ""
            : formData.barrio.trim() || "",
          mapsUrl: formData.mapsUrl || datosActuales.mapsUrl || "",
          lat: formData.lat ?? datosActuales.lat ?? null,
          lng: formData.lng ?? datosActuales.lng ?? null,
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
              dni: dniGeneral,
              cuit: "",
              email: "",
              localidad: localidadGeneral,
              partido: "",
              barrio: "",
              area: "",
              lote: "",
              descripcion: "",
              esClienteViejo: false,
              codigoPostal: "",
              provincia: "",
              mapsUrl: formData.mapsUrl || "",
              lat: formData.lat ?? null,
              lng: formData.lng ?? null,
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
              dni: "",
              email: "",
              partido: "",
              area: "",
              descripcion: "",
              esClienteViejo: false,
              codigoPostal: "",
              provincia: "",
              mapsUrl: formData.mapsUrl || "",
              lat: formData.lat ?? null,
              lng: formData.lng ?? null,
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
      <DialogContent
        hiddenCloseIcon
        className="flex h-[90vh] max-h-[760px] w-[95vw] max-w-[640px] flex-col gap-0 overflow-hidden rounded-2xl border border-border bg-card p-0 shadow-2xl"
        onPointerDownOutside={(event) => {
          // El dropdown de Google Places se monta fuera del Dialog; evitar que se interprete como click afuera y cierre/interrumpa la selección.
          if (event.target?.closest?.(".pac-container")) {
            event.preventDefault();
          }
        }}
        onInteractOutside={(event) => {
          if (event.target?.closest?.(".pac-container")) {
            event.preventDefault();
          }
        }}
      >
        <DialogHeader className="flex shrink-0 flex-row items-center justify-between gap-4 space-y-0 border-b border-border px-5 py-4 text-left sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <User className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-base font-semibold text-foreground">
                {esEdicion ? "Editar Cliente" : "Nuevo Cliente"}
              </DialogTitle>
              <DialogDescription className="mt-0.5 text-sm text-default-500">
                {esEdicion
                  ? "Modifica los datos del cliente"
                  : "Completa los datos básicos del cliente"}
              </DialogDescription>
            </div>
          </div>
          <DialogClose asChild>
            <button type="button" aria-label="Cerrar" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border text-default-500 transition-colors hover:bg-default-100 hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </DialogClose>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">
          <div className="space-y-5">
          {error && (
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive" role="alert">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="nombre" className="flex items-center gap-2">
              <User className="h-4 w-4 text-default-500" />
              Nombre completo <span className="text-destructive">*</span>
            </Label>
            <Input
              id="nombre"
              value={formData.nombre}
              onChange={(e) => handleInputChange("nombre", e.target.value)}
              placeholder="Ej: Juan Pérez"
              className="h-10 w-full rounded-lg"
              disabled={guardando}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="telefono" className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-default-500" />
              Teléfono <span className="text-destructive">*</span>
            </Label>
            <Input
              id="telefono"
              value={formData.telefono}
              onChange={(e) => handleInputChange("telefono", e.target.value)}
              placeholder="Ej: 11 1234-5678"
              className="h-10 w-full rounded-lg"
              disabled={guardando}
            />
          </div>
          </div>

          {esModoGeneral ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="direccion" className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-default-500" />
                  Dirección
                </Label>
                <GoogleAddressInput
                  id="direccion"
                  value={formData.direccion}
                  onChange={({ address, locality, lat, lng, mapsUrl }) => {
                    setFormData((prev) => ({ ...prev, direccion: address, localidad: locality || prev.localidad, lat, lng, mapsUrl }));
                    setError("");
                  }}
                  placeholder="Dirección completa"
                  className="h-10 w-full rounded-lg"
                  disabled={guardando}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="localidad" className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-default-500" />
                  Localidad
                </Label>
                <Input
                  id="localidad"
                  value={formData.localidad}
                  onChange={(e) => handleInputChange("localidad", e.target.value)}
                  placeholder="Ej: San Miguel"
                  className="h-10 w-full rounded-lg"
                  disabled={guardando}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="lugar" className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-default-500" />
                Lugar
              </Label>
              <GoogleAddressInput
                id="lugar"
                value={formData.lugar}
                onChange={({ address, locality, lat, lng, mapsUrl }) => {
                  setFormData((prev) => ({
                    ...prev,
                    lugar: address,
                    direccion: address,
                    localidad: locality || address,
                    lat,
                    lng,
                    mapsUrl,
                  }));
                  setError("");
                }}
                placeholder="Dirección o localidad"
                className="h-10 w-full rounded-lg"
                disabled={guardando}
              />
              <p className="text-xs text-default-500">
                Puede ser una dirección completa o solo la localidad
              </p>
            </div>
          )}

          {esModoGeneral && (
            <div className="max-w-sm space-y-2">
              <Label htmlFor="dni" className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-default-500" />
                DNI
              </Label>
              <Input
                id="dni"
                value={formData.dni}
                onChange={(e) => handleInputChange("dni", e.target.value.replace(/\D/g, ""))}
                placeholder="Ej: 12345678"
                inputMode="numeric"
                className="h-10 w-full rounded-lg"
                disabled={guardando}
              />
            </div>
          )}

          {!esModoGeneral && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="barrio" className="flex items-center gap-2">
                  <Home className="h-4 w-4 text-default-500" />
                  Barrio
                </Label>
                <Input
                  id="barrio"
                  value={formData.barrio}
                  onChange={(e) => handleInputChange("barrio", e.target.value)}
                  placeholder="Ej: Centro"
                  className="h-10 w-full rounded-lg"
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
                  className="h-10 w-full rounded-lg"
                  disabled={guardando}
                />
              </div>
            </div>
          )}

          <div className="rounded-lg border border-primary/15 bg-primary/5 p-3 text-sm text-foreground">
            <p className="mb-1 font-medium">Información importante</p>
            <p className="text-xs text-default-500">
              {esEdicion
                ? "El CUIT, si corresponde, se administra desde la edición del cliente."
                : esModoGeneral
                  ? "Podés completar CUIT y otros datos desde la edición del cliente."
                  : "Los demás campos (DNI, CUIT, email, etc.) pueden completarse más tarde desde la sección de Clientes."}
            </p>
          </div>
        </div>
        </div>

        <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-border bg-card px-5 py-3 sm:flex-row sm:justify-end sm:px-6">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={guardando}
            className="h-9 w-full rounded-lg sm:w-auto"
          >
            Cancelar
          </Button>
          <Button
            onClick={handleGuardar}
            disabled={guardando || !formData.nombre?.trim() || !formData.telefono?.trim()}
            className="h-9 w-full rounded-lg sm:w-auto"
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

