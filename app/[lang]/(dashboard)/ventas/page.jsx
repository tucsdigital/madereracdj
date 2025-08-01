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
import { Loader2, CheckCircle, AlertCircle } from "lucide-react";
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
import { Icon } from "@iconify/react";
import { useAuth } from "@/provider/auth.provider";

function FormularioVentaPresupuesto({ tipo, onClose, onSubmit }) {
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState(null);
  const [submitMessage, setSubmitMessage] = useState("");

  // Esquema Yup para presupuesto
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

  // Esquema Yup para venta
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
    prioridad: yup.string().when("tipoEnvio", {
      is: (val) => val && val !== "retiro_local",
      then: (s) => s.required("Selecciona la prioridad"),
      otherwise: (s) => s.notRequired(),
    }),
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
  });

  const schema = tipo === "presupuesto" ? schemaPresupuesto : schemaVenta;

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
    watch,
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
  const tipoEnvio = watch("tipoEnvio");
  const costoEnvio = watch("costoEnvio");
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
    esClienteViejo: false,
  });

  const [productosSeleccionados, setProductosSeleccionados] = useState([]);
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
      let precio;

      if (real.categoria === "Maderas") {
        let alto = Number(real.alto) || 0;
        let ancho = Number(real.ancho) || 0;
        let largo = Number(real.largo) || 0;
        let precioPorPie = Number(real.precioPorPie) || 0;

        if (alto > 0 && ancho > 0 && largo > 0 && precioPorPie > 0) {
          precio = calcularPrecioCorteMadera({
            alto,
            ancho,
            largo,
            precioPorPie,
          });

          // El cepillado se aplicará individualmente por producto
        } else {
          setSubmitStatus("error");
          setSubmitMessage(
            "El producto de madera no tiene dimensiones válidas en la base de datos."
          );
          return;
        }
      } else {
        if (real.categoria === "Ferretería") {
          precio = real.valorVenta || 0;
        } else {
          precio =
            real.precioUnidad ||
            real.precioUnidadVenta ||
            real.precioUnidadHerraje ||
            real.precioUnidadQuimico ||
            real.precioUnidadHerramienta ||
            0;
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
          alto: Number(real.alto) || 0,
          ancho: Number(real.ancho) || 0,
          largo: Number(real.largo) || 0,
          precioPorPie: Number(real.precioPorPie) || 0,
          cepilladoAplicado: false, // Por defecto sin cepillado
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
  const handleIncrementarCantidad = (id) => {
    setProductosSeleccionados(
      productosSeleccionados.map((p) =>
        p.id === id ? { ...p, cantidad: Number(p.cantidad) + 1 } : p
      )
    );
  };
  const handleDecrementarCantidad = (id) => {
    setProductosSeleccionados(
      productosSeleccionados.map((p) =>
        p.id === id
          ? { ...p, cantidad: Math.max(1, Number(p.cantidad) - 1) }
          : p
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

  const recalcularPreciosMadera = (id, aplicarCepillado) => {
    setProductosSeleccionados(
      productosSeleccionados.map((p) => {
        if (p.id === id && p.categoria === "Maderas") {
          const precioBase = calcularPrecioCorteMadera({
            alto: p.alto,
            ancho: p.ancho,
            largo: p.largo,
            precioPorPie: p.precioPorPie,
          });

          const precioFinal = aplicarCepillado
            ? precioBase * 1.066
            : precioBase;

          // Redondear a centenas (múltiplos de 100)
          const precioRedondeado = Math.round(precioFinal / 100) * 100;

          return {
            ...p,
            precio: precioRedondeado,
            cepilladoAplicado: aplicarCepillado,
          };
        }
        return p;
      })
    );
  };

  const handlePrecioPorPieChange = (id, nuevoPrecioPorPie) => {
    setProductosSeleccionados(
      productosSeleccionados.map((p) => {
        if (p.id === id && p.categoria === "Maderas") {
          const precioBase = calcularPrecioCorteMadera({
            alto: p.alto,
            ancho: p.ancho,
            largo: p.largo,
            precioPorPie: Number(nuevoPrecioPorPie),
          });

          const precioFinal = p.cepilladoAplicado
            ? precioBase * 1.066
            : precioBase;

          // Redondear a centenas (múltiplos de 100)
          const precioRedondeado = Math.round(precioFinal / 100) * 100;

          return {
            ...p,
            precioPorPie: Number(nuevoPrecioPorPie),
            precio: precioRedondeado,
          };
        }
        return p;
      })
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

  const costoEnvioCalculado =
    tipoEnvio &&
    tipoEnvio !== "retiro_local" &&
    costoEnvio !== undefined &&
    costoEnvio !== "" &&
    !isNaN(Number(costoEnvio))
      ? Number(costoEnvio)
      : 0;
  const total = subtotal - descuentoTotal + costoEnvioCalculado;

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
        categoria: p.categoria,
        // Agregar propiedades específicas de madera
        ...(p.categoria === "Maderas" && {
          alto: Number(p.alto) || 0,
          ancho: Number(p.ancho) || 0,
          largo: Number(p.largo) || 0,
          precioPorPie: Number(p.precioPorPie) || 0,
          cepilladoAplicado: p.cepilladoAplicado || false,
        }),
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
          obj.cepilladoAplicado = p.cepilladoAplicado || false; // Agregar propiedad de cepillado
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
        cleanData.costoEnvio = undefined;
      }

      // Lógica para manejar montoAbonado y estado de pago
      let montoAbonadoFinal = cleanData.montoAbonado || 0;
      let estadoPagoFinal = "pendiente";

      if (tipo === "venta") {
        const esPagoParcial = cleanData.pagoParcial || false;
        
        if (!esPagoParcial) {
          // Si NO es pago parcial → montoAbonado = total y estado = "pagado"
          montoAbonadoFinal = total;
          estadoPagoFinal = "pagado";
        } else {
          // Si ES pago parcial → usar el valor del formulario
          montoAbonadoFinal = cleanData.montoAbonado || 0;
          if (montoAbonadoFinal >= total) {
            estadoPagoFinal = "pagado";
          } else if (montoAbonadoFinal > 0) {
            estadoPagoFinal = "parcial";
          } else {
            estadoPagoFinal = "pendiente";
          }
        }
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
              total: total,
              fechaCreacion: new Date().toISOString(),
              tipo: tipo,
              vendedor: user?.email || "Usuario no identificado",
              // Agregar campos de envío
              tipoEnvio: cleanData.tipoEnvio || "",
              costoEnvio:
                cleanData.tipoEnvio && cleanData.tipoEnvio !== "retiro_local"
                  ? cleanData.costoEnvio !== undefined &&
                    cleanData.costoEnvio !== ""
                    ? Number(cleanData.costoEnvio)
                    : undefined
                  : undefined,
            }
          : {
              ...cleanData,
              clienteId: clienteId || cleanData.clienteId,
              productos: productosLimpios,
              subtotal: subtotal,
              descuentoTotal: descuentoTotal,
              total: total,
              montoAbonado: montoAbonadoFinal,
              estadoPago: estadoPagoFinal,
              fechaCreacion: new Date().toISOString(),
              tipo: tipo,
              vendedor: user?.email || "Usuario no identificado",
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
    // Redondear a centenas (múltiplos de 100)
    return Math.round(precio / 100) * 100;
  }

  // Función para formatear números en formato argentino
  const formatearNumeroArgentino = (numero) => {
    if (numero === null || numero === undefined || isNaN(numero)) return "0";
    return Number(numero).toLocaleString("es-AR");
  };

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
      setValue("costoEnvio", "");
    } else if (watch("tipoEnvio") && watch("tipoEnvio") !== "retiro_local") {
      // Establecer fecha de entrega por defecto al día actual
      setValue("fechaEntrega", new Date().toISOString().split("T")[0]);
    }
  }, [watch("tipoEnvio")]);

  return (
    <>
      <DialogHeader className="mb-2">
        <DialogTitle className="text-2xl font-bold text-primary flex items-center gap-2">
          <Icon
            icon={
              tipo === "presupuesto"
                ? "heroicons:document-plus"
                : "heroicons:shopping-cart"
            }
            className="w-6 h-6"
          />
          {tipo === "presupuesto" ? "Nuevo Presupuesto" : "Nueva Venta"}
        </DialogTitle>
        <DialogDescription className="text-base text-default-600">
          Complete todos los campos requeridos para crear un nuevo{" "}
          {tipo === "presupuesto" ? "presupuesto" : "venta"}.
        </DialogDescription>
      </DialogHeader>

      {submitStatus && (
        <div
          className={`mb-4 p-4 rounded-lg flex items-center gap-3 text-base font-medium shadow border ${
            submitStatus === "success"
              ? "bg-green-50 border-green-200 text-green-800"
              : "bg-red-50 border-red-200 text-red-800"
          }`}
        >
          {submitStatus === "success" ? (
            <CheckCircle className="w-5 h-5 text-green-600" />
          ) : (
            <AlertCircle className="w-5 h-5 text-red-600" />
          )}
          <span>{submitMessage}</span>
        </div>
      )}

      <form
        onSubmit={handleSubmit(handleFormSubmit)}
        className="flex flex-col h-full gap-0"
      >
        <div className="flex-1 overflow-y-auto px-1 pb-4 max-h-[calc(85vh-200px)]">
          <div className="flex flex-col gap-8">
            <input
              type="hidden"
              {...register("fecha")}
              value={new Date().toISOString().split("T")[0]}
              readOnly
            />

            {/* Sección Cliente */}
            <section className="bg-card rounded-xl p-6 border border-default-200 shadow flex flex-col gap-4 mb-2">
              <label className="font-semibold text-lg flex items-center gap-2">
                <Icon
                  icon="heroicons:user"
                  className="w-5 h-5 text-primary dark:text-primary-300"
                />{" "}
                Cliente
              </label>
              <div className="relative w-full">
                <div
                  className="w-full flex items-center cursor-pointer bg-card border border-default-300 rounded-lg h-10 px-3 text-sm justify-between items-center transition duration-300 focus-within:border-default-500/50 focus-within:outline-none disabled:bg-default-200 disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => setDropdownClientesOpen(true)}
                  tabIndex={0}
                  role="button"
                  aria-haspopup="listbox"
                  aria-expanded={dropdownClientesOpen}
                >
                  <span className="flex-1 truncate">
                    {clienteSeleccionado
                      ? `${clienteSeleccionado.nombre} - ${clienteSeleccionado.cuit} - ${clienteSeleccionado.localidad}`
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
                    disabled={isSubmitting}
                  >
                    <Icon icon="heroicons:user-plus" className="w-4 h-4 mr-1" />{" "}
                    Nuevo
                  </Button>
                </div>
                {dropdownClientesOpen && (
                  <div className="absolute z-50 min-w-[8rem] overflow-hidden rounded-md border border-solid border-default-300 bg-card text-default-900 shadow-md mt-1 max-h-72 w-full animate-fade-in">
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
                          <div className="p-2 text-gray-400 dark:text-default-500 text-sm">
                            No hay clientes
                          </div>
                        )}
                        {clientesFiltrados.map((c) => (
                          <div
                            key={c.id}
                            className="relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 px-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                            onClick={() => {
                              handleClienteChange(c.id);
                              setDropdownClientesOpen(false);
                            }}
                            role="option"
                            tabIndex={0}
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
                <span className="text-red-500 dark:text-red-400 text-xs mt-1">
                  {errors.clienteId.message}
                </span>
              )}
              <div className="space-y-2 bg-card p-4 border border-default-100 shadow-sm">
                <div className="text-base font-semibold pb-1 flex items-center gap-2">
                  <Icon
                    icon="heroicons:identification"
                    className="w-4 h-4 text-primary dark:text-primary-300"
                  />{" "}
                  Datos del cliente
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Input
                      value={clienteSeleccionado?.nombre || ""}
                      placeholder="Nombre del cliente"
                      readOnly
                      className="w-full bg-gray-50 dark:bg-default-800 border border-default-200 rounded-md dark:text-default-100"
                    />
                    {errors.cliente?.nombre && (
                      <span className="text-red-500 dark:text-red-400 text-xs">
                        {errors.cliente?.nombre.message}
                      </span>
                    )}
                  </div>
                  <div>
                    <Input
                      value={clienteSeleccionado?.cuit || ""}
                      placeholder="CUIT"
                      readOnly
                      className="w-full bg-gray-50 dark:bg-default-800 border border-default-200 rounded-md dark:text-default-100"
                    />
                    {errors.cliente?.cuit && (
                      <span className="text-red-500 dark:text-red-400 text-xs">
                        {errors.cliente?.cuit.message}
                      </span>
                    )}
                  </div>
                  <div>
                    <Input
                      value={clienteSeleccionado?.direccion || ""}
                      placeholder="Dirección"
                      readOnly
                      className="w-full bg-gray-50 dark:bg-default-800 border border-default-200 rounded-md dark:text-default-100"
                    />
                    {errors.cliente?.direccion && (
                      <span className="text-red-500 dark:text-red-400 text-xs">
                        {errors.cliente?.direccion.message}
                      </span>
                    )}
                  </div>
                  <div>
                    <Input
                      value={clienteSeleccionado?.telefono || ""}
                      placeholder="Teléfono"
                      readOnly
                      className="w-full bg-gray-50 dark:bg-default-800 border border-default-200 rounded-md dark:text-default-100"
                    />
                    {errors.cliente?.telefono && (
                      <span className="text-red-500 dark:text-red-400 text-xs">
                        {errors.cliente?.telefono.message}
                      </span>
                    )}
                  </div>
                  <div>
                    <Input
                      value={clienteSeleccionado?.email || ""}
                      placeholder="Email"
                      readOnly
                      className="w-full bg-gray-50 dark:bg-default-800 border border-default-200 rounded-md dark:text-default-100"
                    />
                    {errors.cliente?.email && (
                      <span className="text-red-500 dark:text-red-400 text-xs">
                        {errors.cliente?.email.message}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </section>

            {/* Sección Productos - Diseño Mejorado */}
            <section className="bg-card rounded-xl border border-default-200 shadow-sm overflow-hidden">
              {/* Header con estadísticas */}
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                      <svg
                        className="w-6 h-6 text-blue-600 dark:text-blue-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                        />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        Productos
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Selecciona los productos para tu venta
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const productoEjemplo = {
                          id: "ejemplo-" + Date.now(),
                          nombre: "Producto de Ejemplo",
                          precio: 15000,
                          unidad: "unidad",
                          stock: 100,
                          cantidad: 2,
                          descuento: 0,
                          categoria: "Ferretería",
                        };
                        setProductosSeleccionados([...productosSeleccionados, productoEjemplo]);
                      }}
                      disabled={isSubmitting}
                      className="text-xs px-3 py-1 bg-green-50 text-green-700 border-green-200 hover:bg-green-100"
                    >
                      <Icon icon="heroicons:plus-circle" className="w-3 h-3 mr-1" />
                      Agregar Ejemplo
                    </Button>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                        {productosSeleccionados.length}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        productos agregados
                      </div>
                    </div>
                  </div>
                </div>

                {/* Filtros mejorados */}
                <div className="flex flex-col sm:flex-row gap-3">
                  {/* Filtro de categorías */}
                  <div className="flex-1">
                    <div className="flex bg-white dark:bg-gray-800 rounded-lg p-1 shadow-sm border border-gray-200 dark:border-gray-600">
                      {categoriasState.map((categoria) => (
                        <button
                          key={categoria}
                          type="button"
                          className={`rounded-full px-4 py-1 text-sm flex items-center gap-2 transition-all ${
                            categoriaId === categoria
                              ? "bg-blue-600 text-white"
                              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                          }`}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (categoriaId === categoria) {
                              setCategoriaId("");
                            } else {
                              setCategoriaId(categoria);
                            }
                          }}
                          disabled={isSubmitting}
                        >
                          {categoria}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Buscador mejorado */}
                  <div className="flex-1 relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <svg
                        className="h-5 w-5 text-gray-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                        />
                      </svg>
                    </div>
                    <input
                      type="text"
                      placeholder="Buscar productos..."
                      value={busquedaProducto}
                      onChange={(e) => setBusquedaProducto(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 bg-card"
                    />
                  </div>
                </div>
              </div>

              {/* Lista de productos */}
              <div className="max-h-96 overflow-y-auto">
                {categoriasState.length === 0 ? (
                  <div className="p-8 text-center">
                    <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center">
                      <svg
                        className="w-8 h-8 text-gray-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
                        />
                      </svg>
                    </div>
                    <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                      No hay categorías disponibles
                    </h3>
                    <p className="text-gray-500 dark:text-gray-400">
                      Agrega productos a las categorías para comenzar
                    </p>
                  </div>
                ) : !categoriaId ? (
                  <div className="p-8 text-center">
                    <div className="w-16 h-16 mx-auto mb-4 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
                      <svg
                        className="w-8 h-8 text-blue-600 dark:text-blue-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                    </div>
                    <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                      Selecciona una categoría
                    </h3>
                    <p className="text-gray-500 dark:text-gray-400">
                      Elige una categoría para ver los productos disponibles
                    </p>
                  </div>
                ) : productosPorCategoria[categoriaId]?.filter(
                    (prod) =>
                      prod.nombre
                        .toLowerCase()
                        .includes(busquedaProducto.toLowerCase()) ||
                      (prod.unidadMedida || "")
                        .toLowerCase()
                        .includes(busquedaProducto.toLowerCase())
                  ).length === 0 ? (
                  <div className="p-8 text-center">
                    <div className="w-16 h-16 mx-auto mb-4 bg-yellow-100 dark:bg-yellow-900/30 rounded-full flex items-center justify-center">
                      <svg
                        className="w-8 h-8 text-yellow-600 dark:text-yellow-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                        />
                      </svg>
                    </div>
                    <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                      No se encontraron productos
                    </h3>
                    <p className="text-gray-500 dark:text-gray-400">
                      Intenta cambiar los filtros o la búsqueda
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
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
                      .map((prod) => {
                        const yaAgregado = productosSeleccionados.some(
                          (p) => p.id === prod.id
                        );
                        const precio = (() => {
                          if (prod.categoria === "Maderas") {
                            return prod.precioPorPie || 0;
                          } else if (prod.categoria === "Ferretería") {
                            return prod.valorVenta || 0;
                          } else {
                            return (
                              prod.precioUnidad ||
                              prod.precioUnidadVenta ||
                              prod.precioUnidadHerraje ||
                              prod.precioUnidadQuimico ||
                              prod.precioUnidadHerramienta ||
                              0
                            );
                          }
                        })();

                        return (
                          <div
                            key={prod.id}
                            className={`group relative dark:bg-gray-800 rounded-lg border-2 transition-all duration-200 hover:shadow-md h-full flex flex-col ${
                              yaAgregado
                                ? "border-green-200 bg-green-50 dark:bg-green-900/20 dark:border-green-700"
                                : "border-gray-200 dark:border-gray-600 hover:border-blue-300 dark:hover:border-blue-500"
                            }`}
                          >
                            <div className="p-4 flex flex-col h-full">
                              <div className="flex items-start justify-between mb-3">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-3 mb-2">
                                    <div
                                      className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                                        prod.categoria === "Maderas"
                                          ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
                                          : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                                      }`}
                                    >
                                      {prod.categoria === "Maderas"
                                        ? "🌲"
                                        : "🔧"}
                                    </div>
                                    <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                                      {prod.nombre}
                                    </h4>
                                    {yaAgregado && (
                                      <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
                                        <svg
                                          className="w-4 h-4"
                                          fill="currentColor"
                                          viewBox="0 0 20 20"
                                        >
                                          <path
                                            fillRule="evenodd"
                                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                            clipRule="evenodd"
                                          />
                                        </svg>
                                        <span className="text-xs font-medium">
                                          Agregado
                                        </span>
                                      </div>
                                    )}
                                  </div>

                                  <div className="grid grid-cols-2 gap-3 text-xs text-gray-600 dark:text-gray-400 mb-3">
                                    <div>
                                      <span className="font-medium">
                                        Precio:
                                      </span>
                                      <span className="ml-1 font-bold text-blue-600 dark:text-blue-400">
                                        ${formatearNumeroArgentino(precio)}
                                      </span>
                                    </div>
                                    <div>
                                      <span className="font-medium">
                                        Unidad:
                                      </span>
                                      <span className="ml-1">
                                        {prod.unidadMedida ||
                                          prod.unidadVenta ||
                                          prod.unidadVentaHerraje ||
                                          prod.unidadVentaQuimico ||
                                          prod.unidadVentaHerramienta}
                                      </span>
                                    </div>
                                    <div>
                                      <span className="font-medium">
                                        Stock:
                                      </span>
                                      <span
                                        className={`ml-1 font-bold ${
                                          prod.stock > 10
                                            ? "text-green-600 dark:text-green-400"
                                            : prod.stock > 0
                                            ? "text-yellow-600 dark:text-yellow-400"
                                            : "text-red-600 dark:text-red-400"
                                        }`}
                                      >
                                        {prod.stock}
                                      </span>
                                    </div>
                                    {prod.categoria === "Maderas" && (
                                      <div>
                                        <span className="font-medium">
                                          $/pie:
                                        </span>
                                        <span className="ml-1 font-bold text-orange-600 dark:text-orange-400">
                                          {prod.precioPorPie}
                                        </span>
                                      </div>
                                    )}
                                  </div>

                                  {/* Dimensiones para maderas */}
                                  {prod.categoria === "Maderas" && (
                                    <div className="mt-2 p-2 bg-orange-50 dark:bg-orange-900/20 rounded border border-orange-200 dark:border-orange-700 mb-3">
                                      <div className="flex items-center gap-1 text-xs text-orange-700 dark:text-orange-400 mb-1">
                                        <svg
                                          className="w-3 h-3"
                                          fill="currentColor"
                                          viewBox="0 0 20 20"
                                        >
                                          <path
                                            fillRule="evenodd"
                                            d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z"
                                            clipRule="evenodd"
                                          />
                                        </svg>
                                        <span className="font-medium">
                                          Dimensiones
                                        </span>
                                      </div>
                                      <div className="flex gap-3 text-xs">
                                        <span>
                                          Alto:{" "}
                                          <span className="font-bold">
                                            {prod.alto || 0}
                                          </span>{" "}
                                          cm
                                        </span>
                                        <span>
                                          Ancho:{" "}
                                          <span className="font-bold">
                                            {prod.ancho || 0}
                                          </span>{" "}
                                          cm
                                        </span>
                                        <span>
                                          Largo:{" "}
                                          <span className="font-bold">
                                            {prod.largo || 0}
                                          </span>{" "}
                                          cm
                                        </span>
                                      </div>
                                    </div>
                                  )}

                                  {/* Alertas de stock */}
                                  {prod.stock <= 0 && (
                                    <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 rounded border border-red-200 dark:border-red-700 mb-3">
                                      <div className="flex items-center gap-1 text-xs text-red-700 dark:text-red-400">
                                        <svg
                                          className="w-3 h-3"
                                          fill="currentColor"
                                          viewBox="0 0 20 20"
                                        >
                                          <path
                                            fillRule="evenodd"
                                            d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                                            clipRule="evenodd"
                                          />
                                        </svg>
                                        <span className="font-medium">
                                          ¡Sin stock! Se permitirá avanzar
                                          igual.
                                        </span>
                                      </div>
                                    </div>
                                  )}
                                  {prod.stock > 0 && prod.stock <= 3 && (
                                    <div className="mt-2 p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded border border-yellow-200 dark:border-yellow-700 mb-3">
                                      <div className="flex items-center gap-1 text-xs text-yellow-700 dark:text-yellow-400">
                                        <svg
                                          className="w-3 h-3"
                                          fill="currentColor"
                                          viewBox="0 0 20 20"
                                        >
                                          <path
                                            fillRule="evenodd"
                                            d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                                            clipRule="evenodd"
                                          />
                                        </svg>
                                        <span className="font-medium">
                                          Stock bajo: quedan {prod.stock}{" "}
                                          unidades.
                                        </span>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>

                              <div className="mt-auto">
                                {yaAgregado ? (
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleDecrementarCantidad(prod.id)
                                      }
                                      disabled={
                                        isSubmitting ||
                                        productosSeleccionados.find(
                                          (p) => p.id === prod.id
                                        )?.cantidad <= 1
                                      }
                                      className="px-2 py-1 rounded bg-gray-200 text-gray-700 hover:bg-gray-300 disabled:opacity-50"
                                    >
                                      -
                                    </button>
                                    <input
                                      type="number"
                                      min={1}
                                      value={
                                        productosSeleccionados.find(
                                          (p) => p.id === prod.id
                                        )?.cantidad || 1
                                      }
                                      onChange={(e) =>
                                        handleCantidadChange(
                                          prod.id,
                                          e.target.value
                                        )
                                      }
                                      className="w-12 text-center border rounded"
                                      disabled={isSubmitting}
                                    />
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleIncrementarCantidad(prod.id)
                                      }
                                      disabled={isSubmitting}
                                      className="px-2 py-1 rounded bg-gray-200 text-gray-700 hover:bg-gray-300"
                                    >
                                      +
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleQuitarProducto(prod.id)
                                      }
                                      disabled={isSubmitting}
                                      className="ml-2 px-2 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200"
                                    >
                                      Quitar
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (prod.categoria === "Maderas") {
                                        const alto = Number(prod.alto) || 0;
                                        const ancho = Number(prod.ancho) || 0;
                                        const largo = Number(prod.largo) || 0;
                                        const precioPorPie =
                                          Number(prod.precioPorPie) || 0;
                                        if (
                                          alto > 0 &&
                                          ancho > 0 &&
                                          largo > 0 &&
                                          precioPorPie > 0
                                        ) {
                                          const precio =
                                            calcularPrecioCorteMadera({
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
                                        } else {
                                          setSubmitStatus("error");
                                          setSubmitMessage(
                                            "El producto de madera no tiene dimensiones válidas en la base de datos."
                                          );
                                          return;
                                        }
                                      } else {
                                        handleAgregarProducto({
                                          id: prod.id,
                                          nombre: prod.nombre,
                                          precio: precio,
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
                                    disabled={isSubmitting}
                                    className="w-full px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center justify-center gap-2 bg-blue-600 text-white hover:bg-blue-700 shadow-sm"
                                  >
                                    Agregar
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            </section>

            {/* Tabla de productos seleccionados */}
            {productosSeleccionados.length > 0 && (
              <section className="bg-card rounded-lg p-4 border border-default-200 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-default-900">
                    Productos Seleccionados
                  </h3>
                  <span className="text-sm text-default-600">
                    {productosSeleccionados.length} producto
                    {productosSeleccionados.length !== 1 ? "s" : ""}
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full caption-top text-sm overflow-hidden">
                    <thead className="[&_tr]:border-b bg-default-">
                      <tr className="border-b border-default-300 transition-colors data-[state=selected]:bg-muted">
                        <th className="h-14 px-4 ltr:text-left rtl:text-right last:ltr:text-right last:rtl:text-left align-middle font-semibold text-sm text-default-800 capitalize [&:has([role=checkbox])]:ltr:pr-0 [&:has([role=checkbox])]:rtl:pl-0">
                          Categoría
                        </th>
                        <th className="h-14 px-4 ltr:text-left rtl:text-right last:ltr:text-right last:rtl:text-left align-middle font-semibold text-sm text-default-800 capitalize [&:has([role=checkbox])]:ltr:pr-0 [&:has([role=checkbox])]:rtl:pl-0">
                          Producto
                        </th>
                        <th className="h-14 px-4 ltr:text-left rtl:text-right last:ltr:text-right last:rtl:text-left align-middle font-semibold text-sm text-default-800 capitalize [&:has([role=checkbox])]:ltr:pr-0 [&:has([role=checkbox])]:rtl:pl-0">
                          Cant.
                        </th>
                        <th className="h-14 px-4 ltr:text-left rtl:text-right last:ltr:text-right last:rtl:text-left align-middle font-semibold text-sm text-default-800 capitalize [&:has([role=checkbox])]:ltr:pr-0 [&:has([role=checkbox])]:rtl:pl-0">
                          Cepillado
                        </th>
                        <th className="h-14 px-4 ltr:text-left rtl:text-right last:ltr:text-right last:rtl:text-left align-middle font-semibold text-sm text-default-800 capitalize [&:has([role=checkbox])]:ltr:pr-0 [&:has([role=checkbox])]:rtl:pl-0">
                          Precio unit.
                        </th>
                        <th className="h-14 px-4 ltr:text-left rtl:text-right last:ltr:text-right last:rtl:text-left align-middle font-semibold text-sm text-default-800 capitalize [&:has([role=checkbox])]:ltr:pr-0 [&:has([role=checkbox])]:rtl:pl-0">
                          Desc.
                        </th>
                        <th className="h-14 px-4 ltr:text-left rtl:text-right last:ltr:text-right last:rtl:text-left align-middle font-semibold text-sm text-default-800 capitalize [&:has([role=checkbox])]:ltr:pr-0 [&:has([role=checkbox])]:rtl:pl-0">
                          Subtotal
                        </th>
                        <th className="h-14 px-4 ltr:text-left rtl:text-right last:ltr:text-right last:rtl:text-left align-middle font-semibold text-sm text-default-800 capitalize [&:has([role=checkbox])]:ltr:pr-0 [&:has([role=checkbox])]:rtl:pl-0">
                          Acción
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {productosSeleccionados.map((p, idx) => (
                        <tr
                          key={p.id}
                          className="border-b border-default-300 transition-colors data-[state=selected]:bg-muted"
                        >
                          <td className="p-4 align-middle text-sm text-default-600 last:text-right last:rtl:text-left font-normal [&:has([role=checkbox])]:ltr:pr-0 [&:has([role=checkbox])]:rtl:pl-0">
                            {p.categoria}
                          </td>
                          <td className="p-4 align-middle text-sm text-default-600 last:text-right last:rtl:text-left font-normal [&:has([role=checkbox])]:ltr:pr-0 [&:has([role=checkbox])]:rtl:pl-0">
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
                                  <div className="inline-flex items-center gap-1">
                                    <input
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      value={p.precioPorPie}
                                      onChange={(e) =>
                                        handlePrecioPorPieChange(
                                          p.id,
                                          e.target.value
                                        )
                                      }
                                      className="w-20 text-center border border-blue-300 rounded px-2 py-1 text-xs font-bold bg-blue-50 focus:bg-white focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                                      disabled={isSubmitting}
                                      placeholder="0.00"
                                      title="Editar precio por pie"
                                    />
                                    <svg
                                      className="w-3 h-3 text-blue-500"
                                      fill="none"
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth="2"
                                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                      />
                                    </svg>
                                  </div>
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
                          <td className="p-4 align-middle text-sm text-default-600 last:text-right last:rtl:text-left font-normal [&:has([role=checkbox])]:ltr:pr-0 [&:has([role=checkbox])]:rtl:pl-0">
                            <div className="flex items-center justify-center">
                              <div className="flex items-center border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden bg-white dark:bg-gray-700">
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleDecrementarCantidad(p.id)
                                  }
                                  disabled={isSubmitting || p.cantidad <= 1}
                                  className="px-3 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150"
                                >
                                  <svg
                                    className="w-4 h-4"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth="2"
                                      d="M20 12H4"
                                    />
                                  </svg>
                                </button>

                                <input
                                  type="number"
                                  min={1}
                                  value={p.cantidad}
                                  onChange={(e) =>
                                    handleCantidadChange(p.id, e.target.value)
                                  }
                                  className="w-16 text-center text-lg font-bold border-0 bg-transparent focus:ring-0 focus:outline-none text-gray-900 dark:text-gray-100"
                                  disabled={isSubmitting}
                                />

                                <button
                                  type="button"
                                  onClick={() =>
                                    handleIncrementarCantidad(p.id)
                                  }
                                  disabled={isSubmitting}
                                  className="px-3 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors duration-150"
                                >
                                  <svg
                                    className="w-4 h-4"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth="2"
                                      d="M12 4v16m8-8H4"
                                    />
                                  </svg>
                                </button>
                              </div>
                            </div>
                          </td>
                          <td className="p-4 align-middle text-sm text-default-600 last:text-right last:rtl:text-left font-normal [&:has([role=checkbox])]:ltr:pr-0 [&:has([role=checkbox])]:rtl:pl-0">
                            {p.categoria === "Maderas" ? (
                              <div className="flex items-center justify-center">
                                <input
                                  type="checkbox"
                                  checked={p.cepilladoAplicado || false}
                                  onChange={(e) => {
                                    recalcularPreciosMadera(
                                      p.id,
                                      e.target.checked
                                    );
                                  }}
                                  className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                                  disabled={isSubmitting}
                                  title="Aplicar cepillado (+6.6%)"
                                />
                              </div>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                          <td className="p-4 align-middle text-sm text-default-600 last:text-right last:rtl:text-left font-normal [&:has([role=checkbox])]:ltr:pr-0 [&:has([role=checkbox])]:rtl:pl-0">
                            ${formatearNumeroArgentino(p.precio)}
                          </td>
                          <td className="p-4 align-middle text-sm text-default-600 last:text-right last:rtl:text-left font-normal [&:has([role=checkbox])]:ltr:pr-0 [&:has([role=checkbox])]:rtl:pl-0">
                            <input
                              type="number"
                              min={0}
                              max={100}
                              value={p.descuento || 0}
                              onChange={(e) =>
                                handleDescuentoChange(p.id, e.target.value)
                              }
                              className="w-20 mx-auto text-center border rounded px-2 py-1"
                              disabled={isSubmitting}
                            />
                          </td>
                          <td className="p-4 align-middle text-sm text-default-600 last:text-right last:rtl:text-left font-normal [&:has([role=checkbox])]:ltr:pr-0 [&:has([role=checkbox])]:rtl:pl-0 font-semibold">
                            $
                            {formatearNumeroArgentino(
                              Number(p.precio) *
                                Number(p.cantidad) *
                                (1 - Number(p.descuento || 0) / 100)
                            )}
                          </td>
                          <td className="p-4 align-middle text-sm text-default-600 last:text-right last:rtl:text-left font-normal [&:has([role=checkbox])]:ltr:pr-0 [&:has([role=checkbox])]:rtl:pl-0">
                            <button
                              type="button"
                              onClick={() => handleQuitarProducto(p.id)}
                              disabled={isSubmitting}
                              className="text-lg font-bold text-red-500 hover:text-red-700"
                              title="Quitar producto"
                            >
                              ×
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {/* Sección condiciones y envío */}
            <section className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {tipo === "venta" && (
                <>
                  <div className="space-y-2 rounded-lg p-4 border border-default-200 shadow-sm">
                    <div className="text-base font-semibold pb-1">
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
                      className="w-full px-3 flex justify-between items-center read-only:bg-background disabled:cursor-not-allowed disabled:opacity-50 transition duration-300 border-default-300 text-default-500 focus:outline-hidden focus:border-default-500/50 disabled:bg-default-200 placeholder:text-accent-foreground/50 [&>svg]:stroke-default-600 border rounded-lg h-10 text-sm"
                      disabled={isSubmitting}
                    >
                      <option value="">Tipo de envío...</option>
                      <option value="retiro_local">Retiro en local</option>
                      <option value="envio_domicilio">Envío a domicilio</option>
                    </select>
                    {errors.tipoEnvio && (
                      <span className="text-red-500 dark:text-red-400 text-xs">
                        {errors.tipoEnvio.message}
                      </span>
                    )}
                    {tipoEnvioSeleccionado === "envio_domicilio" && (
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
                    )}
                    {errors.prioridad && (
                      <span className="text-red-500 dark:text-red-400 text-xs">
                        {errors.prioridad.message}
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
                            {errors.direccionEnvio && (
                              <span className="text-red-500 dark:text-red-400 text-xs">
                                {errors.direccionEnvio.message}
                              </span>
                            )}
                            {errors.localidadEnvio && (
                              <span className="text-red-500 dark:text-red-400 text-xs">
                                {errors.localidadEnvio.message}
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
                          </>
                        )}
                        <select
                          {...register("transportista")}
                          className="w-full px-3 flex justify-between items-center read-only:bg-background disabled:cursor-not-allowed disabled:opacity-50 transition duration-300 border-default-300 text-default-500 focus:outline-hidden focus:border-default-500/50 disabled:bg-default-200 placeholder:text-accent-foreground/50 [&>svg]:stroke-default-600 border rounded-lg h-10 text-sm"
                          disabled={isSubmitting}
                        >
                          <option value="">Transportista...</option>
                          {transportistas.map((t) => (
                            <option key={t}>{t}</option>
                          ))}
                        </select>
                        {errors.transportista && (
                          <span className="text-red-500 dark:text-red-400 text-xs">
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
                          <span className="text-red-500 dark:text-red-400 text-xs">
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
                          <span className="text-red-500 dark:text-red-400 text-xs">
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
                          <span className="text-red-500 dark:text-red-400 text-xs">
                            {errors.rangoHorario.message}
                          </span>
                        )}
                      </>
                    )}
                  </div>

                  <div className="space-y-2 bg-card rounded-lg p-4 border border-default-200 shadow-sm">
                    <div className="text-base font-semibold pb-1">
                      Información adicional
                    </div>
                    <div className="text-sm text-gray-600 bg-gray-50 p-2 rounded">
                      <strong>Vendedor:</strong> {user?.email || "Usuario no identificado"}
                    </div>
                    <Textarea
                      {...register("observaciones")}
                      placeholder="Observaciones adicionales"
                      className="w-full"
                      disabled={isSubmitting}
                    />
                    {errors.observaciones && (
                      <span className="text-red-500 dark:text-red-400 text-xs">
                        {errors.observaciones.message}
                      </span>
                    )}
                  </div>
                </>
              )}
              {tipo === "presupuesto" && (
                <div className="space-y-2 bg-card rounded-lg p-4 border border-default-200 shadow-sm">
                  <div className="text-base font-semibold pb-1">
                    Información de envío
                  </div>
                  <select
                    {...register("tipoEnvio")}
                    className="w-full px-3 flex justify-between items-center read-only:bg-background disabled:cursor-not-allowed disabled:opacity-50 transition duration-300 border-default-300 text-default-500 focus:outline-hidden focus:border-default-500/50 disabled:bg-default-200 placeholder:text-accent-foreground/50 [&>svg]:stroke-default-600 border rounded-lg h-10 text-sm"
                    disabled={isSubmitting}
                  >
                    <option value="">Tipo de envío...</option>
                    <option value="retiro_local">Retiro en local</option>
                    <option value="envio_domicilio">Envío a domicilio</option>
                  </select>
                  {errors.tipoEnvio && (
                    <span className="text-red-500 dark:text-red-400 text-xs">
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
                    <span className="text-red-500 dark:text-red-400 text-xs">
                      {errors.costoEnvio.message}
                    </span>
                  )}
                </div>
              )}
            </section>

            {/* Sección Condiciones de pago y entrega - ÚLTIMA */}
            {tipo === "venta" && (
              <section className="bg-card rounded-xl p-6 border border-default-200 dark:border-default-700 shadow flex flex-col gap-4 mb-2">
                <label className="font-semibold text-base flex items-center gap-2">
                  <Icon
                    icon="heroicons:credit-card"
                    className="w-5 h-5 text-primary dark:text-primary-300"
                  />{" "}
                  Condiciones de pago y entrega
                </label>
                <div className="space-y-2 bg-card rounded-lg p-4 border border-default-200 shadow-sm">
                  <select
                    {...register("formaPago")}
                    className="w-full px-3 flex justify-between items-center read-only:bg-background disabled:cursor-not-allowed disabled:opacity-50 transition duration-300 border-default-300 text-default-500 focus:outline-hidden focus:border-default-500/50 disabled:bg-default-200 placeholder:text-accent-foreground/50 [&>svg]:stroke-default-600 border rounded-lg h-10 text-sm"
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
                    <span className="text-red-500 dark:text-red-400 text-xs">
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
                        <span className="text-red-500 dark:text-red-400 text-xs">
                          {errors.montoAbonado.message}
                        </span>
                      )}
                    </>
                  )}
                </div>
              </section>
            )}
          </div>
        </div>

        {/* Totales y acciones */}
        <div className="bg-card space-y-4 flex-shrink-0 rounded-b-xl border-t border-default-100">
          <div className="flex flex-col items-end gap-2">
            <div className="bg-primary/5 dark:bg-primary/10 border border-primary/20 rounded-lg px-6 py-3 flex flex-col md:flex-row gap-4 md:gap-8 text-lg shadow-sm w-full md:w-auto font-semibold">
              <div>
                Subtotal:{" "}
                <span className="font-bold">
                  ${formatearNumeroArgentino(subtotal)}
                </span>
              </div>
              <div>
                Descuento:{" "}
                <span className="font-bold">
                  ${formatearNumeroArgentino(descuentoTotal)}
                </span>
              </div>
              {costoEnvioCalculado > 0 && (
                <div>
                  Costo de envío:{" "}
                  <span className="font-bold">
                    ${formatearNumeroArgentino(costoEnvioCalculado)}
                  </span>
                </div>
              )}
              <div>
                Total:{" "}
                <span className="font-bold text-primary">
                  ${formatearNumeroArgentino(total)}
                </span>
              </div>
            </div>
          </div>

          <DialogFooter className="flex flex-col sm:flex-row gap-4 justify-end pt-4 bg-card">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              className="w-full sm:w-auto hover:bg-gray-100 dark:hover:bg-default-700 rounded-md px-4 sm:px-6 py-2 text-sm sm:text-base"
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="default"
              className="w-full sm:w-auto shadow-md min-w-[160px] rounded-md px-4 sm:px-6 py-2 text-sm sm:text-base font-semibold"
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
        <DialogContent className="w-[95vw] max-w-[420px] rounded-xl shadow-2xl border-2 border-primary/20 bg-card border-default-700">
          <DialogHeader className="bg-card">
            <DialogTitle className="text-xl font-bold text-primary dark:text-primary-300 flex items-center gap-2 bg-card">
              <Icon icon="heroicons:user-plus" className="w-6 h-6" /> Agregar
              Cliente
            </DialogTitle>
            <DialogDescription className="text-base text-default-600 dark:text-default-300 bg-card">
              Complete los datos del nuevo cliente para agregarlo al sistema.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2 bg-card">
            {/* Checkbox para diferenciar tipo de cliente */}
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
                ¿Es un cliente existente/antiguo?
              </label>
            </div>
            <Input
              placeholder="Nombre *"
              className="w-full rounded-md border-default-200 dark:border-default-700 bg-white dark:bg-default-800 text-base text-default-900 focus:border-primary focus:dark:border-primary-400 px-4 py-2"
              value={nuevoCliente.nombre}
              onChange={(e) =>
                setNuevoCliente({ ...nuevoCliente, nombre: e.target.value })
              }
              required
            />
            <Input
              placeholder="CUIT / DNI"
              className="w-full rounded-md border-default-200 dark:border-default-700 bg-white dark:bg-default-800 text-base text-default-900 focus:border-primary focus:dark:border-primary-400 px-4 py-2"
              value={nuevoCliente.cuit || ""}
              onChange={(e) =>
                setNuevoCliente({ ...nuevoCliente, cuit: e.target.value })
              }
            />
            <Input
              placeholder="Dirección *"
              className="w-full rounded-md border-default-200 dark:border-default-700 bg-white dark:bg-default-800 text-base text-default-900 focus:border-primary focus:dark:border-primary-400 px-4 py-2"
              value={nuevoCliente.direccion}
              onChange={(e) =>
                setNuevoCliente({ ...nuevoCliente, direccion: e.target.value })
              }
              required
            />
            <Input
              placeholder="Teléfono *"
              className="w-full rounded-md border-default-200 dark:border-default-700 bg-white dark:bg-default-800 text-base text-default-900 focus:border-primary focus:dark:border-primary-400 px-4 py-2"
              value={nuevoCliente.telefono}
              onChange={(e) =>
                setNuevoCliente({ ...nuevoCliente, telefono: e.target.value })
              }
              required
            />
            <Input
              placeholder="Email"
              className="w-full rounded-md border-default-200 dark:border-default-700 bg-white dark:bg-default-800 text-base text-default-900 focus:border-primary focus:dark:border-primary-400 px-4 py-2"
              value={nuevoCliente.email}
              onChange={(e) =>
                setNuevoCliente({ ...nuevoCliente, email: e.target.value })
              }
            />
            <Input
              placeholder="Localidad"
              className="w-full rounded-md border-default-200 dark:border-default-700 bg-white dark:bg-default-800 text-base text-default-900 focus:border-primary focus:dark:border-primary-400 px-4 py-2"
              value={nuevoCliente.localidad || ""}
              onChange={(e) =>
                setNuevoCliente({ ...nuevoCliente, localidad: e.target.value })
              }
            />
            <Input
              placeholder="Partido"
              className="w-full rounded-md border-default-200 dark:border-default-700 bg-white dark:bg-default-800 text-base text-default-900 focus:border-primary focus:dark:border-primary-400 px-4 py-2"
              value={nuevoCliente.partido || ""}
              onChange={(e) =>
                setNuevoCliente({ ...nuevoCliente, partido: e.target.value })
              }
            />
            <Input
              placeholder="Barrio"
              className="w-full rounded-md border-default-200 dark:border-default-700 bg-white dark:bg-default-800 text-base text-default-900 focus:border-primary focus:dark:border-primary-400 px-4 py-2"
              value={nuevoCliente.barrio || ""}
              onChange={(e) =>
                setNuevoCliente({ ...nuevoCliente, barrio: e.target.value })
              }
            />
            <Input
              placeholder="Área"
              className="w-full rounded-md border-default-200 dark:border-default-700 bg-white dark:bg-default-800 text-base text-default-900 focus:border-primary focus:dark:border-primary-400 px-4 py-2"
              value={nuevoCliente.area || ""}
              onChange={(e) =>
                setNuevoCliente({ ...nuevoCliente, area: e.target.value })
              }
            />
            <Input
              placeholder="Lote"
              className="w-full rounded-md border-default-200 dark:border-default-700 bg-white dark:bg-default-800 text-base text-default-900 focus:border-primary focus:dark:border-primary-400 px-4 py-2"
              value={nuevoCliente.lote || ""}
              onChange={(e) =>
                setNuevoCliente({ ...nuevoCliente, lote: e.target.value })
              }
            />
            <Textarea
              placeholder="Descripción"
              className="w-full rounded-md border-default-200 dark:border-default-700 bg-white dark:bg-default-800 text-base text-default-900 focus:border-primary focus:dark:border-primary-400 px-4 py-2 min-h-[60px]"
              value={nuevoCliente.descripcion || ""}
              onChange={(e) =>
                setNuevoCliente({
                  ...nuevoCliente,
                  descripcion: e.target.value,
                })
              }
            />
          </div>
          <DialogFooter className="flex flex-col sm:flex-row gap-4 justify-end pt-2 bg-card">
            <Button
              variant="outline"
              className="w-full sm:w-auto hover:bg-gray-100 dark:hover:bg-default-700 rounded-md px-4 sm:px-6 py-2 text-sm sm:text-base"
              onClick={() => setOpenNuevoCliente(false)}
            >
              Cancelar
            </Button>
            <Button
              variant="default"
              className="w-full sm:w-auto shadow-md min-w-[120px] rounded-md px-4 sm:px-6 py-2 text-sm sm:text-base font-semibold"
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
                  esClienteViejo: nuevoCliente.esClienteViejo || false,
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
                  esClienteViejo: false,
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

const VentasPage = () => {
  const { user } = useAuth();
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
            observaciones: `Salida por venta`,
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
            vendedor: user?.email || "Usuario no identificado",
            direccionEnvio: cleanFormData.direccionEnvio,
            localidadEnvio: cleanFormData.localidadEnvio,
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
            // Asegurar que las propiedades específicas de madera se preserven
            ...(p.categoria === "Maderas" && {
              alto: Number(p.alto) || 0,
              ancho: Number(p.ancho) || 0,
              largo: Number(p.largo) || 0,
              precioPorPie: Number(p.precioPorPie) || 0,
              cepilladoAplicado: p.cepilladoAplicado || false,
            }),
          }));

          console.log("[DEBUG] Campos de envío recibidos:", {
            tipoEnvio: formData.tipoEnvio,
            costoEnvio: formData.costoEnvio,
          });

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

          console.log("[DEBUG] Costo de envío procesado:", costoEnvioFinal);

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
            total: (() => {
              const subtotal = productosLimpios.reduce(
                (acc, p) => acc + Number(p.precio) * Number(p.cantidad),
                0
              );
              const descuento = productosLimpios.reduce(
                (acc, p) => acc + Number(p.descuento) * Number(p.cantidad),
                0
              );
              const envio = costoEnvioFinal || 0;
              return subtotal - descuento + envio;
            })(),
            fechaCreacion: new Date().toISOString(),
            tipo: "presupuesto",
            numeroPedido: nextNumeroPedido,
            vendedor: user?.email || "Usuario no identificado",
            tipoEnvio: formData.tipoEnvio || "",
            costoEnvio: costoEnvioFinal,
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
    <div className="flex flex-col gap-8 py-8 mx-auto font-sans">
      <div className="flex flex-col sm:flex-row gap-4 mb-6 px-2">
        <div className="flex-1">
          <Button
            variant="default"
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 sm:px-6 py-3 text-sm sm:text-base font-semibold rounded-lg shadow-md bg-primary hover:bg-primary/90 transition-all"
            onClick={() => setOpen("presupuesto")}
          >
            <Icon
              icon="heroicons:document-plus"
              className="w-4 h-4 sm:w-5 sm:h-5"
            />
            <span className="hidden sm:inline">Agregar Presupuesto</span>
            <span className="sm:hidden">Presupuesto</span>
          </Button>
        </div>
        <div className="flex-1">
          <Button
            variant="default"
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 sm:px-6 py-3 text-sm sm:text-base font-semibold rounded-lg shadow-md bg-green-600 hover:bg-green-700 transition-all"
            onClick={() => setOpen("venta")}
          >
            <Icon
              icon="heroicons:shopping-cart"
              className="w-4 h-4 sm:w-5 sm:h-5"
            />
            <span className="hidden sm:inline">Agregar Venta</span>
            <span className="sm:hidden">Venta</span>
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 px-2">
        <Card className="rounded-xl shadow-lg border border-default-200">
          <CardHeader className="pb-2 border-b border-default-100 bg-default-50 rounded-t-xl">
            <CardTitle className="text-2xl font-bold text-default-900 flex items-center gap-2">
              <Icon
                icon="heroicons:document-text"
                className="w-6 h-6 text-primary"
              />
              Presupuestos
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <DataTable data={presupuestosData} columns={columnsPresupuestos} />
          </CardContent>
        </Card>
        <Card className="rounded-xl shadow-lg border border-default-200">
          <CardHeader className="pb-2 border-b border-default-100 bg-default-50 rounded-t-xl">
            <CardTitle className="text-2xl font-bold text-default-900 flex items-center gap-2">
              <Icon
                icon="heroicons:shopping-cart"
                className="w-6 h-6 text-green-600"
              />
              Ventas
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <DataTable data={ventasData} columns={columnsVentas} />
          </CardContent>
        </Card>
      </div>
      <Dialog open={!!open} onOpenChange={handleClose}>
        <DialogContent className="w-[98vw] max-w-[1500px] h-[90vh] flex flex-col rounded-2xl shadow-2xl border-2 border-primary/20 bg-card">
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
    if (data.numeroPedido && data.numeroPedido.startsWith("VENTA-")) {
      const num = parseInt(data.numeroPedido.replace("VENTA-", ""), 10);
      if (!isNaN(num) && num > maxNum) maxNum = num;
    }
  });
  return `VENTA-${String(maxNum + 1).padStart(5, "0")}`;
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
