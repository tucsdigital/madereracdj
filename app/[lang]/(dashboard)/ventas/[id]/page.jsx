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
      const productosData = snapProductos.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
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
      /* Layout de 2 columnas para impresión */
      #venta-print .grid { 
        display: grid !important;
        grid-template-columns: 1fr 1fr !important;
        gap: 20px !important;
        margin-bottom: 20px !important;
      }
      #venta-print .bg-card {
        background: #f9fafb !important;
        padding: 15px !important;
        border-radius: 8px !important;
      }
      /* Reducir tamaños de fuente para que quepa todo */
      #venta-print h3 {
        font-size: 14px !important;
        margin-bottom: 8px !important;
      }
      #venta-print .text-sm {
        font-size: 11px !important;
      }
      #venta-print .space-y-2 > div {
        margin-bottom: 4px !important;
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
      <div id="venta-print" className="max-w-4xl mx-auto px-4">
        {/* Header profesional igual al de presupuesto */}
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
              Maderas Caballero
            </h1>
            <div className=" text-sm">Venta / Comprobante</div>
            <div className="text-gray-500 text-xs">
              www.caballeromaderas.com
            </div>
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
        {/* Mensaje para empleados (solo visible en impresión) */}
        <div className="mensaje-empleado hidden">
          <div className="text-center">
            {/* <h3 className="text-lg font-bold mb-2">📋 LISTA DE PRODUCTOS PARA EMPLEADO</h3>
            <p className="text-sm">Esta versión oculta los precios para uso interno del empleado</p> */}
            <p className="text-sm font-medium mt-2">
              Venta N°: {venta?.numeroPedido || venta?.id?.slice(-8)}
            </p>
            <p className="text-sm">Cliente: {venta.cliente?.nombre || "-"}</p>
            <p className="text-sm">
              Fecha: {venta?.fecha ? formatFechaLocal(venta.fecha) : "-"}
            </p>
          </div>
        </div>
        {/* Header con botones */}
        <div className="bg-card rounded-lg shadow-sm p-6 mb-6 no-print">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-6">
            <div className="flex-1">
              <h1 className="text-2xl lg:text-3xl font-bold">
                N°: {venta?.numeroPedido || venta?.id?.slice(-8)}
              </h1>
              {/* Mostrar observaciones si existen */}
              {venta.observaciones && (
                <p className="text-gray-600 mt-1 whitespace-pre-line">
                  {venta.observaciones}
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
              <Button
                onClick={handlePrintEmpleado}
                variant="outline"
                className="no-print flex-1 lg:flex-none text-sm lg:text-base bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100"
              >
                <span className="hidden sm:inline">Imprimir Empleado</span>
                <span className="sm:hidden">👷</span>
              </Button>
              {!editando && (
                <Button
                  onClick={() => setEditando(true)}
                  className="no-print flex-1 lg:flex-none text-sm lg:text-base"
                >
                  <span className="hidden sm:inline">Editar</span>
                  <span className="sm:hidden">✏️</span>
                </Button>
              )}
            </div>
          </div>
        </div>
        {/* 1. Información del cliente y venta */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div className="bg-card rounded-lg shadow-sm p-6 mb-6 flex flex-col gap-4">
            <h3 className="font-semibold text-lg mb-2 ">
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
          {venta.tipoEnvio && venta.tipoEnvio !== "retiro_local" ? (
            <div className="bg-card rounded-lg shadow-sm p-6 mb-6 flex flex-col gap-4">
              <h3 className="font-semibold text-lg mb-2 ">
                Información de Envío y Pago
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                    <span className="forma-pago-empleado">
                      {venta.formaPago || "-"}
                    </span>
                  </div>
                  {venta.costoEnvio !== undefined &&
                    Number(venta.costoEnvio) > 0 && (
                      <div className="costo-envio-empleado">
                        <span className="font-medium">Costo de envío:</span> $
                        {Number(venta.costoEnvio).toLocaleString("es-AR", {
                          minimumFractionDigits: 2,
                        })}
                      </div>
                    )}
                </div>
                {/* Estado de la venta */}
                <div className="estado-pago-empleado">
                  <span className="font-medium">Estado de la venta:</span>{" "}
                  {(() => {
                    // Usar el estadoPago de la base de datos, no recalcular
                    const estadoPago = venta.estadoPago || "pendiente";

                    if (estadoPago === "pagado") {
                      return (
                        <span className="text-green-700 font-bold ml-2">
                          Pagado
                        </span>
                      );
                    } else if (estadoPago === "parcial") {
                      return (
                        <span className="text-yellow-700 font-bold ml-2">
                          Parcial
                        </span>
                      );
                    } else {
                      return (
                        <span className="text-red-700 font-bold ml-2">
                          Pendiente
                        </span>
                      );
                    }
                  })()}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-card rounded-lg shadow-sm p-6 mb-6 flex flex-col gap-4">
              <h3 className="font-semibold text-lg mb-2 ">
                Información de Envío y Pago
              </h3>
              <div className="space-y-2 text-sm">
                <div>
                  <span className="font-medium">Tipo de entrega:</span> Retiro
                  en local
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
                {/* Estado de la venta */}
                <div>
                  <span className="font-medium">Estado de la venta:</span>{" "}
                  {(() => {
                    // Usar el estadoPago de la base de datos, no recalcular
                    const estadoPago = venta.estadoPago || "pendiente";

                    if (estadoPago === "pagado") {
                      return (
                        <span className="text-green-700 font-bold ml-2">
                          Pagado
                        </span>
                      );
                    } else if (estadoPago === "parcial") {
                      return (
                        <span className="text-yellow-700 font-bold ml-2">
                          Parcial
                        </span>
                      );
                    } else {
                      return (
                        <span className="text-red-700 font-bold ml-2">
                          Pendiente
                        </span>
                      );
                    }
                  })()}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 3. Información de Pagos */}
        <div className="bg-card rounded-lg shadow-sm p-6 mb-6 no-print">
          <h3 className="font-semibold text-lg mb-4 ">Información de Pagos</h3>

          {/* Estado de pago */}
          <div className="mb-4 p-3 bg-card rounded-lg">
            <div className="flex justify-between items-center">
              <span className="font-medium">Estado de pago:</span>
              <span
                className={`px-3 py-1 rounded-full text-sm font-semibold ${
                  venta.estadoPago === "pagado"
                    ? "bg-green-100 text-green-800"
                    : venta.estadoPago === "parcial"
                    ? "bg-yellow-100 text-yellow-800"
                    : "bg-red-100 text-red-800"
                }`}
              >
                {venta.estadoPago === "pagado"
                  ? "Pagado"
                  : venta.estadoPago === "parcial"
                  ? "Pago Parcial"
                  : "Pendiente"}
              </span>
            </div>
          </div>

          {/* Detalles de pagos */}
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="">Total de la venta:</span>
              <span className="font-semibold total-empleado">
                ${formatearNumeroArgentino(venta.total || 0)}
              </span>
            </div>

            <div className="flex justify-between">
              <span className="">Monto abonado:</span>
              <span className="font-semibold text-green-600 monto-abonado-empleado">
                ${formatearNumeroArgentino(montoAbonado)}
              </span>
            </div>

            {saldoPendiente > 0 && (
              <div className="flex justify-between border-t pt-2">
                <span className="">Saldo pendiente:</span>
                <span className="font-semibold text-red-600 saldo-pendiente-empleado">
                  ${formatearNumeroArgentino(saldoPendiente)}
                </span>
              </div>
            )}
          </div>

          {/* Historial de pagos si existe */}
          {Array.isArray(venta.pagos) && venta.pagos.length > 0 && (
            <div className="mt-4 historial-pagos-empleado">
              <h4 className="font-medium mb-2">Historial de pagos:</h4>
              <div className="bg-card rounded-lg p-3">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-card border-b">
                      <th className="text-left py-1">Fecha</th>
                      <th className="text-left py-1">Método</th>
                      <th className="text-right py-1">Monto</th>
                      <th className="text-left py-1">Usuario</th>
                    </tr>
                  </thead>
                  <tbody>
                    {venta.pagos.map((pago, idx) => (
                      <tr key={idx} className="border-b border-gray-200">
                        <td className="py-1">{formatFechaLocal(pago.fecha)}</td>
                        <td className="py-1">{pago.metodo}</td>
                        <td className="py-1 text-right">
                          ${Number(pago.monto).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Productos y Servicios */}
        {(Array.isArray(venta.productos) && venta.productos.length > 0) ||
        (Array.isArray(venta.items) && venta.items.length > 0) ? (
          <div className="bg-card rounded-lg shadow-sm p-6 mb-6">
            <h3 className="font-semibold text-lg mb-4 ">
              Productos y Servicios
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-card border-b">
                    <th className="text-left p-3 font-medium">Producto</th>
                    <th className="text-center p-3 font-medium">Cantidad</th>
                    <th className="text-center p-3 font-medium">Unidad</th>
                    <th className="text-right p-3 font-medium precio-empleado">
                      Precio Unit.
                    </th>
                    <th className="text-right p-3 font-medium descuento-empleado">
                      Descuento
                    </th>
                    <th className="text-right p-3 font-medium subtotal-empleado">
                      Subtotal
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(venta.productos || venta.items).map((producto, idx) => (
                    <tr key={idx} className="border-b hover:bg-card">
                      <td className="p-3 font-medium">
                        {producto.descripcion ||
                          producto.nombre ||
                          "Producto sin nombre"}
                        {/* Mostrar dimensiones y precio por pie para productos de madera */}
                        {producto.categoria === "Maderas" && (
                          <div className="mt-1 text-xs text-gray-500">
                            <div className="flex flex-wrap gap-2">
                              <span>Alto: {producto.alto || 0} </span>
                              <span>Ancho: {producto.ancho || 0} </span>
                              <span>Largo: {producto.largo || 0} </span>
                            </div>
                            {/* Mostrar tipo de madera */}
                            {producto.tipoMadera && (
                              <div className="mt-1 text-xs text-orange-600 font-medium">
                                🌲 Tipo: {producto.tipoMadera}
                              </div>
                            )}
                          </div>
                        )}
                        {/* Mostrar subcategoría para productos de ferretería */}
                        {producto.categoria === "Ferretería" && producto.subCategoria && (
                          <div className="mt-1 text-xs text-blue-600 font-medium">
                            🔧 {producto.subCategoria}
                          </div>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        {Number(producto.cantidad)}
                      </td>
                      <td className="p-3 text-center">
                        {producto.unidad || "-"}
                      </td>
                      <td className="p-3 text-right precio-empleado">
                        ${formatearNumeroArgentino(Number(producto.precio))}
                      </td>
                      <td className="p-3 text-right descuento-empleado">
                        {Number(producto.descuento || 0).toFixed(2)}%
                      </td>
                      <td className="p-3 text-right font-medium subtotal-empleado">
                        $
                        {formatearNumeroArgentino(
                          Number(producto.precio) *
                            Number(producto.cantidad) *
                            (1 - Number(producto.descuento || 0) / 100)
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Totales */}
            <div className="mt-6 flex justify-end">
              <div className="bg-card rounded-lg p-4 min-w-[300px]">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between subtotal-empleado">
                    <span>Subtotal:</span>
                    <span>
                      $
                      {Number(venta.subtotal || 0).toLocaleString("es-AR", {
                        minimumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                  <div className="flex justify-between descuento-empleado">
                    <span>Descuento total:</span>
                    <span>
                      $
                      {Number(venta.descuentoTotal || 0).toLocaleString(
                        "es-AR",
                        {
                          minimumFractionDigits: 2,
                        }
                      )}
                    </span>
                  </div>
                  {venta.costoEnvio !== undefined &&
                    venta.costoEnvio !== "" &&
                    !isNaN(Number(venta.costoEnvio)) &&
                    Number(venta.costoEnvio) > 0 && (
                      <div className="flex justify-between costo-envio-empleado">
                        <span>Cotización de envío:</span>
                        <span>
                          $
                          {Number(venta.costoEnvio).toLocaleString("es-AR", {
                            minimumFractionDigits: 2,
                          })}
                        </span>
                      </div>
                    )}
                  <div className="border-t pt-2 flex justify-between font-bold text-lg total-empleado">
                    <span>Total:</span>
                    <span className="text-primary">
                      $
                      {(
                        Number(venta.subtotal || 0) -
                        Number(venta.descuentoTotal || 0) +
                        (Number(venta.costoEnvio) || 0)
                      ).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {/* 5. Observaciones */}
        {venta.observaciones && (
          <div className="bg-card rounded-lg shadow-sm p-6 mb-6 flex flex-col gap-2">
            <h3 className="font-semibold text-lg mb-2 ">Observaciones</h3>
            <p className="text-gray-700 whitespace-pre-wrap">
              {venta.observaciones}
            </p>
          </div>
        )}

        {/* 8. Edición: cada bloque editable en su propia tarjeta, alineado y con labels claros */}
        {editando && ventaEdit && (
          <div className="flex flex-col gap-8 mt-8">
            {/* Información de envío */}
            <section className="space-y-4 bg-card rounded-lg p-4 border border-gray-200 shadow-sm">
              <h3 className="text-lg font-semibold  mb-2">
                Información de envío
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="block">
                  <span className="text-sm font-medium">Tipo de envío</span>
                  <select
                    className="w-full px-3 flex [&>svg]:h-5 [&>svg]:w-5 justify-between items-center read-only:bg-background disabled:cursor-not-allowed disabled:opacity-50 transition duration-300 border-default-300 text-default-500 focus:outline-hidden focus:border-default-500/50 disabled:bg-default-200 placeholder:text-accent-foreground/50 [&>svg]:stroke-default-600 border rounded-lg h-10 text-sm"
                    value={ventaEdit.tipoEnvio || ""}
                    onChange={(e) => {
                      const nuevoTipoEnvio = e.target.value;
                      setVentaEdit((prev) => {
                        const updated = { ...prev, tipoEnvio: nuevoTipoEnvio };

                        // Si cambia de envío a retiro local, limpiar costo de envío
                        if (nuevoTipoEnvio === "retiro_local") {
                          updated.costoEnvio = "";
                          updated.direccionEnvio = "";
                          updated.localidadEnvio = "";
                          updated.transportista = "";
                          updated.rangoHorario = "";
                          updated.prioridad = "";
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
                {ventaEdit.tipoEnvio &&
                  ventaEdit.tipoEnvio !== "retiro_local" && (
                    <>
                      <label className="block col-span-2">
                        <span className="text-sm font-medium">
                          ¿Usar dirección del cliente?
                        </span>
                        <input
                          type="checkbox"
                          className="ml-2"
                          checked={ventaEdit.usarDireccionCliente !== false}
                          onChange={(e) =>
                            setVentaEdit({
                              ...ventaEdit,
                              usarDireccionCliente: e.target.checked,
                            })
                          }
                        />
                      </label>
                      {ventaEdit.usarDireccionCliente === false ? (
                        <>
                          <input
                            className="border rounded px-2 py-2 w-full"
                            value={ventaEdit.direccionEnvio || ""}
                            onChange={(e) =>
                              setVentaEdit({
                                ...ventaEdit,
                                direccionEnvio: e.target.value,
                              })
                            }
                            placeholder="Dirección de envío"
                          />
                          <input
                            className="border rounded px-2 py-2 w-full"
                            value={ventaEdit.localidadEnvio || ""}
                            onChange={(e) =>
                              setVentaEdit({
                                ...ventaEdit,
                                localidadEnvio: e.target.value,
                              })
                            }
                            placeholder="Localidad/Ciudad"
                          />
                        </>
                      ) : (
                        <>
                          <input
                            className="border rounded px-2 py-2 w-full"
                            value={ventaEdit.cliente?.direccion || ""}
                            readOnly
                            placeholder="Dirección del cliente"
                          />
                          <input
                            className="border rounded px-2 py-2 w-full"
                            value={ventaEdit.cliente?.localidad || ""}
                            readOnly
                            placeholder="Localidad del cliente"
                          />
                        </>
                      )}
                      <select
                        className="border rounded px-2 py-2 w-full"
                        value={ventaEdit.transportista || ""}
                        onChange={(e) =>
                          setVentaEdit({
                            ...ventaEdit,
                            transportista: e.target.value,
                          })
                        }
                      >
                        <option value="">Transportista...</option>
                        <option value="camion">camion</option>
                        <option value="camioneta 1">camioneta 1</option>
                        <option value="camioneta 2">camioneta 2</option>
                      </select>
                      <input
                        className="border rounded px-2 py-2 w-full"
                        value={ventaEdit.costoEnvio || ""}
                        onChange={(e) =>
                          setVentaEdit({
                            ...ventaEdit,
                            costoEnvio: e.target.value,
                          })
                        }
                        placeholder="Costo de envío"
                        type="number"
                        min="0"
                        step="0.01"
                      />
                      <input
                        className="border rounded px-2 py-2 w-full"
                        type="date"
                        value={ventaEdit.fechaEntrega || ""}
                        onChange={(e) =>
                          setVentaEdit({
                            ...ventaEdit,
                            fechaEntrega: e.target.value,
                          })
                        }
                        placeholder="Fecha de entrega"
                      />
                      <input
                        className="border rounded px-2 py-2 w-full"
                        value={ventaEdit.rangoHorario || ""}
                        onChange={(e) =>
                          setVentaEdit({
                            ...ventaEdit,
                            rangoHorario: e.target.value,
                          })
                        }
                        placeholder="Rango horario (ej: 8-12, 14-18)"
                      />
                    </>
                  )}
                {/* Solo mostrar fecha de retiro si es retiro local */}
                {ventaEdit.tipoEnvio === "retiro_local" && (
                  <input
                    className="border rounded px-2 py-2 w-full"
                    type="date"
                    value={ventaEdit.fechaEntrega || ""}
                    onChange={(e) =>
                      setVentaEdit({
                        ...ventaEdit,
                        fechaEntrega: e.target.value,
                      })
                    }
                    placeholder="Fecha de retiro"
                  />
                )}
              </div>
            </section>

            {/* Información adicional */}
            <section className="space-y-4 bg-card rounded-lg p-4 border border-gray-200 shadow-sm">
              <h3 className="text-lg font-semibold  mb-2">
                Información adicional
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="block">
                  <span className="text-sm font-medium">
                    Vendedor responsable
                  </span>
                  <select
                    className="w-full px-3 flex [&>svg]:h-5 [&>svg]:w-5 justify-between items-center read-only:bg-background disabled:cursor-not-allowed disabled:opacity-50 transition duration-300 border-default-300 text-default-500 focus:outline-hidden focus:border-default-500/50 disabled:bg-default-200 placeholder:text-accent-foreground/50 [&>svg]:stroke-default-600 border rounded-lg h-10 text-sm"
                    value={ventaEdit.vendedor || ""}
                    onChange={(e) =>
                      setVentaEdit({ ...ventaEdit, vendedor: e.target.value })
                    }
                  >
                    <option value="">Selecciona...</option>
                    <option value="coco">coco</option>
                    <option value="damian">damian</option>
                    <option value="lauti">lauti</option>
                    <option value="jose">jose</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-sm font-medium">Prioridad</span>
                  <select
                    className="w-full px-3 flex [&>svg]:h-5 [&>svg]:w-5 justify-between items-center read-only:bg-background disabled:cursor-not-allowed disabled:opacity-50 transition duration-300 border-default-300 text-default-500 focus:outline-hidden focus:border-default-500/50 disabled:bg-default-200 placeholder:text-accent-foreground/50 [&>svg]:stroke-default-600 border rounded-lg h-10 text-sm"
                    value={ventaEdit.prioridad || ""}
                    onChange={(e) =>
                      setVentaEdit({ ...ventaEdit, prioridad: e.target.value })
                    }
                  >
                    <option value="">Selecciona...</option>
                    <option value="alta">Alta</option>
                    <option value="media">Media</option>
                    <option value="baja">Baja</option>
                  </select>
                </label>
                <label className="block col-span-2">
                  <span className="text-sm font-medium">Observaciones</span>
                  <textarea
                    className="w-full px-3 flex [&>svg]:h-5 [&>svg]:w-5 justify-between items-center read-only:bg-background disabled:cursor-not-allowed disabled:opacity-50 transition duration-300 border-default-300 text-default-500 focus:outline-hidden focus:border-default-500/50 disabled:bg-default-200 placeholder:text-accent-foreground/50 [&>svg]:stroke-default-600 border rounded-lg h-10 text-sm"
                    value={ventaEdit.observaciones || ""}
                    onChange={(e) =>
                      setVentaEdit({
                        ...ventaEdit,
                        observaciones: e.target.value,
                      })
                    }
                    placeholder="Observaciones"
                  />
                </label>
              </div>
            </section>

            {/* Editar productos de la venta - BLOQUE COPIADO Y ADAPTADO */}
            <div className="bg-card rounded-lg shadow-sm p-6 mb-6">
              <h3 className="font-semibold text-lg mb-4 ">
                Editar productos de la venta
              </h3>
              {/* --- INICIO BLOQUE COPIADO DE ventas/page.jsx --- */}
              <section className="bg-card rounded-xl border border-default-200 shadow-sm overflow-hidden">
                {/* Header con estadísticas */}
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 px-6 py-4 border-b border-gray-200 dark:border-gray-700">
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
                        <p className="text-sm ">
                          Selecciona los productos para tu venta
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-blue-600">
                        {(ventaEdit.productos || []).length}
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
                              if (categoriaId === categoria) {
                                setCategoriaId("");
                                setFiltroTipoMadera("");
                                setFiltroSubCategoria("");
                              } else {
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
                      {categoriaId === "Maderas" && tiposMadera.length > 0 && (
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
                                Todas las subcategorías
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
                                  {subCategoria}
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
                          onChange={(e) => setBusquedaProducto(e.target.value)}
                          className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 bg-card"
                        />
                      </div>
                    </div>
                  </div>
                </div>
                {/* Lista de productos mejorada */}
                <div className="max-h-96 overflow-y-auto">
                  {(() => {
                    console.log("=== DEBUG FILTRADO PRODUCTOS ===");
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
                    
                    console.log("productosPorCategoria:", productosPorCategoria);
                    console.log("productosPorCategoria[categoriaId]:", productosPorCategoria[categoriaId]);
                    
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
                          const yaAgregado = (ventaEdit.productos || []).some(
                            (p) => p.id === prod.id
                          );
                          return (
                            <div
                              key={prod.id}
                              className={`group relative bg-card rounded-lg border-2 transition-all duration-200 hover:shadow-md h-full flex flex-col ${
                                yaAgregado
                                  ? "border-green-200 bg-green-50"
                                  : "border-gray-200 hover:border-blue-300"
                              }`}
                            >
                              <div className="p-4 flex-1 flex flex-col">
                                <div className="flex items-start justify-between mb-3">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-3 mb-2">
                                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold bg-blue-100 text-blue-700">
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
                                        {prod.categoria === "Maderas" && (
                                          <div className="flex flex-wrap gap-2 mt-1 text-xs items-center">
                                            <span className="font-medium text-gray-500">
                                              Dimensiones:
                                            </span>
                                            <span>
                                              Alto:{" "}
                                              <span className="font-bold">
                                                {prod.alto}
                                              </span>{" "}
                                            </span>
                                            <span>
                                              Ancho:{" "}
                                              <span className="font-bold">
                                                {prod.ancho}
                                              </span>{" "}
                                            </span>
                                            <span>
                                              Largo:{" "}
                                              <span className="font-bold">
                                                {prod.largo}
                                              </span>{" "}
                                            </span>
                                            <span>
                                              $/pie:{" "}
                                              <div className="inline-flex items-center gap-1">
                                                <input
                                                  type="number"
                                                  min="0"
                                                  step="0.01"
                                                  value={prod.precioPorPie}
                                                  onChange={(e) =>
                                                    handlePrecioPorPieChange(
                                                      prod.id,
                                                      e.target.value
                                                    )
                                                  }
                                                  className="w-20 text-center border border-blue-300 rounded px-2 py-1 text-xs font-bold bg-blue-50 focus:bg-white focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                                                  disabled={loadingPrecios}
                                                  placeholder="0.00"
                                                  title="Editar precio por pie"
                                                />
                                                <svg
                                                  className="w-3 h-3 text-blue-500"
                                                  fill="none"
                                                  stroke="currentColor"
                                                  viewBox="0 0 24 24"
                                                >
                                                  <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    strokeWidth="2"
                                                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                                  />
                                                </svg>
                                              </div>
                                            </span>
                                            {prod.stock <= 0 && (
                                              <span className="text-red-600 font-semibold ml-2">
                                                ¡Sin stock! Se permitirá avanzar
                                                igual.
                                              </span>
                                            )}
                                            {prod.stock > 0 &&
                                              prod.stock <= 3 && (
                                                <span className="text-yellow-600 font-semibold ml-2">
                                                  Stock bajo: quedan{" "}
                                                  {prod.stock} unidades.
                                                </span>
                                              )}
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
                                    <div className="grid grid-cols-2 gap-4 text-xs ">
                                      <div>
                                        <span className="font-medium">
                                          Precio:
                                        </span>
                                        <span className="ml-1 font-bold text-blue-600">
                                          $
                                          {prod.precioPorPie ||
                                            prod.valorVenta ||
                                            prod.precioUnidad ||
                                            0}
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
                                    </div>
                                  </div>
                                </div>

                                {/* Controles de acción al final */}
                                <div className="mt-auto">
                                  {yaAgregado ? (
                                    <div className="flex items-center gap-2">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setVentaEdit((prev) => ({
                                            ...prev,
                                            productos: prev.productos.map((p) =>
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
                                          ventaEdit.productos.find(
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
                                          ventaEdit.productos.find(
                                            (p) => p.id === prod.id
                                          )?.cantidad || 1
                                        }
                                        onChange={(e) =>
                                          setVentaEdit((prev) => ({
                                            ...prev,
                                            productos: prev.productos.map((p) =>
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
                                          setVentaEdit((prev) => ({
                                            ...prev,
                                            productos: prev.productos.map((p) =>
                                              p.id === prod.id
                                                ? {
                                                    ...p,
                                                    cantidad: p.cantidad + 1,
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
                                          setVentaEdit((prev) => ({
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
                                        setVentaEdit((prev) => ({
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
                                                Number(prod.precioPorPie) || 0,
                                              cepilladoAplicado: false, // Agregar propiedad por defecto
                                              tipoMadera: prod.tipoMadera || "",
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
              {(ventaEdit.productos || []).length > 0 && (
                <section className="bg-card rounded-lg p-4 border border-default-200 shadow-sm mt-4">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-default-900">
                      Productos Seleccionados
                    </h3>
                    <span className="text-sm text-default-600">
                      {(ventaEdit.productos || []).length} producto
                      {(ventaEdit.productos || []).length !== 1 ? "s" : ""}
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
                            Precio unit.
                          </th>
                          <th className="h-14 px-4 ltr:text-left rtl:text-right last:ltr:text-right last:rtl:text-left align-middle font-semibold text-sm text-default-800 capitalize [&:has([role=checkbox])]:ltr:pr-0 [&:has([role=checkbox])]:rtl:pl-0">
                            Desc.
                          </th>
                          <th className="h-14 px-4 ltr:text-left rtl:text-right last:ltr:text-right last:rtl:text-left align-middle font-semibold text-sm text-default-800 capitalize [&:has([role=checkbox])]:ltr:pr-0 [&:has([role=checkbox])]:rtl:pl-0">
                            Subtotal
                          </th>
                          <th className="h-14 px-4 ltr:text-left rtl:text-right last:ltr:text-right last:rtl:text-left align-middle font-semibold text-sm text-default-800 capitalize [&:has([role=checkbox])]:ltr:pr-0 [&:has([role=checkbox])]:rtl:pl-0">
                            Cepillado
                          </th>
                          <th className="h-14 px-4 ltr:text-left rtl:text-right last:ltr:text-right last:rtl:text-left align-middle font-semibold text-sm text-default-800 capitalize [&:has([role=checkbox])]:ltr:pr-0 [&:has([role=checkbox])]:rtl:pl-0">
                            Acción
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {(ventaEdit.productos || []).map((p, idx) => (
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
                              {/* Información específica por categoría */}
                              {p.categoria === "Maderas" && p.tipoMadera && (
                                <div className="flex items-center gap-1 mt-1">
                                  <span className="text-xs text-orange-600 font-medium">
                                    🌲 {p.tipoMadera}
                                  </span>
                                </div>
                              )}
                              {p.categoria === "Ferretería" &&
                                p.subCategoria && (
                                  <div className="flex items-center gap-1 mt-1">
                                    <span className="text-xs text-blue-600 font-medium">
                                      🔧 {p.subCategoria}
                                    </span>
                                  </div>
                                )}
                              {p.categoria === "Maderas" && (
                                <div className="flex flex-wrap gap-2 mt-1 text-xs items-center">
                                  <span className="font-medium text-gray-500">
                                    Dimensiones:
                                  </span>
                                  <span>
                                    Alto:{" "}
                                    <span className="font-bold">{p.alto}</span>{" "}
                                  </span>
                                  <span>
                                    Ancho:{" "}
                                    <span className="font-bold">{p.ancho}</span>{" "}
                                  </span>
                                  <span>
                                    Largo:{" "}
                                    <span className="font-bold">{p.largo}</span>{" "}
                                  </span>
                                  <span>
                                    $/pie:{" "}
                                    <div className="inline-flex items-center gap-1">
                                      <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={p.precioPorPie}
                                        onChange={(e) =>
                                          handlePrecioPorPieChange(
                                            p.id,
                                            e.target.value
                                          )
                                        }
                                        className="w-20 text-center border border-blue-300 rounded px-2 py-1 text-xs font-bold bg-blue-50 focus:bg-white focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                                        disabled={loadingPrecios}
                                        placeholder="0.00"
                                        title="Editar precio por pie"
                                      />
                                      <svg
                                        className="w-3 h-3 text-blue-500"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                      >
                                        <path
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          strokeWidth="2"
                                          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                        />
                                      </svg>
                                    </div>
                                  </span>
                                  {p.stock <= 0 && (
                                    <span className="text-red-600 font-semibold ml-2">
                                      ¡Sin stock! Se permitirá avanzar igual.
                                    </span>
                                  )}
                                  {p.stock > 0 && p.stock <= 3 && (
                                    <span className="text-yellow-600 font-semibold ml-2">
                                      Stock bajo: quedan {p.stock} unidades.
                                    </span>
                                  )}
                                </div>
                              )}
                            </td>
                            <td className="p-4 align-middle text-sm text-default-600 last:text-right last:rtl:text-left font-normal [&:has([role=checkbox])]:ltr:pr-0 [&:has([role=checkbox])]:rtl:pl-0">
                              <div className="flex items-center justify-center">
                                <div className="flex items-center border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden bg-white dark:bg-gray-700">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleDecrementarCantidad(p.id)
                                    }
                                    disabled={loadingPrecios || p.cantidad <= 1}
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
                                      handleCantidadChange(p.id, e.target.value)
                                    }
                                    className="w-16 text-center font-bold border-0 bg-transparent focus:ring-0 focus:outline-none text-gray-900 dark:text-gray-100"
                                    disabled={loadingPrecios}
                                  />

                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleIncrementarCantidad(p.id)
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
                              ${formatearNumeroArgentino(p.precio)}
                            </td>
                            <td className="p-4 align-middle text-sm text-default-600 last:text-right last:rtl:text-left font-normal [&:has([role=checkbox])]:ltr:pr-0 [&:has([role=checkbox])]:rtl:pl-0">
                              <input
                                type="number"
                                min={0}
                                max={100}
                                value={p.descuento || 0}
                                onChange={(e) =>
                                  handleDescuentoChange(p.id, e.target.value)
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
                              {p.categoria === "Maderas" ? (
                                <div className="flex items-center justify-center">
                                  <input
                                    type="checkbox"
                                    checked={p.cepilladoAplicado || false}
                                    onChange={(e) => {
                                      recalcularPreciosMadera(
                                        p.id,
                                        e.target.checked
                                      );
                                    }}
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
                              <button
                                type="button"
                                onClick={() => handleQuitarProducto(p.id)}
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
              {(ventaEdit.productos || []).length > 0 && (
                <div className="flex flex-col items-end gap-2 mt-4">
                  <div className="bg-primary/5 border border-primary/20 rounded-lg px-6 py-3 flex flex-col md:flex-row gap-4 md:gap-8 text-lg shadow-sm w-full md:w-auto font-semibold">
                    <div>
                      Subtotal:{" "}
                      <span className="font-bold">
                        $
                        {ventaEdit.productos
                          .reduce(
                            (acc, p) =>
                              acc + Number(p.precio) * Number(p.cantidad),
                            0
                          )
                          .toFixed(2)}
                      </span>
                    </div>
                    <div>
                      Descuento:{" "}
                      <span className="font-bold">
                        $
                        {ventaEdit.productos
                          .reduce(
                            (acc, p) =>
                              acc +
                              Number(p.precio) *
                                Number(p.cantidad) *
                                (Number(p.descuento || 0) / 100),
                            0
                          )
                          .toFixed(2)}
                      </span>
                    </div>
                    {ventaEdit.tipoEnvio &&
                      ventaEdit.tipoEnvio !== "retiro_local" &&
                      Number(ventaEdit.costoEnvio) > 0 && (
                        <div>
                          Costo de envío:{" "}
                          <span className="font-bold">
                            ${Number(ventaEdit.costoEnvio).toFixed(2)}
                          </span>
                        </div>
                      )}
                    <div>
                      Total:{" "}
                      <span className="font-bold text-primary">
                        $
                        {(
                          ventaEdit.productos.reduce(
                            (acc, p) =>
                              acc + Number(p.precio) * Number(p.cantidad),
                            0
                          ) -
                          ventaEdit.productos.reduce(
                            (acc, p) =>
                              acc +
                              Number(p.precio) *
                                Number(p.cantidad) *
                                (Number(p.descuento || 0) / 100),
                            0
                          ) +
                          (ventaEdit.tipoEnvio &&
                          ventaEdit.tipoEnvio !== "retiro_local"
                            ? Number(ventaEdit.costoEnvio) || 0
                            : 0)
                        ).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {(() => {
                // Calcula el saldo pendiente en modo edición con lógica mejorada
                const subtotal = (ventaEdit.productos || []).reduce(
                  (acc, p) => acc + Number(p.precio) * Number(p.cantidad),
                  0
                );
                const descuento = (ventaEdit.productos || []).reduce(
                  (acc, p) =>
                    acc +
                    Number(p.precio) *
                      Number(p.cantidad) *
                      (Number(p.descuento || 0) / 100),
                  0
                );

                // Calcular costo de envío basado en el tipo de envío actual
                const envio =
                  ventaEdit.tipoEnvio && ventaEdit.tipoEnvio !== "retiro_local"
                    ? Number(ventaEdit.costoEnvio) || 0
                    : 0;

                const total = subtotal - descuento + envio;
                const abonado = Array.isArray(ventaEdit.pagos)
                  ? ventaEdit.pagos.reduce((acc, p) => acc + Number(p.monto), 0)
                  : Number(ventaEdit.montoAbonado || 0);
                const saldo = total - abonado;

                console.log("=== CÁLCULO SALDO PENDIENTE ===");
                console.log("Subtotal:", subtotal);
                console.log("Descuento:", descuento);
                console.log("Tipo envío:", ventaEdit.tipoEnvio);
                console.log("Costo envío:", envio);
                console.log("Total:", total);
                console.log("Abonado:", abonado);
                console.log("Saldo pendiente:", saldo);

                if (saldo > 0) {
                  return (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 my-4">
                      <h4 className="font-semibold text-yellow-800 mb-2">
                        Saldo pendiente: ${saldo.toFixed(2)}
                      </h4>
                      <div className="text-sm text-yellow-700 mb-3">
                        <div>Subtotal: ${subtotal.toFixed(2)}</div>
                        <div>Descuento: ${descuento.toFixed(2)}</div>
                        {envio > 0 && (
                          <div>Costo envío: ${envio.toFixed(2)}</div>
                        )}
                        <div className="font-bold">
                          Total: ${total.toFixed(2)}
                        </div>
                        <div>Abonado: ${abonado.toFixed(2)}</div>
                      </div>
                      <div className="flex flex-col md:flex-row gap-2 items-end">
                        <input
                          type="number"
                          min={1}
                          max={saldo}
                          placeholder="Monto a abonar"
                          className="border rounded px-2 py-1"
                          value={ventaEdit.nuevoPagoMonto || ""}
                          onChange={(e) =>
                            setVentaEdit((prev) => ({
                              ...prev,
                              nuevoPagoMonto: e.target.value,
                            }))
                          }
                          disabled={registrandoPago}
                        />
                        <select
                          className="border rounded px-2 py-1"
                          value={ventaEdit.nuevoPagoMetodo || ""}
                          onChange={(e) =>
                            setVentaEdit((prev) => ({
                              ...prev,
                              nuevoPagoMetodo: e.target.value,
                            }))
                          }
                          disabled={registrandoPago}
                        >
                          <option value="">Método de pago</option>
                          <option value="efectivo">Efectivo</option>
                          <option value="transferencia">Transferencia</option>
                          <option value="tarjeta">Tarjeta</option>
                          <option value="cheque">Cheque</option>
                          <option value="otro">Otro</option>
                        </select>
                        <button
                          type="button"
                          className={`bg-green-600 text-white px-4 py-1 rounded flex items-center gap-2 ${
                            registrandoPago
                              ? "opacity-70 cursor-not-allowed"
                              : ""
                          }`}
                          onClick={async () => {
                            setRegistrandoPago(true);
                            // Simular un pequeño delay para UX
                            await new Promise((res) => setTimeout(res, 600));
                            if (Array.isArray(ventaEdit.pagos)) {
                              setVentaEdit((prev) => ({
                                ...prev,
                                pagos: [
                                  ...prev.pagos,
                                  {
                                    fecha: new Date()
                                      .toISOString()
                                      .split("T")[0],
                                    monto: Number(prev.nuevoPagoMonto),
                                    metodo: prev.nuevoPagoMetodo,
                                    usuario: "usuario", // puedes poner el usuario real si lo tienes
                                  },
                                ],
                                nuevoPagoMonto: "",
                                nuevoPagoMetodo: "",
                              }));
                            } else {
                              setVentaEdit((prev) => ({
                                ...prev,
                                montoAbonado:
                                  Number(prev.montoAbonado || 0) +
                                  Number(prev.nuevoPagoMonto),
                                nuevoPagoMonto: "",
                                nuevoPagoMetodo: "",
                              }));
                            }
                            setPagoExitoso(true);
                            setRegistrandoPago(false);
                            setTimeout(() => setPagoExitoso(false), 2200);
                          }}
                          disabled={
                            registrandoPago ||
                            !ventaEdit.nuevoPagoMonto ||
                            !ventaEdit.nuevoPagoMetodo ||
                            Number(ventaEdit.nuevoPagoMonto) <= 0 ||
                            Number(ventaEdit.nuevoPagoMonto) > saldo
                          }
                        >
                          {registrandoPago && (
                            <svg
                              className="animate-spin h-5 w-5 mr-1 text-white"
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
                          )}
                          {registrandoPago
                            ? "Registrando..."
                            : "Registrar pago"}
                        </button>
                      </div>
                      {pagoExitoso && (
                        <div className="mt-3 px-4 py-2 rounded bg-green-100 text-green-800 font-semibold shadow text-center animate-fade-in">
                          ¡Pago registrado exitosamente!
                        </div>
                      )}
                    </div>
                  );
                }
                return null;
              })()}
              <div className="flex flex-wrap gap-2 mt-6">
                <Button
                  variant="default"
                  onClick={handleGuardarCambios}
                  disabled={loadingPrecios}
                  className="no-print flex-1 lg:flex-none text-sm lg:text-base"
                >
                  <span className="hidden sm:inline">Guardar cambios</span>
                  <span className="sm:hidden">💾</span>
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setEditando(false)}
                  disabled={loadingPrecios}
                  className="no-print flex-1 lg:flex-none text-sm lg:text-base"
                >
                  <span className="hidden sm:inline">Cancelar</span>
                  <span className="sm:hidden">❌</span>
                </Button>
              </div>
              {errorForm && (
                <div className="text-red-500 mt-2">{errorForm}</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default VentaDetalle;
