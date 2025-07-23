"use client";
import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { db } from "@/lib/firebase";
import { doc, getDoc, collection, getDocs, updateDoc, setDoc, addDoc } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Printer, Download } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";
import FormularioVentaPresupuesto, { SelectorProductosPresupuesto } from "../../ventas/page";

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
      setClientes(snapClientes.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      const snapProductos = await getDocs(collection(db, "productos"));
      setProductos(snapProductos.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    };
    fetchClientesYProductos();
  }, []);

  // 4. Al activar edición, clonar presupuesto
  useEffect(() => {
    if (editando && presupuesto) setPresupuestoEdit(JSON.parse(JSON.stringify(presupuesto)));
  }, [editando, presupuesto]);

  // 5. Función para actualizar precios
  const handleActualizarPrecios = async () => {
    setLoadingPrecios(true);
    try {
      const nuevosProductos = (presupuestoEdit.productos || presupuestoEdit.items || []).map(item => {
        const prod = productos.find(p => p.id === item.id);
        if (prod) {
          return { ...item, precio: prod.precioUnidad || prod.precioUnidadVenta || prod.precioUnidadHerraje || prod.precioUnidadQuimico || prod.precioUnidadHerramienta };
        }
        return item;
      });
      setPresupuestoEdit(prev => ({ ...prev, productos: nuevosProductos, items: nuevosProductos }));
    } finally {
      setLoadingPrecios(false);
    }
  };

  // 6. Guardar cambios en Firestore
  const handleGuardarCambios = async () => {
    setErrorForm("");
    // Validaciones básicas
    if (!presupuestoEdit.clienteId || !presupuestoEdit.cliente?.nombre) { setErrorForm("Selecciona un cliente válido."); return; }
    if (!presupuestoEdit.productos?.length && !presupuestoEdit.items?.length) { setErrorForm("Agrega al menos un producto."); return; }
    for (const p of (presupuestoEdit.productos || presupuestoEdit.items)) {
      if (!p.cantidad || p.cantidad <= 0) { setErrorForm("Todas las cantidades deben ser mayores a 0."); return; }
      if (p.descuento < 0 || p.descuento > 100) { setErrorForm("El descuento debe ser entre 0 y 100%."); return; }
    }
    // Recalcular totales
    const productosArr = presupuestoEdit.productos || presupuestoEdit.items;
    const subtotal = productosArr.reduce((acc, p) => acc + (Number(p.precio) * Number(p.cantidad)), 0);
    const descuentoTotal = productosArr.reduce((acc, p) => acc + ((Number(p.precio) * Number(p.cantidad)) * (Number(p.descuento || 0) / 100)), 0);
    const iva = (subtotal - descuentoTotal) * 0.21;
    const total = subtotal - descuentoTotal + iva;
    const docRef = doc(db, "presupuestos", presupuestoEdit.id);
    await updateDoc(docRef, {
      ...presupuestoEdit,
      subtotal,
      descuentoTotal,
      iva,
      total,
      productos: productosArr,
      items: productosArr
    });
    setPresupuesto({ ...presupuestoEdit, subtotal, descuentoTotal, iva, total, productos: productosArr, items: productosArr });
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
          <h2 className="text-2xl font-bold text-gray-800 mb-4">Presupuesto no encontrado</h2>
          <p className="text-gray-600 mb-4">
            {error || "El presupuesto que buscas no existe o ha sido eliminado."}
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
            <Button variant="outline" onClick={() => router.push(`/${lang}/presupuestos`)}>
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
      return new Date(dateString).toLocaleDateString('es-AR');
    } catch {
      return dateString;
    }
  };

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
        <div className="flex items-center gap-4 border-b pb-4 mb-6 print-header" style={{marginBottom: 32}}>
          <img src="/logo-maderera.png" alt="Logo Maderera" style={{height: 60, width: 'auto'}} />
          <div>
            <h1 className="text-2xl font-bold text-gray-900" style={{letterSpacing: 1}}>Maderera CJ&D</h1>
            <div className="text-gray-600 text-sm">Presupuesto / Cotización</div>
            <div className="text-gray-500 text-xs">www.madereracjd.com.ar</div>
          </div>
          <div className="ml-auto text-right">
            <div className="text-xs text-gray-500">Fecha: {formatDate(presupuesto?.fecha)}</div>
            <div className="text-xs text-gray-500">N°: {presupuesto?.id?.slice(-8)}</div>
          </div>
        </div>
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6 no-print">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Presupuesto #{presupuesto.id.slice(-8)}</h1>
              <p className="text-gray-600 mt-1">
                {presupuesto.nombre || `Presupuesto ${formatDate(presupuesto.fecha)}`}
              </p>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => router.back()} className="no-print">
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
              <h3 className="font-semibold text-lg mb-3 text-gray-900">Información del Cliente</h3>
              <div className="space-y-2 text-sm">
                <div><span className="font-medium">Nombre:</span> {presupuesto.cliente?.nombre || "-"}</div>
                <div><span className="font-medium">CUIT:</span> {presupuesto.cliente?.cuit || "-"}</div>
                <div><span className="font-medium">Dirección:</span> {presupuesto.cliente?.direccion || "-"}</div>
                <div><span className="font-medium">Teléfono:</span> {presupuesto.cliente?.telefono || "-"}</div>
                <div><span className="font-medium">Email:</span> {presupuesto.cliente?.email || "-"}</div>
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="font-semibold text-lg mb-3 text-gray-900">Información del Presupuesto</h3>
              <div className="space-y-2 text-sm">
                <div><span className="font-medium">Fecha de emisión:</span> {formatDate(presupuesto.fecha)}</div>
                <div><span className="font-medium">Fecha de vencimiento:</span> {formatDate(presupuesto.vencimiento)}</div>
                <div><span className="font-medium">Tipo:</span> {presupuesto.tipo || "Presupuesto"}</div>
                <div><span className="font-medium">Estado:</span> 
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
              setProductosSeleccionados={nuevos => setPresupuestoEdit(prev => ({ ...prev, productos: nuevos, items: nuevos }))}
              productosState={productos}
              categoriasState={[...new Set(productos.map(p => p.categoria))]}
              productosPorCategoria={productos.reduce((acc, p) => { acc[p.categoria] = acc[p.categoria] || []; acc[p.categoria].push(p); return acc; }, {})}
              isSubmitting={loadingPrecios}
              modoSoloProductos={true}
            />
            <div className="flex gap-2 mt-6">
              <Button variant="default" onClick={async () => {
                // Guardar solo productos y totales
                const productosArr = presupuestoEdit.productos || [];
                const subtotal = productosArr.reduce((acc, p) => acc + (Number(p.precio) * Number(p.cantidad)), 0);
                const descuentoTotal = productosArr.reduce((acc, p) => acc + ((Number(p.precio) * Number(p.cantidad)) * (Number(p.descuento || 0) / 100)), 0);
                const iva = (subtotal - descuentoTotal) * 0.21;
                const total = subtotal - descuentoTotal + iva;
                const docRef = doc(db, "presupuestos", presupuestoEdit.id);
                await updateDoc(docRef, {
                  ...presupuestoEdit,
                  subtotal,
                  descuentoTotal,
                  iva,
                  total,
                  productos: productosArr,
                  items: productosArr
                });
                setPresupuesto({ ...presupuestoEdit, subtotal, descuentoTotal, iva, total, productos: productosArr, items: productosArr });
                setEditando(false);
              }} disabled={loadingPrecios}>Guardar productos</Button>
              <Button variant="outline" onClick={() => setEditando(false)} disabled={loadingPrecios}>Cancelar</Button>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
            <h3 className="font-semibold text-lg mb-4 text-gray-900">Productos y Servicios</h3>
            
            {/* Usar productos si existe, sino usar items */}
            {(presupuesto.productos || presupuesto.items) && (
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
                    {(presupuesto.productos || presupuesto.items || []).map((producto, idx) => (
                      <tr key={idx} className="border-b hover:bg-gray-50">
                        <td className="p-3 font-medium">
                          {producto.descripcion || producto.nombre || "Producto sin nombre"}
                        </td>
                        <td className="p-3 text-center">{producto.cantidad || 0}</td>
                        <td className="p-3 text-center">{producto.unidad || "-"}</td>
                        <td className="p-3 text-right">${(producto.precio || 0).toFixed(2)}</td>
                        <td className="p-3 text-right">${(producto.descuento || 0).toFixed(2)}</td>
                        <td className="p-3 text-right font-medium">
                          ${((producto.precio || 0) * (producto.cantidad || 0) - (producto.descuento || 0) * (producto.cantidad || 0)).toFixed(2)}
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
                    <span>${(presupuesto.subtotal || 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Descuento total:</span>
                    <span>${(presupuesto.descuentoTotal || 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>IVA (21%):</span>
                    <span>${(presupuesto.iva || 0).toFixed(2)}</span>
                  </div>
                  <div className="border-t pt-2 flex justify-between font-bold text-lg">
                    <span>Total:</span>
                    <span className="text-primary">${(presupuesto.total || 0).toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Observaciones */}
        {presupuesto.observaciones && (
          <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
            <h3 className="font-semibold text-lg mb-3 text-gray-900">Observaciones</h3>
            <p className="text-gray-700 whitespace-pre-wrap">{presupuesto.observaciones}</p>
          </div>
        )}

        {/* Información adicional */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h3 className="font-semibold text-lg mb-3 text-gray-900">Información Adicional</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div><span className="font-medium">ID del documento:</span> {presupuesto.id}</div>
            <div><span className="font-medium">Fecha de creación:</span> {formatDate(presupuesto.fechaCreacion)}</div>
            <div><span className="font-medium">Cliente ID:</span> {presupuesto.clienteId || "-"}</div>
            <div><span className="font-medium">Cantidad de productos:</span> {(presupuesto.productos || presupuesto.items || []).length}</div>
          </div>
        </div>

        {/* Botones de acción */}
        <div className="flex gap-3 mt-4">
          {!editando && <Button onClick={() => setEditando(true)}>Editar</Button>}
          {editando && <Button onClick={handleGuardarCambios} disabled={loadingPrecios}>Guardar cambios</Button>}
          {editando && <Button onClick={handleActualizarPrecios} disabled={loadingPrecios}>{loadingPrecios ? "Actualizando..." : "Actualizar precios"}</Button>}
          <Button onClick={() => setConvirtiendoVenta(true)}>Convertir a Venta</Button>
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
                  const docRef = await addDoc(collection(db, "ventas"), ventaData);
                  for (const prod of presupuesto.productos || presupuesto.items) {
                    const productoRef = doc(db, "productos", prod.id);
                    const productoSnap = await getDocs(collection(db, "productos"));
                    const existe = productoSnap.docs.find(d => d.id === prod.id);
                    if (!existe) {
                      alert(`El producto con ID ${prod.id} no existe en el catálogo. No se puede descontar stock ni registrar movimiento.`);
                      return;
                    }
                    await updateDoc(productoRef, {
                      stock: increment(-Math.abs(prod.cantidad))
                    });
                    await addDoc(collection(db, "movimientos"), {
                      productoId: prod.id,
                      tipo: "salida",
                      cantidad: prod.cantidad,
                      usuario: "Sistema",
                      fecha: serverTimestamp(),
                      referencia: "venta",
                      referenciaId: docRef.id,
                      observaciones: `Salida por venta (${presupuesto.cliente?.nombre || ''})`,
                      productoNombre: prod.nombre,
                    });
                  }
                  if (ventaCampos.tipoEnvio && ventaCampos.tipoEnvio !== "retiro_local") {
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
                      cantidadTotal: (presupuesto.productos || presupuesto.items).reduce((acc, p) => acc + p.cantidad, 0),
                      historialEstados: [
                        {
                          estado: "pendiente",
                          fecha: new Date().toISOString(),
                          comentario: "Envío creado automáticamente desde la venta"
                        }
                      ],
                      observaciones: ventaCampos.observaciones,
                      instruccionesEspeciales: "",
                      fechaActualizacion: new Date().toISOString(),
                      creadoPor: "sistema",
                    };
                    const cleanEnvioData = Object.fromEntries(
                      Object.entries(envioData).filter(([_, v]) => v !== undefined)
                    );
                    await addDoc(collection(db, "envios"), cleanEnvioData);
                  }
                  setConvirtiendoVenta(false);
                  router.push(`/${lang}/ventas/${docRef.id}`);
                } catch (error) {
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
                    const docRef = await addDoc(collection(db, "ventas"), formData);
                    // Descontar stock y registrar movimiento de cada producto vendido
                    for (const prod of formData.productos) {
                      const productoRef = doc(db, "productos", prod.id);
                      const productoSnap = await getDocs(collection(db, "productos"));
                      const existe = productoSnap.docs.find(d => d.id === prod.id);
                      if (!existe) {
                        alert(`El producto con ID ${prod.id} no existe en el catálogo. No se puede descontar stock ni registrar movimiento.`);
                        return;
                      }
                      await updateDoc(productoRef, {
                        stock: increment(-Math.abs(prod.cantidad))
                      });
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
                        cantidadTotal: formData.productos.reduce((acc, p) => acc + p.cantidad, 0),
                        historialEstados: [
                          {
                            estado: "pendiente",
                            fecha: new Date().toISOString(),
                            comentario: "Envío creado automáticamente desde la venta"
                          }
                        ],
                        observaciones: formData.observaciones,
                        instruccionesEspeciales: "",
                        fechaActualizacion: new Date().toISOString(),
                        creadoPor: "sistema",
                      };
                      const cleanEnvioData = Object.fromEntries(
                        Object.entries(envioData).filter(([_, v]) => v !== undefined)
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
                  productos: presupuestoEdit?.productos || presupuestoEdit?.items || [],
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
      </div>
    </div>
  );
};

// Nuevo formulario minimalista para conversión a venta
function FormularioConvertirVenta({ presupuesto, onCancel, onSubmit }) {
  const schema = yup.object().shape({
    formaPago: yup.string().required("Selecciona la forma de pago"),
    pagoParcial: yup.boolean(),
    montoAbonado: yup.number()
      .when("pagoParcial", {
        is: true,
        then: s => s.min(1, "Debe ingresar un monto").required("Obligatorio"),
        otherwise: s => s.notRequired()
      }),
    observaciones: yup.string().notRequired(),
    tipoEnvio: yup.string().required("Selecciona el tipo de envío"),
    transportista: yup.string().when("tipoEnvio", {
      is: val => val && val !== "retiro_local",
      then: s => s.required("Selecciona el transportista"),
      otherwise: s => s.notRequired()
    }),
    costoEnvio: yup.number().notRequired(),
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
    usarDireccionCliente: yup.boolean(),
    direccionEnvio: yup.string().notRequired(),
    localidadEnvio: yup.string().notRequired(),
    codigoPostal: yup.string().notRequired(),
    vendedor: yup.string().required("Selecciona el vendedor"),
    prioridad: yup.string().required("Selecciona la prioridad"),
  });
  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm({
    resolver: yupResolver(schema),
    defaultValues: {
      formaPago: "",
      pagoParcial: false,
      montoAbonado: "",
      observaciones: "",
      tipoEnvio: "",
      transportista: "",
      costoEnvio: "",
      fechaEntrega: "",
      rangoHorario: "",
      usarDireccionCliente: true,
      direccionEnvio: "",
      localidadEnvio: "",
      codigoPostal: "",
      vendedor: "",
      prioridad: "",
    }
  });
  const transportistas = ["camion", "camioneta 1", "camioneta 2"];
  const vendedores = ["coco", "damian", "lauti", "jose"];
  const prioridades = ["alta", "media", "baja"];
  const tipoEnvioSeleccionado = watch("tipoEnvio");
  const usarDireccionCliente = watch("usarDireccionCliente");
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Condiciones de pago y entrega */}
        <div className="space-y-2 bg-white rounded-lg p-4 border border-default-200 shadow-sm">
          <div className="text-base font-semibold text-default-800 pb-1">Condiciones de pago y entrega</div>
          <select {...register("formaPago")} className="border rounded px-2 py-2 w-full">
            <option value="">Forma de pago...</option>
            <option value="efectivo">Efectivo</option>
            <option value="transferencia">Transferencia</option>
            <option value="tarjeta">Tarjeta</option>
            <option value="cheque">Cheque</option>
            <option value="otro">Otro</option>
          </select>
          {errors.formaPago && <span className="text-red-500 text-xs">{errors.formaPago.message}</span>}
          <div className="flex items-center gap-2 mt-2">
            <input type="checkbox" id="pagoParcial" {...register("pagoParcial")} />
            <label htmlFor="pagoParcial" className="text-sm">¿Pago parcial?</label>
          </div>
          {watch("pagoParcial") && (
            <Input type="number" min={0} placeholder="Monto abonado" {...register("montoAbonado")} className="w-full" />
          )}
          <Textarea {...register("observaciones")} placeholder="Observaciones adicionales" className="w-full" />
        </div>
        {/* Información de envío */}
        <div className="space-y-2 bg-white rounded-lg p-4 border border-default-200 shadow-sm">
          <div className="text-base font-semibold text-default-800 pb-1">Información de envío</div>
          <select {...register("tipoEnvio")} className="border rounded px-2 py-2 w-full">
            <option value="">Tipo de envío...</option>
            <option value="retiro_local">Retiro en local</option>
            <option value="envio_domicilio">Envío a domicilio</option>
            <option value="envio_obra">Envío a obra</option>
            <option value="transporte_propio">Transporte propio del cliente</option>
          </select>
          {errors.tipoEnvio && <span className="text-red-500 text-xs">{errors.tipoEnvio.message}</span>}
          {tipoEnvioSeleccionado !== "retiro_local" && (
            <>
              <div className="flex items-center gap-2 mb-2">
                <input type="checkbox" checked={usarDireccionCliente} onChange={e => setValue("usarDireccionCliente", e.target.checked)} id="usarDireccionCliente" />
                <label htmlFor="usarDireccionCliente" className="text-sm">Usar dirección del cliente</label>
              </div>
              {!usarDireccionCliente && (
                <>
                  <Input {...register("direccionEnvio")} placeholder="Dirección de envío" className="w-full" />
                  <Input {...register("localidadEnvio")} placeholder="Localidad/Ciudad" className="w-full" />
                  <Input {...register("codigoPostal")} placeholder="Código postal" className="w-full" />
                </>
              )}
              {usarDireccionCliente && presupuesto.cliente && (
                <>
                  <Input value={presupuesto.cliente.direccion || ""} readOnly className="w-full" />
                  <Input value={presupuesto.cliente.localidad || ""} readOnly className="w-full" />
                  <Input value={presupuesto.cliente.codigoPostal || ""} readOnly className="w-full" />
                </>
              )}
              <select {...register("transportista")} className="border rounded px-2 py-2 w-full">
                <option value="">Transportista...</option>
                {transportistas.map(t => <option key={t}>{t}</option>)}
              </select>
              <Input {...register("costoEnvio")} placeholder="Costo de envío" type="number" className="w-full" />
              <Input {...register("fechaEntrega")} placeholder="Fecha de entrega" type="date" className="w-full" />
              <Input {...register("rangoHorario")} placeholder="Rango horario (ej: 8-12, 14-18)" className="w-full" />
            </>
          )}
        </div>
        {/* Información adicional */}
        <div className="space-y-2 bg-white rounded-lg p-4 border border-default-200 shadow-sm">
          <div className="text-base font-semibold text-default-800 pb-1">Información adicional</div>
          <select {...register("vendedor")} className="border rounded px-2 py-2 w-full">
            <option value="">Vendedor responsable...</option>
            {vendedores.map(v => <option key={v}>{v}</option>)}
          </select>
          {errors.vendedor && <span className="text-red-500 text-xs">{errors.vendedor.message}</span>}
          <select {...register("prioridad")} className="border rounded px-2 py-2 w-full">
            <option value="">Prioridad...</option>
            {prioridades.map(p => <option key={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
          </select>
          {errors.prioridad && <span className="text-red-500 text-xs">{errors.prioridad.message}</span>}
          <Textarea {...register("observaciones")} placeholder="Observaciones adicionales" className="w-full" />
        </div>
      </div>
      <div className="flex gap-2 mt-6">
        <Button variant="default" type="submit">Guardar venta</Button>
        <Button variant="outline" type="button" onClick={onCancel}>Cancelar</Button>
      </div>
    </form>
  );
}

export default PresupuestoDetalle; 