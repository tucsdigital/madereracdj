"use client";
import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { db } from "@/lib/firebase";
import {
  doc,
  getDoc,
  collection,
  getDocs,
  updateDoc,
  increment,
  serverTimestamp,
} from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Printer, Download } from "lucide-react";
import { SelectorProductosPresupuesto } from "../page";
import FormularioVentaPresupuesto from "../page";

// Agregar función utilitaria para fechas
function formatFechaLocal(dateString) {
  if (!dateString) return "-";
  if (dateString.includes("T")) {
    const dateObj = new Date(dateString);
    return dateObj.toLocaleDateString("es-AR");
  }
  const [year, month, day] = dateString.split("-");
  if (!year || !month || !day) return dateString;
  const dateObj = new Date(Number(year), Number(month) - 1, Number(day));
  return dateObj.toLocaleDateString("es-AR");
}

const VentaDetalle = () => {
  const params = useParams();
  const router = useRouter();
  const { id, lang } = params;
  const [venta, setVenta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editando, setEditando] = useState(false);
  const [ventaEdit, setVentaEdit] = useState(null);
  const [clientes, setClientes] = useState([]);
  const [productos, setProductos] = useState([]);
  const [loadingPrecios, setLoadingPrecios] = useState(false);
  const [errorForm, setErrorForm] = useState("");

  useEffect(() => {
    const fetchVenta = async () => {
      try {
        console.log("=== DEBUG VENTA ===");
        console.log("Params completos:", params);
        console.log("ID extraído:", id);
        console.log("Lang extraído:", lang);
        console.log("URL actual:", window.location.href);
        
        if (!id) {
          console.error("No se encontró ID en los parámetros");
          setError("No se proporcionó ID de venta");
          setLoading(false);
          return;
        }
        
        const docRef = doc(db, "ventas", id);
        console.log("Referencia del documento:", docRef);
        
        const docSnap = await getDoc(docRef);
        console.log("Documento existe:", docSnap.exists());
        console.log("Datos del documento:", docSnap.data());
        
        if (docSnap.exists()) {
          const ventaData = { id: docSnap.id, ...docSnap.data() };
          console.log("Venta cargada exitosamente:", ventaData);
          setVenta(ventaData);
        } else {
          console.error("Venta no encontrada en Firebase");
          setError("La venta no existe en la base de datos");
        }
      } catch (error) {
        console.error("Error al cargar venta:", error);
        setError(`Error al cargar la venta: ${error.message}`);
      } finally {
        setLoading(false);
      }
    };
    
    fetchVenta();
  }, [id, lang, params]);

  // Cargar clientes y productos para selects y edición
  useEffect(() => {
    const fetchClientesYProductos = async () => {
      const snapClientes = await getDocs(collection(db, "clientes"));
      setClientes(
        snapClientes.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
      );
      const snapProductos = await getDocs(collection(db, "productos"));
      setProductos(
        snapProductos.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
      );
    };
    fetchClientesYProductos();
  }, []);
  // Al activar edición, clonar venta
  useEffect(() => {
    if (editando && venta) setVentaEdit(JSON.parse(JSON.stringify(venta)));
  }, [editando, venta]);
  // Función para actualizar precios
  const handleActualizarPrecios = async () => {
    setLoadingPrecios(true);
    try {
      const nuevosProductos = (
        ventaEdit.productos ||
        ventaEdit.items ||
        []
      ).map((item) => {
        const prod = productos.find((p) => p.id === item.id);
        if (prod) {
          return {
            ...item,
            precio:
              prod.precioUnidad ||
              prod.precioUnidadVenta ||
              prod.precioUnidadHerraje ||
              prod.precioUnidadQuimico ||
              prod.precioUnidadHerramienta,
          };
        }
        return item;
      });
      setVentaEdit((prev) => ({
        ...prev,
        productos: nuevosProductos,
        items: nuevosProductos,
      }));
    } finally {
      setLoadingPrecios(false);
    }
  };
  // Guardar cambios en Firestore
  const handleGuardarCambios = async () => {
    setErrorForm("");
    if (!ventaEdit.clienteId || !ventaEdit.cliente?.nombre) {
      setErrorForm("Selecciona un cliente válido.");
      return;
    }
    if (!ventaEdit.productos?.length && !ventaEdit.items?.length) {
      setErrorForm("Agrega al menos un producto.");
      return;
    }
    for (const p of ventaEdit.productos || ventaEdit.items) {
      if (!p.cantidad || p.cantidad <= 0) {
        setErrorForm("Todas las cantidades deben ser mayores a 0.");
        return;
      }
      if (p.descuento < 0 || p.descuento > 100) {
        setErrorForm("El descuento debe ser entre 0 y 100%.");
        return;
      }
    }
    const productosArr = ventaEdit.productos || ventaEdit.items;
    const subtotal = productosArr.reduce(
      (acc, p) => acc + Number(p.precio) * Number(p.cantidad),
      0
    );
    const descuentoTotal = productosArr.reduce(
      (acc, p) =>
        acc +
        Number(p.precio) *
          Number(p.cantidad) *
          (Number(p.descuento || 0) / 100),
      0
    );
    const total = subtotal - descuentoTotal;
    const docRef = doc(db, "ventas", ventaEdit.id);
    await updateDoc(docRef, {
      ...ventaEdit,
      subtotal,
      descuentoTotal,
      total,
      productos: productosArr,
      items: productosArr,
    });
    setVenta({
      ...ventaEdit,
      subtotal,
      descuentoTotal,
      total,
      productos: productosArr,
      items: productosArr,
    });
    setEditando(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-gray-600">Cargando venta...</p>
          <p className="text-sm text-gray-500 mt-2">ID: {id}</p>
          <p className="text-sm text-gray-500">Lang: {lang}</p>
        </div>
      </div>
    );
  }

  if (error || !venta) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center max-w-md">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">
            Venta no encontrada
          </h2>
          <p className="text-gray-600 mb-4">
            {error || "La venta que buscas no existe o ha sido eliminada."}
          </p>
          <div className="bg-gray-100 rounded-lg p-4 mb-6 text-left">
            <p className="text-sm text-gray-700">
              <strong>ID buscado:</strong> {id}
            </p>
            <p className="text-sm text-gray-700">
              <strong>Lang:</strong> {lang}
            </p>
            <p className="text-sm text-gray-700">
              <strong>URL:</strong> {window.location.href}
            </p>
            <p className="text-sm text-gray-700">
              <strong>Params:</strong> {JSON.stringify(params)}
            </p>
          </div>
          <div className="flex gap-3 justify-center">
            <Button onClick={() => router.back()}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Volver
            </Button>
            <Button
              variant="outline"
              onClick={() => router.push(`/${lang}/ventas`)}
            >
              Ver todas las ventas
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Función para imprimir
  const handlePrint = () => {
    window.print();
  };

  // Función para obtener el estado del pago
  const getEstadoPagoColor = (estado) => {
    switch (estado) {
      case "pagado":
        return "bg-green-100 text-green-800";
      case "pendiente":
        return "bg-yellow-100 text-yellow-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        {/* Header profesional igual al de presupuesto */}
        <div className="flex items-center gap-4 border-b pb-4 mb-6 print-header" style={{ marginBottom: 32 }}>
          <img
            src="/logo-maderera.png"
            alt="Logo Maderera"
            style={{ height: 60, width: "auto" }}
          />
            <div>
            <h1 className="text-2xl font-bold text-gray-900" style={{ letterSpacing: 1 }}>
              Maderera CJ&D
            </h1>
            <div className="text-gray-600 text-sm">Venta / Comprobante</div>
            <div className="text-gray-500 text-xs">www.madereracjd.com.ar</div>
          </div>
          <div className="ml-auto text-right">
            <div className="text-xs text-gray-500">
              Fecha: {venta?.fecha ? formatFechaLocal(venta.fecha) : "-"}
            </div>
            <div className="text-xs text-gray-500">
              N°: {venta?.numeroPedido || venta?.id?.slice(-8)}
            </div>
            </div>
          </div>

          {/* Información del cliente */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="font-semibold text-lg mb-3 text-gray-900">
              Información del Cliente
            </h3>
              <div className="space-y-2 text-sm">
              <div>
                <span className="font-medium">Nombre:</span>{" "}
                {venta.cliente?.nombre || "-"}
              </div>
              <div>
                <span className="font-medium">CUIT / DNI:</span>{" "}
                {venta.cliente?.cuit || "-"}
              </div>
              <div>
                <span className="font-medium">Dirección:</span>{" "}
                {venta.cliente?.direccion || "-"}
              </div>
              <div>
                <span className="font-medium">Teléfono:</span>{" "}
                {venta.cliente?.telefono || "-"}
              </div>
              {venta.cliente?.partido && (
                <div>
                  <span className="font-medium">Partido:</span>{" "}
                  {venta.cliente.partido}
                </div>
              )}
              {venta.cliente?.barrio && (
                <div>
                  <span className="font-medium">Barrio:</span>{" "}
                  {venta.cliente.barrio}
                </div>
              )}
              {venta.cliente?.area && (
                <div>
                  <span className="font-medium">Área:</span>{" "}
                  {venta.cliente.area}
                </div>
              )}
              {venta.cliente?.lote && (
                <div>
                  <span className="font-medium">Lote:</span>{" "}
                  {venta.cliente.lote}
                </div>
              )}
              {venta.cliente?.descripcion && (
                <div>
                  <span className="font-medium">Descripción:</span>{" "}
                  {venta.cliente.descripcion}
                </div>
              )}
              <div>
                <span className="font-medium">Email:</span>{" "}
                {venta.cliente?.email || "-"}
              </div>
            </div>
          </div>
          {/* Información de la Venta: solo fecha de emisión y estado de pago */}
            <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="font-semibold text-lg mb-3 text-gray-900">
              Información de la Venta
            </h3>
              <div className="space-y-2 text-sm">
              <div>
                <span className="font-medium">Fecha de emisión:</span>{" "}
                {formatFechaLocal(venta.fecha)}
              </div>
              <div>
                <span className="font-medium">Estado de pago:</span>{" "}
                <span
                  className={`ml-2 px-2 py-1 rounded-full text-xs ${getEstadoPagoColor(
                    venta.estadoPago
                  )}`}
                >
                  {venta.estadoPago ||
                    (venta.pagoParcial ? "Parcial" : "Completo")}
                  </span>
              </div>
            </div>
          </div>
        </div>

        {/* Información de Envío y Pago */}
        {venta.tipoEnvio && venta.tipoEnvio !== "retiro_local" ? (
          <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
            <h3 className="font-semibold text-lg mb-4 text-gray-900">
              Información de Envío y Pago
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <div>
                  <span className="font-medium">Tipo de envío:</span>{" "}
                  {venta.tipoEnvio}
                </div>
                <div>
                  <span className="font-medium">Transportista:</span>{" "}
                  {venta.transportista || "-"}
                </div>
                <div>
                  <span className="font-medium">Dirección:</span>{" "}
                  {venta.cliente?.direccion || "-"}
                </div>
                <div>
                  <span className="font-medium">Fecha de entrega:</span>{" "}
                  {formatFechaLocal(venta.fechaEntrega)}
                </div>
                <div>
                  <span className="font-medium">Rango horario:</span>{" "}
                  {venta.rangoHorario || "-"}
                </div>
                <div>
                  <span className="font-medium">Prioridad:</span>{" "}
                  {venta.prioridad || "-"}
                </div>
                <div>
                  <span className="font-medium">Vendedor:</span>{" "}
                  {venta.vendedor || "-"}
                </div>
              </div>
              <div className="space-y-3">
                <div>
                  <span className="font-medium">Forma de pago:</span>{" "}
                  {venta.formaPago || "-"}
                </div>
                {venta.costoEnvio !== undefined &&
                  Number(venta.costoEnvio) > 0 && (
                    <div>
                      <span className="font-medium">Costo de envío:</span> $
                      {Number(venta.costoEnvio).toLocaleString("es-AR", {
                        minimumFractionDigits: 2,
                      })}
                    </div>
                  )}
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
            <h3 className="font-semibold text-lg mb-4 text-gray-900">
              Información de Envío y Pago
            </h3>
            <div className="space-y-2 text-sm">
              <div>
                <span className="font-medium">Tipo de entrega:</span> Retiro en
                local
              </div>
              <div>
                <span className="font-medium">Fecha de retiro:</span>{" "}
                {formatFechaLocal(venta.fechaEntrega)}
              </div>
              <div>
                <span className="font-medium">Vendedor:</span>{" "}
                {venta.vendedor || "-"}
              </div>
              <div>
                <span className="font-medium">Forma de pago:</span>{" "}
                {venta.formaPago || "-"}
              </div>
            </div>
          </div>
        )}

        {/* Productos */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h3 className="font-semibold text-lg mb-4 text-gray-900">
            Productos y Servicios
          </h3>
          
          {/* Usar productos si existe, sino usar items */}
          {(venta.productos || venta.items) && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-100 border-b">
                    <th className="text-left p-3 font-medium">Producto</th>
                    <th className="text-center p-3 font-medium">Cantidad</th>
                    <th className="text-center p-3 font-medium">Unidad</th>
                    <th className="text-right p-3 font-medium">Precio Unit.</th>
                    <th className="text-right p-3 font-medium">Descuento</th>
                    <th className="text-right p-3 font-medium">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {(venta.productos || venta.items || []).map(
                    (producto, idx) => (
                    <tr key={idx} className="border-b hover:bg-gray-50">
                      <td className="p-3 font-medium">
                          {producto.descripcion ||
                            producto.nombre ||
                            "Producto sin nombre"}
                        </td>
                        <td className="p-3 text-center">
                          {producto.cantidad || 0}
                        </td>
                        <td className="p-3 text-center">
                          {producto.unidad || "-"}
                        </td>
                        <td className="p-3 text-right">
                          ${(producto.precio || 0).toFixed(2)}
                        </td>
                        <td className="p-3 text-right">
                          {(producto.descuento || 0).toFixed(2)}%
                      </td>
                      <td className="p-3 text-right font-medium">
                          $
                          {(
                            (producto.precio || 0) *
                            (producto.cantidad || 0) *
                            (1 - (producto.descuento || 0) / 100)
                          ).toFixed(2)}
                      </td>
                    </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Totales */}
          <div className="mt-6 flex justify-end">
            <div className="bg-gray-50 rounded-lg p-4 min-w-[300px]">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span>${(venta.subtotal || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between">
                  <span>Descuento total:</span>
                  <span>${(venta.descuentoTotal || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                </div>
                {/* Mostrar costo de envío si existe y es >= 0 */}
                {venta.costoEnvio !== undefined &&
                  venta.costoEnvio !== "" &&
                  !isNaN(Number(venta.costoEnvio)) && (
                    <div className="flex justify-between">
                      <span>Costo de envío:</span>
                      <span>${Number(venta.costoEnvio).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                    </div>
                  )}
                <div className="border-t pt-2 flex justify-between font-bold text-lg">
                  <span>Total:</span>
                  <span className="text-primary">
                    ${(
                      (venta.subtotal || 0) -
                      (venta.descuentoTotal || 0) +
                      (venta.costoEnvio !== undefined &&
                      venta.costoEnvio !== "" &&
                      !isNaN(Number(venta.costoEnvio))
                        ? Number(venta.costoEnvio)
                        : 0)
                    ).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Observaciones */}
        {venta.observaciones && (
          <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
            <h3 className="font-semibold text-lg mb-3 text-gray-900">
              Observaciones
            </h3>
            <p className="text-gray-700 whitespace-pre-wrap">
              {venta.observaciones}
            </p>
          </div>
        )}

        {!editando && <Button onClick={() => setEditando(true)}>Editar</Button>}
        {editando && ventaEdit && (
          <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
            {/* Cliente */}
            <div className="mb-4">
              <label className="font-semibold">Cliente</label>
              <input
                className="border rounded px-2 py-2 w-full mb-2"
                value={ventaEdit.cliente?.nombre || ""}
                onChange={(e) =>
                  setVentaEdit({
                    ...ventaEdit,
                    cliente: { ...ventaEdit.cliente, nombre: e.target.value },
                  })
                }
                placeholder="Nombre del cliente"
              />
              <input
                className="border rounded px-2 py-2 w-full mb-2"
                value={ventaEdit.cliente?.cuit || ""}
                onChange={(e) =>
                  setVentaEdit({
                    ...ventaEdit,
                    cliente: { ...ventaEdit.cliente, cuit: e.target.value },
                  })
                }
                placeholder="CUIT"
              />
              <input
                className="border rounded px-2 py-2 w-full mb-2"
                value={ventaEdit.cliente?.direccion || ""}
                onChange={(e) =>
                  setVentaEdit({
                    ...ventaEdit,
                    cliente: {
                      ...ventaEdit.cliente,
                      direccion: e.target.value,
                    },
                  })
                }
                placeholder="Dirección"
              />
              <input
                className="border rounded px-2 py-2 w-full mb-2"
                value={ventaEdit.cliente?.telefono || ""}
                onChange={(e) =>
                  setVentaEdit({
                    ...ventaEdit,
                    cliente: { ...ventaEdit.cliente, telefono: e.target.value },
                  })
                }
                placeholder="Teléfono"
              />
              <input
                className="border rounded px-2 py-2 w-full mb-2"
                value={ventaEdit.cliente?.email || ""}
                onChange={(e) =>
                  setVentaEdit({
                    ...ventaEdit,
                    cliente: { ...ventaEdit.cliente, email: e.target.value },
                  })
                }
                placeholder="Email"
              />
            </div>
            {/* Fechas y otros campos */}
            <div className="mb-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <input
                className="border rounded px-2 py-2 w-full"
                type="date"
                value={ventaEdit.fecha || ""}
                onChange={(e) =>
                  setVentaEdit({ ...ventaEdit, fecha: e.target.value })
                }
                placeholder="Fecha"
              />
              <input
                className="border rounded px-2 py-2 w-full"
                type="date"
                value={ventaEdit.fechaEntrega || ""}
                onChange={(e) =>
                  setVentaEdit({ ...ventaEdit, fechaEntrega: e.target.value })
                }
                placeholder="Fecha de entrega"
              />
              <input
                className="border rounded px-2 py-2 w-full"
                value={ventaEdit.formaPago || ""}
                onChange={(e) =>
                  setVentaEdit({ ...ventaEdit, formaPago: e.target.value })
                }
                placeholder="Forma de pago"
              />
              <input
                className="border rounded px-2 py-2 w-full"
                value={ventaEdit.tipoEnvio || ""}
                onChange={(e) =>
                  setVentaEdit({ ...ventaEdit, tipoEnvio: e.target.value })
                }
                placeholder="Tipo de envío"
              />
              <input
                className="border rounded px-2 py-2 w-full"
                value={ventaEdit.transportista || ""}
                onChange={(e) =>
                  setVentaEdit({ ...ventaEdit, transportista: e.target.value })
                }
                placeholder="Transportista"
              />
              <input
                className="border rounded px-2 py-2 w-full"
                value={ventaEdit.vendedor || ""}
                onChange={(e) =>
                  setVentaEdit({ ...ventaEdit, vendedor: e.target.value })
                }
                placeholder="Vendedor"
              />
              <input
                className="border rounded px-2 py-2 w-full"
                value={ventaEdit.prioridad || ""}
                onChange={(e) =>
                  setVentaEdit({ ...ventaEdit, prioridad: e.target.value })
                }
                placeholder="Prioridad"
              />
              <input
                className="border rounded px-2 py-2 w-full"
                value={ventaEdit.costoEnvio || ""}
                onChange={(e) =>
                  setVentaEdit({ ...ventaEdit, costoEnvio: e.target.value })
                }
                placeholder="Costo de envío"
                type="number"
              />
              <input
                className="border rounded px-2 py-2 w-full"
                value={ventaEdit.rangoHorario || ""}
                onChange={(e) =>
                  setVentaEdit({ ...ventaEdit, rangoHorario: e.target.value })
                }
                placeholder="Rango horario"
              />
              <textarea
                className="border rounded px-2 py-2 w-full"
                value={ventaEdit.observaciones || ""}
                onChange={(e) =>
                  setVentaEdit({ ...ventaEdit, observaciones: e.target.value })
                }
                placeholder="Observaciones"
              />
            </div>
            {/* Productos/items: puedes reutilizar SelectorProductosPresupuesto aquí si lo deseas */}
            <SelectorProductosPresupuesto
              productosSeleccionados={ventaEdit.productos || []}
              setProductosSeleccionados={(nuevos) =>
                setVentaEdit((prev) => ({
                  ...prev,
                  productos: nuevos,
                  items: nuevos,
                }))
              }
              productosState={productos}
              categoriasState={[...new Set(productos.map((p) => p.categoria))]}
              productosPorCategoria={productos.reduce((acc, p) => {
                acc[p.categoria] = acc[p.categoria] || [];
                acc[p.categoria].push(p);
                return acc;
              }, {})}
              isSubmitting={loadingPrecios}
              modoSoloProductos={true}
            />
            <div className="flex gap-2 mt-6">
              <Button
                variant="default"
                onClick={async () => {
                  // Guardar solo productos y totales y todos los campos editados
                  const productosArr = ventaEdit.productos || [];
                  const subtotal = productosArr.reduce(
                    (acc, p) => acc + Number(p.precio) * Number(p.cantidad),
                    0
                  );
                  const descuentoTotal = productosArr.reduce(
                    (acc, p) =>
                      acc +
                      Number(p.precio) *
                        Number(p.cantidad) *
                        (Number(p.descuento || 0) / 100),
                    0
                  );
                  const total = subtotal - descuentoTotal;
                  const docRef = doc(db, "ventas", ventaEdit.id);
                  await updateDoc(docRef, {
                    ...ventaEdit,
                    subtotal,
                    descuentoTotal,
                    total,
                    productos: productosArr,
                    items: productosArr,
                  });
                  setVenta({
                    ...ventaEdit,
                    subtotal,
                    descuentoTotal,
                    total,
                    productos: productosArr,
                    items: productosArr,
                  });
                  setEditando(false);
                }}
                disabled={loadingPrecios}
              >
                Guardar cambios
              </Button>
              <Button
                variant="outline"
                onClick={() => setEditando(false)}
                disabled={loadingPrecios}
              >
                Cancelar
              </Button>
            </div>
            {errorForm && <div className="text-red-500 mt-2">{errorForm}</div>}
          </div>
        )}
      </div>
    </div>
  );
};

export default VentaDetalle; 
