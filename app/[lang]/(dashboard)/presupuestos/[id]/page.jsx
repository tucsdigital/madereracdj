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
  setDoc,
  addDoc,
  increment,
  serverTimestamp,
} from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Printer, Download } from "lucide-react";
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
import FormularioVentaPresupuesto, {
  SelectorProductosPresupuesto,
} from "../../ventas/page";

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

const PresupuestoDetalle = () => {
  const params = useParams();
  const router = useRouter();
  const { id, lang } = params;
  const [presupuesto, setPresupuesto] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // 1. Importaciones necesarias para edición, modal y Firestore
  const [editando, setEditando] = useState(false);
  const [presupuestoEdit, setPresupuestoEdit] = useState(null);
  const [openVenta, setOpenVenta] = useState(false);
  const [ventaForm, setVentaForm] = useState(null);
  const [clientes, setClientes] = useState([]);
  const [productos, setProductos] = useState([]);
  const [loadingPrecios, setLoadingPrecios] = useState(false);
  const [errorForm, setErrorForm] = useState("");

  // Estado para conversión a venta
  const [convirtiendoVenta, setConvirtiendoVenta] = useState(false);

  // Estado para nuevo cliente en presupuestos
  const [openNuevoCliente, setOpenNuevoCliente] = useState(false);
  const [nuevoCliente, setNuevoCliente] = useState({
    nombre: "",
    direccion: "",
    telefono: "",
    cuit: "",
    partido: "",
    barrio: "",
    area: "",
    lote: "",
    descripcion: "",
  });

  useEffect(() => {
    const fetchPresupuesto = async () => {
      try {
        console.log("=== DEBUG PRESUPUESTO ===");
        console.log("Params completos:", params);
        console.log("ID extraído:", id);
        console.log("Lang extraído:", lang);
        console.log("URL actual:", window.location.href);

        if (!id) {
          console.error("No se encontró ID en los parámetros");
          setError("No se proporcionó ID de presupuesto");
          setLoading(false);
          return;
        }

        const docRef = doc(db, "presupuestos", id);
        console.log("Referencia del documento:", docRef);

        const docSnap = await getDoc(docRef);
        console.log("Documento existe:", docSnap.exists());
        console.log("Datos del documento:", docSnap.data());

        if (docSnap.exists()) {
          const presupuestoData = { id: docSnap.id, ...docSnap.data() };
          console.log("Presupuesto cargado exitosamente:", presupuestoData);
          setPresupuesto(presupuestoData);
        } else {
          console.error("Presupuesto no encontrado en Firebase");
          setError("El presupuesto no existe en la base de datos");
        }
      } catch (error) {
        console.error("Error al cargar presupuesto:", error);
        setError(`Error al cargar el presupuesto: ${error.message}`);
      } finally {
        setLoading(false);
      }
    };

    fetchPresupuesto();
  }, [id, lang, params]);

  // 3. Cargar clientes y productos para selects y actualización de precios
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

  // 4. Al activar edición, clonar presupuesto
  useEffect(() => {
    if (editando && presupuesto)
      setPresupuestoEdit(JSON.parse(JSON.stringify(presupuesto)));
  }, [editando, presupuesto]);

  // 5. Función para actualizar precios
  const handleActualizarPrecios = async () => {
    setLoadingPrecios(true);
    try {
      const nuevosProductos = (
        presupuestoEdit.productos ||
        presupuestoEdit.items ||
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
      setPresupuestoEdit((prev) => ({
        ...prev,
        productos: nuevosProductos,
        items: nuevosProductos,
      }));
    } finally {
      setLoadingPrecios(false);
    }
  };

  // 6. Guardar cambios en Firestore
  const handleGuardarCambios = async () => {
    setErrorForm("");
    // Validaciones básicas
    if (!presupuestoEdit.clienteId || !presupuestoEdit.cliente?.nombre) {
      setErrorForm("Selecciona un cliente válido.");
      return;
    }
    if (!presupuestoEdit.productos?.length && !presupuestoEdit.items?.length) {
      setErrorForm("Agrega al menos un producto.");
      return;
    }
    for (const p of presupuestoEdit.productos || presupuestoEdit.items) {
      if (!p.cantidad || p.cantidad <= 0) {
        setErrorForm("Todas las cantidades deben ser mayores a 0.");
        return;
      }
      if (p.descuento < 0 || p.descuento > 100) {
        setErrorForm("El descuento debe ser entre 0 y 100%.");
        return;
      }
    }
    // Recalcular totales
    const productosArr = presupuestoEdit.productos || presupuestoEdit.items;
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
    const docRef = doc(db, "presupuestos", presupuestoEdit.id);
    await updateDoc(docRef, {
      ...presupuestoEdit,
      subtotal,
      descuentoTotal,
      total,
      productos: productosArr,
      items: productosArr,
    });
    setPresupuesto({
      ...presupuestoEdit,
      subtotal,
      descuentoTotal,
      total,
      productos: productosArr,
      items: productosArr,
    });
    setEditando(false);
  };

  // 7. Modal para convertir a venta
  const handleAbrirVenta = () => {
    setVentaForm({ ...presupuestoEdit });
    setOpenVenta(true);
  };
  const handleGuardarVenta = async (ventaData) => {
    // Validaciones y lógica similar a ventas/page.jsx
    // ...
    setOpenVenta(false);
    // Redirigir a la venta creada o mostrar mensaje de éxito
  };

  // Modal para nuevo cliente en presupuestos
  const handleNuevoClienteSubmit = async (e) => {
    e.preventDefault();
    try {
      const docRef = await addDoc(collection(db, "clientes"), nuevoCliente);
      setClientes((prev) => [...prev, { id: docRef.id, ...nuevoCliente }]);
      setNuevoCliente({
        nombre: "",
        direccion: "",
        telefono: "",
        cuit: "",
        partido: "",
        barrio: "",
        area: "",
        lote: "",
        descripcion: "",
      });
      setOpenNuevoCliente(false);
    } catch (error) {
      console.error("Error al guardar nuevo cliente:", error);
      alert("Error al guardar cliente: " + error.message);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-gray-600">Cargando presupuesto...</p>
          <p className="text-sm text-gray-500 mt-2">ID: {id}</p>
          <p className="text-sm text-gray-500">Lang: {lang}</p>
        </div>
      </div>
    );
  }

  if (error || !presupuesto) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center max-w-md">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">
            Presupuesto no encontrado
          </h2>
          <p className="text-gray-600 mb-4">
            {error ||
              "El presupuesto que buscas no existe o ha sido eliminado."}
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
              onClick={() => router.push(`/${lang}/presupuestos`)}
            >
              Ver todos los presupuestos
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Función para formatear fecha
  const formatDate = (dateString) => {
    if (!dateString) return "-";
    try {
      // Mostrar en formato argentino y ajustar a la zona horaria de Buenos Aires
      const dateObj = new Date(dateString);
      return dateObj.toLocaleDateString("es-AR", {
        timeZone: "America/Argentina/Buenos_Aires",
      });
    } catch {
      return dateString;
    }
  };

  // Calcular fecha de vencimiento automática (7 días después de emisión)
  const fechaVencimientoAuto = React.useMemo(() => {
    if (!presupuesto?.fecha) return null;
    const fecha = new Date(presupuesto.fecha);
    if (isNaN(fecha.getTime())) return null; // Fecha inválida
    fecha.setDate(fecha.getDate() + 7);
    return fecha;
  }, [presupuesto?.fecha]);

  // Función para imprimir
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #presupuesto-print, #presupuesto-print * { visibility: visible !important; }
          #presupuesto-print {
            position: absolute !important;
            left: 0; top: 0; width: 100vw; min-height: 100vh;
            background: white !important;
            box-shadow: none !important;
            padding: 0 !important;
            margin: 0 !important;
            font-family: 'Segoe UI', Arial, sans-serif !important;
          }
          #presupuesto-print .no-print, #presupuesto-print .no-print * { display: none !important; }
          #presupuesto-print .bg-white { box-shadow: none !important; border: none !important; }
          #presupuesto-print .rounded-lg { border-radius: 0 !important; }
          #presupuesto-print .shadow-sm { box-shadow: none !important; }
          #presupuesto-print .mb-6, #presupuesto-print .mt-6, #presupuesto-print .py-8, #presupuesto-print .px-4, #presupuesto-print .p-6 { margin: 0 !important; padding: 0 !important; }
          #presupuesto-print table { width: 100% !important; font-size: 13px; border-collapse: collapse; }
          #presupuesto-print th, #presupuesto-print td { border: 1px solid #ddd !important; padding: 6px 8px !important; }
          #presupuesto-print th { background: #f3f3f3 !important; }
          #presupuesto-print h1, #presupuesto-print h2, #presupuesto-print h3 { margin: 0 0 8px 0 !important; }
        }
      `}</style>
      <div id="presupuesto-print" className="max-w-4xl mx-auto px-4">
        {/* Logo y cabecera profesional para impresión */}
        <div
          className="flex items-center gap-4 border-b pb-4 mb-6 print-header"
          style={{ marginBottom: 32 }}
        >
          <img
            src="/logo-maderera.png"
            alt="Logo Maderera"
            style={{ height: 60, width: "auto" }}
          />
          <div>
            <h1
              className="text-2xl font-bold text-gray-900"
              style={{ letterSpacing: 1 }}
            >
              Maderera CJ&D
            </h1>
            <div className="text-gray-600 text-sm">
              Presupuesto / Cotización
            </div>
            <div className="text-gray-500 text-xs">www.madereracjd.com.ar</div>
          </div>
          {/* Header profesional: solo mostrar número de pedido */}
          <div className="ml-auto text-right">
            <div className="text-xs text-gray-500">
              Fecha:{" "}
              {presupuesto?.fecha ? formatFechaLocal(presupuesto.fecha) : "-"}
            </div>
            <div className="text-xs text-gray-500">
              N°: {presupuesto?.numeroPedido || presupuesto?.id?.slice(-8)}
            </div>
          </div>
        </div>
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6 no-print">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                N°: {presupuesto?.numeroPedido || presupuesto?.id?.slice(-8)}
              </h1>
              {/* Mostrar observaciones si existen */}
              {presupuesto.observaciones && (
                <p className="text-gray-600 mt-1 whitespace-pre-line">
                  {presupuesto.observaciones}
                </p>
              )}
              {/* Mostrar costo de envío si existe y es mayor a 0 */}
              {presupuesto.costoEnvio !== undefined && Number(presupuesto.costoEnvio) > 0 && (
                <div className="mt-1 text-sm text-primary font-semibold">
                  Costo de envío estimado: ${Number(presupuesto.costoEnvio).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                </div>
              )}
            </div>
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => router.back()}
                className="no-print"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Volver
              </Button>
              <Button onClick={handlePrint} className="no-print">
                <Printer className="w-4 h-4 mr-2" />
                Imprimir
              </Button>
            </div>
          </div>

          {/* Información del cliente */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="font-semibold text-lg mb-3 text-gray-900">
                Información del Cliente
              </h3>
              {/* Información del cliente: solo datos relevantes, sin repeticiones */}
              <div className="space-y-2 text-sm">
                <div>
                  <span className="font-medium">Nombre:</span>{" "}
                  {presupuesto.cliente?.nombre || "-"}
                </div>
                <div>
                  <span className="font-medium">CUIT / DNI:</span>{" "}
                  {presupuesto.cliente?.cuit || "-"}
                </div>
                <div>
                  <span className="font-medium">Dirección:</span>{" "}
                  {presupuesto.cliente?.direccion || "-"}
                </div>
                <div>
                  <span className="font-medium">Teléfono:</span>{" "}
                  {presupuesto.cliente?.telefono || "-"}
                </div>
                {presupuesto.cliente?.partido && (
                  <div>
                    <span className="font-medium">Partido:</span>{" "}
                    {presupuesto.cliente.partido}
                  </div>
                )}
                {presupuesto.cliente?.barrio && (
                  <div>
                    <span className="font-medium">Barrio:</span>{" "}
                    {presupuesto.cliente.barrio}
                  </div>
                )}
                {presupuesto.cliente?.area && (
                  <div>
                    <span className="font-medium">Área:</span>{" "}
                    {presupuesto.cliente.area}
                  </div>
                )}
                {presupuesto.cliente?.lote && (
                  <div>
                    <span className="font-medium">Lote:</span>{" "}
                    {presupuesto.cliente.lote}
                  </div>
                )}
                {presupuesto.cliente?.descripcion && (
                  <div>
                    <span className="font-medium">Descripción:</span>{" "}
                    {presupuesto.cliente.descripcion}
                  </div>
                )}
                <div>
                  <span className="font-medium">Email:</span>{" "}
                  {presupuesto.cliente?.email || "-"}
                </div>
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="font-semibold text-lg mb-3 text-gray-900">
                Información del Presupuesto
              </h3>
              {/* Información del presupuesto: solo datos clave, sin ID */}
              <div className="space-y-2 text-sm">
                <div>
                  <span className="font-medium">Fecha de emisión:</span>{" "}
                  {presupuesto.fecha
                    ? formatFechaLocal(presupuesto.fecha)
                    : "-"}
                </div>
                {/** Fecha de vencimiento automática */}
                <div>
                  <span className="font-medium">Fecha de vencimiento:</span>{" "}
                  {fechaVencimientoAuto ? formatFechaLocal(fechaVencimientoAuto.toISOString().split("T")[0]) : "-"}
                </div>
                <div>
                  <span className="font-medium">Tipo:</span>{" "}
                  {presupuesto.tipo || "Presupuesto"}
                </div>
                {presupuesto.costoEnvio !== undefined &&
                  presupuesto.costoEnvio !== "" && (
                <div>
                      <span className="font-medium">
                        Costo estimado de envío:
                      </span>{" "}
                      $
                      {Number(presupuesto.costoEnvio).toLocaleString("es-AR", {
                        minimumFractionDigits: 2,
                      })}
                    </div>
                  )}
                <div>
                  <span className="font-medium">Estado:</span>{" "}
                  <span className="ml-2 px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs">
                    Activo
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Productos */}
        {editando && presupuestoEdit ? (
          <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
            <SelectorProductosPresupuesto
              productosSeleccionados={presupuestoEdit.productos || []}
              setProductosSeleccionados={(nuevos) =>
                setPresupuestoEdit((prev) => ({
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
                  // Guardar solo productos y totales
                  const productosArr = presupuestoEdit.productos || [];
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
                  const docRef = doc(db, "presupuestos", presupuestoEdit.id);
                  await updateDoc(docRef, {
                    ...presupuestoEdit,
                    subtotal,
                    descuentoTotal,
                    total,
                    productos: productosArr,
                    items: productosArr,
                  });
                  setPresupuesto({
                    ...presupuestoEdit,
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
                Guardar productos
              </Button>
              <Button
                variant="outline"
                onClick={() => setEditando(false)}
                disabled={loadingPrecios}
              >
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
            <h3 className="font-semibold text-lg mb-4 text-gray-900">
              Productos y Servicios
            </h3>

            {/* Usar productos si existe, sino usar items */}
            {(presupuesto.productos || presupuesto.items) && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-100 border-b">
                      <th className="text-left p-3 font-medium">Producto</th>
                      <th className="text-center p-3 font-medium">Cantidad</th>
                      <th className="text-center p-3 font-medium">Unidad</th>
                      <th className="text-right p-3 font-medium">
                        Precio Unit.
                      </th>
                      <th className="text-right p-3 font-medium">Descuento</th>
                      <th className="text-right p-3 font-medium">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(presupuesto.productos || presupuesto.items || []).map(
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
                    <span>${(presupuesto.subtotal || 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Descuento total:</span>
                    <span>${(presupuesto.descuentoTotal || 0).toFixed(2)}</span>
                  </div>
                  {/* Mostrar costo de envío si existe y es >= 0 */}
                  {presupuesto.costoEnvio !== undefined && presupuesto.costoEnvio !== "" && !isNaN(Number(presupuesto.costoEnvio)) && (
                    <div className="flex justify-between">
                      <span>Cotización de envío:</span>
                      <span>${Number(presupuesto.costoEnvio).toFixed(2)}</span>
                    </div>
                  )}
                  <div className="border-t pt-2 flex justify-between font-bold text-lg">
                    <span>Total:</span>
                    <span className="text-primary">
                      ${(
                        (presupuesto.subtotal || 0) -
                        (presupuesto.descuentoTotal || 0) +
                        (presupuesto.costoEnvio !== undefined && presupuesto.costoEnvio !== "" && !isNaN(Number(presupuesto.costoEnvio))
                          ? Number(presupuesto.costoEnvio)
                          : 0)
                      ).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Observaciones */}
        {presupuesto.observaciones && (
          <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
            <h3 className="font-semibold text-lg mb-3 text-gray-900">
              Observaciones
            </h3>
            <p className="text-gray-700 whitespace-pre-wrap">
              {presupuesto.observaciones}
            </p>
          </div>
        )}

        {/* Botones de acción */}
        <div className="flex gap-3 mt-4">
          {!editando && (
            <Button onClick={() => setEditando(true)}>Editar</Button>
          )}
          {editando && (
            <Button onClick={handleGuardarCambios} disabled={loadingPrecios}>
              Guardar cambios
            </Button>
          )}
          {editando && (
            <Button onClick={handleActualizarPrecios} disabled={loadingPrecios}>
              {loadingPrecios ? "Actualizando..." : "Actualizar precios"}
            </Button>
          )}
          <Button onClick={() => setConvirtiendoVenta(true)}>
            Convertir a Venta
          </Button>
        </div>

        {/* Modal de venta */}
        {convirtiendoVenta ? (
          <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
            <FormularioConvertirVenta
              presupuesto={presupuesto}
              onCancel={() => setConvirtiendoVenta(false)}
              onSubmit={async (ventaCampos) => {
                try {
                  // Combinar datos del presupuesto con los campos de venta
                  const ventaData = {
                    ...presupuesto,
                    ...ventaCampos,
                    tipo: "venta",
                    subtotal: undefined,
                    descuentoTotal: undefined,
                    iva: undefined,
                    total: undefined,
                    fechaCreacion: new Date().toISOString(),
                    numeroPedido: `PED-${Date.now()}`,
                  };
                  // Limpiar datos antes de guardar
                  const cleanVentaData = JSON.parse(
                    JSON.stringify(ventaData, (key, value) => {
                    if (value === undefined) return undefined;
                    return value;
                    })
                  );
                  console.log(
                    "[DEBUG] Datos limpios para guardar venta desde presupuesto:",
                    cleanVentaData
                  );
                  const docRef = await addDoc(
                    collection(db, "ventas"),
                    cleanVentaData
                  );
                  for (const prod of presupuesto.productos ||
                    presupuesto.items) {
                    const productoRef = doc(db, "productos", prod.id);
                    const productoSnap = await getDocs(
                      collection(db, "productos")
                    );
                    const existe = productoSnap.docs.find(
                      (d) => d.id === prod.id
                    );
                    if (!existe) {
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
                      observaciones: `Salida por venta (${
                        presupuesto.cliente?.nombre || ""
                      })`,
                      productoNombre: prod.nombre,
                    });
                  }
                  if (
                    ventaCampos.tipoEnvio &&
                    ventaCampos.tipoEnvio !== "retiro_local"
                  ) {
                    const envioData = {
                      ventaId: docRef.id,
                      clienteId: presupuesto.clienteId,
                      cliente: presupuesto.cliente,
                      fechaCreacion: new Date().toISOString(),
                      fechaEntrega: ventaCampos.fechaEntrega,
                      estado: "pendiente",
                      prioridad: ventaCampos.prioridad || "media",
                      vendedor: ventaCampos.vendedor,
                      direccionEnvio: ventaCampos.direccionEnvio,
                      localidadEnvio: ventaCampos.localidadEnvio,
                      codigoPostal: ventaCampos.codigoPostal,
                      tipoEnvio: ventaCampos.tipoEnvio,
                      transportista: ventaCampos.transportista,
                      costoEnvio: parseFloat(ventaCampos.costoEnvio) || 0,
                      numeroPedido: ventaData.numeroPedido,
                      totalVenta: ventaData.total,
                      productos: presupuesto.productos || presupuesto.items,
                      cantidadTotal: (
                        presupuesto.productos || presupuesto.items
                      ).reduce((acc, p) => acc + p.cantidad, 0),
                      historialEstados: [
                        {
                          estado: "pendiente",
                          fecha: new Date().toISOString(),
                          comentario:
                            "Envío creado automáticamente desde la venta",
                        },
                      ],
                      observaciones: ventaCampos.observaciones,
                      instruccionesEspeciales: "",
                      fechaActualizacion: new Date().toISOString(),
                      creadoPor: "sistema",
                    };
                    const cleanEnvioData = Object.fromEntries(
                      Object.entries(envioData).filter(
                        ([_, v]) => v !== undefined
                      )
                    );
                    await addDoc(collection(db, "envios"), cleanEnvioData);
                  }
                  setConvirtiendoVenta(false);
                  router.push(`/${lang}/ventas/${docRef.id}`);
                } catch (error) {
                  console.error(
                    "Error al guardar venta desde presupuesto:",
                    error
                  );
                  alert("Error al guardar venta: " + error.message);
                }
              }}
            />
          </div>
        ) : (
          <Dialog open={openVenta} onOpenChange={setOpenVenta}>
            <DialogContent className="w-[95vw] max-w-[1500px] h-[90vh] flex flex-col">
              <FormularioVentaPresupuesto
                tipo="venta"
                onClose={() => setOpenVenta(false)}
                onSubmit={async (formData) => {
                  try {
                    // Guardar la venta en Firestore
                    const docRef = await addDoc(
                      collection(db, "ventas"),
                      formData
                    );
                    // Descontar stock y registrar movimiento de cada producto vendido
                    for (const prod of formData.productos) {
                      const productoRef = doc(db, "productos", prod.id);
                      const productoSnap = await getDocs(
                        collection(db, "productos")
                      );
                      const existe = productoSnap.docs.find(
                        (d) => d.id === prod.id
                      );
                      if (!existe) {
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
                        observaciones: `Salida por venta (${
                          formData.nombre || ""
                        })`,
                        productoNombre: prod.nombre,
                      });
                    }
                    // Si la venta tiene envío, crear automáticamente el registro de envío
                    if (
                      formData.tipoEnvio &&
                      formData.tipoEnvio !== "retiro_local"
                    ) {
                      const envioData = {
                        ventaId: docRef.id,
                        clienteId: formData.clienteId,
                        cliente: formData.cliente,
                        fechaCreacion: new Date().toISOString(),
                        fechaEntrega: formData.fechaEntrega,
                        estado: "pendiente",
                        prioridad: formData.prioridad || "media",
                        vendedor: formData.vendedor,
                        direccionEnvio: formData.direccionEnvio,
                        localidadEnvio: formData.localidadEnvio,
                        codigoPostal: formData.codigoPostal,
                        tipoEnvio: formData.tipoEnvio,
                        transportista: formData.transportista,
                        costoEnvio: parseFloat(formData.costoEnvio) || 0,
                        numeroPedido: formData.numeroPedido,
                        totalVenta: formData.total,
                        productos: formData.productos,
                        cantidadTotal: formData.productos.reduce(
                          (acc, p) => acc + p.cantidad,
                          0
                        ),
                        historialEstados: [
                          {
                            estado: "pendiente",
                            fecha: new Date().toISOString(),
                            comentario:
                              "Envío creado automáticamente desde la venta",
                          },
                        ],
                        observaciones: formData.observaciones,
                        instruccionesEspeciales: "",
                        fechaActualizacion: new Date().toISOString(),
                        creadoPor: "sistema",
                      };
                      const cleanEnvioData = Object.fromEntries(
                        Object.entries(envioData).filter(
                          ([_, v]) => v !== undefined
                        )
                      );
                      await addDoc(collection(db, "envios"), cleanEnvioData);
                    }
                    setOpenVenta(false);
                    router.push(`/${lang}/ventas/${docRef.id}`);
                  } catch (error) {
                    alert("Error al guardar venta: " + error.message);
                  }
                }}
                initialValues={{
                  ...presupuestoEdit,
                  tipo: "venta",
                  productos:
                    presupuestoEdit?.productos || presupuestoEdit?.items || [],
                  items: undefined, // para evitar duplicidad
                  subtotal: undefined,
                  descuentoTotal: undefined,
                  iva: undefined,
                  total: undefined,
                  fechaCreacion: undefined,
                  numeroPedido: `PED-${Date.now()}`,
                }}
              />
            </DialogContent>
          </Dialog>
        )}

        {/* Modal para nuevo cliente en presupuestos */}
        <Dialog open={openNuevoCliente} onOpenChange={setOpenNuevoCliente}>
          <DialogContent className="w-[95vw] max-w-[420px]">
            <DialogHeader>
              <DialogTitle>Agregar Cliente</DialogTitle>
              <DialogDescription>
                Complete los datos del nuevo cliente para agregarlo al sistema.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleNuevoClienteSubmit} className="space-y-2">
              <Input
                label="Nombre *"
                value={nuevoCliente.nombre}
                onChange={(e) =>
                  setNuevoCliente({ ...nuevoCliente, nombre: e.target.value })
                }
                required
              />
              <Input
                label="Dirección *"
                value={nuevoCliente.direccion}
                onChange={(e) =>
                  setNuevoCliente({
                    ...nuevoCliente,
                    direccion: e.target.value,
                  })
                }
                required
              />
              <Input
                label="Teléfono *"
                value={nuevoCliente.telefono}
                onChange={(e) =>
                  setNuevoCliente({ ...nuevoCliente, telefono: e.target.value })
                }
                required
              />
              <Input
                label="CUIT / DNI"
                value={nuevoCliente.cuit}
                onChange={(e) =>
                  setNuevoCliente({ ...nuevoCliente, cuit: e.target.value })
                }
              />
              <Input
                label="Partido"
                value={nuevoCliente.partido}
                onChange={(e) =>
                  setNuevoCliente({ ...nuevoCliente, partido: e.target.value })
                }
              />
              <Input
                label="Barrio"
                value={nuevoCliente.barrio}
                onChange={(e) =>
                  setNuevoCliente({ ...nuevoCliente, barrio: e.target.value })
                }
              />
              <Input
                label="Área"
                value={nuevoCliente.area}
                onChange={(e) =>
                  setNuevoCliente({ ...nuevoCliente, area: e.target.value })
                }
              />
              <Input
                label="Lote"
                value={nuevoCliente.lote}
                onChange={(e) =>
                  setNuevoCliente({ ...nuevoCliente, lote: e.target.value })
                }
              />
              <Textarea
                label="Descripción"
                value={nuevoCliente.descripcion}
                onChange={(e) =>
                  setNuevoCliente({
                    ...nuevoCliente,
                    descripcion: e.target.value,
                  })
                }
                rows={2}
              />
              <div className="flex justify-end gap-2 mt-4">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setOpenNuevoCliente(false)}
                >
                  Cancelar
                </Button>
                <Button type="submit" variant="primary">
                  Guardar
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

// Nuevo formulario minimalista para conversión a venta
function FormularioConvertirVenta({ presupuesto, onCancel, onSubmit }) {
  const [clientes, setClientes] = React.useState([]);
  // Cargar clientes al montar
  React.useEffect(() => {
    getDocs(collection(db, "clientes")).then((snap) => {
      setClientes(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    });
  }, []);

  const schema = yup.object().shape({
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
    tipoEnvio: yup.string().required("Selecciona el tipo de envío"),
    transportista: yup.string().when("tipoEnvio", {
      is: (val) => val && val !== "retiro_local",
      then: (s) => s.required("Selecciona el transportista"),
      otherwise: (s) => s.notRequired(),
    }),
    costoEnvio: yup
      .number()
      .transform((value, originalValue) =>
        originalValue === "" ? undefined : value
      )
      .notRequired(),
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
    vendedor: yup.string().required("Selecciona el vendedor"),
    prioridad: yup.string().required("Selecciona la prioridad"),
    clienteId: yup.string().required("Debe seleccionar un cliente"),
    cliente: yup.object().shape({
      nombre: yup.string().required("Obligatorio"),
      email: yup.string().email("Email inválido").required("Obligatorio"),
      telefono: yup.string().required("Obligatorio"),
      direccion: yup.string().required("Obligatorio"),
      cuit: yup.string().required("Obligatorio"),
    }),
  });
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    getValues,
    formState: { errors, isSubmitting, isSubmitSuccessful },
  } = useForm({
    resolver: yupResolver(schema),
    defaultValues: {
      formaPago: "",
      pagoParcial: false,
      montoAbonado: "",
      tipoEnvio: "",
      transportista: "",
      costoEnvio: "",
      fechaEntrega: "",
      rangoHorario: "",
      vendedor: "",
      prioridad: "",
      clienteId: presupuesto?.clienteId || "",
      cliente: presupuesto?.cliente || {
        nombre: "",
        email: "",
        telefono: "",
        direccion: "",
        cuit: "",
      },
    },
  });

  // Sincronizar clienteId automáticamente si falta pero hay cuit
  React.useEffect(() => {
    if (
      !presupuesto?.clienteId &&
      presupuesto?.cliente?.cuit &&
      clientes.length > 0
    ) {
      const match = clientes.find((c) => c.cuit === presupuesto.cliente.cuit);
      if (match) {
        setValue("clienteId", match.id);
      }
    }
  }, [presupuesto, clientes, setValue]);
  // Log de errores de validación para debug
  React.useEffect(() => {
    if (Object.keys(errors).length > 0) {
      console.log("[YUP] Errores de validación en conversión a venta:", errors);
    }
  }, [errors]);

  // Estado para forzar guardar aunque haya errores
  const [forzarGuardar, setForzarGuardar] = React.useState(false);
  // Mostrar advertencia si se va a guardar con errores
  const [showForceWarning, setShowForceWarning] = React.useState(false);

  // Handler profesional para guardar aunque haya errores
  const handleForceSave = async (e) => {
    e.preventDefault();
    setShowForceWarning(false);
    const values = getValues();
    console.warn(
      "[FORCE SAVE] Guardando venta con errores de validación:",
      errors
    );
    console.warn("[FORCE SAVE] Valores enviados:", values);
    await onSubmit(values); // Llama igual aunque falten campos
  };

  const onFormSubmit = async (data) => {
    setShowForceWarning(false);
    try {
      await onSubmit(data);
    } catch (e) {
      setShowForceWarning(true);
    }
  };
  const transportistas = ["camion", "camioneta 1", "camioneta 2"];
  const vendedores = ["coco", "damian", "lauti", "jose"];
  const prioridades = ["alta", "media", "baja"];
  const tipoEnvioSeleccionado = watch("tipoEnvio");
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
    <form
      onSubmit={handleSubmit(onFormSubmit, () => setShowForceWarning(true))}
      className="flex flex-col gap-6"
    >
      {showForceWarning && (
        <div className="mb-2 p-3 rounded bg-yellow-100 text-yellow-900 font-semibold text-center">
          Hay errores de validación en el formulario.
          <br />
          <span className="text-sm font-normal">
            Puedes forzar el guardado para debug, pero revisa la consola para
            ver los campos faltantes.
          </span>
          <div className="mt-2">
            <button
              type="button"
              className="bg-orange-500 hover:bg-orange-600 text-white font-bold py-2 px-4 rounded"
              onClick={handleForceSave}
              disabled={isSubmitting}
            >
              Guardar igual (debug)
            </button>
          </div>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Condiciones de pago y entrega */}
        <div className="space-y-2 bg-white rounded-lg p-4 border border-default-200 shadow-sm">
          <div className="text-base font-semibold text-default-800 pb-1">
            Condiciones de pago y entrega
          </div>
          <select
            {...register("formaPago")}
            className={`border rounded px-2 py-2 w-full ${
              errors.formaPago ? "border-red-500" : ""
            }`}
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
            <div>
              <Input
                type="number"
                min={0}
                placeholder="Monto abonado"
                {...register("montoAbonado")}
                className={`w-full ${
                  errors.montoAbonado ? "border-red-500" : ""
                }`}
              />
              {errors.montoAbonado && (
                <span className="text-red-500 text-xs">
                  {errors.montoAbonado.message}
                </span>
              )}
            </div>
          )}
        </div>
        {/* Información de envío */}
        <div className="space-y-2 bg-white rounded-lg p-4 border border-default-200 shadow-sm">
          <div className="text-base font-semibold text-default-800 pb-1">
            Información de envío
          </div>
          <select
            {...register("tipoEnvio")}
            className={`border rounded px-2 py-2 w-full ${
              errors.tipoEnvio ? "border-red-500" : ""
            }`}
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
              <select
                {...register("transportista")}
                className={`border rounded px-2 py-2 w-full ${
                  errors.transportista ? "border-red-500" : ""
                }`}
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
              {/* Solo mostrar costoEnvio si no es retiro_local */}
              <Input
                {...register("costoEnvio")}
                placeholder="Costo de envío"
                type="number"
                className="w-full"
              />
              <Input
                {...register("fechaEntrega")}
                placeholder="Fecha de entrega"
                type="date"
                className={`w-full ${
                  errors.fechaEntrega ? "border-red-500" : ""
                }`}
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
                className={`w-full ${
                  errors.rangoHorario ? "border-red-500" : ""
                }`}
              />
              {errors.rangoHorario && (
                <span className="text-red-500 text-xs">
                  {errors.rangoHorario.message}
                </span>
              )}
            </>
          )}
        </div>
        {/* Información adicional */}
        <div className="space-y-2 bg-white rounded-lg p-4 border border-default-200 shadow-sm">
          <div className="text-base font-semibold text-default-800 pb-1">
            Información adicional
          </div>
          <select
            {...register("vendedor")}
            className={`border rounded px-2 py-2 w-full ${
              errors.vendedor ? "border-red-500" : ""
            }`}
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
            className={`border rounded px-2 py-2 w-full ${
              errors.prioridad ? "border-red-500" : ""
            }`}
          >
            <option value="">Prioridad...</option>
            {prioridades.map((p) => (
              <option key={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
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
            rows={3}
            disabled={isSubmitting}
          />
        </div>
      </div>
      <div className="flex gap-2 mt-6 justify-end">
        <Button
          variant="outline"
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Cancelar
        </Button>
        <Button
          variant="default"
          type="submit"
          disabled={isSubmitting}
          className="min-w-[160px] text-lg font-semibold"
        >
          {isSubmitting ? "Guardando..." : "Guardar venta"}
        </Button>
      </div>
    </form>
  );
}

export default PresupuestoDetalle;
