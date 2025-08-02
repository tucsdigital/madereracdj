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

// Función para calcular fecha de vencimiento (7 días después de la emisión)
function calcularFechaVencimiento(fechaEmision) {
  if (!fechaEmision) return null;

  const fecha = new Date(fechaEmision);
  fecha.setDate(fecha.getDate() + 7); // Agregar 7 días

  return fecha.toISOString().split("T")[0]; // Formato YYYY-MM-DD
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
  // Eliminar el estado global de cepillado automático
  // const [cepilladoAutomatico, setCepilladoAutomatico] = useState(false);

  // Estado para conversión a venta
  const [convirtiendoVenta, setConvirtiendoVenta] = useState(false);

  // Estados para filtros de productos
  const [categoriaId, setCategoriaId] = useState("");
  const [busquedaProducto, setBusquedaProducto] = useState("");
  const [filtroTipoMadera, setFiltroTipoMadera] = useState("");
  const [filtroSubCategoria, setFiltroSubCategoria] = useState("");

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
    esClienteViejo: false, // Nuevo campo para diferenciar
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
      const productosData = snapProductos.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      console.log("=== DEBUG PRESUPUESTO CARGA PRODUCTOS ===");
      console.log("Productos cargados:", productosData);
      console.log("Cantidad de productos:", productosData.length);
      setProductos(productosData);
    };
    fetchClientesYProductos();
  }, []);

  // 4. Al activar edición, clonar presupuesto
  useEffect(() => {
    console.log("=== DEBUG USEEFFECT EDICIÓN PRESUPUESTO ===");
    console.log("editando:", editando);
    console.log("presupuesto:", presupuesto);
    if (editando && presupuesto) {
      console.log("Clonando presupuesto para edición");
      const presupuestoClonado = JSON.parse(JSON.stringify(presupuesto));
      // Asegurar que clienteId y cliente estén presentes
      if (!presupuestoClonado.clienteId && presupuestoClonado.cliente?.cuit) {
        presupuestoClonado.clienteId = presupuestoClonado.cliente.cuit;
      }
      if (!presupuestoClonado.cliente && presupuestoClonado.clienteId) {
        const clienteObj = clientes.find(
          (c) =>
            c.id === presupuestoClonado.clienteId ||
            c.cuit === presupuestoClonado.clienteId
        );
        if (clienteObj) presupuestoClonado.cliente = clienteObj;
      }

      // Enriquecer productos con información de la base de datos
      if (presupuestoClonado.productos && productos.length > 0) {
        presupuestoClonado.productos = presupuestoClonado.productos.map(
          (productoPresupuesto) => {
            const productoDB = productos.find(
              (p) => p.id === productoPresupuesto.id
            );
            if (productoDB) {
              return {
                ...productoPresupuesto,
                // Preservar campos específicos de categoría
                tipoMadera:
                  productoDB.tipoMadera || productoPresupuesto.tipoMadera || "",
                subCategoria:
                  productoDB.subCategoria ||
                  productoPresupuesto.subCategoria ||
                  "",
                // Actualizar dimensiones para maderas si no están presentes
                alto: Number(productoDB.alto) || productoPresupuesto.alto || 0,
                ancho:
                  Number(productoDB.ancho) || productoPresupuesto.ancho || 0,
                largo:
                  Number(productoDB.largo) || productoPresupuesto.largo || 0,
                precioPorPie:
                  Number(productoDB.precioPorPie) ||
                  productoPresupuesto.precioPorPie ||
                  0,
              };
            }
            return productoPresupuesto;
          }
        );
      }

      console.log("presupuestoClonado:", presupuestoClonado);
      setPresupuestoEdit(presupuestoClonado);
    }
  }, [editando, presupuesto, clientes, productos]);

  // 5. Función para actualizar precios
  const handleActualizarPrecios = async () => {
    setLoadingPrecios(true);
    try {
      // Obtener productos actualizados desde Firebase
      const productosSnap = await getDocs(collection(db, "productos"));
      const productosActualizados = productosSnap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      // Actualizar precios de productos en presupuestoEdit
      const productosConPreciosActualizados = (
        presupuestoEdit.productos || []
      ).map((productoPresupuesto) => {
        const productoActualizado = productosActualizados.find(
          (p) => p.id === productoPresupuesto.id
        );
        if (productoActualizado) {
          let nuevoPrecio = 0;
          if (productoActualizado.categoria === "Maderas") {
            // Calcular precio para maderas
            const alto = Number(productoActualizado.alto) || 0;
            const ancho = Number(productoActualizado.ancho) || 0;
            const largo = Number(productoActualizado.largo) || 0;
            const precioPorPie = Number(productoActualizado.precioPorPie) || 0;

            if (alto > 0 && ancho > 0 && largo > 0 && precioPorPie > 0) {
              nuevoPrecio = 0.2734 * alto * ancho * largo * precioPorPie;
              nuevoPrecio = Math.round(nuevoPrecio * 100) / 100;
            }
          } else if (productoActualizado.categoria === "Ferretería") {
            nuevoPrecio = productoActualizado.valorVenta || 0;
          } else {
            nuevoPrecio =
              productoActualizado.precioUnidad ||
              productoActualizado.precioUnidadVenta ||
              productoActualizado.precioUnidadHerraje ||
              productoActualizado.precioUnidadQuimico ||
              productoActualizado.precioUnidadHerramienta ||
              0;
          }

          return {
            ...productoPresupuesto,
            precio: nuevoPrecio,
            // Preservar campos específicos de categoría
            tipoMadera:
              productoActualizado.tipoMadera ||
              productoPresupuesto.tipoMadera ||
              "",
            subCategoria:
              productoActualizado.subCategoria ||
              productoPresupuesto.subCategoria ||
              "",
            // Actualizar dimensiones para maderas
            alto:
              Number(productoActualizado.alto) || productoPresupuesto.alto || 0,
            ancho:
              Number(productoActualizado.ancho) ||
              productoPresupuesto.ancho ||
              0,
            largo:
              Number(productoActualizado.largo) ||
              productoPresupuesto.largo ||
              0,
            precioPorPie:
              Number(productoActualizado.precioPorPie) ||
              productoPresupuesto.precioPorPie ||
              0,
          };
        }
        return productoPresupuesto;
      });

      setPresupuestoEdit((prev) => ({
        ...prev,
        productos: productosConPreciosActualizados,
      }));

      setProductos(productosActualizados);
    } catch (error) {
      console.error("Error al actualizar precios:", error);
    } finally {
      setLoadingPrecios(false);
    }
  };

  // Función para recalcular precios de productos de madera cuando cambia el checkbox de cepillado
  const recalcularPreciosMadera = (productoId, aplicarCepillado) => {
    setPresupuestoEdit((prev) => ({
      ...prev,
      productos: (prev.productos || []).map((p) => {
        if (p.id === productoId && p.categoria === "Maderas") {
          // Recalcular precio base sin cepillado
          const precioBase =
            0.2734 * p.alto * p.ancho * p.largo * p.precioPorPie;

          // Aplicar cepillado si está habilitado
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
      }),
    }));
  };

  // Función para recalcular precio cuando se cambia el precio por pie
  const handlePrecioPorPieChange = (id, nuevoPrecioPorPie) => {
    setPresupuestoEdit((prev) => ({
      ...prev,
      productos: (prev.productos || []).map((p) => {
        if (p.id === id && p.categoria === "Maderas") {
          // Recalcular precio base con el nuevo precio por pie
          const precioBase =
            0.2734 * p.alto * p.ancho * p.largo * Number(nuevoPrecioPorPie);

          // Aplicar cepillado si está habilitado para este producto específico
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
      }),
    }));
  };

  // Función para formatear números en formato argentino
  const formatearNumeroArgentino = (numero) => {
    if (numero === null || numero === undefined || isNaN(numero)) return "0";
    return Number(numero).toLocaleString("es-AR");
  };

  // Obtener tipos de madera únicos
  const tiposMadera = [
    ...new Set(
      productos
        .filter((p) => p.categoria === "Maderas" && p.tipoMadera)
        .map((p) => p.tipoMadera)
    ),
  ].filter(Boolean);

  // Obtener subcategorías de ferretería únicas
  const subCategoriasFerreteria = [
    ...new Set(
      productos
        .filter((p) => p.categoria === "Ferretería" && p.subCategoria)
        .map((p) => p.subCategoria)
    ),
  ].filter(Boolean);

  // 6. Guardar cambios en Firestore
  const handleGuardarCambios = async () => {
    setErrorForm("");
    // Validaciones mejoradas de cliente
    if (
      !presupuestoEdit.cliente ||
      !presupuestoEdit.cliente.nombre ||
      presupuestoEdit.cliente.nombre.trim() === ""
    ) {
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
      const costoEnvioCalculado =
        presupuestoEdit.tipoEnvio &&
        presupuestoEdit.tipoEnvio !== "retiro_local" &&
        presupuestoEdit.costoEnvio !== undefined &&
        presupuestoEdit.costoEnvio !== "" &&
        !isNaN(Number(presupuestoEdit.costoEnvio))
          ? Number(presupuestoEdit.costoEnvio)
          : 0;
      const total = subtotal - descuentoTotal + costoEnvioCalculado;
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
        costoEnvio: costoEnvioCalculado, // Agregar el costo de envío actualizado
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
        costoEnvio: costoEnvioCalculado, // Agregar el costo de envío actualizado
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
      const clienteObj = {
        ...nuevoCliente,
        esClienteViejo: nuevoCliente.esClienteViejo || false,
      };
      const docRef = await addDoc(collection(db, "clientes"), clienteObj);
      setClientes((prev) => [...prev, { id: docRef.id, ...clienteObj }]);
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
        esClienteViejo: false,
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

  // Función para obtener información completa del producto desde la base de datos
  const getProductoCompleto = (productoId) => {
    return productos.find((p) => p.id === productoId);
  };

  return (
    <div className="min-h-screen py-8">
      <style>{`
        @media print {
          @page { 
            margin: 20px !important; 
            size: A4;
          }
          body { 
            margin: 0 !important; 
            padding: 0 !important; 
          }
          body * { visibility: hidden !important; }
          #presupuesto-print, #presupuesto-print * { visibility: visible !important; }
          #presupuesto-print .no-print, #presupuesto-print .no-print * { display: none !important; }
          #presupuesto-print {
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
            background: white !important;
          }
          /* Layout de 2 columnas para impresión */
          #presupuesto-print .grid { 
            display: grid !important;
            grid-template-columns: 1fr 1fr !important;
            gap: 20px !important;
            margin-bottom: 20px !important;
          }
          #presupuesto-print .bg-card {
            background: #f9fafb !important;
            padding: 15px !important;
            border-radius: 8px !important;
          }
          /* Reducir tamaños de fuente para que quepa todo */
          #presupuesto-print h3 {
            font-size: 14px !important;
            margin-bottom: 8px !important;
          }
          #presupuesto-print .text-sm {
            font-size: 11px !important;
          }
          #presupuesto-print .space-y-2 > div {
            margin-bottom: 4px !important;
          }
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
            <h1 className="text-2xl font-bold " style={{ letterSpacing: 1 }}>
              Maderera Caballero
            </h1>
            <div className="text-gray-600 text-sm">
              Presupuesto / Cotización
            </div>
            <div className="text-gray-500 text-xs">
              www.caballeromaderera.com
            </div>
          </div>
          {/* Header profesional: solo mostrar número de pedido */}
          <div className="ml-auto text-right">
            <div className="text-xs text-gray-500">
              Fecha:{" "}
              {presupuesto?.fecha ? formatFechaLocal(presupuesto.fecha) : "-"}
            </div>
            <div className="text-xs text-gray-500">
              Válido hasta:{" "}
              {presupuesto?.fecha
                ? formatFechaLocal(calcularFechaVencimiento(presupuesto.fecha))
                : "-"}
            </div>
            <div className="text-xs text-gray-500">
              N°: {presupuesto?.numeroPedido || presupuesto?.id?.slice(-8)}
            </div>
          </div>
        </div>
        {/* Header */}
        <div className="bg-card rounded-lg shadow-sm p-6 mb-6 no-print">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-6">
            <div className="flex-1">
              <h1 className="text-2xl lg:text-3xl font-bold">
                N°: {presupuesto?.numeroPedido || presupuesto?.id?.slice(-8)}
              </h1>
              {/* Mostrar observaciones si existen */}
              {presupuesto.observaciones && (
                <p className="text-gray-600 mt-1 whitespace-pre-line">
                  {presupuesto.observaciones}
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2 lg:gap-3 w-full lg:w-auto">
              <Button
                variant="outline"
                onClick={() => router.back()}
                className="no-print flex-1 lg:flex-none text-sm lg:text-base"
              >
                <ArrowLeft className="w-4 h-4 mr-1 lg:mr-2" />
                <span className="hidden sm:inline">Volver</span>
              </Button>
              <Button
                onClick={handlePrint}
                className="no-print flex-1 lg:flex-none text-sm lg:text-base"
              >
                <span className="hidden sm:inline">Imprimir</span>
                <span className="sm:hidden">🖨️</span>
              </Button>
              {!editando && !convirtiendoVenta && (
                <Button
                  onClick={() => {
                    console.log("=== DEBUG ACTIVAR EDICIÓN PRESUPUESTO ===");
                    console.log("editando antes:", editando);
                    setEditando(true);
                    console.log("editando después: true");
                  }}
                  className="no-print flex-1 lg:flex-none text-sm lg:text-base"
                >
                  <span className="hidden sm:inline">Editar</span>
                  <span className="sm:hidden">✏️</span>
                </Button>
              )}
              {!editando && !convirtiendoVenta && (
                <Button
                  onClick={() => setConvirtiendoVenta(true)}
                  className="no-print flex-1 lg:flex-none text-sm lg:text-base"
                >
                  <span className="hidden sm:inline">Convertir a Venta</span>
                  <span className="sm:hidden">💰</span>
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* 1. Información del cliente y venta */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div className="bg-card rounded-lg shadow-sm p-6 mb-6 flex flex-col gap-4">
            <h3 className="font-semibold text-lg mb-3 ">
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

          <div className="bg-card rounded-lg shadow-sm p-6 mb-6 flex flex-col gap-4">
            <h3 className="font-semibold text-lg mb-3 ">
              Información del Presupuesto
            </h3>
            <div className="space-y-2 text-sm">
              <div>
                <span className="font-medium">Fecha de emisión:</span>{" "}
                {presupuesto.fecha ? formatFechaLocal(presupuesto.fecha) : "-"}
              </div>
              <div>
                <span className="font-medium">Fecha de vencimiento:</span>{" "}
                {presupuesto.fecha
                  ? formatFechaLocal(
                      calcularFechaVencimiento(presupuesto.fecha)
                    )
                  : "-"}
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

        {/* Productos */}
        {editando && presupuestoEdit ? (
          <div className="bg-card rounded-lg shadow-sm p-6 mb-6">
            <h3 className="font-semibold text-lg mb-4 ">Editar Presupuesto</h3>

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
                        // Si se selecciona retiro local, limpiar costo de envío
                        costoEnvio:
                          e.target.value === "retiro_local"
                            ? ""
                            : presupuestoEdit.costoEnvio,
                      })
                    }
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                  >
                    <option value="">Seleccionar tipo de envío...</option>
                    <option value="retiro_local">Retiro en local</option>
                    <option value="envio_domicilio">Envío a domicilio</option>
                  </select>
                </div>
                {presupuestoEdit.tipoEnvio &&
                  presupuestoEdit.tipoEnvio !== "retiro_local" && (
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
            {editando && presupuestoEdit && (
              <div className="bg-card rounded-lg shadow-sm p-6 mb-6">
                <h3 className="font-semibold text-lg mb-4 ">
                  Editar productos del presupuesto
                </h3>
                <section className="bg-card rounded-xl border border-default-200 shadow-sm overflow-hidden">
                  {/* Header con estadísticas */}
                  <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-6 py-4 border-b border-gray-200">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                          <svg
                            className="w-6 h-6 text-blue-600"
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
                          <h3 className="text-lg font-semibold ">Productos</h3>
                          <p className="text-sm text-gray-600">
                            Selecciona los productos para tu presupuesto
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold text-blue-600">
                          {(presupuestoEdit.productos || []).length}
                        </div>
                        <div className="text-xs text-gray-500">
                          productos agregados
                        </div>
                      </div>
                    </div>
                    {/* Filtros mejorados */}
                    <div className="flex flex-col gap-3">
                      {/* Filtro de categorías */}
                      <div className="flex-1">
                        <div className="flex bg-card rounded-lg p-1 shadow-sm border border-gray-200">
                          {Array.from(
                            new Set(productos.map((p) => p.categoria))
                          ).map((categoria) => (
                            <button
                              key={categoria}
                              type="button"
                              className={`rounded-full px-4 py-1 text-sm flex items-center gap-2 transition-all ${
                                categoriaId === categoria
                                  ? "bg-blue-600 text-white"
                                  : "bg-gray-100 text-gray-700"
                              }`}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                console.log("=== DEBUG CLICK CATEGORÍA ===");
                                console.log("categoriaId actual:", categoriaId);
                                console.log("categoria clickeada:", categoria);
                                if (categoriaId === categoria) {
                                  console.log("Desactivando categoría");
                                  setCategoriaId("");
                                  setFiltroTipoMadera("");
                                  setFiltroSubCategoria("");
                                } else {
                                  console.log(
                                    "Activando categoría:",
                                    categoria
                                  );
                                  setCategoriaId(categoria);
                                  setFiltroTipoMadera("");
                                  setFiltroSubCategoria("");
                                }
                              }}
                            >
                              {categoria}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Filtros específicos por categoría */}
                      <div className="flex flex-col sm:flex-row gap-3">
                        {/* Filtro de tipo de madera */}
                        {categoriaId === "Maderas" &&
                          tiposMadera.length > 0 && (
                            <div className="flex-1">
                              <div className="flex bg-card rounded-lg p-1 shadow-sm border border-gray-200">
                                <button
                                  type="button"
                                  className={`rounded-full px-4 py-1 text-sm flex items-center gap-2 transition-all ${
                                    filtroTipoMadera === ""
                                      ? "bg-orange-600 text-white"
                                      : "bg-gray-100 text-gray-700"
                                  }`}
                                  onClick={() => setFiltroTipoMadera("")}
                                >
                                  Todos los tipos
                                </button>
                                {tiposMadera.map((tipo) => (
                                  <button
                                    key={tipo}
                                    type="button"
                                    className={`rounded-md px-4 py-1 text-sm flex items-center gap-2 transition-all ${
                                      filtroTipoMadera === tipo
                                        ? "bg-orange-600 text-white"
                                        : "bg-gray-100 text-gray-700"
                                    }`}
                                    onClick={() => setFiltroTipoMadera(tipo)}
                                  >
                                    {tipo}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}

                        {/* Filtro de subcategoría de ferretería */}
                        {categoriaId === "Ferretería" &&
                          subCategoriasFerreteria.length > 0 && (
                            <div className="flex-1">
                              <div className="flex bg-card rounded-lg p-1 shadow-sm border border-gray-200">
                                <button
                                  type="button"
                                  className={`rounded-md px-4 py-1 text-sm flex items-center gap-2 transition-all ${
                                    filtroSubCategoria === ""
                                      ? "bg-blue-600 text-white"
                                      : "bg-gray-100 text-gray-700"
                                  }`}
                                  onClick={() => setFiltroSubCategoria("")}
                                >
                                  🔧 Todas las subcategorías
                                </button>
                                {subCategoriasFerreteria.map((subCategoria) => (
                                  <button
                                    key={subCategoria}
                                    type="button"
                                    className={`rounded-full px-4 py-1 text-sm flex items-center gap-2 transition-all ${
                                      filtroSubCategoria === subCategoria
                                        ? "bg-blue-600 text-white"
                                        : "bg-gray-100 text-gray-700"
                                    }`}
                                    onClick={() =>
                                      setFiltroSubCategoria(subCategoria)
                                    }
                                  >
                                    🔧 {subCategoria}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}

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
                            onChange={(e) =>
                              setBusquedaProducto(e.target.value)
                            }
                            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 bg-card"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Lista de productos mejorada */}
                  <div className="max-h-96 overflow-y-auto">
                    {(() => {
                      console.log(
                        "=== DEBUG PRESUPUESTO FILTRADO PRODUCTOS ==="
                      );
                      console.log("productos:", productos);
                      console.log("categoriaId:", categoriaId);
                      console.log("busquedaProducto:", busquedaProducto);
                      console.log("filtroTipoMadera:", filtroTipoMadera);
                      console.log("filtroSubCategoria:", filtroSubCategoria);

                      const productosPorCategoria = {};
                      productos.forEach((p) => {
                        if (!productosPorCategoria[p.categoria])
                          productosPorCategoria[p.categoria] = [];
                        productosPorCategoria[p.categoria].push(p);
                      });

                      console.log(
                        "productosPorCategoria:",
                        productosPorCategoria
                      );
                      console.log(
                        "productosPorCategoria[categoriaId]:",
                        productosPorCategoria[categoriaId]
                      );

                      if (!categoriaId) {
                        return (
                          <div className="p-8 text-center">
                            <div className="w-16 h-16 mx-auto mb-4 bg-blue-100 rounded-full flex items-center justify-center">
                              <svg
                                className="w-8 h-8 text-blue-600"
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
                            <h3 className="text-lg font-medium  mb-2">
                              Selecciona una categoría
                            </h3>
                            <p className="text-gray-500">
                              Elige una categoría para ver los productos
                              disponibles
                            </p>
                          </div>
                        );
                      }
                      const productosFiltrados =
                        productosPorCategoria[categoriaId]?.filter((prod) => {
                          // Filtro por búsqueda de texto
                          const cumpleBusqueda =
                            prod.nombre
                              .toLowerCase()
                              .includes(busquedaProducto.toLowerCase()) ||
                            (prod.unidadMedida || "")
                              .toLowerCase()
                              .includes(busquedaProducto.toLowerCase());

                          // Filtro específico por tipo de madera
                          const cumpleTipoMadera =
                            categoriaId !== "Maderas" ||
                            filtroTipoMadera === "" ||
                            prod.tipoMadera === filtroTipoMadera;

                          // Filtro específico por subcategoría de ferretería
                          const cumpleSubCategoria =
                            categoriaId !== "Ferretería" ||
                            filtroSubCategoria === "" ||
                            prod.subCategoria === filtroSubCategoria;

                          return (
                            cumpleBusqueda &&
                            cumpleTipoMadera &&
                            cumpleSubCategoria
                          );
                        }) || [];

                      console.log("productosFiltrados:", productosFiltrados);

                      if (productosFiltrados.length === 0) {
                        return (
                          <div className="p-8 text-center">
                            <div className="w-16 h-16 mx-auto mb-4 bg-yellow-100 rounded-full flex items-center justify-center">
                              <svg
                                className="w-8 h-8 text-yellow-600"
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
                            <h3 className="text-lg font-medium  mb-2">
                              No se encontraron productos
                            </h3>
                            <p className="text-gray-500">
                              Intenta cambiar los filtros o la búsqueda
                            </p>
                          </div>
                        );
                      }
                      return (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4">
                          {productosFiltrados.map((prod) => {
                            const yaAgregado = (
                              presupuestoEdit.productos || []
                            ).some((p) => p.id === prod.id);
                            return (
                              <div
                                key={prod.id}
                                className={`group relative bg-card rounded-lg border-2 transition-all duration-200 hover:shadow-md h-full flex flex-col ${
                                  yaAgregado
                                    ? "border-green-200 bg-green-50"
                                    : "border-gray-200 hover:border-blue-300"
                                }`}
                              >
                                <div className="p-4 flex flex-col h-full">
                                  <div className="flex items-start justify-between mb-3">
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-3 mb-2">
                                        <div
                                          className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                                            prod.categoria === "Maderas"
                                              ? "bg-orange-100 text-orange-700"
                                              : "bg-blue-100 text-blue-700"
                                          }`}
                                        >
                                          {prod.categoria === "Maderas"
                                            ? "🌲"
                                            : "🔧"}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                          <h4 className="text-sm font-semibold  truncate">
                                            {prod.nombre}
                                          </h4>
                                          {/* Información específica por categoría */}
                                          {prod.categoria === "Maderas" &&
                                            prod.tipoMadera && (
                                              <div className="flex items-center gap-1 mt-1">
                                                <span className="text-xs text-orange-600 font-medium">
                                                  🌲 {prod.tipoMadera}
                                                </span>
                                              </div>
                                            )}
                                          {prod.categoria === "Ferretería" &&
                                            prod.subCategoria && (
                                              <div className="flex items-center gap-1 mt-1">
                                                <span className="text-xs text-blue-600 font-medium">
                                                  🔧 {prod.subCategoria}
                                                </span>
                                              </div>
                                            )}
                                        </div>
                                        {yaAgregado && (
                                          <div className="flex items-center gap-1 text-green-600">
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
                                      <div className="grid grid-cols-2 gap-3 text-xs text-gray-600 mb-3">
                                        <div>
                                          <span className="font-medium">
                                            Precio:
                                          </span>
                                          <span className="ml-1 font-bold text-blue-600">
                                            $
                                            {formatearNumeroArgentino(
                                              prod.precioPorPie ||
                                                prod.valorVenta ||
                                                prod.precioUnidad ||
                                                0
                                            )}
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
                                                ? "text-green-600"
                                                : prod.stock > 0
                                                ? "text-yellow-600"
                                                : "text-red-600"
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
                                            <span className="ml-1 font-bold text-orange-600">
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
                                            </span>
                                            <span>
                                              Ancho:{" "}
                                              <span className="font-bold">
                                                {prod.ancho || 0}
                                              </span>{" "}
                                            </span>
                                            <span>
                                              Largo:{" "}
                                              <span className="font-bold">
                                                {prod.largo || 0}
                                              </span>{" "}
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
                                            setPresupuestoEdit((prev) => ({
                                              ...prev,
                                              productos: prev.productos.map(
                                                (p) =>
                                                  p.id === prod.id
                                                    ? {
                                                        ...p,
                                                        cantidad: Math.max(
                                                          1,
                                                          p.cantidad - 1
                                                        ),
                                                      }
                                                    : p
                                              ),
                                            }))
                                          }
                                          disabled={
                                            presupuestoEdit.productos.find(
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
                                            presupuestoEdit.productos.find(
                                              (p) => p.id === prod.id
                                            )?.cantidad || 1
                                          }
                                          onChange={(e) =>
                                            setPresupuestoEdit((prev) => ({
                                              ...prev,
                                              productos: prev.productos.map(
                                                (p) =>
                                                  p.id === prod.id
                                                    ? {
                                                        ...p,
                                                        cantidad: Number(
                                                          e.target.value
                                                        ),
                                                      }
                                                    : p
                                              ),
                                            }))
                                          }
                                          className="w-12 text-center border rounded"
                                        />
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setPresupuestoEdit((prev) => ({
                                              ...prev,
                                              productos: prev.productos.map(
                                                (p) =>
                                                  p.id === prod.id
                                                    ? {
                                                        ...p,
                                                        cantidad:
                                                          p.cantidad + 1,
                                                      }
                                                    : p
                                              ),
                                            }))
                                          }
                                          className="px-2 py-1 rounded bg-gray-200 text-gray-700 hover:bg-gray-300"
                                        >
                                          +
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setPresupuestoEdit((prev) => ({
                                              ...prev,
                                              productos: prev.productos.filter(
                                                (p) => p.id !== prod.id
                                              ),
                                            }))
                                          }
                                          className="ml-2 px-2 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200"
                                        >
                                          Quitar
                                        </button>
                                      </div>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setPresupuestoEdit((prev) => ({
                                            ...prev,
                                            productos: [
                                              ...(prev.productos || []),
                                              {
                                                id: prod.id,
                                                nombre: prod.nombre,
                                                precio:
                                                  prod.precioPorPie ||
                                                  prod.valorVenta ||
                                                  prod.precioUnidad ||
                                                  0,
                                                unidad:
                                                  prod.unidadMedida ||
                                                  prod.unidadVenta ||
                                                  prod.unidadVentaHerraje ||
                                                  prod.unidadVentaQuimico ||
                                                  prod.unidadVentaHerramienta,
                                                stock: prod.stock,
                                                cantidad: 1,
                                                descuento: 0,
                                                categoria: prod.categoria,
                                                alto: Number(prod.alto) || 0,
                                                ancho: Number(prod.ancho) || 0,
                                                largo: Number(prod.largo) || 0,
                                                precioPorPie:
                                                  Number(prod.precioPorPie) ||
                                                  0,
                                                cepilladoAplicado: false, // Agregar propiedad por defecto
                                                tipoMadera:
                                                  prod.tipoMadera || "",
                                                subCategoria:
                                                  prod.subCategoria || "",
                                              },
                                            ],
                                          }))
                                        }
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
                      );
                    })()}
                  </div>
                </section>

                {/* Tabla de productos seleccionados en modo edición */}
                {(presupuestoEdit.productos || []).length > 0 && (
                  <section className="bg-card rounded-lg p-4 border border-default-200 shadow-sm mt-4">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-default-900">
                        Productos Seleccionados
                      </h3>
                      <span className="text-sm text-default-600">
                        {(presupuestoEdit.productos || []).length} producto
                        {(presupuestoEdit.productos || []).length !== 1
                          ? "s"
                          : ""}
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
                          {(presupuestoEdit.productos || []).map((p, idx) => (
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
                                {/* Información específica por categoría - buscada dinámicamente desde la BD */}
                                {p.categoria === "Maderas" &&
                                  getProductoCompleto(p.id)?.tipoMadera && (
                                    <div className="flex items-center gap-1 mt-1">
                                      <span className="text-xs text-orange-600 font-medium">
                                        🌲{" "}
                                        {getProductoCompleto(p.id).tipoMadera}
                                      </span>
                                    </div>
                                  )}
                                {p.categoria === "Ferretería" &&
                                  getProductoCompleto(p.id)?.subCategoria && (
                                    <div className="flex items-center gap-1 mt-1">
                                      <span className="text-xs text-blue-600 font-medium">
                                        🔧{" "}
                                        {getProductoCompleto(p.id).subCategoria}
                                      </span>
                                    </div>
                                  )}
                              </td>
                              <td className="p-4 align-middle text-sm text-default-600 last:text-right last:rtl:text-left font-normal [&:has([role=checkbox])]:ltr:pr-0 [&:has([role=checkbox])]:rtl:pl-0">
                                <div className="flex items-center justify-center">
                                  <div className="flex items-center border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden bg-white dark:bg-gray-700">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setPresupuestoEdit((prev) => ({
                                          ...prev,
                                          productos: prev.productos.map(
                                            (prod) =>
                                              prod.id === p.id
                                                ? {
                                                    ...prod,
                                                    cantidad: Math.max(
                                                      1,
                                                      prod.cantidad - 1
                                                    ),
                                                  }
                                                : prod
                                          ),
                                        }))
                                      }
                                      disabled={
                                        loadingPrecios || p.cantidad <= 1
                                      }
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
                                        setPresupuestoEdit((prev) => ({
                                          ...prev,
                                          productos: prev.productos.map(
                                            (prod) =>
                                              prod.id === p.id
                                                ? {
                                                    ...prod,
                                                    cantidad: Number(
                                                      e.target.value
                                                    ),
                                                  }
                                                : prod
                                          ),
                                        }))
                                      }
                                      className="w-16 text-center font-bold border-0 bg-transparent focus:ring-0 focus:outline-none text-gray-900 dark:text-gray-100"
                                      disabled={loadingPrecios}
                                    />

                                    <button
                                      type="button"
                                      onClick={() =>
                                        setPresupuestoEdit((prev) => ({
                                          ...prev,
                                          productos: prev.productos.map(
                                            (prod) =>
                                              prod.id === p.id
                                                ? {
                                                    ...prod,
                                                    cantidad: prod.cantidad + 1,
                                                  }
                                                : prod
                                          ),
                                        }))
                                      }
                                      disabled={loadingPrecios}
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
                                      onChange={(e) =>
                                        recalcularPreciosMadera(
                                          p.id,
                                          e.target.checked
                                        )
                                      }
                                      className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                                      disabled={loadingPrecios}
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
                                    setPresupuestoEdit((prev) => ({
                                      ...prev,
                                      productos: prev.productos.map((prod) =>
                                        prod.id === p.id
                                          ? {
                                              ...prod,
                                              descuento: Number(e.target.value),
                                            }
                                          : prod
                                      ),
                                    }))
                                  }
                                  className="w-20 mx-auto text-center border rounded px-2 py-1"
                                  disabled={loadingPrecios}
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
                                  onClick={() =>
                                    setPresupuestoEdit((prev) => ({
                                      ...prev,
                                      productos: prev.productos.filter(
                                        (prod) => prod.id !== p.id
                                      ),
                                    }))
                                  }
                                  disabled={loadingPrecios}
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

                {/* Totales y botones por debajo de la tabla */}
                {(presupuestoEdit.productos || []).length > 0 && (
                  <div className="flex flex-col items-end gap-2 mt-4">
                    <div className="bg-primary/5 border border-primary/20 rounded-lg px-6 py-3 flex flex-col md:flex-row gap-4 md:gap-8 text-lg shadow-sm w-full md:w-auto font-semibold">
                      <div>
                        Subtotal:{" "}
                        <span className="font-bold">
                          $
                          {formatearNumeroArgentino(
                            presupuestoEdit.productos.reduce(
                              (acc, p) =>
                                acc + Number(p.precio) * Number(p.cantidad),
                              0
                            )
                          )}
                        </span>
                      </div>
                      <div>
                        Descuento:{" "}
                        <span className="font-bold">
                          $
                          {formatearNumeroArgentino(
                            presupuestoEdit.productos.reduce(
                              (acc, p) =>
                                acc +
                                Number(p.precio) *
                                  Number(p.cantidad) *
                                  (Number(p.descuento || 0) / 100),
                              0
                            )
                          )}
                        </span>
                      </div>
                      {presupuestoEdit.costoEnvio &&
                        Number(presupuestoEdit.costoEnvio) > 0 && (
                          <div>
                            Costo de envío:{" "}
                            <span className="font-bold">
                              $
                              {formatearNumeroArgentino(
                                Number(presupuestoEdit.costoEnvio)
                              )}
                            </span>
                          </div>
                        )}
                      <div>
                        Total:{" "}
                        <span className="font-bold text-primary">
                          $
                          {formatearNumeroArgentino(
                            presupuestoEdit.productos.reduce(
                              (acc, p) =>
                                acc + Number(p.precio) * Number(p.cantidad),
                              0
                            ) -
                              presupuestoEdit.productos.reduce(
                                (acc, p) =>
                                  acc +
                                  Number(p.precio) *
                                    Number(p.cantidad) *
                                    (Number(p.descuento || 0) / 100),
                                0
                              ) +
                              (Number(presupuestoEdit.costoEnvio) || 0)
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Botones al final de todas las secciones editables */}
                <div className="flex flex-wrap gap-2 mt-6">
                  <Button
                    variant="default"
                    onClick={handleGuardarCambios}
                    disabled={loadingPrecios}
                    className="flex-1 lg:flex-none text-sm lg:text-base"
                  >
                    <span className="hidden sm:inline">Guardar cambios</span>
                    <span className="sm:hidden">💾</span>
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setEditando(false)}
                    disabled={loadingPrecios}
                    className="flex-1 lg:flex-none text-sm lg:text-base"
                  >
                    <span className="hidden sm:inline">Cancelar</span>
                    <span className="sm:hidden">❌</span>
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleActualizarPrecios}
                    disabled={loadingPrecios}
                    className="flex-1 lg:flex-none text-sm lg:text-base"
                  >
                    {loadingPrecios ? (
                      <>
                        <span className="hidden sm:inline">
                          Actualizando...
                        </span>
                        <span className="sm:hidden">⏳</span>
                      </>
                    ) : (
                      <>
                        <span className="hidden sm:inline">
                          Actualizar precios
                        </span>
                        <span className="sm:hidden">💰</span>
                      </>
                    )}
                  </Button>
                </div>
                {errorForm && (
                  <div className="text-red-500 mt-2">{errorForm}</div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="bg-card rounded-lg shadow-sm p-6 mb-6">
            <h3 className="font-semibold text-lg mb-4 ">
              Productos y Servicios
            </h3>

            {/* Usar productos si existe, sino usar items */}
            {safeArray(presupuesto.productos).length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-card border-b">
                      <th className="text-left p-3 font-medium">Producto</th>
                      <th className="text-center p-3 font-medium">Cantidad</th>
                      <th className="text-center p-3 font-medium">Unidad</th>
                      <th className="text-right p-3 font-medium">Descuento</th>
                      <th className="text-right p-3 font-medium">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {safeArray(presupuesto.productos).map(
                      (producto, idx) => (
                        <tr key={idx} className="border-b hover:bg-card">
                          <td className="p-3 font-medium">
                            {producto.descripcion ||
                              producto.nombre ||
                              "Producto sin nombre"}
                            {/* Mostrar tipo de madera para productos de madera - buscado dinámicamente */}
                            {producto.categoria === "Maderas" &&
                              getProductoCompleto(producto.id)?.tipoMadera && (
                                <div className="mt-1 text-xs text-orange-600 font-medium">
                                  Tipo:{" "}
                                  {getProductoCompleto(producto.id).tipoMadera}
                                </div>
                              )}
                            {/* Mostrar subcategoría para productos de ferretería - buscado dinámicamente */}
                            {producto.categoria === "Ferretería" &&
                              getProductoCompleto(producto.id)
                                ?.subCategoria && (
                                <div className="mt-1 text-xs text-blue-600 font-medium">
                                  {" "}
                                  {
                                    getProductoCompleto(producto.id)
                                      .subCategoria
                                  }
                                </div>
                              )}
                            {/* Mostrar dimensiones y precio por pie para productos de madera */}
                            {producto.categoria === "Maderas" && (
                              <div className="mt-1 text-xs text-gray-500">
                                <div className="flex flex-wrap gap-2">
                                  <span>Alto: {producto.alto || 0} </span>
                                  <span>Ancho: {producto.ancho || 0}</span>
                                  <span>Largo: {producto.largo || 0}</span>
                                </div>
                              </div>
                            )}
                          </td>
                          <td className="p-3 text-center">
                            {safeNumber(producto.cantidad)}
                          </td>
                          <td className="p-3 text-center">
                            {producto.unidad || "-"}
                          </td>
                          <td className="p-3 text-right">
                            {safeNumber(producto.descuento).toFixed(2)}%
                          </td>
                          <td className="p-3 text-right font-medium">
                            $
                            {formatearNumeroArgentino(
                              safeNumber(producto.precio) *
                                safeNumber(producto.cantidad) *
                                (1 - safeNumber(producto.descuento) / 100)
                            )}
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
              <div className="bg-card rounded-lg p-4 min-w-[300px]">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Subtotal:</span>
                    <span>
                      $
                      {formatearNumeroArgentino(
                        safeNumber(presupuesto.subtotal)
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Descuento total:</span>
                    <span>
                      $
                      {formatearNumeroArgentino(
                        safeNumber(presupuesto.descuentoTotal)
                      )}
                    </span>
                  </div>
                  {/* Mostrar costo de envío si existe y es >= 0 y no es retiro local */}
                  {presupuesto.costoEnvio !== undefined &&
                    presupuesto.costoEnvio !== "" &&
                    !isNaN(Number(presupuesto.costoEnvio)) &&
                    Number(presupuesto.costoEnvio) > 0 && (
                      <div className="flex justify-between">
                        <span>Cotización de envío:</span>
                        <span>
                          $
                          {formatearNumeroArgentino(
                            safeNumber(presupuesto.costoEnvio)
                          )}
                        </span>
                      </div>
                    )}
                  <div className="border-t pt-2 flex justify-between font-bold text-lg">
                    <span>Total:</span>
                    <span className="text-primary">
                      $
                      {formatearNumeroArgentino(
                        (() => {
                          const subtotal = safeNumber(presupuesto.subtotal);
                          const descuento = safeNumber(
                            presupuesto.descuentoTotal
                          );
                          const envio =
                            presupuesto.costoEnvio !== undefined &&
                            presupuesto.costoEnvio !== "" &&
                            !isNaN(Number(presupuesto.costoEnvio)) &&
                            Number(presupuesto.costoEnvio) > 0
                              ? Number(presupuesto.costoEnvio)
                              : 0;
                          return subtotal - descuento + envio;
                        })()
                      )}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Observaciones */}
        {presupuesto.observaciones && (
          <div className="bg-card rounded-lg shadow-sm p-6 mb-6">
            <h3 className="font-semibold text-lg mb-3 ">Observaciones</h3>
            <p className="text-gray-700 whitespace-pre-wrap">
              {presupuesto.observaciones}
            </p>
          </div>
        )}

        {/* Modal de venta */}
        {convirtiendoVenta ? (
          <div className="bg-card rounded-lg shadow-sm p-6 mb-6">
            <h3 className="font-semibold text-lg mb-4 ">
              Convertir Presupuesto a Venta
            </h3>
            <p className="text-gray-600 mb-4">
              Complete los campos adicionales necesarios para convertir este
              presupuesto en una venta.
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
                    // Calcular el total correcto incluyendo envío
                    total: (() => {
                      // Recalcular el total correcto basado en los datos del presupuesto
                      const subtotal = safeNumber(presupuesto.subtotal);
                      const descuento = safeNumber(presupuesto.descuentoTotal);
                      // Usar el costo de envío del formulario si existe, sino del presupuesto
                      const envio = ventaCampos.costoEnvio
                        ? Number(ventaCampos.costoEnvio)
                        : safeNumber(presupuesto.costoEnvio || 0);
                      const totalCorrecto = subtotal - descuento + envio;

                      // Debug para verificar el cálculo
                      console.log(
                        "[DEBUG] Cálculo total en conversión a venta:"
                      );
                      console.log("Subtotal presupuesto:", subtotal);
                      console.log("Descuento presupuesto:", descuento);
                      console.log(
                        "Envío del formulario:",
                        ventaCampos.costoEnvio
                      );
                      console.log(
                        "Envío del presupuesto:",
                        presupuesto.costoEnvio
                      );
                      console.log("Envío final usado:", envio);
                      console.log("Total calculado correcto:", totalCorrecto);
                      console.log(
                        "Total presupuesto (puede estar incorrecto):",
                        presupuesto.total
                      );

                      // Usar el total recalculado para asegurar consistencia
                      return totalCorrecto;
                    })(),
                    observaciones: presupuesto.observaciones,

                    // Datos específicos de venta
                    tipo: "venta",
                    fechaCreacion: new Date().toISOString(),
                    numeroPedido: await getNextVentaNumber(),

                    // Campos de pago
                    formaPago: ventaCampos.formaPago,
                    pagoParcial: ventaCampos.pagoParcial || false,
                    montoAbonado: (() => {
                      const totalVenta = (() => {
                        const subtotal = safeNumber(presupuesto.subtotal);
                        const descuento = safeNumber(
                          presupuesto.descuentoTotal
                        );
                        // Usar el costo de envío del formulario si existe, sino del presupuesto
                        const envio = ventaCampos.costoEnvio
                          ? Number(ventaCampos.costoEnvio)
                          : safeNumber(presupuesto.costoEnvio || 0);
                        return subtotal - descuento + envio;
                      })();

                      // Si NO es pago parcial → montoAbonado = total
                      // Si ES pago parcial → usar el valor del formulario
                      const esPagoParcial = ventaCampos.pagoParcial || false;
                      return esPagoParcial
                        ? ventaCampos.montoAbonado || 0
                        : totalVenta;
                    })(),

                    // Determinar estado de pago
                    estadoPago: (() => {
                      const totalVenta = (() => {
                        const subtotal = safeNumber(presupuesto.subtotal);
                        const descuento = safeNumber(
                          presupuesto.descuentoTotal
                        );
                        // Usar el costo de envío del formulario si existe, sino del presupuesto
                        const envio = ventaCampos.costoEnvio
                          ? Number(ventaCampos.costoEnvio)
                          : safeNumber(presupuesto.costoEnvio || 0);
                        return subtotal - descuento + envio;
                      })();

                      const esPagoParcial = ventaCampos.pagoParcial || false;
                      const montoAbonado = esPagoParcial
                        ? ventaCampos.montoAbonado || 0
                        : totalVenta;

                      console.log("[DEBUG] Cálculo estado de pago:");
                      console.log("Total venta:", totalVenta);
                      console.log("Es pago parcial:", esPagoParcial);
                      console.log("Monto abonado:", montoAbonado);

                      // Lógica inteligente: calcular estado según monto abonado
                      let estado;
                      if (montoAbonado >= totalVenta) {
                        estado = "pagado";
                      } else if (montoAbonado > 0) {
                        estado = "parcial";
                      } else {
                        estado = "pendiente";
                      }

                      console.log("Estado resultante:", estado);
                      return estado;
                    })(),

                    // Campos de envío
                    tipoEnvio: ventaCampos.tipoEnvio || presupuesto.tipoEnvio,
                    fechaEntrega: ventaCampos.fechaEntrega,
                    rangoHorario: ventaCampos.rangoHorario,
                    transportista: ventaCampos.transportista,
                    costoEnvio: ventaCampos.costoEnvio
                      ? Number(ventaCampos.costoEnvio)
                      : presupuesto.costoEnvio, // Usar el valor del formulario si existe
                    direccionEnvio: ventaCampos.direccionEnvio,
                    localidadEnvio: ventaCampos.localidadEnvio,
                    usarDireccionCliente:
                      ventaCampos.usarDireccionCliente || true,

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

                  console.log(
                    "[DEBUG] Datos limpios para guardar venta desde presupuesto:",
                    cleanVentaData
                  );

                  // Guardar venta en Firestore
                  const docRef = await addDoc(
                    collection(db, "ventas"),
                    cleanVentaData
                  );

                  // Descontar stock y registrar movimientos (igual que en ventas/page.jsx)
                  for (const prod of cleanVentaData.productos) {
                    console.log(
                      "[DEBUG] Intentando descontar stock para producto:",
                      prod.id
                    );
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
                      observaciones: `Salida por venta desde presupuesto`,
                      productoNombre: prod.nombre,
                    });
                  }

                  // Crear envío si corresponde (igual que en ventas/page.jsx)
                  if (
                    cleanVentaData.tipoEnvio &&
                    cleanVentaData.tipoEnvio !== "retiro_local"
                  ) {
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
                      cantidadTotal: cleanVentaData.productos.reduce(
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
                      observaciones: cleanVentaData.observaciones,
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
                    console.log(
                      "Envío creado automáticamente para la venta:",
                      docRef.id
                    );
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
        ) : null}

        {/* Modal para nuevo cliente en presupuestos */}
        <Dialog open={openNuevoCliente} onOpenChange={setOpenNuevoCliente}>
          <DialogContent className="w-[95vw] max-w-[420px] bg-card">
            <DialogHeader className="bg-card">
              <DialogTitle className="bg-card">Agregar Cliente</DialogTitle>
              <DialogDescription className="bg-card">
                Complete los datos del nuevo cliente para agregarlo al sistema.
              </DialogDescription>
            </DialogHeader>
            <form
              onSubmit={handleNuevoClienteSubmit}
              className="space-y-2 bg-card"
            >
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
            <DialogFooter className="bg-card">
              {/* ...botones... */}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

// Nuevo formulario minimalista para conversión a venta
function FormularioConvertirVenta({ presupuesto, onCancel, onSubmit }) {
  const [clientes, setClientes] = React.useState([]);

  // Función para formatear números en formato argentino
  const formatearNumeroArgentino = (numero) => {
    if (numero === null || numero === undefined || isNaN(numero)) return "0";
    return Number(numero).toLocaleString("es-AR");
  };

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
            .max(
              (() => {
                const subtotal = presupuesto.subtotal || 0;
                const descuento = presupuesto.descuentoTotal || 0;
                // Usar el costo de envío del formulario si existe, sino del presupuesto
                const envio = watch("costoEnvio")
                  ? Number(watch("costoEnvio"))
                  : presupuesto.costoEnvio !== undefined &&
                    presupuesto.costoEnvio !== "" &&
                    !isNaN(Number(presupuesto.costoEnvio)) &&
                    Number(presupuesto.costoEnvio) > 0
                  ? Number(presupuesto.costoEnvio)
                  : 0;
                return subtotal - descuento + envio;
              })(),
              (value) => {
                const subtotal = presupuesto.subtotal || 0;
                const descuento = presupuesto.descuentoTotal || 0;
                // Usar el costo de envío del formulario si existe, sino del presupuesto
                const envio = watch("costoEnvio")
                  ? Number(watch("costoEnvio"))
                  : presupuesto.costoEnvio !== undefined &&
                    presupuesto.costoEnvio !== "" &&
                    !isNaN(Number(presupuesto.costoEnvio)) &&
                    Number(presupuesto.costoEnvio) > 0
                  ? Number(presupuesto.costoEnvio)
                  : 0;
                const total = subtotal - descuento + envio;
                return `No puede exceder el total de $${formatearNumeroArgentino(
                  total
                )}`;
              }
            )
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

  // Determinar valores por defecto inteligentes
  const getDefaultValues = () => {
    const defaults = {
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
    };

    // Si el presupuesto tiene costo de envío, establecer automáticamente como envío a domicilio
    if (presupuesto.costoEnvio && presupuesto.costoEnvio > 0) {
      defaults.tipoEnvio = "envio_domicilio";
      defaults.costoEnvio = presupuesto.costoEnvio.toString();
    }

    return defaults;
  };

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: yupResolver(schema),
    defaultValues: getDefaultValues(),
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
        {/* Información de envío */}
        <div className="space-y-4 bg-card rounded-lg p-4 border border-gray-200 shadow-sm">
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
            </select>
            {errors.tipoEnvio && (
              <span className="text-red-500 text-xs">
                {errors.tipoEnvio.message}
              </span>
            )}
          </div>

          {tipoEnvioSeleccionado &&
            tipoEnvioSeleccionado !== "retiro_local" && (
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
                        <span className="text-red-500 text-xs">
                          {errors.direccionEnvio.message}
                        </span>
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
                        <span className="text-red-500 text-xs">
                          {errors.localidadEnvio.message}
                        </span>
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
                      errors.transportista
                        ? "border-red-500"
                        : "border-gray-300"
                    }`}
                  >
                    <option value="">Seleccionar transportista...</option>
                    {transportistas.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                  {errors.transportista && (
                    <span className="text-red-500 text-xs">
                      {errors.transportista.message}
                    </span>
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
                    <span className="text-red-500 text-xs">
                      {errors.rangoHorario.message}
                    </span>
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
                </div>
              </>
            )}
        </div>

        {/* Condiciones de pago y entrega */}
        <div className="space-y-4 bg-card rounded-lg p-4 border border-gray-200 shadow-sm">
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
              <span className="text-red-500 text-xs">
                {errors.formaPago.message}
              </span>
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
                max={(() => {
                  const subtotal = presupuesto.subtotal || 0;
                  const descuento = presupuesto.descuentoTotal || 0;
                  // Usar el costo de envío del formulario si existe, sino del presupuesto
                  const envio = watch("costoEnvio")
                    ? Number(watch("costoEnvio"))
                    : presupuesto.costoEnvio !== undefined &&
                      presupuesto.costoEnvio !== "" &&
                      !isNaN(Number(presupuesto.costoEnvio)) &&
                      Number(presupuesto.costoEnvio) > 0
                    ? Number(presupuesto.costoEnvio)
                    : 0;
                  return subtotal - descuento + envio;
                })()}
                placeholder={`Saldo pendiente: $${(() => {
                  // Calcular el total completo incluyendo envío
                  const subtotal = presupuesto.subtotal || 0;
                  const descuento = presupuesto.descuentoTotal || 0;
                  // Usar el costo de envío del formulario si existe, sino del presupuesto
                  const envio = watch("costoEnvio")
                    ? Number(watch("costoEnvio"))
                    : presupuesto.costoEnvio !== undefined &&
                      presupuesto.costoEnvio !== "" &&
                      !isNaN(Number(presupuesto.costoEnvio)) &&
                      Number(presupuesto.costoEnvio) > 0
                    ? Number(presupuesto.costoEnvio)
                    : 0;
                  const total = subtotal - descuento + envio;
                  const montoAbonado = watch("montoAbonado")
                    ? Number(watch("montoAbonado"))
                    : 0;
                  return formatearNumeroArgentino(total - montoAbonado);
                })()}`}
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

        {/* Información adicional */}
        <div className="space-y-4 bg-card rounded-lg p-4 border border-gray-200 shadow-sm">
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
              <span className="text-red-500 text-xs">
                {errors.vendedor.message}
              </span>
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
