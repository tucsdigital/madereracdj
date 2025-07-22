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

  // 1. Esquema de validación sin 'nombre' ni 'vencimiento'
  const schema = yup.object().shape({
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
      })
    ).min(1, "Agrega al menos un ítem"),
  });

  const { register, handleSubmit, setValue, formState: { errors }, watch, reset, trigger } = useForm({
    resolver: yupResolver(schema),
    defaultValues: {
      fecha: new Date().toISOString().split('T')[0],
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
  const [nuevoCliente, setNuevoCliente] = useState({ nombre: "", cuit: "", direccion: "", telefono: "", email: "" });

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
  const [productosSeleccionados, setProductosSeleccionados] = useState([]); // [{id, nombre, precio, cantidad, unidad, descuento}]
  // Estado para búsqueda global de productos
  const [busquedaProducto, setBusquedaProducto] = useState("");

  // Manejo de selección de productos
  // 1. Solo permitir agregar productos que existen en Firestore
  const handleAgregarProducto = (producto) => {
    // Busca el producto real en productosState por doc.id
    const real = productosState.find(p => p.id === producto.id);
    if (!real) {
      setSubmitStatus("error");
      setSubmitMessage("Solo puedes agregar productos existentes del catálogo.");
      return;
    }
    if (!productosSeleccionados.some(p => p.id === real.id)) {
      setProductosSeleccionados([
        ...productosSeleccionados,
        {
          id: real.id, // ID real de Firestore
          nombre: real.nombre,
          precio: real.precioUnidad || real.precioUnidadVenta || real.precioUnidadHerraje || real.precioUnidadQuimico || real.precioUnidadHerramienta,
          unidad: real.unidadMedida || real.unidadVenta || real.unidadVentaHerraje || real.unidadVentaQuimico || real.unidadVentaHerramienta,
          stock: real.stock,
          cantidad: 1,
          descuento: 0
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
  const subtotal = productosSeleccionados.reduce((acc, p) => acc + (p.precio * p.cantidad), 0);
  const descuentoTotal = productosSeleccionados.reduce((acc, p) => acc + (p.descuento * p.cantidad), 0);
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
    }
  };

  // Guardar nuevo cliente
  const handleGuardarNuevoCliente = async () => {
    const clienteObj = { ...nuevoCliente };
    const docRef = await addDoc(collection(db, "clientes"), clienteObj);
    setClientesState([...clientesState, { ...clienteObj, id: docRef.id }]);
    setClienteId(docRef.id);
    setNuevoCliente({ nombre: "", cuit: "", direccion: "", telefono: "", email: "" });
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
      const formData = {
        ...data,
        clienteId: clienteId,
        productos: productosSeleccionados.map(p => ({
          id: p.id, // Usar el ID real de Firestore
          nombre: p.nombre,
          cantidad: p.cantidad,
          precio: p.precio,
          unidad: p.unidad,
          descuento: p.descuento || 0,
        })),
        subtotal: subtotal,
        descuentoTotal: descuentoTotal,
        iva: iva,
        total: total,
        fechaCreacion: new Date().toISOString(),
        tipo: tipo,
        numeroPedido: `PED-${Date.now()}`, // <-- SIEMPRE incluir el número de pedido generado
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

  // Estado para inputs de corte de madera
  const [maderaInputs, setMaderaInputs] = useState({ alto: '', ancho: '', largo: '', precioPorPie: '' });
  const [precioCorteMadera, setPrecioCorteMadera] = useState(0);

  // Actualiza el precio en tiempo real cuando cambian los inputs
  useEffect(() => {
    if (categoriaId === 'Maderas' && maderaInputs.alto && maderaInputs.ancho && maderaInputs.largo && maderaInputs.precioPorPie) {
      const precio = calcularPrecioCorteMadera({
        alto: Number(maderaInputs.alto),
        ancho: Number(maderaInputs.ancho),
        largo: Number(maderaInputs.largo),
        precioPorPie: Number(maderaInputs.precioPorPie)
      });
      setPrecioCorteMadera(precio);
    } else {
      setPrecioCorteMadera(0);
    }
  }, [maderaInputs, categoriaId]);

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
              <div className="flex gap-2 items-center">
                <select
                  value={clienteId}
                  onChange={e => setClienteId(e.target.value)}
                  className="border rounded px-2 py-2 w-full"
                  name="clienteId"
                  ref={register ? register("clienteId").ref : undefined}
                  disabled={clientesLoading || isSubmitting}
                >
            <option value="">Seleccionar cliente...</option>
                  {clientesState.map(c => (
              <option key={c.id} value={c.id}>{c.nombre} - {c.cuit}</option>
            ))}
          </select>
                <Button 
                  type="button" 
                  variant="default" 
                  onClick={() => setOpenNuevoCliente(true)}
                  disabled={isSubmitting}
                >
                  + Nuevo
                </Button>
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
              <div className="bg-gray-100 rounded-t px-4 py-2 font-semibold text-sm grid grid-cols-12 gap-2">
                <div className="col-span-5">Producto</div>
                <div className="col-span-2">Medida</div>
                <div className="col-span-2">Precio</div>
                <div className="col-span-2">Stock</div>
                <div className="col-span-1"></div>
              </div>
              {categoriaId === 'Maderas' && (
                <div className="w-full mb-2 animate-fade-in">
                  {/* Inputs para corte de madera */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mb-2">
                    <Input type="number" min={1} placeholder="Alto (cm)" value={maderaInputs.alto} onChange={e => setMaderaInputs(i => ({ ...i, alto: e.target.value }))} />
                    <Input type="number" min={1} placeholder="Ancho (cm)" value={maderaInputs.ancho} onChange={e => setMaderaInputs(i => ({ ...i, ancho: e.target.value }))} />
                    <Input type="number" min={1} placeholder="Largo (cm)" value={maderaInputs.largo} onChange={e => setMaderaInputs(i => ({ ...i, largo: e.target.value }))} />
                    <Input type="number" min={1} placeholder="Precio por pie tabla" value={maderaInputs.precioPorPie} onChange={e => setMaderaInputs(i => ({ ...i, precioPorPie: e.target.value }))} />
                  </div>
                  <div className="mb-2 text-primary font-semibold">Precio calculado: ${precioCorteMadera}</div>
                  {/* Lista de productos de maderas */}
                  <div className="divide-y divide-gray-200 bg-white rounded-b">
                    {productosPorCategoria[categoriaId]?.filter(prod =>
                      prod.nombre.toLowerCase().includes(busquedaProducto.toLowerCase()) ||
                      (prod.unidadMedida || '').toLowerCase().includes(busquedaProducto.toLowerCase())
                    ).map(prod => (
                      <div key={prod.id} className="grid grid-cols-12 gap-2 items-center px-4 py-2">
                        <div className="col-span-5 font-medium">{prod.nombre}</div>
                        <div className="col-span-2 text-xs text-default-500">{prod.unidadMedida}</div>
                        <div className="col-span-2 font-bold text-primary">${precioCorteMadera}</div>
                        <div className="col-span-2 font-mono text-xs">{prod.stock}</div>
                        <div className="col-span-1 flex justify-end">
                          <Button
                            type="button"
                            size="sm"
                            variant={productosSeleccionados.some(p => p.id === prod.id) ? "soft" : "default"}
                            color="primary"
                            className={productosSeleccionados.some(p => p.id === prod.id) ? "bg-yellow-200 text-yellow-700 cursor-default" : ""}
                            onClick={() => {
                              if (prod.stock <= 0) return;
                              handleAgregarProducto({
                                id: prod.id,
                                nombre: prod.nombre,
                                precio: precioCorteMadera,
                                unidad: prod.unidadMedida,
                                stock: prod.stock
                              });
                            }}
                            disabled={productosSeleccionados.some(p => p.id === prod.id) || isSubmitting || prod.stock <= 0 || precioCorteMadera <= 0}
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
            <div className="overflow-x-auto">
              <table className="w-full text-sm mt-2 min-w-[600px]">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="p-2">Producto</th>
                    <th>Cant.</th>
                    <th>Precio</th>
                    <th>Desc.</th>
                    <th>Subtotal</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {productosSeleccionados.map((p, idx) => (
                    <tr key={p.id}>
                      <td className="p-2">
                        {p.nombre}
                        {/* Si es Maderas, permite editar dimensiones y recalcular */}
                        {categoriasState.includes('Maderas') && categoriaId === 'Maderas' && productosPorCategoria['Maderas']?.some(prod => prod.id === p.id) && (
                          <div className="flex flex-wrap gap-1 mt-1 text-xs">
                            <Input type="number" min={1} placeholder="Alto (cm)" value={p.alto || ''} onChange={e => {
                              const alto = Number(e.target.value);
                              const nuevoPrecio = calcularPrecioCorteMadera({
                                alto,
                                ancho: Number(p.ancho || 0),
                                largo: Number(p.largo || 0),
                                precioPorPie: Number(p.precioPorPie || 0)
                              });
                              setProductosSeleccionados(arr => arr.map((item, i) => i === idx ? { ...item, alto, precio: nuevoPrecio } : item));
                            }} className="w-16" />
                            <Input type="number" min={1} placeholder="Ancho (cm)" value={p.ancho || ''} onChange={e => {
                              const ancho = Number(e.target.value);
                              const nuevoPrecio = calcularPrecioCorteMadera({
                                alto: Number(p.alto || 0),
                                ancho,
                                largo: Number(p.largo || 0),
                                precioPorPie: Number(p.precioPorPie || 0)
                              });
                              setProductosSeleccionados(arr => arr.map((item, i) => i === idx ? { ...item, ancho, precio: nuevoPrecio } : item));
                            }} className="w-16" />
                            <Input type="number" min={1} placeholder="Largo (cm)" value={p.largo || ''} onChange={e => {
                              const largo = Number(e.target.value);
                              const nuevoPrecio = calcularPrecioCorteMadera({
                                alto: Number(p.alto || 0),
                                ancho: Number(p.ancho || 0),
                                largo,
                                precioPorPie: Number(p.precioPorPie || 0)
                              });
                              setProductosSeleccionados(arr => arr.map((item, i) => i === idx ? { ...item, largo, precio: nuevoPrecio } : item));
                            }} className="w-16" />
                            <Input type="number" min={1} placeholder="Precio por pie" value={p.precioPorPie || ''} onChange={e => {
                              const precioPorPie = Number(e.target.value);
                              const nuevoPrecio = calcularPrecioCorteMadera({
                                alto: Number(p.alto || 0),
                                ancho: Number(p.ancho || 0),
                                largo: Number(p.largo || 0),
                                precioPorPie
                              });
                              setProductosSeleccionados(arr => arr.map((item, i) => i === idx ? { ...item, precioPorPie, precio: nuevoPrecio } : item));
                            }} className="w-20" />
                            <span className="ml-2 text-primary font-semibold">${p.precio}</span>
                          </div>
                        )}
                      </td>
                      <td><Input type="number" min={1} value={p.cantidad} onChange={e => handleCantidadChange(p.id, e.target.value)} className="w-16" disabled={isSubmitting} /></td>
                      <td>${p.precio}</td>
                      <td><Input type="number" min={0} value={p.descuento} onChange={e => handleDescuentoChange(p.id, e.target.value)} className="w-16" disabled={isSubmitting} /></td>
                      <td>${(p.precio * p.cantidad - p.descuento * p.cantidad).toFixed(2)}</td>
                      <td><Button type="button" size="icon" variant="ghost" onClick={() => handleQuitarProducto(p.id)} disabled={isSubmitting}>-</Button></td>
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
                    <Input {...register("fechaEntrega")} placeholder="Fecha de entrega" type="date" className="w-full" disabled={isSubmitting} />
                    <select {...register("condicionesPago")} className="border rounded px-2 py-2 w-full" disabled={isSubmitting}>
              <option value="">Condiciones de pago...</option>
              <option value="contado">Contado</option>
                      <option value="30_dias">30 días</option>
                      <option value="60_dias">60 días</option>
                      <option value="90_dias">90 días</option>
                      <option value="transferencia_inmediata">Transferencia inmediata</option>
                    </select>
                    <select {...register("metodoPago")} className="border rounded px-2 py-2 w-full" disabled={isSubmitting}>
                      <option value="">Método de pago...</option>
                      <option value="efectivo">Efectivo</option>
                      <option value="transferencia">Transferencia bancaria</option>
                      <option value="tarjeta_debito">Tarjeta de débito</option>
                      <option value="tarjeta_credito">Tarjeta de crédito</option>
              <option value="cheque">Cheque</option>
                      <option value="mercadopago">MercadoPago</option>
            </select>
                    <select {...register("estadoPago")} className="border rounded px-2 py-2 w-full" disabled={isSubmitting}>
                <option value="">Estado de pago...</option>
                <option value="pagado">Pagado</option>
                <option value="pendiente">Pendiente</option>
                      <option value="parcial">Pago parcial</option>
                    </select>
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
                        <Input {...register("direccionEnvio")} placeholder="Dirección de envío" className="w-full" disabled={isSubmitting} />
                        <Input {...register("localidadEnvio")} placeholder="Localidad/Ciudad" className="w-full" disabled={isSubmitting} />
                        <Input {...register("codigoPostal")} placeholder="Código postal" className="w-full" disabled={isSubmitting} />
                        <select {...register("transportista")} className="border rounded px-2 py-2 w-full" disabled={isSubmitting}>
                          <option value="">Transportista...</option>
                          {transportistas.map(t => <option key={t}>{t}</option>)}
                        </select>
                        <Input {...register("costoEnvio")} placeholder="Costo de envío" type="number" className="w-full" disabled={isSubmitting} />
                      </>
                    )}
                  </div>

                  {/* Documentación y facturación */}
                  <div className="space-y-2 bg-white rounded-lg p-4 border border-default-200 shadow-sm">
                    <div className="text-base font-semibold text-default-800 pb-1">Documentación</div>
                    <div className="flex items-center gap-2 mb-2">
                      <input type="checkbox" checked={esConFactura} onChange={e => setEsConFactura(e.target.checked)} id="esConFactura" />
                      <label htmlFor="esConFactura" className="text-sm">¿Es con factura?</label>
                    </div>
                    {esConFactura && (
                      <>
                        <Input {...register("numeroFactura")} placeholder="N° Factura" className="w-full" disabled={isSubmitting} />
                        <Input {...register("numeroRemito")} placeholder="N° Remito" className="w-full" disabled={isSubmitting} />
                        <Input {...register("numeroPedido")} value={numeroPedido} readOnly className="w-full" />
                        <select {...register("tipoFactura")} className="border rounded px-2 py-2 w-full" disabled={isSubmitting}>
                          <option value="">Tipo de factura...</option>
                          <option value="A">Factura A</option>
                          <option value="B">Factura B</option>
                          <option value="C">Factura C</option>
                          <option value="ticket">Ticket</option>
                        </select>
                        <Input {...register("condicionIva")} placeholder="Condición IVA" className="w-full" disabled={isSubmitting} />
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenNuevoCliente(false)}>Cancelar</Button>
            <Button variant="default" onClick={handleGuardarNuevoCliente}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
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
    console.log("Recibiendo datos en VentasPage:", formData); // Debug
    setLoading(true);
    try {
      let docRef;
      if (open === "venta") {
        // Crear la venta
        docRef = await addDoc(collection(db, "ventas"), formData);
        // Descontar stock y registrar movimiento de cada producto vendido
        for (const prod of formData.productos) {
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
            observaciones: `Salida por venta (${formData.nombre || ''})`,
            productoNombre: prod.nombre,
          });
        }
        
        // Si la venta tiene envío, crear automáticamente el registro de envío
        if (formData.tipoEnvio && formData.tipoEnvio !== "retiro_local") {
          const envioData = {
            ventaId: docRef.id,
            clienteId: formData.clienteId,
            cliente: formData.cliente, // debe ser un objeto con nombre, cuit, etc.
            fechaCreacion: new Date().toISOString(),
            fechaEntrega: formData.fechaEntrega,
            estado: "pendiente",
            prioridad: formData.prioridad || "media",
            vendedor: formData.vendedor,
            // Datos de envío
            direccionEnvio: formData.direccionEnvio,
            localidadEnvio: formData.localidadEnvio,
            codigoPostal: formData.codigoPostal,
            tipoEnvio: formData.tipoEnvio,
            transportista: formData.transportista,
            costoEnvio: parseFloat(formData.costoEnvio) || 0,
            // Datos de la venta
            numeroFactura: formData.numeroFactura,
            numeroRemito: formData.numeroRemito,
            numeroPedido: formData.numeroPedido, // SIEMPRE incluir el número de pedido
            totalVenta: formData.total,
            // Productos
            productos: formData.productos,
            cantidadTotal: formData.productos.reduce((acc, p) => acc + p.cantidad, 0),
            // Seguimiento
            historialEstados: [
              {
                estado: "pendiente",
                fecha: new Date().toISOString(),
                comentario: "Envío creado automáticamente desde la venta"
              }
            ],
            
            // Observaciones
            observaciones: formData.observaciones,
            instruccionesEspeciales: "",
            
            // Timestamps
            fechaActualizacion: new Date().toISOString(),
            creadoPor: "sistema", // En una app real sería el usuario actual
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
        docRef = await addDoc(collection(db, "presupuestos"), formData);
    setOpen(null);
        router.push(`/${lang}/presupuestos/${docRef.id}`);
      }
    } catch (error) {
      console.error("Error al guardar:", error);
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