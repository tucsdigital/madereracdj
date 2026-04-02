"use client";
import React, { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
 
import { Printer, Edit, User, MapPin, Calendar, ChevronUp, Loader2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import ComprobantesPagoSection from "@/components/ventas/ComprobantesPagoSection";
import { useObra } from "@/hooks/useObra";
import {
  formatearNumeroArgentino,
  formatearFecha,
  parseNumericValue,
  calcularPrecioMachimbre,
  calcularPrecioCorteMadera,
} from "@/lib/obra-utils";
import ObraHeader from "@/components/obras/ObraHeader";
import ObraResumenFinanciero from "@/components/obras/ObraResumenFinanciero";
import ObraCobranza from "@/components/obras/ObraCobranza";
import ObraDocumentacion from "@/components/obras/ObraDocumentacion";
 
import CatalogoVentas from "@/components/ventas/CatalogoVentas";
import TablaProductosVentas from "@/components/ventas/TablaProductosVentas";
import SelectorClienteObras from "@/components/obras/SelectorClienteObras";
import { db } from "@/lib/firebase";
import { doc, updateDoc } from "firebase/firestore";

const ObraDetallePage = () => {
  const params = useParams();
  const router = useRouter();
  const { id, lang } = params;
  const printingRef = useRef(false);
  const [showFormularioCliente, setShowFormularioCliente] = useState(false);
  // Pago en dólares y comprobantes para la sección de documentación
  const [pagoEnDolares, setPagoEnDolares] = useState(false);
  const [valorOficialDolar, setValorOficialDolar] = useState(null);
  const [comprobantesPago, setComprobantesPago] = useState([]);
  const [loadingDolar, setLoadingDolar] = useState(false);
  const [ultimaActualizacionDolar, setUltimaActualizacionDolar] = useState(null);
  const [notasObra, setNotasObra] = useState([]);
  const [notaTitulo, setNotaTitulo] = useState("");
  const [notaContenido, setNotaContenido] = useState("");
  const [notaEditIdx, setNotaEditIdx] = useState(null);

  const {
    obra,
    loading,
    error,
    presupuesto,
    editando,
    docLinks,
    movimientos,
    estadoObra,
    fechasEdit,
    productosCatalogo,
    productosPorCategoria,
    categorias,
    itemsCatalogo,
    gastoObraManual,
    modoCosto,
    setEditando,
    setDocLinks,
    setMovimientos,
    setEstadoObra,
    setFechasEdit,
    setClienteId,
    setCliente,
    cliente,
    setItemsCatalogo,
    guardarEdicion,
  } = useObra(id);

  // Cuando cambia la obra, inicializar estados de pago/comprobantes con los datos existentes
  useEffect(() => {
    if (!obra) return;
    setPagoEnDolares(!!obra.pagoEnDolares);
    setValorOficialDolar(obra.valorOficialDolar ?? null);
    setComprobantesPago(Array.isArray(obra.comprobantesPago) ? obra.comprobantesPago : []);
    setNotasObra(Array.isArray(obra.notasObra) ? obra.notasObra : (Array.isArray(obra.notas) ? obra.notas : []));
  }, [obra]);

  useEffect(() => {
    if (obra?.numeroPedido) {
      document.title = obra.numeroPedido;
    }
    return () => {
      document.title = "Maderas Caballero - Panel Administrativo";
    };
  }, [obra?.numeroPedido]);

  const handlePrint = () => {
    if (!obra?.id || printingRef.current) return;
    printingRef.current = true;
    try {
      fetch("/api/pdf/remito-html", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "obra",
          id: obra.id,
        }),
      })
        .then(async (res) => {
          if (!res.ok) {
            throw new Error("Error al generar el documento");
          }
          return res.text();
        })
        .then((html) => {
          const iframe = document.createElement("iframe");
          iframe.style.position = "fixed";
          iframe.style.left = "0";
          iframe.style.top = "0";
          iframe.style.width = "1px";
          iframe.style.height = "1px";
          iframe.style.border = "none";
          iframe.style.opacity = "0";
          iframe.style.pointerEvents = "none";
          document.body.appendChild(iframe);

          let printed = false;
          let timeoutId = null;

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
            } catch {}
            printingRef.current = false;
            setTimeout(() => {
              try {
                if (iframe.parentNode) document.body.removeChild(iframe);
              } catch {}
            }, 2000);
          };

          iframe.onload = () => {
            printOnce();
          };
          iframe.srcdoc = html;

          timeoutId = setTimeout(() => {
            printOnce();
          }, 1500);
        })
        .catch(() => {
          printingRef.current = false;
          alert("Error al generar el documento. Por favor, intenta nuevamente.");
        });
    } catch {
      printingRef.current = false;
    }
  };

  const handleToggleEdit = async () => {
    if (editando) {
      try {
        await guardarEdicion();
        // Guardar también la sección de pago/comprobantes cuando se finaliza la edición
        await handleGuardarDocPago();
      } catch (err) {
        console.error("Error al guardar edición completa:", err);
        alert("Error al guardar cambios de la obra y documentación: " + err.message);
      }
    } else {
      setEditando(true);
    }
  };

  // Handler para cuando se selecciona un cliente (existente o nuevo)
  const handleClienteSeleccionado = async (clienteId, clienteData) => {
    if (!obra?.id) {
      console.error("No se puede actualizar: obra no disponible");
      return;
    }
    
    try {
      // Actualizar la obra en Firestore
      await updateDoc(doc(db, "obras", obra.id), {
        clienteId: clienteId,
        cliente: clienteData,
        fechaModificacion: new Date().toISOString(),
      });

      // Actualizar el estado local usando los setters del hook
      setClienteId(clienteId);
      setCliente(clienteData);

      setShowFormularioCliente(false);
    } catch (error) {
      console.error("Error al actualizar cliente:", error);
      alert("Error al actualizar el cliente");
    }
  };


  // Fetch Dólar Blue para la sección de documentación (cuando se habilita pago en dólares)
  const fetchDolarBlue = useCallback(async () => {
    setLoadingDolar(true);
    try {
      const res = await fetch("/api/dolar-blue");
      const data = await res.json();
      if (res.ok && data?.venta != null) {
        setValorOficialDolar(data.venta);
        setUltimaActualizacionDolar(data.fechaActualizacion ? new Date(data.fechaActualizacion) : new Date());
      }
    } catch (err) {
      console.warn("Error al obtener dólar blue:", err);
    } finally {
      setLoadingDolar(false);
    }
  }, []);

  useEffect(() => {
    if (!pagoEnDolares) return;
    fetchDolarBlue();
    const interval = setInterval(fetchDolarBlue, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [pagoEnDolares, fetchDolarBlue]);

  // Guardar campos de pago/comprobantes en la obra
  const handleGuardarDocPago = async () => {
    if (!obra?.id) return alert("Obra no disponible");
    try {
      await updateDoc(doc(db, "obras", obra.id), {
        pagoEnDolares: !!pagoEnDolares,
        valorOficialDolar: pagoEnDolares ? (valorOficialDolar ?? null) : null,
        comprobantesPago: comprobantesPago || [],
        notasObra: notasObra || [],
        fechaModificacion: new Date().toISOString(),
      });
      alert("Documentación guardada correctamente");
    } catch (err) {
      console.error("Error al guardar documentación:", err);
      alert("Error al guardar documentación: " + err.message);
    }
  };

  const handleCantidadChange = (id, cantidad) => {
    const parsedCantidad = parseNumericValue(cantidad);
    setItemsCatalogo((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
        const esMadera = (p.categoria || "").toLowerCase() === "maderas";
        if (
          esMadera &&
          (p.subcategoria === "machimbre" || p.subcategoria === "deck")
        ) {
          const alto = Number(p.alto) || 0;
          const largo = Number(p.largo) || 0;
          const precioPorPie = Number(p.precioPorPie) || 0;
          const cant = parsedCantidad === "" ? 1 : Number(parsedCantidad) || 1;
          let base = calcularPrecioMachimbre({
            alto,
            largo,
            cantidad: cant,
            precioPorPie,
          });
          const final = p.cepilladoAplicado ? base * 1.06 : base;
          const precioRedondeado = Math.round(final / 100) * 100;
          return { ...p, cantidad: parsedCantidad, precio: precioRedondeado };
        }
        return { ...p, cantidad: parsedCantidad };
      })
    );
  };

  const handlePrecioPorPieChange = (id, nuevo) => {
    const parsed = parseNumericValue(nuevo);
    setItemsCatalogo((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
        const esMadera = (p.categoria || "").toLowerCase() === "maderas";
        if (!esMadera) return { ...p, valorVenta: parsed };
        const subcategoria = p.subcategoria || "";
        const alto = Number(p.alto) || 0;
        const ancho = Number(p.ancho) || 0;
        const largo = Number(p.largo) || 0;
        const cantidad = Number(p.cantidad) || 1;
        const precioPorPie = parsed === "" ? 0 : Number(parsed) || 0;
        let base = 0;
        if (subcategoria === "machimbre" || subcategoria === "deck") {
          base = calcularPrecioMachimbre({
            alto,
            largo,
            cantidad,
            precioPorPie,
          });
        } else {
          base = calcularPrecioCorteMadera({
            alto,
            ancho,
            largo,
            precioPorPie,
          });
        }
        const final = p.cepilladoAplicado ? base * 1.06 : base;
        const precioRedondeado = Math.round(final / 100) * 100;
        return { ...p, precioPorPie: parsed, precio: precioRedondeado };
      })
    );
  };

  const handleAltoChange = (id, nuevo) => {
    const parsed = parseNumericValue(nuevo);
    setItemsCatalogo((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
        const esMadera = (p.categoria || "").toLowerCase() === "maderas";
        if (!esMadera) return p;
        const subcategoria = p.subcategoria || "";
        const alto = parsed === "" ? 0 : Number(parsed) || 0;
        const ancho = Number(p.ancho) || 0;
        const largo = Number(p.largo) || 0;
        const cantidad = Number(p.cantidad) || 1;
        const precioPorPie = Number(p.precioPorPie) || 0;
        let base = 0;
        if (subcategoria === "machimbre" || subcategoria === "deck") {
          base = calcularPrecioMachimbre({
            alto,
            largo,
            cantidad,
            precioPorPie,
          });
        } else {
          base = calcularPrecioCorteMadera({
            alto,
            ancho,
            largo,
            precioPorPie,
          });
        }
        const final = p.cepilladoAplicado ? base * 1.06 : base;
        const precioRedondeado = Math.round(final / 100) * 100;
        return { ...p, alto: parsed, precio: precioRedondeado };
      })
    );
  };

  const handleAnchoChange = (id, nuevo) => {
    const parsed = parseNumericValue(nuevo);
    setItemsCatalogo((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
        const esMadera = (p.categoria || "").toLowerCase() === "maderas";
        if (!esMadera) return p;
        const subcategoria = p.subcategoria || "";
        if (subcategoria === "machimbre" || subcategoria === "deck") {
          return { ...p, ancho: parsed };
        }
        const alto = Number(p.alto) || 0;
        const ancho = parsed === "" ? 0 : Number(parsed) || 0;
        const largo = Number(p.largo) || 0;
        const precioPorPie = Number(p.precioPorPie) || 0;
        const base = calcularPrecioCorteMadera({
          alto,
          ancho,
          largo,
          precioPorPie,
        });
        const final = p.cepilladoAplicado ? base * 1.06 : base;
        const precioRedondeado = Math.round(final / 100) * 100;
        return { ...p, ancho: parsed, precio: precioRedondeado };
      })
    );
  };

  const handleLargoChange = (id, nuevo) => {
    const parsed = parseNumericValue(nuevo);
    setItemsCatalogo((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
        const esMadera = (p.categoria || "").toLowerCase() === "maderas";
        if (!esMadera) return p;
        const subcategoria = p.subcategoria || "";
        const alto = Number(p.alto) || 0;
        const ancho = Number(p.ancho) || 0;
        const largo = parsed === "" ? 0 : Number(parsed) || 0;
        const cantidad = Number(p.cantidad) || 1;
        const precioPorPie = Number(p.precioPorPie) || 0;
        let base = 0;
        if (subcategoria === "machimbre" || subcategoria === "deck") {
          base = calcularPrecioMachimbre({
            alto,
            largo,
            cantidad,
            precioPorPie,
          });
        } else {
          base = calcularPrecioCorteMadera({
            alto,
            ancho,
            largo,
            precioPorPie,
          });
        }
        const final = p.cepilladoAplicado ? base * 1.06 : base;
        const precioRedondeado = Math.round(final / 100) * 100;
        return { ...p, largo: parsed, precio: precioRedondeado };
      })
    );
  };

  const toggleCepillado = (id, aplicar) => {
    setItemsCatalogo((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
        const esMadera = (p.categoria || "").toLowerCase() === "maderas";
        if (!esMadera) return p;
        const subcategoria = p.subcategoria || "";
        const alto = Number(p.alto) || 0;
        const ancho = Number(p.ancho) || 0;
        const largo = Number(p.largo) || 0;
        const cantidad = Number(p.cantidad) || 1;
        const precioPorPie = Number(p.precioPorPie) || 0;
        let base = 0;
        if (subcategoria === "machimbre" || subcategoria === "deck") {
          base = calcularPrecioMachimbre({
            alto,
            largo,
            cantidad,
            precioPorPie,
          });
        } else {
          base = calcularPrecioCorteMadera({
            alto,
            ancho,
            largo,
            precioPorPie,
          });
        }
        const final = aplicar ? base * 1.06 : base;
        const precioRedondeado = Math.round(final / 100) * 100;
        return { ...p, precio: precioRedondeado, cepilladoAplicado: aplicar };
      })
    );
  };

  const agregarProductoCatalogo = (prod) => {
    const ya = itemsCatalogo.some((x) => x.id === prod.id);
    if (ya) return;

    let precioInicial = Number(prod.valorVenta) || 0;

    // Si es madera, calcular el precio inicial basado en dimensiones
    if (prod.categoria?.toLowerCase() === "maderas") {
      const alto = Number(prod.alto) || 0;
      const ancho = Number(prod.ancho) || 0;
      const largo = Number(prod.largo) || 0;
      const precioPorPie = Number(prod.precioPorPie) || 0;

      if (alto > 0 && largo > 0 && precioPorPie > 0) {
        if (prod.subcategoria === "machimbre" || prod.subcategoria === "deck") {
          // Para machimbre/deck: alto × largo × precioPorPie
          precioInicial = calcularPrecioMachimbre({
            alto,
            largo,
            cantidad: 1,
            precioPorPie,
          });
        } else if (ancho > 0) {
          // Para madera cortada: alto × ancho × largo × precioPorPie × factor
          precioInicial = calcularPrecioCorteMadera({
            alto,
            ancho,
            largo,
            precioPorPie,
          });
        }
        // Redondear a centenas
        precioInicial = Math.round(precioInicial / 100) * 100;
      }
    }

    const nuevo = {
      id: prod.id,
      nombre: prod.nombre,
      categoria: prod.categoria || "",
      subcategoria: prod.subcategoria || "",
      unidad: prod.unidad || "UN",
      cantidad: 1,
      descuento: 0,
      precio: precioInicial,
      valorVenta: Number(prod.valorVenta) || 0,
    };

    if (prod.categoria?.toLowerCase() === "maderas") {
      nuevo.alto = Number(prod.alto) || 0;
      nuevo.ancho = Number(prod.ancho) || 0;
      nuevo.largo = Number(prod.largo) || 0;
      nuevo.precioPorPie = Number(prod.precioPorPie) || 0;
      nuevo.cepilladoAplicado = false;
    }

    setItemsCatalogo((prev) => [...prev, nuevo]);
  };

  const quitarProductoCatalogo = (id) => {
    setItemsCatalogo((prev) => prev.filter((p) => p.id !== id));
  };

  const actualizarCantidadProductoCatalogo = (id, cantidad) => {
    handleCantidadChange(id, cantidad);
  };

  const actualizarDescuento = (id, descuento) => {
    setItemsCatalogo((prev) =>
      prev.map((p) =>
        p.id === id ? { ...p, descuento: Number(descuento) || 0 } : p
      )
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Cargando obra...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-red-600 text-6xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Error</h1>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  if (!obra || obra.tipo !== "obra") {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-yellow-600 text-6xl mb-4">🏗️</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            No es una obra
          </h1>
          <p className="text-gray-600">Esta página solo muestra obras</p>
          {obra?.tipo === "presupuesto" && (
            <Button
              onClick={() => router.push(`/${lang}/obras/presupuesto/${id}`)}
              className="mt-4"
            >
              Ver como Presupuesto
            </Button>
          )}
        </div>
      </div>
    );
  }

  const handleEstadoChange = async (nuevoEstado) => {
    if (nuevoEstado === "en_ejecucion" && estadoObra === "pendiente_inicio") {
      const confirmar = window.confirm(
        "¿Desea actualizar la fecha de inicio a HOY al comenzar la obra?"
      );
      if (confirmar) {
        const hoy = new Date().toISOString().split("T")[0];
        setFechasEdit((prev) => ({ ...prev, inicio: hoy }));
        // Si no estamos editando, guardar directamente
        if (!editando) {
            try {
                await updateDoc(doc(db, "obras", obra.id), {
                    estado: nuevoEstado,
                    "fechas.inicio": hoy,
                    fechaModificacion: new Date().toISOString()
                });
                setEstadoObra(nuevoEstado);
                // Actualizar localmente la fecha de inicio en el objeto obra para reflejar el cambio
                if(obra && obra.fechas) {
                    obra.fechas.inicio = hoy;
                }
            } catch (error) {
                console.error("Error al actualizar estado y fecha:", error);
                alert("Error al actualizar el estado de la obra");
            }
            return;
        }
      }
    }
    setEstadoObra(nuevoEstado);
  };

  const normalizarNumero = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const calcularBaseProductoPreview = (producto) => {
    const precioDirecto = normalizarNumero(producto?.precio);
    if (precioDirecto > 0) return precioDirecto;
    const unidad = String(producto?.unidadMedida || producto?.unidad || "UN").toUpperCase();
    const alto = normalizarNumero(producto?.alto);
    const largo = normalizarNumero(producto?.largo);
    const cantidad = normalizarNumero(producto?.cantidad) || 1;
    const valorUnitario = normalizarNumero(
      producto?.valorVenta ?? producto?.valorUnitario ?? producto?.precioUnitario
    );
    if (unidad === "M2") return Math.round(alto * largo * valorUnitario * cantidad);
    if (unidad === "ML") return Math.round(largo * valorUnitario * cantidad);
    return Math.round(valorUnitario * cantidad);
  };

  const calcularSubtotalProductoPreview = (producto) => {
    const subtotalDirecto = normalizarNumero(producto?.subtotal);
    if (subtotalDirecto > 0) return Math.round(subtotalDirecto);
    const descuento = normalizarNumero(producto?.descuento);
    const base = calcularBaseProductoPreview(producto);
    return Math.round(base * (1 - descuento / 100));
  };

  const obtenerValorUnitarioPreview = (producto) => {
    const valorDirecto = normalizarNumero(
      producto?.valorVenta ?? producto?.valorUnitario ?? producto?.precioUnitario
    );
    if (valorDirecto > 0) return valorDirecto;
    const base = calcularBaseProductoPreview(producto);
    const unidad = String(producto?.unidadMedida || producto?.unidad || "UN").toUpperCase();
    const alto = normalizarNumero(producto?.alto);
    const largo = normalizarNumero(producto?.largo);
    const cantidad = normalizarNumero(producto?.cantidad) || 1;
    if (unidad === "M2" && alto > 0 && largo > 0 && cantidad > 0) {
      return Math.round(base / (alto * largo * cantidad));
    }
    if (unidad === "ML" && largo > 0 && cantidad > 0) {
      return Math.round(base / (largo * cantidad));
    }
    if (cantidad > 0) return Math.round(base / cantidad);
    return 0;
  };

  const presupuestoBloques = Array.isArray(presupuesto?.bloques)
    ? presupuesto.bloques
    : [];

  const bloqueSeleccionado = presupuestoBloques.find((bloque) => {
    if (
      obra?.presupuestoInicialBloqueId &&
      String(bloque?.id) === String(obra.presupuestoInicialBloqueId)
    ) {
      return true;
    }
    if (
      obra?.presupuestoInicialBloqueNombre &&
      String(bloque?.nombre || "").trim().toLowerCase() ===
        String(obra.presupuestoInicialBloqueNombre).trim().toLowerCase()
    ) {
      return true;
    }
    return false;
  });

  const bloquePreview =
    bloqueSeleccionado || (presupuestoBloques.length === 1 ? presupuestoBloques[0] : null);

  const productosPreview = bloquePreview
    ? (Array.isArray(bloquePreview.productos) ? bloquePreview.productos : [])
    : (Array.isArray(presupuesto?.productos) ? presupuesto.productos : []);
  const subtotalProductosPreview = productosPreview.reduce(
    (acc, item) => acc + calcularBaseProductoPreview(item),
    0
  );
  const totalProductosPreview = productosPreview.reduce(
    (acc, item) => acc + calcularSubtotalProductoPreview(item),
    0
  );
  const subtotalBloquePreview = (() => {
    const subtotalDirecto = normalizarNumero(bloquePreview?.subtotal);
    if (subtotalDirecto > 0) return Math.round(subtotalDirecto);
    return Math.round(subtotalProductosPreview);
  })();
  const descuentoBloquePreview = (() => {
    const descuentoDirecto = normalizarNumero(bloquePreview?.descuentoTotal);
    if (descuentoDirecto > 0) return Math.round(descuentoDirecto);
    const diferencia = subtotalBloquePreview - totalProductosPreview;
    if (diferencia > 0) return Math.round(diferencia);
    return 0;
  })();
  const totalBloquePreview = (() => {
    const totalDirecto = normalizarNumero(bloquePreview?.total);
    if (totalDirecto > 0) return Math.round(totalDirecto);
    if (subtotalBloquePreview > 0) {
      return Math.round(subtotalBloquePreview - descuentoBloquePreview);
    }
    return Math.round(totalProductosPreview);
  })();

  return (
    <div className="w-full max-w-[1600px] mx-auto p-4 space-y-6">
      <ObraHeader
        obra={obra}
        editando={editando}
        onToggleEdit={handleToggleEdit}
        onPrint={handlePrint}
        onDownload={null} // Opcional
        onConvertToObra={null}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* COLUMNA IZQUIERDA: Datos principales, Estado, Fechas */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Datos Generales</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Selector de Cliente */}
              <SelectorClienteObras
                clienteSeleccionado={cliente}
                onClienteSeleccionado={handleClienteSeleccionado}
                editando={editando}
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Estado */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">
                    Estado de la Obra
                  </label>
                  {editando ? (
                    <Select
                      value={estadoObra}
                      onValueChange={handleEstadoChange}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pendiente_inicio">Pendiente Inicio</SelectItem>
                        <SelectItem value="en_ejecucion">En Ejecución</SelectItem>
                        <SelectItem value="pausada">Pausada</SelectItem>
                        <SelectItem value="completada">Completada</SelectItem>
                        <SelectItem value="cancelada">Cancelada</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge
                      className={
                        estadoObra === "pendiente_inicio"
                          ? "bg-yellow-100 text-yellow-800"
                          : estadoObra === "en_ejecucion"
                          ? "bg-blue-100 text-blue-800"
                          : estadoObra === "pausada"
                          ? "bg-gray-100 text-gray-800"
                          : estadoObra === "completada"
                          ? "bg-green-100 text-green-800"
                          : "bg-red-100 text-red-800"
                      }
                    >
                      {estadoObra === "pendiente_inicio"
                        ? "Pendiente Inicio"
                        : estadoObra === "en_ejecucion"
                        ? "En Ejecución"
                        : estadoObra === "pausada"
                        ? "Pausada"
                        : estadoObra === "completada"
                        ? "Completada"
                        : "Cancelada"}
                    </Badge>
                  )}
                </div>

                {/* Fecha Inicio */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    Fecha Inicio
                  </label>
                  {editando ? (
                    <Input
                      type="date"
                      value={fechasEdit?.inicio || ""}
                      onChange={(e) =>
                        setFechasEdit({ ...fechasEdit, inicio: e.target.value })
                      }
                    />
                  ) : (
                    <p className="text-sm text-gray-900">
                      {fechasEdit?.inicio || obra?.fechas?.inicio
                        ? formatearFecha(fechasEdit?.inicio || obra.fechas.inicio)
                        : "No especificada"}
                    </p>
                  )}
                </div>

                {/* Fecha Fin (opcional) */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">
                    Fecha Fin <span className="text-gray-400 text-xs">(opcional)</span>
                  </label>
                  {editando ? (
                    <Input
                      type="date"
                      value={fechasEdit?.fin || ""}
                      onChange={(e) =>
                        setFechasEdit({ ...fechasEdit, fin: e.target.value || null })
                      }
                      min={fechasEdit?.inicio || obra?.fechas?.inicio}
                    />
                  ) : (
                    <p className="text-sm text-gray-900">
                      {fechasEdit?.fin || obra?.fechas?.fin
                        ? formatearFecha(fechasEdit?.fin || obra.fechas.fin)
                        : "No especificada"}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* SEGUNDO BLOQUE: Pagos / cobranzas, Saldo, Acciones rápidas */}
          <ObraCobranza
            movimientos={movimientos}
            onMovimientosChange={setMovimientos}
            editando={editando}
            formatearNumeroArgentino={formatearNumeroArgentino}
            totalObra={
              typeof obra?.total === "number" && !Number.isNaN(obra.total)
                ? obra.total
                : (modoCosto === "presupuesto" && presupuesto
                ? presupuesto.total
                  : obra.gastoObraManual)
            }
            totalAbonado={movimientos.reduce(
              (acc, m) =>
                m.tipo === "pago" ? acc + Number(m.monto || 0) : acc,
              0
            )}
            onEstadoPagoChange={(estaPagado) => {
              // Aquí podrías actualizar el estado de la obra si es necesario
              console.log(
                "Estado de pago:",
                estaPagado ? "PAGADO" : "PENDIENTE"
              );
            }}
          />

          <div className="space-y-4">
            {presupuesto && (
              <div className="space-y-4">
                <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 space-y-4">
                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                    <div className="space-y-1">
                      <p className="text-lg font-semibold text-gray-900">
                        {bloquePreview?.nombre || obra?.presupuestoInicialBloqueNombre || "Bloque del presupuesto"}
                      </p>
                      <p className="text-sm text-gray-600">{productosPreview.length} productos</p>
                      {presupuesto?.numeroPedido && (
                        <p className="text-xs text-gray-500">Vinculado a {presupuesto.numeroPedido}</p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => router.push(`/${lang}/obras/presupuesto/${presupuesto.id}`)}
                      >
                        Ver Presupuesto
                      </Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                    <div className="group relative overflow-hidden rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white px-4 py-3 shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-0.5">
                      <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-blue-700">Total del Bloque</div>
                      <p className="text-xl font-bold leading-tight text-gray-900">
                        {formatearNumeroArgentino(totalBloquePreview)}
                      </p>
                    </div>
                    <div className="group relative overflow-hidden rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-0.5">
                      <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-gray-500">Subtotal</div>
                      <p className="text-xl font-bold leading-tight text-gray-900">
                        {formatearNumeroArgentino(subtotalBloquePreview)}
                      </p>
                    </div>
                    <div className="group relative overflow-hidden rounded-xl border border-orange-200 bg-gradient-to-br from-orange-50 to-white px-4 py-3 shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-0.5">
                      <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-orange-700">Descuento</div>
                      <p className="text-xl font-bold leading-tight text-gray-900">
                        {formatearNumeroArgentino(descuentoBloquePreview)}
                      </p>
                    </div>
                    <div className="group relative overflow-hidden rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white px-4 py-3 shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-0.5">
                      <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-emerald-700">Total</div>
                      <p className="text-xl font-bold leading-tight text-emerald-800">
                        {formatearNumeroArgentino(totalBloquePreview)}
                      </p>
                    </div>
                  </div>
                  {productosPreview.length > 0 ? (
                    <div className="overflow-x-auto border border-gray-200 rounded-md bg-white">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-100">
                          <tr className="border-b">
                            <th className="p-2 text-left">Producto</th>
                            <th className="p-2 text-center">Cant.</th>
                            <th className="p-2 text-center">Unidad</th>
                            <th className="p-2 text-center">Alto</th>
                            <th className="p-2 text-center">Largo</th>
                            <th className="p-2 text-right">Valor Unit.</th>
                            <th className="p-2 text-center">Desc. %</th>
                            <th className="p-2 text-right">Subtotal</th>
                          </tr>
                        </thead>
                        <tbody>
                          {productosPreview.map((producto, idx) => {
                            const unidad = String(
                              producto?.unidadMedida || producto?.unidad || "UN"
                            ).toUpperCase();
                            const requiereAlto = unidad === "M2";
                            const requiereLargo = unidad === "M2" || unidad === "ML";
                            const origen =
                              producto?.categoria ||
                              (producto?._esManual ? "Manual" : "Obras");
                            return (
                              <tr
                                key={producto.id || `${producto.nombre || "producto"}-${idx}`}
                                className="border-b last:border-0"
                              >
                                <td className="p-2">
                                  <div className="font-medium text-gray-900">
                                    {producto?.nombre || "Producto sin nombre"}
                                  </div>
                                  <div className="text-xs text-gray-500">{origen}</div>
                                </td>
                                <td className="p-2 text-center">{normalizarNumero(producto?.cantidad) || 1}</td>
                                <td className="p-2 text-center">{unidad}</td>
                                <td className="p-2 text-center">
                                  {requiereAlto ? normalizarNumero(producto?.alto) || "-" : "-"}
                                </td>
                                <td className="p-2 text-center">
                                  {requiereLargo ? normalizarNumero(producto?.largo) || "-" : "-"}
                                </td>
                                <td className="p-2 text-right">
                                  {formatearNumeroArgentino(obtenerValorUnitarioPreview(producto))}
                                </td>
                                <td className="p-2 text-center">
                                  {normalizarNumero(producto?.descuento)}%
                                </td>
                                <td className="p-2 text-right font-semibold">
                                  {formatearNumeroArgentino(calcularSubtotalProductoPreview(producto))}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="text-sm text-gray-500 bg-white border border-gray-200 rounded-md p-3">
                      Este bloque no tiene productos para mostrar.
                    </div>
                  )}
                  {!bloquePreview && (
                    <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2">
                      No se encontró un bloque aplicado exacto. Se muestra el detalle general del presupuesto.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Espacio lateral: anotador de notas de la obra */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Notas rápidas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Form para nueva nota / editar */}
              <div className="space-y-2">
                <Input
                  placeholder="Título"
                  value={notaTitulo}
                  onChange={(e) => setNotaTitulo(e.target.value)}
                />
                <Textarea
                  placeholder="Escribí una nota..."
                  rows={3}
                  value={notaContenido}
                  onChange={(e) => setNotaContenido(e.target.value)}
                />
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setNotaTitulo("");
                      setNotaContenido("");
                      setNotaEditIdx(null);
                    }}
                    size="sm"
                  >
                    Cancelar
                  </Button>
                  <Button
                    onClick={() => {
                      const titulo = (notaTitulo || "").trim();
                      const contenido = (notaContenido || "").trim();
                      if (!titulo && !contenido) return;
                      const nueva = {
                        id: Date.now().toString(),
                        titulo: titulo || `Nota ${notasObra.length + 1}`,
                        contenido,
                        fecha: new Date().toISOString(),
                      };
                      if (notaEditIdx !== null && notasObra[notaEditIdx]) {
                        const copia = [...notasObra];
                        copia[notaEditIdx] = { ...copia[notaEditIdx], ...nueva };
                        setNotasObra(copia);
                      } else {
                        setNotasObra((prev) => [nueva, ...(prev || [])]);
                      }
                      // limpiar campos
                      setNotaTitulo("");
                      setNotaContenido("");
                      setNotaEditIdx(null);
                    }}
                  >
                    {notaEditIdx !== null ? "Guardar nota" : "Agregar nota"}
                  </Button>
                </div>
              </div>

              {/* Lista de notas */}
              <div className="space-y-2 max-h-[360px] overflow-y-auto">
                {(notasObra || []).length === 0 ? (
                  <p className="text-sm text-gray-500">No hay notas aún.</p>
                ) : (
                  (notasObra || []).map((n, idx) => (
                    <div key={n.id || idx} className="p-2 border rounded-md bg-gray-50">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-medium text-sm">{n.titulo}</div>
                          <div className="text-xs text-gray-500">{new Date(n.fecha).toLocaleString()}</div>
                          <div className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{n.contenido}</div>
                        </div>
                        <div className="flex flex-col gap-1">
                          <Button
                            size="xs"
                            variant="outline"
                            onClick={() => {
                              setNotaEditIdx(idx);
                              setNotaTitulo(n.titulo || "");
                              setNotaContenido(n.contenido || "");
                            }}
                          >
                            Editar
                          </Button>
                          <Button
                            size="xs"
                            variant="outline"
                            onClick={() => {
                              if (!confirm("¿Eliminar nota?")) return;
                              setNotasObra(prev => prev.filter((_, i) => i !== idx));
                            }}
                          >
                            Eliminar
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle 
                className="flex items-center justify-between"
              >
                <span>Información Adicional</span>
                <ChevronUp className="w-5 h-5" />
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
                <ObraDocumentacion
                  docLinks={docLinks}
                  onDocLinksChange={setDocLinks}
                  editando={editando}
                />

                <div className="space-y-3">
                  {editando ? (
                    <>
                      <label className="flex items-center gap-3 cursor-pointer">
                        <Switch
                          checked={!!pagoEnDolares}
                          onCheckedChange={(checked) => {
                            setPagoEnDolares(checked);
                            if (!checked) setValorOficialDolar(null);
                          }}
                          color="warning"
                        />
                        <span className="text-sm font-medium">Pago en dólares (USD)</span>
                      </label>

                      {pagoEnDolares && (
                        <div className="space-y-2">
                          <div className="flex gap-2 items-center">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              className="w-full md:w-40 px-3 py-2 border border-gray-300 rounded-lg"
                              value={valorOficialDolar ?? ""}
                              onChange={(e) =>
                                setValorOficialDolar(
                                  e.target.value ? Number(e.target.value) : null
                                )
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
                          {ultimaActualizacionDolar && (
                            <p className="text-xs text-gray-500">
                              Última cotización:{" "}
                              {ultimaActualizacionDolar.toLocaleString("es-AR", {
                                dateStyle: "short",
                                timeStyle: "short",
                              })}{" "}
                              (se actualiza cada 5 min)
                            </p>
                          )}
                        </div>
                      )}

                      <ComprobantesPagoSection
                        comprobantes={comprobantesPago}
                        onComprobantesChange={setComprobantesPago}
                        disabled={loadingDolar}
                        maxFiles={8}
                      />

                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          onClick={() => {
                            setPagoEnDolares(false);
                            setComprobantesPago([]);
                            setValorOficialDolar(null);
                          }}
                        >
                          Limpiar
                        </Button>
                      </div>
                    </>
                  ) : (
                    <div className="text-sm text-gray-600 space-y-1">
                      <div className="flex justify-between gap-3">
                        <span>Pago en dólares</span>
                        <span className="font-medium">
                          {obra?.pagoEnDolares ? "Sí" : "No"}
                        </span>
                      </div>
                      {!!obra?.pagoEnDolares && (
                        <div className="flex justify-between gap-3">
                          <span>Cotización usada</span>
                          <span className="font-medium">
                            {obra?.valorOficialDolar != null
                              ? String(obra.valorOficialDolar)
                              : "-"}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>


                {obra.tipoEnvio && obra.tipoEnvio !== "retiro_local" && (
                  <div className="space-y-4">
                    <h4 className="font-medium text-gray-900">Información de Envío</h4>
                    <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 space-y-2">
                      <div>
                        <p className="text-sm text-gray-500">Tipo de Envío</p>
                        <p className="font-medium">{obra.tipoEnvio}</p>
                      </div>
                      {obra.direccionEnvio && (
                        <div>
                          <p className="text-sm text-gray-500">Dirección de Envío</p>
                          <p className="font-medium">{obra.direccionEnvio}</p>
                        </div>
                      )}
                      {obra.localidadEnvio && (
                        <div>
                          <p className="text-sm text-gray-500">Localidad</p>
                          <p className="font-medium">{obra.localidadEnvio}</p>
                        </div>
                      )}
                      {obra.transportista && (
                        <div>
                          <p className="text-sm text-gray-500">Transportista</p>
                          <p className="font-medium">{obra.transportista}</p>
                        </div>
                      )}
                      {obra.fechaEntrega && (
                        <div>
                          <p className="text-sm text-gray-500">Fecha de Entrega</p>
                          <p className="font-medium">{formatearFecha(obra.fechaEntrega)}</p>
                        </div>
                      )}
                      {obra.rangoHorario && (
                        <div>
                          <p className="text-sm text-gray-500">Rango Horario</p>
                          <p className="font-medium">{obra.rangoHorario}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
            </CardContent>
          </Card>

          {/* <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Gestión de Materiales</h3>
            <CatalogoVentas
              titulo="Materiales a Utilizar"
              productos={productosCatalogo}
              productosPorCategoria={productosPorCategoria}
              categorias={categorias}
              itemsSeleccionados={itemsCatalogo}
              onAgregarProducto={agregarProductoCatalogo}
              onAgregarProductoManual={() => {}}
              onActualizarCantidad={actualizarCantidadProductoCatalogo}
              onQuitarProducto={quitarProductoCatalogo}
              editando={editando}
              maxProductos={48}
              showFilters={true}
              showSearch={true}
              showPagination={true}
              productosPorPagina={12}
            />

            <TablaProductosVentas
              titulo="Materiales Seleccionados"
              items={itemsCatalogo}
              editando={editando}
              onQuitarProducto={quitarProductoCatalogo}
              onActualizarCampo={(id, campo, valor) => {
                if (campo === "cantidad") handleCantidadChange(id, valor);
                else if (campo === "alto") handleAltoChange(id, valor);
                else if (campo === "ancho") handleAnchoChange(id, valor);
                else if (campo === "largo") handleLargoChange(id, valor);
                else if (campo === "precioPorPie")
                  handlePrecioPorPieChange(id, valor);
                else if (campo === "cepilladoAplicado")
                  toggleCepillado(id, valor);
                else if (campo === "descuento") actualizarDescuento(id, valor);
              }}
              onActualizarNombreManual={() => {}}
              formatearNumeroArgentino={formatearNumeroArgentino}
              showTotals={true}
              showDescripcionGeneral={false}
            />
          </div> */}
        </div>
      </div>
 

      {/* Selector de Cliente */}
      <SelectorClienteObras
        open={showFormularioCliente}
        onClose={() => setShowFormularioCliente(false)}
        clienteActual={obra?.cliente ? {
          id: obra.clienteId,
          ...(obra.cliente || {})
        } : null}
        onClienteSeleccionado={handleClienteSeleccionado}
      />
    </div>
  );
};

export default ObraDetallePage;
