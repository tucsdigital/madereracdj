"use client";
import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { columns } from "../(invoice)/invoice-list/invoice-list-table/components/columns";
import { DataTable } from "../(invoice)/invoice-list/invoice-list-table/components/data-table";
import { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";
import { Box, Layers, Settings, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { db } from "@/lib/firebase";
import { collection, getDocs, addDoc, doc, updateDoc, increment, serverTimestamp } from "firebase/firestore";
import { useRouter, useParams } from "next/navigation";

// Columnas para la tabla de envíos
const enviosColumns = [
  {
    accessorKey: "numeroPedido",
    header: "N° Pedido",
  },
  {
    accessorKey: "cliente.nombre",
    header: "Cliente",
  },
  {
    accessorKey: "fechaEntrega",
    header: "Fecha Entrega",
    cell: ({ row }) => {
      const fecha = row.getValue("fechaEntrega");
      return fecha ? new Date(fecha).toLocaleDateString('es-AR') : "-";
    },
  },
  {
    accessorKey: "estado",
    header: "Estado",
    cell: ({ row }) => {
      const estado = row.getValue("estado");
      const estados = {
        pendiente: { label: "Pendiente", color: "bg-yellow-100 text-yellow-800" },
        en_preparacion: { label: "En Preparación", color: "bg-blue-100 text-blue-800" },
        listo_para_envio: { label: "Listo para Envío", color: "bg-purple-100 text-purple-800" },
        en_transito: { label: "En Tránsito", color: "bg-orange-100 text-orange-800" },
        entregado: { label: "Entregado", color: "bg-green-100 text-green-800" },
        cancelado: { label: "Cancelado", color: "bg-red-100 text-red-800" },
      };
      const estadoInfo = estados[estado] || { label: estado, color: "bg-gray-100 text-gray-800" };
      return (
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${estadoInfo.color}`}>
          {estadoInfo.label}
        </span>
      );
    },
  },
  {
    accessorKey: "prioridad",
    header: "Prioridad",
    cell: ({ row }) => {
      const prioridad = row.getValue("prioridad");
      const prioridades = {
        alta: { label: "Alta", color: "bg-red-100 text-red-800" },
        media: { label: "Media", color: "bg-yellow-100 text-yellow-800" },
        baja: { label: "Baja", color: "bg-green-100 text-green-800" },
      };
      const prioridadInfo = prioridades[prioridad] || { label: prioridad, color: "bg-gray-100 text-gray-800" };
      return (
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${prioridadInfo.color}`}>
          {prioridadInfo.label}
        </span>
      );
    },
  },
  {
    accessorKey: "tipoEnvio",
    header: "Tipo Envío",
    cell: ({ row }) => {
      const tipo = row.getValue("tipoEnvio");
      const tipos = {
        retiro_local: "Retiro Local",
        envio_domicilio: "Domicilio",
        envio_obra: "Obra",
        transporte_propio: "Transporte Propio",
      };
      return tipos[tipo] || tipo;
    },
  },
  {
    accessorKey: "transportista",
    header: "Transportista",
  },
  {
    accessorKey: "totalVenta",
    header: "Total",
    cell: ({ row }) => {
      const total = row.getValue("totalVenta");
      return total ? `$${parseFloat(total).toFixed(2)}` : "-";
    },
  },
  {
    accessorKey: "vendedor",
    header: "Vendedor",
  },
];

// Categorías y productos ficticios
const categorias = [
  { id: 1, nombre: "Maderas", icon: <Box className="w-5 h-5 mr-2 text-primary" /> },
  { id: 2, nombre: "Tableros", icon: <Layers className="w-5 h-5 mr-2 text-primary" /> },
  { id: 3, nombre: "Accesorios", icon: <Settings className="w-5 h-5 mr-2 text-primary" /> },
];
const productosPorCategoria = {
  1: [
    { id: 101, nombre: "Pino 2x4", precio: 1500, unidad: "m" },
    { id: 102, nombre: "Eucalipto 1x6", precio: 1800, unidad: "m" },
    { id: 103, nombre: "Lapacho 2x6", precio: 3500, unidad: "m" },
  ],
  2: [
    { id: 201, nombre: "MDF 18mm", precio: 2500, unidad: "pliego" },
    { id: 202, nombre: "Fenólico 18mm", precio: 4200, unidad: "pliego" },
  ],
  3: [
    { id: 301, nombre: "Tornillos x100", precio: 900, unidad: "caja" },
    { id: 302, nombre: "Cola vinílica 1kg", precio: 1200, unidad: "unidad" },
  ],
};

function FormularioVentaPresupuesto({ tipo, onClose, onSubmit }) {
  // Estados de carga y feedback
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState(null); // 'success' | 'error' | null
  const [submitMessage, setSubmitMessage] = useState("");

  // Esquema Yup para presupuesto (mínimo)
  const schemaPresupuesto = yup.object().shape({
    fecha: yup.string().required("La fecha es obligatoria"),
    cliente: yup.object().shape({
      nombre: yup.string().required("Obligatorio"),
      email: yup.string().email("Email inválido").required("Obligatorio"),
      telefono: yup.string().required("Obligatorio"),
      direccion: yup.string().required("Obligatorio"),
      cuit: yup.string().required("Obligatorio"),
    }),
    items: yup.array().of(
      yup.object().shape({
        descripcion: yup.string().required("Obligatorio"),
        cantidad: yup.number().min(1, "Mínimo 1").required("Obligatorio"),
        precio: yup.number().min(0, "No puede ser negativo").required("Obligatorio"),
        unidad: yup.string().required("Obligatorio"),
        moneda: yup.string().required("Obligatorio"),
        descuento: yup.number().min(0).max(100),
      })
    ).min(1, "Agrega al menos un ítem"),
  });

  // Esquema Yup para venta (completo)
  const schemaVenta = yup.object().shape({
    fecha: yup.string().required("La fecha es obligatoria"),
    clienteId: yup.string().required("Debe seleccionar un cliente"),
    cliente: yup.object().shape({
      nombre: yup.string().required("Obligatorio"),
      email: yup.string().email("Email inválido").required("Obligatorio"),
      telefono: yup.string().required("Obligatorio"),
      direccion: yup.string().required("Obligatorio"),
      cuit: yup.string().required("Obligatorio"),
    }),
    items: yup.array().of(
      yup.object().shape({
        descripcion: yup.string().required("Obligatorio"),
        cantidad: yup.number().min(1, "Mínimo 1").required("Obligatorio"),
        precio: yup.number().min(0, "No puede ser negativo").required("Obligatorio"),
        unidad: yup.string().required("Obligatorio"),
        moneda: yup.string().required("Obligatorio"),
        descuento: yup.number().min(0).max(100),
      })
    ).min(1, "Agrega al menos un ítem"),
    formaPago: yup.string().required("Selecciona la forma de pago"),
    pagoParcial: yup.boolean(),
    montoAbonado: yup.number()
      .transform((value, originalValue) => originalValue === '' ? undefined : value)
      .when("pagoParcial", {
        is: true,
        then: (s) => s.typeError("Debe ingresar un monto").min(1, "Debe ingresar un monto").required("Obligatorio"),
        otherwise: (s) => s.notRequired().nullable(true),
      }),
    prioridad: yup.string().required("Selecciona la prioridad"),
    tipoEnvio: yup.string().required("Selecciona el tipo de envío"),
    fechaEntrega: yup.string().when("tipoEnvio", {
      is: val => val && val !== "retiro_local",
      then: s => s.required("La fecha de entrega es obligatoria"),
      otherwise: s => s.notRequired()
    }),
    rangoHorario: yup.string().when("tipoEnvio", {
      is: val => val && val !== "retiro_local",
      then: s => s.required("El rango horario es obligatorio"),
      otherwise: s => s.notRequired()
    }),
    transportista: yup.string().when("tipoEnvio", {
      is: val => val && val !== "retiro_local",
      then: s => s.required("Selecciona el transportista"),
      otherwise: s => s.notRequired()
    }),
    costoEnvio: yup.number().notRequired(),
    observaciones: yup.string().notRequired(),
  });

  // Elegir el esquema según el tipo
  const schema = tipo === 'presupuesto' ? schemaPresupuesto : schemaVenta;

  const { register, handleSubmit, setValue, formState: { errors }, watch, reset, trigger } = useForm({
    resolver: yupResolver(schema),
    defaultValues: {
      fecha: new Date().toISOString().split('T')[0],
      clienteId: "",
      cliente: { nombre: "", email: "", telefono: "", direccion: "", cuit: "" },
      items: [],
    }
  });

  const items = watch("items");

  // Estado para cliente seleccionado
  const [clienteId, setClienteId] = useState("");
  // Estado para clientes desde Firestore
  const [clientesState, setClientesState] = useState([]);
  const [clientesLoading, setClientesLoading] = useState(true);
  const clienteSeleccionado = clientesState.find(c => c.id === clienteId);
  // Estado para modal de nuevo cliente
  const [openNuevoCliente, setOpenNuevoCliente] = useState(false);
  const [nuevoCliente, setNuevoCliente] = useState({ nombre: "", cuit: "", direccion: "", telefono: "", email: "", localidad: "" });

  // Estado para productos desde Firestore
  const [productosState, setProductosState] = useState([]);
  const [productosPorCategoria, setProductosPorCategoria] = useState({});
  const [categoriasState, setCategoriasState] = useState([]);
  const [productosLoading, setProductosLoading] = useState(true);

  // Cargar productos y agrupar por categoría
  useEffect(() => {
    setProductosLoading(true);
    const fetchProductos = async () => {
      const snap = await getDocs(collection(db, "productos"));
      const productos = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setProductosState(productos);
      // Agrupar por categoría
      const agrupados = {};
      productos.forEach(p => {
        if (!agrupados[p.categoria]) agrupados[p.categoria] = [];
        agrupados[p.categoria].push(p);
      });
      setProductosPorCategoria(agrupados);
      setCategoriasState(Object.keys(agrupados));
      setProductosLoading(false);
    };
    fetchProductos();
  }, []);

  // Estado para selección de categoría y productos
  const [categoriaId, setCategoriaId] = useState("");
  const [productosSeleccionados, setProductosSeleccionados] = useState([]); // [{id, nombre, precio, cantidad, unidad, descuento, ...}
// Estado para búsqueda global de productos
const [busquedaProducto, setBusquedaProducto] = useState("");

// Permitir selección múltiple de productos de distintas categorías
// Al cambiar de categoría, solo cambia la lista de productos mostrados, pero los seleccionados permanecen
// La lista de productos seleccionados se muestra siempre, debajo de la selección de productos

// Manejo de selección de productos
const handleAgregarProducto = (producto) => {
  const real = productosState.find(p => p.id === producto.id);
  if (!real) {
    setSubmitStatus("error");
    setSubmitMessage("Solo puedes agregar productos existentes del catálogo.");
    return;
  }
  if (!productosSeleccionados.some(p => p.id === real.id)) {
    let precio = real.precioUnidad || real.precioUnidadVenta || real.precioUnidadHerraje || real.precioUnidadQuimico || real.precioUnidadHerramienta;
    let alto = Number(real.espesor) || 0;
    let ancho = Number(real.ancho) || 0;
    let largo = Number(real.largo) || 0;
    let precioPorPie = Number(real.precioUnidad) || 0;
    if (real.categoria === 'Maderas') {
      if (alto > 0 && ancho > 0 && largo > 0 && precioPorPie > 0) {
        precio = calcularPrecioCorteMadera({ alto, ancho, largo, precioPorPie });
      } else {
        setSubmitStatus("error");
        setSubmitMessage("El producto de madera no tiene dimensiones válidas en la base de datos.");
        return;
      }
    }
    setProductosSeleccionados([
      ...productosSeleccionados,
      {
        id: real.id,
        nombre: real.nombre,
        precio,
        unidad: real.unidadMedida || real.unidadVenta || real.unidadVentaHerraje || real.unidadVentaQuimico || real.unidadVentaHerramienta,
        stock: real.stock,
        cantidad: 1,
        descuento: 0,
        categoria: real.categoria,
        alto,
        ancho,
        largo,
        precioPorPie
      }
    ]);
  }
};
  const handleQuitarProducto = (id) => {
    setProductosSeleccionados(productosSeleccionados.filter(p => p.id !== id));
  };
  const handleCantidadChange = (id, cantidad) => {
    setProductosSeleccionados(productosSeleccionados.map(p => p.id === id ? { ...p, cantidad: Number(cantidad) } : p));
  };
  const handleDescuentoChange = (id, descuento) => {
    setProductosSeleccionados(productosSeleccionados.map(p => p.id === id ? { ...p, descuento: Number(descuento) } : p));
  };

  // Calcular totales
  const subtotal = productosSeleccionados.reduce((acc, p) => acc + (Number(p.precio) * Number(p.cantidad)), 0);
  const descuentoTotal = productosSeleccionados.reduce((acc, p) => acc + (Number(p.descuento) * Number(p.cantidad)), 0);
  const iva = (subtotal - descuentoTotal) * 0.21;
  const total = subtotal - descuentoTotal + iva;

  // Flatpickr handlers
  const handleDateChange = (field, date) => {
    setValue(field, date[0]);
  };

  // Manejo de selección en Autocomplete
  const handleClienteChange = (val) => {
    if (val === "nuevo") {
      setOpenNuevoCliente(true);
    } else {
      setClienteId(val);
      setValue("clienteId", val); // Sincroniza con React Hook Form
      const clienteObj = clientesState.find(c => c.id === val);
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

  // Guardar nuevo cliente
  const handleGuardarNuevoCliente = async () => {
    const clienteObj = { ...nuevoCliente };
    const docRef = await addDoc(collection(db, "clientes"), clienteObj);
    setClientesState([...clientesState, { ...clienteObj, id: docRef.id }]);
    setClienteId(docRef.id);
    setNuevoCliente({ nombre: "", cuit: "", direccion: "", telefono: "", email: "", localidad: "" });
    setOpenNuevoCliente(false);
  };

  // Sincronizar cliente seleccionado con el objeto cliente del formulario
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

  // Sincronizar productos seleccionados con items del formulario
  React.useEffect(() => {
    setValue("items", productosSeleccionados.map(p => ({
      descripcion: p.nombre,
      cantidad: p.cantidad,
      precio: p.precio,
      unidad: p.unidad,
      moneda: "$",
      descuento: p.descuento || 0,
    })));
  }, [productosSeleccionados, setValue]);

  useEffect(() => {
    const fetchClientes = async () => {
      setClientesLoading(true);
      const snap = await getDocs(collection(db, "clientes"));
      setClientesState(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setClientesLoading(false);
    };
    fetchClientes();
  }, []);

  // Agrega un estado para controlar si el usuario intentó enviar el formulario
  const [hasSubmitted, setHasSubmitted] = useState(false);

  // Función de envío del formulario con validación profesional
  const handleFormSubmit = async (data) => {
    setHasSubmitted(true);
    console.log("[DEBUG] handleFormSubmit - data recibida:", data);
    // Resetear estados previos
    setSubmitStatus(null);
    setSubmitMessage("");
    
    // Validaciones adicionales
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

    // Validar que todos los productos tengan cantidad > 0
    const productosInvalidos = productosSeleccionados.filter(p => p.cantidad <= 0);
    if (productosInvalidos.length > 0) {
      setSubmitStatus("error");
      setSubmitMessage("Todos los productos deben tener una cantidad mayor a 0");
      return;
    }

    setIsSubmitting(true);
    
    try {
      // Preparar datos del formulario
      const productosLimpios = productosSeleccionados.map(p => {
        const obj = {
          id: p.id,
          nombre: p.nombre,
          cantidad: p.cantidad,
          precio: p.precio,
          unidad: p.unidad,
          descuento: p.descuento || 0,
          categoria: p.categoria
        };
        if (p.categoria === 'Maderas') {
          obj.alto = Number(p.alto) || 0;
          obj.ancho = Number(p.ancho) || 0;
          obj.largo = Number(p.largo) || 0;
          obj.precioPorPie = Number(p.precioPorPie) || 0;
        }
        return obj;
      });

      const formData = tipo === 'presupuesto'
        ? {
            fecha: data.fecha,
            cliente: data.cliente,
            items: productosLimpios,
            productos: productosLimpios,
            subtotal: subtotal,
            descuentoTotal: descuentoTotal,
            iva: iva,
            total: total,
            fechaCreacion: new Date().toISOString(),
            tipo: tipo,
            numeroPedido: `PRESU-${Date.now()}`,
          }
        : {
            ...data,
            clienteId: clienteId || data.clienteId,
            productos: productosLimpios,
            subtotal: subtotal,
            descuentoTotal: descuentoTotal,
            iva: iva,
            total: total,
            fechaCreacion: new Date().toISOString(),
            tipo: tipo,
            numeroPedido: `PED-${Date.now()}`,
          };

      console.log("Datos preparados para envío:", formData); // Debug

      // Llamar a la función onSubmit del componente padre
      await onSubmit(formData);
      
      // Éxito
      setSubmitStatus("success");
      setSubmitMessage(`${tipo === 'presupuesto' ? 'Presupuesto' : 'Venta'} guardado exitosamente`);
      
      // Cerrar modal después de un breve delay para mostrar el mensaje de éxito
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

  // Función para manejar el cierre del modal
  const handleClose = () => {
    if (!isSubmitting) {
      onClose();
    }
  };

  // 1. Estado para N° Pedido automático
  const [numeroPedido, setNumeroPedido] = useState(() => `PED-${Date.now()}`);
  // 2. Estado para tipo de envío y si es con factura
  const [tipoEnvioSeleccionado, setTipoEnvioSeleccionado] = useState("");
  const [esConFactura, setEsConFactura] = useState(false);
  // 3. Arrays para selects
  const transportistas = ["camion", "camioneta 1", "camioneta 2"];
  const vendedores = ["coco", "damian", "lauti", "jose"];
  const prioridades = ["alta", "media", "baja"];

  // Función reutilizable para calcular el precio de un corte de madera
  function calcularPrecioCorteMadera({ alto, ancho, largo, precioPorPie, factor = 0.2734 }) {
    // Validación básica
    if ([alto, ancho, largo, precioPorPie].some(v => typeof v !== 'number' || v <= 0)) {
      return 0;
    }
    const precio = factor * alto * ancho * largo * precioPorPie;
    return Math.round(precio * 100) / 100;
  }

  // Elimino estados y lógica de maderaInputs y precioCorteMadera

  // 1. Buscador dinámico de clientes
  const [busquedaCliente, setBusquedaCliente] = useState("");
  const [dropdownClientesOpen, setDropdownClientesOpen] = useState(false);
  const clientesFiltrados = clientesState.filter(c =>
    c.nombre.toLowerCase().includes(busquedaCliente.toLowerCase()) ||
    c.cuit.toLowerCase().includes(busquedaCliente.toLowerCase()) ||
    (c.localidad || "").toLowerCase().includes(busquedaCliente.toLowerCase())
  );
  // 2. Campo localidad en nuevo cliente
  // 3. Select de clientes con buscador dinámico
  // 4. Quitar inputs editables de dimensiones y precio en productos Maderas en la tabla de seleccionados
  // 5. Descuento como porcentaje
  // 6. ID generado tipo PRESU-XXXX o VENTA-XXXX
  const generarId = (tipo) => {
    const num = Math.floor(1000 + Math.random() * 9000);
    return tipo === 'presupuesto' ? `PRESU-${num}` : `VENTA-${num}`;
  };
  // 7. Inputs de cantidad más grandes
  // 8. Stock dinámico y aviso
  // 9. Quitar condición de pago
  // 10. Pago parcial
  // 11. Quitar todo lo de factura
  // 12. Envío: check para usar dirección del cliente o manual
  const [usarDireccionCliente, setUsarDireccionCliente] = useState(true);
  // 13. En sección ENVÍO: fecha, rango horario, observaciones y prioridad juntos
  const [fechaEntrega, setFechaEntrega] = useState("");
  const [rangoHorario, setRangoHorario] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [prioridad, setPrioridad] = useState("");

  // Elimino el estado y lógica de modalMadera y su handleAgregarMaderaPersonalizada

  // Limpiar montoAbonado si se desmarca pagoParcial
  React.useEffect(() => {
    if (!watch("pagoParcial")) {
      setValue("montoAbonado", "");
    }
  }, [watch("pagoParcial")]);

  // Limpiar costoEnvio si tipoEnvio es 'retiro_local'
  React.useEffect(() => {
    if (watch("tipoEnvio") === "retiro_local") {
      setValue("costoEnvio", "");
    }
  }, [watch("tipoEnvio")]);

  return (
    <>
      <DialogHeader className="mb-2">
        <DialogTitle>{tipo === 'presupuesto' ? 'Nuevo Presupuesto' : 'Nueva Venta'}</DialogTitle>
        <DialogDescription>
          Complete todos los campos requeridos para crear un nuevo {tipo === 'presupuesto' ? 'presupuesto' : 'venta'}.
        </DialogDescription>
      </DialogHeader>
      
      {/* Indicador de estado de envío */}
      {submitStatus && (
        <div className={`mb-4 p-4 rounded-lg flex items-center gap-3 ${
          submitStatus === 'success' 
            ? 'bg-green-50 border border-green-200 text-green-800' 
            : 'bg-red-50 border border-red-200 text-red-800'
        }`}>
          {submitStatus === 'success' ? (
            <CheckCircle className="w-5 h-5 text-green-600" />
          ) : (
            <AlertCircle className="w-5 h-5 text-red-600" />
          )}
          <span className="font-medium">{submitMessage}</span>
        </div>
      )}

      {/* {Object.keys(errors).length > 0 && (
        <div className="mb-2 p-2 rounded bg-red-100 text-red-800 text-sm">
          Hay errores en el formulario. Revisa los campos obligatorios.
        </div>
      )} */}

      <form onSubmit={handleSubmit(handleFormSubmit)} className="flex flex-col h-full">
        {/* Contenido scrolleable */}
        <div className="flex-1 overflow-y-auto px-1 pb-4 max-h-[calc(85vh-200px)]">
          <div className="flex flex-col gap-6">
            {/* Campo fecha automático, oculto o deshabilitado */}
            <input type="hidden" {...register("fecha")} value={new Date().toISOString().split('T')[0]} readOnly />

        {/* Selección de cliente */}
        <section className="bg-white rounded-lg p-4 border border-default-200 shadow-sm flex flex-col gap-2 mb-2">
          <label className="font-semibold">Cliente</label>
          <div className="relative w-full">
            <div className="border rounded px-2 py-2 w-full flex items-center cursor-pointer bg-white" onClick={() => setDropdownClientesOpen(true)}>
              <span className="flex-1 text-gray-700">{clienteSeleccionado ? `${clienteSeleccionado.nombre} - ${clienteSeleccionado.cuit} - ${clienteSeleccionado.localidad}` : "Seleccionar cliente..."}</span>
              <Button type="button" variant="ghost" size="sm" onClick={e => { e.stopPropagation(); setOpenNuevoCliente(true); }} disabled={isSubmitting}>+ Nuevo</Button>
            </div>
            {/* Dropdown de clientes con input de búsqueda */}
            {dropdownClientesOpen && (
              <div className="absolute z-50 bg-white border rounded shadow-lg w-full mt-1 max-h-72 overflow-y-auto">
                <div className="p-2">
                  <Input
                    type="text"
                    placeholder="Buscar cliente..."
                    value={busquedaCliente}
                    onChange={e => setBusquedaCliente(e.target.value)}
                    className="w-full mb-2"
                    autoFocus
                    disabled={clientesLoading || isSubmitting}
                  />
                  <div className="divide-y divide-gray-100">
                    {clientesFiltrados.length === 0 && (
                      <div className="p-2 text-gray-400">No hay clientes</div>
                    )}
                    {clientesFiltrados.map(c => (
                      <div key={c.id} className="p-2 hover:bg-primary/10 cursor-pointer rounded" onClick={() => { handleClienteChange(c.id); setDropdownClientesOpen(false); }}>
                        {c.nombre} - {c.cuit} - {c.localidad}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
          {errors.clienteId && <span className="text-red-500 text-xs">{errors.clienteId.message}</span>}
          <div className="space-y-2 bg-white rounded-lg p-4 border border-default-200 shadow-sm">
            <div className="text-base font-semibold text-default-800 pb-1">Datos del cliente</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Input value={clienteSeleccionado?.nombre || ""} placeholder="Nombre del cliente" readOnly className="w-full" />
                {errors.cliente?.nombre && <span className="text-red-500 text-xs">{errors.cliente?.nombre.message}</span>}
              </div>
              <div>
                <Input value={clienteSeleccionado?.cuit || ""} placeholder="CUIT" readOnly className="w-full" />
                {errors.cliente?.cuit && <span className="text-red-500 text-xs">{errors.cliente?.cuit.message}</span>}
              </div>
              <div>
                <Input value={clienteSeleccionado?.direccion || ""} placeholder="Dirección" readOnly className="w-full" />
                {errors.cliente?.direccion && <span className="text-red-500 text-xs">{errors.cliente?.direccion.message}</span>}
              </div>
              <div>
                <Input value={clienteSeleccionado?.telefono || ""} placeholder="Teléfono" readOnly className="w-full" />
                {errors.cliente?.telefono && <span className="text-red-500 text-xs">{errors.cliente?.telefono.message}</span>}
              </div>
              <div>
                <Input value={clienteSeleccionado?.email || ""} placeholder="Email" readOnly className="w-full" />
                {errors.cliente?.email && <span className="text-red-500 text-xs">{errors.cliente?.email.message}</span>}
              </div>
            </div>
          </div>
        </section>

        {/* Selección de productos */}
        <section className="bg-white rounded-lg p-4 border border-default-200 shadow-sm flex flex-col gap-2 mb-2">
          <label className="font-semibold">Productos</label>
          {/* Chips de categorías dinámicos */}
          <div className="flex gap-3 overflow-x-auto pb-2 mb-2">
            {categoriasState.length === 0 && (
              <span className="text-gray-400">No hay categorías con productos</span>
            )}
            {categoriasState.map(cat => (
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
          {/* Lista de productos de la categoría seleccionada */}
          {categoriaId && (
            <div className="w-full mb-2 animate-fade-in">
              {/* Buscador global de productos */}
              <div className="mb-2 flex justify-end">
                <Input
                  type="text"
                  placeholder="Buscar producto..."
                  value={busquedaProducto}
                  onChange={e => setBusquedaProducto(e.target.value)}
                  className="w-full md:w-80"
                  disabled={isSubmitting || productosLoading}
                />
              </div>
              {categoriaId === 'Maderas' && (
                <div className="w-full mb-2 animate-fade-in">
                  {/* Lista de productos de maderas */}
                  <div className="divide-y divide-gray-200 bg-white rounded-b">
                    {productosPorCategoria[categoriaId]?.filter(prod =>
                      prod.nombre.toLowerCase().includes(busquedaProducto.toLowerCase()) ||
                      (prod.unidadMedida || '').toLowerCase().includes(busquedaProducto.toLowerCase())
                    ).map(prod => (
                      <div key={prod.id} className="grid grid-cols-12 gap-2 items-center px-4 py-2">
                        <div className="col-span-5 font-medium">{prod.nombre}</div>
                        <div className="col-span-2 text-xs text-default-500">{prod.unidadMedida}</div>
                        <div className="col-span-2 font-bold text-primary">${prod.precioUnidad || prod.precioPorPie || 0}</div>
                        <div className="col-span-2 font-mono text-xs">
                          Stock: {prod.stock}
                          {prod.stock <= 0 && <span className="text-red-600 font-semibold ml-2">Sin stock</span>}
                        </div>
                        <div className="col-span-1 flex justify-end">
                          <Button
                            type="button"
                            size="sm"
                            variant={productosSeleccionados.some(p => p.id === prod.id) ? "soft" : "default"}
                            color="primary"
                            className={productosSeleccionados.some(p => p.id === prod.id) ? "bg-yellow-200 text-yellow-700 cursor-default" : ""}
                            onClick={() => {
                              if (productosSeleccionados.some(p => p.id === prod.id)) return;
                              if (prod.stock <= 0) return;
                              // Tomar dimensiones y precioPorPie de Firebase
                              const alto = Number(prod.espesor) || 0;
                              const ancho = Number(prod.ancho) || 0;
                              const largo = Number(prod.largo) || 0;
                              const precioPorPie = Number(prod.precioUnidad) || 0;
                              if (alto > 0 && ancho > 0 && largo > 0 && precioPorPie > 0) {
                                const precio = calcularPrecioCorteMadera({ alto, ancho, largo, precioPorPie });
                                handleAgregarProducto({
                                  id: prod.id,
                                  nombre: prod.nombre,
                                  precio,
                                  unidad: prod.unidadMedida,
                                  stock: prod.stock,
                                  alto,
                                  ancho,
                                  largo,
                                  precioPorPie
                                });
                              } else {
                                setSubmitStatus("error");
                                setSubmitMessage("El producto de madera no tiene dimensiones válidas en la base de datos.");
                              }
                            }}
                            disabled={productosSeleccionados.some(p => p.id === prod.id) || isSubmitting || prod.stock <= 0}
                          >
                            {productosSeleccionados.some(p => p.id === prod.id) ? "Agregado" : (prod.stock <= 0 ? "Sin stock" : "Agregar")}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {categoriaId !== 'Maderas' && (
                <div className="bg-gray-100 rounded-b">
                  <div className="divide-y divide-gray-200">
                    {productosPorCategoria[categoriaId]?.filter(prod =>
                      prod.nombre.toLowerCase().includes(busquedaProducto.toLowerCase()) ||
                      (prod.unidadMedida || prod.unidadVenta || prod.unidadVentaHerraje || prod.unidadVentaQuimico || prod.unidadVentaHerramienta || "").toLowerCase().includes(busquedaProducto.toLowerCase())
                    ).map(prod => (
                      <div key={prod.id} className="grid grid-cols-12 gap-2 items-center px-4 py-2">
                        <div className="col-span-5 font-medium">{prod.nombre}</div>
                        <div className="col-span-2 text-xs text-default-500">{prod.unidadMedida || prod.unidadVenta || prod.unidadVentaHerraje || prod.unidadVentaQuimico || prod.unidadVentaHerramienta}</div>
                        <div className="col-span-2 font-bold text-primary">${prod.precioUnidad || prod.precioUnidadVenta || prod.precioUnidadHerraje || prod.precioUnidadQuimico || prod.precioUnidadHerramienta}</div>
                        <div className="col-span-2 font-mono text-xs">{prod.stock}</div>
                        <div className="col-span-1 flex justify-end">
                          <Button
                            type="button"
                            size="sm"
                            variant={productosSeleccionados.some(p => p.id === prod.id) ? "soft" : "default"}
                            color="primary"
                            className={productosSeleccionados.some(p => p.id === prod.id) ? "bg-yellow-200 text-yellow-700 cursor-default" : ""}
                            onClick={() => {
                              if (tipo === 'venta' && prod.stock <= 0) return;
                              handleAgregarProducto({
                                id: prod.id,
                                nombre: prod.nombre,
                                precio: prod.precioUnidad || prod.precioUnidadVenta || prod.precioUnidadHerraje || prod.precioUnidadQuimico || prod.precioUnidadHerramienta,
                                unidad: prod.unidadMedida || prod.unidadVenta || prod.unidadVentaHerraje || prod.unidadVentaQuimico || prod.unidadVentaHerramienta,
                                stock: prod.stock
                              });
                            }}
                            disabled={productosSeleccionados.some(p => p.id === prod.id) || isSubmitting || (tipo === 'venta' && prod.stock <= 0)}
                          >
                            {productosSeleccionados.some(p => p.id === prod.id) ? "Agregado" : (tipo === 'venta' && prod.stock <= 0 ? "Sin stock" : "Agregar")}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          {/* Lista de productos seleccionados */}
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
                    <tr key={p.id} className="border-b hover:bg-primary/5 transition-all">
                      <td className="p-2 text-xs font-medium text-gray-600">{p.categoria}</td>
                      <td className="p-2">
                        <div className="font-semibold text-default-900">{p.nombre}</div>
                        {p.categoria === 'Maderas' && (
                          <div className="flex flex-wrap gap-2 mt-1 text-xs items-center">
                            <span className="font-medium text-gray-500">Dimensiones:</span>
                            <span>Alto: <span className="font-bold">{p.alto}</span> cm</span>
                            <span>Ancho: <span className="font-bold">{p.ancho}</span> cm</span>
                            <span>Largo: <span className="font-bold">{p.largo}</span> cm</span>
                            <span>$/pie: <span className="font-bold">{p.precioPorPie}</span></span>
                            <span className="ml-2 text-primary font-semibold">Precio calculado: ${p.precio}</span>
                          </div>
                        )}
                      </td>
                      <td className="text-center">
                        <Input type="number" min={1} value={p.cantidad} onChange={e => handleCantidadChange(p.id, e.target.value)} className="w-28 mx-auto text-center text-lg font-bold" disabled={isSubmitting} />
                      </td>
                      <td className="text-center">${p.precio}</td>
                      <td className="text-center">
                        <Input type="number" min={0} max={100} value={p.descuento} onChange={e => handleDescuentoChange(p.id, e.target.value)} className="w-20 mx-auto text-center" disabled={isSubmitting} suffix="%" />
                      </td>
                      <td className="text-center font-semibold text-primary">
                        ${((Number(p.precio) * Number(p.cantidad)) * (1 - (Number(p.descuento) / 100))).toFixed(2)}
                      </td>
                      <td className="text-center">
                        <Button type="button" size="icon" variant="ghost" onClick={() => handleQuitarProducto(p.id)} disabled={isSubmitting} title="Quitar producto">
                          <span className="text-lg font-bold text-red-500">×</span>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
              {hasSubmitted && errors.items && (
                <span className="text-red-500 text-xs">{errors.items.message}</span>
              )}
        </section>

        {/* Datos adicionales según tipo */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
             
              {tipo === 'venta' && (
                <>
                  {/* Condiciones de pago y entrega */}
          <div className="space-y-2 bg-white rounded-lg p-4 border border-default-200 shadow-sm">
                    <div className="text-base font-semibold text-default-800 pb-1">Condiciones de pago y entrega</div>
                    <select {...register("formaPago")} className="border rounded px-2 py-2 w-full" disabled={isSubmitting}>
                      <option value="">Forma de pago...</option>
                      <option value="efectivo">Efectivo</option>
                      <option value="transferencia">Transferencia</option>
                      <option value="tarjeta">Tarjeta</option>
                      <option value="cheque">Cheque</option>
                      <option value="otro">Otro</option>
                    </select>
                    <div className="flex items-center gap-2 mt-2">
                      <input type="checkbox" id="pagoParcial" {...register("pagoParcial")} />
                      <label htmlFor="pagoParcial" className="text-sm">¿Pago parcial?</label>
                    </div>
                    {watch("pagoParcial") && (
                      <>
                        <Input type="number" min={0} placeholder="Monto abonado" {...register("montoAbonado")} className="w-full" disabled={isSubmitting} />
                        <div className="text-sm text-gray-600">Resta: ${(total - (watch('montoAbonado') || 0)).toFixed(2)}</div>
                      </>
                    )}
                    <Textarea {...register("observaciones")} placeholder="Observaciones adicionales" className="w-full" disabled={isSubmitting} />
                  </div>

                  {/* Información de envío */}
                  <div className="space-y-2 bg-white rounded-lg p-4 border border-default-200 shadow-sm">
                    <div className="text-base font-semibold text-default-800 pb-1">Información de envío</div>
                    <select {...register("tipoEnvio")} value={tipoEnvioSeleccionado} onChange={e => { setTipoEnvioSeleccionado(e.target.value); setValue('tipoEnvio', e.target.value); }} className="border rounded px-2 py-2 w-full" disabled={isSubmitting}>
                      <option value="">Tipo de envío...</option>
                      <option value="retiro_local">Retiro en local</option>
                      <option value="envio_domicilio">Envío a domicilio</option>
                      <option value="envio_obra">Envío a obra</option>
                      <option value="transporte_propio">Transporte propio del cliente</option>
                    </select>
                    {tipoEnvioSeleccionado !== "retiro_local" && (
                      <>
                        <div className="flex items-center gap-2 mb-2">
                          <input type="checkbox" checked={usarDireccionCliente} onChange={e => setUsarDireccionCliente(e.target.checked)} id="usarDireccionCliente" />
                          <label htmlFor="usarDireccionCliente" className="text-sm">Usar dirección del cliente</label>
                        </div>
                        {!usarDireccionCliente && (
                          <>
                            <Input {...register("direccionEnvio")} placeholder="Dirección de envío" className="w-full" disabled={isSubmitting} />
                            <Input {...register("localidadEnvio")} placeholder="Localidad/Ciudad" className="w-full" disabled={isSubmitting} />
                            <Input {...register("codigoPostal")} placeholder="Código postal" className="w-full" disabled={isSubmitting} />
                          </>
                        )}
                        {usarDireccionCliente && clienteSeleccionado && (
                          <>
                            <Input value={clienteSeleccionado.direccion || ""} readOnly className="w-full" />
                            <Input value={clienteSeleccionado.localidad || ""} readOnly className="w-full" />
                            <Input value={clienteSeleccionado.codigoPostal || ""} readOnly className="w-full" />
                          </>
                        )}
                        <select {...register("transportista")} className="border rounded px-2 py-2 w-full" disabled={isSubmitting}>
                          <option value="">Transportista...</option>
                          {transportistas.map(t => <option key={t}>{t}</option>)}
                        </select>
                        {/* Solo mostrar costoEnvio si no es retiro_local */}
                        <Input {...register("costoEnvio")} placeholder="Costo de envío" type="number" className="w-full" disabled={isSubmitting} />
                        <Input {...register("fechaEntrega")} placeholder="Fecha de entrega" type="date" className="w-full" disabled={isSubmitting} />
                        <Input {...register("rangoHorario")} placeholder="Rango horario (ej: 8-12, 14-18)" className="w-full" disabled={isSubmitting} />
                      </>
                    )}
                  </div>

                  {/* Información adicional */}
                  <div className="space-y-2 bg-white rounded-lg p-4 border border-default-200 shadow-sm">
                    <div className="text-base font-semibold text-default-800 pb-1">Información adicional</div>
                    <select {...register("vendedor")} className="border rounded px-2 py-2 w-full" disabled={isSubmitting}>
                      <option value="">Vendedor responsable...</option>
                      {vendedores.map(v => <option key={v}>{v}</option>)}
                    </select>
                    <select {...register("prioridad")} className="border rounded px-2 py-2 w-full" disabled={isSubmitting}>
                      <option value="">Prioridad...</option>
                      {prioridades.map(p => <option key={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                    </select>
                    <Textarea {...register("observaciones")} placeholder="Observaciones adicionales" className="w-full" disabled={isSubmitting} />
                  </div>
                </>
              )}
            </section>
          </div>
        </div>

        {/* Sección fija de totales y footer */}
        <div className="bg-white p-4 space-y-4 flex-shrink-0">
        {/* Resumen de totales */}
          <div className="flex flex-col items-end gap-2">
          <div className="bg-primary/5 border border-primary/20 rounded-lg px-6 py-3 flex flex-col md:flex-row gap-4 md:gap-8 text-base shadow-sm w-full md:w-auto">
            <div>Subtotal: <span className="font-semibold">${subtotal.toFixed(2)}</span></div>
            <div>Descuento: <span className="font-semibold">${descuentoTotal.toFixed(2)}</span></div>
            <div>IVA (21%): <span className="font-semibold">${iva.toFixed(2)}</span></div>
            <div>Total: <span className="font-bold text-primary">${total.toFixed(2)}</span></div>
          </div>
          </div>

          {/* Footer */}
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
                `Guardar ${tipo === 'presupuesto' ? 'Presupuesto' : 'Venta'}`
              )}
            </Button>
        </DialogFooter>
        </div>
      </form>

      {/* Modal para nuevo cliente */}
      <Dialog open={openNuevoCliente} onOpenChange={setOpenNuevoCliente}>
        <DialogContent className="w-[95vw] max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Agregar Cliente</DialogTitle>
            <DialogDescription>
              Complete los datos del nuevo cliente para agregarlo al sistema.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            <Input placeholder="Nombre" className="w-full" value={nuevoCliente.nombre} onChange={e => setNuevoCliente({ ...nuevoCliente, nombre: e.target.value })} />
            <Input placeholder="CUIT" className="w-full" value={nuevoCliente.cuit} onChange={e => setNuevoCliente({ ...nuevoCliente, cuit: e.target.value })} />
            <Input placeholder="Dirección" className="w-full" value={nuevoCliente.direccion} onChange={e => setNuevoCliente({ ...nuevoCliente, direccion: e.target.value })} />
            <Input placeholder="Teléfono" className="w-full" value={nuevoCliente.telefono} onChange={e => setNuevoCliente({ ...nuevoCliente, telefono: e.target.value })} />
            <Input placeholder="Email" className="w-full" value={nuevoCliente.email} onChange={e => setNuevoCliente({ ...nuevoCliente, email: e.target.value })} />
            <Input placeholder="Localidad" className="w-full" value={nuevoCliente.localidad || ""} onChange={e => setNuevoCliente({ ...nuevoCliente, localidad: e.target.value })} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenNuevoCliente(false)}>Cancelar</Button>
            <Button variant="default" onClick={handleGuardarNuevoCliente}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Elimino el estado y lógica de modalMadera y su handleAgregarMaderaPersonalizada */}
    </>
  );
}

// Nuevo componente para selección y edición de productos
export function SelectorProductosPresupuesto({ productosSeleccionados, setProductosSeleccionados, productosState, categoriasState, productosPorCategoria, isSubmitting, modoSoloProductos }) {
  // Estado para selección de categoría y búsqueda
  const [categoriaId, setCategoriaId] = useState("");
  const [busquedaProducto, setBusquedaProducto] = useState("");

  // Función para agregar producto (idéntica a la lógica original)
  const handleAgregarProducto = (producto) => {
    const real = productosState.find(p => p.id === producto.id);
    if (!real) return;
    if (!productosSeleccionados.some(p => p.id === real.id)) {
      let precio = real.precioUnidad || real.precioUnidadVenta || real.precioUnidadHerraje || real.precioUnidadQuimico || real.precioUnidadHerramienta;
      let alto = Number(real.espesor) || 0;
      let ancho = Number(real.ancho) || 0;
      let largo = Number(real.largo) || 0;
      let precioPorPie = Number(real.precioUnidad) || 0;
      if (real.categoria === 'Maderas') {
        if (alto > 0 && ancho > 0 && largo > 0 && precioPorPie > 0) {
          precio = calcularPrecioCorteMadera({ alto, ancho, largo, precioPorPie });
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
          unidad: real.unidadMedida || real.unidadVenta || real.unidadVentaHerraje || real.unidadVentaQuimico || real.unidadVentaHerramienta,
          stock: real.stock,
          cantidad: 1,
          descuento: 0,
          categoria: real.categoria,
          alto,
          ancho,
          largo,
          precioPorPie
        }
      ]);
    }
  };
  const handleQuitarProducto = (id) => {
    setProductosSeleccionados(productosSeleccionados.filter(p => p.id !== id));
  };
  const handleCantidadChange = (id, cantidad) => {
    setProductosSeleccionados(productosSeleccionados.map(p => p.id === id ? { ...p, cantidad: Number(cantidad) } : p));
  };
  const handleDescuentoChange = (id, descuento) => {
    setProductosSeleccionados(productosSeleccionados.map(p => p.id === id ? { ...p, descuento: Number(descuento) } : p));
  };

  // Función de cálculo de precio para maderas (idéntica a la original)
  function calcularPrecioCorteMadera({ alto, ancho, largo, precioPorPie, factor = 0.2734 }) {
    if ([alto, ancho, largo, precioPorPie].some(v => typeof v !== 'number' || v <= 0)) {
      return 0;
    }
    const precio = factor * alto * ancho * largo * precioPorPie;
    return Math.round(precio * 100) / 100;
  }

  return (
    <section className="bg-white rounded-lg p-4 border border-default-200 shadow-sm flex flex-col gap-2 mb-2">
      <label className="font-semibold">Productos</label>
      {/* Chips de categorías dinámicos */}
      <div className="flex gap-3 overflow-x-auto pb-2 mb-2">
        {categoriasState.length === 0 && (
          <span className="text-gray-400">No hay categorías con productos</span>
        )}
        {categoriasState.map(cat => (
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
      {/* Lista de productos de la categoría seleccionada */}
      {categoriaId && (
        <div className="w-full mb-2 animate-fade-in">
          {/* Buscador global de productos */}
          <div className="mb-2 flex justify-end">
            <Input
              type="text"
              placeholder="Buscar producto..."
              value={busquedaProducto}
              onChange={e => setBusquedaProducto(e.target.value)}
              className="w-full md:w-80"
              disabled={isSubmitting}
            />
          </div>
          {categoriaId === 'Maderas' && (
            <div className="w-full mb-2 animate-fade-in">
              <div className="divide-y divide-gray-200 bg-white rounded-b">
                {productosPorCategoria[categoriaId]?.filter(prod =>
                  prod.nombre.toLowerCase().includes(busquedaProducto.toLowerCase()) ||
                  (prod.unidadMedida || '').toLowerCase().includes(busquedaProducto.toLowerCase())
                ).map(prod => (
                  <div key={prod.id} className="grid grid-cols-12 gap-2 items-center px-4 py-2">
                    <div className="col-span-5 font-medium">{prod.nombre}</div>
                    <div className="col-span-2 text-xs text-default-500">{prod.unidadMedida}</div>
                    <div className="col-span-2 font-bold text-primary">${prod.precioUnidad || prod.precioPorPie || 0}</div>
                    <div className="col-span-2 font-mono text-xs">
                      Stock: {prod.stock}
                      {prod.stock <= 0 && <span className="text-red-600 font-semibold ml-2">Sin stock</span>}
                    </div>
                    <div className="col-span-1 flex justify-end">
                      <Button
                        type="button"
                        size="sm"
                        variant={productosSeleccionados.some(p => p.id === prod.id) ? "soft" : "default"}
                        color="primary"
                        className={productosSeleccionados.some(p => p.id === prod.id) ? "bg-yellow-200 text-yellow-700 cursor-default" : ""}
                        onClick={() => {
                          if (productosSeleccionados.some(p => p.id === prod.id)) return;
                          if (prod.stock <= 0) return;
                          // Tomar dimensiones y precioPorPie de Firebase
                          const alto = Number(prod.espesor) || 0;
                          const ancho = Number(prod.ancho) || 0;
                          const largo = Number(prod.largo) || 0;
                          const precioPorPie = Number(prod.precioUnidad) || 0;
                          if (alto > 0 && ancho > 0 && largo > 0 && precioPorPie > 0) {
                            const precio = calcularPrecioCorteMadera({ alto, ancho, largo, precioPorPie });
                            handleAgregarProducto({
                              id: prod.id,
                              nombre: prod.nombre,
                              precio,
                              unidad: prod.unidadMedida,
                              stock: prod.stock,
                              alto,
                              ancho,
                              largo,
                              precioPorPie
                            });
                          }
                        }}
                        disabled={productosSeleccionados.some(p => p.id === prod.id) || isSubmitting || prod.stock <= 0}
                      >
                        {productosSeleccionados.some(p => p.id === prod.id) ? "Agregado" : (prod.stock <= 0 ? "Sin stock" : "Agregar")}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {categoriaId !== 'Maderas' && (
            <div className="bg-gray-100 rounded-b">
              <div className="divide-y divide-gray-200">
                {productosPorCategoria[categoriaId]?.filter(prod =>
                  prod.nombre.toLowerCase().includes(busquedaProducto.toLowerCase()) ||
                  (prod.unidadMedida || prod.unidadVenta || prod.unidadVentaHerraje || prod.unidadVentaQuimico || prod.unidadVentaHerramienta || "").toLowerCase().includes(busquedaProducto.toLowerCase())
                ).map(prod => (
                  <div key={prod.id} className="grid grid-cols-12 gap-2 items-center px-4 py-2">
                    <div className="col-span-5 font-medium">{prod.nombre}</div>
                    <div className="col-span-2 text-xs text-default-500">{prod.unidadMedida || prod.unidadVenta || prod.unidadVentaHerraje || prod.unidadVentaQuimico || prod.unidadVentaHerramienta}</div>
                    <div className="col-span-2 font-bold text-primary">${prod.precioUnidad || prod.precioUnidadVenta || prod.precioUnidadHerraje || prod.precioUnidadQuimico || prod.precioUnidadHerramienta}</div>
                    <div className="col-span-2 font-mono text-xs">{prod.stock}</div>
                    <div className="col-span-1 flex justify-end">
                      <Button
                        type="button"
                        size="sm"
                        variant={productosSeleccionados.some(p => p.id === prod.id) ? "soft" : "default"}
                        color="primary"
                        className={productosSeleccionados.some(p => p.id === prod.id) ? "bg-yellow-200 text-yellow-700 cursor-default" : ""}
                        onClick={() => {
                          handleAgregarProducto({
                            id: prod.id,
                            nombre: prod.nombre,
                            precio: prod.precioUnidad || prod.precioUnidadVenta || prod.precioUnidadHerraje || prod.precioUnidadQuimico || prod.precioUnidadHerramienta,
                            unidad: prod.unidadMedida || prod.unidadVenta || prod.unidadVentaHerraje || prod.unidadVentaQuimico || prod.unidadVentaHerramienta,
                            stock: prod.stock
                          });
                        }}
                        disabled={productosSeleccionados.some(p => p.id === prod.id) || isSubmitting}
                      >
                        {productosSeleccionados.some(p => p.id === prod.id) ? "Agregado" : "Agregar"}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      {/* Lista de productos seleccionados */}
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
                <tr key={p.id} className="border-b hover:bg-primary/5 transition-all">
                  <td className="p-2 text-xs font-medium text-gray-600">{p.categoria}</td>
                  <td className="p-2">
                    <div className="font-semibold text-default-900">{p.nombre}</div>
                    {p.categoria === 'Maderas' && (
                      <div className="flex flex-wrap gap-2 mt-1 text-xs items-center">
                        <span className="font-medium text-gray-500">Dimensiones:</span>
                        <span>Alto: <span className="font-bold">{p.alto}</span> cm</span>
                        <span>Ancho: <span className="font-bold">{p.ancho}</span> cm</span>
                        <span>Largo: <span className="font-bold">{p.largo}</span> cm</span>
                        <span>$/pie: <span className="font-bold">{p.precioPorPie}</span></span>
                        <span className="ml-2 text-primary font-semibold">Precio calculado: ${p.precio}</span>
                      </div>
                    )}
                  </td>
                  <td className="text-center">
                    <Input type="number" min={1} value={p.cantidad} onChange={e => handleCantidadChange(p.id, e.target.value)} className="w-28 mx-auto text-center text-lg font-bold" disabled={isSubmitting} />
                  </td>
                  <td className="text-center">${p.precio}</td>
                  <td className="text-center">
                    <Input type="number" min={0} max={100} value={p.descuento} onChange={e => handleDescuentoChange(p.id, e.target.value)} className="w-20 mx-auto text-center" disabled={isSubmitting} suffix="%" />
                  </td>
                  <td className="text-center font-semibold text-primary">
                    ${((Number(p.precio) * Number(p.cantidad)) * (1 - (Number(p.descuento) / 100))).toFixed(2)}
                  </td>
                  <td className="text-center">
                    <Button type="button" size="icon" variant="ghost" onClick={() => handleQuitarProducto(p.id)} disabled={isSubmitting} title="Quitar producto">
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
  const [open, setOpen] = useState(null); // null | 'presupuesto' | 'venta'
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
        
        // Cargar ventas
        const ventasSnap = await getDocs(collection(db, "ventas"));
        setVentasData(ventasSnap.docs.map(doc => ({ ...doc.data(), id: doc.id })));
        
        // Cargar presupuestos
        const presupuestosSnap = await getDocs(collection(db, "presupuestos"));
        setPresupuestosData(presupuestosSnap.docs.map(doc => ({ ...doc.data(), id: doc.id })));
        
      } catch (error) {
        console.error("Error al cargar datos:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const handleClose = () => setOpen(null);
  
  // 2. En el submit de venta, validar existencia antes de descontar stock
  const handleSubmit = async (formData) => {
    console.log("[SUBMIT] Recibiendo datos en VentasPage:", formData); // Debug
    setLoading(true);
    try {
      let docRef;
      if (open === "venta") {
        // Limpiar datos: eliminar undefined y campos vacíos
        const cleanFormData = JSON.parse(JSON.stringify(formData, (key, value) => {
          if (value === undefined) return undefined;
          return value;
        }));
        console.log("[DEBUG] Datos limpios para guardar venta:", cleanFormData);
        // Crear la venta
        docRef = await addDoc(collection(db, "ventas"), cleanFormData);
        // Descontar stock y registrar movimiento de cada producto vendido
        for (const prod of cleanFormData.productos) {
          console.log("[DEBUG] Intentando descontar stock para producto:", prod.id);
          const productoRef = doc(db, "productos", prod.id);
          // Verificar existencia
          const productoSnap = await getDocs(collection(db, "productos"));
          const existe = productoSnap.docs.find(d => d.id === prod.id);
          if (!existe) {
            setLoading(false);
            alert(`El producto con ID ${prod.id} no existe en el catálogo. No se puede descontar stock ni registrar movimiento.`);
            return;
          }
          await updateDoc(productoRef, {
            stock: increment(-Math.abs(prod.cantidad))
          });
          // Registrar movimiento de stock
          await addDoc(collection(db, "movimientos"), {
            productoId: prod.id,
            tipo: "salida",
            cantidad: prod.cantidad,
            usuario: "Sistema",
            fecha: serverTimestamp(),
            referencia: "venta",
            referenciaId: docRef.id,
            observaciones: `Salida por venta (${cleanFormData.nombre || ''})`,
            productoNombre: prod.nombre,
          });
        }
        // Si la venta tiene envío, crear automáticamente el registro de envío
        if (cleanFormData.tipoEnvio && cleanFormData.tipoEnvio !== "retiro_local") {
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
            cantidadTotal: cleanFormData.productos.reduce((acc, p) => acc + p.cantidad, 0),
            historialEstados: [
              {
                estado: "pendiente",
                fecha: new Date().toISOString(),
                comentario: "Envío creado automáticamente desde la venta"
              }
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
          // Limpiar datos para presupuesto y mapear productos
          // 1. Sincronizar cliente
          const clienteObj = formData.cliente || {};
          console.log("[DEBUG] Cliente recibido:", clienteObj);
          // 2. Mapear productos seleccionados a items y productos
          const productosLimpios = (formData.items || []).map(p => ({
            ...p,
          }));
          console.log("[DEBUG] Productos limpios:", productosLimpios);
          // 3. Preparar el objeto a guardar
          const cleanFormData = {
            ...formData,
            cliente: clienteObj,
            items: productosLimpios,
            productos: productosLimpios,
            subtotal: productosLimpios.reduce((acc, p) => acc + (Number(p.precio) * Number(p.cantidad)), 0),
            descuentoTotal: productosLimpios.reduce((acc, p) => acc + (Number(p.descuento) * Number(p.cantidad)), 0),
            iva: ((productosLimpios.reduce((acc, p) => acc + (Number(p.precio) * Number(p.cantidad)), 0) - productosLimpios.reduce((acc, p) => acc + (Number(p.descuento) * Number(p.cantidad)), 0)) * 0.21),
            total: (productosLimpios.reduce((acc, p) => acc + (Number(p.precio) * Number(p.cantidad)), 0) - productosLimpios.reduce((acc, p) => acc + (Number(p.descuento) * Number(p.cantidad)), 0)) + ((productosLimpios.reduce((acc, p) => acc + (Number(p.precio) * Number(p.cantidad)), 0) - productosLimpios.reduce((acc, p) => acc + (Number(p.descuento) * Number(p.cantidad)), 0)) * 0.21),
            fechaCreacion: new Date().toISOString(),
            tipo: "presupuesto",
            numeroPedido: `PRESU-${Date.now()}`,
          };
          console.log("[DEBUG] Objeto preparado para guardar:", cleanFormData);
          // Limpiar undefined y vacíos
          const finalFormData = JSON.parse(JSON.stringify(cleanFormData, (key, value) => {
            if (value === undefined) return undefined;
            return value;
          }));
          console.log("[DEBUG] Datos limpios para guardar presupuesto:", finalFormData);
          docRef = await addDoc(collection(db, "presupuestos"), finalFormData);
          console.log("[SUCCESS] Presupuesto guardado en Firebase con ID:", docRef.id);
          setOpen(null);
          router.push(`/${lang}/presupuestos/${docRef.id}`);
        } catch (err) {
          console.error("[ERROR] Error en el proceso de guardado de presupuesto:", err);
          alert("Error al guardar presupuesto: " + err.message);
          throw err;
        }
      }
    } catch (error) {
      console.error("[ERROR] Error general al guardar:", error);
      alert("Error al guardar: " + error.message);
      throw error; // Re-lanzar el error para que el componente hijo lo maneje
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 py-8">
      <div className="flex gap-4 mb-4 justify-end">
        <Button variant="default" onClick={() => setOpen('presupuesto')}>Agregar Presupuesto</Button>
        <Button variant="default" onClick={() => setOpen('venta')}>Agregar Venta</Button>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Presupuestos</CardTitle>
          </CardHeader>
          <CardContent>
            <DataTable data={presupuestosData} columns={columns} />
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Ventas</CardTitle>
          </CardHeader>
          <CardContent>
            <DataTable data={ventasData} columns={columns} />
          </CardContent>
        </Card>
      </div>
      
      <Dialog open={!!open} onOpenChange={handleClose}>
        <DialogContent className="w-[95vw] max-w-[1500px] h-[90vh] flex flex-col">
          <FormularioVentaPresupuesto tipo={open} onClose={handleClose} onSubmit={handleSubmit} />
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default VentasPage; 