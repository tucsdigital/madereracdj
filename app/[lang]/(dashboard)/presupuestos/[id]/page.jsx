"use client";
import { fechaLocalActual, sumarDias } from "@/lib/fechas-locales";
import React, { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { computeTotals } from "@/lib/pricing";
import { useParams, useRouter } from "next/navigation";
import { db } from "@/lib/firebase";
import { useAuth } from "@/provider/auth.provider";
import {
  doc,
  getDoc,
  collection,
  getDocs,
  updateDoc,
} from "firebase/firestore";
import { Button } from "@/components/ui/button";
import {
  ArrowLeftRight,
  ArrowLeft,
  Banknote,
  BadgePercent,
  CalendarDays,
  Check,
  ChevronDown,
  ClipboardList,
  Clock3,
  Download,
  Edit,
  FileText,
  IdCard,
  Loader2,
  Mail,
  MapPin,
  Package,
  Phone,
  Plus,
  Printer,
  ReceiptText,
  Save,
  Tag,
  Truck,
  User,
  X,
} from "lucide-react";
import { DetalleVentaPresupuestoItemsTable } from "@/components/ventas/TablaProductosVentas";
import ProductosVentaEditor from "@/components/ventas/ProductosVentaEditor";
import { Input } from "@/components/ui/input";
import GoogleAddressInput from "@/components/ui/google-address-input";
import { DeliveryScheduleInput } from "@/components/ui/delivery-schedule-input";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";
// FormularioVentaPresupuesto removido - usar componente separado si es necesario
// import { FormularioVentaPresupuesto } from "@/components/ventas/FormularioVentaPresupuesto";
import ModalCambiarCliente from "@/components/clientes/ModalCambiarCliente";
import { mapFirestoreDoc } from "@/lib/erp/producto-id";
import { applyDerivedComboStock, isComboProduct, normalizeComboComponents } from "@/lib/combos";

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

  return sumarDias(fechaEmision, 7) || null; // Formato YYYY-MM-DD
}

const normalizarPorcentaje = (value, fallback) => {
  if (value === null || value === undefined || value === "") return fallback;
  const porcentaje = Number(String(value).replace(",", "."));
  return Number.isFinite(porcentaje) ? Math.max(0, porcentaje) : fallback;
};

const opcionActiva = (...values) =>
  values.some(
    (value) =>
      value === true ||
      value === 1 ||
      value === "1" ||
      String(value).toLowerCase() === "true"
  );

const opcionPresupuestoActiva = (presupuesto, campoActual, campoAnterior) => {
  const actual = presupuesto?.[campoActual];
  return actual !== undefined
    ? opcionActiva(actual)
    : opcionActiva(presupuesto?.[campoAnterior]);
};

// Fuente única para el resumen, el guardado y la conversión del presupuesto.
// Los adicionales se calculan siempre sobre la base neta de productos, antes del envío.
const calcularTotalesPresupuesto = ({
  presupuesto = {},
  items = [],
  pagoEnEfectivo,
  costoEnvio,
}) => {
  const { subtotal, descuentoTotal, total: subtotalConDescuento } = computeTotals(items);
  const efectivo =
    pagoEnEfectivo === undefined
      ? opcionActiva(presupuesto?.pagoEnEfectivo)
      : Boolean(pagoEnEfectivo);
  const descuentoEfectivo = efectivo ? Math.round(subtotal * 0.1) : 0;
  const baseImponible = Math.max(0, Math.round(subtotalConDescuento - descuentoEfectivo));
  const aplicaIva = opcionPresupuestoActiva(
    presupuesto,
    "aplicaIva",
    "aplicarIva"
  );
  const ivaPorcentaje = normalizarPorcentaje(presupuesto?.ivaPorcentaje, 21);
  const ivaMonto = aplicaIva
    ? Math.round(baseImponible * (ivaPorcentaje / 100))
    : 0;
  const aplicaTransferencia = opcionPresupuestoActiva(
    presupuesto,
    "aplicaTransferencia",
    "aplicarTransferencia"
  );
  const transferenciaPorcentaje = normalizarPorcentaje(
    presupuesto?.transferenciaPorcentaje,
    10
  );
  const transferenciaMonto = aplicaTransferencia
    ? Math.round(baseImponible * (transferenciaPorcentaje / 100))
    : 0;
  const envioRaw = costoEnvio === undefined ? presupuesto?.costoEnvio : costoEnvio;
  const envioNumero = Number(envioRaw);
  const envio = Number.isFinite(envioNumero) ? Math.max(0, envioNumero) : 0;
  const totalFinal = Math.round(
    baseImponible + ivaMonto + transferenciaMonto + envio
  );

  return {
    subtotal,
    descuentoTotal,
    subtotalConDescuento,
    descuentoEfectivo,
    baseImponible,
    aplicaIva,
    ivaPorcentaje,
    ivaMonto,
    aplicaTransferencia,
    transferenciaPorcentaje,
    transferenciaMonto,
    envio,
    totalFinal,
  };
};

function ConfiguracionPorcentajeCard({
  title,
  Icon,
  checked,
  percentage,
  onCheckedChange,
  onPercentageChange,
  disabled = false,
}) {
  return (
    <article className="flex min-w-0 items-center gap-3 rounded-xl border border-border/60 bg-card p-3 sm:gap-4 sm:p-4">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-muted text-foreground sm:h-11 sm:w-11" aria-hidden="true">
        <Icon className="h-5 w-5 sm:h-6 sm:w-6" />
      </span>

      <label className="inline-flex shrink-0 cursor-pointer items-center">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onCheckedChange(event.target.checked)}
          disabled={disabled}
          aria-label={title}
          className="peer sr-only"
        />
        <span
          aria-hidden="true"
          className="relative h-6 w-11 rounded-full bg-muted transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-background after:shadow-sm after:transition-transform peer-checked:bg-primary peer-checked:after:translate-x-5 peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
        />
      </label>

      <div className="min-w-0 flex-1">
        <h4 className="truncate text-sm font-semibold text-foreground">{title}</h4>
        <p className="mt-0.5 text-xs text-muted-foreground">Porcentaje preconfigurado</p>
      </div>

      <label className="flex h-10 w-[5.25rem] shrink-0 items-center rounded-lg bg-muted/70 px-2 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
        <span className="sr-only">Porcentaje de {title}</span>
        <input
          type="number"
          min="0"
          step="0.01"
          value={percentage}
          onChange={(event) => onPercentageChange(event.target.value)}
          disabled={disabled || !checked}
          className="min-w-0 flex-1 bg-transparent text-right text-base font-semibold tabular-nums text-foreground outline-none disabled:cursor-not-allowed disabled:opacity-50"
        />
        <span className="pl-1 text-sm font-semibold text-foreground">%</span>
      </label>
    </article>
  );
}

const PresupuestoDetalle = () => {
  const params = useParams();
  const router = useRouter();
  const { id, lang } = params;
  const { user } = useAuth();
  const [presupuesto, setPresupuesto] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // 1. Importaciones necesarias para edición, modal y Firestore
  const [editando, setEditando] = useState(false);
  const [presupuestoEdit, setPresupuestoEdit] = useState(null);
  const presupuestoEditBaselineRef = useRef(null);
  const [openVenta, setOpenVenta] = useState(false);
  const [ventaForm, setVentaForm] = useState(null);
  const [clientes, setClientes] = useState([]);
  const [productos, setProductos] = useState([]);
  const [loadingPrecios, setLoadingPrecios] = useState(false);
  const [errorForm, setErrorForm] = useState("");
  const [guardandoCambios, setGuardandoCambios] = useState(false);
  const [downloadingPDF, setDownloadingPDF] = useState(false);
  const [downloadingPDFEmpleado, setDownloadingPDFEmpleado] = useState(false);
  const [printingPDF, setPrintingPDF] = useState(false);
  const [printingPDFEmpleado, setPrintingPDFEmpleado] = useState(false);
  const printingRef = useRef(false);
  const printingEmpleadoRef = useRef(false);

  // Inicializar singleton global usando useEffect para evitar problemas con las reglas de hooks
  // DEBE estar antes de cualquier return temprano
  useEffect(() => {
    if (typeof window !== 'undefined' && !window.__printLock) {
      window.__printLock = { active: false, iframe: null, lastPrintTime: 0 };
    }
  }, []);

  // Función para imprimir - Solución simple y básica
  // DEBE estar antes de cualquier return temprano (es un hook useCallback)
  const handlePrintPDF = useCallback(async (paraEmpleado = false, event = null) => {
    // Prevenir propagación del evento
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    
    if (!presupuesto?.id) return;
    
    // Verificar si ya hay una impresión en proceso
    const currentRef = paraEmpleado ? printingEmpleadoRef : printingRef;
    if (currentRef.current) return;
    
    // Activar flag INMEDIATAMENTE
    currentRef.current = true;
    if (paraEmpleado) {
      setPrintingPDFEmpleado(true);
    } else {
      setPrintingPDF(true);
    }
    
    try {
      // Obtener HTML
      const res = await fetch("/api/pdf/remito-html", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "presupuesto",
          id: presupuesto.id,
          empleado: paraEmpleado,
        }),
      });
      
      if (!res.ok) {
        alert("Error al generar el remito. Por favor, intenta nuevamente.");
        currentRef.current = false;
        if (paraEmpleado) {
          setPrintingPDFEmpleado(false);
        } else {
          setPrintingPDF(false);
        }
        return;
      }
      
      const html = await res.text();
      
      // Crear iframe
      const iframe = document.createElement("iframe");
      iframe.style.position = "fixed";
      iframe.style.right = "0";
      iframe.style.bottom = "0";
      iframe.style.width = "0";
      iframe.style.height = "0";
      iframe.style.border = "none";
      document.body.appendChild(iframe);
      
      // Flag simple para asegurar que solo se imprima una vez
      let printed = false;
      let timeoutId = null;
      
      const printOnce = () => {
        if (printed) return;
        printed = true;
        
        // Cancelar timeout si existe
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } catch (e) {
          console.error("Error al imprimir:", e);
        }
        
        // Limpiar después de imprimir
        currentRef.current = false;
        if (paraEmpleado) {
          setPrintingPDFEmpleado(false);
        } else {
          setPrintingPDF(false);
        }
        
        // Remover iframe después de un tiempo
        setTimeout(() => {
          try {
            if (iframe.parentNode) {
              document.body.removeChild(iframe);
            }
          } catch (e) {
            // Ignorar errores
          }
        }, 2000);
      };
      
      // Escribir HTML
      iframe.contentDocument?.open();
      iframe.contentDocument?.write(html);
      iframe.contentDocument?.close();
      
      // SOLO usar timeout - NO usar onload para evitar múltiples disparos
      // Esperar 500ms para que el HTML se cargue completamente
      timeoutId = setTimeout(() => {
        printOnce();
      }, 500);
      
    } catch (e) {
      console.error("Error imprimiendo remito", e);
      alert("Error al generar el remito. Por favor, intenta nuevamente.");
      currentRef.current = false;
      if (paraEmpleado) {
        setPrintingPDFEmpleado(false);
      } else {
        setPrintingPDF(false);
      }
    }
  }, [presupuesto?.id]);

  // Eliminar el estado global de cepillado automático
  // const [cepilladoAutomatico, setCepilladoAutomatico] = useState(false);

  // Estado para conversión a venta
  const [convirtiendoVenta, setConvirtiendoVenta] = useState(false);

  // Estado para pago en efectivo
  const [pagoEnEfectivo, setPagoEnEfectivo] = useState(false);

  // Estado para cambio de cliente
  const [showSelectorCliente, setShowSelectorCliente] = useState(false);

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

  // Cambiar el título de la página dinámicamente para el nombre del PDF
  useEffect(() => {
    if (presupuesto?.numeroPedido) {
      document.title = presupuesto.numeroPedido;
    }
    // Restaurar el título original al desmontar el componente
    return () => {
      document.title = "Maderas Caballero - Panel Administrativo";
    };
  }, [presupuesto?.numeroPedido]);

  // Cargar clientes y productos para selects y actualización de precios
  useEffect(() => {
    const fetchClientesYProductos = async () => {
      const snapClientes = await getDocs(collection(db, "clientes"));
      setClientes(
        snapClientes.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
      );
      const snapProductos = await getDocs(collection(db, "productos"));
      const productosData = applyDerivedComboStock(snapProductos.docs.map((doc) => mapFirestoreDoc(doc)));
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
      const productosPresupuesto = Array.isArray(presupuestoClonado.productos) && presupuestoClonado.productos.length > 0
        ? presupuestoClonado.productos
        : Array.isArray(presupuestoClonado.items)
          ? presupuestoClonado.items
          : [];
      presupuestoClonado.productos = productosPresupuesto;
      presupuestoClonado.aplicaIva = opcionPresupuestoActiva(
        presupuestoClonado,
        "aplicaIva",
        "aplicarIva"
      );
      presupuestoClonado.aplicarIva = presupuestoClonado.aplicaIva;
      presupuestoClonado.ivaPorcentaje = Number(presupuestoClonado.ivaPorcentaje) || 21;
      presupuestoClonado.aplicaTransferencia = opcionPresupuestoActiva(
        presupuestoClonado,
        "aplicaTransferencia",
        "aplicarTransferencia"
      );
      presupuestoClonado.aplicarTransferencia =
        presupuestoClonado.aplicaTransferencia;
      presupuestoClonado.transferenciaPorcentaje = Number(presupuestoClonado.transferenciaPorcentaje) || 10;
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
      if (presupuestoClonado.productos.length > 0) {
        presupuestoClonado.productos = presupuestoClonado.productos.map(
          (productoPresupuesto) => {
            const productoDB = productos.find(
              (p) => p.id === productoPresupuesto.id
            );
            if (productoDB) {
              const normalizarBool = (value) =>
                value === true ||
                value === "true" ||
                value === 1 ||
                value === "1" ||
                value === "on";
              const normalizarUnidadMadera = (raw) => {
                const txt = String(raw || "").trim();
                const up = txt.toUpperCase();
                if (up === "M2") return "M2";
                if (up === "ML") return "ML";
                if (up === "UN" || up === "UNIDAD" || up === "UNIDADES" || up === "U")
                  return "Unidad";
                return txt;
              };
              const altoActual =
                productoPresupuesto.alto !== undefined &&
                productoPresupuesto.alto !== null &&
                productoPresupuesto.alto !== ""
                  ? (parseNumericValue(productoPresupuesto.alto) === ""
                      ? 0
                      : parseNumericValue(productoPresupuesto.alto))
                  : (parseNumericValue(productoDB.alto) === ""
                      ? 0
                      : parseNumericValue(productoDB.alto));
              const anchoActual =
                productoPresupuesto.ancho !== undefined &&
                productoPresupuesto.ancho !== null &&
                productoPresupuesto.ancho !== ""
                  ? (parseNumericValue(productoPresupuesto.ancho) === ""
                      ? 0
                      : parseNumericValue(productoPresupuesto.ancho))
                  : (parseNumericValue(productoDB.ancho) === ""
                      ? 0
                      : parseNumericValue(productoDB.ancho));
              const largoActual =
                productoPresupuesto.largo !== undefined &&
                productoPresupuesto.largo !== null &&
                productoPresupuesto.largo !== ""
                  ? (parseNumericValue(productoPresupuesto.largo) === ""
                      ? 0
                      : parseNumericValue(productoPresupuesto.largo))
                  : (parseNumericValue(productoDB.largo) === ""
                      ? 0
                      : parseNumericValue(productoDB.largo));
              const precioPorPieActual =
                productoPresupuesto.precioPorPie !== undefined &&
                productoPresupuesto.precioPorPie !== null &&
                productoPresupuesto.precioPorPie !== ""
                  ? (parseNumericValue(productoPresupuesto.precioPorPie) === ""
                      ? 0
                      : parseNumericValue(productoPresupuesto.precioPorPie))
                  : (parseNumericValue(productoDB.precioPorPie) === ""
                      ? 0
                      : parseNumericValue(productoDB.precioPorPie));
              const unidadActual = normalizarUnidadMadera(
                productoPresupuesto.unidad ||
                  productoPresupuesto.unidadMedida ||
                  productoDB.unidadMedida ||
                  productoDB.unidad ||
                  ""
              );
              const cepilladoAplicadoRaw = productoPresupuesto.cepilladoAplicado;
              const cepilladoAplicado =
                (cepilladoAplicadoRaw === null || cepilladoAplicadoRaw === undefined) &&
                productoDB.categoria === "Maderas" &&
                unidadActual === "M2"
                  ? true
                  : normalizarBool(cepilladoAplicadoRaw);
              const cepilladoPorcentaje =
                unidadActual === "M2"
                  ? 0
                  : normalizarCepilladoPorcentaje(productoPresupuesto.cepilladoPorcentaje);
              const calibradoAplicado =
                normalizarBool(productoPresupuesto.calibradoAplicado);
              const calibradoPorcentaje = normalizarCalibradoPorcentaje(
                productoPresupuesto.calibradoPorcentaje
              );
              const cantidadParsed = parseNumericValue(productoPresupuesto.cantidad);
              const cantidadActual =
                cantidadParsed === "" ? 1 : Math.max(1, Math.ceil(cantidadParsed));
              let precioPorPieFinal = precioPorPieActual;
              if (precioPorPieFinal <= 0 && unidadActual === "Unidad") {
                const precioFallback = parseNumericValue(productoPresupuesto.precio);
                if (precioFallback !== "" && precioFallback > 0) {
                  precioPorPieFinal = precioFallback;
                }
              }
              const precioStoredParsed = parseNumericValue(productoPresupuesto.precio);
              let precio = precioStoredParsed === "" ? 0 : precioStoredParsed;
              if (precio <= 0 && unidadActual === "M2") {
                if (altoActual > 0 && largoActual > 0 && precioPorPieFinal > 0) {
                  precio = calcularPrecioMachimbre({
                    alto: altoActual,
                    largo: largoActual,
                    cantidad: cantidadActual,
                    precioPorPie: precioPorPieFinal,
                  });
                }
              }
              return {
                ...productoPresupuesto,
                precio,
                // Preservar campos específicos de categoría
                tipoMadera:
                  productoPresupuesto.tipoMadera || productoDB.tipoMadera || "",
                subcategoria:
                  productoDB.categoria === "Maderas"
                    ? productoPresupuesto.subcategoria ||
                      productoPresupuesto.subCategoria ||
                      productoDB.subcategoria ||
                      productoDB.subCategoria ||
                      ""
                    : productoPresupuesto.subCategoria ||
                      productoPresupuesto.subcategoria ||
                      productoDB.subCategoria ||
                      productoDB.subcategoria ||
                      "",
                alto: altoActual,
                ancho: anchoActual,
                largo: largoActual,
                unidad: unidadActual,
                precioPorPie: precioPorPieFinal,
                cepilladoAplicado,
                cepilladoPorcentaje,
                calibradoAplicado,
                calibradoPorcentaje,
              };
            }
            const normalizarBool = (value) =>
              value === true ||
              value === "true" ||
              value === 1 ||
              value === "1" ||
              value === "on";
            const calibradoAplicado = normalizarBool(productoPresupuesto.calibradoAplicado);
            const calibradoPorcentaje = normalizarCalibradoPorcentaje(
              productoPresupuesto.calibradoPorcentaje
            );
            const normalizarUnidadMadera = (raw) => {
              const txt = String(raw || "").trim();
              const up = txt.toUpperCase();
              if (up === "M2") return "M2";
              if (up === "ML") return "ML";
              if (up === "UN" || up === "UNIDAD" || up === "UNIDADES" || up === "U")
                return "Unidad";
              return txt;
            };
            const unidadActual = normalizarUnidadMadera(
              productoPresupuesto.unidad || productoPresupuesto.unidadMedida || ""
            );
            const cepilladoAplicadoRaw = productoPresupuesto.cepilladoAplicado;
            const cepilladoAplicado =
              (cepilladoAplicadoRaw === null || cepilladoAplicadoRaw === undefined) &&
              unidadActual === "M2"
                ? true
                : normalizarBool(cepilladoAplicadoRaw);
            const cepilladoPorcentaje =
              unidadActual === "M2"
                ? 0
                : normalizarCepilladoPorcentaje(productoPresupuesto.cepilladoPorcentaje);
            const altoParsed = parseNumericValue(productoPresupuesto.alto);
            const largoParsed = parseNumericValue(productoPresupuesto.largo);
            const precioPorPieParsed = parseNumericValue(productoPresupuesto.precioPorPie);
            const cantidadParsed = parseNumericValue(productoPresupuesto.cantidad);
            const altoActual = altoParsed === "" ? 0 : altoParsed;
            const largoActual = largoParsed === "" ? 0 : largoParsed;
            let precioPorPieActual = precioPorPieParsed === "" ? 0 : precioPorPieParsed;
            const cantidadActual =
              cantidadParsed === "" ? 1 : Math.max(1, Math.ceil(cantidadParsed));
            if (precioPorPieActual <= 0 && unidadActual === "Unidad") {
              const precioFallback = parseNumericValue(productoPresupuesto.precio);
              if (precioFallback !== "" && precioFallback > 0) {
                precioPorPieActual = precioFallback;
              }
            }
            const precioStoredParsed = parseNumericValue(productoPresupuesto.precio);
            let precio = precioStoredParsed === "" ? 0 : precioStoredParsed;
            if (precio <= 0 && unidadActual === "M2") {
              if (altoActual > 0 && largoActual > 0 && precioPorPieActual > 0) {
                precio = calcularPrecioMachimbre({
                  alto: altoActual,
                  largo: largoActual,
                  cantidad: cantidadActual,
                  precioPorPie: precioPorPieActual,
                });
              }
            }
            return {
              ...productoPresupuesto,
              precio,
              unidad: unidadActual,
              alto: altoActual,
              largo: largoActual,
              cantidad: cantidadActual,
              precioPorPie: precioPorPieActual,
              cepilladoAplicado,
              cepilladoPorcentaje,
              calibradoAplicado,
              calibradoPorcentaje,
            };
          }
        );
      }

      console.log("presupuestoClonado:", presupuestoClonado);
      presupuestoEditBaselineRef.current = {
        data: JSON.parse(JSON.stringify(presupuestoClonado)),
        pagoEnEfectivo: opcionActiva(presupuestoClonado.pagoEnEfectivo),
      };
      setPresupuestoEdit(presupuestoClonado);
      setPagoEnEfectivo(opcionActiva(presupuestoClonado.pagoEnEfectivo));
    }
  }, [editando, presupuesto]);

  // 5. Función para manejar pago en efectivo
  const handlePagoEnEfectivoChange = (checked) => {
    setPagoEnEfectivo(checked);
    
    // Si se activa el pago en efectivo, setear forma de pago a "efectivo"
    if (checked && presupuestoEdit) {
      setPresupuestoEdit({
        ...presupuestoEdit,
        formaPago: "efectivo"
      });
    }
  };

  // 6. Función para actualizar precios
  // Se conserva para poder reactivar la actualización manual si vuelve a ser necesaria.
  // eslint-disable-next-line no-unused-vars
  const handleActualizarPrecios = async () => {
    setLoadingPrecios(true);
    try {
      // Obtener productos actualizados desde Firebase
      const productosSnap = await getDocs(collection(db, "productos"));
      const productosActualizados = applyDerivedComboStock(productosSnap.docs.map((doc) => mapFirestoreDoc(doc)));

      // Actualizar precios de productos en presupuestoEdit
      const productosConPreciosActualizados = (
        presupuestoEdit.productos || []
      ).map((productoPresupuesto) => {
        const lineKey = productoPresupuesto.originalId || productoPresupuesto.id;
        const productoActualizado = productosActualizados.find(
          (p) =>
            p.id === lineKey ||
            (productoPresupuesto.codigo && p.codigo === productoPresupuesto.codigo)
        );
        if (productoActualizado) {
          let nuevoPrecio = 0;
          if (isComboProduct(productoActualizado)) {
            nuevoPrecio = Number(productoActualizado.precioVenta ?? productoActualizado.valorVenta ?? productoActualizado.precioCalculado ?? 0) || 0;
          } else if (productoActualizado.categoria === "Maderas") {
            const altoParsed = parseNumericValue(
              productoPresupuesto.alto ?? productoActualizado.alto
            );
            const anchoParsed = parseNumericValue(
              productoPresupuesto.ancho ?? productoActualizado.ancho
            );
            const largoParsed = parseNumericValue(
              productoPresupuesto.largo ?? productoActualizado.largo
            );
            const precioPorPieParsed = parseNumericValue(
              productoPresupuesto.precioPorPie ?? productoActualizado.precioPorPie
            );
            const alto = altoParsed === "" ? 0 : altoParsed;
            const ancho = anchoParsed === "" ? 0 : anchoParsed;
            const largo = largoParsed === "" ? 0 : largoParsed;
            const precioPorPie = precioPorPieParsed === "" ? 0 : precioPorPieParsed;
            const unidadUp = String(
              productoPresupuesto.unidad || productoPresupuesto.unidadMedida || ""
            )
              .trim()
              .toUpperCase();

            if (alto > 0 && ancho > 0 && largo > 0 && precioPorPie > 0) {
              const precioBase =
                unidadUp === "M2"
                  ? calcularPrecioMachimbre({
                      alto,
                      largo,
                      cantidad: productoPresupuesto.cantidad || 1,
                      precioPorPie,
                    })
                  : calcularPrecioCorteMadera({
                      alto,
                      ancho,
                      largo,
                      precioPorPie,
                    });
              nuevoPrecio = calcularPrecioMaderaConTratamientos(
                productoPresupuesto,
                precioBase
              );
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
              productoPresupuesto.tipoMadera ||
              productoActualizado.tipoMadera ||
              "",
            subCategoria:
              productoPresupuesto.subCategoria ||
              productoActualizado.subCategoria ||
              "",
            alto: alto,
            ancho: ancho,
            largo: largo,
            precioPorPie: precioPorPie,
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
  // Función helper para manejar valores numéricos
  const DEFAULT_CEPILLADO_PORCENTAJE = 6;
  const DEFAULT_CALIBRADO_PORCENTAJE = 3;
  const parseNumericValue = (value) => {
    if (value === "" || value === null || value === undefined) {
      return "";
    }
    if (typeof value === "number") {
      return Number.isFinite(value) ? value : "";
    }
    let normalizedValue = String(value).trim().replace(/\s/g, "");
    if (!normalizedValue) return "";
    if (normalizedValue.includes(",")) {
      normalizedValue = normalizedValue.replace(/\./g, "").replace(",", ".");
    } else if (/^\d{1,3}(\.\d{3})+$/.test(normalizedValue)) {
      normalizedValue = normalizedValue.replace(/\./g, "");
    }
    const num = Number(normalizedValue);
    return Number.isNaN(num) ? "" : num;
  };
  const normalizarCalibradoPorcentaje = (value) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return DEFAULT_CALIBRADO_PORCENTAJE;
    return Math.max(0, num);
  };
  const normalizarCepilladoPorcentaje = (value) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return DEFAULT_CEPILLADO_PORCENTAJE;
    return Math.max(0, num);
  };
  const calcularPrecioMaderaConTratamientos = (
    producto,
    precioBase,
    overrides = {}
  ) => {
    const cepilladoAplicado =
      overrides.cepilladoAplicado ?? producto.cepilladoAplicado;
    const unidadMadera = String(overrides.unidad ?? producto.unidad ?? "").trim();
    const cepilladoPorcentaje =
      unidadMadera === "M2"
        ? 0
        : normalizarCepilladoPorcentaje(
            overrides.cepilladoPorcentaje ?? producto.cepilladoPorcentaje
          );
    const calibradoAplicado =
      overrides.calibradoAplicado ?? producto.calibradoAplicado;
    const calibradoPorcentaje = normalizarCalibradoPorcentaje(
      overrides.calibradoPorcentaje ?? producto.calibradoPorcentaje
    );
    const factorCepillado =
      cepilladoAplicado
        ? 1 + cepilladoPorcentaje / 100
        : 1;
    const factorCalibrado = calibradoAplicado
      ? 1 + calibradoPorcentaje / 100
      : 1;
    return Math.round((precioBase * factorCepillado * factorCalibrado) / 100) * 100;
  };

  const recalcularTratamientosMadera = (productoId, cambios = {}) => {
    setPresupuestoEdit((prev) => ({
      ...prev,
      productos: (prev.productos || []).map((p) => {
        if (p.id === productoId && p.categoria === "Maderas") {
          let precioBase;

          if (p.unidad === "M2") {
            // Para machimbres/deck: usar la fórmula específica
            precioBase = calcularPrecioMachimbre({
              alto: p.alto,
              largo: p.largo,
              cantidad: p.cantidad || 1,
              precioPorPie: p.precioPorPie,
            });
          } else if (p.unidad === "ML") {
            precioBase = calcularPrecioMetroLineal({
              largo: p.largo,
              cantidad: p.cantidad || 1,
              precioPorPie: p.precioPorPie,
            });
          } else if (p.unidad === "Unidad") {
            const unit = Math.round((Number(p.precioPorPie) || 0) / 100) * 100;
            const cantidad = Number(p.cantidad) || 1;
            return {
              ...p,
              ...cambios,
              precio: unit,
              precioIncluyeCantidad: false,
              cepilladoAplicado: false,
              calibradoAplicado: false,
              cepilladoPorcentaje: normalizarCepilladoPorcentaje(
                cambios.cepilladoPorcentaje ?? p.cepilladoPorcentaje
              ),
              calibradoPorcentaje: normalizarCalibradoPorcentaje(
                cambios.calibradoPorcentaje ?? p.calibradoPorcentaje
              ),
              cantidad,
            };
          } else {
            // Para otras maderas: usar la fórmula estándar
            precioBase = 0.2734 * p.alto * p.ancho * p.largo * p.precioPorPie;
          }

          const precioRedondeado = calcularPrecioMaderaConTratamientos(
            p,
            precioBase,
            cambios
          );

          return {
            ...p,
            ...cambios,
            precio: precioRedondeado,
            cepilladoPorcentaje:
              p.unidad === "M2"
                ? 0
                : normalizarCepilladoPorcentaje(
                    cambios.cepilladoPorcentaje ?? p.cepilladoPorcentaje
                  ),
            calibradoPorcentaje: normalizarCalibradoPorcentaje(
              cambios.calibradoPorcentaje ?? p.calibradoPorcentaje
            ),
            precioIncluyeCantidad: p.unidad === "M2" || p.unidad === "ML",
          };
        }
        return p;
      }),
    }));
  };
  const recalcularPreciosMadera = (productoId, aplicarCepillado) => {
    recalcularTratamientosMadera(productoId, {
      cepilladoAplicado: aplicarCepillado,
    });
  };
  const handleCalibradoAplicadoChange = (productoId, aplicarCalibrado) => {
    recalcularTratamientosMadera(productoId, {
      calibradoAplicado: aplicarCalibrado,
    });
  };
  const handleCepilladoPorcentajeChange = (productoId, porcentaje) => {
    const parsed = parseNumericValue(porcentaje);
    const porcentajeNormalizado =
      parsed === "" ? 0 : normalizarCepilladoPorcentaje(parsed);
    recalcularTratamientosMadera(productoId, {
      cepilladoPorcentaje: porcentajeNormalizado,
    });
  };
  const handleCalibradoPorcentajeChange = (productoId, porcentaje) => {
    const parsed = parseNumericValue(porcentaje);
    const porcentajeNormalizado =
      parsed === "" ? 0 : normalizarCalibradoPorcentaje(parsed);
    recalcularTratamientosMadera(productoId, {
      calibradoPorcentaje: porcentajeNormalizado,
    });
  };

  // Función para recalcular precio cuando se cambia el precio por pie
  const handlePrecioPorPieChange = (id, nuevoPrecioPorPie) => {
    const parsedPrecioPorPie = parseNumericValue(nuevoPrecioPorPie);

    setPresupuestoEdit((prev) => ({
      ...prev,
      productos: (prev.productos || []).map((p) => {
        if (p.id === id && p.categoria === "Maderas") {
          let precioBase;

          if (p.unidad === "M2") {
            // Para machimbres/deck: usar la fórmula específica
            precioBase = calcularPrecioMachimbre({
              alto: p.alto,
              largo: p.largo,
              cantidad: p.cantidad || 1,
              precioPorPie: parsedPrecioPorPie === "" ? 0 : parsedPrecioPorPie,
            });
          } else if (p.unidad === "ML") {
            precioBase = calcularPrecioMetroLineal({
              largo: p.largo,
              cantidad: p.cantidad || 1,
              precioPorPie: parsedPrecioPorPie === "" ? 0 : parsedPrecioPorPie,
            });
          } else if (p.unidad === "Unidad") {
            const unit = Math.round((Number(parsedPrecioPorPie) || 0) / 100) * 100;
            return {
              ...p,
              precioPorPie: parsedPrecioPorPie,
              precio: unit,
              precioIncluyeCantidad: false,
              cepilladoAplicado: false,
              calibradoAplicado: false,
              cepilladoPorcentaje: normalizarCepilladoPorcentaje(p.cepilladoPorcentaje),
              calibradoPorcentaje: normalizarCalibradoPorcentaje(p.calibradoPorcentaje),
            };
          } else {
            // Para otras maderas: usar la fórmula estándar
            precioBase =
              0.2734 *
              p.alto *
              p.ancho *
              p.largo *
              (parsedPrecioPorPie === "" ? 0 : parsedPrecioPorPie);
          }

          const precioRedondeado = calcularPrecioMaderaConTratamientos(
            p,
            precioBase
          );

          return {
            ...p,
            precioPorPie: parsedPrecioPorPie,
            precio: precioRedondeado,
            precioIncluyeCantidad: p.unidad === "M2" || p.unidad === "ML",
          };
        }
        return p;
      }),
    }));
  };

  const handleCantidadProductoChange = (id, cantidad) => {
    const parsedCantidad = parseNumericValue(cantidad);
    const cantidadNum =
      parsedCantidad === ""
        ? 1
        : Math.max(1, Math.ceil(Number(parsedCantidad) || 1));

    setPresupuestoEdit((prev) => ({
      ...prev,
      productos: (prev.productos || []).map((prod) => {
        if (prod.id !== id) return prod;

        if (prod.categoria === "Maderas" && (prod.unidad === "M2" || prod.unidad === "ML")) {
          const precioBase =
            prod.unidad === "M2"
              ? calcularPrecioMachimbre({
                  alto: prod.alto,
                  largo: prod.largo,
                  cantidad: cantidadNum,
                  precioPorPie: prod.precioPorPie,
                })
              : calcularPrecioMetroLineal({
                  largo: prod.largo,
                  cantidad: cantidadNum,
                  precioPorPie: prod.precioPorPie,
                });

          const precioRedondeado = calcularPrecioMaderaConTratamientos(prod, precioBase);
          return { ...prod, cantidad: cantidadNum, precio: precioRedondeado, precioIncluyeCantidad: true };
        }

        return { ...prod, cantidad: cantidadNum };
      }),
    }));
  };

  const handleIncrementarCantidadProducto = (id) => {
    setPresupuestoEdit((prev) => ({
      ...prev,
      productos: (prev.productos || []).map((prod) => {
        if (prod.id !== id) return prod;
        const current = Math.max(1, Math.ceil(Number(prod.cantidad) || 1));
        const nuevaCantidad = current + 1;
        if (prod.categoria === "Maderas" && (prod.unidad === "M2" || prod.unidad === "ML")) {
          const precioBase =
            prod.unidad === "M2"
              ? calcularPrecioMachimbre({
                  alto: prod.alto,
                  largo: prod.largo,
                  cantidad: nuevaCantidad,
                  precioPorPie: prod.precioPorPie,
                })
              : calcularPrecioMetroLineal({
                  largo: prod.largo,
                  cantidad: nuevaCantidad,
                  precioPorPie: prod.precioPorPie,
                });

          const precioRedondeado = calcularPrecioMaderaConTratamientos(prod, precioBase);
          return { ...prod, cantidad: nuevaCantidad, precio: precioRedondeado, precioIncluyeCantidad: true };
        }
        return { ...prod, cantidad: nuevaCantidad };
      }),
    }));
  };

  const handleDecrementarCantidadProducto = (id) => {
    setPresupuestoEdit((prev) => ({
      ...prev,
      productos: (prev.productos || []).map((prod) => {
        if (prod.id !== id) return prod;
        const current = Math.max(1, Math.ceil(Number(prod.cantidad) || 1));
        const nuevaCantidad = Math.max(1, current - 1);
        if (prod.categoria === "Maderas" && (prod.unidad === "M2" || prod.unidad === "ML")) {
          const precioBase =
            prod.unidad === "M2"
              ? calcularPrecioMachimbre({
                  alto: prod.alto,
                  largo: prod.largo,
                  cantidad: nuevaCantidad,
                  precioPorPie: prod.precioPorPie,
                })
              : calcularPrecioMetroLineal({
                  largo: prod.largo,
                  cantidad: nuevaCantidad,
                  precioPorPie: prod.precioPorPie,
                });

          const precioRedondeado = calcularPrecioMaderaConTratamientos(prod, precioBase);
          return { ...prod, cantidad: nuevaCantidad, precio: precioRedondeado, precioIncluyeCantidad: true };
        }
        return { ...prod, cantidad: nuevaCantidad };
      }),
    }));
  };

  // Funciones para manejar cambios en machimbres/deck
  // Función para manejar cambios en alto para machimbre/deck
  const handleAltoChange = (id, nuevoAlto) => {
    const parsedAlto = parseNumericValue(nuevoAlto);

    setPresupuestoEdit((prev) => ({
      ...prev,
      productos: (prev.productos || []).map((p) => {
        if (
          p.id === id &&
          p.categoria === "Maderas" &&
          p.unidad === "M2"
        ) {
          const precioBase = calcularPrecioMachimbre({
            alto: parsedAlto === "" ? 0 : parsedAlto,
            largo: p.largo,
            cantidad: p.cantidad || 1,
            precioPorPie: p.precioPorPie,
          });

          const precioRedondeado = calcularPrecioMaderaConTratamientos(
            p,
            precioBase
          );

          return {
            ...p,
            alto: parsedAlto,
            precio: precioRedondeado,
          };
        }
        return p;
      }),
    }));
  };

  // Función para manejar cambios en ancho para machimbre/deck
  const handleAnchoChange = (id, nuevoAncho) => {
    const parsedAncho = parseNumericValue(nuevoAncho);

    setPresupuestoEdit((prev) => ({
      ...prev,
      productos: (prev.productos || []).map((p) => {
        if (
          p.id === id &&
          p.categoria === "Maderas" &&
          p.unidad === "M2"
        ) {
          const precioBase = calcularPrecioMachimbre({
            alto: p.alto,
            largo: p.largo,
            cantidad: p.cantidad || 1,
            precioPorPie: p.precioPorPie,
          });

          const precioRedondeado = calcularPrecioMaderaConTratamientos(
            p,
            precioBase
          );

          return {
            ...p,
            ancho: parsedAncho,
            precio: precioRedondeado,
          };
        }
        return p;
      }),
    }));
  };

  // Función para manejar cambios en largo para machimbre/deck
  const handleLargoChange = (id, nuevoLargo) => {
    const parsedLargo = parseNumericValue(nuevoLargo);

    setPresupuestoEdit((prev) => ({
      ...prev,
      productos: (prev.productos || []).map((p) => {
        if (
          p.id === id &&
          p.categoria === "Maderas" &&
          p.unidad === "M2"
        ) {
          const precioBase = calcularPrecioMachimbre({
            alto: p.alto,
            largo: parsedLargo === "" ? 0 : parsedLargo,
            cantidad: p.cantidad || 1,
            precioPorPie: p.precioPorPie,
          });

          const precioRedondeado = calcularPrecioMaderaConTratamientos(
            p,
            precioBase
          );

          return {
            ...p,
            largo: parsedLargo,
            precio: precioRedondeado,
          };
        }
        return p;
      }),
    }));
  };

  // Funciones para manejar cambios en dimensiones para maderas normales (no machimbres/deck)
  const handleAltoChangeMadera = (id, nuevoAlto) => {
    const parsedAlto = parseNumericValue(nuevoAlto);

    setPresupuestoEdit((prev) => ({
      ...prev,
      productos: (prev.productos || []).map((p) => {
        if (
          p.id === id &&
          p.categoria === "Maderas" &&
          p.unidad !== "M2"
        ) {
          const precioBase = calcularPrecioCorteMadera({
            alto: parsedAlto === "" ? 0 : parsedAlto,
            ancho: p.ancho,
            largo: p.largo,
            precioPorPie: p.precioPorPie,
          });

          const precioRedondeado = calcularPrecioMaderaConTratamientos(
            p,
            precioBase
          );

          return {
            ...p,
            alto: parsedAlto,
            precio: precioRedondeado,
          };
        }
        return p;
      }),
    }));
  };

  const handleAnchoChangeMadera = (id, nuevoAncho) => {
    const parsedAncho = parseNumericValue(nuevoAncho);

    setPresupuestoEdit((prev) => ({
      ...prev,
      productos: (prev.productos || []).map((p) => {
        if (
          p.id === id &&
          p.categoria === "Maderas" && p.unidad !== "M2"
        ) {
          const precioBase = calcularPrecioCorteMadera({
            alto: p.alto,
            ancho: parsedAncho === "" ? 0 : parsedAncho,
            largo: p.largo,
            precioPorPie: p.precioPorPie,
          });

          const precioRedondeado = calcularPrecioMaderaConTratamientos(
            p,
            precioBase
          );

          return {
            ...p,
            ancho: parsedAncho,
            precio: precioRedondeado,
          };
        }
        return p;
      }),
    }));
  };

  const handleLargoChangeMadera = (id, nuevoLargo) => {
    const parsedLargo = parseNumericValue(nuevoLargo);

    setPresupuestoEdit((prev) => ({
      ...prev,
      productos: (prev.productos || []).map((p) => {
        if (
          p.id === id &&
          p.categoria === "Maderas" && p.unidad !== "M2"
        ) {
          const precioBase = calcularPrecioCorteMadera({
            alto: p.alto,
            ancho: p.ancho,
            largo: parsedLargo === "" ? 0 : parsedLargo,
            precioPorPie: p.precioPorPie,
          });

          const precioRedondeado = calcularPrecioMaderaConTratamientos(
            p,
            precioBase
          );

          return {
            ...p,
            largo: parsedLargo,
            precio: precioRedondeado,
          };
        }
        return p;
      }),
    }));
  };

  const handlePrecioPorPieChangeMadera = (id, nuevoPrecioPorPie) => {
    const parsedPrecioPorPie = parseNumericValue(nuevoPrecioPorPie);

    setPresupuestoEdit((prev) => ({
      ...prev,
      productos: (prev.productos || []).map((p) => {
        if (
          p.id === id &&
          p.categoria === "Maderas" && p.unidad !== "M2"
        ) {
          const precioBase = calcularPrecioCorteMadera({
            alto: p.alto,
            ancho: p.ancho,
            largo: p.largo,
            precioPorPie: parsedPrecioPorPie === "" ? 0 : parsedPrecioPorPie,
          });

          const precioRedondeado = calcularPrecioMaderaConTratamientos(
            p,
            precioBase
          );

          return {
            ...p,
            precioPorPie: parsedPrecioPorPie,
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

  // Función para calcular precio de corte de madera
  function calcularPrecioCorteMadera({
    alto,
    ancho,
    largo,
    precioPorPie,
    factor = 0.2734,
  }) {
    if (!alto || !ancho || !largo || !precioPorPie) return 0;
    const precio = factor * alto * ancho * largo * precioPorPie;
    return Math.round(precio * 100) / 100;
  }

  // Centralizado en lib/pricing

  // Función para calcular precio de machimbre (precio por pie × alto × largo × cantidad)
  function calcularPrecioMachimbre({ alto, largo, cantidad, precioPorPie }) {
    if (
      [alto, largo, cantidad, precioPorPie].some(
        (v) => typeof v !== "number" || v <= 0
      )
    ) {
      return 0;
    }
    // Nueva fórmula: (alto × largo) × precioPorPie × cantidad
    const metrosCuadrados = alto * largo;
    const precio = metrosCuadrados * precioPorPie * cantidad;
    // Redondear a centenas (múltiplos de 100)
    return Math.round(precio / 100) * 100;
  }

  function calcularPrecioMetroLineal({ largo, cantidad, precioPorPie }) {
    if (
      [largo, cantidad, precioPorPie].some(
        (v) => typeof v !== "number" || v <= 0
      )
    ) {
      return 0;
    }
    const metrosLineales = largo * cantidad;
    const precio = metrosLineales * precioPorPie;
    return Math.round(precio / 100) * 100;
  }

  // Función auxiliar para limpiar valores undefined de un objeto
  const removeUndefined = (obj) => {
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(removeUndefined);
    return Object.fromEntries(
      Object.entries(obj)
        .filter(([_, v]) => v !== undefined)
        .map(([k, v]) => [k, removeUndefined(v)])
    );
  };

  // Funciones para manipular cantidad de productos
  const handleIncrementarCantidad = (id) => {
    setPresupuestoEdit((prev) => ({
      ...prev,
      productos: prev.productos.map((p) => {
        if (p.id === id) {
          const nuevaCantidad = p.cantidad + 1;
          
          // Si es M2, recalcular precio por m²
          if (p.categoria === "Maderas" && p.unidad === "M2") {
            const precioBase = calcularPrecioMachimbre({
              alto: p.alto,
              largo: p.largo,
              cantidad: nuevaCantidad,
              precioPorPie: p.precioPorPie,
            });

            const precioRedondeado = calcularPrecioMaderaConTratamientos(
              p,
              precioBase
            );

            return {
              ...p,
              cantidad: nuevaCantidad,
              precio: precioRedondeado,
            };
          }
          // Para otros productos, solo cambiar cantidad
          return { ...p, cantidad: nuevaCantidad };
        }
        return p;
      }),
    }));
  };

  const handleDecrementarCantidad = (id) => {
    setPresupuestoEdit((prev) => ({
      ...prev,
      productos: prev.productos.map((p) => {
        if (p.id === id) {
          const nuevaCantidad = Math.max(1, p.cantidad - 1);
          
          // Si es M2, recalcular precio por m²
          if (p.categoria === "Maderas" && p.unidad === "M2") {
            const precioBase = calcularPrecioMachimbre({
              alto: p.alto,
              largo: p.largo,
              cantidad: nuevaCantidad,
              precioPorPie: p.precioPorPie,
            });

            const precioRedondeado = calcularPrecioMaderaConTratamientos(
              p,
              precioBase
            );

            return {
              ...p,
              cantidad: nuevaCantidad,
              precio: precioRedondeado,
            };
          }
          // Para otros productos, solo cambiar cantidad
          return { ...p, cantidad: nuevaCantidad };
        }
        return p;
      }),
    }));
  };

  const handleQuitarProducto = (id) => {
    setPresupuestoEdit((prev) => ({
      ...prev,
      productos: prev.productos.filter((p) => p.id !== id),
    }));
  };
  const buildProductoUniqueId = (baseId) => {
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substr(2, 5);
    return `${baseId}-${timestamp}-${randomSuffix}`;
  };
  const handleClonarProducto = (id) => {
    setPresupuestoEdit((prev) => {
      const producto = (prev.productos || []).find((p) => p.id === id);
      if (!producto) return prev;
      const baseId = producto.originalId || producto.id;
      const duplicado = {
        ...producto,
        id: buildProductoUniqueId(baseId),
        originalId: baseId,
      };
      return {
        ...prev,
        productos: [...(prev.productos || []), duplicado],
      };
    });
  };
  const handleQuitarProductoDesdeCatalogo = (productoId) => {
    setPresupuestoEdit((prev) => {
      const productos = prev.productos || [];
      const indices = productos
        .map((p, idx) => ({ p, idx }))
        .filter(({ p }) => (p.originalId || p.id) === productoId);
      if (indices.length === 0) return prev;
      const idxToRemove = indices[indices.length - 1].idx;
      return {
        ...prev,
        productos: productos.filter((_, idx) => idx !== idxToRemove),
      };
    });
  };

  const construirProductoCatalogo = (prod) => {
    const alto = Number(prod.alto) || 0;
    const ancho = Number(prod.ancho) || 0;
    const largo = Number(prod.largo) || 0;
    const precioPorPie = Number(prod.precioPorPie) || 0;
    const unidadProd = String(prod.unidadMedida || prod.unidad || prod.unidadVenta || prod.unidadVentaHerraje || prod.unidadVentaQuimico || prod.unidadVentaHerramienta || "");
    let precioCalculado = 0;

    if (isComboProduct(prod)) {
      precioCalculado = Number(prod.precioVenta ?? prod.valorVenta ?? prod.precioCalculado ?? 0) || 0;
    } else if (prod.categoria === "Maderas") {
      const unidadNormalizada = unidadProd.toUpperCase();
      if (unidadNormalizada === "M2") {
        precioCalculado = calcularPrecioMachimbre({ alto, largo, cantidad: 1, precioPorPie });
      } else if (unidadNormalizada === "UNIDAD" || unidadNormalizada === "UN") {
        precioCalculado = Math.round(precioPorPie / 100) * 100;
      } else {
        precioCalculado = calcularPrecioCorteMadera({ alto, ancho, largo, precioPorPie });
      }
    } else if (prod.categoria === "Ferretería") {
      precioCalculado = Number(prod.valorVenta) || 0;
    } else {
      precioCalculado = Number(prod.precioUnidad || prod.precioUnidadVenta || prod.precioUnidadHerraje || prod.precioUnidadQuimico || prod.precioUnidadHerramienta || 0);
    }

    return {
      item: {
        id: prod.id,
        originalId: prod.id,
        codigo: prod.codigo || "",
        nombre: prod.nombre,
        detalle: prod.detalle || "",
        precio: precioCalculado,
        unidad: isComboProduct(prod) ? "Unidad" : unidadProd,
        stock: prod.stock,
        cantidad: 1,
        descuento: 0,
        categoria: prod.categoria,
        esCombo: isComboProduct(prod),
        tipoProducto: isComboProduct(prod) ? "combo" : (prod.tipoProducto || "simple"),
        componentesCombo: normalizeComboComponents(prod.componentesCombo),
        versionComposicion: Number(prod.versionComposicion) || 1,
        alto,
        ancho,
        largo,
        precioPorPie,
        cepilladoAplicado: unidadProd.trim().toUpperCase() === "M2",
        cepilladoPorcentaje: unidadProd.trim().toUpperCase() === "M2" ? 0 : DEFAULT_CEPILLADO_PORCENTAJE,
        calibradoAplicado: false,
        calibradoPorcentaje: DEFAULT_CALIBRADO_PORCENTAJE,
        tipoMadera: prod.tipoMadera || "",
        subcategoria: prod.subcategoria || prod.subCategoria || "",
      },
    };
  };

  const handleAgregarProductoCatalogo = (prod) => {
    const productoConstruido = construirProductoCatalogo(prod);
    setPresupuestoEdit((previous) => ({
      ...previous,
      productos: [...(previous.productos || []), productoConstruido.item],
    }));
  };

  const handleAgregarEjemplo = () => {
    const alto = 0.2;
    const largo = 3;
    const precioPorPie = 25000;
    setPresupuestoEdit((previous) => ({
      ...previous,
      productos: [...(previous.productos || []), {
        id: "ejemplo-" + Date.now(),
        nombre: "MACHIMBRE DE EJEMPLO",
        precio: calcularPrecioMachimbre({ alto, largo, cantidad: 1, precioPorPie }),
        unidad: "M2",
        stock: 100,
        cantidad: 1,
        descuento: 0,
        categoria: "Maderas",
        noInventariable: true,
        esEditable: true,
        precioIncluyeCantidad: true,
        alto,
        ancho: 0,
        largo,
        precioPorPie,
        cepilladoAplicado: true,
        cepilladoPorcentaje: 0,
        calibradoAplicado: false,
        calibradoPorcentaje: DEFAULT_CALIBRADO_PORCENTAJE,
        subcategoria: "machimbre",
      }],
    }));
  };

  // 6. Guardar cambios en Firestore
  const handleGuardarCambios = async () => {
    if (guardandoCambios) return;
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
    if (presupuestoEdit.tipoEnvio && presupuestoEdit.tipoEnvio !== "retiro_local") {
      if (!String(presupuestoEdit.fechaEntrega || "").trim()) {
        setErrorForm("Seleccioná la fecha de entrega antes de guardar.");
        return;
      }
      if (!String(presupuestoEdit.rangoHorario || "").trim()) {
        setErrorForm("Seleccioná el horario de entrega antes de guardar.");
        return;
      }
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
    setGuardandoCambios(true);
    try {
      // Recalcular totales
      const productosArr = presupuestoEdit.productos || presupuestoEdit.items;
      const costoEnvioCalculado =
        presupuestoEdit.tipoEnvio &&
        presupuestoEdit.tipoEnvio !== "retiro_local" &&
        presupuestoEdit.costoEnvio !== undefined &&
        presupuestoEdit.costoEnvio !== "" &&
        !isNaN(Number(presupuestoEdit.costoEnvio))
          ? Number(presupuestoEdit.costoEnvio)
          : 0;
      const {
        subtotal,
        descuentoTotal,
        descuentoEfectivo,
        aplicaIva: aplicaIvaSave,
        ivaPorcentaje,
        ivaMonto,
        aplicaTransferencia: aplicaTransfSave,
        transferenciaPorcentaje,
        transferenciaMonto,
        totalFinal: total,
      } = calcularTotalesPresupuesto({
        presupuesto: presupuestoEdit,
        items: productosArr,
        pagoEnEfectivo,
        costoEnvio: costoEnvioCalculado,
      });
      let numeroPedido = presupuestoEdit.numeroPedido;
      if (!numeroPedido) {
        numeroPedido = await getNextPresupuestoNumber();
      }
      
      // Preparar datos para guardar
      const dataToSave = {
        ...presupuestoEdit,
        subtotal,
        descuentoTotal,
        descuentoEfectivo,
        pagoEnEfectivo,
        aplicaIva: aplicaIvaSave,
        aplicarIva: aplicaIvaSave,
        ivaPorcentaje,
        ivaMonto,
        aplicaTransferencia: aplicaTransfSave,
        aplicarTransferencia: aplicaTransfSave,
        transferenciaPorcentaje,
        transferenciaMonto,
        total,
        costoEnvio: costoEnvioCalculado,
        productos: productosArr,
        items: productosArr,
        numeroPedido,
        fechaActualizacion: new Date().toISOString(),
        // Limpiar campos de envío si es retiro local
        ...(presupuestoEdit.tipoEnvio === "retiro_local" && {
          costoEnvio: 0,
          direccionEnvio: "",
          localidadEnvio: "",
        }),
      };
      
      // Limpiar valores undefined antes de guardar
      const cleanData = removeUndefined(dataToSave);
      
      const docRef = doc(db, "presupuestos", presupuestoEdit.id);
      await updateDoc(docRef, cleanData);
      
      setPresupuesto({
        ...presupuestoEdit,
        subtotal,
        descuentoTotal,
        descuentoEfectivo,
        pagoEnEfectivo,
        aplicaIva: aplicaIvaSave,
        aplicarIva: aplicaIvaSave,
        ivaPorcentaje,
        ivaMonto,
        aplicaTransferencia: aplicaTransfSave,
        aplicarTransferencia: aplicaTransfSave,
        transferenciaPorcentaje,
        transferenciaMonto,
        total,
        costoEnvio: costoEnvioCalculado,
        productos: productosArr,
        items: productosArr,
        numeroPedido,
        fechaActualizacion: new Date().toISOString(),
        // Limpiar campos de envío si es retiro local
        ...(presupuestoEdit.tipoEnvio === "retiro_local" && {
          costoEnvio: 0,
          direccionEnvio: "",
          localidadEnvio: "",
        }),
      });
      setEditando(false);
      presupuestoEditBaselineRef.current = null;
      setErrorForm("");
    } catch (error) {
      console.error("Error al guardar cambios:", error);
      setErrorForm(`Error al guardar: ${error.message}`);
    } finally {
      setGuardandoCambios(false);
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

  // Handler para cambiar cliente (usado por el componente ModalCambiarCliente)
  const handleClienteSeleccionado = async (clienteId, clienteData) => {
    try {
      if (!presupuesto?.id) {
        console.error("No se puede actualizar: presupuesto no disponible");
        return;
      }

      if (editando) {
        setPresupuestoEdit((previous) => ({ ...previous, clienteId, cliente: clienteData }));
        if (!clientes.some((cliente) => cliente.id === clienteId)) {
          setClientes((previous) => [...previous, { id: clienteId, ...clienteData }]);
        }
        setShowSelectorCliente(false);
        return;
      }

      // Actualizar el presupuesto en Firestore
      await updateDoc(doc(db, "presupuestos", presupuesto.id), {
        clienteId: clienteId,
        cliente: clienteData,
        fechaModificacion: new Date().toISOString(),
      });

      // Actualizar el estado local
      const presupuestoActualizado = {
        ...presupuesto,
        clienteId: clienteId,
        cliente: clienteData,
      };
      setPresupuesto(presupuestoActualizado);

      // Actualizar lista de clientes si es un cliente nuevo
      const clienteExiste = clientes.find((c) => c.id === clienteId);
      if (!clienteExiste) {
        setClientes((prev) => [...prev, { id: clienteId, ...clienteData }]);
      }
    } catch (error) {
      console.error("Error al actualizar cliente:", error);
      alert("Error al actualizar el cliente");
    }
  };

  if (loading) {
    return (
      <main className="mx-auto flex min-h-[calc(100vh-4rem)] w-full items-center justify-center px-4 py-12 text-foreground">
        <div className="text-center" role="status" aria-live="polite">
          <Loader2 className="mx-auto mb-4 h-8 w-8 animate-spin text-muted-foreground" aria-hidden="true" />
          <p className="font-medium">Cargando presupuesto…</p>
          <p className="mt-2 text-sm text-muted-foreground">N° {id}</p>
        </div>
      </main>
    );
  }

  if (error || !presupuesto) {
    return (
      <main className="mx-auto flex min-h-[calc(100vh-4rem)] w-full items-center justify-center px-4 py-12 text-foreground">
        <div className="max-w-md text-center">
          <h2 className="text-2xl font-semibold tracking-tight">Presupuesto no encontrado</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {error || "El presupuesto que buscás no existe o ya no está disponible."}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Button type="button" variant="outline" onClick={() => router.back()}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Volver
            </Button>
            <Button type="button" onClick={() => router.push(`/${lang}/presupuestos`)}>
              Ver todos los presupuestos
            </Button>
          </div>
        </div>
      </main>
    );
  }

  // Función para descargar PDF - Optimizada
  const handleDownloadPDF = async (paraEmpleado = false) => {
    if (!presupuesto?.id) return;
    
    // Activar loading inmediatamente
    if (paraEmpleado) {
      setDownloadingPDFEmpleado(true);
    } else {
      setDownloadingPDF(true);
    }
    
    try {
      // Usar AbortController para poder cancelar si es necesario
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout
      
      const res = await fetch("/api/pdf/remito", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: "presupuesto",
          id: presupuesto.id,
          empleado: paraEmpleado,
        }),
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (!res.ok) {
        const errorText = await res.text();
        console.error("Error generando remito PDF", errorText);
        alert("Error al generar el PDF. Por favor, intenta nuevamente.");
        return;
      }
      
      // Convertir a blob y descargar inmediatamente
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${presupuesto.numeroPedido || presupuesto.id?.slice(-8) || "documento"}${paraEmpleado ? "-empleado" : ""}.pdf`;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      
      // Limpiar inmediatamente después del click
      setTimeout(() => {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      }, 100);
    } catch (e) {
      if (e?.name === "AbortError") {
        alert("La descarga tardó demasiado. Por favor, intenta nuevamente.");
      } else {
        console.error("Error descargando remito PDF", e);
        alert("Error al descargar el PDF. Por favor, intenta nuevamente.");
      }
    } finally {
      // Desactivar loading
      if (paraEmpleado) {
        setDownloadingPDFEmpleado(false);
      } else {
        setDownloadingPDF(false);
      }
    }
  };

  // Utilidades para asegurar arrays y números seguros
  function safeArray(val) {
    return Array.isArray(val) ? val : [];
  }
  function safeNumber(val) {
    const n = Number(val);
    return isNaN(n) ? 0 : n;
  }

  const hayCambiosPresupuesto = Boolean(
    editando &&
    presupuestoEdit &&
    presupuestoEditBaselineRef.current &&
    (
      JSON.stringify(presupuestoEdit) !== JSON.stringify(presupuestoEditBaselineRef.current.data) ||
      pagoEnEfectivo !== presupuestoEditBaselineRef.current.pagoEnEfectivo
    )
  );

  const numeroPresupuesto = String(presupuesto.numeroPedido || presupuesto.id?.slice(-8) || "—");
  const itemsPresupuesto = safeArray(presupuesto.productos).length > 0
    ? safeArray(presupuesto.productos)
    : safeArray(presupuesto.items);
  const totalesPresupuesto = calcularTotalesPresupuesto({ presupuesto, items: itemsPresupuesto });
  const presupuestoAnulado = String(presupuesto.estado || "").trim().toLowerCase() === "anulada" || presupuesto.anulada === true;
  const formatearImporte = (valor) => {
    const numero = Number(valor);
    const seguro = Number.isFinite(numero) ? numero : 0;
    return `$ ${new Intl.NumberFormat("es-AR", {
      minimumFractionDigits: Number.isInteger(seguro) ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(seguro)}`;
  };
  const renderResumenTotales = (totales) => (
    <div className="space-y-2 text-sm">
      <div className="flex justify-between gap-4"><span className="text-muted-foreground">Subtotal bruto</span><span className="tabular-nums">{formatearImporte(totales.subtotal)}</span></div>
      <div className="flex justify-between gap-4"><span className="text-muted-foreground">Descuento de productos</span><span className="tabular-nums">− {formatearImporte(totales.descuentoTotal)}</span></div>
      <div className="flex justify-between gap-4 border-t border-border/60 pt-2 font-medium"><span>Subtotal neto</span><span className="tabular-nums">{formatearImporte(totales.subtotalConDescuento)}</span></div>
      {totales.descuentoEfectivo > 0 ? <div className="flex justify-between gap-4"><span className="text-muted-foreground">Descuento por efectivo (10%)</span><span className="tabular-nums text-success">− {formatearImporte(totales.descuentoEfectivo)}</span></div> : null}
      {totales.aplicaIva ? <div className="flex justify-between gap-4"><span className="text-muted-foreground">IVA ({totales.ivaPorcentaje}%)</span><span className="tabular-nums">{formatearImporte(totales.ivaMonto)}</span></div> : null}
      {totales.aplicaTransferencia ? <div className="flex justify-between gap-4"><span className="text-muted-foreground">Adicional por transferencia ({totales.transferenciaPorcentaje}%)</span><span className="tabular-nums">{formatearImporte(totales.transferenciaMonto)}</span></div> : null}
      {totales.envio > 0 ? <div className="flex justify-between gap-4"><span className="text-muted-foreground">Envío estimado</span><span className="tabular-nums">{formatearImporte(totales.envio)}</span></div> : null}
      <div className="flex items-end justify-between gap-4 border-t border-border/60 pt-3"><span className="font-semibold">Total del presupuesto</span><span className="text-xl font-bold tabular-nums text-foreground">{formatearImporte(totales.totalFinal)}</span></div>
    </div>
  );

  return (
    <main className="mx-auto min-h-[calc(100vh-4rem)] w-full px-3 py-4 font-sans text-foreground sm:px-6 sm:py-7">
      <style>{`
        @keyframes presupuesto-fade-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        .presupuesto-fade-in { animation: presupuesto-fade-in .24s ease-out; }
        @media (prefers-reduced-motion: reduce) { .presupuesto-fade-in { animation: none; } }
        .presupuesto-productos-responsive th { color: var(--muted-foreground); font-size: .75rem !important; font-weight: 500 !important; opacity: .72; }
        .presupuesto-productos-responsive td { color: var(--foreground); }
        .presupuesto-productos-responsive .text-gray-600, .presupuesto-productos-responsive .text-gray-800 { color: var(--muted-foreground) !important; }
        @media screen {
          .presupuesto-productos-responsive thead tr { border-bottom-color: color-mix(in srgb, var(--border) 42%, transparent) !important; }
          .presupuesto-productos-responsive tbody tr { border-bottom-color: color-mix(in srgb, var(--border) 26%, transparent) !important; }
        }
        @media (max-width: 767px) {
          .presupuesto-productos-responsive > div { overflow: visible !important; }
          .presupuesto-productos-responsive table, .presupuesto-productos-responsive tbody { display: block; width: 100%; }
          .presupuesto-productos-responsive thead { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
          .presupuesto-productos-responsive tbody { display: grid; gap: .75rem; }
          .presupuesto-productos-responsive tr { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); overflow: hidden; border-bottom: 1px solid color-mix(in srgb, var(--border) 26%, transparent) !important; border-radius: .65rem; }
          .presupuesto-productos-responsive td { display: flex; min-width: 0; align-items: flex-start; justify-content: space-between; gap: .5rem; padding: .65rem !important; text-align: right !important; font-size: .8rem !important; }
          .presupuesto-productos-responsive td::before { flex: 0 1 auto; color: var(--muted-foreground); content: ""; font-size: .7rem; text-align: left; font-weight: 500; }
          .presupuesto-productos-responsive td:first-child { display: block; grid-column: 1 / -1; border-bottom: 1px solid color-mix(in srgb, var(--border) 20%, transparent) !important; padding: .8rem !important; text-align: left !important; }
          .presupuesto-productos-responsive td:first-child::before { content: none; }
          .presupuesto-productos-responsive td:nth-child(2)::before { content: "Cantidad"; }
          .presupuesto-productos-responsive td:nth-child(3)::before { content: "Cepillado"; }
          .presupuesto-productos-responsive td:nth-child(4)::before { content: "Calibrado"; }
          .presupuesto-productos-responsive td:nth-child(5)::before { content: "Precio unit."; }
          .presupuesto-productos-responsive td:nth-child(6)::before { content: "Descuento"; }
          .presupuesto-productos-responsive td:nth-child(7)::before { content: "Subtotal"; }
        }
        @media print {
          @page { margin: 16mm; size: A4; }
          body { margin: 0 !important; padding: 0 !important; }
          body * { visibility: hidden !important; }
          #presupuesto-print, #presupuesto-print * { visibility: visible !important; }
          #presupuesto-print .no-print, #presupuesto-print .no-print * { display: none !important; }
          #presupuesto-print { position: absolute !important; inset: 0 auto auto 0 !important; width: 100% !important; padding: 0 !important; background: white !important; color: #111827 !important; }
          #presupuesto-print .print-header { display: flex !important; }
          #presupuesto-print .print-section { break-inside: avoid; border-color: #d1d5db !important; background: white !important; box-shadow: none !important; }
          #presupuesto-print table th, #presupuesto-print table td { padding-top: 5px !important; padding-bottom: 5px !important; }
        }
      `}</style>
      <div id="presupuesto-print" className="mx-auto">
        <div className="print-header mb-5 hidden items-center gap-4 border-b border-border pb-4">
          <img src="/logo-maderera.png" alt="Maderas Caballero" className="h-[60px] w-auto" />
          <div><h1 className="text-2xl font-bold tracking-wide">Maderas Caballero</h1><div className="text-sm">Presupuesto / Cotización</div><div className="text-xs text-muted-foreground">www.caballeromaderas.com</div></div>
          <div className="ml-auto text-right text-xs text-muted-foreground"><div>Fecha: {presupuesto.fecha ? formatFechaLocal(presupuesto.fecha) : "—"}</div><div>Válido hasta: {presupuesto.fecha ? formatFechaLocal(calcularFechaVencimiento(presupuesto.fecha)) : "—"}</div><div>N°: {numeroPresupuesto}</div></div>
        </div>

        <header className="no-print mb-5 border-b border-border/60 pb-5 pt-1">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <Button type="button" variant="outline" aria-label="Volver a presupuestos" onClick={() => router.back()} className="mt-1 h-11 w-11 shrink-0 rounded-xl border-border bg-card p-0 text-foreground shadow-sm hover:bg-muted"><ArrowLeft className="h-5 w-5" /></Button>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1"><h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">PRESUPUESTO-{numeroPresupuesto}</h1><span className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold ${presupuestoAnulado ? "bg-destructive/10 text-destructive" : "bg-muted text-foreground"}`}><span className={`h-1.5 w-1.5 rounded-full ${presupuestoAnulado ? "bg-destructive" : "bg-primary"}`} />{presupuestoAnulado ? "Anulado" : (presupuesto.tipo || "Presupuesto")}</span></div>
                <p className="mt-1.5 text-sm text-muted-foreground">{presupuesto.fecha ? formatFechaLocal(presupuesto.fecha) : "Fecha sin registrar"}<span className="px-1.5">·</span>{presupuesto.fecha ? `Válido hasta ${formatFechaLocal(calcularFechaVencimiento(presupuesto.fecha))}` : "Cotización"}</p>
                {presupuesto.observaciones && !editando ? <p className="mt-2 max-w-3xl whitespace-pre-line text-sm text-muted-foreground">{presupuesto.observaciones}</p> : null}
              </div>
            </div>
            <div className="no-print flex w-full flex-wrap items-center gap-2 xl:w-auto xl:justify-end">
              <Button type="button" variant="outline" onClick={(event) => handlePrintPDF(false, event)} disabled={printingPDF || printingPDFEmpleado || downloadingPDF || downloadingPDFEmpleado} className="h-10 w-full rounded-lg border-border bg-card px-3 text-sm text-foreground shadow-sm hover:bg-muted sm:w-auto">{printingPDF ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Printer className="mr-2 h-4 w-4" />}Imprimir</Button>
              <Button type="button" variant="outline" onClick={(event) => handlePrintPDF(true, event)} disabled={printingPDF || printingPDFEmpleado || downloadingPDF || downloadingPDFEmpleado} className="h-10 w-full rounded-lg border-border bg-card px-3 text-sm text-foreground shadow-sm hover:bg-muted hover:text-foreground sm:w-auto">{printingPDFEmpleado ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <User className="mr-2 h-4 w-4" />}Imprimir empleado</Button>
              <details className="group relative w-full sm:w-auto"><summary className="flex h-10 cursor-pointer list-none items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">{downloadingPDF || downloadingPDFEmpleado ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}Descargar<ChevronDown className="h-4 w-4 text-muted-foreground" /></summary><div className="absolute right-0 top-full z-30 mt-2 w-56 rounded-lg border border-border bg-popover p-1.5 text-popover-foreground shadow-lg"><button type="button" disabled={downloadingPDF || downloadingPDFEmpleado || printingPDF || printingPDFEmpleado} onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); handleDownloadPDF(false); }} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"><FileText className="h-4 w-4" />Presupuesto</button><button type="button" disabled={downloadingPDF || downloadingPDFEmpleado || printingPDF || printingPDFEmpleado} onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); handleDownloadPDF(true); }} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"><User className="h-4 w-4" />Versión para empleado</button></div></details>
              {editando ? <Button type="button" variant="outline" onClick={() => { setEditando(false); setPresupuestoEdit(null); presupuestoEditBaselineRef.current = null; setErrorForm(""); }} disabled={loadingPrecios || guardandoCambios} className="h-10 w-full rounded-lg border-border px-3 text-sm sm:w-auto"><X className="mr-2 h-4 w-4" />Cancelar</Button> : <><Button type="button" onClick={() => { setConvirtiendoVenta(false); setEditando(true); }} className="h-10 w-full rounded-lg bg-foreground px-3 text-sm text-background hover:bg-foreground/90 sm:w-auto"><Edit className="mr-2 h-4 w-4" />Editar</Button><Button type="button" variant="outline" onClick={() => setConvirtiendoVenta(true)} className="h-10 w-full rounded-lg border-border bg-card px-3 text-sm text-foreground shadow-sm hover:bg-muted hover:text-foreground sm:w-auto"><Plus className="mr-2 h-4 w-4" />Convertir a venta</Button></>}
            </div>
          </div>
        </header>

        {!editando ? (
          <div className="presupuesto-fade-in space-y-5">
            <section className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-[1fr_1.08fr_.92fr]">
              <article className="print-section min-w-0 rounded-xl border border-border/60 bg-card p-4 sm:p-5">
                <div className="mb-4 flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-lg bg-muted text-foreground"><User className="h-5 w-5" /></span><h2 className="text-lg font-semibold tracking-tight">Cliente</h2></div>
                <div className="break-words border-b border-border/60 pb-4 text-lg font-semibold uppercase tracking-wide">{presupuesto.cliente?.nombre || "Cliente sin nombre"}</div>
                <dl className="mt-4 space-y-3 text-sm">
                  <div className="grid grid-cols-[minmax(6.5rem,.8fr)_minmax(0,1.2fr)] gap-3"><dt className="flex items-center gap-2 text-muted-foreground"><IdCard className="h-4 w-4 shrink-0" />DNI / CUIT</dt><dd className="break-all font-medium">{presupuesto.cliente?.dni || presupuesto.cliente?.cuit || presupuesto.cliente?.cuil || "—"}</dd></div>
                  <div className="grid grid-cols-[minmax(6.5rem,.8fr)_minmax(0,1.2fr)] gap-3"><dt className="flex items-center gap-2 text-muted-foreground"><Phone className="h-4 w-4 shrink-0" />Teléfono</dt><dd className="break-all font-medium">{presupuesto.cliente?.telefono || "—"}</dd></div>
                  <div className="grid grid-cols-[minmax(6.5rem,.8fr)_minmax(0,1.2fr)] gap-3"><dt className="flex items-center gap-2 text-muted-foreground"><Mail className="h-4 w-4 shrink-0" />Email</dt><dd className="break-all font-medium">{presupuesto.cliente?.email || "—"}</dd></div>
                  <div className="grid grid-cols-[minmax(6.5rem,.8fr)_minmax(0,1.2fr)] gap-3"><dt className="flex items-center gap-2 text-muted-foreground"><MapPin className="h-4 w-4 shrink-0" />Dirección</dt><dd className="break-words font-medium">{presupuesto.cliente?.direccion || "—"}</dd></div>
                  {[['Partido', presupuesto.cliente?.partido], ['Barrio', presupuesto.cliente?.barrio], ['Área', presupuesto.cliente?.area], ['Lote', presupuesto.cliente?.lote], ['Descripción', presupuesto.cliente?.descripcion]].filter(([, value]) => value).map(([label, value]) => <div key={label} className="grid grid-cols-[minmax(6.5rem,.8fr)_minmax(0,1.2fr)] gap-3"><dt className="text-muted-foreground">{label}</dt><dd className="break-words font-medium">{value}</dd></div>)}
                </dl>
              </article>

              <article className="print-section min-w-0 rounded-xl border border-border/60 bg-card p-4 sm:p-5">
                <div className="mb-4 flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-lg bg-muted text-foreground"><Truck className="h-5 w-5" /></span><h2 className="text-lg font-semibold tracking-tight">Presupuesto y entrega</h2></div>
                <dl className="space-y-3 break-words text-sm">
                  <div className="grid grid-cols-[minmax(7rem,.85fr)_minmax(0,1.15fr)] gap-3"><dt className="flex items-center gap-2 text-muted-foreground"><CalendarDays className="h-4 w-4 shrink-0" />Emisión</dt><dd className="font-medium">{presupuesto.fecha ? formatFechaLocal(presupuesto.fecha) : "—"}</dd></div>
                  <div className="grid grid-cols-[minmax(7rem,.85fr)_minmax(0,1.15fr)] gap-3"><dt className="flex items-center gap-2 text-muted-foreground"><CalendarDays className="h-4 w-4 shrink-0" />Válido hasta</dt><dd className="font-medium">{presupuesto.fecha ? formatFechaLocal(calcularFechaVencimiento(presupuesto.fecha)) : "—"}</dd></div>
                  <div className="grid grid-cols-[minmax(7rem,.85fr)_minmax(0,1.15fr)] gap-3"><dt className="flex items-center gap-2 text-muted-foreground"><Tag className="h-4 w-4 shrink-0" />Estado</dt><dd><span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold ${presupuestoAnulado ? "bg-destructive/10 text-destructive" : "bg-muted text-foreground"}`}><span className={`h-1.5 w-1.5 rounded-full ${presupuestoAnulado ? "bg-destructive" : "bg-primary"}`} />{presupuestoAnulado ? "Anulado" : "Presupuesto"}</span></dd></div>
                  <div className="grid grid-cols-[minmax(7rem,.85fr)_minmax(0,1.15fr)] gap-3"><dt className="flex items-center gap-2 text-muted-foreground"><Package className="h-4 w-4 shrink-0" />Modalidad</dt><dd className="font-semibold">{presupuesto.tipoEnvio === "retiro_local" ? "Retiro en local" : presupuesto.tipoEnvio ? String(presupuesto.tipoEnvio).replaceAll("_", " ") : "Sin definir"}</dd></div>
                  {presupuesto.tipoEnvio && presupuesto.tipoEnvio !== "retiro_local" ? <><div className="grid grid-cols-[minmax(7rem,.85fr)_minmax(0,1.15fr)] gap-3"><dt className="flex items-center gap-2 text-muted-foreground"><MapPin className="h-4 w-4 shrink-0" />Dirección</dt><dd className="font-medium">{presupuesto.usarDireccionCliente === false ? presupuesto.direccionEnvio || "—" : presupuesto.cliente?.direccion || "—"}</dd></div><div className="grid grid-cols-[minmax(7rem,.85fr)_minmax(0,1.15fr)] gap-3"><dt className="flex items-center gap-2 text-muted-foreground"><MapPin className="h-4 w-4 shrink-0" />Localidad</dt><dd className="font-medium">{presupuesto.usarDireccionCliente === false ? presupuesto.localidadEnvio || "—" : presupuesto.cliente?.localidad || "—"}</dd></div></> : null}
                  {(presupuesto.fechaEntrega || presupuesto.rangoHorario) ? <div className="grid grid-cols-[minmax(7rem,.85fr)_minmax(0,1.15fr)] gap-3 border-t border-border/60 pt-3"><dt className="flex items-center gap-2 text-muted-foreground"><Clock3 className="h-4 w-4 shrink-0" />Entrega prevista</dt><dd className="font-medium">{[presupuesto.fechaEntrega ? formatFechaLocal(presupuesto.fechaEntrega) : "", presupuesto.rangoHorario || ""].filter(Boolean).join(" · ")}</dd></div> : null}
                  {presupuesto.costoEnvio !== undefined && Number(presupuesto.costoEnvio) > 0 ? <div className="grid grid-cols-[minmax(7rem,.85fr)_minmax(0,1.15fr)] gap-3"><dt className="flex items-center gap-2 text-muted-foreground"><Banknote className="h-4 w-4 shrink-0" />Envío estimado</dt><dd className="font-medium tabular-nums">{formatearImporte(presupuesto.costoEnvio)}</dd></div> : null}
                  {presupuesto.vendedor ? <div className="grid grid-cols-[minmax(7rem,.85fr)_minmax(0,1.15fr)] gap-3"><dt className="text-muted-foreground">Vendedor</dt><dd className="font-medium">{presupuesto.vendedor}</dd></div> : null}
                </dl>
              </article>

              <aside className="print-section min-w-0 rounded-xl border border-border/60 bg-card p-4 sm:p-5"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-lg bg-muted text-foreground"><Banknote className="h-5 w-5" /></span><h2 className="text-lg font-semibold tracking-tight">Resumen económico</h2></div><p className="mt-1 text-sm text-muted-foreground">Importes de la cotización, no pagos registrados.</p><div className="mt-5">{renderResumenTotales(totalesPresupuesto)}</div></aside>
            </section>

            <section className="print-section rounded-xl border border-border/60 bg-card p-4 sm:p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-lg bg-muted text-foreground"><Package className="h-5 w-5" /></span><div><h2 className="text-lg font-semibold tracking-tight">Productos y servicios</h2><p className="text-sm text-muted-foreground">{itemsPresupuesto.length} ítem{itemsPresupuesto.length === 1 ? "" : "s"} cotizado{itemsPresupuesto.length === 1 ? "" : "s"}</p></div></div></div>
              {itemsPresupuesto.length > 0 ? <div className="presupuesto-productos-responsive"><DetalleVentaPresupuestoItemsTable items={itemsPresupuesto} formatearNumeroArgentino={(value) => new Intl.NumberFormat("es-AR", { minimumFractionDigits: Number(value) % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 }).format(Number(value) || 0)} paraEmpleado={false} /></div> : <div className="border-t border-border/60 py-8 text-center"><p className="font-medium">Este presupuesto todavía no tiene productos.</p><p className="mt-1 text-sm text-muted-foreground">Al editarlo, vas a poder agregar productos y servicios.</p></div>}
              {presupuesto.observaciones ? <aside className="mt-5 grid gap-3 border-t border-border/60 pt-4 sm:grid-cols-[minmax(10rem,.4fr)_minmax(0,1.6fr)]"><div className="flex items-center gap-2 text-sm font-medium"><ClipboardList className="h-4 w-4 text-muted-foreground" />Observaciones</div><p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">{presupuesto.observaciones}</p></aside> : null}
            </section>
          </div>
        ) : presupuestoEdit ? (
          <div className="presupuesto-fade-in flex flex-col gap-5 pb-24 pt-1">
            {errorForm ? <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">{errorForm}</div> : null}
            <section className="flex flex-col gap-4 rounded-xl border border-border/60 bg-card p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"><div className="min-w-0"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Cliente del presupuesto</p><h2 className="mt-1 truncate text-lg font-semibold uppercase">{presupuestoEdit.cliente?.nombre || "Cliente sin nombre"}</h2><p className="mt-1 break-words text-sm text-muted-foreground">{[presupuestoEdit.cliente?.cuit, presupuestoEdit.cliente?.telefono, presupuestoEdit.cliente?.email].filter(Boolean).join(" · ") || "Sin datos de contacto"}</p></div><Button type="button" variant="outline" onClick={() => setShowSelectorCliente(true)} className="shrink-0 rounded-lg border-border"><Edit className="mr-2 h-4 w-4" />Cambiar cliente</Button></section>

            <section className="rounded-xl border border-border/60 bg-card p-4 sm:p-5">
              <header className="mb-5"><h2 className="text-lg font-semibold tracking-tight">Entrega e información</h2><p className="mt-1 text-sm text-muted-foreground">Modalidad, destino y observaciones del presupuesto.</p></header>
              <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(18rem,.8fr)] lg:gap-7">
                <div className="min-w-0 space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2"><label className="block space-y-1.5"><span className="text-sm font-medium">Tipo de envío</span><select value={presupuestoEdit.tipoEnvio || ""} onChange={(event) => { const tipoEnvio = event.target.value; setPresupuestoEdit((previous) => { const next = { ...previous, tipoEnvio }; if (tipoEnvio === "retiro_local") { next.costoEnvio = ""; next.direccionEnvio = ""; next.localidadEnvio = ""; } if (tipoEnvio && tipoEnvio !== "retiro_local" && previous.tipoEnvio === "retiro_local") { next.usarDireccionCliente = true; next.costoEnvio = "0"; } return next; }); }} className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><option value="">Seleccionar…</option><option value="retiro_local">Retiro en local</option><option value="envio_domicilio">Envío a domicilio</option></select></label>
                    {presupuestoEdit.tipoEnvio && presupuestoEdit.tipoEnvio !== "retiro_local" ? <label className="flex items-center justify-between gap-3 rounded-md bg-muted/40 px-3 py-2.5"><span className="text-sm font-medium">Usar dirección del cliente</span><input type="checkbox" checked={presupuestoEdit.usarDireccionCliente !== false} onChange={(event) => setPresupuestoEdit((previous) => ({ ...previous, usarDireccionCliente: event.target.checked }))} className="h-4 w-4 rounded border-input text-primary focus:ring-ring" /></label> : null}
                  </div>
                  {presupuestoEdit.tipoEnvio && presupuestoEdit.tipoEnvio !== "retiro_local" ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,.8fr)_minmax(9rem,.65fr)]"><label className="block min-w-0 space-y-1.5 sm:col-span-2 xl:col-span-1"><span className="text-sm font-medium">Dirección de entrega</span>{presupuestoEdit.usarDireccionCliente === false ? <GoogleAddressInput value={presupuestoEdit.direccionEnvio || ""} onChange={({ address, locality, lat, lng, mapsUrl }) => setPresupuestoEdit((previous) => ({ ...previous, direccionEnvio: address, localidadEnvio: locality || previous.localidadEnvio, direccionMapsUrl: mapsUrl, direccionLat: lat, direccionLng: lng }))} placeholder="Buscar dirección" className="w-full" /> : <Input value={presupuestoEdit.cliente?.direccion || ""} readOnly placeholder="Sin dirección cargada" className="h-10 bg-muted/30" />}</label><label className="block space-y-1.5"><span className="text-sm font-medium">Localidad</span>{presupuestoEdit.usarDireccionCliente === false ? <Input value={presupuestoEdit.localidadEnvio || ""} onChange={(event) => setPresupuestoEdit((previous) => ({ ...previous, localidadEnvio: event.target.value }))} placeholder="Localidad o ciudad" className="h-10" /> : <Input value={presupuestoEdit.cliente?.localidad || ""} readOnly placeholder="Sin localidad cargada" className="h-10 bg-muted/30" />}</label><label className="block space-y-1.5"><span className="text-sm font-medium">Costo de envío</span><Input type="number" min="0" step="0.01" value={presupuestoEdit.costoEnvio || ""} onChange={(event) => setPresupuestoEdit((previous) => ({ ...previous, costoEnvio: event.target.value }))} placeholder="0" className="h-10 tabular-nums" /></label></div> : null}
                  {presupuestoEdit.tipoEnvio ? <DeliveryScheduleInput fechaEntrega={presupuestoEdit.fechaEntrega || ""} rangoHorario={presupuestoEdit.rangoHorario || ""} required={presupuestoEdit.tipoEnvio !== "retiro_local"} description={presupuestoEdit.tipoEnvio === "retiro_local" ? "Fecha y horario de retiro opcionales." : "Definí la fecha y la franja horaria de entrega."} onFechaEntregaChange={(value) => setPresupuestoEdit((previous) => ({ ...previous, fechaEntrega: value }))} onRangoHorarioChange={(value) => setPresupuestoEdit((previous) => ({ ...previous, rangoHorario: value }))} /> : <p className="text-sm text-muted-foreground">Seleccioná una modalidad para definir fecha y horario.</p>}
                </div>
                <div className="min-w-0 space-y-4 border-t border-border/50 pt-4 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0"><div><p className="text-sm font-semibold">Información adicional</p><p className="mt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Vendedor</p><p className="mt-1 break-words text-sm">{presupuestoEdit.vendedor || "Sin vendedor asignado"}</p></div><label className="block space-y-1.5"><span className="text-sm font-medium">Observaciones</span><Textarea value={presupuestoEdit.observaciones || ""} onChange={(event) => setPresupuestoEdit((previous) => ({ ...previous, observaciones: event.target.value }))} placeholder="Agregá detalles relevantes para esta cotización." rows={4} className="min-h-24 resize-y leading-relaxed" /></label></div>
              </div>
            </section>

            <ProductosVentaEditor
              items={presupuestoEdit.productos || []}
              productos={productos}
              onAgregarProductoCatalogo={handleAgregarProductoCatalogo}
              getProductoCatalogoPreview={construirProductoCatalogo}
              onAgregarEjemplo={handleAgregarEjemplo}
              onQuitarProductoDesdeCatalogo={handleQuitarProductoDesdeCatalogo}
              loadingPrecios={loadingPrecios}
              pagoEnEfectivo={pagoEnEfectivo}
              onPagoEnEfectivoChange={handlePagoEnEfectivoChange}
              idPagoEnEfectivo="presupuesto-pago-efectivo"
              textoPagoEnEfectivo="Pago en efectivo (-10%)"
              formatearNumeroArgentino={formatearNumeroArgentino}
              defaultCepilladoPorcentaje={DEFAULT_CEPILLADO_PORCENTAJE}
              defaultCalibradoPorcentaje={DEFAULT_CALIBRADO_PORCENTAJE}
              disableMaderaTreatmentsForUnit
              clampDiscount
              showWhenEmpty
              onNombreChange={(id, nombre) => setPresupuestoEdit((previous) => ({
                ...previous,
                productos: previous.productos.map((item) => item.id === id ? { ...item, nombre } : item),
              }))}
              onDimensionChange={(id, campo, value, producto) => {
                if (campo === "alto") {
                  return producto.unidad === "M2"
                    ? handleAltoChange(id, value)
                    : handleAltoChangeMadera(id, value);
                }
                if (campo === "ancho") return handleAnchoChangeMadera(id, value);
                if (campo === "largo") {
                  return producto.unidad === "M2"
                    ? handleLargoChange(id, value)
                    : handleLargoChangeMadera(id, value);
                }
              }}
              onPrecioPorPieChange={(id, value, producto) => producto.unidad === "M2"
                ? handlePrecioPorPieChange(id, value)
                : handlePrecioPorPieChangeMadera(id, value)}
              onCantidadChange={handleCantidadProductoChange}
              onIncrementarCantidad={handleIncrementarCantidadProducto}
              onDecrementarCantidad={handleDecrementarCantidadProducto}
              onCepilladoChange={recalcularPreciosMadera}
              onCepilladoPorcentajeChange={handleCepilladoPorcentajeChange}
              onCalibradoChange={handleCalibradoAplicadoChange}
              onCalibradoPorcentajeChange={handleCalibradoPorcentajeChange}
              onPrecioChange={(id, value, producto) => {
                const parsed = value === "" ? "" : Number(value);
                setPresupuestoEdit((previous) => ({
                  ...previous,
                  productos: previous.productos.map((item) => {
                    if (item.id !== id) return item;
                    const price = parsed === "" ? 0 : Number(parsed);
                    const includesQuantity = item.categoria === "Maderas" && ["M2", "ML"].includes(item.unidad);
                    return {
                      ...item,
                      precio: includesQuantity ? price * (Number(item.cantidad) || 1) : parsed,
                      precioIncluyeCantidad: includesQuantity,
                    };
                  }),
                }));
              }}
              onDescuentoChange={(id, value) => {
                const parsed = parseNumericValue(value);
                setPresupuestoEdit((previous) => ({
                  ...previous,
                  productos: previous.productos.map((item) => item.id === id
                    ? { ...item, descuento: parsed === "" ? 0 : parsed }
                    : item),
                }));
              }}
              onClonarProducto={handleClonarProducto}
              onQuitarProducto={handleQuitarProducto}
              footer={(
                <div className="mt-5 space-y-4 border-t border-border/60 px-4 pb-4 pt-4 sm:px-5 sm:pb-5">
                  <section className="overflow-hidden rounded-xl border border-border/60 bg-card">
                    <header className="flex items-center gap-3 border-b border-border/60 px-4 py-3 sm:px-5">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-muted text-foreground" aria-hidden="true">
                        <BadgePercent className="h-5 w-5" />
                      </span>
                      <div className="min-w-0">
                        <h3 className="text-base font-semibold text-foreground">Impuestos y descuentos</h3>
                        <p className="text-xs text-muted-foreground sm:text-sm">Aplicá los porcentajes configurados para este presupuesto.</p>
                      </div>
                    </header>
                    <div className="grid gap-3 p-3 lg:grid-cols-[minmax(0,1fr)_1px_minmax(0,1fr)] lg:gap-4 lg:p-4">
                      <ConfiguracionPorcentajeCard
                        title="Aplicar IVA"
                        Icon={ReceiptText}
                        checked={Boolean(presupuestoEdit.aplicaIva)}
                        percentage={presupuestoEdit.ivaPorcentaje ?? 21}
                        onCheckedChange={(checked) => setPresupuestoEdit((previous) => ({
                          ...previous,
                          aplicaIva: checked,
                          aplicarIva: checked,
                        }))}
                        onPercentageChange={(value) => setPresupuestoEdit((previous) => ({
                          ...previous,
                          ivaPorcentaje: value,
                        }))}
                        disabled={loadingPrecios}
                      />
                      <span className="hidden bg-border lg:block" aria-hidden="true" />
                      <ConfiguracionPorcentajeCard
                        title="Aplicar transferencia"
                        Icon={ArrowLeftRight}
                        checked={Boolean(presupuestoEdit.aplicaTransferencia)}
                        percentage={presupuestoEdit.transferenciaPorcentaje ?? 10}
                        onCheckedChange={(checked) => setPresupuestoEdit((previous) => ({
                          ...previous,
                          aplicaTransferencia: checked,
                          aplicarTransferencia: checked,
                        }))}
                        onPercentageChange={(value) => setPresupuestoEdit((previous) => ({
                          ...previous,
                          transferenciaPorcentaje: value,
                        }))}
                        disabled={loadingPrecios}
                      />
                    </div>
                  </section>
                  <aside className="ml-auto w-full max-w-2xl rounded-lg bg-muted/30 p-4">
                    <h3 className="mb-3 text-sm font-semibold">Totales recalculados</h3>
                    {renderResumenTotales(calcularTotalesPresupuesto({
                      presupuesto: presupuestoEdit,
                      items: presupuestoEdit.productos || [],
                      pagoEnEfectivo,
                      costoEnvio: presupuestoEdit.tipoEnvio && presupuestoEdit.tipoEnvio !== "retiro_local" ? presupuestoEdit.costoEnvio : 0,
                    }))}
                  </aside>
                </div>
              )}
            />

            {errorForm ? <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">{errorForm}</div> : null}
          </div>
        ) : null}

        {/* Modal de venta */}
        {convirtiendoVenta ? (
          <div className="no-print rounded-xl border border-border/60 bg-card p-4 shadow-sm sm:p-5">
            <h3 className="mb-3 text-lg font-semibold tracking-tight text-foreground">
              Convertir Presupuesto a Venta
            </h3>
            <p className="mb-4 text-sm text-muted-foreground">
              Complete los campos adicionales necesarios para convertir este
              presupuesto en una venta.
            </p>
            <FormularioConvertirVenta
              presupuesto={presupuesto}
              onCancel={() => setConvirtiendoVenta(false)}
              onSubmit={async (ventaCampos) => {
                try {
                  const items = (presupuesto.productos && presupuesto.productos.length > 0) ? presupuesto.productos : (presupuesto.items || []);
                  const envio = ventaCampos.costoEnvio
                    ? Number(ventaCampos.costoEnvio)
                    : safeNumber(presupuesto.costoEnvio || 0);
                  const {
                    subtotal,
                    descuentoTotal,
                    descuentoEfectivo,
                    aplicaIva,
                    ivaPorcentaje,
                    ivaMonto,
                    aplicaTransferencia,
                    transferenciaPorcentaje,
                    transferenciaMonto,
                    totalFinal: totalVenta,
                  } = calcularTotalesPresupuesto({
                    presupuesto,
                    items,
                    costoEnvio: envio,
                  });

                  const paymentIntentMonto =
                    ventaCampos.estadoPagoConversion === "pagado"
                      ? totalVenta
                      : ventaCampos.estadoPagoConversion === "parcial"
                        ? Number(ventaCampos.montoAbonado || 0)
                        : 0;

                  const formaPagoFinal =
                    ventaCampos.formaPago ||
                    (presupuesto.pagoEnEfectivo ? "efectivo" : (aplicaTransferencia ? "transferencia" : ""));

                  // Crear estructura de venta siguiendo exactamente el formato de ventas/page.jsx
                  const ventaData = {
                    // Datos del presupuesto
                    fecha: presupuesto.fecha,
                    clienteId: presupuesto.clienteId,
                    cliente: presupuesto.cliente,
                    productos: items,
                    items: items,
                    subtotal,
                    descuentoTotal,
                    descuentoEfectivo,
                    aplicaIva,
                    aplicarIva: aplicaIva,
                    ivaPorcentaje,
                    ivaMonto,
                    aplicaTransferencia,
                    aplicarTransferencia: aplicaTransferencia,
                    transferenciaPorcentaje,
                    transferenciaMonto,
                    total: totalVenta,
                    observaciones: presupuesto.observaciones,

                    // Datos específicos de venta
                    tipo: "venta",
                    fechaCreacion: new Date().toISOString(),

                    // Campos de pago
                    pagoEnEfectivo: presupuesto.pagoEnEfectivo || false,
                    formaPago: formaPagoFinal,
                    pagoPendiente: ventaCampos.estadoPagoConversion === "pendiente",
                    pagoParcial: ventaCampos.estadoPagoConversion === "parcial",
                    montoAbonado: paymentIntentMonto,
                    pagos: paymentIntentMonto > 0
                      ? [{
                          fecha: fechaLocalActual(),
                          monto: paymentIntentMonto,
                          metodo: formaPagoFinal || "manual",
                          usuario: user?.email || "Usuario no identificado",
                        }]
                      : [],
                    estadoPago: ventaCampos.estadoPagoConversion || "pagado",

                    // Campos de envío
                    tipoEnvio: ventaCampos.tipoEnvio || presupuesto.tipoEnvio,
                    fechaEntrega: ventaCampos.fechaEntrega,
                    rangoHorario: ventaCampos.rangoHorario,
                    costoEnvio: envio,
                    direccionEnvio: ventaCampos.direccionEnvio,
                    localidadEnvio: ventaCampos.localidadEnvio,
                    usarDireccionCliente:
                      ventaCampos.usarDireccionCliente ?? true,

                    // Campos adicionales
                    vendedor: user?.email || "Usuario no identificado",
                  };

                  // Limpiar datos antes de guardar (igual que en ventas/page.jsx)
                  const cleanVentaData = JSON.parse(
                    JSON.stringify(ventaData, (key, value) => {
                      if (value === undefined) return undefined;
                      return value;
                    })
                  );

                  if (!user || typeof user.getIdToken !== "function") {
                    throw new Error("No hay usuario autenticado");
                  }
                  const idToken = await user.getIdToken();
                  const resp = await fetch("/api/erp/ventas", {
                    method: "POST",
                    headers: {
                      Authorization: `Bearer ${idToken}`,
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                      venta: {
                        ...cleanVentaData,
                        idempotencyKey:
                          String(presupuesto?.id || "").trim()
                            ? `presupuesto_${String(presupuesto.id).trim()}`
                            : (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function"
                                ? globalThis.crypto.randomUUID()
                                : `${Date.now()}-${Math.random().toString(16).slice(2)}`),
                      },
                      origen: "ui_presupuesto_convert",
                    }),
                  });
                  const out = await resp.json().catch(() => ({}));
                  if (!resp.ok || !out?.ok) throw new Error(out?.error || "Error al crear la venta");
                  const ventaId = out.ventaId;

                  setConvirtiendoVenta(false);
                  router.push(`/${lang}/ventas/${ventaId}`);
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
        <ModalCambiarCliente
          open={showSelectorCliente}
          onClose={() => setShowSelectorCliente(false)}
          clienteActual={(editando ? presupuestoEdit?.cliente : presupuesto?.cliente) ? {
            id: editando ? presupuestoEdit?.clienteId : presupuesto?.clienteId,
            ...((editando ? presupuestoEdit?.cliente : presupuesto?.cliente) || {})
          } : null}
          clientes={clientes}
          onClienteSeleccionado={handleClienteSeleccionado}
        />
        {hayCambiosPresupuesto ? (
          <div className="no-print fixed bottom-5 right-4 z-40 sm:bottom-7 sm:right-7">
            <Button type="button" onClick={handleGuardarCambios} disabled={loadingPrecios || guardandoCambios} className="h-12 rounded-full px-5 shadow-xl" aria-label={guardandoCambios ? "Guardando cambios del presupuesto" : "Guardar cambios del presupuesto"}>
              {guardandoCambios ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              {guardandoCambios ? "Guardando…" : "Guardar cambios"}
            </Button>
          </div>
        ) : null}
      </div>
    </main>
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
    tipoEnvio: yup.string().required("Selecciona el tipo de envío"),
    estadoPagoConversion: yup
      .string()
      .oneOf(["pagado", "parcial", "pendiente"])
      .required("Selecciona el estado de pago"),
    formaPago: yup.string().when("estadoPagoConversion", {
      is: (val) => val === "pagado" || val === "parcial",
      then: (s) => s.required("Selecciona la forma de pago"),
      otherwise: (s) => s.notRequired(),
    }),
    montoAbonado: yup
      .number()
      .transform((value, originalValue) =>
        originalValue === "" ? undefined : value
      )
      .when("estadoPagoConversion", {
        is: "parcial",
        then: (s) => s.typeError("Debe ingresar un monto").min(1, "Debe ingresar un monto").required("Obligatorio"),
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
      tipoEnvio: "",
      estadoPagoConversion: "pagado",
      formaPago: presupuesto.pagoEnEfectivo
        ? "efectivo"
        : presupuesto.aplicaTransferencia
        ? "transferencia"
        : "",
      montoAbonado: "",
      transportista: "",
      costoEnvio: "",
      fechaEntrega: "",
      rangoHorario: "",
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

  const vendedores = ["coco", "damian", "lauti", "jose"];
  const tipoEnvioSeleccionado = watch("tipoEnvio");
  const usarDireccionCliente = watch("usarDireccionCliente");

  // Limpiar costoEnvio si tipoEnvio es 'retiro_local'
  React.useEffect(() => {
    if (tipoEnvioSeleccionado === "retiro_local") {
      setValue("costoEnvio", "");
    }
  }, [tipoEnvioSeleccionado, setValue]);

  // Establecer fecha de entrega por defecto al día actual
  React.useEffect(() => {
    if (tipoEnvioSeleccionado && tipoEnvioSeleccionado !== "retiro_local") {
      setValue("fechaEntrega", fechaLocalActual());
    }
  }, [tipoEnvioSeleccionado, setValue]);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Información de envío */}
        <div className="space-y-5 rounded-xl border border-border/60 bg-card p-4 sm:p-5">
          <div className="border-b border-border/60 pb-2 text-base font-semibold text-foreground">
            Información de envío
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-foreground">
              Tipo de envío *
            </label>
            <select
              {...register("tipoEnvio")}
              className={`h-10 w-full rounded-md border bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                errors.tipoEnvio ? "border-destructive" : "border-input"
              }`}
            >
              <option value="">Seleccionar tipo de envío...</option>
              <option value="retiro_local">Retiro en local</option>
              <option value="envio_domicilio">Envío a domicilio</option>
            </select>
            {errors.tipoEnvio && (
              <span className="text-xs text-destructive">
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
                      <label className="mb-2 block text-sm font-medium text-foreground">
                        Dirección de envío *
                      </label>
                      <Input
                        {...register("direccionEnvio")}
                        placeholder="Dirección de envío"
                        className={`w-full bg-background text-foreground ${
                          errors.direccionEnvio ? "border-destructive" : ""
                        }`}
                      />
                      {errors.direccionEnvio && (
                        <span className="text-xs text-destructive">
                          {errors.direccionEnvio.message}
                        </span>
                      )}
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-foreground">
                        Localidad *
                      </label>
                      <Input
                        {...register("localidadEnvio")}
                        placeholder="Localidad/Ciudad"
                        className={`w-full bg-background text-foreground ${
                          errors.localidadEnvio ? "border-destructive" : ""
                        }`}
                      />
                      {errors.localidadEnvio && (
                        <span className="text-xs text-destructive">
                          {errors.localidadEnvio.message}
                        </span>
                      )}
                    </div>
                  </>
                )}

                <div>
                  <label className="mb-2 block text-sm font-medium text-foreground">
                    Costo de envío
                  </label>
                  <Input
                    {...register("costoEnvio")}
                    placeholder="Costo de envío"
                    type="number"
                    className="w-full bg-background text-foreground"
                  />
                </div>
              </>
            )}
          {tipoEnvioSeleccionado ? (
            <DeliveryScheduleInput
              fechaEntrega={watch("fechaEntrega") || ""}
              rangoHorario={watch("rangoHorario") || ""}
              required={tipoEnvioSeleccionado !== "retiro_local"}
              description={tipoEnvioSeleccionado === "retiro_local"
                ? "Fecha y horario de retiro opcionales."
                : "Seleccioná cuándo se realizará la entrega."}
              dateError={errors.fechaEntrega?.message}
              timeError={errors.rangoHorario?.message}
              onFechaEntregaChange={(value) => setValue("fechaEntrega", value, {
                shouldDirty: true,
                shouldTouch: true,
                shouldValidate: true,
              })}
              onRangoHorarioChange={(value) => setValue("rangoHorario", value, {
                shouldDirty: true,
                shouldTouch: true,
                shouldValidate: true,
              })}
            />
          ) : null}
        </div>

        <div className="space-y-5 rounded-xl border border-border/60 bg-card p-4 sm:p-5">
          <div className="border-b border-border/60 pb-2 text-base font-semibold text-foreground">
            Pago
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-foreground">
              Estado de pago
            </label>
            <select
              {...register("estadoPagoConversion")}
              className={`h-10 w-full rounded-md border bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                errors.estadoPagoConversion ? "border-destructive" : "border-input"
              }`}
            >
              <option value="pagado">Pagado</option>
              <option value="parcial">Parcial</option>
              <option value="pendiente">Pendiente</option>
            </select>
            {errors.estadoPagoConversion && (
              <span className="text-xs text-destructive">
                {errors.estadoPagoConversion.message}
              </span>
            )}
          </div>
          {watch("estadoPagoConversion") !== "pendiente" && (
            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">
                Forma de pago
              </label>
              <select
                {...register("formaPago")}
                className={`h-10 w-full rounded-md border bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  errors.formaPago ? "border-destructive" : "border-input"
                }`}
              >
                <option value="">Seleccionar...</option>
                <option value="efectivo">Efectivo</option>
                <option value="transferencia">Transferencia</option>
                <option value="tarjeta">Tarjeta</option>
                <option value="cheque">Cheque</option>
                <option value="otro">Otro</option>
              </select>
              {errors.formaPago && (
                <span className="text-xs text-destructive">
                  {errors.formaPago.message}
                </span>
              )}
            </div>
          )}
          {watch("estadoPagoConversion") === "parcial" && (
            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">
                Monto abonado
              </label>
              <Input
                type="number"
                min={0}
                step="0.01"
                {...register("montoAbonado")}
                className={`w-full bg-background text-foreground ${errors.montoAbonado ? "border-destructive" : ""}`}
                placeholder="Monto abonado"
              />
              {errors.montoAbonado && (
                <span className="text-xs text-destructive">
                  {errors.montoAbonado.message}
                </span>
              )}
            </div>
          )}
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
