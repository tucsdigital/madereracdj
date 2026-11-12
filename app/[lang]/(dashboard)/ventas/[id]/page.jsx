"use client";
import { fechaLocalActual } from "@/lib/fechas-locales";
import { normalizeVenta } from "@/lib/ecommerce-panel";
import { calcularImportesEdicionVenta } from "@/lib/ventas-edicion-precios";
import VentaImportes from "@/components/ecommerce/VentaImportes";
import React, { useEffect, useState, useMemo, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import {
  computeTotals,
} from "@/lib/pricing";
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
  addDoc,
} from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { DeliveryScheduleInput } from "@/components/ui/delivery-schedule-input";
import GoogleAddressInput from "@/components/ui/google-address-input";
import { ArrowLeft, ArrowLeftRight, BadgePercent, Banknote, CalendarDays, CheckCircle2, ChevronDown, ChevronUp, ClipboardList, Clock3, CreditCard, Download, Edit, ExternalLink, FileText, IdCard, Info, Loader2, Mail, MapPin, MessageCircle, Package, Phone, Plus, Printer, ReceiptText, Save, Store, Tag, Trash2, Truck, User, Wallet, XCircle } from "lucide-react";
import { useAuth } from "@/provider/auth.provider";
import { DetalleVentaPresupuestoItemsTable } from "@/components/ventas/TablaProductosVentas";
import ProductosVentaEditor from "@/components/ventas/ProductosVentaEditor";
import {
  applyDerivedComboStock,
  isComboProduct,
  normalizeComboComponents,
} from "@/lib/combos";

const ModalCambiarCliente = dynamic(
  () => import("@/components/clientes/ModalCambiarCliente"),
  { ssr: false }
);
import ComprobantesPagoSection from "@/components/ventas/ComprobantesPagoSection";
import { mapFirestoreDoc } from "@/lib/erp/producto-id";
import { getClienteCuit, getClienteDni } from "@/lib/clientes-search";
import {
  buildVentaPaymentSnapshot,
  normalizeVentaPaymentFields,
} from "@/lib/ventas-pagos";

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

function formatFechaHoraLocal(dateValue) {
  if (!dateValue) return "-";
  if (typeof dateValue === "string" && !dateValue.includes("T")) return formatFechaLocal(dateValue);
  const parsedDate = dateValue?.toDate instanceof Function
    ? dateValue.toDate()
    : new Date(dateValue);
  if (Number.isNaN(parsedDate.getTime())) return formatFechaLocal(String(dateValue));
  return parsedDate.toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function capitalizarPrimeraLetra(value) {
  const text = String(value ?? "").trim();
  if (!text) return "-";
  return `${text.charAt(0).toLocaleUpperCase("es-AR")}${text.slice(1)}`;
}

function obtenerCuilCuit(cliente = {}) {
  const cuil = String(cliente.cuil || "").trim();
  if (cuil) return cuil;

  const cuit = String(getClienteCuit(cliente) || "").trim();
  const digits = cuit.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 9 ? "" : cuit;
}

const buildPagoSnapshot = (ventaLike) => {
  const snapshot = buildVentaPaymentSnapshot(ventaLike);
  return {
    estadoPago: snapshot.estadoPago,
    total: snapshot.total,
    abonado: snapshot.abonado,
    saldo: snapshot.saldoPendiente,
  };
};

const mergeComprobantesPago = (a, b) => {
  const out = [];
  const seen = new Set();
  const push = (c) => {
    if (!c || typeof c !== "object") return;
    const url = String(c.url || "").trim();
    if (!url) return;
    if (seen.has(url)) return;
    seen.add(url);
    out.push(c);
  };
  for (const c of Array.isArray(a) ? a : []) push(c);
  for (const c of Array.isArray(b) ? b : []) push(c);
  return out;
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

// Función para calcular precio de machimbre (precio por pie × alto × largo × cantidad)
function calcularPrecioMachimbre({
  alto,
  largo,
  cantidad,
  precioPorPie,
}) {
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

const VentaDetalle = () => {
  const params = useParams();
  const router = useRouter();
  const { id, lang } = params;
  const { user } = useAuth();
  const [venta, setVenta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editando, setEditando] = useState(false);
  const [ventaEdit, setVentaEdit] = useState(null);
  const [clientes, setClientes] = useState([]);
  const [productos, setProductos] = useState([]);
  const [loadingPrecios, setLoadingPrecios] = useState(false);
  const [errorForm, setErrorForm] = useState("");
  const [guardandoCambios, setGuardandoCambios] = useState(false);
  const [pickupActionBusy, setPickupActionBusy] = useState(false);
  const ventaEditBaselineRef = useRef(null);
  const esVentaEcommerce = Boolean(
    venta?.ecommerceLifecycle === true ||
    String(venta?.origen || "").trim().toLowerCase() === "ecommerce_externo"
  );
  const [proofActionBusy, setProofActionBusy] = useState(false);
  const [proofReasonDraft, setProofReasonDraft] = useState("");
  const [showProofRejectForm, setShowProofRejectForm] = useState(false);
  const [ecommerceActionError, setEcommerceActionError] = useState("");
  const [ecommerceActionNotice, setEcommerceActionNotice] = useState("");
  const [downloadingPDF, setDownloadingPDF] = useState(false);
  const ventaAnulada = useMemo(() => {
    if (!venta) return false;
    return String(venta.estado || "").toLowerCase() === "anulada" || venta.anulada === true;
  }, [venta]);
  const [downloadingPDFEmpleado, setDownloadingPDFEmpleado] = useState(false);
  const [printingPDF, setPrintingPDF] = useState(false);
  const [printingPDFEmpleado, setPrintingPDFEmpleado] = useState(false);
  const [printingPDFEnvio, setPrintingPDFEnvio] = useState(false);
  const printingRef = useRef(false);
  const printingEmpleadoRef = useRef(false);
  const printingEnvioRef = useRef(false);

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
    
    if (!venta?.id) return;
    
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
          type: "venta",
          id: venta.id,
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
  }, [venta?.id]);

  const handlePrintEnvio = useCallback(async (event = null) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    if (!venta?.id) return;
    if (printingEnvioRef.current) return;

    printingEnvioRef.current = true;
    setPrintingPDFEnvio(true);

    try {
      const res = await fetch("/api/pdf/remito-html", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "venta",
          id: venta.id,
          empleado: false,
          purpose: "envio",
        }),
      });

      if (!res.ok) {
        alert("Error al generar el documento de envío. Por favor, intenta nuevamente.");
        printingEnvioRef.current = false;
        setPrintingPDFEnvio(false);
        return;
      }

      const html = await res.text();

      const iframe = document.createElement("iframe");
      iframe.style.position = "fixed";
      iframe.style.right = "0";
      iframe.style.bottom = "0";
      iframe.style.width = "0";
      iframe.style.height = "0";
      iframe.style.border = "none";
      document.body.appendChild(iframe);

      let printed = false;
      let timeoutId = null;

      const waitForPrintAssets = async () => {
        const printDocument = iframe.contentDocument;
        if (!printDocument) {
          printOnce();
          return;
        }
        const imageLoads = Array.from(printDocument.images).map((image) => {
          if (image.complete) return Promise.resolve();
          return new Promise((resolve) => {
            image.addEventListener("load", resolve, { once: true });
            image.addEventListener("error", resolve, { once: true });
          });
        });
        await Promise.all(imageLoads);
        printOnce();
      };

      const printOnce = () => {
        if (printed) return;
        printed = true;

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

        printingEnvioRef.current = false;
        setPrintingPDFEnvio(false);

        setTimeout(() => {
          try {
            if (iframe.parentNode) {
              document.body.removeChild(iframe);
            }
          } catch (e) {}
        }, 2000);
      };

      iframe.onload = () => { void waitForPrintAssets(); };
      iframe.contentDocument?.open();
      iframe.contentDocument?.write(html);
      iframe.contentDocument?.close();

      // El QR es inline; esperamos su decodificación antes de abrir el diálogo.
      window.requestAnimationFrame(() => { void waitForPrintAssets(); });
      timeoutId = setTimeout(() => {
        printOnce();
      }, 5000);
    } catch (e) {
      console.error("Error imprimiendo documento de envío", e);
      alert("Error al generar el documento de envío. Por favor, intenta nuevamente.");
      printingEnvioRef.current = false;
      setPrintingPDFEnvio(false);
    }
  }, [venta?.id]);

  // Hook para pagosSimples si no hay array pagos
  const [pagosSimples, setPagosSimples] = useState([]);

  // 1. Agregar estado para loader y mensaje de éxito
  const [registrandoPago, setRegistrandoPago] = useState(false);
  const [pagoExitoso, setPagoExitoso] = useState(false);

  // Estados para borrado de pagos
  const [borrandoPago, setBorrandoPago] = useState(false);
  const [pagoABorrar, setPagoABorrar] = useState(null);
  const [mostrarConfirmacionBorrado, setMostrarConfirmacionBorrado] = useState(false);
  const [errorBorrarPago, setErrorBorrarPago] = useState("");

  // Estado para cambio de cliente
  const [showSelectorCliente, setShowSelectorCliente] = useState(false);

  // Dólar Blue dinámico (venta)
  const [loadingDolar, setLoadingDolar] = useState(false);
  const [ultimaActualizacionDolar, setUltimaActualizacionDolar] = useState(null);

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

  // Cambiar el título de la página dinámicamente para el nombre del PDF
  useEffect(() => {
    if (venta?.numeroPedido) {
      document.title = venta.numeroPedido;
    }
    // Restaurar el título original al desmontar el componente
    return () => {
      document.title = "Maderas Caballero - Panel Administrativo";
    };
  }, [venta?.numeroPedido]);

  // Cargar clientes y productos para selects y edición
  useEffect(() => {
    const fetchClientesYProductos = async () => {
      const snapClientes = await getDocs(collection(db, "clientes"));
      setClientes(
        snapClientes.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
      );
      const snapProductos = await getDocs(collection(db, "productos"));
      const productosData = applyDerivedComboStock(snapProductos.docs.map((doc) => mapFirestoreDoc(doc)));
      console.log("=== DEBUG CARGA PRODUCTOS ===");
      console.log("Productos cargados:", productosData);
      console.log("Cantidad de productos:", productosData.length);
      setProductos(productosData);
    };
    fetchClientesYProductos();
  }, []);
  // Al activar edición, clonar venta
  useEffect(() => {
    if (editando && venta) {
      console.log("=== DEBUG Clonando venta para edición ===");
      console.log("venta original:", venta);
      console.log("venta.clienteId:", venta.clienteId);
      console.log("venta.cliente:", venta.cliente);

      const ventaClonada = JSON.parse(JSON.stringify(venta));

      // Asegurar que TODA la información del cliente se preserve
      if (venta.clienteId) {
        ventaClonada.clienteId = venta.clienteId;
      }
      if (venta.cliente) {
        ventaClonada.cliente = venta.cliente;
      }

      // Inicializar campos de pago para el formulario
      ventaClonada.nuevoPagoMonto = "";
      ventaClonada.nuevoPagoMetodo = "";

      // Comprobantes de pago y pago en dólares
      ventaClonada.comprobantesPago = Array.isArray(ventaClonada.comprobantesPago) ? ventaClonada.comprobantesPago : [];
      ventaClonada.pagoEnDolares = ventaClonada.pagoEnDolares ?? false;
      ventaClonada.valorOficialDolar = ventaClonada.valorOficialDolar ?? null;
      ventaClonada.aplicaIva = Boolean(ventaClonada.aplicaIva);
      ventaClonada.ivaPorcentaje = Number(ventaClonada.ivaPorcentaje) || 21;
      ventaClonada.aplicaTransferencia = Boolean(ventaClonada.aplicaTransferencia);
      ventaClonada.transferenciaPorcentaje = Number(ventaClonada.transferenciaPorcentaje) || 10;
      ventaClonada.productos = (ventaClonada.productos || []).map((p) =>
        p.categoria === "Maderas"
          ? (() => {
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
              const calibradoAplicado = normalizarBool(p.calibradoAplicado);
              const calibradoPorcentaje = normalizarCalibradoPorcentaje(
                p.calibradoPorcentaje
              );
              const unidad = normalizarUnidadMadera(p.unidad || p.unidadMedida || "");
              const cepilladoAplicadoRaw = p.cepilladoAplicado;
              const cepilladoAplicado =
                (cepilladoAplicadoRaw === null || cepilladoAplicadoRaw === undefined) && unidad === "M2"
                  ? true
                  : normalizarBool(cepilladoAplicadoRaw);
              const cepilladoPorcentaje =
                unidad === "M2" ? 0 : normalizarCepilladoPorcentaje(p.cepilladoPorcentaje);
              const altoParsed = parseNumericValue(p.alto);
              const anchoParsed = parseNumericValue(p.ancho);
              const largoParsed = parseNumericValue(p.largo);
              const cantidadParsed = parseNumericValue(p.cantidad);
              let precioPorPieParsed = parseNumericValue(p.precioPorPie);
              const alto = altoParsed === "" ? 0 : altoParsed;
              const ancho = anchoParsed === "" ? 0 : anchoParsed;
              const largo = largoParsed === "" ? 0 : largoParsed;
              const cantidad = cantidadParsed === "" ? 1 : Math.max(1, Math.ceil(cantidadParsed));
              if ((precioPorPieParsed === "" || precioPorPieParsed === 0) && unidad === "Unidad") {
                const precioFallback = parseNumericValue(p.precio);
                if (precioFallback !== "" && precioFallback > 0) {
                  precioPorPieParsed = precioFallback;
                }
              }
              const precioPorPie = precioPorPieParsed === "" ? 0 : precioPorPieParsed;
              const precioStoredParsed = parseNumericValue(p.precio);
              let precio = precioStoredParsed === "" ? 0 : precioStoredParsed;
              if (precio <= 0 && unidad === "M2") {
                const altoM2 = alto > 0 ? alto : ancho > 0 ? ancho : 0;
                if (altoM2 > 0 && largo > 0 && precioPorPie > 0) {
                  precio = calcularPrecioMachimbre({
                    alto: altoM2,
                    largo,
                    cantidad,
                    precioPorPie,
                  });
                }
              }
              return {
                ...p,
                unidad,
                alto,
                ancho,
                largo,
                cantidad,
                precioPorPie,
                precio,
                cepilladoAplicado,
                cepilladoPorcentaje,
                calibradoAplicado,
                calibradoPorcentaje,
              };
            })()
          : p
      );

      // Verificar que los datos se copiaron correctamente
      console.log("venta clonada:", ventaClonada);
      console.log("ventaClonada.clienteId:", ventaClonada.clienteId);
      console.log("ventaClonada.cliente:", ventaClonada.cliente);
      console.log("ventaClonada.nuevoPagoMonto:", ventaClonada.nuevoPagoMonto);
      console.log("ventaClonada.nuevoPagoMetodo:", ventaClonada.nuevoPagoMetodo);

      ventaEditBaselineRef.current = JSON.parse(JSON.stringify(ventaClonada));
      setVentaEdit(ventaClonada);
    }
  }, [editando, venta]);

  // Cotización oficial BNA: usa el promedio entre compra y venta para pagos en USD
  const fetchDolarBlue = useCallback(async () => {
    setLoadingDolar(true);
    try {
      const res = await fetch("/api/dolar-blue");
      const data = await res.json();
      if (res.ok && data?.referencia != null) {
        setVentaEdit((prev) => {
          if (!prev?.pagoEnDolares) return prev;
          const nextRate = Number(data.referencia);
          const baseline = ventaEditBaselineRef.current;
          if (baseline && prev.valorOficialDolar === baseline.valorOficialDolar) {
            baseline.valorOficialDolar = nextRate;
          }
          return { ...prev, valorOficialDolar: nextRate };
        });
        setUltimaActualizacionDolar(data.fechaActualizacion ? new Date(data.fechaActualizacion) : new Date());
      }
    } catch (err) {
      console.warn("Error al obtener dólar oficial BNA:", err);
    } finally {
      setLoadingDolar(false);
    }
  }, []);

  useEffect(() => {
    if (!editando || !ventaEdit?.pagoEnDolares) return;
    fetchDolarBlue();
    const interval = setInterval(fetchDolarBlue, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [editando, ventaEdit?.pagoEnDolares, fetchDolarBlue]);

  // Al activar edición, inicializar pagosSimples si no hay array pagos
  useEffect(() => {
    if (editando && venta && !Array.isArray(venta.pagos)) {
      setPagosSimples(
        [
          venta.montoAbonado > 0
            ? {
                fecha: venta.fecha || fechaLocalActual(),
                monto: Number(venta.montoAbonado),
                metodo: venta.formaPago || "-",
                usuario: "-",
              }
            : null,
        ].filter(Boolean)
      );
    }
  }, [editando, venta]);

  // Handler para cambiar cliente (usado por el componente ModalCambiarCliente)
  const handleClienteSeleccionado = async (clienteId, clienteData) => {
    try {
      if (!venta?.id) {
        console.error("No se puede actualizar: venta no disponible");
        return;
      }

      if (editando) {
        setVentaEdit((previous) => ({ ...previous, clienteId, cliente: clienteData }));
        if (!clientes.some((cliente) => cliente.id === clienteId)) {
          setClientes((previous) => [...previous, { id: clienteId, ...clienteData }]);
        }
        setShowSelectorCliente(false);
        return;
      }

      // Actualizar la venta en Firestore
      await updateDoc(doc(db, "ventas", venta.id), {
        clienteId: clienteId,
        cliente: clienteData,
        actualizadoEn: new Date().toISOString(),
      });

      // Actualizar el estado local
      const ventaActualizada = {
        ...venta,
        clienteId: clienteId,
        cliente: clienteData,
      };
      setVenta(ventaActualizada);

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

  // Función para actualizar precios
  const handleActualizarPrecios = async () => {
    setLoadingPrecios(true);
    try {
      // Obtener productos actualizados desde Firebase
      const productosSnap = await getDocs(collection(db, "productos"));
      const productosActualizados = applyDerivedComboStock(productosSnap.docs.map((doc) => mapFirestoreDoc(doc)));

      // Actualizar precios de productos en ventaEdit
      const productosConPreciosActualizados = (ventaEdit.productos || []).map(
        (productoVenta) => {
          const lineKey = productoVenta.originalId || productoVenta.id;
          const productoActualizado = productosActualizados.find(
            (p) =>
              p.id === lineKey ||
              (productoVenta.codigo && p.codigo === productoVenta.codigo)
          );
          if (productoActualizado) {
            let nuevoPrecio = 0;
            if (isComboProduct(productoActualizado)) {
              nuevoPrecio = Number(productoActualizado.precioVenta ?? productoActualizado.valorVenta ?? productoActualizado.precioCalculado ?? 0) || 0;
            } else if (productoActualizado.categoria === "Maderas") {
              const altoParsed = parseNumericValue(productoVenta.alto ?? productoActualizado.alto);
              const anchoParsed = parseNumericValue(productoVenta.ancho ?? productoActualizado.ancho);
              const largoParsed = parseNumericValue(productoVenta.largo ?? productoActualizado.largo);
              const precioPorPieParsed = parseNumericValue(
                productoVenta.precioPorPie ?? productoActualizado.precioPorPie
              );
              const alto = altoParsed === "" ? 0 : altoParsed;
              const ancho = anchoParsed === "" ? 0 : anchoParsed;
              const largo = largoParsed === "" ? 0 : largoParsed;
              const precioPorPie = precioPorPieParsed === "" ? 0 : precioPorPieParsed;
              const unidadUp = String(
                productoVenta.unidad || productoVenta.unidadMedida || ""
              )
                .trim()
                .toUpperCase();

              if (alto > 0 && ancho > 0 && largo > 0 && precioPorPie > 0) {
                const precioBase =
                  unidadUp === "M2"
                    ? calcularPrecioMachimbre({
                        alto,
                        largo,
                        cantidad: productoVenta.cantidad || 1,
                        precioPorPie,
                      })
                    : 0.2734 * alto * ancho * largo * precioPorPie;
                nuevoPrecio = calcularPrecioMaderaConTratamientos(
                  productoVenta,
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
              ...productoVenta,
              precio: nuevoPrecio,
            };
          }
          return productoVenta;
        }
      );

      setVentaEdit((prev) => ({
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
    setVentaEdit((prev) => ({
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
    setVentaEdit((prev) => ({
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

  // Función para obtener información completa del producto desde la base de datos
  const getProductoCompleto = (productoId) => {
    return productos.find((p) => p.id === productoId);
  };

  // Funciones para manejar cambios en productos
  const handleDecrementarCantidad = (id) => {
    setVentaEdit((prev) => ({
      ...prev,
      productos: prev.productos.map((p) => {
        if (p.id === id) {
          const current = Math.max(1, Math.ceil(Number(p.cantidad) || 1));
          const nuevaCantidad = Math.max(1, current - 1);
          
          // Si es M2, recalcular precio por m²
          if (p.categoria === "Maderas" && (p.unidad === "M2" || p.unidad === "ML")) {
            const precioBase =
              p.unidad === "M2"
                ? calcularPrecioMachimbre({
                    alto: p.alto,
                    largo: p.largo,
                    cantidad: nuevaCantidad,
                    precioPorPie: p.precioPorPie,
                  })
                : calcularPrecioMetroLineal({
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
              precioIncluyeCantidad: true,
            };
          }
          // Para otros productos, solo cambiar cantidad
          return { ...p, cantidad: nuevaCantidad };
        }
        return p;
      }),
    }));
  };

  const handleIncrementarCantidad = (id) => {
    setVentaEdit((prev) => ({
      ...prev,
      productos: prev.productos.map((p) => {
        if (p.id === id) {
          const current = Math.max(1, Math.ceil(Number(p.cantidad) || 1));
          const nuevaCantidad = current + 1;
          
          // Si es M2, recalcular precio por m²
          if (p.categoria === "Maderas" && (p.unidad === "M2" || p.unidad === "ML")) {
            const precioBase =
              p.unidad === "M2"
                ? calcularPrecioMachimbre({
                    alto: p.alto,
                    largo: p.largo,
                    cantidad: nuevaCantidad,
                    precioPorPie: p.precioPorPie,
                  })
                : calcularPrecioMetroLineal({
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
              precioIncluyeCantidad: true,
            };
          }
          // Para otros productos, solo cambiar cantidad
          return { ...p, cantidad: nuevaCantidad };
        }
        return p;
      }),
    }));
  };

  const handleCantidadChange = (id, cantidad) => {
    setVentaEdit((prev) => ({
      ...prev,
      productos: prev.productos.map((p) => {
        if (p.id === id) {
          // Si es M2, recalcular precio por m²
          if (p.categoria === "Maderas" && (p.unidad === "M2" || p.unidad === "ML")) {
            const cantidadNum = Math.max(1, Math.ceil(Number(cantidad) || 1));
            const precioBase =
              p.unidad === "M2"
                ? calcularPrecioMachimbre({
                    alto: p.alto,
                    largo: p.largo,
                    cantidad: cantidadNum,
                    precioPorPie: p.precioPorPie,
                  })
                : calcularPrecioMetroLineal({
                    largo: p.largo,
                    cantidad: cantidadNum,
                    precioPorPie: p.precioPorPie,
                  });

            const precioRedondeado = calcularPrecioMaderaConTratamientos(
              p,
              precioBase
            );

            return {
              ...p,
              cantidad: cantidadNum,
              precio: precioRedondeado,
              precioIncluyeCantidad: true,
            };
          }
          // Para otros productos, solo cambiar cantidad
          return { ...p, cantidad: Math.max(1, Math.ceil(Number(cantidad) || 1)) };
        }
        return p;
      }),
    }));
  };

  const handleDescuentoChange = (id, descuento) => {
    setVentaEdit((prev) => ({
      ...prev,
      productos: prev.productos.map((p) =>
        p.id === id ? { ...p, descuento: Number(descuento) } : p
      ),
    }));
  };

  const handleUnidadMaderaChange = (id, nuevaUnidad) => {
    setVentaEdit((prev) => ({
      ...prev,
      productos: (prev.productos || []).map((p) => {
        if (p.id !== id || p.categoria !== "Maderas") return p;

        const unidad = nuevaUnidad;
        const cantidad = Math.max(1, Math.ceil(Number(p.cantidad) || 1));
        const alto = Number(p.alto) || 0;
        const ancho = Number(p.ancho) || 0;
        const largo = Number(p.largo) || 0;
        const precioPorPie = Number(p.precioPorPie) || 0;
        const altoM2 = alto > 0 ? alto : ancho;
        const precioBase =
          unidad === "M2"
            ? calcularPrecioMachimbre({ alto: altoM2, largo, cantidad, precioPorPie })
            : unidad === "ML"
              ? calcularPrecioMetroLineal({ largo, cantidad, precioPorPie })
              : unidad === "Unidad"
                ? Math.round(precioPorPie / 100) * 100
                : calcularPrecioCorteMadera({ alto, ancho, largo, precioPorPie });

        return {
          ...p,
          unidad,
          precio: unidad === "Unidad"
            ? precioBase
            : calcularPrecioMaderaConTratamientos(p, precioBase, { unidad }),
          precioIncluyeCantidad: unidad === "M2" || unidad === "ML",
          alto: unidad === "M2" && alto <= 0 && ancho > 0 ? ancho : p.alto,
          cepilladoAplicado: unidad === "Unidad" ? false : p.cepilladoAplicado,
          calibradoAplicado: unidad === "Unidad" ? false : p.calibradoAplicado,
          cepilladoPorcentaje: unidad === "M2" ? 0 : p.cepilladoPorcentaje,
        };
      }),
    }));
  };

  // Permitir editar el nombre del producto cuando sea un producto manual/especial
  const handleNombreChange = (id, nombre) => {
    setVentaEdit((prev) => ({
      ...prev,
      productos: prev.productos.map((p) =>
        p.id === id ? { ...p, nombre } : p
      ),
    }));
  };

  // Permitir editar el precio unitario cuando el producto lo admita (p.esEditable)
  const handlePrecioChange = (id, precio) => {
    const parsed = precio === "" ? "" : Number(precio);
    setVentaEdit((prev) => ({
      ...prev,
      productos: prev.productos.map((p) => {
        if (p.id !== id) return p;
        const precioNumerico = parsed === "" ? 0 : Number(parsed);
        if (p.categoria === "Maderas" && (p.unidad === "M2" || p.unidad === "ML")) {
          const cantidad = Number(p.cantidad) || 1;
          return { ...p, precio: precioNumerico * cantidad, precioIncluyeCantidad: true };
        }
        return { ...p, precio: precioNumerico };
      }),
    }));
  };

  const handleQuitarProducto = (id) => {
    setVentaEdit((prev) => ({
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
    setVentaEdit((prev) => {
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
    setVentaEdit((prev) => {
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
    if (isComboProduct(prod)) {
      return {
        item: {
          id: prod.id,
          originalId: prod.id,
          codigo: prod.codigo || "",
          nombre: prod.nombre,
          detalle: prod.detalle || "",
          precio: Number(prod.precioVenta ?? prod.valorVenta ?? prod.precioCalculado ?? 0) || 0,
          unidad: "Unidad",
          stock: prod.stock,
          cantidad: 1,
          descuento: 0,
          categoria: "Combos",
          esCombo: true,
          tipoProducto: "combo",
          componentesCombo: normalizeComboComponents(prod.componentesCombo),
          versionComposicion: Number(prod.versionComposicion) || 1,
        },
      };
    }

    if (prod.categoria === "Maderas") {
      const alto = Number(prod.alto) || 0;
      const ancho = Number(prod.ancho) || 0;
      const largo = Number(prod.largo) || 0;
      const precioPorPie = Number(prod.precioPorPie) || 0;
      if (!(alto > 0 && ancho > 0 && largo > 0 && precioPorPie > 0)) {
        return {
          error: true,
          item: { precio: 0, unidad: prod.unidadMedida, categoria: prod.categoria },
        };
      }
      return {
        item: {
          id: prod.id,
          originalId: prod.id,
          codigo: prod.codigo || "",
          nombre: prod.nombre,
          detalle: prod.detalle || "",
          precio: calcularPrecioCorteMadera({ alto, ancho, largo, precioPorPie }),
          unidad: prod.unidadMedida,
          stock: prod.stock,
          cantidad: 1,
          descuento: 0,
          categoria: prod.categoria,
          alto,
          ancho,
          largo,
          precioPorPie,
          cepilladoAplicado: String(prod.unidadMedida || "").trim().toUpperCase() === "M2",
          cepilladoPorcentaje: String(prod.unidadMedida || "").trim().toUpperCase() === "M2" ? 0 : DEFAULT_CEPILLADO_PORCENTAJE,
          calibradoAplicado: false,
          calibradoPorcentaje: DEFAULT_CALIBRADO_PORCENTAJE,
          tipoMadera: prod.tipoMadera || "",
          subcategoria: prod.subcategoria || prod.subCategoria || "",
        },
      };
    }

    const precio = prod.categoria === "Ferretería"
      ? prod.valorVenta || 0
      : prod.precioUnidad || prod.precioUnidadVenta || prod.precioUnidadHerraje || prod.precioUnidadQuimico || prod.precioUnidadHerramienta || 0;
    return {
      item: {
        id: prod.id,
        originalId: prod.id,
        codigo: prod.codigo || "",
        nombre: prod.nombre,
        detalle: prod.detalle || "",
        precio,
        unidad: prod.unidadMedida || prod.unidadVenta,
        stock: prod.stock,
        cantidad: 1,
        descuento: 0,
        categoria: prod.categoria,
      },
    };
  };

  const handleAgregarProductoCatalogo = (prod) => {
    const productoConstruido = construirProductoCatalogo(prod);
    if (productoConstruido.error) {
      console.warn("El producto de madera no tiene dimensiones válidas.");
      return;
    }
    setVentaEdit((prev) => ({
      ...prev,
      productos: [...(prev.productos || []), productoConstruido.item],
    }));
  };

  const handleAgregarEjemplo = () => {
    const productoEjemplo = {
      id: "ejemplo-" + Date.now(),
      nombre: "MACHIMBRE DE EJEMPLO",
      precio: calcularPrecioMachimbre({ alto: 0.2, largo: 3, cantidad: 1, precioPorPie: 25000 }),
      unidad: "M2",
      stock: 100,
      cantidad: 1,
      descuento: 0,
      categoria: "Maderas",
      noInventariable: true,
      esEditable: true,
      precioIncluyeCantidad: true,
      alto: 0.2,
      ancho: 0,
      largo: 3,
      precioPorPie: 25000,
      cepilladoAplicado: true,
      cepilladoPorcentaje: 0,
      calibradoAplicado: false,
      calibradoPorcentaje: DEFAULT_CALIBRADO_PORCENTAJE,
      subcategoria: "machimbre",
    };
    setVentaEdit((prev) => ({ ...prev, productos: [...(prev.productos || []), productoEjemplo] }));
  };

  // Función para manejar cambios en alto para machimbre/deck
  const handleAltoChange = (id, nuevoAlto) => {
    setVentaEdit((prev) => ({
      ...prev,
      productos: (prev.productos || []).map((p) => {
        if (
          p.id === id &&
          p.categoria === "Maderas" && p.unidad === "M2"
        ) {
          const precioBase = calcularPrecioMachimbre({
            alto: Number(nuevoAlto),
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
            alto: Number(nuevoAlto),
            precio: precioRedondeado,
          };
        }
        return p;
      }),
    }));
  };

  // Función para manejar cambios en ancho para machimbre/deck
  const handleAnchoChange = (id, nuevoAncho) => {
    setVentaEdit((prev) => ({
      ...prev,
      productos: (prev.productos || []).map((p) => {
        if (
          p.id === id &&
          p.categoria === "Maderas" && p.unidad === "M2"
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
            ancho: Number(nuevoAncho),
            precio: precioRedondeado,
          };
        }
        return p;
      }),
    }));
  };

  // Función para manejar cambios en largo para machimbre/deck
  const handleLargoChange = (id, nuevoLargo) => {
    setVentaEdit((prev) => ({
      ...prev,
      productos: (prev.productos || []).map((p) => {
        if (
          p.id === id &&
          p.categoria === "Maderas" && p.unidad === "M2"
        ) {
          const precioBase = calcularPrecioMachimbre({
            alto: p.alto,
            largo: Number(nuevoLargo),
            cantidad: p.cantidad || 1,
            precioPorPie: p.precioPorPie,
          });

          const precioRedondeado = calcularPrecioMaderaConTratamientos(
            p,
            precioBase
          );

          return {
            ...p,
            largo: Number(nuevoLargo),
            precio: precioRedondeado,
          };
        }
        return p;
      }),
    }));
  };


  // Funciones para manejar cambios en dimensiones para maderas normales (no machimbre/deck)
  const handleAltoChangeMadera = (id, nuevoAlto) => {
    setVentaEdit((prev) => ({
      ...prev,
      productos: (prev.productos || []).map((p) => {
        if (p.id === id && p.categoria === "Maderas" && p.unidad !== "M2") {
          const alto = Number(nuevoAlto);
          const ancho = Number(p.ancho);
          const largo = Number(p.largo);
          const precioPorPie = Number(p.precioPorPie);
          let precioBase = 0;
          if (alto > 0 && ancho > 0 && largo > 0 && precioPorPie > 0) {
            precioBase = 0.2734 * alto * ancho * largo * precioPorPie;
          }
          const precioRedondeado = calcularPrecioMaderaConTratamientos(
            p,
            precioBase
          );
          return { ...p, alto, precio: precioRedondeado };
        }
        return p;
      }),
    }));
  };

  const handleAnchoChangeMadera = (id, nuevoAncho) => {
    setVentaEdit((prev) => ({
      ...prev,
      productos: (prev.productos || []).map((p) => {
        if (p.id === id && p.categoria === "Maderas" && p.unidad !== "M2") {
          const alto = Number(p.alto);
          const ancho = Number(nuevoAncho);
          const largo = Number(p.largo);
          const precioPorPie = Number(p.precioPorPie);
          let precioBase = 0;
          if (alto > 0 && ancho > 0 && largo > 0 && precioPorPie > 0) {
            precioBase = 0.2734 * alto * ancho * largo * precioPorPie;
          }
          const precioRedondeado = calcularPrecioMaderaConTratamientos(
            p,
            precioBase
          );
          return { ...p, ancho, precio: precioRedondeado };
        }
        return p;
      }),
    }));
  };

  const handleLargoChangeMadera = (id, nuevoLargo) => {
    setVentaEdit((prev) => ({
      ...prev,
      productos: (prev.productos || []).map((p) => {
        if (p.id === id && p.categoria === "Maderas" && p.unidad !== "M2") {
          const alto = Number(p.alto);
          const ancho = Number(p.ancho);
          const largo = Number(nuevoLargo);
          const precioPorPie = Number(p.precioPorPie);
          let precioBase = 0;
          if (alto > 0 && ancho > 0 && largo > 0 && precioPorPie > 0) {
            precioBase = 0.2734 * alto * ancho * largo * precioPorPie;
          }
          const precioRedondeado = calcularPrecioMaderaConTratamientos(
            p,
            precioBase
          );
          return { ...p, largo, precio: precioRedondeado };
        }
        return p;
      }),
    }));
  };

  // Wrapper para precio por pie en maderas normales para mantener la API de la nueva tabla
  const handlePrecioPorPieChangeMadera = (id, nuevoPrecioPorPie) => {
    // Reutiliza la lógica existente que ya diferencia por subcategoría
    handlePrecioPorPieChange(id, nuevoPrecioPorPie);
  };



  // Guardar cambios en Firestore
  const handleGuardarCambios = async () => {
    if (guardandoCambios) return;
    setErrorForm("");
    setGuardandoCambios(true);
    try {
      await guardarCambiosVenta();
    } catch (error) {
      console.error("Error al guardar cambios de la venta:", error);
      setErrorForm(error?.message || "Error al guardar los cambios.");
    } finally {
      setGuardandoCambios(false);
    }
  };

  const guardarCambiosVenta = async () => {
    // Debug logs para entender qué está pasando
    console.log("=== DEBUG handleGuardarCambios ===");
    console.log("ventaEdit:", ventaEdit);
    console.log("ventaEdit.clienteId:", ventaEdit.clienteId);
    console.log("ventaEdit.cliente:", ventaEdit.cliente);
    console.log("ventaEdit.cliente?.nombre:", ventaEdit.cliente?.nombre);
    console.log("venta original:", venta);
    console.log("venta.clienteId:", venta.clienteId);
    console.log("venta.cliente:", venta.cliente);

    // Validación robusta del cliente (sin bloquear por falta de clienteId)
    if (!ventaEdit.clienteId) {
      console.log("Advertencia: No hay clienteId en ventaEdit, generando fallback...");
      // Priorizar: id → CUIT → teléfono → email → id de venta → 'sin-id'
      const telefonoLimpio = (
        (ventaEdit.cliente?.telefono || venta.cliente?.telefono || "") + ""
      )
        .replace(/\D/g, "")
        .trim();
      const fallbackId =
        venta.clienteId ||
        ventaEdit.cliente?.cuit ||
        venta.cliente?.cuit ||
        (telefonoLimpio || undefined) ||
        ventaEdit.cliente?.email ||
        ventaEdit.id ||
        "sin-id";
      ventaEdit.clienteId = fallbackId;
      console.log("clienteId asignado (fallback):", ventaEdit.clienteId);
    }

    if (ventaEdit.tipoEnvio && ventaEdit.tipoEnvio !== "retiro_local") {
      if (!String(ventaEdit.fechaEntrega || "").trim()) {
        setErrorForm("Seleccioná la fecha de entrega antes de guardar.");
        return;
      }
      if (!String(ventaEdit.rangoHorario || "").trim()) {
        setErrorForm("Seleccioná el horario de entrega antes de guardar.");
        return;
      }
    }

    if (!ventaEdit.cliente) {
      console.log("Advertencia: No hay objeto cliente en ventaEdit, armando objeto mínimo...");
      ventaEdit.cliente =
        venta.cliente || {
          nombre: ventaEdit.clienteId || "Cliente",
          cuit: ventaEdit.clienteId || "",
          direccion: "",
          telefono: "",
          email: "",
        };
      console.log("cliente asignado:", ventaEdit.cliente);
    }

    if (!ventaEdit.cliente?.nombre) {
      // Evitar confusión por nombres repetidos: priorizar teléfono o CUIT si existen
      const telefonoLimpio = (
        (ventaEdit.cliente?.telefono || venta.cliente?.telefono || "") + ""
      )
        .replace(/\D/g, "")
        .trim();
      ventaEdit.cliente.nombre =
        (telefonoLimpio ? `Cliente ${telefonoLimpio}` : undefined) ||
        ventaEdit.cliente?.cuit ||
        venta.cliente?.nombre ||
        ventaEdit.clienteId ||
        "Cliente sin nombre";
      console.log("Nombre de cliente asignado:", ventaEdit.cliente.nombre);
    }

    console.log("✅ Validación del cliente exitosa");
    console.log("clienteId final:", ventaEdit.clienteId);
    console.log("cliente final:", ventaEdit.cliente);

    const productosArr = esVentaEcommerce
      ? (Array.isArray(venta.productos) ? venta.productos : venta.items || [])
      : (ventaEdit.productos || ventaEdit.items || []);

    if (!productosArr.length) {
      setErrorForm("Agrega al menos un producto.");
      return;
    }
    for (const p of productosArr) {
      if (!p.cantidad || p.cantidad <= 0) {
        setErrorForm("Todas las cantidades deben ser mayores a 0.");
        return;
      }
      if (p.descuento < 0 || p.descuento > 100) {
        setErrorForm("El descuento debe ser entre 0 y 100%.");
        return;
      }
    }

    const importesCalculados = calcularImportesEdicionVenta({
      esVentaEcommerce,
      ventaOriginal: venta,
      ventaEdit,
      totalesProductos: computeTotals(productosArr),
    });
    const {
      subtotal,
      descuentoTotal,
      descuentos,
      descuentoEfectivo,
      ivaPorcentaje,
      ivaMonto,
      transferenciaPorcentaje,
      transferenciaMonto,
      costoEnvioCalculado,
      total,
    } = importesCalculados;
    // Asegurar que la información del cliente se preserve
    if (!ventaEdit.cliente && venta.cliente) {
      ventaEdit.cliente = venta.cliente;
    }
    if (!ventaEdit.clienteId && venta.clienteId) {
      ventaEdit.clienteId = venta.clienteId;
    }

    // ===== LÓGICA PROFESIONAL PARA MANEJAR CAMBIOS =====

    // 4. Manejar cambios de envío de manera más robusta
    const tipoEnvioOriginal = venta.tipoEnvio || "retiro_local";
    const tipoEnvioNuevo = ventaEdit.tipoEnvio || "retiro_local";
    const costoEnvioOriginal = Number(venta.costoEnvio) || 0;
    const costoEnvioNuevo = costoEnvioCalculado;

    console.log("=== ANÁLISIS DE ENVÍO ===");
    console.log("Tipo envío original:", tipoEnvioOriginal);
    console.log("Tipo envío nuevo:", tipoEnvioNuevo);
    console.log("Costo envío original:", costoEnvioOriginal);
    console.log("Costo envío nuevo:", costoEnvioNuevo);

    // 5. Actualizar la venta con los nuevos totales calculados correctamente
    const paymentFields = normalizeVentaPaymentFields({
      venta: {
        ...ventaEdit,
        pagos: Array.isArray(ventaEdit.pagos) ? ventaEdit.pagos : pagosSimples,
        total,
      },
      previousVenta: venta,
      actorEmail: String(user?.email || ""),
      defaultFecha: fechaLocalActual(),
    });

    const ventaActualizada = {
      ...(esVentaEcommerce ? venta : ventaEdit),
      ...(esVentaEcommerce ? {
        fechaEntrega: ventaEdit.fechaEntrega || "",
        rangoHorario: ventaEdit.rangoHorario || "",
      } : {}),
      ...importesCalculados,
      subtotal,
      descuentoTotal,
      descuentos,
      descuentoEfectivo,
      aplicaIva: esVentaEcommerce ? venta.aplicaIva : Boolean(ventaEdit?.aplicaIva),
      ivaPorcentaje: esVentaEcommerce ? venta.ivaPorcentaje : ivaPorcentaje,
      ivaMonto,
      aplicaTransferencia: esVentaEcommerce ? venta.aplicaTransferencia : Boolean(ventaEdit?.aplicaTransferencia),
      transferenciaPorcentaje: esVentaEcommerce ? venta.transferenciaPorcentaje : transferenciaPorcentaje,
      transferenciaMonto,
      total,
      productos: productosArr,
      items: productosArr,
      ...paymentFields,
      version: venta?.version ?? ventaEdit?.version ?? 1,
      // Asegurar que el costo de envío se guarde correctamente
      costoEnvio: costoEnvioNuevo,
      // Limpiar campos de envío si es retiro local
      ...(tipoEnvioNuevo === "retiro_local" && {
        costoEnvio: 0,
        direccionEnvio: "",
        localidadEnvio: "",
      }),
    };

    const before = buildPagoSnapshot(venta);
    const after = buildPagoSnapshot(ventaActualizada);
    if (!user || typeof user.getIdToken !== "function") {
      throw new Error("No hay usuario autenticado");
    }
    const idToken = await user.getIdToken();
    const tryPutVenta = async (ventaPayload, origen) => {
      const resp = await fetch(`/api/erp/ventas/${encodeURIComponent(String(ventaEdit.id))}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${idToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ venta: ventaPayload, origen }),
      });
      const out = await resp.json().catch(() => ({}));
      return { resp, out };
    };

    let { resp, out } = await tryPutVenta(ventaActualizada, "ui_ventas_detail_edit");
    if ((!resp.ok || !out?.ok) && resp.status === 409) {
      const latestSnap = await getDoc(doc(db, "ventas", String(ventaEdit.id)));
      if (!latestSnap.exists()) {
        throw new Error(out?.error || "Conflicto de edición. Recargá y volvé a intentar.");
      }
      const latest = { ...(latestSnap.data() || {}), id: latestSnap.id };
      const merged = {
        ...latest,
        ...ventaActualizada,
        version: latest?.version ?? ventaActualizada?.version ?? 1,
        comprobantesPago: mergeComprobantesPago(latest?.comprobantesPago, ventaActualizada?.comprobantesPago),
      };
      ({ resp, out } = await tryPutVenta(merged, "ui_ventas_detail_edit_retry_409"));
    }

    if (!resp.ok || !out?.ok) {
      throw new Error(out?.error || "Error al actualizar la venta");
    }

    const flags = out?.flags || {};
    const nextVersion = Number(out?.version);
    const ventaActualizadaConFlags = {
      ...ventaActualizada,
      stockNegativo: Boolean(flags?.stockNegativo),
      productosSinPrecio: Boolean(flags?.productosSinPrecio),
      productosSinCosto: Boolean(flags?.productosSinCosto),
      requiereRevision: Boolean(flags?.requiereRevision),
      ...(Number.isFinite(nextVersion) ? { version: nextVersion } : null),
    };

    if (before.estadoPago !== after.estadoPago && user) {
      const numeroPedido = String(
        ventaActualizadaConFlags?.numeroPedido ||
          venta?.numeroPedido ||
          ventaActualizadaConFlags?.numero ||
          venta?.numero ||
          ""
      );
      await addDoc(collection(db, "ventas", ventaEdit.id, "pago_events"), {
        type: "estado_pago_changed",
        ventaId: String(ventaEdit.id || ""),
        numeroPedido,
        clienteId: String(ventaActualizada?.clienteId || ""),
        clienteNombre: String(ventaActualizada?.cliente?.nombre || ""),
        before,
        after,
        becamePagado:
          (before.estadoPago === "pendiente" || before.estadoPago === "parcial") && after.estadoPago === "pagado",
        at: serverTimestamp(),
        byUid: String(user.uid || ""),
        byEmail: String(user.email || ""),
        source: "ventas_detail_save",
      });
    }

    // Actualizar el estado local
    setVenta(ventaActualizadaConFlags);
    setEditando(false);
    ventaEditBaselineRef.current = null;
    
    // Limpiar campos de pago
    setVentaEdit((prev) => ({
      ...prev,
      nuevoPagoMonto: "",
      nuevoPagoMetodo: "",
    }));

    console.log("✅ Venta actualizada exitosamente");
    console.log("Total final:", total);
    console.log("Costo envío final:", costoEnvioNuevo);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="">Cargando venta...</p>
          <p className="text-sm text-muted-foreground mt-2">ID: {id}</p>
          <p className="text-sm text-muted-foreground">Lang: {lang}</p>
        </div>
      </div>
    );
  }

  if (error || !venta) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center max-w-md">
          <h2 className="text-2xl font-bold text-foreground mb-4">
            Venta no encontrada
          </h2>
          <p className=" mb-4">
            {error || "La venta que buscas no existe o ha sido eliminada."}
          </p>
          <div className="bg-muted/50 border border-border/60 rounded-lg p-4 mb-6 text-left">
            <p className="text-sm text-foreground">
              <strong>ID buscado:</strong> {id}
            </p>
            <p className="text-sm text-foreground">
              <strong>Lang:</strong> {lang}
            </p>
            <p className="text-sm text-foreground">
              <strong>URL:</strong> {window.location.href}
            </p>
            <p className="text-sm text-foreground">
              <strong>Params:</strong> {JSON.stringify(params)}
            </p>
          </div>
          <div className="flex gap-3 justify-center">
            <Button onClick={() => router.back()} className="no-print">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Volver
            </Button>
            <Button
              variant="outline"
              onClick={() => router.push(`/${lang}/ventas`)}
              className="no-print"
            >
              Ver todas las ventas
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Función para descargar PDF - Optimizada
  const handleDownloadPDF = async (paraEmpleado = false) => {
    if (!venta?.id) return;
    
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
          type: "venta",
          id: venta.id,
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
      a.download = `${venta.numeroPedido || venta.id?.slice(-8) || "documento"}${paraEmpleado ? "-empleado" : ""}.pdf`;
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

  // Función para obtener el estado del pago
  const getEstadoPagoColor = (estado) => {
    switch (estado) {
      case "pagado":
        return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
      case "pendiente":
        return "bg-amber-500/10 text-amber-700 dark:text-amber-300";
      default:
        return "bg-muted/50 text-muted-foreground";
    }
  };

  const paymentSnapshot = buildVentaPaymentSnapshot(venta);
  const hayCambiosVenta = Boolean(
    editando &&
    ventaEdit &&
    ventaEditBaselineRef.current &&
    JSON.stringify(ventaEdit) !== JSON.stringify(ventaEditBaselineRef.current)
  );
  const numeroVenta = String(venta?.numeroPedido || venta?.id?.slice(-8) || "—");
  const estadoPago = paymentSnapshot.estadoPago;
  const montoAbonado = paymentSnapshot.abonado;
  const saldoPendiente = paymentSnapshot.saldoPendiente;
  const estadoPagoFinal = paymentSnapshot.estadoPago;
  const esRetiroLocal = !venta?.tipoEnvio || ["retiro_local", "retiro", "retiro_en_sucursal", "retira", "retira_en_local", "pickup"].includes(String(venta.tipoEnvio).trim().toLowerCase());
  const esPagoTransferencia = ["transferencia", "transfer", "bank_transfer"].includes(String(venta?.formaPago || "").trim().toLowerCase());
  const estadoPreparacion = String(venta?.estadoPreparacion || "pendiente").trim().toLowerCase();
  const estadoComprobante = String(venta?.paymentProofStatus || "").trim().toLowerCase();
  const comprobantesPago = Array.isArray(venta?.comprobantesPago) ? venta.comprobantesPago : [];
  const comprobanteTransferencia = comprobantesPago.find((item) => item?.id === venta?.paymentProofEvidenceId)
    || (estadoComprobante === "received" ? venta?.ultimoComprobante || comprobantesPago[comprobantesPago.length - 1] : null);
  const comprobanteEsPdf = String(comprobanteTransferencia?.tipo || "").toLowerCase() === "pdf"
    || String(comprobanteTransferencia?.mimeType || "").toLowerCase().includes("pdf")
    || /\.pdf(?:[?#]|$)/i.test(String(comprobanteTransferencia?.url || ""));
  const sucursalRetiro = venta?.sucursal && typeof venta.sucursal === "object" ? venta.sucursal : {};
  const sucursalRetiroNombre = String(sucursalRetiro.nombre || sucursalRetiro.name || (typeof venta?.sucursal === "string" ? venta.sucursal : "")).trim();
  const sucursalRetiroDireccion = String(sucursalRetiro.direccion || sucursalRetiro.address || "").trim();
  const clienteEmail = String(venta?.cliente?.email || "").trim().toLowerCase();
  const clientePerfilVenta = clientes.find((cliente) => venta?.clienteId && cliente.id === venta.clienteId)
    || clientes.find((cliente) => clienteEmail && String(cliente.email || "").trim().toLowerCase() === clienteEmail)
    || {};
  const clienteDni = getClienteDni(venta?.cliente || {}) || getClienteDni(clientePerfilVenta);
  const clienteCuilCuit = obtenerCuilCuit(venta?.cliente || {}) || obtenerCuilCuit(clientePerfilVenta);

  const enviarAccionEcommerce = async (path, payload) => {
    if (!user?.getIdToken) throw new Error("Iniciá sesión nuevamente para realizar esta acción.");
    const token = await user.getIdToken();
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result?.ok === false) throw new Error(result?.error || "No se pudo completar la acción.");
    return result;
  };

  const actualizarEstadoRetiro = async (status) => {
    if (!venta?.id || pickupActionBusy) return;
    setPickupActionBusy(true);
    setEcommerceActionError("");
    setEcommerceActionNotice("");
    try {
      const result = await enviarAccionEcommerce(`/api/erp/ventas/${encodeURIComponent(venta.id)}/pickup-status`, {
        status,
      });
      if (result.sale) setVenta((previous) => ({ ...previous, ...result.sale }));
      const customerChannel = result.notification?.channels?.find((channel) => channel.audience === "customer");
      const emailNote = result.notificationError
        ? ` No se pudo enviar el email: ${result.notificationError}`
        : result.notification?.skipped
          ? " El aviso por email está desactivado en la configuración."
          : customerChannel?.skipped
            ? " No hay un email de cliente disponible para el aviso."
            : result.notification?.channels?.length
              ? " Se procesó el aviso por email."
              : "";
      setEcommerceActionNotice(status === "preparando"
        ? `Preparación iniciada.${emailNote}`
        : status === "listo_para_retirar"
          ? `Pedido listo para retirar.${emailNote} También podés avisar por WhatsApp.`
          : "Retiro registrado.");
    } catch (actionError) {
      setEcommerceActionError(actionError instanceof Error ? actionError.message : "No se pudo actualizar el estado de retiro.");
    } finally {
      setPickupActionBusy(false);
    }
  };

  const revisarComprobante = async (action) => {
    if (!venta?.id || proofActionBusy) return;
    const reason = proofReasonDraft.trim();
    if (action === "reject" && !reason) {
      setEcommerceActionError("Escribí qué debe corregir el cliente antes de observar el comprobante.");
      return;
    }
    setProofActionBusy(true);
    setEcommerceActionError("");
    setEcommerceActionNotice("");
    try {
      const result = await enviarAccionEcommerce(`/api/erp/ventas/${encodeURIComponent(venta.id)}/payment-proof`, { action, ...(action === "reject" ? { reason } : {}) });
      if (result.sale) setVenta((previous) => ({ ...previous, ...result.sale }));
      setProofReasonDraft("");
      setShowProofRejectForm(false);
      const customerNotification = result.notification?.channels?.find((channel) => channel.audience === "customer");
      const notificationNote = result.notificationError
        ? ` No se pudo enviar el aviso: ${result.notificationError}`
        : result.notification?.skipped || customerNotification?.skipped
          ? " El aviso por email está desactivado o no hay email de cliente disponible."
          : " Se procesó el aviso por email.";
      setEcommerceActionNotice(action === "confirm"
        ? `Acreditación confirmada y pago registrado.${notificationNote}`
        : `Comprobante observado.${notificationNote}`);
    } catch (actionError) {
      setEcommerceActionError(actionError instanceof Error ? actionError.message : "No se pudo revisar el comprobante.");
    } finally {
      setProofActionBusy(false);
    }
  };

  const whatsappRetiroHref = (() => {
    let phone = String(venta?.cliente?.telefono || "").replace(/\D/g, "");
    if (phone.startsWith("00")) phone = phone.slice(2);
    if (phone.startsWith("54")) {
      if (!phone.startsWith("549")) phone = `549${phone.slice(2)}`;
    } else {
      phone = `549${phone.replace(/^0+/, "")}`;
    }
    if (phone.length < 11) return "";
    const reference = String(venta?.numeroPedido || venta?.id?.slice(-8) || "");
    const place = [sucursalRetiroNombre, sucursalRetiroDireccion].filter(Boolean).join(" · ");
    const text = `Hola ${String(venta?.cliente?.nombre || "").trim()}, tu pedido ${reference} está listo para retirar${place ? ` en ${place}` : " en nuestra sucursal"}.`;
    return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
  })();

  // El borrado se procesa en el servidor y queda registrado en auditoría.
  const handleBorrarPago = async (pagoIndex) => {
    if (!user) return;

    setErrorBorrarPago("");
    setBorrandoPago(true);
    setPagoABorrar(pagoIndex);

    try {
      // Crear nueva lista de pagos sin el pago a borrar
      const nuevosPagos = venta.pagos.filter((_, index) => index !== pagoIndex);

      const paymentFields = normalizeVentaPaymentFields({
        venta: {
          ...venta,
          pagos: nuevosPagos,
          montoAbonado: nuevosPagos.reduce((total, payment) => total + (Number(payment?.monto) || 0), 0),
        },
        previousVenta: venta,
        actorEmail: String(user?.email || ""),
      });

      // Actualizar la venta en el estado local
      const ventaActualizada = {
        ...venta,
        ...paymentFields,
      };

      // La API actualiza la venta y registra la auditoría en una sola transacción.
      const before = buildPagoSnapshot(venta);
      const after = buildPagoSnapshot(ventaActualizada);
      const response = await fetch(`/api/erp/ventas/${encodeURIComponent(venta.id)}/payments`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await user.getIdToken()}` },
        body: JSON.stringify({ paymentIndex: pagoIndex, version: venta.version ?? null }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "No se pudo eliminar el pago");
      ventaActualizada.version = result.version;
      setVenta(ventaActualizada);

      if (before.estadoPago !== after.estadoPago && user) {
        const numeroPedido = String(venta?.numeroPedido || venta?.numero || "");
        try {
          await addDoc(collection(db, "ventas", venta.id, "pago_events"), {
            type: "estado_pago_changed",
            ventaId: String(venta.id || ""),
            numeroPedido,
            clienteId: String(venta?.clienteId || ""),
            clienteNombre: String(venta?.cliente?.nombre || ""),
            before,
            after,
            becamePagado:
              (before.estadoPago === "pendiente" || before.estadoPago === "parcial") && after.estadoPago === "pagado",
            at: serverTimestamp(),
            byUid: String(user.uid || ""),
            byEmail: String(user.email || ""),
            source: "ventas_detail_delete_pago",
          });
        } catch (eventError) {
          console.error("No se pudo registrar el cambio de estado del pago:", eventError);
        }
      }

      console.log("✅ Pago borrado exitosamente");
    } catch (error) {
      console.error("Error al borrar pago:", error);
      setErrorBorrarPago(error instanceof Error ? error.message : "No se pudo eliminar el pago.");
    } finally {
      setBorrandoPago(false);
      setPagoABorrar(null);
    }
  };

  // Función para confirmar borrado de pago
  const confirmarBorradoPago = (pagoIndex) => {
    if (!user || !Array.isArray(venta?.pagos) || !venta.pagos[pagoIndex]) return;
    setErrorBorrarPago("");
    setPagoABorrar(pagoIndex);
    setMostrarConfirmacionBorrado(true);
  };

  return (
    <main className="mx-auto min-h-[calc(100vh-4rem)] w-full px-3 py-4 font-sans text-foreground sm:px-6 sm:py-7">
      <style>{`
    @keyframes fade-in {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .animate-fade-in {
      animation: fade-in 0.5s;
    }
    @media (prefers-reduced-motion: reduce) {
      .animate-fade-in { animation: none; }
    }
    .venta-productos-responsive th {
      font-size: 0.75rem !important;
      font-weight: 500 !important;
      opacity: 0.72;
    }
    @media (max-width: 767px) {
      .venta-productos-responsive > div { overflow: visible !important; }
      .venta-productos-responsive table,
      .venta-productos-responsive tbody { display: block; width: 100%; }
      .venta-productos-responsive thead {
        position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
        overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
      }
      .venta-productos-responsive tbody { display: grid; gap: 0.75rem; }
      .venta-productos-responsive tr {
        display: grid; grid-template-columns: repeat(2, minmax(0, 1fr));
        overflow: hidden; border-bottom: 1px solid color-mix(in srgb, currentColor 16%, transparent);
        border-radius: 0.65rem; color: inherit;
      }
      .venta-productos-responsive td {
        display: flex; min-width: 0; align-items: flex-start; justify-content: space-between;
        gap: 0.5rem; padding: 0.65rem !important; text-align: right !important;
        font-size: 0.8rem !important;
      }
      .venta-productos-responsive td::before {
        flex: 0 1 auto; color: inherit; content: ""; opacity: 0.65;
        font-size: 0.7rem; text-align: left; font-weight: 500;
      }
      .venta-productos-responsive td:nth-child(2) {
        display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center;
      }
      .venta-productos-responsive td:nth-child(2)::before { grid-column: 1; grid-row: 1 / span 2; }
      .venta-productos-responsive td:nth-child(2) > div {
        grid-column: 2; justify-self: end; text-align: right; white-space: nowrap;
      }
      .venta-productos-responsive td:first-child {
        display: block; grid-column: 1 / -1; border-bottom: 1px solid color-mix(in srgb, currentColor 14%, transparent) !important;
        padding: 0.8rem !important; text-align: left !important;
      }
      .venta-productos-responsive td:first-child::before { content: none; }
      .venta-productos-responsive td:nth-child(2)::before { content: "Cantidad"; }
      .venta-productos-responsive td:nth-child(3)::before { content: "Cepillado"; }
      .venta-productos-responsive td:nth-child(4)::before { content: "Calibrado"; }
      .venta-productos-responsive td:nth-child(5)::before { content: "Precio unit."; }
      .venta-productos-responsive td:nth-child(6)::before { content: "Descuento"; }
      .venta-productos-responsive td:nth-child(7)::before { content: "Subtotal"; }
    }
    @media screen {
      .venta-productos-responsive thead tr {
        border-bottom-color: color-mix(in srgb, var(--border) 42%, transparent) !important;
      }
      .venta-productos-responsive tbody tr {
        border-bottom-color: color-mix(in srgb, var(--border) 26%, transparent) !important;
      }
    }
    @media screen and (max-width: 767px) {
      .venta-productos-responsive tr {
        border-bottom-color: color-mix(in srgb, var(--border) 26%, transparent) !important;
      }
      .venta-productos-responsive td:first-child {
        border-bottom-color: color-mix(in srgb, var(--border) 20%, transparent) !important;
      }
    }
    #venta-print .sello-pendiente { color: #b91c1c; border-color: #b91c1c; }
    #venta-print .sello-parcial { color: #b45309; border-color: #b45309; }
    #venta-print .sello-pagado { color: #065f46; border-color: #065f46; }
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
      #venta-print, #venta-print * { visibility: visible !important; }
      #venta-print .no-print, #venta-print .no-print * { display: none !important; }
      #venta-print {
        position: absolute !important;
        top: 0 !important;
        left: 0 !important;
        margin: 0 !important;
        padding: 0 !important;
        width: 100% !important;
        background: white !important;
      }
      /* Layout 2 columnas con espaciado sutil para legibilidad */
      #venta-print .grid { 
        display: grid !important;
        grid-template-columns: 1fr 1fr !important;
        gap: 16px !important;
        margin-bottom: 12px !important;
      }
      /* Tarjetas sin sombras pero con separación mínima */
      #venta-print .bg-card {
        background: #fff !important;
        padding: 8px !important;
        border-radius: 6px !important;
        box-shadow: none !important;
        border: 1px solid #e5e7eb !important;
      }
      /* Reducir tamaños de fuente para que quepa todo */
      #venta-print h3 {
        font-size: 14px !important;
        margin-bottom: 8px !important;
      }
      #venta-print .text-sm { font-size: 11px !important; }
      #venta-print h3 { margin: 0 0 6px 0 !important; }
      #venta-print .space-y-2 > div { margin-bottom: 3px !important; }
      /* Reducir espaciados utilitarios en impresión, no eliminarlos */
      #venta-print .p-6, 
      #venta-print .p-4 { padding: 8px !important; }
      #venta-print .px-4 { padding-left: 8px !important; padding-right: 8px !important; }
      #venta-print .py-4 { padding-top: 8px !important; padding-bottom: 8px !important; }
      #venta-print .mb-6 { margin-bottom: 10px !important; }
      #venta-print .mb-4 { margin-bottom: 8px !important; }
      #venta-print .mt-6 { margin-top: 10px !important; }
      #venta-print .mt-4 { margin-top: 8px !important; }
      /* Compactar tabla de productos */
      #venta-print table th, 
      #venta-print table td { padding-top: 6px !important; padding-bottom: 6px !important; }
      #venta-print .border-b { border-bottom: 1px solid #e5e7eb !important; }
      
      /* Estilos específicos para impresión de empleados */
      body.print-empleado #venta-print .precio-empleado,
      body.print-empleado #venta-print .subtotal-empleado,
      body.print-empleado #venta-print .total-empleado,
      body.print-empleado #venta-print .descuento-empleado,
      body.print-empleado #venta-print .costo-envio-empleado,
      body.print-empleado #venta-print .monto-abonado-empleado,
      body.print-empleado #venta-print .saldo-pendiente-empleado,
      body.print-empleado #venta-print .estado-pago-empleado,
      body.print-empleado #venta-print .forma-pago-empleado,
      body.print-empleado #venta-print .historial-pagos-empleado {
        display: none !important;
      }
      
      /* Mostrar mensaje para empleados */
      body.print-empleado #venta-print .mensaje-empleado {
        display: block !important;
        background: #f0f9ff !important;
        border: 2px solid #0ea5e9 !important;
        padding: 15px !important;
        margin: 20px 0 !important;
        border-radius: 8px !important;
        text-align: center !important;
        font-weight: bold !important;
        color: #0c4a6e !important;
      }
      
      /* Ocultar mensaje en impresión normal */
      body:not(.print-empleado) #venta-print .mensaje-empleado {
        display: none !important;
      }
      
    }
  `}</style>
      <div id="venta-print" className="mx-auto px-1 sm:px-3">
        {/* Header profesional igual al de presupuesto */}
        <div
          className="print-header mb-5 hidden items-center gap-4 border-b border-border pb-4 print:flex"
          style={{ marginBottom: 32 }}
        >
          <img
            src="/logo-maderera.png"
            alt="Logo Maderera"
            style={{ height: 60, width: "auto" }}
          />
          <div>
            <h1 className="text-2xl font-bold " style={{ letterSpacing: 1 }}>
              Maderas Caballero
            </h1>
            <div className=" text-sm">Venta / Comprobante</div>
            <div className="text-muted-foreground text-xs">
              www.caballeromaderas.com
            </div>
          </div>
          <div className="ml-auto text-right">
            <div className="text-xs text-muted-foreground">
              Fecha: {venta?.fecha ? formatFechaLocal(venta.fecha) : "-"}
            </div>
            <div className="text-xs text-muted-foreground">
              N°: {venta?.numeroPedido || venta?.id?.slice(-8)}
            </div>
          </div>
        </div>
        {/* Header con botones */}
        <div className="no-print mb-5 border-b border-border/60 px-0 pb-5 pt-1">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <Button
                variant="outline"
                aria-label="Volver a ventas"
                onClick={() => router.back()}
                className="mt-1 h-11 w-11 shrink-0 rounded-xl border-border bg-card p-0 text-foreground shadow-sm hover:bg-muted"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                  {numeroVenta.toUpperCase().startsWith("VENTA-") ? numeroVenta : `VENTA-${numeroVenta}`}
                </h1>
                {!ventaAnulada ? (
                  <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
                    estadoPagoFinal === "pagado"
                      ? "bg-success/10 text-foreground"
                      : estadoPagoFinal === "parcial"
                        ? "bg-warning/10 text-foreground"
                        : "bg-destructive/10 text-foreground"
                  }`}>
                    <span className={`mr-1.5 h-1.5 w-1.5 rounded-full ${estadoPagoFinal === "pagado" ? "bg-success" : estadoPagoFinal === "parcial" ? "bg-warning" : "bg-destructive"}`} />
                    {estadoPagoFinal === "pagado" ? "Pagado" : estadoPagoFinal === "parcial" ? "Pago parcial" : "Pendiente"}
                  </span>
                ) : null}
              </div>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {formatFechaHoraLocal(venta?.fecha)} <span className="px-1.5">·</span> Venta / Comprobante
              </p>
              {ventaAnulada && (
                <div className="mt-3 inline-flex max-w-full flex-wrap items-center gap-2 rounded-md border border-destructive/20 bg-destructive/10 px-3 py-1.5 text-sm font-semibold text-destructive">
                  <XCircle className="h-4 w-4 shrink-0" />
                  <span>Venta anulada</span>
                  {venta?.anulacionMotivo ? (
                    <span className="font-normal opacity-90">· {String(venta.anulacionMotivo)}</span>
                  ) : null}
                </div>
              )}
              {venta?.aReponer === true && (
                <div className="mt-3 flex max-w-3xl items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-foreground">
                  <span className="font-semibold">A reponer:</span>
                  <span>
                    {(Array.isArray(venta.productos) ? venta.productos : [])
                      .filter((p) => Number(p?.cantidadSinStock) > 0)
                      .map((p) => `${p.cantidadSinStock} u. de ${p.nombre}${p.plazoEntrega ? ` (plazo: ${p.plazoEntrega})` : ""}`)
                      .join(" · ")}
                    {" "}Estas unidades se pidieron sin stock y no descuentan inventario.
                  </span>
                </div>
              )}
              </div>
            </div>
            <div className="flex w-full flex-wrap items-center gap-2 xl:w-auto xl:justify-end">
              <Button
                type="button"
                onClick={(event) => handlePrintPDF(false, event)}
                disabled={downloadingPDF || downloadingPDFEmpleado || printingPDF || printingPDFEmpleado || printingPDFEnvio}
                className="no-print h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground shadow-sm hover:bg-muted disabled:opacity-50 sm:w-auto"
              >
                {printingPDF ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Printer className="mr-2 h-4 w-4" />}
                Imprimir
              </Button>
              <Button
                onClick={(e) => {
                  if (e) {
                    e.preventDefault();
                    e.stopPropagation();
                  }
                  handlePrintEnvio(e);
                }}
                disabled={downloadingPDF || downloadingPDFEmpleado || printingPDF || printingPDFEmpleado || printingPDFEnvio}
                className="no-print h-10 flex-none rounded-lg border border-success/30 bg-success/10 px-3 text-sm text-foreground hover:bg-success/15 disabled:opacity-50"
              >
                {printingPDFEnvio ? (
                  <Loader2 className="w-4 h-4 mr-0 animate-spin sm:mr-2" />
                ) : (
                  <Truck className="h-4 w-4 mr-0 text-success sm:mr-2" />
                )}
                <span className="hidden sm:inline relative z-10 font-medium">Imprimir Envío</span>
                <span className="sr-only sm:hidden">Imprimir envío</span>
              </Button>
              <Button
                onClick={(e) => {
                  if (e) {
                    e.preventDefault();
                    e.stopPropagation();
                  }
                  handlePrintPDF(true, e);
                }}
                disabled={downloadingPDF || downloadingPDFEmpleado || printingPDF || printingPDFEmpleado || printingPDFEnvio}
                className="no-print h-10 flex-none rounded-lg border border-info/30 bg-info/10 px-3 text-sm text-foreground hover:bg-info/15 disabled:opacity-50"
              >
                {printingPDFEmpleado ? (
                  <Loader2 className="w-4 h-4 mr-0 animate-spin sm:mr-2" />
                ) : (
                  <Printer className="h-4 w-4 mr-0 text-info sm:mr-2" />
                )}
                <span className="hidden sm:inline relative z-10 font-medium">Imprimir Empleado</span>
                <span className="sr-only sm:hidden">Imprimir versión para empleado</span>
              </Button>
              <details className="group relative w-full sm:w-auto">
                <summary className="flex h-10 cursor-pointer list-none items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                  {downloadingPDF || downloadingPDFEmpleado ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  <span>Descargar</span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </summary>
                <div className="absolute right-0 top-full z-30 mt-2 w-56 rounded-lg border border-border bg-popover p-1.5 text-popover-foreground shadow-lg">
                  <button
                    type="button"
                    disabled={downloadingPDF || downloadingPDFEmpleado || printingPDF || printingPDFEmpleado || printingPDFEnvio}
                    onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); handleDownloadPDF(false); }}
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                  >
                    <Download className="h-4 w-4" />Comprobante
                  </button>
                  <button
                    type="button"
                    disabled={downloadingPDF || downloadingPDFEmpleado || printingPDF || printingPDFEmpleado || printingPDFEnvio}
                    onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); handleDownloadPDF(true); }}
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                  >
                    <Download className="h-4 w-4" />Versión para empleado
                  </button>
                </div>
              </details>
              {editando ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setEditando(false);
                    setVentaEdit(null);
                    ventaEditBaselineRef.current = null;
                    setErrorForm("");
                  }}
                  disabled={loadingPrecios || guardandoCambios}
                  className="no-print h-10 flex-none rounded-lg border-border px-3 text-sm"
                >
                  <XCircle className="mr-2 h-4 w-4" />Cancelar
                </Button>
              ) : !ventaAnulada ? (
                <Button
                  onClick={() => setEditando(true)}
                  className="no-print h-10 flex-none rounded-lg bg-foreground px-3 text-sm text-background hover:bg-foreground/90"
                >
                  <Edit className="mr-2 h-4 w-4" />
                  <span>Editar</span>
                </Button>
              ) : null}
            </div>
          </div>
        </div>
        {!ventaAnulada && (venta?.requiereRevision || venta?.stockNegativo || venta?.advertencias?.stockInsuficiente?.length > 0) && (
          <div className="no-print mb-5 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-foreground">
            <div className="font-semibold">Revisión de inventario</div>
            {Array.isArray(venta?.advertencias?.stockInsuficiente) && venta.advertencias.stockInsuficiente.length > 0 ? (
              <div className="mt-2 space-y-1">
                {venta.advertencias.stockInsuficiente.slice(0, 6).map((item) => (
                  <div key={`${item.productoId}-${item.requerido}`} className="text-xs">
                    {item.productoNombre || item.productoId}: requiere {item.requerido}, disponibles {item.stockDisponible ?? item.stockAntes}; después de la venta quedarían {item.stockDespues}.
                  </div>
                ))}
                {venta.advertencias.stockInsuficiente.length > 6 && (
                  <div className="text-xs">y {venta.advertencias.stockInsuficiente.length - 6} componente(s) más.</div>
                )}
              </div>
            ) : (
              <div className="mt-1 text-xs">La operación tiene advertencias que requieren control.</div>
            )}
          </div>
        )}
        {!editando ? (
        <>
        {!ventaAnulada && esVentaEcommerce && (esRetiroLocal || esPagoTransferencia) ? (
          <section className="no-print mb-5 overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm" aria-labelledby={esRetiroLocal ? "ecommerce-operations-title" : "payment-proof-title"}>

            {esRetiroLocal ? (
              <div className="grid gap-4 px-4 py-5 sm:px-6 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
                <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(12rem,1.1fr)_minmax(0,1fr)_minmax(0,1.25fr)_minmax(12rem,1.1fr)] xl:items-center">
                  <div className="flex min-w-0 items-center gap-3 xl:pr-4">
                    <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-muted text-foreground">
                      <Package className="h-6 w-6" />
                    </span>
                    <div className="min-w-0">
                      <h2 id="ecommerce-operations-title" className="text-lg font-semibold tracking-tight text-foreground">Preparación y retiro</h2>
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-foreground ${
                      estadoPreparacion === "listo_para_retirar" ? "bg-success/10"
                        : estadoPreparacion === "preparando" ? "bg-info/10"
                          : estadoPreparacion === "retirado" ? "bg-muted text-muted-foreground"
                            : "bg-warning/10"
                    }`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${estadoPreparacion === "listo_para_retirar" ? "bg-success" : estadoPreparacion === "preparando" ? "bg-info" : estadoPreparacion === "retirado" ? "bg-muted-foreground" : "bg-warning"}`} />
                      {{
                        pendiente: "Pendiente de preparación",
                        preparando: "En preparación",
                        listo_para_retirar: "Listo para retirar",
                        retirado: "Retirado",
                      }[estadoPreparacion] || estadoPreparacion}
                    </span>
                    </div>
                  </div>
                  <dl className="mt-3 grid gap-x-5 gap-y-2 text-sm sm:col-span-2 sm:grid-cols-2 xl:col-span-2 xl:col-start-2 xl:row-start-1 xl:grid-cols-2 xl:border-l xl:border-border/60 xl:py-2 xl:pl-5">
                    <div className="min-w-0">
                      <dt className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><Store className="h-4 w-4" aria-hidden="true" />Sucursal</dt>
                      <dd className="mt-1 break-words text-sm font-semibold text-foreground">{sucursalRetiroNombre || "Sin sucursal asignada"}</dd>
                    </div>
                    <div className="min-w-0 sm:col-span-2 xl:col-span-1">
                      <dt className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><MapPin className="h-4 w-4" aria-hidden="true" />Dirección de retiro</dt>
                      <dd className="mt-1 break-words text-sm leading-relaxed text-foreground">{sucursalRetiroDireccion || "Dirección no disponible"}</dd>
                    </div>
                  </dl>
                  <div className="flex min-w-0 items-start gap-3 border-t border-border/60 pt-3 text-sm sm:col-span-2 xl:col-start-4 xl:border-l xl:border-t-0 xl:py-2 xl:pl-5">
                    <CalendarDays className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-muted-foreground">Franja de retiro <span className="font-normal">(opcional)</span></p>
                      <p className="mt-1 break-words font-semibold text-foreground">
                      {[venta?.fechaEntrega ? formatFechaLocal(venta.fechaEntrega) : "", venta?.rangoHorario || ""]
                        .filter(Boolean).join(", ") || "Sin fecha ni horario asignado"}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 border-t border-border/60 pt-4 sm:justify-end xl:col-start-2 xl:row-start-1 xl:flex-col xl:border-l xl:border-t-0 xl:py-2 xl:pl-5">
                  {estadoPreparacion === "pendiente" ? (
                    <Button type="button" variant="outline" size="sm" className="h-10 rounded-lg border-border px-3" disabled={pickupActionBusy} onClick={() => actualizarEstadoRetiro("preparando")}>
                      {pickupActionBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Comenzar preparación
                    </Button>
                  ) : null}
                  {estadoPreparacion === "preparando" ? (
                    <Button type="button" size="sm" className="h-10 rounded-lg bg-foreground px-3 text-background hover:bg-foreground/90" disabled={pickupActionBusy || (esPagoTransferencia && estadoPago !== "pagado")} onClick={() => actualizarEstadoRetiro("listo_para_retirar")}>
                      {pickupActionBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}Marcar listo para retirar
                    </Button>
                  ) : null}
                  {estadoPreparacion === "listo_para_retirar" ? (
                    <>
                      {whatsappRetiroHref ? (
                        <Button type="button" variant="outline" size="sm" className="h-10 rounded-lg border-border px-3" asChild>
                          <a href={whatsappRetiroHref} target="_blank" rel="noopener noreferrer"><MessageCircle className="mr-2 h-4 w-4" />Avisar por WhatsApp</a>
                        </Button>
                      ) : null}
                      <Button type="button" size="sm" className="h-10 rounded-lg bg-foreground px-3 text-background hover:bg-foreground/90" disabled={pickupActionBusy} onClick={() => actualizarEstadoRetiro("retirado")}>
                        {pickupActionBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Registrar retiro
                      </Button>
                    </>
                  ) : null}
                </div>
                <p className="flex items-start gap-2 border-t border-border/60 pt-4 text-xs leading-relaxed text-muted-foreground xl:col-span-2 xl:row-start-2">
                  <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>
                    {esPagoTransferencia && estadoPago !== "pagado"
                      ? "Podés iniciar la preparación. Para marcar el pedido listo para retirar, primero confirmá la acreditación."
                      : estadoPreparacion === "preparando"
                        ? "Al cliente se le avisará cuando el pedido quede listo para retirar."
                        : estadoPreparacion === "retirado"
                          ? "El retiro de este pedido ya fue registrado."
                          : "Esta franja corresponde al pedido; no modifica el horario habitual de atención de la sucursal."}
                  </span>
                </p>
              </div>
            ) : null}

            {esPagoTransferencia ? (
              <div className={`${esRetiroLocal ? "border-t border-border/60" : ""} px-4 py-4 sm:px-5`}>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <h3 id="payment-proof-title" className="text-sm font-semibold text-foreground">Comprobante de transferencia</h3>
                  <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                    estadoComprobante === "confirmed" ? "text-success"
                      : estadoComprobante === "rejected" ? "text-destructive"
                        : "text-muted-foreground"
                  }`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${estadoComprobante === "confirmed" ? "bg-success" : estadoComprobante === "rejected" ? "bg-destructive" : "bg-warning"}`} />
                    {{
                      received: "Pendiente de revisión",
                      confirmed: "Acreditación confirmada",
                      rejected: "Debe volver a cargarse",
                      awaiting_transfer: "Pendiente de comprobante",
                    }[estadoComprobante] || "Sin comprobante recibido"}
                  </span>
                </div>
                <p className="mt-1.5 max-w-3xl text-xs leading-relaxed text-muted-foreground">
                  {estadoComprobante === "received"
                    ? "El archivo es solo un respaldo. Confirmá el ingreso en la cuenta antes de aprobar el pago."
                    : estadoComprobante === "confirmed"
                      ? "La acreditación fue verificada y registrada en la venta."
                      : estadoComprobante === "rejected"
                        ? "Se solicitó una nueva carga. El pago sigue pendiente de acreditación."
                        : "Todavía no se recibió un comprobante de transferencia."}
                </p>
                {estadoComprobante === "rejected" && venta?.paymentProofReason ? (
                  <p className="mt-2 text-xs text-destructive">Motivo enviado al cliente: {venta.paymentProofReason}</p>
                ) : null}

                <div className="mt-4 grid gap-4 border-t border-border/50 pt-4 lg:grid-cols-[minmax(0,1fr)_minmax(17rem,0.82fr)] lg:items-start">
                  {comprobanteTransferencia?.url ? (
                    <div className="flex min-w-0 items-center gap-3">
                      <a
                        href={comprobanteTransferencia.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Abrir comprobante: ${comprobanteTransferencia.nombre || (comprobanteEsPdf ? "archivo PDF" : "imagen")}`}
                        className="grid h-[4.5rem] w-[4.5rem] shrink-0 place-items-center overflow-hidden rounded-md bg-muted/50 text-muted-foreground transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {comprobanteEsPdf ? (
                          <FileText className="h-7 w-7" aria-hidden="true" />
                        ) : (
                          <>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={comprobanteTransferencia.url}
                              alt="Vista previa del comprobante recibido"
                              className="h-full w-full object-contain p-1"
                            />
                          </>
                        )}
                      </a>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-muted-foreground">Archivo recibido</p>
                        <p className="mt-0.5 truncate text-sm font-medium text-foreground" title={comprobanteTransferencia.nombre || "Comprobante de transferencia"}>
                          {comprobanteTransferencia.nombre || (comprobanteEsPdf ? "Comprobante.pdf" : "Comprobante de transferencia")}
                        </p>
                        <a
                          href={comprobanteTransferencia.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          Ver comprobante <ExternalLink className="h-3 w-3" aria-hidden="true" />
                        </a>
                      </div>
                    </div>
                  ) : (
                    <p className="self-center text-xs text-muted-foreground">No hay un archivo disponible para previsualizar.</p>
                  )}

                  {estadoComprobante === "received" ? (
                    <div className="min-w-0 space-y-2 lg:justify-self-stretch">
                      <div className="flex flex-col gap-2 sm:flex-row lg:flex-col">
                        <Button
                          type="button"
                          size="sm"
                          className="h-10 w-full rounded-lg px-3 sm:flex-1 lg:flex-none"
                          disabled={proofActionBusy}
                          onClick={() => revisarComprobante("confirm")}
                        >
                          {proofActionBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                          Confirmar acreditación
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-9 w-full justify-center rounded-lg px-3 text-muted-foreground hover:bg-muted hover:text-foreground"
                          disabled={proofActionBusy}
                          aria-expanded={showProofRejectForm}
                          aria-controls="payment-proof-rejection-form"
                          onClick={() => {
                            setShowProofRejectForm((shown) => !shown);
                            setProofReasonDraft("");
                            setEcommerceActionError("");
                          }}
                        >
                          {showProofRejectForm ? <ChevronUp className="mr-2 h-4 w-4" /> : <ChevronDown className="mr-2 h-4 w-4" />}
                          {showProofRejectForm ? "Cancelar solicitud" : "Solicitar nueva carga"}
                        </Button>
                      </div>
                      {showProofRejectForm ? (
                        <div id="payment-proof-rejection-form" className="space-y-2 border-t border-border/50 pt-3">
                          <label htmlFor="payment-proof-reason" className="block text-xs font-medium text-foreground">Qué debe corregir el cliente</label>
                          <textarea
                            id="payment-proof-reason"
                            value={proofReasonDraft}
                            onChange={(event) => setProofReasonDraft(event.target.value)}
                            maxLength={300}
                            rows={3}
                            disabled={proofActionBusy}
                            aria-describedby="payment-proof-reason-help"
                            className="block min-h-20 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                            placeholder="Ej.: no se alcanza a leer el importe o la fecha"
                          />
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <p id="payment-proof-reason-help" className="text-[11px] leading-relaxed text-muted-foreground">El motivo se incluirá en el aviso al cliente.</p>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-9 shrink-0 rounded-lg border-border px-3"
                              disabled={proofActionBusy || !proofReasonDraft.trim()}
                              onClick={() => revisarComprobante("reject")}
                            >
                              {proofActionBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                              Enviar solicitud
                            </Button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {ecommerceActionError ? <p className="mx-4 mb-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive sm:mx-5" role="alert">{ecommerceActionError}</p> : null}
            {ecommerceActionNotice ? <p className="mx-4 mb-4 rounded-lg bg-success/10 px-3 py-2 text-sm text-foreground sm:mx-5" role="status">{ecommerceActionNotice}</p> : null}
          </section>
        ) : null}
        {/* 1. Información del cliente y venta */}
        <div className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-[1fr_1.08fr_.92fr]">
          <div className="flex min-w-0 flex-col gap-4 rounded-2xl border border-border/60 bg-card p-4 shadow-sm sm:p-5">
            <div className="mb-1 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-muted text-foreground"><User className="h-5 w-5" /></span>
                <h2 className="text-lg font-semibold tracking-tight">Cliente</h2>
              </div>
              {editando && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowSelectorCliente(true)}
                  className="flex items-center gap-2"
                >
                  <Edit className="w-4 h-4" />
                  <span className="hidden sm:inline">Cambiar Cliente</span>
                  <span className="sm:hidden">Cambiar</span>
                </Button>
              )}
            </div>
            <div className="venta-cliente-info min-w-0 break-words text-sm">
              <div className="venta-nombre-cliente flex items-center gap-3 border-b border-border/60 pb-4 text-lg font-semibold uppercase tracking-wide text-foreground">
                <User className="h-5 w-5 shrink-0" aria-hidden="true" />
                <span>{venta.cliente?.nombre || "-"}</span>
              </div>
              <dl className="mt-4 space-y-3">
                <div className="grid grid-cols-[minmax(7rem,.9fr)_minmax(0,1.1fr)] gap-3">
                  <dt className="flex items-center gap-2 text-muted-foreground"><IdCard className="h-4 w-4 shrink-0" aria-hidden="true" />DNI</dt>
                  <dd className="min-w-0 font-medium text-foreground">{clienteDni || "-"}</dd>
                </div>
                <div className="grid grid-cols-[minmax(7rem,.9fr)_minmax(0,1.1fr)] gap-3">
                  <dt className="flex items-center gap-2 text-muted-foreground"><IdCard className="h-4 w-4 shrink-0" aria-hidden="true" />CUIL / CUIT</dt>
                  <dd className="min-w-0 font-medium text-foreground">{clienteCuilCuit || "-"}</dd>
                </div>
                <div className="grid grid-cols-[minmax(7rem,.9fr)_minmax(0,1.1fr)] gap-3">
                  <dt className="flex items-center gap-2 text-muted-foreground"><Phone className="h-4 w-4 shrink-0" aria-hidden="true" />Teléfono</dt>
                  <dd className="min-w-0 break-all font-medium text-foreground">{venta.cliente?.telefono || "-"}</dd>
                </div>
                <div className="grid grid-cols-[minmax(7rem,.9fr)_minmax(0,1.1fr)] gap-3">
                  <dt className="flex items-center gap-2 text-muted-foreground"><Mail className="h-4 w-4 shrink-0" aria-hidden="true" />Email</dt>
                  <dd className="min-w-0 break-all font-medium text-foreground">{venta.cliente?.email || "-"}</dd>
                </div>
                {[
                  ["Partido", venta.cliente?.partido],
                  ["Barrio", venta.cliente?.barrio],
                  ["Área", venta.cliente?.area],
                  ["Lote", venta.cliente?.lote],
                  ["Descripción", venta.cliente?.descripcion],
                ].filter(([, value]) => value).map(([label, value]) => (
                  <div key={label} className="grid grid-cols-[minmax(7rem,.9fr)_minmax(0,1.1fr)] gap-3">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="min-w-0 break-words font-medium text-foreground">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
          <div className="flex min-w-0 flex-col gap-4 rounded-2xl border border-border/60 bg-card p-4 shadow-sm sm:p-5">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-muted text-foreground"><Truck className="h-5 w-5" /></span>
              <h2 className="text-lg font-semibold tracking-tight">Envío y pago</h2>
            </div>
            <dl className="venta-envio-info min-w-0 space-y-3 break-words text-sm">
              <div className="grid grid-cols-[minmax(7rem,.8fr)_minmax(0,1.2fr)] gap-3">
                <dt className="flex items-center gap-2 text-muted-foreground"><Package className="h-4 w-4 shrink-0" aria-hidden="true" />Tipo de entrega</dt>
                <dd className="font-semibold text-foreground">{capitalizarPrimeraLetra(esRetiroLocal ? "Retiro en local" : venta.tipoEnvio === "envio_domicilio" ? "Envío a domicilio" : String(venta.tipoEnvio || "Envío a domicilio").replaceAll("_", " "))}</dd>
              </div>
              {sucursalRetiroNombre ? (
                <div className="grid grid-cols-[minmax(7rem,.8fr)_minmax(0,1.2fr)] gap-3">
                  <dt className="flex items-center gap-2 text-muted-foreground"><Store className="h-4 w-4 shrink-0" aria-hidden="true" />Sucursal</dt>
                  <dd className="font-semibold text-foreground">{capitalizarPrimeraLetra(sucursalRetiroNombre)}</dd>
                </div>
              ) : null}
              <div className="grid grid-cols-[minmax(7rem,.8fr)_minmax(0,1.2fr)] gap-3">
                <dt className="flex items-center gap-2 text-muted-foreground"><MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />{esRetiroLocal ? "Dirección de retiro" : "Dirección"}</dt>
                <dd className="min-w-0 leading-relaxed text-foreground">{capitalizarPrimeraLetra(esRetiroLocal
                    ? (sucursalRetiroDireccion || "-")
                    : (venta.usarDireccionCliente === false ? (venta.direccionEnvio || "-") : (venta.cliente?.direccion || "-")))}</dd>
              </div>
              {!esRetiroLocal ? (
                <div className="grid grid-cols-[minmax(7rem,.8fr)_minmax(0,1.2fr)] gap-3">
                  <dt className="flex items-center gap-2 text-muted-foreground"><MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />Localidad</dt>
                  <dd className="font-medium text-foreground">{capitalizarPrimeraLetra(venta.usarDireccionCliente === false ? (venta.localidadEnvio || "-") : (venta.cliente?.localidad || "-"))}</dd>
                </div>
              ) : null}
              <div className="grid grid-cols-[minmax(7rem,.8fr)_minmax(0,1.2fr)] gap-3">
                <dt className="flex items-center gap-2 text-muted-foreground"><CalendarDays className="h-4 w-4 shrink-0" aria-hidden="true" />{esRetiroLocal ? "Fecha de retiro" : "Fecha de envío"}</dt>
                <dd className="font-medium text-foreground">{formatFechaLocal(venta.fechaEntrega) || "-"}</dd>
              </div>
              <div className="grid grid-cols-[minmax(7rem,.8fr)_minmax(0,1.2fr)] gap-3">
                <dt className="flex items-center gap-2 text-muted-foreground"><Clock3 className="h-4 w-4 shrink-0" aria-hidden="true" />{esRetiroLocal ? "Horario de retiro" : "Rango horario"}</dt>
                <dd className="font-medium text-foreground">{capitalizarPrimeraLetra(venta.rangoHorario || "-")}</dd>
              </div>
              <div className="no-print grid grid-cols-[minmax(7rem,.8fr)_minmax(0,1.2fr)] gap-3">
                <dt className="flex items-center gap-2 text-muted-foreground"><User className="h-4 w-4 shrink-0" aria-hidden="true" />Vendedor</dt>
                <dd className="font-medium text-foreground">{capitalizarPrimeraLetra(venta.vendedor || "-")}</dd>
              </div>
              <div className="grid grid-cols-[minmax(7rem,.8fr)_minmax(0,1.2fr)] gap-3 border-t border-border/60 pt-3">
                <dt className="flex items-center gap-2 text-muted-foreground"><CreditCard className="h-4 w-4 shrink-0" aria-hidden="true" />Forma de pago</dt>
                <dd className="forma-pago-empleado font-semibold text-foreground">{capitalizarPrimeraLetra(String(venta.formaPago || "-").replaceAll("_", " "))}</dd>
              </div>
              {venta.costoEnvio !== undefined && Number(venta.costoEnvio) > 0 ? (
                <div className="costo-envio-empleado grid grid-cols-[minmax(7rem,.8fr)_minmax(0,1.2fr)] gap-3">
                  <dt className="flex items-center gap-2 text-muted-foreground"><Banknote className="h-4 w-4 shrink-0" aria-hidden="true" />Costo de envío</dt>
                  <dd className="font-medium text-foreground">$ {formatearNumeroArgentino(Number(venta.costoEnvio))}</dd>
                </div>
              ) : null}
              <div className="estado-pago-empleado grid grid-cols-[minmax(7rem,.8fr)_minmax(0,1.2fr)] gap-3">
                <dt className="flex items-center gap-2 text-muted-foreground"><Tag className="h-4 w-4 shrink-0" aria-hidden="true" />Estado de la venta</dt>
                <dd>
                  <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold ${estadoPagoFinal === "pagado" ? "bg-success/10 text-foreground" : estadoPagoFinal === "parcial" ? "bg-warning/10 text-foreground" : "bg-destructive/10 text-foreground"}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${estadoPagoFinal === "pagado" ? "bg-success" : estadoPagoFinal === "parcial" ? "bg-warning" : "bg-destructive"}`} />
                    {estadoPagoFinal === "pagado" ? "Pagado" : estadoPagoFinal === "parcial" ? "Parcial" : "Pendiente"}
                  </span>
                </dd>
              </div>
            </dl>
          </div>
          <aside className="flex min-w-0 flex-col rounded-2xl border border-border/60 bg-card p-4 shadow-sm sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-muted text-foreground"><CreditCard className="h-5 w-5" /></span>
                  <h2 className="text-lg font-semibold tracking-tight">Resumen de pago</h2>
                </div>
                <span className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold ${
                  estadoPagoFinal === "pagado"
                    ? "bg-success/10 text-foreground"
                  : estadoPagoFinal === "parcial"
                    ? "bg-warning/10 text-foreground"
                    : "bg-destructive/10 text-foreground"
              }`}>
                  <span className={`inline-block h-1.5 w-1.5 rounded-full ${estadoPagoFinal === "pagado" ? "bg-success" : estadoPagoFinal === "parcial" ? "bg-warning" : "bg-destructive"}`} />
                {estadoPagoFinal === "pagado" ? "Pagado" : estadoPagoFinal === "parcial" ? "Parcial" : "Pendiente"}
              </span>
            </div>
            <div className="mt-5 space-y-3 text-sm">
              <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-3">
                <span className="text-muted-foreground">Total de la venta</span>
                <span className="text-lg font-bold tabular-nums total-empleado">$ {formatearNumeroArgentino(venta.total || 0)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Monto abonado</span>
                <span className="font-semibold tabular-nums text-success monto-abonado-empleado">$ {formatearNumeroArgentino(montoAbonado)}</span>
              </div>
              {saldoPendiente > 0 ? (
                <div className="flex items-center justify-between gap-3 rounded-lg bg-destructive/10 px-3 py-3">
                  <span className="text-muted-foreground">Saldo pendiente</span>
                  <span className="text-base font-bold tabular-nums text-destructive saldo-pendiente-empleado">$ {formatearNumeroArgentino(saldoPendiente)}</span>
                </div>
              ) : null}
            </div>
            <div className={`mt-5 flex items-center gap-3 rounded-xl p-3.5 ${estadoPagoFinal === "pagado" ? "bg-success/10 text-foreground" : "bg-muted/70 text-foreground"}`}>
              <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${estadoPagoFinal === "pagado" ? "bg-success/10" : "bg-background"}`}>
                {estadoPagoFinal === "pagado"
                  ? <CheckCircle2 className="h-5 w-5 text-success" />
                  : <Clock3 className="h-5 w-5 text-muted-foreground" />}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold estado-pago-empleado">
                  {estadoPagoFinal === "pagado" ? "Venta completamente pagada" : estadoPagoFinal === "parcial" ? "Pago parcial recibido" : "Pago pendiente"}
                </p>
                <p className="mt-0.5 text-xs opacity-80">
                  {estadoPagoFinal === "pagado" ? "No hay montos pendientes." : `Saldo pendiente: $ ${formatearNumeroArgentino(saldoPendiente)}`}
                </p>
              </div>
            </div>
          </aside>
        </div>

        {/* Actividad y adjuntos del pago */}
        {(Array.isArray(venta.pagos) && venta.pagos.length > 0) || estadoPagoFinal !== "pagado" || (venta.pagoEnDolares && venta.valorOficialDolar) || (Array.isArray(venta.comprobantesPago) && venta.comprobantesPago.length > 0) ? (
        <div className="mb-5 rounded-xl border border-border/60 bg-card p-4 shadow-sm sm:p-5">
          <h3 className="mb-4 flex items-center gap-3 font-semibold text-base">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-muted text-foreground"><CreditCard className="h-5 w-5" /></span>
            Historial y comprobantes de pago
          </h3>

          {/* Historial de pagos */}
          {((Array.isArray(venta.pagos) && venta.pagos.length > 0) || estadoPagoFinal !== 'pagado') && (
            <div className="mt-4 historial-pagos-empleado">
              {Array.isArray(venta.pagos) && venta.pagos.length > 0 ? (
                <ul className="divide-y divide-border/40">
                  {venta.pagos.map((pago, idx) => {
                    const metodoOriginal = String(pago.metodo || "-").trim().replaceAll("_", " ");
                    const metodoNormalizado = metodoOriginal.toLocaleLowerCase("es-AR");
                    const metodoVisible = capitalizarPrimeraLetra(metodoNormalizado);
                    const IconoMetodo = /efectivo|cash/.test(metodoNormalizado)
                      ? Banknote
                      : /transfer|bank/.test(metodoNormalizado)
                        ? ArrowLeftRight
                        : CreditCard;

                    return (
                      <li
                        key={`${pago.fechaHora || pago.fecha || "pago"}-${idx}`}
                        className="grid grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2 py-3 first:pt-1 last:pb-1 sm:grid-cols-[2.5rem_minmax(0,1fr)_auto]"
                      >
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-muted text-foreground" aria-hidden="true">
                          <IconoMetodo className="h-5 w-5" />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-foreground">{metodoVisible}</p>
                          <p className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                            <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                            <span className="truncate">{formatFechaHoraLocal(pago.fechaHora || pago.fecha)}</span>
                          </p>
                        </div>
                        <div className="col-start-2 flex min-w-0 items-center justify-between gap-3 sm:col-start-auto sm:justify-end">
                          <span className="text-base font-bold tabular-nums text-foreground sm:text-lg">
                            $ {formatearNumeroArgentino(pago.monto)}
                          </span>
                          {user ? (
                            <button
                              type="button"
                              onClick={() => confirmarBorradoPago(idx)}
                              disabled={borrandoPago}
                              aria-label={`Borrar pago ${metodoVisible} por $ ${formatearNumeroArgentino(pago.monto)}`}
                              className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 ${
                                borrandoPago && pagoABorrar === idx ? "opacity-50" : ""
                              }`}
                              title="Borrar pago"
                            >
                              {borrandoPago && pagoABorrar === idx
                                ? <Loader2 className="h-4 w-4 animate-spin" />
                                : <Trash2 className="h-4 w-4" />}
                            </button>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="py-3 text-sm text-muted-foreground">Sin pagos registrados.</p>
              )}
              {errorBorrarPago ? (
                <p role="alert" className="mt-3 text-sm text-destructive">{errorBorrarPago}</p>
              ) : null}
            </div>
          )}

          {/* Información de pago en dólares y comprobantes - Independiente del historial de pagos */}
          {((venta.pagoEnDolares && venta.valorOficialDolar) || (Array.isArray(venta.comprobantesPago) && venta.comprobantesPago.length > 0)) && (
            <div className={`mt-6 ${!(venta.pagoEnDolares && venta.valorOficialDolar) ? 'no-print' : ''}`}>
              <div className="rounded-xl border border-border/60 bg-card/70 overflow-hidden">
                <div className="px-4 py-3 bg-muted/50 border-b border-border/60">
                  <h4 className="font-semibold text-foreground text-sm">Información de pago</h4>
                </div>
                <div className="p-4 space-y-4">
                  {/* Pago en dólares - Dólar Blue */}
                  {venta.pagoEnDolares && venta.valorOficialDolar && (
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Pago en dólares</span>
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm text-muted-foreground">Dólar Blue (venta):</span>
                        <span className="text-lg font-bold text-amber-700 dark:text-amber-300">$ {formatearNumeroArgentino(Number(venta.valorOficialDolar))}</span>
                      </div>
                    </div>
                  )}

                  {/* Comprobantes adjuntos */}
                  {Array.isArray(venta.comprobantesPago) && venta.comprobantesPago.length > 0 && (
                    <div className="no-print">
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-2">Comprobantes adjuntos</span>
                      <table className="w-full text-sm border-collapse">
                        <thead>
                          <tr className="text-left text-muted-foreground border-b border-border/60">
                            <th className="py-2 pr-3 font-medium">#</th>
                            <th className="py-2 pr-3 font-medium">Tipo</th>
                            <th className="py-2 font-medium">Archivo</th>
                          </tr>
                        </thead>
                        <tbody>
                          {venta.comprobantesPago.map((comp, idx) => (
                            <tr key={idx} className="border-b border-border/50 last:border-0">
                              <td className="py-2 pr-3 text-muted-foreground">{idx + 1}</td>
                              <td className="py-2 pr-3">
                                <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium border ${comp.tipo === "pdf" ? "bg-red-500/10 border-red-500/20 text-red-700 dark:text-red-300" : "bg-sky-500/10 border-sky-500/20 text-sky-700 dark:text-sky-300"}`}>
                                  {comp.tipo === "pdf" ? "PDF" : "Imagen"}
                                </span>
                              </td>
                              <td className="py-2">
                                <a href={comp.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-medium no-print">
                                  {comp.nombre || `Comprobante ${idx + 1}`}
                                </a>
                                <span className="print:inline hidden">{comp.nombre || `Comprobante ${idx + 1}`}</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {/* Miniaturas: visibles en vista e impresión */}
                      <div className="mt-3 flex flex-wrap gap-2">
                        {venta.comprobantesPago.filter((c) => c.tipo !== "pdf").map((comp, idx) => (
                          <a key={idx} href={comp.url} target="_blank" rel="noopener noreferrer" className="inline-block">
                            <img src={comp.url} alt={comp.nombre || "Comprobante"} className="h-16 w-auto max-w-20 rounded border border-border/60 object-cover hover:opacity-90 print:h-14 print:max-w-16" />
                          </a>
                        ))}
                        {venta.comprobantesPago.filter((c) => c.tipo === "pdf").length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {venta.comprobantesPago.filter((c) => c.tipo === "pdf").map((comp, idx) => (
                              <span key={idx} className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-muted/50 border border-border/60 text-xs font-medium">
                                PDF: {comp.nombre || `Comprobante ${idx + 1}`}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
        ) : null}

        {/* Productos y Servicios */}
        {(Array.isArray(venta.productos) && venta.productos.length > 0) ||
        (Array.isArray(venta.items) && venta.items.length > 0) ? (
          <div className="mb-5 rounded-xl border border-border/60 bg-card p-4 shadow-sm sm:p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-muted text-foreground"><Package className="h-5 w-5" /></span>
                <h3 className="font-semibold text-base">Productos y servicios</h3>
              </div>
            </div>
            <div className="venta-productos-responsive">
              <DetalleVentaPresupuestoItemsTable
                items={venta.productos || venta.items}
                formatearNumeroArgentino={formatearNumeroArgentino}
                paraEmpleado={false}
              />
            </div>
            <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-[1.45fr_0.75fr]">
              <aside className="min-h-28 rounded-lg bg-muted/40 p-4 sm:p-5">
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-background text-foreground"><ClipboardList className="h-5 w-5" /></span>
                  <span className="text-sm font-medium">Observaciones</span>
                </div>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm text-muted-foreground">{venta.observaciones || "—"}</p>
              </aside>
            {/* Totales (recalculados desde items para consistencia) */}
            {(() => {
              if (venta.origen === "ecommerce_externo") return <div className="w-full self-stretch rounded-lg bg-muted/40 p-4"><VentaImportes venta={normalizeVenta(venta.id, venta)} /></div>;
              const items = (venta.productos && venta.productos.length > 0) ? venta.productos : (venta.items || []);
              const { subtotal, descuentoTotal, total } = computeTotals(items);
              const envio = venta.costoEnvio !== undefined && venta.costoEnvio !== "" && !isNaN(Number(venta.costoEnvio)) ? Number(venta.costoEnvio) : 0;
              const descuentoEfectivo = venta?.pagoEnEfectivo ? subtotal * 0.1 : 0;
              const baseImponible = Math.max(0, total - descuentoEfectivo);
              const ivaPorcentaje = Math.max(0, Number(venta?.ivaPorcentaje) || 21);
              const ivaMonto = Boolean(venta?.aplicaIva) ? (Number(venta?.ivaMonto) || baseImponible * (ivaPorcentaje / 100)) : 0;
              const transferenciaPorcentaje = Math.max(0, Number(venta?.transferenciaPorcentaje) || 10);
              const transferenciaMonto = Boolean(venta?.aplicaTransferencia) ? (Number(venta?.transferenciaMonto) || baseImponible * (transferenciaPorcentaje / 100)) : 0;
              const totalFinal = typeof venta.total === "number" && !isNaN(venta.total)
                ? venta.total
                : baseImponible + ivaMonto + transferenciaMonto + envio;
              const formatearImporte = (valor) => new Intl.NumberFormat("es-AR", {
                minimumFractionDigits: Number(valor) % 1 === 0 ? 0 : 2,
                maximumFractionDigits: 2,
              }).format(Number(valor) || 0);
              return (
                <div className="w-full rounded-lg bg-muted/40 p-4 sm:p-5">
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between subtotal-empleado">
                        <span>Subtotal:</span>
                        <span className="tabular-nums">$ {formatearImporte(subtotal)}</span>
                      </div>
                      <div className="flex justify-between descuento-empleado">
                        <span>Descuento total:</span>
                        <span className="tabular-nums">$ {formatearImporte(descuentoTotal)}</span>
                      </div>
                      {descuentoEfectivo > 0 && (
                        <div className="flex justify-between descuento-empleado">
                          <span>Descuento (Efectivo 10%):</span>
                          <span className="text-success tabular-nums">$ {formatearImporte(descuentoEfectivo)}</span>
                        </div>
                      )}
                      {envio > 0 && (
                        <div className="flex justify-between costo-envio-empleado">
                          <span>Cotización de envío:</span>
                          <span className="tabular-nums">$ {formatearImporte(envio)}</span>
                        </div>
                      )}
                      {ivaMonto > 0 && (
                        <div className="flex justify-between">
                          <span>IVA ({ivaPorcentaje}%):</span>
                          <span className="tabular-nums">$ {formatearImporte(ivaMonto)}</span>
                        </div>
                      )}
                      {transferenciaMonto > 0 && (
                        <div className="flex justify-between">
                          <span>Transferencia ({transferenciaPorcentaje}%):</span>
                          <span className="tabular-nums">$ {formatearImporte(transferenciaMonto)}</span>
                        </div>
                      )}
                      <div className="flex justify-between border-t border-border/60 pt-3 text-lg font-bold total-empleado">
                        <span>Total:</span>
                        <span className="tabular-nums text-foreground">$ {formatearImporte(totalFinal)}</span>
                      </div>
                    </div>
                </div>
              );
            })()}
            </div>
          </div>
        ) : null}

        {(!Array.isArray(venta.productos) || venta.productos.length === 0) && (!Array.isArray(venta.items) || venta.items.length === 0) && venta.observaciones ? (
          <div className="mb-5 rounded-xl bg-muted/40 p-4 sm:p-5">
            <h3 className="mb-2 flex items-center gap-3 font-semibold text-base"><ClipboardList className="h-5 w-5" />Observaciones</h3>
            <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{venta.observaciones}</p>
          </div>
        ) : null}
        </>
        ) : null}

        {/* 8. Edición: formularios agrupados por tarea, con jerarquía y etiquetas claras */}
        {editando && ventaEdit && (
          <div className="flex flex-col gap-6 pb-24 pt-2">
            {esVentaEcommerce ? (
              <section className="space-y-5 rounded-xl border border-border/60 bg-card p-4 shadow-sm sm:p-5">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Pedido de /tienda</p>
                  <h2 className="mt-1 text-lg font-semibold text-foreground">Programación de entrega o retiro</h2>
                  <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
                    Los productos, descuentos, forma de pago e importe se conservan según la compra confirmada en la tienda. Desde esta pantalla podés actualizar la fecha y el horario; los cambios se guardan con el botón flotante.
                  </p>
                </div>
                <DeliveryScheduleInput
                  fechaEntrega={ventaEdit.fechaEntrega || ""}
                  rangoHorario={ventaEdit.rangoHorario || ""}
                  required={ventaEdit.tipoEnvio !== "retiro_local"}
                  description={ventaEdit.tipoEnvio === "retiro_local"
                    ? "Fecha y horario de retiro opcionales."
                    : "Definí la fecha y la franja horaria de entrega."}
                  onFechaEntregaChange={(value) => setVentaEdit((previous) => ({ ...previous, fechaEntrega: value }))}
                  onRangoHorarioChange={(value) => setVentaEdit((previous) => ({ ...previous, rangoHorario: value }))}
                />
              </section>
            ) : (
              <>
            <section className="flex flex-col gap-4 rounded-xl border border-border/60 bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-5">
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Cliente de la venta</p>
                <h2 className="mt-1 truncate text-lg font-semibold text-foreground">{ventaEdit.cliente?.nombre || "Cliente sin nombre"}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {[ventaEdit.cliente?.cuit, ventaEdit.cliente?.telefono, ventaEdit.cliente?.email].filter(Boolean).join(" · ") || "Sin datos de contacto"}
                </p>
              </div>
              <Button type="button" variant="outline" onClick={() => setShowSelectorCliente(true)} className="shrink-0 rounded-lg border-border">
                <Edit className="mr-2 h-4 w-4" />Cambiar cliente
              </Button>
            </section>

            {/* Entrega e información adicional */}
            <section className="rounded-xl border border-border/50 bg-card p-4 sm:p-5">
              <div className="space-y-5">
                <header>
                  <h3 className="text-base font-semibold text-foreground">Entrega y envío</h3>
                  <p className="mt-1 text-sm text-muted-foreground">Modalidad, destino y programación en un solo lugar.</p>
                </header>

                <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(19rem,.8fr)] lg:gap-7">
                  <div className="min-w-0 space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className={`block min-w-0 space-y-1.5 ${ventaEdit.tipoEnvio && ventaEdit.tipoEnvio !== "retiro_local" ? "" : "sm:col-span-2"}`}>
                        <span className="text-sm font-medium text-foreground">Tipo de envío</span>
                        <select
                          className="h-10 w-full rounded-md border border-border/60 bg-background px-3 text-sm text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                          value={ventaEdit.tipoEnvio || ""}
                          onChange={(e) => {
                            const nuevoTipoEnvio = e.target.value;
                            setVentaEdit((prev) => {
                              const updated = { ...prev, tipoEnvio: nuevoTipoEnvio };

                              // Si cambia de envío a retiro local, limpiar solo datos exclusivos del envío
                              if (nuevoTipoEnvio === "retiro_local") {
                                updated.costoEnvio = "";
                                updated.direccionEnvio = "";
                                updated.localidadEnvio = "";
                              }

                              // Si cambia de retiro local a envío, inicializar campos
                              if (
                                nuevoTipoEnvio !== "retiro_local" &&
                                prev.tipoEnvio === "retiro_local"
                              ) {
                                updated.usarDireccionCliente = true;
                                updated.costoEnvio = "0";
                              }

                              return updated;
                            });
                          }}
                        >
                          <option value="">Selecciona...</option>
                          <option value="retiro_local">Retiro en local</option>
                          <option value="envio_domicilio">Envío a domicilio</option>
                        </select>
                      </label>

                      {ventaEdit.tipoEnvio && ventaEdit.tipoEnvio !== "retiro_local" ? (
                        <div className="flex min-w-0 items-center justify-between gap-3 rounded-md bg-muted/30 px-3 py-2.5">
                          <div className="min-w-0">
                            <p id="usar-direccion-cliente-label" className="text-sm font-medium text-foreground">
                              Usar dirección del cliente
                            </p>
                            <p id="usar-direccion-cliente-hint" className="mt-0.5 text-xs text-muted-foreground">
                              {ventaEdit.usarDireccionCliente === false
                                ? "Usar otra dirección"
                                : "Usar sus datos guardados"}
                            </p>
                          </div>
                          <Switch
                            checked={ventaEdit.usarDireccionCliente !== false}
                            onCheckedChange={(checked) => setVentaEdit((previous) => ({ ...previous, usarDireccionCliente: checked }))}
                            aria-labelledby="usar-direccion-cliente-label"
                            aria-describedby="usar-direccion-cliente-hint"
                            className="shrink-0"
                          />
                        </div>
                      ) : null}
                    </div>

                    {ventaEdit.tipoEnvio && ventaEdit.tipoEnvio !== "retiro_local" ? (
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,.8fr)_minmax(9rem,.65fr)]">
                          <label className="block min-w-0 space-y-1.5 sm:col-span-2 xl:col-span-1">
                            <span className="text-sm font-medium text-foreground">Dirección de entrega</span>
                            {ventaEdit.usarDireccionCliente === false ? (
                              <GoogleAddressInput
                                id="direccion-envio-venta"
                                className="h-10 w-full rounded-md border border-border/60 bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                value={ventaEdit.direccionEnvio || ""}
                                onChange={({ address, locality, lat, lng, mapsUrl }) => setVentaEdit((previous) => ({
                                  ...previous,
                                  direccionEnvio: address,
                                  localidadEnvio: locality || previous.localidadEnvio,
                                  direccionMapsUrl: mapsUrl,
                                  direccionLat: lat,
                                  direccionLng: lng,
                                }))}
                                placeholder="Buscar dirección"
                              />
                            ) : (
                              <input
                                id="direccion-envio-cliente"
                                value={ventaEdit.cliente?.direccion || ""}
                                readOnly
                                className="h-10 w-full rounded-md border border-border/40 bg-muted/30 px-3 text-sm text-muted-foreground"
                                placeholder="Sin dirección cargada"
                              />
                            )}
                          </label>

                          <label className="block min-w-0 space-y-1.5">
                            <span className="text-sm font-medium text-foreground">Localidad</span>
                            {ventaEdit.usarDireccionCliente === false ? (
                              <input
                                id="localidad-envio-venta"
                                className="h-10 w-full rounded-md border border-border/60 bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                value={ventaEdit.localidadEnvio || ""}
                                onChange={(e) => setVentaEdit((previous) => ({ ...previous, localidadEnvio: e.target.value }))}
                                placeholder="Localidad o ciudad"
                              />
                            ) : (
                              <input
                                id="localidad-envio-cliente"
                                value={ventaEdit.cliente?.localidad || ""}
                                readOnly
                                className="h-10 w-full rounded-md border border-border/40 bg-muted/30 px-3 text-sm text-muted-foreground"
                                placeholder="Sin localidad cargada"
                              />
                            )}
                          </label>

                          <label className="block min-w-0 space-y-1.5">
                            <span className="text-sm font-medium text-foreground">Costo de envío</span>
                            <span className="relative block">
                              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">$</span>
                              <input
                                id="costo-envio-venta"
                                className="h-10 w-full rounded-md border border-border/60 bg-background pl-7 pr-3 text-sm tabular-nums text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                value={ventaEdit.costoEnvio || ""}
                                onChange={(e) => setVentaEdit((previous) => ({ ...previous, costoEnvio: e.target.value }))}
                                placeholder="0"
                                type="number"
                                min="0"
                                step="0.01"
                              />
                            </span>
                          </label>
                      </div>
                    ) : null}
                  </div>

                  <div className="min-w-0 border-t border-border/40 pt-4 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
                    {ventaEdit.tipoEnvio ? (
                      <DeliveryScheduleInput
                        fechaEntrega={ventaEdit.fechaEntrega || ""}
                        rangoHorario={ventaEdit.rangoHorario || ""}
                        required={ventaEdit.tipoEnvio !== "retiro_local"}
                        description={ventaEdit.tipoEnvio === "retiro_local"
                          ? "Fecha y horario de retiro opcionales."
                          : "Definí la fecha y la franja horaria de entrega."}
                        onFechaEntregaChange={(value) => setVentaEdit((previous) => ({ ...previous, fechaEntrega: value }))}
                        onRangoHorarioChange={(value) => setVentaEdit((previous) => ({ ...previous, rangoHorario: value }))}
                      />
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Seleccioná una modalidad para definir la fecha y el horario.
                      </p>
                    )}
                  </div>
                </div>

                <div className="grid gap-4 border-t border-border/40 pt-4 lg:grid-cols-[minmax(13rem,.45fr)_minmax(0,1.55fr)] lg:items-start lg:gap-6">
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-foreground">Información adicional</h3>
                    <p className="mt-3 text-xs font-medium text-muted-foreground">VENDEDOR RESPONSABLE</p>
                    <p className="mt-1 break-all text-sm font-medium text-foreground">
                      {ventaEdit.vendedor || "Sin vendedor asignado"}
                    </p>
                  </div>

                  <label className="block min-w-0 space-y-1.5 lg:pt-0.5">
                    <span className="text-sm font-medium text-foreground">Observaciones</span>
                    <textarea
                      id="observaciones-venta"
                      className="min-h-24 w-full resize-y rounded-md border border-border/60 bg-background px-3 py-2.5 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      value={ventaEdit.observaciones || ""}
                      onChange={(e) => setVentaEdit((previous) => ({ ...previous, observaciones: e.target.value }))}
                      placeholder="Agregá detalles relevantes para preparar o entregar la venta."
                    />
                  </label>
                </div>
              </div>
            </section>

            {/* Pago en dólares y comprobantes adjuntos */}
            <section className="space-y-4 bg-card rounded-lg p-4 border border-border/60 shadow-sm">
              <h3 className="text-lg font-semibold mb-2">Pago en dólares y comprobantes</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col gap-3 col-span-2">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <Switch
                      checked={!!ventaEdit.pagoEnDolares}
                      onCheckedChange={(checked) => {
                        // Solo actualizar pagoEnDolares y valorOficialDolar. NUNCA afectar
                        // estadoPago, total, pagos, montoAbonado ni saldoPendiente.
                        setVentaEdit((prev) => ({
                          ...prev,
                          pagoEnDolares: checked,
                          valorOficialDolar: checked ? (prev.valorOficialDolar ?? "") : null,
                        }));
                      }}
                      color="warning"
                    />
                    <span className="text-sm font-medium">Pago en dólares</span>
                  </label>
                  {ventaEdit.pagoEnDolares && (
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <label className="block">
                          <span className="text-sm font-medium">Dólar oficial BNA (promedio compra/venta)</span>
                          <div className="flex gap-2 mt-1">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              className="w-full md:w-40 px-3 py-2 border border-border/60 bg-background text-foreground rounded-lg"
                              value={ventaEdit.valorOficialDolar ?? ""}
                              onChange={(e) =>
                                setVentaEdit((prev) => ({
                                  ...prev,
                                  valorOficialDolar: e.target.value ? Number(e.target.value) : null,
                                }))
                              }
                              placeholder="Ej: 1440"
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={fetchDolarBlue}
                              disabled={loadingDolar}
                              className="shrink-0 h-9"
                            >
                              {loadingDolar ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                "Actualizar"
                              )}
                            </Button>
                          </div>
                        </label>
                      </div>
                      {ultimaActualizacionDolar && (
                        <p className="text-xs text-muted-foreground">
                          Última cotización: {ultimaActualizacionDolar.toLocaleString("es-AR", {
                            dateStyle: "short",
                            timeStyle: "short",
                          })}{" "}
                          (se actualiza cada 5 min)
                        </p>
                      )}
                    </div>
                  )}
                </div>
                <div className="col-span-2">
                  <ComprobantesPagoSection
                    comprobantes={ventaEdit.comprobantesPago || []}
                    onComprobantesChange={(lista) =>
                      setVentaEdit((prev) => ({ ...prev, comprobantesPago: lista }))
                    }
                    disabled={loadingPrecios}
                    maxFiles={10}
                  />
                </div>
              </div>
            </section>

            <div className="bg-card rounded-lg shadow-sm p-6 mb-6">
              <ProductosVentaEditor
                items={ventaEdit.productos || []}
                productos={productos}
                onAgregarProductoCatalogo={handleAgregarProductoCatalogo}
                getProductoCatalogoPreview={construirProductoCatalogo}
                onAgregarEjemplo={handleAgregarEjemplo}
                onQuitarProductoDesdeCatalogo={handleQuitarProductoDesdeCatalogo}
                loadingPrecios={loadingPrecios}
                pagoEnEfectivo={Boolean(ventaEdit?.pagoEnEfectivo)}
                idPagoEnEfectivo="venta-pago-efectivo"
                formatearNumeroArgentino={formatearNumeroArgentino}
                defaultCepilladoPorcentaje={DEFAULT_CEPILLADO_PORCENTAJE}
                defaultCalibradoPorcentaje={DEFAULT_CALIBRADO_PORCENTAJE}
                onPagoEnEfectivoChange={(checked) => {
                  setVentaEdit((prev) => {
                    if (!prev) return prev;
                    return {
                      ...prev,
                      pagoEnEfectivo: checked,
                      ...(checked ? { formaPago: "efectivo" } : null),
                    };
                  });
                }}
                onNombreChange={handleNombreChange}
                onUnidadMaderaChange={handleUnidadMaderaChange}
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
                onCantidadChange={handleCantidadChange}
                onIncrementarCantidad={handleIncrementarCantidad}
                onDecrementarCantidad={handleDecrementarCantidad}
                onCepilladoChange={recalcularPreciosMadera}
                onCepilladoPorcentajeChange={handleCepilladoPorcentajeChange}
                onCalibradoChange={handleCalibradoAplicadoChange}
                onCalibradoPorcentajeChange={handleCalibradoPorcentajeChange}
                onPrecioChange={handlePrecioChange}
                onDescuentoChange={handleDescuentoChange}
                onClonarProducto={handleClonarProducto}
                onQuitarProducto={handleQuitarProducto}
              />

              {(() => {
                const { subtotal, descuentoTotal, total: subtotalConDescuento } = computeTotals(ventaEdit.productos || []);
                const envio = ventaEdit.tipoEnvio && ventaEdit.tipoEnvio !== "retiro_local"
                  ? Number(ventaEdit.costoEnvio) || 0
                  : 0;
                const descuentoEfectivo = ventaEdit.pagoEnEfectivo ? subtotal * 0.1 : 0;
                const descuentoTotalFinal = descuentoTotal + descuentoEfectivo;
                const baseImponible = Math.max(0, subtotalConDescuento - descuentoEfectivo);
                const ivaPorcentaje = Math.max(0, Number(ventaEdit.ivaPorcentaje) || 21);
                const ivaMonto = ventaEdit.aplicaIva ? baseImponible * (ivaPorcentaje / 100) : 0;
                const transferenciaPorcentaje = Math.max(0, Number(ventaEdit.transferenciaPorcentaje) || 10);
                const transferenciaMonto = ventaEdit.aplicaTransferencia
                  ? baseImponible * (transferenciaPorcentaje / 100)
                  : 0;
                const totalFinal = baseImponible + ivaMonto + transferenciaMonto + envio;
                const abonado = Array.isArray(ventaEdit.pagos)
                  ? ventaEdit.pagos.reduce((acc, pago) => acc + Number(pago.monto), 0)
                  : Number(ventaEdit.montoAbonado || 0);
                const saldo = Math.max(0, totalFinal - abonado);
                const montoValido = Boolean(ventaEdit.nuevoPagoMonto)
                  && Number(ventaEdit.nuevoPagoMonto) > 0
                  && Number(ventaEdit.nuevoPagoMonto) <= saldo;
                const metodoValido = Boolean(ventaEdit.nuevoPagoMetodo)
                  && ventaEdit.nuevoPagoMetodo.trim() !== "";
                const botonHabilitado = !registrandoPago && montoValido && metodoValido;
                const errorMonto = Boolean(ventaEdit.nuevoPagoMonto) && !montoValido;
                const errorMetodo = Boolean(ventaEdit.nuevoPagoMetodo) && !metodoValido;

                return (
                  <div className={`mt-5 grid items-start gap-4 ${
                    (ventaEdit.productos || []).length > 0 && saldo > 0
                      ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]"
                      : ""
                  }`}>
                    {(ventaEdit.productos || []).length > 0 ? (
                      <section className="w-full overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm" aria-labelledby="venta-totales-heading">
                        <header className="flex items-center gap-3 border-b border-border/50 px-4 py-3 sm:px-5">
                          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-muted text-foreground" aria-hidden="true">
                            <BadgePercent className="h-5 w-5" />
                          </span>
                          <div className="min-w-0">
                            <h3 id="venta-totales-heading" className="text-base font-semibold text-foreground">Impuestos y descuentos</h3>
                            <p className="text-xs text-muted-foreground sm:text-sm">Configurá los adicionales y revisá el total actualizado.</p>
                          </div>
                        </header>

                        <div className="grid gap-2 p-3 sm:p-4">
                          <article className="flex min-w-0 items-center gap-3 rounded-xl border border-border/60 bg-card p-3 sm:gap-4 sm:p-4">
                            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-muted text-foreground" aria-hidden="true">
                              <ReceiptText className="h-5 w-5" />
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold text-foreground">Aplicar IVA</p>
                              <p className="mt-0.5 text-xs text-muted-foreground">Sobre la base neta</p>
                            </div>
                            <Switch
                              id="venta-aplica-iva"
                              checked={Boolean(ventaEdit.aplicaIva)}
                              onCheckedChange={(checked) => setVentaEdit((previous) => ({ ...previous, aplicaIva: checked }))}
                              disabled={loadingPrecios}
                              color="dark"
                              size="lg"
                              aria-label="Aplicar IVA"
                            />
                            <label htmlFor="venta-iva-porcentaje" className="flex h-10 w-[5.25rem] shrink-0 items-center rounded-lg bg-muted/70 px-2 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
                              <input
                                id="venta-iva-porcentaje"
                                type="number"
                                min="0"
                                step="0.01"
                                value={ventaEdit.ivaPorcentaje ?? 21}
                                onChange={(event) => setVentaEdit((previous) => ({ ...previous, ivaPorcentaje: event.target.value }))}
                                disabled={loadingPrecios || !ventaEdit.aplicaIva}
                                aria-label="Porcentaje de IVA"
                                className="min-w-0 flex-1 bg-transparent text-right text-sm font-semibold tabular-nums text-foreground outline-none disabled:cursor-not-allowed disabled:opacity-50"
                              />
                              <span className="pl-1 text-sm font-semibold text-foreground">%</span>
                            </label>
                          </article>

                          <article className="flex min-w-0 items-center gap-3 rounded-xl border border-border/60 bg-card p-3 sm:gap-4 sm:p-4">
                            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-muted text-foreground" aria-hidden="true">
                              <ArrowLeftRight className="h-5 w-5" />
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold text-foreground">Pago con transferencia</p>
                              <p className="mt-0.5 text-xs text-muted-foreground">Adicional sobre la base neta</p>
                            </div>
                            <Switch
                              id="venta-aplica-transferencia"
                              checked={Boolean(ventaEdit.aplicaTransferencia)}
                              onCheckedChange={(checked) => setVentaEdit((previous) => ({ ...previous, aplicaTransferencia: checked }))}
                              disabled={loadingPrecios}
                              color="dark"
                              size="lg"
                              aria-label="Aplicar adicional por transferencia"
                            />
                            <label htmlFor="venta-transferencia-porcentaje" className="flex h-10 w-[5.25rem] shrink-0 items-center rounded-lg bg-muted/70 px-2 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
                              <input
                                id="venta-transferencia-porcentaje"
                                type="number"
                                min="0"
                                step="0.01"
                                value={ventaEdit.transferenciaPorcentaje ?? 10}
                                onChange={(event) => setVentaEdit((previous) => ({ ...previous, transferenciaPorcentaje: event.target.value }))}
                                disabled={loadingPrecios || !ventaEdit.aplicaTransferencia}
                                aria-label="Porcentaje por transferencia"
                                className="min-w-0 flex-1 bg-transparent text-right text-sm font-semibold tabular-nums text-foreground outline-none disabled:cursor-not-allowed disabled:opacity-50"
                              />
                              <span className="pl-1 text-sm font-semibold text-foreground">%</span>
                            </label>
                          </article>
                        </div>

                        <div className="space-y-2 border-t border-border/50 px-4 py-3 sm:px-5">
                          <div className="flex items-center justify-between gap-4 text-sm">
                            <span className="text-muted-foreground">Subtotal</span>
                            <span className="shrink-0 font-medium tabular-nums text-foreground">$ {formatearNumeroArgentino(subtotal)}</span>
                          </div>
                          <div className="flex items-center justify-between gap-4 text-sm">
                            <span className="text-muted-foreground">Descuentos</span>
                            <span className="shrink-0 font-medium tabular-nums text-success">− $ {formatearNumeroArgentino(descuentoTotalFinal)}</span>
                          </div>
                          {ventaEdit.aplicaIva ? (
                            <div className="flex items-center justify-between gap-4 text-sm">
                              <span className="text-muted-foreground">IVA ({ivaPorcentaje}%)</span>
                              <span className="shrink-0 font-medium tabular-nums text-foreground">$ {formatearNumeroArgentino(ivaMonto)}</span>
                            </div>
                          ) : null}
                          {ventaEdit.aplicaTransferencia ? (
                            <div className="flex items-center justify-between gap-4 text-sm">
                              <span className="text-muted-foreground">Transferencia ({transferenciaPorcentaje}%)</span>
                              <span className="shrink-0 font-medium tabular-nums text-foreground">$ {formatearNumeroArgentino(transferenciaMonto)}</span>
                            </div>
                          ) : null}
                          {envio > 0 ? (
                            <div className="flex items-center justify-between gap-4 text-sm">
                              <span className="text-muted-foreground">Envío</span>
                              <span className="shrink-0 font-medium tabular-nums text-foreground">$ {formatearNumeroArgentino(envio)}</span>
                            </div>
                          ) : null}
                          <div className="flex items-end justify-between gap-4 border-t border-border/60 pt-3">
                            <span className="font-semibold text-foreground">Total</span>
                            <span className="shrink-0 text-xl font-bold tabular-nums text-foreground">$ {formatearNumeroArgentino(totalFinal)}</span>
                          </div>
                        </div>
                      </section>
                    ) : null}

                    {saldo > 0 ? (
                      <section className="w-full overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm" aria-labelledby="venta-pago-heading">
                        <header className="flex items-center gap-3 border-b border-border/50 px-4 py-3 sm:px-5">
                          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-muted text-foreground" aria-hidden="true">
                            <Wallet className="h-5 w-5" />
                          </span>
                          <div className="min-w-0">
                            <h3 id="venta-pago-heading" className="text-base font-semibold text-foreground">Pago de la venta</h3>
                            <p className="text-xs text-muted-foreground sm:text-sm">Registrá un pago y actualizá el saldo.</p>
                          </div>
                        </header>

                        <div className="grid grid-cols-2 divide-x divide-border/60 border-b border-border/40 px-3 py-3 sm:px-4">
                          <div className="min-w-0 px-2 sm:px-3">
                            <p className="text-xs text-muted-foreground sm:text-sm">Abonado</p>
                            <p className="truncate text-lg font-bold tabular-nums text-success sm:text-xl">$ {formatearNumeroArgentino(abonado)}</p>
                          </div>
                          <div className="min-w-0 px-2 sm:px-3">
                            <p className="text-xs text-muted-foreground sm:text-sm">Saldo pendiente</p>
                            <p className="truncate text-lg font-bold tabular-nums text-warning sm:text-xl">$ {formatearNumeroArgentino(saldo)}</p>
                          </div>
                        </div>

                        <div className="grid gap-3 p-3 sm:p-4 xl:grid-cols-2 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_auto]">
                          <label className={`flex h-12 min-w-0 items-center gap-3 rounded-xl border bg-background px-3 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 ${errorMonto ? "border-destructive" : "border-border/60"}`}>
                            <Banknote className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                            <span className="h-7 w-px shrink-0 bg-border/60" aria-hidden="true" />
                            <span className="sr-only">Monto del pago</span>
                            <input
                              type="number"
                              min="0.01"
                              max={saldo}
                              step="0.01"
                              placeholder="$ 0,00"
                              value={ventaEdit.nuevoPagoMonto || ""}
                              onChange={(event) => setVentaEdit((previous) => ({ ...previous, nuevoPagoMonto: event.target.value }))}
                              disabled={registrandoPago}
                              aria-label="Monto del pago"
                              aria-invalid={errorMonto}
                              className="h-full min-w-0 flex-1 bg-transparent text-base tabular-nums text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-60"
                            />
                          </label>
                          <label className={`flex h-12 min-w-0 items-center gap-3 rounded-xl border bg-background px-3 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 ${errorMetodo ? "border-destructive" : "border-border/60"}`}>
                            <CreditCard className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                            <span className="h-7 w-px shrink-0 bg-border/60" aria-hidden="true" />
                            <span className="sr-only">Medio de pago</span>
                            <select
                              value={ventaEdit.nuevoPagoMetodo || ""}
                              onChange={(event) => setVentaEdit((previous) => ({ ...previous, nuevoPagoMetodo: event.target.value }))}
                              disabled={registrandoPago}
                              aria-label="Medio de pago"
                              aria-invalid={errorMetodo}
                              className="h-full min-w-0 flex-1 appearance-none bg-transparent text-sm text-foreground outline-none disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              <option value="">Seleccionar medio de pago</option>
                              <option value="efectivo">Efectivo</option>
                              <option value="transferencia">Transferencia</option>
                              <option value="tarjeta">Tarjeta</option>
                              <option value="cheque">Cheque</option>
                              <option value="otro">Otro</option>
                            </select>
                            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                          </label>
                          <Button
                            type="button"
                            onClick={async () => {
                              if (!botonHabilitado) return;
                              setRegistrandoPago(true);
                              try {
                                await new Promise((resolve) => setTimeout(resolve, 400));
                                const fechaHoraPago = new Date().toISOString();
                                const fechaPago = fechaLocalActual();
                                const nuevoPago = {
                                  fecha: fechaPago,
                                  fechaHora: fechaHoraPago,
                                  monto: Number(ventaEdit.nuevoPagoMonto),
                                  metodo: ventaEdit.nuevoPagoMetodo,
                                  usuario: "usuario",
                                };
                                setVentaEdit((previous) => ({
                                  ...previous,
                                  pagos: [
                                    ...(Array.isArray(previous.pagos)
                                      ? previous.pagos
                                      : Array.isArray(pagosSimples)
                                        ? pagosSimples
                                        : []),
                                    nuevoPago,
                                  ],
                                  nuevoPagoMonto: "",
                                  nuevoPagoMetodo: "",
                                }));
                                setPagoExitoso(true);
                                setTimeout(() => setPagoExitoso(false), 1800);
                              } catch (error) {
                                console.error("Error al registrar pago:", error);
                              } finally {
                                setRegistrandoPago(false);
                              }
                            }}
                            disabled={!botonHabilitado}
                            className="h-12 w-full rounded-xl bg-foreground px-5 text-background hover:bg-foreground/90 hover:text-background focus-visible:ring-2 focus-visible:ring-ring xl:col-span-2 2xl:col-span-1 2xl:w-auto"
                          >
                            {registrandoPago ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-5 w-5" />}
                            Registrar pago
                          </Button>
                        </div>

                        {errorMonto || errorMetodo || pagoExitoso ? (
                          <div className="space-y-1 px-3 pb-3 text-sm sm:px-4 sm:pb-4" aria-live="polite">
                            {errorMonto ? <p className="text-destructive">{Number(ventaEdit.nuevoPagoMonto) <= 0 ? "El monto debe ser mayor a 0" : Number(ventaEdit.nuevoPagoMonto) > saldo ? `No puede superar $ ${formatearNumeroArgentino(saldo)}` : "Monto inválido"}</p> : null}
                            {errorMetodo ? <p className="text-destructive">Seleccioná un medio de pago válido.</p> : null}
                            {pagoExitoso ? <p className="font-medium text-success">¡Pago registrado! Guardá los cambios para persistirlo.</p> : null}
                          </div>
                        ) : null}
                      </section>
                    ) : null}

                    {errorForm ? (
                      <div
                        className={`rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive ${(ventaEdit.productos || []).length > 0 && saldo > 0 ? "lg:col-span-2" : ""}`}
                        role="alert"
                      >
                        {errorForm}
                      </div>
                    ) : null}
                  </div>
                );
              })()}
            </div>
              </>
            )}
          </div>
        )}
      </div>

      {hayCambiosVenta ? (
        <div className="no-print fixed bottom-5 right-4 z-40 sm:bottom-7 sm:right-7">
          <Button
            type="button"
            onClick={handleGuardarCambios}
            disabled={loadingPrecios || guardandoCambios}
            className="h-12 rounded-full px-5 shadow-xl"
            aria-label={guardandoCambios ? "Guardando cambios de la venta" : "Guardar cambios de la venta"}
          >
            {guardandoCambios ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            {guardandoCambios ? "Guardando..." : "Guardar cambios"}
          </Button>
        </div>
      ) : null}

      {/* Modal de confirmación para borrar pago */}
      {mostrarConfirmacionBorrado && pagoABorrar !== null && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card border border-border/60 rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-500/10 rounded-full flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-red-700 dark:text-red-300" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-foreground">
                  Confirmar borrado
                </h3>
                <p className="text-sm text-muted-foreground">
                  ¿Estás seguro de que quieres borrar este pago?
                </p>
              </div>
            </div>

            <div className="bg-muted/50 border border-border/60 rounded-lg p-3 mb-4">
              <div className="text-sm text-foreground">
                <div className="font-medium">Detalles del pago:</div>
                <div className="mt-1">
                  <span className="text-muted-foreground">Fecha:</span>{" "}
                  {formatFechaHoraLocal(venta.pagos[pagoABorrar].fechaHora || venta.pagos[pagoABorrar].fecha)}
                </div>
                <div>
                  <span className="text-muted-foreground">Método:</span>{" "}
                  {venta.pagos[pagoABorrar].metodo}
                </div>
                <div>
                  <span className="text-muted-foreground">Monto:</span>{" "}
                  <span className="font-semibold text-red-700 dark:text-red-300">
                    $ {formatearNumeroArgentino(venta.pagos[pagoABorrar].monto)}
                  </span>
                </div>
              </div>
            </div>
            <p className="mb-4 text-xs text-muted-foreground">La eliminación quedará registrada en Auditoría.</p>

            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => {
                  setMostrarConfirmacionBorrado(false);
                  setPagoABorrar(null);
                }}
                className="px-4 py-2 text-foreground bg-muted rounded-lg hover:bg-muted/80 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={async () => {
                  setMostrarConfirmacionBorrado(false);
                  await handleBorrarPago(pagoABorrar);
                }}
                disabled={borrandoPago}
                className={`px-4 py-2 text-white rounded-lg transition-colors ${
                  borrandoPago
                    ? "bg-red-400 cursor-not-allowed"
                    : "bg-red-600 hover:bg-red-700"
                }`}
              >
                {borrandoPago ? (
                  <div className="flex items-center gap-2">
                    <svg
                      className="animate-spin h-4 w-4"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                        fill="none"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8v8z"
                      />
                    </svg>
                    Borrando...
                  </div>
                ) : (
                  "Borrar pago"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal para cambiar cliente - Componente reutilizable */}
      <ModalCambiarCliente
        open={showSelectorCliente}
        onClose={() => setShowSelectorCliente(false)}
        clienteActual={(editando ? ventaEdit?.cliente : venta?.cliente) ? {
          id: editando ? ventaEdit?.clienteId : venta?.clienteId,
          ...((editando ? ventaEdit?.cliente : venta?.cliente) || {})
        } : null}
        clientes={clientes}
        onClienteSeleccionado={handleClienteSeleccionado}
      />
    </main>
  );
};

export default VentaDetalle;
