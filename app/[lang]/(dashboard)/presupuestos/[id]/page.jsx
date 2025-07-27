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
    
    try {
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
      // Calcular costo de envío solo si no es retiro local
      const costoEnvioCalculado = 
        presupuestoEdit.tipoEnvio && 
        presupuestoEdit.tipoEnvio !== "retiro_local" && 
        presupuestoEdit.costoEnvio !== undefined && 
        presupuestoEdit.costoEnvio !== "" && 
        !isNaN(Number(presupuestoEdit.costoEnvio)) 
          ? Number(presupuestoEdit.costoEnvio) 
          : 0;
      const total = subtotal - descuentoTotal + costoEnvioCalculado;
      
      // Generar número de pedido si no existe
      let numeroPedido = presupuestoEdit.numeroPedido;
      if (!numeroPedido) {
        numeroPedido = await getNextPresupuestoNumber();
      }
      
      const docRef = doc(db, "presupuestos", presupuestoEdit.id);
      await updateDoc(docRef, {
        ...presupuestoEdit,
        subtotal,
        descuentoTotal,
        total,
        productos: productosArr,
        items: productosArr,
        numeroPedido,
        fechaActualizacion: new Date().toISOString(),
      });
      
      setPresupuesto({
        ...presupuestoEdit,
        subtotal,
        descuentoTotal,
        total,
        productos: productosArr,
        items: productosArr,
        numeroPedido,
        fechaActualizacion: new Date().toISOString(),
      });
      setEditando(false);
      setErrorForm("");
    } catch (error) {
      console.error("Error al guardar cambios:", error);
      setErrorForm(`Error al guardar: ${error.message}`);
    }
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

  // Eliminar el cálculo de fecha de vencimiento automática

  // Función para imprimir
  const handlePrint = () => {
    window.print();
  };

  // Utilidades para asegurar arrays y números seguros
  function safeArray(val) {
    return Array.isArray(val) ? val : [];
  }
  function safeNumber(val) {
    const n = Number(val);
    return isNaN(n) ? 0 : n;
  }

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
              {/* Mostrar fecha de actualización si existe */}
              {presupuesto.fechaActualizacion && (
                <div className="mt-1 text-xs text-gray-500">
                  Última actualización: {formatFechaLocal(presupuesto.fechaActualizacion)}
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
                {/* Eliminar el cálculo de fecha de vencimiento automática */}
                <div>
                  <span className="font-medium">Fecha de vencimiento:</span>{" "}
                  -
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
            <h3 className="font-semibold text-lg mb-4 text-gray-900">
              Editar Presupuesto
            </h3>
            
            {/* Mensaje de error */}
            {errorForm && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-red-800 text-sm font-medium">{errorForm}</p>
              </div>
            )}
            
            {/* Información editable */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div className="space-y-4">
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Tipo de envío
                  </label>
                  <select
                    value={presupuestoEdit.tipoEnvio || ""}
                    onChange={(e) =>
                      setPresupuestoEdit({
                        ...presupuestoEdit,
                        tipoEnvio: e.target.value,
                      })
                    }
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                  >
                    <option value="">Seleccionar tipo de envío...</option>
                    <option value="retiro_local">Retiro en local</option>
                    <option value="envio_domicilio">Envío a domicilio</option>
                    <option value="envio_obra">Envío a obra</option>
                    <option value="transporte_propio">
                      Transporte propio del cliente
                    </option>
                  </select>
                </div>
                
                {presupuestoEdit.tipoEnvio && presupuestoEdit.tipoEnvio !== "retiro_local" && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Costo de envío
                    </label>
                    <Input
                      type="number"
                      value={presupuestoEdit.costoEnvio || ""}
                      onChange={(e) =>
                        setPresupuestoEdit({
                          ...presupuestoEdit,
                          costoEnvio: e.target.value,
                        })
                      }
                      placeholder="Costo de envío"
                      className="w-full"
                    />
                  </div>
                )}
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Observaciones
                  </label>
                  <Textarea
                    value={presupuestoEdit.observaciones || ""}
                    onChange={(e) =>
                      setPresupuestoEdit({
                        ...presupuestoEdit,
                        observaciones: e.target.value,
                      })
                    }
                    placeholder="Observaciones adicionales"
                    className="w-full"
                    rows={3}
                  />
                </div>
              </div>
            </div>

            {/* Selector de productos */}
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
                onClick={handleGuardarCambios}
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
              <Button
                variant="outline"
                onClick={handleActualizarPrecios}
                disabled={loadingPrecios}
              >
                {loadingPrecios ? "Actualizando..." : "Actualizar precios"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
            <h3 className="font-semibold text-lg mb-4 text-gray-900">
              Productos y Servicios
            </h3>

            {/* Usar productos si existe, sino usar items */}
            {(safeArray(presupuesto.productos).length > 0 ||
              safeArray(presupuesto.items).length > 0) && (
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
                    {safeArray(presupuesto.productos).length > 0
                      ? safeArray(presupuesto.productos).map(
                          (producto, idx) => (
                            <tr key={idx} className="border-b hover:bg-gray-50">
                              <td className="p-3 font-medium">
                                {producto.descripcion ||
                                  producto.nombre ||
                                  "Producto sin nombre"}
                              </td>
                              <td className="p-3 text-center">
                                {safeNumber(producto.cantidad)}
                              </td>
                              <td className="p-3 text-center">
                                {producto.unidad || "-"}
                              </td>
                              <td className="p-3 text-right">
                                ${safeNumber(producto.precio).toFixed(2)}
                              </td>
                              <td className="p-3 text-right">
                                {safeNumber(producto.descuento).toFixed(2)}%
                              </td>
                              <td className="p-3 text-right font-medium">
                                $
                                {(
                                  safeNumber(producto.precio) *
                                  safeNumber(producto.cantidad) *
                                  (1 - safeNumber(producto.descuento) / 100)
                                ).toFixed(2)}
                              </td>
                            </tr>
                          )
                        )
                      : safeArray(presupuesto.items).map((producto, idx) => (
                          <tr key={idx} className="border-b hover:bg-gray-50">
                            <td className="p-3 font-medium">
                              {producto.descripcion ||
                                producto.nombre ||
                                "Producto sin nombre"}
                            </td>
                            <td className="p-3 text-center">
                              {safeNumber(producto.cantidad)}
                            </td>
                            <td className="p-3 text-center">
                              {producto.unidad || "-"}
                            </td>
                            <td className="p-3 text-right">
                              ${safeNumber(producto.precio).toFixed(2)}
                            </td>
                            <td className="p-3 text-right">
                              {safeNumber(producto.descuento).toFixed(2)}%
                            </td>
                            <td className="p-3 text-right font-medium">
                              $
                              {(
                                safeNumber(producto.precio) *
                                safeNumber(producto.cantidad) *
                                (1 - safeNumber(producto.descuento) / 100)
                              ).toFixed(2)}
                            </td>
                          </tr>
                        ))}
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
                    <span>${safeNumber(presupuesto.subtotal).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Descuento total:</span>
                    <span>${safeNumber(presupuesto.descuentoTotal).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                  </div>
                  {/* Mostrar costo de envío si existe y es >= 0 y no es retiro local */}
                  {presupuesto.costoEnvio !== undefined &&
                    presupuesto.costoEnvio !== "" &&
                    !isNaN(Number(presupuesto.costoEnvio)) &&
                    presupuesto.tipoEnvio &&
                    presupuesto.tipoEnvio !== "retiro_local" && (
                      <div className="flex justify-between">
                        <span>Cotización de envío:</span>
                        <span>${safeNumber(presupuesto.costoEnvio).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                      </div>
                    )}
                  <div className="border-t pt-2 flex justify-between font-bold text-lg">
                    <span>Total:</span>
                    <span className="text-primary">
                      ${safeNumber(presupuesto.total).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
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

        {/* Botones de acción consolidados */}
        <div className="flex gap-3 mt-4">
          {!editando ? (
            <>
              <Button onClick={() => setEditando(true)}>
                Editar Presupuesto
              </Button>
              <Button onClick={() => setConvirtiendoVenta(true)}>
                Convertir a Venta
              </Button>
            </>
          ) : null}
        </div>

        {/* Modal de venta */}
        {convirtiendoVenta ? (
          <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
            <h3 className="font-semibold text-lg mb-4 text-gray-900">
              Convertir Presupuesto a Venta
            </h3>
            <p className="text-gray-600 mb-4">
              Complete los campos adicionales necesarios para convertir este presupuesto en una venta.
            </p>
            <FormularioConvertirVenta
              presupuesto={presupuesto}
              onCancel={() => setConvirtiendoVenta(false)}
              onSubmit={async (ventaCampos) => {
                try {
                  // Crear estructura de venta siguiendo exactamente el formato de ventas/page.jsx
                  const ventaData = {
                    // Datos del presupuesto
                    fecha: presupuesto.fecha,
                    clienteId: presupuesto.clienteId,
                    cliente: presupuesto.cliente,
                    productos: presupuesto.productos || presupuesto.items,
                    items: presupuesto.productos || presupuesto.items,
                    subtotal: presupuesto.subtotal,
                    descuentoTotal: presupuesto.descuentoTotal,
                    total: presupuesto.total,
                    observaciones: presupuesto.observaciones,
                    
                    // Datos específicos de venta
                    tipo: "venta",
                    fechaCreacion: new Date().toISOString(),
                    numeroPedido: await getNextVentaNumber(),
                    
                    // Campos de pago
                    formaPago: ventaCampos.formaPago,
                    pagoParcial: ventaCampos.pagoParcial || false,
                    montoAbonado: ventaCampos.montoAbonado || 0,
                    
                    // Campos de envío
                    tipoEnvio: ventaCampos.tipoEnvio,
                    fechaEntrega: ventaCampos.fechaEntrega,
                    rangoHorario: ventaCampos.rangoHorario,
                    transportista: ventaCampos.transportista,
                    costoEnvio: ventaCampos.costoEnvio,
                    direccionEnvio: ventaCampos.direccionEnvio,
                    localidadEnvio: ventaCampos.localidadEnvio,
                    usarDireccionCliente: ventaCampos.usarDireccionCliente || true,
                    
                    // Campos adicionales
                    vendedor: ventaCampos.vendedor,
                    prioridad: ventaCampos.prioridad,
                  };
                  
                  // Limpiar datos antes de guardar (igual que en ventas/page.jsx)
                  const cleanVentaData = JSON.parse(
                    JSON.stringify(ventaData, (key, value) => {
                      if (value === undefined) return undefined;
                      return value;
                    })
                  );
                  
                  console.log("[DEBUG] Datos limpios para guardar venta desde presupuesto:", cleanVentaData);
                  
                  // Guardar venta en Firestore
                  const docRef = await addDoc(collection(db, "ventas"), cleanVentaData);
                  
                  // Descontar stock y registrar movimientos (igual que en ventas/page.jsx)
                  for (const prod of cleanVentaData.productos) {
                    console.log("[DEBUG] Intentando descontar stock para producto:", prod.id);
                    const productoRef = doc(db, "productos", prod.id);
                    const productoSnap = await getDocs(collection(db, "productos"));
                    const existe = productoSnap.docs.find((d) => d.id === prod.id);
                    if (!existe) {
                      alert(`El producto con ID ${prod.id} no existe en el catálogo. No se puede descontar stock ni registrar movimiento.`);
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
                      observaciones: `Salida por venta (${presupuesto.cliente?.nombre || ""})`,
                      productoNombre: prod.nombre,
                    });
                  }
                  
                  // Crear envío si corresponde (igual que en ventas/page.jsx)
                  if (cleanVentaData.tipoEnvio && cleanVentaData.tipoEnvio !== "retiro_local") {
                    const envioData = {
                      ventaId: docRef.id,
                      clienteId: cleanVentaData.clienteId,
                      cliente: cleanVentaData.cliente,
                      fechaCreacion: new Date().toISOString(),
                      fechaEntrega: cleanVentaData.fechaEntrega,
                      estado: "pendiente",
                      prioridad: cleanVentaData.prioridad || "media",
                      vendedor: cleanVentaData.vendedor,
                      direccionEnvio: cleanVentaData.direccionEnvio,
                      localidadEnvio: cleanVentaData.localidadEnvio,
                      tipoEnvio: cleanVentaData.tipoEnvio,
                      transportista: cleanVentaData.transportista,
                      costoEnvio: parseFloat(cleanVentaData.costoEnvio) || 0,
                      numeroPedido: cleanVentaData.numeroPedido,
                      totalVenta: cleanVentaData.total,
                      productos: cleanVentaData.productos,
                      cantidadTotal: cleanVentaData.productos.reduce((acc, p) => acc + p.cantidad, 0),
                      historialEstados: [
                        {
                          estado: "pendiente",
                          fecha: new Date().toISOString(),
                          comentario: "Envío creado automáticamente desde la venta",
                        },
                      ],
                      observaciones: cleanVentaData.observaciones,
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
                  
                  setConvirtiendoVenta(false);
                  router.push(`/${lang}/ventas/${docRef.id}`);
                } catch (error) {
                  console.error("Error al guardar venta desde presupuesto:", error);
                  alert("Error al guardar venta: " + error.message);
                }
              }}
            />
          </div>
        ) : null}

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
    prioridad: yup.string().when("tipoEnvio", {
      is: (val) => val && val !== "retiro_local",
      then: (s) => s.required("Selecciona la prioridad"),
      otherwise: (s) => s.notRequired(),
    }),
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
  
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
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
      direccionEnvio: "",
      localidadEnvio: "",
      usarDireccionCliente: true,
    },
  });

  const transportistas = ["camion", "camioneta 1", "camioneta 2"];
  const vendedores = ["coco", "damian", "lauti", "jose"];
  const prioridades = ["alta", "media", "baja"];
  const tipoEnvioSeleccionado = watch("tipoEnvio");
  const usarDireccionCliente = watch("usarDireccionCliente");
  
  // Limpiar montoAbonado si se desmarca pagoParcial
  React.useEffect(() => {
    if (!watch("pagoParcial")) {
      setValue("montoAbonado", "");
    }
  }, [watch("pagoParcial"), setValue]);

  // Limpiar costoEnvio si tipoEnvio es 'retiro_local'
  React.useEffect(() => {
    if (watch("tipoEnvio") === "retiro_local") {
      setValue("costoEnvio", "");
      setValue("fechaEntrega", "");
      setValue("rangoHorario", "");
      setValue("transportista", "");
      setValue("prioridad", "");
    }
  }, [watch("tipoEnvio"), setValue]);

  // Establecer fecha de entrega por defecto al día actual
  React.useEffect(() => {
    if (tipoEnvioSeleccionado && tipoEnvioSeleccionado !== "retiro_local") {
      setValue("fechaEntrega", new Date().toISOString().split("T")[0]);
    }
  }, [tipoEnvioSeleccionado, setValue]);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Condiciones de pago y entrega */}
        <div className="space-y-4 bg-white rounded-lg p-4 border border-gray-200 shadow-sm">
          <div className="text-base font-semibold text-gray-800 pb-2 border-b">
            Condiciones de pago y entrega
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Forma de pago *
            </label>
            <select
              {...register("formaPago")}
              className={`w-full border rounded-md px-3 py-2 ${
                errors.formaPago ? "border-red-500" : "border-gray-300"
              }`}
            >
              <option value="">Seleccionar forma de pago...</option>
              <option value="efectivo">Efectivo</option>
              <option value="transferencia">Transferencia</option>
              <option value="tarjeta">Tarjeta</option>
              <option value="cheque">Cheque</option>
              <option value="otro">Otro</option>
            </select>
            {errors.formaPago && (
              <span className="text-red-500 text-xs">{errors.formaPago.message}</span>
            )}
          </div>
          
          <div className="flex items-center gap-2">
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
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Monto abonado *
              </label>
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
                <span className="text-red-500 text-xs">{errors.montoAbonado.message}</span>
              )}
            </div>
          )}
        </div>

        {/* Información de envío */}
        <div className="space-y-4 bg-white rounded-lg p-4 border border-gray-200 shadow-sm">
          <div className="text-base font-semibold text-gray-800 pb-2 border-b">
            Información de envío
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Tipo de envío *
            </label>
            <select
              {...register("tipoEnvio")}
              className={`w-full border rounded-md px-3 py-2 ${
                errors.tipoEnvio ? "border-red-500" : "border-gray-300"
              }`}
            >
              <option value="">Seleccionar tipo de envío...</option>
              <option value="retiro_local">Retiro en local</option>
              <option value="envio_domicilio">Envío a domicilio</option>
              <option value="envio_obra">Envío a obra</option>
              <option value="transporte_propio">Transporte propio del cliente</option>
            </select>
            {errors.tipoEnvio && (
              <span className="text-red-500 text-xs">{errors.tipoEnvio.message}</span>
            )}
          </div>
          
          {tipoEnvioSeleccionado && tipoEnvioSeleccionado !== "retiro_local" && (
            <>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="usarDireccionCliente"
                  {...register("usarDireccionCliente")}
                />
                <label htmlFor="usarDireccionCliente" className="text-sm">
                  Usar dirección del cliente
                </label>
              </div>
              
              {!usarDireccionCliente && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Dirección de envío *
                    </label>
                    <Input
                      {...register("direccionEnvio")}
                      placeholder="Dirección de envío"
                      className={`w-full ${
                        errors.direccionEnvio ? "border-red-500" : ""
                      }`}
                    />
                    {errors.direccionEnvio && (
                      <span className="text-red-500 text-xs">{errors.direccionEnvio.message}</span>
                    )}
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Localidad *
                    </label>
                    <Input
                      {...register("localidadEnvio")}
                      placeholder="Localidad/Ciudad"
                      className={`w-full ${
                        errors.localidadEnvio ? "border-red-500" : ""
                      }`}
                    />
                    {errors.localidadEnvio && (
                      <span className="text-red-500 text-xs">{errors.localidadEnvio.message}</span>
                    )}
                  </div>
                </>
              )}
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Transportista *
                </label>
                <select
                  {...register("transportista")}
                  className={`w-full border rounded-md px-3 py-2 ${
                    errors.transportista ? "border-red-500" : "border-gray-300"
                  }`}
                >
                  <option value="">Seleccionar transportista...</option>
                  {transportistas.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
                {errors.transportista && (
                  <span className="text-red-500 text-xs">{errors.transportista.message}</span>
                )}
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Costo de envío
                </label>
                <Input
                  {...register("costoEnvio")}
                  placeholder="Costo de envío"
                  type="number"
                  className="w-full"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Fecha de entrega *
                </label>
                <Input
                  {...register("fechaEntrega")}
                  placeholder="Fecha de entrega"
                  type="date"
                  className={`w-full ${
                    errors.fechaEntrega ? "border-red-500" : ""
                  }`}
                  value={
                    watch("fechaEntrega")
                      ? new Date(watch("fechaEntrega")).toISOString().split("T")[0]
                      : ""
                  }
                />
                {errors.fechaEntrega && (
                  <span className="text-red-500 text-xs">{errors.fechaEntrega.message}</span>
                )}
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Rango horario *
                </label>
                <Input
                  {...register("rangoHorario")}
                  placeholder="Rango horario (ej: 8-12, 14-18)"
                  className={`w-full ${
                    errors.rangoHorario ? "border-red-500" : ""
                  }`}
                />
                {errors.rangoHorario && (
                  <span className="text-red-500 text-xs">{errors.rangoHorario.message}</span>
                )}
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Prioridad *
                </label>
                <select
                  {...register("prioridad")}
                  className={`w-full border rounded-md px-3 py-2 ${
                    errors.prioridad ? "border-red-500" : "border-gray-300"
                  }`}
                >
                  <option value="">Seleccionar prioridad...</option>
                  {prioridades.map((p) => (
                    <option key={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                  ))}
                </select>
                {errors.prioridad && (
                  <span className="text-red-500 text-xs">{errors.prioridad.message}</span>
                )}
              </div>
            </>
          )}
        </div>

        {/* Información adicional */}
        <div className="space-y-4 bg-white rounded-lg p-4 border border-gray-200 shadow-sm">
          <div className="text-base font-semibold text-gray-800 pb-2 border-b">
            Información adicional
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Vendedor responsable *
            </label>
            <select
              {...register("vendedor")}
              className={`w-full border rounded-md px-3 py-2 ${
                errors.vendedor ? "border-red-500" : "border-gray-300"
              }`}
            >
              <option value="">Seleccionar vendedor...</option>
              {vendedores.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
            {errors.vendedor && (
              <span className="text-red-500 text-xs">{errors.vendedor.message}</span>
            )}
          </div>
        </div>
      </div>
      
      <div className="flex gap-3 justify-end">
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
          className="min-w-[160px]"
        >
          {isSubmitting ? "Guardando..." : "Convertir a Venta"}
        </Button>
      </div>
    </form>
  );
}

export default PresupuestoDetalle;

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
