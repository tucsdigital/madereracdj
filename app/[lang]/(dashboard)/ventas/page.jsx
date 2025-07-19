"use client";
import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { columns } from "../(invoice)/invoice-list/invoice-list-table/components/columns";
import { DataTable } from "../(invoice)/invoice-list/invoice-list-table/components/data-table";
import avatar1 from "@/public/images/avatar/avatar-1.jpg";
import { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";
import { Autocomplete, AutocompleteItem } from "@/components/ui/autocomplete";
import { Box, Layers, Settings } from "lucide-react";
import { db } from "@/lib/firebase";
import { collection, getDocs, addDoc, doc, getDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";

// Datos de ejemplo para presupuestos
const presupuestosData = [
  {
    id: "#P-001",
    customer: { name: "Juan Pérez", email: "juan@mail.com", avatar: avatar1 },
    date: "01-06-2024",
    amount: "15000",
    status: "pendiente",
    paymentStatus: "-"
  },
  {
    id: "#P-002",
    customer: { name: "Ana López", email: "ana@mail.com", avatar: avatar1 },
    date: "02-06-2024",
    amount: "22000",
    status: "aceptado",
    paymentStatus: "-"
  },
];

// Datos de ejemplo para ventas
const ventasData = [
  {
    id: "#V-001",
    customer: { name: "Carlos Gómez", email: "carlos@mail.com", avatar: avatar1 },
    date: "03-06-2024",
    amount: "18000",
    status: "confirmado",
    paymentStatus: "pagado"
  },
  {
    id: "#V-002",
    customer: { name: "Lucía Torres", email: "lucia@mail.com", avatar: avatar1 },
    date: "04-06-2024",
    amount: "25000",
    status: "entregado",
    paymentStatus: "pagado"
  },
];

// Datos hardcodeados de clientes
const clientes = [
  { id: 1, nombre: "Carpintería El Roble", cuit: "20-12345678-9", direccion: "Av. Madera 123", telefono: "1122334455", email: "roble@ejemplo.com" },
  { id: 2, nombre: "Obras SRL", cuit: "30-87654321-0", direccion: "Ruta 8 Km 45", telefono: "1144556677", email: "obras@ejemplo.com" },
  { id: 3, nombre: "Muebles Modernos", cuit: "27-11223344-5", direccion: "Calle Nogal 456", telefono: "1133445566", email: "muebles@ejemplo.com" },
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
  const schema = yup.object().shape({
    nombre: yup.string().required("El nombre es obligatorio"),
    id: yup.string().required("El ID es obligatorio"),
    fecha: yup.string().required("La fecha es obligatoria"),
    vencimiento: yup.string().required("La fecha de vencimiento es obligatoria"),
    empresa: yup.object().shape({
      nombre: yup.string().required("Obligatorio"),
      email: yup.string().email("Email inválido").required("Obligatorio"),
      telefono: yup.string().required("Obligatorio"),
      direccion: yup.string().required("Obligatorio"),
    }),
    cliente: yup.object().shape({
      nombre: yup.string().required("Obligatorio"),
      email: yup.string().email("Email inválido").required("Obligatorio"),
      telefono: yup.string().required("Obligatorio"),
      direccion: yup.string().required("Obligatorio"),
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

  const { register, handleSubmit, control, formState: { errors }, setValue, watch, reset } = useForm({
    resolver: yupResolver(schema),
    defaultValues: {
      nombre: "",
      id: "",
      fecha: "",
      vencimiento: "",
      empresa: { nombre: "", email: "", telefono: "", direccion: "" },
      cliente: { nombre: "", email: "", telefono: "", direccion: "" },
      items: [
        { descripcion: "", cantidad: 1, precio: 0, unidad: "unidades", moneda: "$" }
      ]
    }
  });

  const items = watch("items");

  // Estado para cliente seleccionado
  const [clienteId, setClienteId] = useState("");
  const [clientesState, setClientesState] = useState(clientes);
  const clienteSeleccionado = clientesState.find(c => c.id === Number(clienteId));
  // Estado para modal de nuevo cliente
  const [openNuevoCliente, setOpenNuevoCliente] = useState(false);
  const [nuevoCliente, setNuevoCliente] = useState({ nombre: "", cuit: "", direccion: "", telefono: "", email: "" });

  // Estado para selección de categoría y productos
  const [categoriaId, setCategoriaId] = useState("");
  const [productosSeleccionados, setProductosSeleccionados] = useState([]); // [{id, nombre, precio, cantidad, unidad, descuento}]
  // Estado para búsqueda global de productos
  const [busquedaProducto, setBusquedaProducto] = useState("");

  // Manejo de selección de productos
  const handleAgregarProducto = (producto) => {
    if (!productosSeleccionados.some(p => p.id === producto.id)) {
      setProductosSeleccionados([...productosSeleccionados, { ...producto, cantidad: 1, descuento: 0 }]);
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
  const handleGuardarNuevoCliente = () => {
    const nuevoId = clientesState.length > 0 ? Math.max(...clientesState.map(c => c.id)) + 1 : 1;
    const clienteObj = { id: nuevoId, ...nuevoCliente };
    setClientesState([...clientesState, clienteObj]);
    setClienteId(nuevoId.toString());
    setNuevoCliente({ nombre: "", cuit: "", direccion: "", telefono: "", email: "" });
    setOpenNuevoCliente(false);
  };

  return (
    <>
      <DialogHeader className="mb-2">
        <DialogTitle>{tipo === 'presupuesto' ? 'Nuevo Presupuesto' : 'Nueva Venta'}</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6 flex-1 overflow-y-auto px-1">
        {/* Selección de cliente */}
        <section className="bg-white rounded-lg p-4 border border-default-200 shadow-sm flex flex-col gap-2 mb-2">
          <label className="font-semibold">Cliente</label>
          <div className="flex gap-2 items-center">
            <select
              value={clienteId}
              onChange={e => setClienteId(e.target.value)}
              className="border rounded px-2 py-2 w-full"
            >
              <option value="">Seleccionar cliente...</option>
              {clientesState.map(c => (
                <option key={c.id} value={c.id}>{c.nombre} - {c.cuit}</option>
              ))}
            </select>
            <Button type="button" variant="default" onClick={() => setOpenNuevoCliente(true)}>
              + Nuevo
            </Button>
          </div>
          <div className="space-y-2 bg-white rounded-lg p-4 border border-default-200 shadow-sm">
            <div className="text-base font-semibold text-default-800 pb-1">Datos del cliente</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Input value={clienteSeleccionado?.nombre || ""} placeholder="Nombre del cliente" readOnly className="w-full" />
              <Input value={clienteSeleccionado?.cuit || ""} placeholder="CUIT" readOnly className="w-full" />
              <Input value={clienteSeleccionado?.direccion || ""} placeholder="Dirección" readOnly className="w-full" />
              <Input value={clienteSeleccionado?.telefono || ""} placeholder="Teléfono" readOnly className="w-full" />
              <Input value={clienteSeleccionado?.email || ""} placeholder="Email" readOnly className="w-full" />
            </div>
          </div>
        </section>
        {/* Modal alta rápida de cliente */}
        <Dialog open={openNuevoCliente} onOpenChange={setOpenNuevoCliente}>
          <DialogContent className="w-[95vw] max-w-[420px]">
            <DialogHeader>
              <DialogTitle>Agregar Cliente</DialogTitle>
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
        {/* Selección de productos */}
        <section className="bg-white rounded-lg p-4 border border-default-200 shadow-sm flex flex-col gap-2 mb-2">
          <label className="font-semibold">Productos</label>
          {/* Categorías como items con iconos */}
          <div className="flex gap-3 overflow-x-auto pb-2 mb-2">
            {categorias.map(cat => (
              <Button
                key={cat.id}
                variant={categoriaId === cat.id.toString() ? "default" : "soft"}
                size="sm"
                color={categoriaId === cat.id.toString() ? "primary" : "secondary"}
                className="rounded-full px-4 py-1 text-sm flex items-center gap-2 transition-all"
                onClick={() => setCategoriaId(cat.id.toString())}
              >
                {cat.icon}
                {cat.nombre}
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
                />
              </div>
              <div className="bg-gray-100 rounded-t px-4 py-2 font-semibold text-sm grid grid-cols-12 gap-2">
                <div className="col-span-5">Producto</div>
                <div className="col-span-2">Medida</div>
                <div className="col-span-2">Precio</div>
                <div className="col-span-3"></div>
              </div>
              <div className="divide-y divide-gray-200 bg-white rounded-b">
                {productosPorCategoria[categoriaId]?.filter(prod =>
                  prod.nombre.toLowerCase().includes(busquedaProducto.toLowerCase()) ||
                  prod.unidad.toLowerCase().includes(busquedaProducto.toLowerCase())
                ).map(prod => (
                  <div key={prod.id} className="grid grid-cols-12 gap-2 items-center px-4 py-2">
                    <div className="col-span-5 font-medium">{prod.nombre}</div>
                    <div className="col-span-2 text-xs text-default-500">{prod.unidad}</div>
                    <div className="col-span-2 font-bold text-primary">${prod.precio}</div>
                    <div className="col-span-3 flex justify-end">
                      <Button
                        type="button"
                        size="sm"
                        variant={productosSeleccionados.some(p => p.id === prod.id) ? "soft" : "default"}
                        color="primary"
                        className={productosSeleccionados.some(p => p.id === prod.id) ? "bg-yellow-200 text-yellow-700 cursor-default" : ""}
                        onClick={() => handleAgregarProducto(prod)}
                        disabled={productosSeleccionados.some(p => p.id === prod.id)}
                      >
                        {productosSeleccionados.some(p => p.id === prod.id) ? "Agregado" : "Agregar"}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
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
                  {productosSeleccionados.map(p => (
                    <tr key={p.id}>
                      <td className="p-2">{p.nombre}</td>
                      <td><Input type="number" min={1} value={p.cantidad} onChange={e => handleCantidadChange(p.id, e.target.value)} className="w-16" /></td>
                      <td>${p.precio}</td>
                      <td><Input type="number" min={0} value={p.descuento} onChange={e => handleDescuentoChange(p.id, e.target.value)} className="w-16" /></td>
                      <td>${(p.precio * p.cantidad - p.descuento * p.cantidad).toFixed(2)}</td>
                      <td><Button type="button" size="icon" variant="ghost" onClick={() => handleQuitarProducto(p.id)}>-</Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        {/* Datos adicionales según tipo */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
         
          {tipo === 'venta' && (
            <div className="space-y-2 bg-white rounded-lg p-4 border border-default-200 shadow-sm">
              <div className="text-base font-semibold text-default-800 pb-1">Condiciones y detalles</div>
              <Input {...register("fecha")} placeholder="Fecha de emisión" type="date" className="w-full" />
              <Input {...register("fechaEntrega")} placeholder="Fecha de entrega" type="date" className="w-full" />
              <Input {...register("transportista")} placeholder="Transportista" className="w-full" />
              <Input {...register("remito")} placeholder="N° Remito/Factura" className="w-full" />
              <select {...register("condicionesPago")} className="border rounded px-2 py-2 w-full">
                <option value="">Condiciones de pago...</option>
                <option value="contado">Contado</option>
                <option value="transferencia">Transferencia</option>
                <option value="cheque">Cheque</option>
              </select>
              <select {...register("estadoPago")} className="border rounded px-2 py-2 w-full">
                <option value="">Estado de pago...</option>
                <option value="pagado">Pagado</option>
                <option value="pendiente">Pendiente</option>
              </select>
              <select {...register("metodoPago")} className="border rounded px-2 py-2 w-full">
                <option value="">Método de pago...</option>
                <option value="efectivo">Efectivo</option>
                <option value="transferencia">Transferencia</option>
                <option value="tarjeta">Tarjeta</option>
              </select>
              <Textarea {...register("observaciones")} placeholder="Observaciones" className="w-full" />
            </div>
          )}
        </section>
        {/* Resumen de totales */}
        <section className="flex flex-col items-end gap-2 mt-4 pr-2">
          <div className="bg-primary/5 border border-primary/20 rounded-lg px-6 py-3 flex flex-col md:flex-row gap-4 md:gap-8 text-base shadow-sm w-full md:w-auto">
            <div>Subtotal: <span className="font-semibold">${subtotal.toFixed(2)}</span></div>
            <div>Descuento: <span className="font-semibold">${descuentoTotal.toFixed(2)}</span></div>
            <div>IVA (21%): <span className="font-semibold">${iva.toFixed(2)}</span></div>
            <div>Total: <span className="font-bold text-primary">${total.toFixed(2)}</span></div>
          </div>
        </section>
        <DialogFooter className="mt-6">
          <Button type="button" variant="outline" onClick={onClose} className="hover:bg-gray-100">Cancelar</Button>
          <Button type="submit" variant="default" className="shadow-md">Guardar {tipo === 'presupuesto' ? 'Presupuesto' : 'Venta'}</Button>
        </DialogFooter>
      </form>
    </>
  );
}

const VentasPage = () => {
  const [open, setOpen] = useState(null); // null | 'presupuesto' | 'venta'
  const [ventasData, setVentasData] = useState([]);
  const [presupuestosData, setPresupuestosData] = useState([]);
  const router = useRouter();

  React.useEffect(() => {
    const fetchData = async () => {
      const ventasSnap = await getDocs(collection(db, "ventas"));
      setVentasData(ventasSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      const presupuestosSnap = await getDocs(collection(db, "presupuestos"));
      setPresupuestosData(presupuestosSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    };
    fetchData();
  }, []);

  const handleClose = () => setOpen(null);
  const handleSubmit = async (data) => {
    let docRef;
    if (open === "venta") {
      docRef = await addDoc(collection(db, "ventas"), data);
      setOpen(null);
      router.push(`/ventas/${docRef.id}`);
    } else if (open === "presupuesto") {
      docRef = await addDoc(collection(db, "presupuestos"), data);
      setOpen(null);
      router.push(`/presupuestos/${docRef.id}`);
    }
  };
  return (
    <div className="flex flex-col gap-6 py-8">
      <div className="flex gap-4 mb-4 justify-end">
        <Button variant="default" onClick={() => setOpen('presupuesto')}>Agregar Presupuesto</Button>
        <Button variant="default" onClick={() => setOpen('venta')}>Agregar Venta</Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
        <DialogContent className="w-[95vw] max-w-[1500px] h-[150vh] max-h-[1000px] flex flex-col">
          <FormularioVentaPresupuesto tipo={open} onClose={handleClose} onSubmit={handleSubmit} />
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default VentasPage; 