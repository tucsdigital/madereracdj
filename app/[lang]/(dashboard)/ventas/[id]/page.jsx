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
  addDoc,
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

  // Hook para pagosSimples si no hay array pagos
  const [pagosSimples, setPagosSimples] = useState([]);

  // 1. Agregar estado para loader y mensaje de éxito
  const [registrandoPago, setRegistrandoPago] = useState(false);
  const [pagoExitoso, setPagoExitoso] = useState(false);

  // Estados para filtros de productos
  const [categoriaId, setCategoriaId] = useState("");
  const [busquedaProducto, setBusquedaProducto] = useState("");
  const [filtroTipoMadera, setFiltroTipoMadera] = useState("");
  const [filtroSubCategoria, setFiltroSubCategoria] = useState("");

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
      const productosData = snapProductos.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
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

      // Verificar que los datos se copiaron correctamente
      console.log("venta clonada:", ventaClonada);
      console.log("ventaClonada.clienteId:", ventaClonada.clienteId);
      console.log("ventaClonada.cliente:", ventaClonada.cliente);

      setVentaEdit(ventaClonada);
    }
  }, [editando, venta]);
  // Al activar edición, inicializar pagosSimples si no hay array pagos
  useEffect(() => {
    if (editando && venta && !Array.isArray(venta.pagos)) {
      setPagosSimples(
        [
          venta.montoAbonado > 0
            ? {
                fecha: venta.fecha || new Date().toISOString().split("T")[0],
                monto: Number(venta.montoAbonado),
                metodo: venta.formaPago || "-",
                usuario: "-",
              }
            : null,
        ].filter(Boolean)
      );
    }
  }, [editando, venta]);
  // Función para actualizar precios
  const handleActualizarPrecios = async () => {
    setLoadingPrecios(true);
    try {
      // Obtener productos actualizados desde Firebase
      const productosSnap = await getDocs(collection(db, "productos"));
      const productosActualizados = productosSnap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      // Actualizar precios de productos en ventaEdit
      const productosConPreciosActualizados = (ventaEdit.productos || []).map(
        (productoVenta) => {
          const productoActualizado = productosActualizados.find(
            (p) => p.id === productoVenta.id
          );
          if (productoActualizado) {
            let nuevoPrecio = 0;
            if (productoActualizado.categoria === "Maderas") {
              // Calcular precio para maderas
              const alto = Number(productoActualizado.alto) || 0;
              const ancho = Number(productoActualizado.ancho) || 0;
              const largo = Number(productoActualizado.largo) || 0;
              const precioPorPie =
                Number(productoActualizado.precioPorPie) || 0;

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
  const recalcularPreciosMadera = (productoId, aplicarCepillado) => {
    setVentaEdit((prev) => ({
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
    setVentaEdit((prev) => ({
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

  // Función para obtener información completa del producto desde la base de datos
  const getProductoCompleto = (productoId) => {
    return productos.find((p) => p.id === productoId);
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

  // Funciones para manejar cambios en productos
  const handleDecrementarCantidad = (id) => {
    setVentaEdit((prev) => ({
      ...prev,
      productos: prev.productos.map((p) =>
        p.id === id ? { ...p, cantidad: Math.max(1, p.cantidad - 1) } : p
      ),
    }));
  };

  const handleIncrementarCantidad = (id) => {
    setVentaEdit((prev) => ({
      ...prev,
      productos: prev.productos.map((p) =>
        p.id === id ? { ...p, cantidad: p.cantidad + 1 } : p
      ),
    }));
  };

  const handleCantidadChange = (id, cantidad) => {
    setVentaEdit((prev) => ({
      ...prev,
      productos: prev.productos.map((p) =>
        p.id === id ? { ...p, cantidad: Number(cantidad) } : p
      ),
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

  const handleQuitarProducto = (id) => {
    setVentaEdit((prev) => ({
      ...prev,
      productos: prev.productos.filter((p) => p.id !== id),
    }));
  };

  // Guardar cambios en Firestore
  const handleGuardarCambios = async () => {
    setErrorForm("");

    // Debug logs para entender qué está pasando
    console.log("=== DEBUG handleGuardarCambios ===");
    console.log("ventaEdit:", ventaEdit);
    console.log("ventaEdit.clienteId:", ventaEdit.clienteId);
    console.log("ventaEdit.cliente:", ventaEdit.cliente);
    console.log("ventaEdit.cliente?.nombre:", ventaEdit.cliente?.nombre);
    console.log("venta original:", venta);
    console.log("venta.clienteId:", venta.clienteId);
    console.log("venta.cliente:", venta.cliente);

    // Validación más robusta del cliente
    if (!ventaEdit.clienteId) {
      console.log("Error: No hay clienteId en ventaEdit");
      console.log("Intentando restaurar desde venta original...");

      // Intentar restaurar desde la venta original
      if (venta.clienteId) {
        ventaEdit.clienteId = venta.clienteId;
        console.log("clienteId restaurado:", ventaEdit.clienteId);
      } else {
        // Si no hay clienteId, usar el CUIT como identificador alternativo
        if (ventaEdit.cliente?.cuit) {
          ventaEdit.clienteId = ventaEdit.cliente.cuit;
          console.log("Usando CUIT como clienteId:", ventaEdit.clienteId);
        } else if (venta.cliente?.cuit) {
          ventaEdit.clienteId = venta.cliente.cuit;
          console.log(
            "Usando CUIT de venta original como clienteId:",
            ventaEdit.clienteId
          );
        } else {
          setErrorForm(
            "Error: No se encontró ID del cliente ni CUIT en la venta."
          );
          return;
        }
      }
    }

    if (!ventaEdit.cliente) {
      console.log("Error: No hay objeto cliente en ventaEdit");
      console.log("Intentando restaurar desde venta original...");

      // Intentar restaurar desde la venta original
      if (venta.cliente) {
        ventaEdit.cliente = venta.cliente;
        console.log("cliente restaurado:", ventaEdit.cliente);
      } else {
        // Si no hay objeto cliente, crear uno básico con los datos disponibles
        const clienteBasico = {
          nombre: ventaEdit.clienteId || "Cliente sin nombre",
          cuit: ventaEdit.clienteId || "",
          direccion: "",
          telefono: "",
          email: "",
        };
        ventaEdit.cliente = clienteBasico;
        console.log("Cliente básico creado:", ventaEdit.cliente);
      }
    }

    if (!ventaEdit.cliente.nombre) {
      console.log("Error: No hay nombre del cliente");
      // Intentar usar CUIT como nombre si no hay nombre
      if (ventaEdit.cliente.cuit) {
        ventaEdit.cliente.nombre = `Cliente ${ventaEdit.cliente.cuit}`;
        console.log("Nombre generado desde CUIT:", ventaEdit.cliente.nombre);
      } else {
        ventaEdit.cliente.nombre = "Cliente sin nombre";
        console.log("Nombre por defecto asignado:", ventaEdit.cliente.nombre);
      }
    }

    console.log("✅ Validación del cliente exitosa");
    console.log("clienteId final:", ventaEdit.clienteId);
    console.log("cliente final:", ventaEdit.cliente);

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

    // Calcular costo de envío solo si no es retiro local
    const costoEnvioCalculado =
      ventaEdit.tipoEnvio &&
      ventaEdit.tipoEnvio !== "retiro_local" &&
      ventaEdit.costoEnvio !== undefined &&
      ventaEdit.costoEnvio !== "" &&
      !isNaN(Number(ventaEdit.costoEnvio))
        ? Number(ventaEdit.costoEnvio)
        : 0;

    const total = subtotal - descuentoTotal + costoEnvioCalculado;
    const totalAbonado = (ventaEdit.pagos || []).reduce(
      (acc, p) => acc + Number(p.monto),
      0
    );

    if (totalAbonado >= total) {
      ventaEdit.estadoPago = "pagado";
    } else if (totalAbonado > 0) {
      ventaEdit.estadoPago = "parcial";
    } else {
      ventaEdit.estadoPago = "pendiente";
    }

    // Guardar correctamente los pagos del saldo pendiente
    if (Array.isArray(ventaEdit.pagos) && ventaEdit.pagos.length > 0) {
      delete ventaEdit.montoAbonado;
    } else if (!Array.isArray(ventaEdit.pagos) && pagosSimples.length > 0) {
      ventaEdit.pagos = pagosSimples;
      delete ventaEdit.montoAbonado;
    } else if (!Array.isArray(ventaEdit.pagos) && ventaEdit.montoAbonado > 0) {
      ventaEdit.pagos = [
        {
          fecha: new Date().toISOString().split("T")[0],
          monto: Number(ventaEdit.montoAbonado),
          metodo: ventaEdit.formaPago || "-",
          usuario: "-",
        },
      ];
      delete ventaEdit.montoAbonado;
    }

    // Asegurar que la información del cliente se preserve
    if (!ventaEdit.cliente && venta.cliente) {
      ventaEdit.cliente = venta.cliente;
    }
    if (!ventaEdit.clienteId && venta.clienteId) {
      ventaEdit.clienteId = venta.clienteId;
    }

    // ===== LÓGICA PROFESIONAL PARA MANEJAR CAMBIOS =====

    // 1. Detectar cambios en productos y cantidades
    const productosOriginales = venta.productos || venta.items || [];
    const productosNuevos = productosArr;

    console.log("=== ANÁLISIS DE CAMBIOS ===");
    console.log("Productos originales:", productosOriginales);
    console.log("Productos nuevos:", productosNuevos);

    // Crear mapas para comparación eficiente
    const productosOriginalesMap = new Map();
    productosOriginales.forEach((p) => productosOriginalesMap.set(p.id, p));

    const productosNuevosMap = new Map();
    productosNuevos.forEach((p) => productosNuevosMap.set(p.id, p));

    // 2. Manejar cambios de stock y movimientos
    const cambiosStock = [];

    // Productos que se agregaron o aumentaron cantidad
    for (const [productoId, productoNuevo] of productosNuevosMap) {
      const productoOriginal = productosOriginalesMap.get(productoId);

      if (!productoOriginal) {
        // Producto nuevo agregado
        cambiosStock.push({
          productoId,
          tipo: "nuevo",
          cantidadOriginal: 0,
          cantidadNueva: productoNuevo.cantidad,
          diferencia: productoNuevo.cantidad,
        });
      } else {
        // Producto existente con posible cambio de cantidad
        const diferencia = productoNuevo.cantidad - productoOriginal.cantidad;
        if (diferencia !== 0) {
          cambiosStock.push({
            productoId,
            tipo: "modificado",
            cantidadOriginal: productoOriginal.cantidad,
            cantidadNueva: productoNuevo.cantidad,
            diferencia,
          });
        }
      }
    }

    // Productos que se eliminaron o redujeron cantidad
    for (const [productoId, productoOriginal] of productosOriginalesMap) {
      if (!productosNuevosMap.has(productoId)) {
        // Producto eliminado
        cambiosStock.push({
          productoId,
          tipo: "eliminado",
          cantidadOriginal: productoOriginal.cantidad,
          cantidadNueva: 0,
          diferencia: -productoOriginal.cantidad,
        });
      }
    }

    console.log("Cambios de stock detectados:", cambiosStock);

    // 3. Aplicar cambios de stock y registrar movimientos
    for (const cambio of cambiosStock) {
      try {
        const productoRef = doc(db, "productos", cambio.productoId);

        // Verificar que el producto existe
        const productoSnap = await getDocs(collection(db, "productos"));
        const existe = productoSnap.docs.find(
          (d) => d.id === cambio.productoId
        );

        if (!existe) {
          console.warn(
            `Producto ${cambio.productoId} no existe en el catálogo`
          );
          continue;
        }

        // Actualizar stock
        await updateDoc(productoRef, {
          stock: increment(-cambio.diferencia),
        });

        // Registrar movimiento
        const tipoMovimiento = cambio.diferencia > 0 ? "salida" : "entrada";
        const cantidadMovimiento = Math.abs(cambio.diferencia);

        await addDoc(collection(db, "movimientos"), {
          productoId: cambio.productoId,
          tipo: tipoMovimiento,
          cantidad: cantidadMovimiento,
          usuario: "Sistema",
          fecha: serverTimestamp(),
          referencia: "edicion_venta",
          referenciaId: ventaEdit.id,
          observaciones: `Ajuste por edición de venta - ${cambio.tipo}: ${cambio.cantidadOriginal} → ${cambio.cantidadNueva}`,
          productoNombre: existe.data().nombre || "Producto desconocido",
        });

        console.log(
          `✅ Stock actualizado para producto ${cambio.productoId}: ${cambio.diferencia}`
        );
      } catch (error) {
        console.error(
          `Error actualizando stock para producto ${cambio.productoId}:`,
          error
        );
      }
    }

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

    // Buscar envío existente
    const enviosSnap = await getDocs(collection(db, "envios"));
    const envioExistente = enviosSnap.docs.find(
      (e) => e.data().ventaId === ventaEdit.id
    );

    // Lógica mejorada para manejar cambios de envío
    if (tipoEnvioNuevo !== "retiro_local") {
      // Crear nuevo envío o actualizar existente
      const envioData = {
        ventaId: ventaEdit.id,
        clienteId: ventaEdit.clienteId,
        cliente: ventaEdit.cliente,
        fechaCreacion: envioExistente
          ? envioExistente.data().fechaCreacion
          : new Date().toISOString(),
        fechaEntrega: ventaEdit.fechaEntrega,
        estado: envioExistente ? envioExistente.data().estado : "pendiente",
        prioridad: ventaEdit.prioridad || "media",
        vendedor: ventaEdit.vendedor,
        direccionEnvio:
          ventaEdit.usarDireccionCliente !== false
            ? ventaEdit.cliente?.direccion
            : ventaEdit.direccionEnvio,
        localidadEnvio:
          ventaEdit.usarDireccionCliente !== false
            ? ventaEdit.cliente?.localidad
            : ventaEdit.localidadEnvio,
        tipoEnvio: ventaEdit.tipoEnvio,
        transportista: ventaEdit.transportista,
        costoEnvio: costoEnvioNuevo,
        numeroPedido: ventaEdit.numeroPedido,
        totalVenta: total,
        productos: productosArr,
        cantidadTotal: productosArr.reduce((acc, p) => acc + p.cantidad, 0),
        historialEstados: envioExistente
          ? [
              ...(envioExistente.data().historialEstados || []),
              {
                estado: "actualizado",
                fecha: new Date().toISOString(),
                comentario: "Envío actualizado desde edición de venta",
              },
            ]
          : [
              {
                estado: "pendiente",
                fecha: new Date().toISOString(),
                comentario: "Envío creado desde edición de venta",
              },
            ],
        observaciones: ventaEdit.observaciones,
        instruccionesEspeciales: "",
        fechaActualizacion: new Date().toISOString(),
        creadoPor: "sistema",
      };

      const cleanEnvioData = Object.fromEntries(
        Object.entries(envioData).filter(
          ([_, v]) => v !== undefined && v !== null && v !== ""
        )
      );

      if (envioExistente) {
        // Actualizar envío existente
        await updateDoc(doc(db, "envios", envioExistente.id), cleanEnvioData);
        console.log("✅ Envío actualizado:", envioExistente.id);
      } else {
        // Crear nuevo envío
        await addDoc(collection(db, "envios"), cleanEnvioData);
        console.log("✅ Nuevo envío creado");
      }
    } else if (tipoEnvioNuevo === "retiro_local" && envioExistente) {
      // Eliminar envío si cambió a retiro local
      await updateDoc(doc(db, "envios", envioExistente.id), {
        estado: "cancelado",
        fechaActualizacion: new Date().toISOString(),
        historialEstados: [
          ...(envioExistente.data().historialEstados || []),
          {
            estado: "cancelado",
            fecha: new Date().toISOString(),
            comentario: "Envío cancelado - cambiado a retiro local",
          },
        ],
      });
      console.log("✅ Envío cancelado por cambio a retiro local");
    }

    // 5. Actualizar la venta con los nuevos totales calculados correctamente
    const ventaActualizada = {
      ...ventaEdit,
      subtotal,
      descuentoTotal,
      total,
      productos: productosArr,
      items: productosArr,
      // Asegurar que el costo de envío se guarde correctamente
      costoEnvio: costoEnvioNuevo,
      // Limpiar campos de envío si es retiro local
      ...(tipoEnvioNuevo === "retiro_local" && {
        costoEnvio: 0,
        direccionEnvio: "",
        localidadEnvio: "",
        transportista: "",
        rangoHorario: "",
        prioridad: "",
      }),
    };

    const docRef = doc(db, "ventas", ventaEdit.id);
    await updateDoc(docRef, ventaActualizada);

    // Actualizar el estado local
    setVenta(ventaActualizada);
    setEditando(false);

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
          <p className=" mb-4">
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

  // Función para imprimir
  const handlePrint = () => {
    window.print();
  };

  // Función para imprimir versión empleado (sin precios)
  const handlePrintEmpleado = () => {
    // Agregar clase al body para identificar modo empleado
    document.body.classList.add("print-empleado");
    window.print();
    // Remover clase después de imprimir
    setTimeout(() => {
      document.body.classList.remove("print-empleado");
    }, 1000);
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

  const estadoPago = venta.estadoPago || "pendiente";
  // Calcular monto abonado correctamente: priorizar array pagos, sino usar montoAbonado
  const montoAbonado =
    Array.isArray(venta.pagos) && venta.pagos.length > 0
      ? venta.pagos.reduce((acc, p) => acc + Number(p.monto), 0)
      : Number(venta.montoAbonado || 0);
  const saldoPendiente = (venta.total || 0) - montoAbonado;

  // Usar el estadoPago de la base de datos, no recalcular
  // Solo recalcular si no existe estadoPago en la BD
  const estadoPagoFinal =
    venta.estadoPago ||
    (() => {
      const montoAbonadoReal =
        Array.isArray(venta.pagos) && venta.pagos.length > 0
          ? venta.pagos.reduce((acc, p) => acc + Number(p.monto), 0)
          : Number(venta.montoAbonado || 0);

      return montoAbonadoReal >= (venta.total || 0)
        ? "pagado"
        : montoAbonadoReal > 0
        ? "parcial"
        : "pendiente";
    })();

  return (
    <div className="min-h-screen py-8">
      <style>{`
    select {
      background: #fff !important;
      border: 1px solid #d1d5db !important;
      border-radius: 6px !important;
      padding: 8px 12px !important;
      font-size: 1rem !important;
      color: #222 !important;
      outline: none !important;
      box-shadow: none !important;
      transition: border 0.2s;
    }
    select:focus {
      border: 1.5px solid #2563eb !important;
      box-shadow: 0 0 0 2px #2563eb22 !important;
    }
    @keyframes fade-in {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .animate-fade-in {
      animation: fade-in 0.5s;
    }
    
    /* Estilos profesionales para impresión */
    @media print {
      @page { 
        margin: 15mm !important; 
        size: A4;
      }
      
      body { 
        margin: 0 !important; 
        padding: 0 !important; 
        font-size: 12px !important;
        line-height: 1.3 !important;
      }
      
      /* Eliminar sombras y efectos */
      * { 
        box-shadow: none !important; 
        text-shadow: none !important;
        border-radius: 0 !important;
      }
      
      /* Header profesional */
      .print-header {
        border-bottom: 2px solid #000 !important;
        padding-bottom: 10px !important;
        margin-bottom: 15px !important;
      }
      
      /* Información compacta */
      .info-section {
        display: grid !important;
        grid-template-columns: 1fr 1fr !important;
        gap: 20px !important;
        margin-bottom: 20px !important;
      }
      
      .info-card {
        border: 1px solid #ccc !important;
        padding: 10px !important;
        background: #f9f9f9 !important;
      }
      
      /* Tabla profesional */
      .product-table {
        width: 100% !important;
        border-collapse: collapse !important;
        margin-bottom: 15px !important;
      }
      
      .product-table th {
        background: #f0f0f0 !important;
        border: 1px solid #000 !important;
        padding: 8px 4px !important;
        font-weight: bold !important;
        text-align: center !important;
        font-size: 10px !important;
      }
      
      .product-table td {
        border: 1px solid #ccc !important;
        padding: 6px 4px !important;
        font-size: 10px !important;
        vertical-align: top !important;
      }
      
      /* Totales profesionales */
      .totales-section {
        border-top: 2px solid #000 !important;
        padding-top: 10px !important;
        margin-top: 15px !important;
      }
      
      .total-row {
        display: flex !important;
        justify-content: space-between !important;
        margin-bottom: 5px !important;
        font-size: 12px !important;
      }
      
      .total-final {
        font-weight: bold !important;
        font-size: 14px !important;
        border-top: 1px solid #000 !important;
        padding-top: 5px !important;
        margin-top: 5px !important;
      }
      
      /* Ocultar elementos innecesarios */
      .no-print { display: none !important; }
      
      /* Control de saltos de página */
      .page-break { page-break-before: always !important; }
      .keep-together { page-break-inside: avoid !important; }
      
      /* Espaciado compacto */
      .compact-spacing {
        margin: 0 !important;
        padding: 0 !important;
      }
      
      .compact-spacing > * {
        margin-bottom: 10px !important;
      }
      
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
    }
  `}</style>
      <div id="venta-print" className="max-w-4xl mx-auto px-4">
        {/* Header profesional */}
        <div className="print-header">
          <div className="flex justify-between items-start">
            <div className="flex items-center gap-4">
              <img
                src="/logo-maderera.png"
                alt="Logo Maderera"
                style={{ height: 50, width: "auto" }}
              />
              <div>
                <h1 className="text-2xl font-bold" style={{ letterSpacing: 1 }}>
                  Maderas Caballero
                </h1>
                <div className="text-sm">Venta / Comprobante</div>
                <div className="text-gray-500 text-xs">
                  www.caballeromaderas.com
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="font-semibold">
                N°: {venta?.numeroPedido || venta?.id?.slice(-8)}
              </div>
              <div className="text-sm">
                Fecha: {venta?.fecha ? formatFechaLocal(venta.fecha) : "-"}
              </div>
            </div>
          </div>
        </div>

        {/* Información del cliente y envío */}
        <div className="info-section">
          <div className="info-card">
            <h3 className="font-semibold mb-2">Información del Cliente</h3>
            <div className="compact-spacing">
              <div><strong>Nombre:</strong> {venta.cliente?.nombre || "-"}</div>
              <div><strong>CUIT/DNI:</strong> {venta.cliente?.cuitDni || "-"}</div>
              <div><strong>Dirección:</strong> {venta.cliente?.direccion || "-"}</div>
              <div><strong>Teléfono:</strong> {venta.cliente?.telefono || "-"}</div>
              <div><strong>Email:</strong> {venta.cliente?.email || "-"}</div>
            </div>
          </div>

          <div className="info-card">
            <h3 className="font-semibold mb-2">Información de Envío y Pago</h3>
            <div className="compact-spacing">
              <div>
                <strong>Tipo de envío:</strong>{" "}
                {venta.tipoEnvio === "envio_domicilio" ? "Envío a Domicilio" : 
                 venta.tipoEnvio === "retiro_local" ? "Retiro en Local" : venta.tipoEnvio}
              </div>
              {venta.transportista && (
                <div><strong>Transportista:</strong> {venta.transportista}</div>
              )}
              {venta.cliente?.direccion && venta.tipoEnvio !== "retiro_local" && (
                <div><strong>Dirección:</strong> {venta.cliente.direccion}</div>
              )}
              {venta.fechaEntrega && (
                <div><strong>Fecha de envío:</strong> {venta.fechaEntrega}</div>
              )}
              {venta.rangoHorario && (
                <div><strong>Rango horario:</strong> {venta.rangoHorario}</div>
              )}
              <div className="no-print"><strong>Prioridad:</strong> {venta.prioridad || "-"}</div>
              <div className="no-print"><strong>Vendedor:</strong> {venta.vendedor || "-"}</div>
              <div><strong>Forma de pago:</strong> {venta.formaPago || "-"}</div>
              <div><strong>Estado:</strong> 
                <span className="text-green-700 font-bold ml-1">
                  {venta.estadoPago === "pagado" ? "Pagado" : 
                   venta.estadoPago === "parcial" ? "Pago Parcial" : "Pendiente"}
                </span>
              </div>
              {venta.costoEnvio > 0 && (
                <div><strong>Costo de envío:</strong> ${formatearNumeroArgentino(venta.costoEnvio)}</div>
              )}
            </div>
          </div>
        </div>

        {/* Tabla de productos */}
        <div className="keep-together">
          <h3 className="font-semibold mb-2">Productos y Servicios</h3>
          <table className="product-table">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Cantidad</th>
                <th>Unidad</th>
                <th>Precio Unit.</th>
                <th>Descuento</th>
                <th>Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {safeArray(venta.productos).map((producto, idx) => (
                <tr key={idx}>
                  <td>
                    <div className="font-medium">
                      {producto.descripcion || producto.nombre || "Producto sin nombre"}
                    </div>
                    {/* Mostrar dimensiones y tipo de madera para productos de madera */}
                    {producto.categoria === "Maderas" && (
                      <div className="text-xs text-gray-600 mt-1">
                        <div>Alto: {producto.alto || 0} Ancho: {producto.ancho || 0} Largo: {producto.largo || 0}</div>
                        {getProductoCompleto(producto.id)?.tipoMadera && (
                          <div className="text-orange-600 font-medium">
                            🌲 {getProductoCompleto(producto.id).tipoMadera}
                          </div>
                        )}
                      </div>
                    )}
                    {/* Mostrar subcategoría para productos de ferretería */}
                    {producto.categoria === "Ferretería" && getProductoCompleto(producto.id)?.subCategoria && (
                      <div className="text-xs text-blue-600 font-medium mt-1">
                        🔧 {getProductoCompleto(producto.id).subCategoria}
                      </div>
                    )}
                  </td>
                  <td className="text-center">{producto.cantidad || 0}</td>
                  <td className="text-center">{producto.unidad || "unidad"}</td>
                  <td className="text-right">${formatearNumeroArgentino(producto.precioUnitario || 0)}</td>
                  <td className="text-center">{producto.descuento || 0}%</td>
                  <td className="text-right font-semibold">
                    ${formatearNumeroArgentino(producto.subtotal || 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totales */}
          <div className="totales-section">
            <div className="total-row">
              <span>Subtotal:</span>
              <span>${formatearNumeroArgentino(venta.subtotal || 0)}</span>
            </div>
            {venta.descuentoTotal > 0 && (
              <div className="total-row">
                <span>Descuento total:</span>
                <span>-${formatearNumeroArgentino(venta.descuentoTotal)}</span>
              </div>
            )}
            {venta.costoEnvio > 0 && (
              <div className="total-row">
                <span>Costo de envío:</span>
                <span>${formatearNumeroArgentino(venta.costoEnvio)}</span>
              </div>
            )}
            <div className="total-row total-final">
              <span>TOTAL:</span>
              <span>${formatearNumeroArgentino(venta.total || 0)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VentaDetalle;
