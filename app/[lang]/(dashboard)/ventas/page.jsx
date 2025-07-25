"use client";
import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  columnsPresupuestos,
  columnsVentas,
} from "../(invoice)/invoice-list/invoice-list-table/components/columns";
import { DataTable } from "../(invoice)/invoice-list/invoice-list-table/components/data-table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";
import {
  Box,
  Layers,
  Settings,
  Loader2,
  CheckCircle,
  AlertCircle,
} from "lucide-react";
import { db } from "@/lib/firebase";
import {
  collection,
  getDocs,
  addDoc,
  doc,
  updateDoc,
  increment,
  serverTimestamp,
} from "firebase/firestore";
import { useRouter, useParams } from "next/navigation";

function FormularioVentaPresupuesto({ tipo, onClose, onSubmit }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState(null);
  const [submitMessage, setSubmitMessage] = useState("");

  // Esquema Yup para presupuesto (mínimo)
  const schemaPresupuesto = yup.object().shape({
    fecha: yup.string().required("La fecha es obligatoria"),
    cliente: yup.object().shape({
      nombre: yup.string().required("Obligatorio"),
      email: yup.string().email("Email inválido").notRequired(),
      telefono: yup.string().required("Obligatorio"),
      direccion: yup.string().required("Obligatorio"),
      cuit: yup.string().notRequired(),
    }),
    items: yup
      .array()
      .of(
        yup.object().shape({
          descripcion: yup.string().required("Obligatorio"),
          cantidad: yup.number().min(1, "Mínimo 1").required("Obligatorio"),
          precio: yup
            .number()
            .min(0, "No puede ser negativo")
            .required("Obligatorio"),
          unidad: yup.string().required("Obligatorio"),
          moneda: yup.string().required("Obligatorio"),
          descuento: yup.number().min(0).max(100),
        })
      )
      .min(1, "Agrega al menos un ítem"),
    tipoEnvio: yup.string().required("Selecciona el tipo de envío"),
    costoEnvio: yup
      .number()
      .transform((value, originalValue) =>
        originalValue === "" || originalValue === undefined ? undefined : value
      )
      .nullable()
      .when("tipoEnvio", {
        is: (val) => val && val !== "retiro_local",
        then: (s) => s.required("La cotización del envío es obligatoria"),
        otherwise: (s) => s.notRequired(),
      }),
  });

  // Esquema Yup para venta (completo)
  const schemaVenta = yup.object().shape({
    fecha: yup.string().required("La fecha es obligatoria"),
    clienteId: yup.string().required("Debe seleccionar un cliente"),
    cliente: yup.object().shape({
      nombre: yup.string().required("Obligatorio"),
      email: yup.string().email("Email inválido").notRequired(),
      telefono: yup.string().required("Obligatorio"),
      direccion: yup.string().required("Obligatorio"),
      cuit: yup.string().notRequired(),
    }),
    items: yup
      .array()
      .of(
        yup.object().shape({
          descripcion: yup.string().required("Obligatorio"),
          cantidad: yup.number().min(1, "Mínimo 1").required("Obligatorio"),
          precio: yup
            .number()
            .min(0, "No puede ser negativo")
            .required("Obligatorio"),
          unidad: yup.string().required("Obligatorio"),
          moneda: yup.string().required("Obligatorio"),
          descuento: yup.number().min(0).max(100),
        })
      )
      .min(1, "Agrega al menos un ítem"),
    formaPago: yup.string().required("Selecciona la forma de pago"),
    pagoParcial: yup.boolean(),
    montoAbonado: yup
      .number()
      .transform((value, originalValue) =>
        originalValue === "" ? undefined : value
      )
      .when("pagoParcial", {
        is: true,
        then: (s) =>
          s
            .typeError("Debe ingresar un monto")
            .min(1, "Debe ingresar un monto")
            .required("Obligatorio"),
        otherwise: (s) => s.notRequired().nullable(true),
      }),
    prioridad: yup.string().required("Selecciona la prioridad"),
    tipoEnvio: yup.string().required("Selecciona el tipo de envío"),
    usarDireccionCliente: yup.boolean().default(true),
    fechaEntrega: yup.string().when("tipoEnvio", {
      is: (val) => val && val !== "retiro_local",
      then: (s) => s.required("La fecha de entrega es obligatoria"),
      otherwise: (s) => s.notRequired(),
    }),
    rangoHorario: yup.string().when("tipoEnvio", {
      is: (val) => val && val !== "retiro_local",
      then: (s) => s.required("El rango horario es obligatorio"),
      otherwise: (s) => s.notRequired(),
    }),
    transportista: yup.string().when("tipoEnvio", {
      is: (val) => val && val !== "retiro_local",
      then: (s) => s.required("Selecciona el transportista"),
      otherwise: (s) => s.notRequired(),
    }),
    costoEnvio: yup
      .number()
      .transform((value, originalValue) =>
        originalValue === "" || originalValue === undefined ? undefined : value
      )
      .nullable()
      .notRequired(),
    observaciones: yup.string().notRequired(),
    direccionEnvio: yup.string().when(["tipoEnvio", "usarDireccionCliente"], {
      is: (tipoEnvio, usarDireccionCliente) =>
        tipoEnvio && tipoEnvio !== "retiro_local" && !usarDireccionCliente,
      then: (s) => s.required("La dirección de envío es obligatoria"),
      otherwise: (s) => s.notRequired(),
    }),
    localidadEnvio: yup.string().when(["tipoEnvio", "usarDireccionCliente"], {
      is: (tipoEnvio, usarDireccionCliente) =>
        tipoEnvio && tipoEnvio !== "retiro_local" && !usarDireccionCliente,
      then: (s) => s.required("La localidad es obligatoria"),
      otherwise: (s) => s.notRequired(),
    }),
    codigoPostal: yup.string().when(["tipoEnvio", "usarDireccionCliente"], {
      is: (tipoEnvio, usarDireccionCliente) =>
        tipoEnvio && tipoEnvio !== "retiro_local" && !usarDireccionCliente,
      then: (s) => s.required("El código postal es obligatorio"),
      otherwise: (s) => s.notRequired(),
    }),
  });

  const schema = tipo === "presupuesto" ? schemaPresupuesto : schemaVenta;

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
    watch,
    reset,
    trigger,
  } = useForm({
    resolver: yupResolver(schema),
    defaultValues: {
      fecha: new Date().toISOString().split("T")[0],
      clienteId: "",
      cliente: { nombre: "", email: "", telefono: "", direccion: "", cuit: "" },
      items: [],
      usarDireccionCliente: true,
    },
  });

  const items = watch("items");
  const [clienteId, setClienteId] = useState("");
  const [clientesState, setClientesState] = useState([]);
  const [clientesLoading, setClientesLoading] = useState(true);
  const clienteSeleccionado = clientesState.find((c) => c.id === clienteId);
  const [openNuevoCliente, setOpenNuevoCliente] = useState(false);
  const [nuevoCliente, setNuevoCliente] = useState({
    nombre: "",
    cuit: "",
    direccion: "",
    telefono: "",
    email: "",
    localidad: "",
  });

  const [productosState, setProductosState] = useState([]);
  const [productosPorCategoria, setProductosPorCategoria] = useState({});
  const [categoriasState, setCategoriasState] = useState([]);
  const [productosLoading, setProductosLoading] = useState(true);

  useEffect(() => {
    setProductosLoading(true);
    const fetchProductos = async () => {
      const snap = await getDocs(collection(db, "productos"));
      const productos = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setProductosState(productos);
      const agrupados = {};
      productos.forEach((p) => {
        if (!agrupados[p.categoria]) agrupados[p.categoria] = [];
        agrupados[p.categoria].push(p);
      });
      setProductosPorCategoria(agrupados);
      setCategoriasState(Object.keys(agrupados));
      setProductosLoading(false);
    };
    fetchProductos();
  }, []);

  const [categoriaId, setCategoriaId] = useState("");
  const [productosSeleccionados, setProductosSeleccionados] = useState([]);
  const [busquedaProducto, setBusquedaProducto] = useState("");

  const handleAgregarProducto = (producto) => {
    const real = productosState.find((p) => p.id === producto.id);
    if (!real) {
      setSubmitStatus("error");
      setSubmitMessage(
        "Solo puedes agregar productos existentes del catálogo."
      );
      return;
    }
    if (!productosSeleccionados.some((p) => p.id === real.id)) {
      let precio =
        real.precioUnidad ||
        real.precioUnidadVenta ||
        real.precioUnidadHerraje ||
        real.precioUnidadQuimico ||
        real.precioUnidadHerramienta;
      let alto = Number(real.espesor) || 0;
      let ancho = Number(real.ancho) || 0;
      let largo = Number(real.largo) || 0;
      let precioPorPie = Number(real.precioUnidad) || 0;
      if (real.categoria === "Maderas") {
        if (alto > 0 && ancho > 0 && largo > 0 && precioPorPie > 0) {
          precio = calcularPrecioCorteMadera({
            alto,
            ancho,
            largo,
            precioPorPie,
          });
        } else {
          setSubmitStatus("error");
          setSubmitMessage(
            "El producto de madera no tiene dimensiones válidas en la base de datos."
          );
          return;
        }
      }
      setProductosSeleccionados([
        ...productosSeleccionados,
        {
          id: real.id,
          nombre: real.nombre,
          precio,
          unidad:
            real.unidadMedida ||
            real.unidadVenta ||
            real.unidadVentaHerraje ||
            real.unidadVentaQuimico ||
            real.unidadVentaHerramienta,
          stock: real.stock,
          cantidad: 1,
          descuento: 0,
          categoria: real.categoria,
          alto,
          ancho,
          largo,
          precioPorPie,
        },
      ]);
    }
  };
  const handleQuitarProducto = (id) => {
    setProductosSeleccionados(
      productosSeleccionados.filter((p) => p.id !== id)
    );
  };
  const handleCantidadChange = (id, cantidad) => {
    setProductosSeleccionados(
      productosSeleccionados.map((p) =>
        p.id === id ? { ...p, cantidad: Number(cantidad) } : p
      )
    );
  };
  const handleDescuentoChange = (id, descuento) => {
    setProductosSeleccionados(
      productosSeleccionados.map((p) =>
        p.id === id ? { ...p, descuento: Number(descuento) } : p
      )
    );
  };

  const subtotal = productosSeleccionados.reduce(
    (acc, p) => acc + Number(p.precio) * Number(p.cantidad),
    0
  );
  const descuentoTotal = productosSeleccionados.reduce(
    (acc, p) => acc + Number(p.descuento) * Number(p.cantidad),
    0
  );
  const iva = (subtotal - descuentoTotal) * 0.21;
  const total = subtotal - descuentoTotal + iva;

  const handleDateChange = (field, date) => {
    setValue(field, date[0]);
  };

  const handleClienteChange = (val) => {
    if (val === "nuevo") {
      setOpenNuevoCliente(true);
    } else {
      setClienteId(val);
      setValue("clienteId", val);
      const clienteObj = clientesState.find((c) => c.id === val);
      if (clienteObj) {
        setValue("cliente", {
          nombre: clienteObj.nombre || "",
          email: clienteObj.email || "",
          telefono: clienteObj.telefono || "",
          direccion: clienteObj.direccion || "",
          cuit: clienteObj.cuit || "",
        });
      }
    }
  };

  const handleGuardarNuevoCliente = async () => {
    const clienteObj = { ...nuevoCliente };
    const docRef = await addDoc(collection(db, "clientes"), clienteObj);
    setClientesState([...clientesState, { ...clienteObj, id: docRef.id }]);
    setClienteId(docRef.id);
    setNuevoCliente({
      nombre: "",
      cuit: "",
      direccion: "",
      telefono: "",
      email: "",
      localidad: "",
    });
    setOpenNuevoCliente(false);
  };

  React.useEffect(() => {
    if (clienteSeleccionado) {
      setValue("cliente", {
        nombre: clienteSeleccionado.nombre || "",
        email: clienteSeleccionado.email || "",
        telefono: clienteSeleccionado.telefono || "",
        direccion: clienteSeleccionado.direccion || "",
        cuit: clienteSeleccionado.cuit || "",
      });
    }
  }, [clienteSeleccionado, setValue]);

  React.useEffect(() => {
    setValue(
      "items",
      productosSeleccionados.map((p) => ({
        descripcion: p.nombre,
        cantidad: p.cantidad,
        precio: p.precio,
        unidad: p.unidad,
        moneda: "$",
        descuento: p.descuento || 0,
      }))
    );
  }, [productosSeleccionados, setValue]);

  useEffect(() => {
    const fetchClientes = async () => {
      setClientesLoading(true);
      const snap = await getDocs(collection(db, "clientes"));
      setClientesState(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
      setClientesLoading(false);
    };
    fetchClientes();
  }, []);

  const [hasSubmitted, setHasSubmitted] = useState(false);

  const handleFormSubmit = async (data) => {
    setHasSubmitted(true);
    console.log("[DEBUG] handleFormSubmit - data recibida:", data);
    setSubmitStatus(null);
    setSubmitMessage("");

    if (!clienteId) {
      setSubmitStatus("error");
      setSubmitMessage("Debe seleccionar un cliente");
      return;
    }
    if (productosSeleccionados.length === 0) {
      setSubmitStatus("error");
      setSubmitMessage("Debe agregar al menos un producto");
      return;
    }
    const productosInvalidos = productosSeleccionados.filter(
      (p) => p.cantidad <= 0
    );
    if (productosInvalidos.length > 0) {
      setSubmitStatus("error");
      setSubmitMessage(
        "Todos los productos deben tener una cantidad mayor a 0"
      );
      return;
    }
    setIsSubmitting(true);
    try {
      const productosLimpios = productosSeleccionados.map((p) => {
        const obj = {
          id: p.id,
          nombre: p.nombre,
          cantidad: p.cantidad,
          precio: p.precio,
          unidad: p.unidad,
          descuento: p.descuento || 0,
          categoria: p.categoria,
        };
        if (p.categoria === "Maderas") {
          obj.alto = Number(p.alto) || 0;
          obj.ancho = Number(p.ancho) || 0;
          obj.largo = Number(p.largo) || 0;
          obj.precioPorPie = Number(p.precioPorPie) || 0;
        }
        return obj;
      });
      let cleanData = { ...data };
      if (cleanData.tipoEnvio === "retiro_local") {
        cleanData.fechaEntrega = undefined;
        cleanData.rangoHorario = undefined;
        cleanData.transportista = undefined;
        cleanData.direccionEnvio = undefined;
        cleanData.localidadEnvio = undefined;
        cleanData.codigoPostal = undefined;
        cleanData.costoEnvio = undefined;
      }
      const formData =
        tipo === "presupuesto"
          ? {
              fecha: cleanData.fecha,
              cliente: cleanData.cliente,
              items: productosLimpios,
              productos: productosLimpios,
              subtotal: subtotal,
              descuentoTotal: descuentoTotal,
              iva: iva,
              total: total,
              fechaCreacion: new Date().toISOString(),
              tipo: tipo,
            }
          : {
              ...cleanData,
              clienteId: clienteId || cleanData.clienteId,
              productos: productosLimpios,
              subtotal: subtotal,
              descuentoTotal: descuentoTotal,
              iva: iva,
              total: total,
              fechaCreacion: new Date().toISOString(),
              tipo: tipo,
            };
      console.log("Datos preparados para envío:", formData);
      await onSubmit(formData);
      setSubmitStatus("success");
      setSubmitMessage(
        `${
          tipo === "presupuesto" ? "Presupuesto" : "Venta"
        } guardado exitosamente`
      );
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (error) {
      console.error("Error al guardar:", error);
      setSubmitStatus("error");
      setSubmitMessage(`Error al guardar: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      onClose();
    }
  };

  const [numeroPedido, setNumeroPedido] = useState(() => `PED-${Date.now()}`);
  const [tipoEnvioSeleccionado, setTipoEnvioSeleccionado] = useState("");
  const [esConFactura, setEsConFactura] = useState(false);
  const transportistas = ["camion", "camioneta 1", "camioneta 2"];
  const vendedores = ["coco", "damian", "lauti", "jose"];
  const prioridades = ["alta", "media", "baja"];

  function calcularPrecioCorteMadera({
    alto,
    ancho,
    largo,
    precioPorPie,
    factor = 0.2734,
  }) {
    if (
      [alto, ancho, largo, precioPorPie].some(
        (v) => typeof v !== "number" || v <= 0
      )
    ) {
      return 0;
    }
    const precio = factor * alto * ancho * largo * precioPorPie;
    return Math.round(precio * 100) / 100;
  }

  const [busquedaCliente, setBusquedaCliente] = useState("");
  const [dropdownClientesOpen, setDropdownClientesOpen] = useState(false);
  const clientesFiltrados = clientesState.filter(
    (c) =>
      c.nombre.toLowerCase().includes(busquedaCliente.toLowerCase()) ||
      c.cuit.toLowerCase().includes(busquedaCliente.toLowerCase()) ||
      (c.localidad || "").toLowerCase().includes(busquedaCliente.toLowerCase())
  );

  const generarId = (tipo) => {
    const num = Math.floor(1000 + Math.random() * 9000);
    return tipo === "presupuesto" ? `PRESU-${num}` : `VENTA-${num}`;
  };
  const [usarDireccionCliente, setUsarDireccionCliente] = useState(true);
  const [fechaEntrega, setFechaEntrega] = useState("");
  const [rangoHorario, setRangoHorario] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [prioridad, setPrioridad] = useState("");

  React.useEffect(() => {
    if (!watch("pagoParcial")) {
      setValue("montoAbonado", "");
    }
  }, [watch("pagoParcial")]);

  React.useEffect(() => {
    if (watch("tipoEnvio") === "retiro_local") {
      setValue("costoEnvio", "");
    }
  }, [watch("tipoEnvio")]);

  React.useEffect(() => {
    if (watch("tipoEnvio") === "retiro_local") {
      setValue("fechaEntrega", "");
      setValue("rangoHorario", "");
      setValue("transportista", "");
      setValue("direccionEnvio", "");
      setValue("localidadEnvio", "");
      setValue("codigoPostal", "");
      setValue("costoEnvio", "");
    }
  }, [watch("tipoEnvio")]);

  return (
    <>
      <DialogHeader className="mb-2">
        <DialogTitle>
          {tipo === "presupuesto" ? "Nuevo Presupuesto" : "Nueva Venta"}
        </DialogTitle>
        <DialogDescription>
          Complete todos los campos requeridos para crear un nuevo{" "}
          {tipo === "presupuesto" ? "presupuesto" : "venta"}.
        </DialogDescription>
      </DialogHeader>

      {submitStatus && (
        <div
          className={`mb-4 p-4 rounded-lg flex items-center gap-3 ${
            submitStatus === "success"
              ? "bg-green-50 border border-green-200 text-green-800"
              : "bg-red-50 border border-red-200 text-red-800"
          }`}
        >
          {submitStatus === "success" ? (
            <CheckCircle className="w-5 h-5 text-green-600" />
          ) : (
            <AlertCircle className="w-5 h-5 text-red-600" />
          )}
          <span className="font-medium">{submitMessage}</span>
        </div>
      )}

      <form
        onSubmit={handleSubmit(handleFormSubmit)}
        className="flex flex-col h-full"
      >
        <div className="flex-1 overflow-y-auto px-1 pb-4 max-h-[calc(85vh-200px)]">
          <div className="flex flex-col gap-6">
            <input
              type="hidden"
              {...register("fecha")}
              value={new Date().toISOString().split("T")[0]}
              readOnly
            />

            <section className="bg-white rounded-lg p-4 border border-default-200 shadow-sm flex flex-col gap-2 mb-2">
              <label className="font-semibold">Cliente</label>
              <div className="relative w-full">
                <div
                  className="border rounded px-2 py-2 w-full flex items-center cursor-pointer bg-white"
                  onClick={() => setDropdownClientesOpen(true)}
                >
                  <span className="flex-1 text-gray-700">
                    {clienteSeleccionado
                      ? `${clienteSeleccionado.nombre} - ${clienteSeleccionado.cuit} - ${clienteSeleccionado.localidad}`
                      : "Seleccionar cliente..."}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenNuevoCliente(true);
                    }}
                    disabled={isSubmitting}
                  >
                    + Nuevo
                  </Button>
                </div>
                {dropdownClientesOpen && (
                  <div className="absolute z-50 bg-white border rounded shadow-lg w-full mt-1 max-h-72 overflow-y-auto">
                    <div className="p-2">
                      <Input
                        type="text"
                        placeholder="Buscar cliente..."
                        value={busquedaCliente}
                        onChange={(e) => setBusquedaCliente(e.target.value)}
                        className="w-full mb-2"
                        autoFocus
                        disabled={clientesLoading || isSubmitting}
                      />
                      <div className="divide-y divide-gray-100">
                        {clientesFiltrados.length === 0 && (
                          <div className="p-2 text-gray-400">
                            No hay clientes
                          </div>
                        )}
                        {clientesFiltrados.map((c) => (
                          <div
                            key={c.id}
                            className="p-2 hover:bg-primary/10 cursor-pointer rounded"
                            onClick={() => {
                              handleClienteChange(c.id);
                              setDropdownClientesOpen(false);
                            }}
                          >
                            {c.nombre} - {c.cuit} - {c.localidad}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
              {errors.clienteId && (
                <span className="text-red-500 text-xs">
                  {errors.clienteId.message}
                </span>
              )}
              <div className="space-y-2 bg-white rounded-lg p-4 border border-default-200 shadow-sm">
                <div className="text-base font-semibold text-default-800 pb-1">
                  Datos del cliente
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <Input
                      value={clienteSeleccionado?.nombre || ""}
                      placeholder="Nombre del cliente"
                      readOnly
                      className="w-full"
                    />
                    {errors.cliente?.nombre && (
                      <span className="text-red-500 text-xs">
                        {errors.cliente?.nombre.message}
                      </span>
                    )}
                  </div>
                  <div>
                    <Input
                      value={clienteSeleccionado?.cuit || ""}
                      placeholder="CUIT"
                      readOnly
                      className="w-full"
                    />
                    {errors.cliente?.cuit && (
                      <span className="text-red-500 text-xs">
                        {errors.cliente?.cuit.message}
                      </span>
                    )}
                  </div>
                  <div>
                    <Input
                      value={clienteSeleccionado?.direccion || ""}
                      placeholder="Dirección"
                      readOnly
                      className="w-full"
                    />
                    {errors.cliente?.direccion && (
                      <span className="text-red-500 text-xs">
                        {errors.cliente?.direccion.message}
                      </span>
                    )}
                  </div>
                  <div>
                    <Input
                      value={clienteSeleccionado?.telefono || ""}
                      placeholder="Teléfono"
                      readOnly
                      className="w-full"
                    />
                    {errors.cliente?.telefono && (
                      <span className="text-red-500 text-xs">
                        {errors.cliente?.telefono.message}
                      </span>
                    )}
                  </div>
                  <div>
                    <Input
                      value={clienteSeleccionado?.email || ""}
                      placeholder="Email"
                      readOnly
                      className="w-full"
                    />
                    {errors.cliente?.email && (
                      <span className="text-red-500 text-xs">
                        {errors.cliente?.email.message}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </section>

            <section className="bg-white rounded-lg p-4 border border-default-200 shadow-sm flex flex-col gap-2 mb-2">
              <label className="font-semibold">Productos</label>
              <div className="flex gap-3 overflow-x-auto pb-2 mb-2">
                {categoriasState.length === 0 && (
                  <span className="text-gray-400">
                    No hay categorías con productos
                  </span>
                )}
                {categoriasState.map((cat) => (
                  <Button
                    key={cat}
                    type="button"
                    variant={categoriaId === cat ? "default" : "soft"}
                    size="sm"
                    color={categoriaId === cat ? "primary" : "secondary"}
                    className="rounded-full px-4 py-1 text-sm flex items-center gap-2 transition-all"
                    onClick={() => setCategoriaId(cat)}
                    disabled={isSubmitting}
                  >
                    {cat}
                  </Button>
                ))}
              </div>
              {categoriaId && (
                <div className="w-full mb-2 animate-fade-in">
                  <div className="mb-2 flex justify-end">
                    <Input
                      type="text"
                      placeholder="Buscar producto..."
                      value={busquedaProducto}
                      onChange={(e) => setBusquedaProducto(e.target.value)}
                      className="w-full md:w-80"
                      disabled={isSubmitting || productosLoading}
                    />
                  </div>
                  {categoriaId === "Maderas" && (
                    <div className="w-full mb-2 animate-fade-in">
                      <div className="divide-y divide-gray-200 bg-white rounded-b">
                        {productosPorCategoria[categoriaId]
                          ?.filter(
                            (prod) =>
                              prod.nombre
                                .toLowerCase()
                                .includes(busquedaProducto.toLowerCase()) ||
                              (prod.unidadMedida || "")
                                .toLowerCase()
                                .includes(busquedaProducto.toLowerCase())
                          )
                          .map((prod) => (
                            <div
                              key={prod.id}
                              className="grid grid-cols-12 gap-2 items-center px-4 py-2"
                            >
                              <div className="col-span-5 font-medium">
                                {prod.nombre}
                              </div>
                              <div className="col-span-2 text-xs text-default-500">
                                {prod.unidadMedida}
                              </div>
                              <div className="col-span-2 font-bold text-primary">
                                ${prod.precioUnidad || prod.precioPorPie || 0}
                              </div>
                              <div className="col-span-2 font-mono text-xs">
                                Stock: {prod.stock}
                                {prod.stock <= 0 && (
                                  <div className="text-red-600 font-semibold text-xs mt-1">
                                    ¡Sin stock! Se permitirá avanzar igual.
                                  </div>
                                )}
                                {prod.stock > 0 && prod.stock <= 3 && (
                                  <div className="text-yellow-600 font-semibold text-xs mt-1">
                                    Stock bajo: quedan {prod.stock} unidades.
                                  </div>
                                )}
                              </div>
                              <div className="col-span-1 flex justify-end">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={
                                    productosSeleccionados.some(
                                      (p) => p.id === prod.id
                                    )
                                      ? "soft"
                                      : "default"
                                  }
                                  color="primary"
                                  className={
                                    productosSeleccionados.some(
                                      (p) => p.id === prod.id
                                    )
                                      ? "bg-yellow-200 text-yellow-700 cursor-default"
                                      : ""
                                  }
                                  onClick={() => {
                                    if (
                                      productosSeleccionados.some(
                                        (p) => p.id === prod.id
                                      )
                                    )
                                      return;
                                    const alto = Number(prod.espesor) || 0;
                                    const ancho = Number(prod.ancho) || 0;
                                    const largo = Number(prod.largo) || 0;
                                    const precioPorPie =
                                      Number(prod.precioUnidad) || 0;
                                    if (
                                      prod.categoria === "Maderas" &&
                                      alto > 0 &&
                                      ancho > 0 &&
                                      largo > 0 &&
                                      precioPorPie > 0
                                    ) {
                                      const precio = calcularPrecioCorteMadera({
                                        alto,
                                        ancho,
                                        largo,
                                        precioPorPie,
                                      });
                                      handleAgregarProducto({
                                        id: prod.id,
                                        nombre: prod.nombre,
                                        precio,
                                        unidad: prod.unidadMedida,
                                        stock: prod.stock,
                                        alto,
                                        ancho,
                                        largo,
                                        precioPorPie,
                                      });
                                    } else if (prod.categoria !== "Maderas") {
                                      handleAgregarProducto({
                                        id: prod.id,
                                        nombre: prod.nombre,
                                        precio:
                                          prod.precioUnidad ||
                                          prod.precioUnidadVenta ||
                                          prod.precioUnidadHerraje ||
                                          prod.precioUnidadQuimico ||
                                          prod.precioUnidadHerramienta,
                                        unidad:
                                          prod.unidadMedida ||
                                          prod.unidadVenta ||
                                          prod.unidadVentaHerraje ||
                                          prod.unidadVentaQuimico ||
                                          prod.unidadVentaHerramienta,
                                        stock: prod.stock,
                                      });
                                    }
                                  }}
                                  disabled={
                                    productosSeleccionados.some(
                                      (p) => p.id === prod.id
                                    ) || isSubmitting
                                  }
                                >
                                  {productosSeleccionados.some(
                                    (p) => p.id === prod.id
                                  )
                                    ? "Agregado"
                                    : "Agregar"}
                                </Button>
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                  {categoriaId !== "Maderas" && (
                    <div className="bg-gray-100 rounded-b">
                      <div className="divide-y divide-gray-200">
                        {productosPorCategoria[categoriaId]
                          ?.filter(
                            (prod) =>
                              prod.nombre
                                .toLowerCase()
                                .includes(busquedaProducto.toLowerCase()) ||
                              (
                                prod.unidadMedida ||
                                prod.unidadVenta ||
                                prod.unidadVentaHerraje ||
                                prod.unidadVentaQuimico ||
                                prod.unidadVentaHerramienta ||
                                ""
                              )
                                .toLowerCase()
                                .includes(busquedaProducto.toLowerCase())
                          )
                          .map((prod) => (
                            <div
                              key={prod.id}
                              className="grid grid-cols-12 gap-2 items-center px-4 py-2"
                            >
                              <div className="col-span-5 font-medium">
                                {prod.nombre}
                              </div>
                              <div className="col-span-2 text-xs text-default-500">
                                {prod.unidadMedida ||
                                  prod.unidadVenta ||
                                  prod.unidadVentaHerraje ||
                                  prod.unidadVentaQuimico ||
                                  prod.unidadVentaHerramienta}
                              </div>
                              <div className="col-span-2 font-bold text-primary">
                                $
                                {prod.precioUnidad ||
                                  prod.precioUnidadVenta ||
                                  prod.precioUnidadHerraje ||
                                  prod.precioUnidadQuimico ||
                                  prod.precioUnidadHerramienta}
                              </div>
                              <div className="col-span-2 font-mono text-xs">
                                {prod.stock}
                              </div>
                              <div className="col-span-1 flex justify-end">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={
                                    productosSeleccionados.some(
                                      (p) => p.id === prod.id
                                    )
                                      ? "soft"
                                      : "default"
                                  }
                                  color="primary"
                                  className={
                                    productosSeleccionados.some(
                                      (p) => p.id === prod.id
                                    )
                                      ? "bg-yellow-200 text-yellow-700 cursor-default"
                                      : ""
                                  }
                                  onClick={() => {
                                    handleAgregarProducto({
                                      id: prod.id,
                                      nombre: prod.nombre,
                                      precio:
                                        prod.precioUnidad ||
                                        prod.precioUnidadVenta ||
                                        prod.precioUnidadHerraje ||
                                        prod.precioUnidadQuimico ||
                                        prod.precioUnidadHerramienta,
                                      unidad:
                                        prod.unidadMedida ||
                                        prod.unidadVenta ||
                                        prod.unidadVentaHerraje ||
                                        prod.unidadVentaQuimico ||
                                        prod.unidadVentaHerramienta,
                                      stock: prod.stock,
                                    });
                                  }}
                                  disabled={
                                    productosSeleccionados.some(
                                      (p) => p.id === prod.id
                                    ) || isSubmitting
                                  }
                                >
                                  {productosSeleccionados.some((p) => p.id === prod.id)
                                    ? "Agregado"
                                    : "Agregar"}
                                </Button>
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
              {productosSeleccionados.length > 0 && (
                <div className="overflow-x-auto mt-4">
                  <table className="w-full text-sm min-w-[700px] border rounded-lg shadow-sm bg-white">
                    <thead>
                      <tr className="bg-primary/10 text-primary font-semibold">
                        <th className="p-2 text-left">Categoría</th>
                        <th className="p-2 text-left">Producto</th>
                        <th className="p-2 text-center">Cant.</th>
                        <th className="p-2 text-center">Precio unit.</th>
                        <th className="p-2 text-center">Desc.</th>
                        <th className="p-2 text-center">Subtotal</th>
                        <th className="p-2 text-center">Acción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {productosSeleccionados.map((p, idx) => (
                        <tr
                          key={p.id}
                          className="border-b hover:bg-primary/5 transition-all"
                        >
                          <td className="p-2 text-xs font-medium text-gray-600">
                            {p.categoria}
                          </td>
                          <td className="p-2">
                            <div className="font-semibold text-default-900">
                              {p.nombre}
                            </div>
                            {p.categoria === "Maderas" && (
                              <div className="flex flex-wrap gap-2 mt-1 text-xs items-center">
                                <span className="font-medium text-gray-500">
                                  Dimensiones:
                                </span>
                                <span>
                                  Alto:{" "}
                                  <span className="font-bold">{p.alto}</span> cm
                                </span>
                                <span>
                                  Ancho:{" "}
                                  <span className="font-bold">{p.ancho}</span>{" "}
                                  cm
                                </span>
                                <span>
                                  Largo:{" "}
                                  <span className="font-bold">{p.largo}</span>{" "}
                                  cm
                                </span>
                                <span>
                                  $/pie:{" "}
                                  <span className="font-bold">
                                    {p.precioPorPie}
                                  </span>
                                </span>
                                <span className="ml-2 text-primary font-semibold">
                                  Precio calculado: ${p.precio}
                                </span>
                                {p.stock <= 0 && (
                                  <span className="text-red-600 font-semibold ml-2">
                                    ¡Sin stock! Se permitirá avanzar igual.
                                  </span>
                                )}
                                {p.stock > 0 && p.stock <= 3 && (
                                  <span className="text-yellow-600 font-semibold ml-2">
                                    Stock bajo: quedan {p.stock} unidades.
                                  </span>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="text-center">
                            <Input
                              type="number"
                              min={1}
                              value={p.cantidad}
                              onChange={(e) =>
                                handleCantidadChange(p.id, e.target.value)
                              }
                              className="w-28 mx-auto text-center text-lg font-bold"
                              disabled={isSubmitting}
                            />
                          </td>
                          <td className="text-center">${p.precio}</td>
                          <td className="text-center">
                            <Input
                              type="number"
                              min={0}
                              max={100}
                              value={p.descuento}
                              onChange={(e) =>
                                handleDescuentoChange(p.id, e.target.value)
                              }
                              className="w-20 mx-auto text-center"
                              disabled={isSubmitting}
                              suffix="%"
                            />
                          </td>
                          <td className="text-center font-semibold text-primary">
                            $
                            {(
                              Number(p.precio) *
                              Number(p.cantidad) *
                              (1 - Number(p.descuento) / 100)
                            ).toFixed(2)}
                          </td>
                          <td className="text-center">
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              onClick={() => handleQuitarProducto(p.id)}
                              disabled={isSubmitting}
                              title="Quitar producto"
                            >
                              <span className="text-lg font-bold text-red-500">
                                ×
                              </span>
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {hasSubmitted && errors.items && (
                <span className="text-red-500 text-xs">
                  {errors.items.message}
                </span>
              )}
            </section>

            <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {tipo === "venta" && (
                <>
                  <div className="space-y-2 bg-white rounded-lg p-4 border border-default-200 shadow-sm">
                    <div className="text-base font-semibold text-default-800 pb-1">
                      Condiciones de pago y entrega
                    </div>
                    <select
                      {...register("formaPago")}
                      className="border rounded px-2 py-2 w-full"
                      disabled={isSubmitting}
                    >
                      <option value="">Forma de pago...</option>
                      <option value="efectivo">Efectivo</option>
                      <option value="transferencia">Transferencia</option>
                      <option value="tarjeta">Tarjeta</option>
                      <option value="cheque">Cheque</option>
                      <option value="otro">Otro</option>
                    </select>
                    {errors.formaPago && (
                      <span className="text-red-500 text-xs">
                        {errors.formaPago.message}
                      </span>
                    )}
                    <div className="flex items-center gap-2 mt-2">
                      <input
                        type="checkbox"
                        id="pagoParcial"
                        {...register("pagoParcial")}
                      />
                      <label htmlFor="pagoParcial" className="text-sm">
                        ¿Pago parcial?
                      </label>
                    </div>
                    {watch("pagoParcial") && (
                      <>
                        <Input
                          type="number"
                          min={0}
                          placeholder="Monto abonado"
                          {...register("montoAbonado")}
                          className="w-full"
                          disabled={isSubmitting}
                        />
                        <div className="text-sm text-gray-600">
                          Resta: $
                          {(total - (watch("montoAbonado") || 0)).toFixed(2)}
                        </div>
                        {errors.montoAbonado && (
                          <span className="text-red-500 text-xs">
                            {errors.montoAbonado.message}
                          </span>
                        )}
                      </>
                    )}
                  </div>

                  <div className="space-y-2 bg-white rounded-lg p-4 border border-default-200 shadow-sm">
                    <div className="text-base font-semibold text-default-800 pb-1">
                      Información de envío
                    </div>
                    <select
                      {...register("tipoEnvio")}
                      value={tipoEnvioSeleccionado}
                      onChange={(e) => {
                        setTipoEnvioSeleccionado(e.target.value);
                        setValue("tipoEnvio", e.target.value, {
                          shouldValidate: true,
                        });
                      }}
                      className="border rounded px-2 py-2 w-full"
                      disabled={isSubmitting}
                    >
                      <option value="">Tipo de envío...</option>
                      <option value="retiro_local">Retiro en local</option>
                      <option value="envio_domicilio">Envío a domicilio</option>
                      <option value="envio_obra">Envío a obra</option>
                      <option value="transporte_propio">
                        Transporte propio del cliente
                      </option>
                    </select>
                    {errors.tipoEnvio && (
                      <span className="text-red-500 text-xs">
                        {errors.tipoEnvio.message}
                      </span>
                    )}
                    {tipoEnvioSeleccionado !== "retiro_local" && (
                      <>
                        <div className="flex items-center gap-2 mb-2">
                          <input
                            type="checkbox"
                            checked={usarDireccionCliente}
                            onChange={(e) =>
                              setUsarDireccionCliente(e.target.checked)
                            }
                            id="usarDireccionCliente"
                          />
                          <label
                            htmlFor="usarDireccionCliente"
                            className="text-sm"
                          >
                            Usar dirección del cliente
                          </label>
                        </div>
                        {!usarDireccionCliente && (
                          <>
                            <Input
                              {...register("direccionEnvio")}
                              placeholder="Dirección de envío"
                              className="w-full"
                              disabled={isSubmitting}
                            />
                            <Input
                              {...register("localidadEnvio")}
                              placeholder="Localidad/Ciudad"
                              className="w-full"
                              disabled={isSubmitting}
                            />
                            <Input
                              {...register("codigoPostal")}
                              placeholder="Código postal"
                              className="w-full"
                              disabled={isSubmitting}
                            />
                            {errors.direccionEnvio && (
                              <span className="text-red-500 text-xs">
                                {errors.direccionEnvio.message}
                              </span>
                            )}
                            {errors.localidadEnvio && (
                              <span className="text-red-500 text-xs">
                                {errors.localidadEnvio.message}
                              </span>
                            )}
                            {errors.codigoPostal && (
                              <span className="text-red-500 text-xs">
                                {errors.codigoPostal.message}
                              </span>
                            )}
                          </>
                        )}
                        {usarDireccionCliente && clienteSeleccionado && (
                          <>
                            <Input
                              value={clienteSeleccionado.direccion || ""}
                              readOnly
                              className="w-full"
                            />
                            <Input
                              value={clienteSeleccionado.localidad || ""}
                              readOnly
                              className="w-full"
                            />
                            <Input
                              value={clienteSeleccionado.codigoPostal || ""}
                              readOnly
                              className="w-full"
                            />
                          </>
                        )}
                        <select
                          {...register("transportista")}
                          className="border rounded px-2 py-2 w-full"
                          disabled={isSubmitting}
                        >
                          <option value="">Transportista...</option>
                          {transportistas.map((t) => (
                            <option key={t}>{t}</option>
                          ))}
                        </select>
                        {errors.transportista && (
                          <span className="text-red-500 text-xs">
                            {errors.transportista.message}
                          </span>
                        )}
                        {tipoEnvioSeleccionado !== "retiro_local" && (
                          <Input
                            {...register("costoEnvio")}
                            placeholder={
                              tipo === "presupuesto"
                                ? "Costo estimado de envío"
                                : "Costo de envío"
                            }
                            type="number"
                            className="w-full"
                            disabled={isSubmitting}
                            min={0}
                          />
                        )}
                        {errors.costoEnvio && (
                          <span className="text-red-500 text-xs">
                            {errors.costoEnvio.message}
                          </span>
                        )}
                        <Input
                          {...register("fechaEntrega")}
                          placeholder="Fecha de entrega"
                          type="date"
                          className="w-full"
                          disabled={isSubmitting}
                          value={
                            watch("fechaEntrega")
                              ? new Date(watch("fechaEntrega"))
                                  .toISOString()
                                  .split("T")[0]
                              : ""
                          }
                        />
                        {errors.fechaEntrega && (
                          <span className="text-red-500 text-xs">
                            {errors.fechaEntrega.message}
                          </span>
                        )}
                        <Input
                          {...register("rangoHorario")}
                          placeholder="Rango horario (ej: 8-12, 14-18)"
                          className="w-full"
                          disabled={isSubmitting}
                        />
                        {errors.rangoHorario && (
                          <span className="text-red-500 text-xs">
                            {errors.rangoHorario.message}
                          </span>
                        )}
                      </>
                    )}
                  </div>

                  <div className="space-y-2 bg-white rounded-lg p-4 border border-default-200 shadow-sm">
                    <div className="text-base font-semibold text-default-800 pb-1">
                      Información adicional
                    </div>
                    <select
                      {...register("vendedor")}
                      className="border rounded px-2 py-2 w-full"
                      disabled={isSubmitting}
                    >
                      <option value="">Vendedor responsable...</option>
                      {vendedores.map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                    {errors.vendedor && (
                      <span className="text-red-500 text-xs">
                        {errors.vendedor.message}
                      </span>
                    )}
                    <select
                      {...register("prioridad")}
                      className="border rounded px-2 py-2 w-full"
                      disabled={isSubmitting}
                    >
                      <option value="">Prioridad...</option>
                      {prioridades.map((p) => (
                        <option key={p}>
                          {p.charAt(0).toUpperCase() + p.slice(1)}
                        </option>
                      ))}
                    </select>
                    {errors.prioridad && (
                      <span className="text-red-500 text-xs">
                        {errors.prioridad.message}
                      </span>
                    )}
                    <Textarea
                      {...register("observaciones")}
                      placeholder="Observaciones adicionales"
                      className="w-full"
                      disabled={isSubmitting}
                    />
                    {errors.observaciones && (
                      <span className="text-red-500 text-xs">
                        {errors.observaciones.message}
                      </span>
                    )}
                  </div>
                </>
              )}
              {tipo === "presupuesto" && (
                <div className="space-y-2 bg-white rounded-lg p-4 border border-default-200 shadow-sm">
                  <div className="text-base font-semibold text-default-800 pb-1">
                    Información de envío
                  </div>
                  <select
                    {...register("tipoEnvio")}
                    className="border rounded px-2 py-2 w-full"
                    disabled={isSubmitting}
                  >
                    <option value="">Tipo de envío...</option>
                    <option value="retiro_local">Retiro en local</option>
                    <option value="envio_domicilio">Envío a domicilio</option>
                    <option value="envio_obra">Envío a obra</option>
                    <option value="transporte_propio">
                      Transporte propio del cliente
                    </option>
                  </select>
                  {errors.tipoEnvio && (
                    <span className="text-red-500 text-xs">
                      {errors.tipoEnvio.message}
                    </span>
                  )}
                  {watch("tipoEnvio") &&
                    watch("tipoEnvio") !== "retiro_local" && (
                      <Input
                        {...register("costoEnvio")}
                        placeholder="Cotización del envío a domicilio"
                        type="number"
                        className="w-full"
                        disabled={isSubmitting}
                        min={0}
                      />
                    )}
                  {errors.costoEnvio && (
                    <span className="text-red-500 text-xs">
                      {errors.costoEnvio.message}
                    </span>
                  )}
                </div>
              )}
            </section>
          </div>
        </div>

        <div className="bg-white p-4 space-y-4 flex-shrink-0">
          <div className="flex flex-col items-end gap-2">
            <div className="bg-primary/5 border border-primary/20 rounded-lg px-6 py-3 flex flex-col md:flex-row gap-4 md:gap-8 text-base shadow-sm w-full md:w-auto">
              <div>
                Subtotal:{" "}
                <span className="font-semibold">${subtotal.toFixed(2)}</span>
              </div>
              <div>
                Descuento:{" "}
                <span className="font-semibold">
                  ${descuentoTotal.toFixed(2)}
                </span>
              </div>
              <div>
                IVA (21%):{" "}
                <span className="font-semibold">${iva.toFixed(2)}</span>
              </div>
              <div>
                Total:{" "}
                <span className="font-bold text-primary">
                  ${total.toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              className="hover:bg-gray-100"
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="default"
              className="shadow-md min-w-[140px]"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Guardando...
                </>
              ) : (
                `Guardar ${tipo === "presupuesto" ? "Presupuesto" : "Venta"}`
              )}
            </Button>
          </DialogFooter>
        </div>
      </form>

      <Dialog open={openNuevoCliente} onOpenChange={setOpenNuevoCliente}>
        <DialogContent className="w-[95vw] max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Agregar Cliente</DialogTitle>
            <DialogDescription>
              Complete los datos del nuevo cliente para agregarlo al sistema.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            <Input
              placeholder="Nombre *"
              className="w-full"
              value={nuevoCliente.nombre}
              onChange={(e) =>
                setNuevoCliente({ ...nuevoCliente, nombre: e.target.value })
              }
              required
            />
            <Input
              placeholder="CUIT / DNI"
              className="w-full"
              value={nuevoCliente.cuit || ""}
              onChange={(e) =>
                setNuevoCliente({ ...nuevoCliente, cuit: e.target.value })
              }
            />
            <Input
              placeholder="Dirección *"
              className="w-full"
              value={nuevoCliente.direccion}
              onChange={(e) =>
                setNuevoCliente({ ...nuevoCliente, direccion: e.target.value })
              }
              required
            />
            <Input
              placeholder="Teléfono *"
              className="w-full"
              value={nuevoCliente.telefono}
              onChange={(e) =>
                setNuevoCliente({ ...nuevoCliente, telefono: e.target.value })
              }
              required
            />
            <Input
              placeholder="Email"
              className="w-full"
              value={nuevoCliente.email}
              onChange={(e) =>
                setNuevoCliente({ ...nuevoCliente, email: e.target.value })
              }
            />
            <Input
              placeholder="Localidad"
              className="w-full"
              value={nuevoCliente.localidad || ""}
              onChange={(e) =>
                setNuevoCliente({ ...nuevoCliente, localidad: e.target.value })
              }
            />
            <Input
              placeholder="Partido"
              className="w-full"
              value={nuevoCliente.partido || ""}
              onChange={(e) =>
                setNuevoCliente({ ...nuevoCliente, partido: e.target.value })
              }
            />
            <Input
              placeholder="Barrio"
              className="w-full"
              value={nuevoCliente.barrio || ""}
              onChange={(e) =>
                setNuevoCliente({ ...nuevoCliente, barrio: e.target.value })
              }
            />
            <Input
              placeholder="Área"
              className="w-full"
              value={nuevoCliente.area || ""}
              onChange={(e) =>
                setNuevoCliente({ ...nuevoCliente, area: e.target.value })
              }
            />
            <Input
              placeholder="Lote"
              className="w-full"
              value={nuevoCliente.lote || ""}
              onChange={(e) =>
                setNuevoCliente({ ...nuevoCliente, lote: e.target.value })
              }
            />
            <Textarea
              placeholder="Descripción"
              className="w-full"
              value={nuevoCliente.descripcion || ""}
              onChange={(e) =>
                setNuevoCliente({
                  ...nuevoCliente,
                  descripcion: e.target.value,
                })
              }
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpenNuevoCliente(false)}
            >
              Cancelar
            </Button>
            <Button
              variant="default"
              onClick={async () => {
                if (
                  !nuevoCliente.nombre ||
                  !nuevoCliente.direccion ||
                  !nuevoCliente.telefono
                ) {
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
                };
                const docRef = await addDoc(
                  collection(db, "clientes"),
                  clienteObj
                );
                setClientesState([
                  ...clientesState,
                  { ...clienteObj, id: docRef.id },
                ]);
                setClienteId(docRef.id);
                setNuevoCliente({
                  nombre: "",
                  cuit: "",
                  direccion: "",
                  telefono: "",
                  email: "",
                  localidad: "",
                  partido: "",
                  barrio: "",
                  area: "",
                  lote: "",
                  descripcion: "",
                });
                setOpenNuevoCliente(false);
                setDropdownClientesOpen(false);
              }}
            >
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function SelectorProductosPresupuesto({
  productosSeleccionados,
  setProductosSeleccionados,
  productosState,
  categoriasState,
  productosPorCategoria,
  isSubmitting,
  modoSoloProductos,
}) {
  const [categoriaId, setCategoriaId] = useState("");
  const [busquedaProducto, setBusquedaProducto] = useState("");

  const handleAgregarProducto = (producto) => {
    const real = productosState.find((p) => p.id === producto.id);
    if (!real) return;
    if (!productosSeleccionados.some((p) => p.id === real.id)) {
      let precio =
        real.precioUnidad ||
        real.precioUnidadVenta ||
        real.precioUnidadHerraje ||
        real.precioUnidadQuimico ||
        real.precioUnidadHerramienta;
      let alto = Number(real.espesor) || 0;
      let ancho = Number(real.ancho) || 0;
      let largo = Number(real.largo) || 0;
      let precioPorPie = Number(real.precioUnidad) || 0;
      if (real.categoria === "Maderas") {
        if (alto > 0 && ancho > 0 && largo > 0 && precioPorPie > 0) {
          precio = calcularPrecioCorteMadera({
            alto,
            ancho,
            largo,
            precioPorPie,
          });
        } else {
          return;
        }
      }
      setProductosSeleccionados([
        ...productosSeleccionados,
        {
          id: real.id,
          nombre: real.nombre,
          precio,
          unidad:
            real.unidadMedida ||
            real.unidadVenta ||
            real.unidadVentaHerraje ||
            real.unidadVentaQuimico ||
            real.unidadVentaHerramienta,
          stock: real.stock,
          cantidad: 1,
          descuento: 0,
          categoria: real.categoria,
          alto,
          ancho,
          largo,
          precioPorPie,
        },
      ]);
    }
  };
  const handleQuitarProducto = (id) => {
    setProductosSeleccionados(
      productosSeleccionados.filter((p) => p.id !== id)
    );
  };
  const handleCantidadChange = (id, cantidad) => {
    setProductosSeleccionados(
      productosSeleccionados.map((p) =>
        p.id === id ? { ...p, cantidad: Number(cantidad) } : p
      )
    );
  };
  const handleDescuentoChange = (id, descuento) => {
    setProductosSeleccionados(
      productosSeleccionados.map((p) =>
        p.id === id ? { ...p, descuento: Number(descuento) } : p
      )
    );
  };

  function calcularPrecioCorteMadera({
    alto,
    ancho,
    largo,
    precioPorPie,
    factor = 0.2734,
  }) {
    if (
      [alto, ancho, largo, precioPorPie].some(
        (v) => typeof v !== "number" || v <= 0
      )
    ) {
      return 0;
    }
    const precio = factor * alto * ancho * largo * precioPorPie;
    return Math.round(precio * 100) / 100;
  }

  return (
    <section className="bg-white rounded-lg p-4 border border-default-200 shadow-sm flex flex-col gap-2 mb-2">
      <label className="font-semibold">Productos</label>
      <div className="flex gap-3 overflow-x-auto pb-2 mb-2">
        {categoriasState.length === 0 && (
          <span className="text-gray-400">No hay categorías con productos</span>
        )}
        {categoriasState.map((cat) => (
          <Button
            key={cat}
            type="button"
            variant={categoriaId === cat ? "default" : "soft"}
            size="sm"
            color={categoriaId === cat ? "primary" : "secondary"}
            className="rounded-full px-4 py-1 text-sm flex items-center gap-2 transition-all"
            onClick={() => setCategoriaId(cat)}
            disabled={isSubmitting}
          >
            {cat}
          </Button>
        ))}
      </div>
      {categoriaId && (
        <div className="w-full mb-2 animate-fade-in">
          <div className="mb-2 flex justify-end">
            <Input
              type="text"
              placeholder="Buscar producto..."
              value={busquedaProducto}
              onChange={(e) => setBusquedaProducto(e.target.value)}
              className="w-full md:w-80"
              disabled={isSubmitting}
            />
          </div>
          {categoriaId === "Maderas" && (
            <div className="w-full mb-2 animate-fade-in">
              <div className="divide-y divide-gray-200 bg-white rounded-b">
                {productosPorCategoria[categoriaId]
                  ?.filter(
                    (prod) =>
                      prod.nombre
                        .toLowerCase()
                        .includes(busquedaProducto.toLowerCase()) ||
                      (prod.unidadMedida || "")
                        .toLowerCase()
                        .includes(busquedaProducto.toLowerCase())
                  )
                  .map((prod) => (
                    <div
                      key={prod.id}
                      className="grid grid-cols-12 gap-2 items-center px-4 py-2"
                    >
                      <div className="col-span-5 font-medium">
                        {prod.nombre}
                      </div>
                      <div className="col-span-2 text-xs text-default-500">
                        {prod.unidadMedida}
                      </div>
                      <div className="col-span-2 font-bold text-primary">
                        ${prod.precioUnidad || prod.precioPorPie || 0}
                      </div>
                      <div className="col-span-2 font-mono text-xs">
                        Stock: {prod.stock}
                        {prod.stock <= 0 && (
                          <div className="text-red-600 font-semibold text-xs mt-1">
                            ¡Sin stock! Se permitirá avanzar igual.
                          </div>
                        )}
                        {prod.stock > 0 && prod.stock <= 3 && (
                          <div className="text-yellow-600 font-semibold text-xs mt-1">
                            Stock bajo: quedan {prod.stock} unidades.
                          </div>
                        )}
                      </div>
                      <div className="col-span-1 flex justify-end">
                        <Button
                          type="button"
                          size="sm"
                          variant={
                            productosSeleccionados.some((p) => p.id === prod.id)
                              ? "soft"
                              : "default"
                          }
                          color="primary"
                          className={
                            productosSeleccionados.some((p) => p.id === prod.id)
                              ? "bg-yellow-200 text-yellow-700 cursor-default"
                              : ""
                          }
                          onClick={() => {
                            if (
                              productosSeleccionados.some(
                                (p) => p.id === prod.id
                              )
                            )
                              return;
                            const alto = Number(prod.espesor) || 0;
                            const ancho = Number(prod.ancho) || 0;
                            const largo = Number(prod.largo) || 0;
                            const precioPorPie = Number(prod.precioUnidad) || 0;
                            if (
                              prod.categoria === "Maderas" &&
                              alto > 0 &&
                              ancho > 0 &&
                              largo > 0 &&
                              precioPorPie > 0
                            ) {
                              const precio = calcularPrecioCorteMadera({
                                alto,
                                ancho,
                                largo,
                                precioPorPie,
                              });
                              handleAgregarProducto({
                                id: prod.id,
                                nombre: prod.nombre,
                                precio,
                                unidad: prod.unidadMedida,
                                stock: prod.stock,
                                alto,
                                ancho,
                                largo,
                                precioPorPie,
                              });
                            } else if (prod.categoria !== "Maderas") {
                              handleAgregarProducto({
                                id: prod.id,
                                nombre: prod.nombre,
                                precio:
                                  prod.precioUnidad ||
                                  prod.precioUnidadVenta ||
                                  prod.precioUnidadHerraje ||
                                  prod.precioUnidadQuimico ||
                                  prod.precioUnidadHerramienta,
                                unidad:
                                  prod.unidadMedida ||
                                  prod.unidadVenta ||
                                  prod.unidadVentaHerraje ||
                                  prod.unidadVentaQuimico ||
                                  prod.unidadVentaHerramienta,
                                stock: prod.stock,
                              });
                            }
                          }}
                          disabled={
                            productosSeleccionados.some(
                              (p) => p.id === prod.id
                            ) || isSubmitting
                          }
                        >
                          {productosSeleccionados.some((p) => p.id === prod.id)
                            ? "Agregado"
                            : "Agregar"}
                        </Button>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
          {categoriaId !== "Maderas" && (
            <div className="bg-gray-100 rounded-b">
              <div className="divide-y divide-gray-200">
                {productosPorCategoria[categoriaId]
                  ?.filter(
                    (prod) =>
                      prod.nombre
                        .toLowerCase()
                        .includes(busquedaProducto.toLowerCase()) ||
                      (
                        prod.unidadMedida ||
                        prod.unidadVenta ||
                        prod.unidadVentaHerraje ||
                        prod.unidadVentaQuimico ||
                        prod.unidadVentaHerramienta ||
                        ""
                      )
                        .toLowerCase()
                        .includes(busquedaProducto.toLowerCase())
                  )
                  .map((prod) => (
                    <div
                      key={prod.id}
                      className="grid grid-cols-12 gap-2 items-center px-4 py-2"
                    >
                      <div className="col-span-5 font-medium">
                        {prod.nombre}
                      </div>
                      <div className="col-span-2 text-xs text-default-500">
                        {prod.unidadMedida ||
                          prod.unidadVenta ||
                          prod.unidadVentaHerraje ||
                          prod.unidadVentaQuimico ||
                          prod.unidadVentaHerramienta}
                      </div>
                      <div className="col-span-2 font-bold text-primary">
                        $
                        {prod.precioUnidad ||
                          prod.precioUnidadVenta ||
                          prod.precioUnidadHerraje ||
                          prod.precioUnidadQuimico ||
                          prod.precioUnidadHerramienta}
                      </div>
                      <div className="col-span-2 font-mono text-xs">
                        {prod.stock}
                      </div>
                      <div className="col-span-1 flex justify-end">
                        <Button
                          type="button"
                          size="sm"
                          variant={
                            productosSeleccionados.some((p) => p.id === prod.id)
                              ? "soft"
                              : "default"
                          }
                          color="primary"
                          className={
                            productosSeleccionados.some((p) => p.id === prod.id)
                              ? "bg-yellow-200 text-yellow-700 cursor-default"
                              : ""
                          }
                          onClick={() => {
                            handleAgregarProducto({
                              id: prod.id,
                              nombre: prod.nombre,
                              precio:
                                prod.precioUnidad ||
                                prod.precioUnidadVenta ||
                                prod.precioUnidadHerraje ||
                                prod.precioUnidadQuimico ||
                                prod.precioUnidadHerramienta,
                              unidad:
                                prod.unidadMedida ||
                                prod.unidadVenta ||
                                prod.unidadVentaHerraje ||
                                prod.unidadVentaQuimico ||
                                prod.unidadVentaHerramienta,
                              stock: prod.stock,
                            });
                          }}
                          disabled={
                            productosSeleccionados.some(
                              (p) => p.id === prod.id
                            ) || isSubmitting
                          }
                        >
                          {productosSeleccionados.some((p) => p.id === prod.id)
                            ? "Agregado"
                            : "Agregar"}
                        </Button>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}
      {productosSeleccionados.length > 0 && (
        <div className="overflow-x-auto mt-4">
          <table className="w-full text-sm min-w-[700px] border rounded-lg shadow-sm bg-white">
            <thead>
              <tr className="bg-primary/10 text-primary font-semibold">
                <th className="p-2 text-left">Categoría</th>
                <th className="p-2 text-left">Producto</th>
                <th className="p-2 text-center">Cant.</th>
                <th className="p-2 text-center">Precio unit.</th>
                <th className="p-2 text-center">Desc.</th>
                <th className="p-2 text-center">Subtotal</th>
                <th className="p-2 text-center">Acción</th>
              </tr>
            </thead>
            <tbody>
              {productosSeleccionados.map((p, idx) => (
                <tr
                  key={p.id}
                  className="border-b hover:bg-primary/5 transition-all"
                >
                  <td className="p-2 text-xs font-medium text-gray-600">
                    {p.categoria}
                  </td>
                  <td className="p-2">
                    <div className="font-semibold text-default-900">
                      {p.nombre}
                    </div>
                    {p.categoria === "Maderas" && (
                      <div className="flex flex-wrap gap-2 mt-1 text-xs items-center">
                        <span className="font-medium text-gray-500">
                          Dimensiones:
                        </span>
                        <span>
                          Alto: <span className="font-bold">{p.alto}</span> cm
                        </span>
                        <span>
                          Ancho: <span className="font-bold">{p.ancho}</span> cm
                        </span>
                        <span>
                          Largo: <span className="font-bold">{p.largo}</span> cm
                        </span>
                        <span>
                          $/pie:{" "}
                          <span className="font-bold">{p.precioPorPie}</span>
                        </span>
                        <span className="ml-2 text-primary font-semibold">
                          Precio calculado: ${p.precio}
                        </span>
                        {p.stock <= 0 && (
                          <span className="text-red-600 font-semibold ml-2">
                            ¡Sin stock! Se permitirá avanzar igual.
                          </span>
                        )}
                        {p.stock > 0 && p.stock <= 3 && (
                          <span className="text-yellow-600 font-semibold ml-2">
                            Stock bajo: quedan {p.stock} unidades.
                          </span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="text-center">
                    <Input
                      type="number"
                      min={1}
                      value={p.cantidad}
                      onChange={(e) =>
                        handleCantidadChange(p.id, e.target.value)
                      }
                      className="w-28 mx-auto text-center text-lg font-bold"
                      disabled={isSubmitting}
                    />
                  </td>
                  <td className="text-center">${p.precio}</td>
                  <td className="text-center">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={p.descuento}
                      onChange={(e) =>
                        handleDescuentoChange(p.id, e.target.value)
                      }
                      className="w-20 mx-auto text-center"
                      disabled={isSubmitting}
                      suffix="%"
                    />
                  </td>
                  <td className="text-center font-semibold text-primary">
                    $
                    {(
                      Number(p.precio) *
                      Number(p.cantidad) *
                      (1 - Number(p.descuento) / 100)
                    ).toFixed(2)}
                  </td>
                  <td className="text-center">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() => handleQuitarProducto(p.id)}
                      disabled={isSubmitting}
                      title="Quitar producto"
                    >
                      <span className="text-lg font-bold text-red-500">×</span>
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

const VentasPage = () => {
  const [open, setOpen] = useState(null);
  const [ventasData, setVentasData] = useState([]);
  const [presupuestosData, setPresupuestosData] = useState([]);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const params = useParams();
  const { lang } = params;

  React.useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);

        const ventasSnap = await getDocs(collection(db, "ventas"));
        setVentasData(
          ventasSnap.docs.map((doc) => ({ ...doc.data(), id: doc.id }))
        );

        const presupuestosSnap = await getDocs(collection(db, "presupuestos"));
        setPresupuestosData(
          presupuestosSnap.docs.map((doc) => ({ ...doc.data(), id: doc.id }))
        );
      } catch (error) {
        console.error("Error al cargar datos:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const handleClose = () => setOpen(null);

  const handleSubmit = async (formData) => {
    console.log("[SUBMIT] Recibiendo datos en VentasPage:", formData);
    setLoading(true);
    try {
      let docRef;
      if (open === "venta") {
        const cleanFormData = JSON.parse(
          JSON.stringify(formData, (key, value) => {
            if (value === undefined) return undefined;
            return value;
          })
        );
        // Obtener el próximo número correlativo de venta
        const nextNumeroPedido = await getNextVentaNumber();
        cleanFormData.numeroPedido = nextNumeroPedido;
        console.log("[DEBUG] Datos limpios para guardar venta:", cleanFormData);
        docRef = await addDoc(collection(db, "ventas"), cleanFormData);
        for (const prod of cleanFormData.productos) {
          console.log(
            "[DEBUG] Intentando descontar stock para producto:",
            prod.id
          );
          const productoRef = doc(db, "productos", prod.id);
          const productoSnap = await getDocs(collection(db, "productos"));
          const existe = productoSnap.docs.find((d) => d.id === prod.id);
          if (!existe) {
            setLoading(false);
            alert(
              `El producto con ID ${prod.id} no existe en el catálogo. No se puede descontar stock ni registrar movimiento.`
            );
            return;
          }
          await updateDoc(productoRef, {
            stock: increment(-Math.abs(prod.cantidad)),
          });
          await addDoc(collection(db, "movimientos"), {
            productoId: prod.id,
            tipo: "salida",
            cantidad: prod.cantidad,
            usuario: "Sistema",
            fecha: serverTimestamp(),
            referencia: "venta",
            referenciaId: docRef.id,
            observaciones: `Salida por venta (${cleanFormData.nombre || ""})`,
            productoNombre: prod.nombre,
          });
        }
        if (
          cleanFormData.tipoEnvio &&
          cleanFormData.tipoEnvio !== "retiro_local"
        ) {
          const envioData = {
            ventaId: docRef.id,
            clienteId: cleanFormData.clienteId,
            cliente: cleanFormData.cliente,
            fechaCreacion: new Date().toISOString(),
            fechaEntrega: cleanFormData.fechaEntrega,
            estado: "pendiente",
            prioridad: cleanFormData.prioridad || "media",
            vendedor: cleanFormData.vendedor,
            direccionEnvio: cleanFormData.direccionEnvio,
            localidadEnvio: cleanFormData.localidadEnvio,
            codigoPostal: cleanFormData.codigoPostal,
            tipoEnvio: cleanFormData.tipoEnvio,
            transportista: cleanFormData.transportista,
            costoEnvio: parseFloat(cleanFormData.costoEnvio) || 0,
            numeroFactura: cleanFormData.numeroFactura,
            numeroRemito: cleanFormData.numeroRemito,
            numeroPedido: cleanFormData.numeroPedido,
            totalVenta: cleanFormData.total,
            productos: cleanFormData.productos,
            cantidadTotal: cleanFormData.productos.reduce(
              (acc, p) => acc + p.cantidad,
              0
            ),
            historialEstados: [
              {
                estado: "pendiente",
                fecha: new Date().toISOString(),
                comentario: "Envío creado automáticamente desde la venta",
              },
            ],
            observaciones: cleanFormData.observaciones,
            instruccionesEspeciales: "",
            fechaActualizacion: new Date().toISOString(),
            creadoPor: "sistema",
          };
          const cleanEnvioData = Object.fromEntries(
            Object.entries(envioData).filter(([_, v]) => v !== undefined)
          );
          await addDoc(collection(db, "envios"), cleanEnvioData);
          console.log("Envío creado automáticamente para la venta:", docRef.id);
        }
        setOpen(null);
        router.push(`/${lang}/ventas/${docRef.id}`);
      } else if (open === "presupuesto") {
        try {
          const clienteObj = formData.cliente || {};
          const productosLimpios = (formData.items || []).map((p) => ({
            ...p,
          }));
          let costoEnvioFinal = undefined;
          if (
            formData.tipoEnvio &&
            formData.tipoEnvio !== "retiro_local" &&
            formData.costoEnvio !== undefined &&
            formData.costoEnvio !== ""
          ) {
            costoEnvioFinal = Number(formData.costoEnvio);
            if (isNaN(costoEnvioFinal)) costoEnvioFinal = undefined;
          }
          // Obtener el próximo número correlativo de presupuesto
          const nextNumeroPedido = await getNextPresupuestoNumber();
          const cleanFormData = {
            ...formData,
            cliente: clienteObj,
            items: productosLimpios,
            productos: productosLimpios,
            subtotal: productosLimpios.reduce(
              (acc, p) => acc + Number(p.precio) * Number(p.cantidad),
              0
            ),
            descuentoTotal: productosLimpios.reduce(
              (acc, p) => acc + Number(p.descuento) * Number(p.cantidad),
              0
            ),
            iva:
              (productosLimpios.reduce(
                (acc, p) => acc + Number(p.precio) * Number(p.cantidad),
                0
              ) -
                productosLimpios.reduce(
                  (acc, p) => acc + Number(p.descuento) * Number(p.cantidad),
                  0
                )) * 0.21,
            total:
              productosLimpios.reduce(
                (acc, p) => acc + Number(p.precio) * Number(p.cantidad),
                0
              ) -
              productosLimpios.reduce(
                (acc, p) => acc + Number(p.descuento) * Number(p.cantidad),
                0
              ) +
              (productosLimpios.reduce(
                (acc, p) => acc + Number(p.precio) * Number(p.cantidad),
                0
              ) -
                productosLimpios.reduce(
                  (acc, p) => acc + Number(p.descuento) * Number(p.cantidad),
                  0
                )) *
                0.21,
            fechaCreacion: new Date().toISOString(),
            tipo: "presupuesto",
            numeroPedido: nextNumeroPedido,
            // ---
            costoEnvio: costoEnvioFinal,
            // ---
          };
          console.log("[DEBUG] Objeto preparado para guardar:", cleanFormData);
          const finalFormData = JSON.parse(
            JSON.stringify(cleanFormData, (key, value) => {
              if (value === undefined) return undefined;
              return value;
            })
          );
          console.log(
            "[DEBUG] Datos limpios para guardar presupuesto:",
            finalFormData
          );
          docRef = await addDoc(collection(db, "presupuestos"), finalFormData);
          console.log(
            "[SUCCESS] Presupuesto guardado en Firebase con ID:",
            docRef.id
          );
          setOpen(null);
          router.push(`/${lang}/presupuestos/${docRef.id}`);
        } catch (err) {
          console.error(
            "[ERROR] Error en el proceso de guardado de presupuesto:",
            err
          );
          alert("Error al guardar presupuesto: " + err.message);
          throw err;
        }
      }
    } catch (error) {
      console.error("[ERROR] Error general al guardar:", error);
      alert("Error al guardar: " + error.message);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 py-8">
      <div className="flex gap-4 mb-4 justify-end">
        <Button variant="default" onClick={() => setOpen("presupuesto")}>
          Agregar Presupuesto
        </Button>
        <Button variant="default" onClick={() => setOpen("venta")}>
          Agregar Venta
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Presupuestos</CardTitle>
          </CardHeader>
          <CardContent>
            <DataTable data={presupuestosData} columns={columnsPresupuestos} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ventas</CardTitle>
          </CardHeader>
          <CardContent>
            <DataTable data={ventasData} columns={columnsVentas} />
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!open} onOpenChange={handleClose}>
        <DialogContent className="w-[95vw] max-w-[1500px] h-[90vh] flex flex-col">
          <FormularioVentaPresupuesto
            tipo={open}
            onClose={handleClose}
            onSubmit={handleSubmit}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default VentasPage;

// Numeración autoincremental para ventas
const getNextVentaNumber = async () => {
  const snap = await getDocs(collection(db, "ventas"));
  let maxNum = 0;
  snap.docs.forEach((doc) => {
    const data = doc.data();
    if (data.numeroPedido && data.numeroPedido.startsWith("PED-")) {
      const num = parseInt(data.numeroPedido.replace("PED-", ""), 10);
      if (!isNaN(num) && num > maxNum) maxNum = num;
    }
  });
  return `PED-${String(maxNum + 1).padStart(5, "0")}`;
};

// Numeración autoincremental para presupuestos
const getNextPresupuestoNumber = async () => {
  const snap = await getDocs(collection(db, "presupuestos"));
  let maxNum = 0;
  snap.docs.forEach((doc) => {
    const data = doc.data();
    if (data.numeroPedido && data.numeroPedido.startsWith("PRESU-")) {
      const num = parseInt(data.numeroPedido.replace("PRESU-", ""), 10);
      if (!isNaN(num) && num > maxNum) maxNum = num;
    }
  });
  return `PRESU-${String(maxNum + 1).padStart(5, "0")}`;
};
