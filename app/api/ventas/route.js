import { NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { collection, addDoc, query, where, getDocs, limit } from "firebase/firestore";

function normalizePaymentMethod(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "efectivo";
  if (["efectivo", "cash"].includes(raw)) return "efectivo";
  if (["mercado pago", "mercadopago", "mercado_pago", "mp"].includes(raw)) return "mercado_pago";
  if (["debito", "débito", "debit", "tarjeta_debito", "tarjeta-debito"].includes(raw)) return "debito";
  if (["transferencia", "transfer", "bank_transfer"].includes(raw)) return "transferencia";
  return raw;
}

function normalizeShippingType(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  if (["retiro", "pickup", "retiro_en_sucursal", "retira", "retira_en_local"].includes(raw)) {
    return "retiro";
  }
  if (["domicilio", "delivery", "envio", "envío"].includes(raw)) return "domicilio";
  return raw;
}

function normalizeShippingStatus(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "pendiente";
  if (["a_cotizar", "a-cotizar", "cotizar"].includes(raw)) return "a_cotizar";
  return raw;
}

function parseNullableNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function withCors(resp) {
  const headers = new Headers(resp.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "POST,OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  return new NextResponse(resp.body, { status: resp.status, headers });
}

export function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

// POST /api/ventas - Recibir ventas del ecommerce externo
export async function POST(request) {
  try {
    console.log("API /api/ventas llamada");

    // Validar Content-Type
    const contentType = request.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      return withCors(
        NextResponse.json(
          {
            success: false,
            error: "Content-Type debe ser application/json",
            code: "INVALID_CONTENT_TYPE"
          },
          { status: 400 }
        )
      );
    }

    // Parsear el body
    const body = await request.json();
    console.log("Datos recibidos:", JSON.stringify(body, null, 2));

    // Validar estructura básica
    if (!body.success || !body.data || !Array.isArray(body.data)) {
      return withCors(
        NextResponse.json(
          {
            success: false,
            error: "Estructura de datos inválida. Se espera {success: true, data: []}",
            code: "INVALID_DATA_STRUCTURE"
          },
          { status: 400 }
        )
      );
    }

    const ventas = body.data;
    
    if (ventas.length === 0) {
      return withCors(
        NextResponse.json(
          {
            success: false,
            error: "No se recibieron ventas para procesar",
            code: "NO_VENTAS"
          },
          { status: 400 }
        )
      );
    }

    // Validar usuario
    if (!body.usuario || !body.usuario.email) {
      return withCors(
        NextResponse.json(
          {
            success: false,
            error: "Email de usuario requerido",
            code: "MISSING_USER_EMAIL"
          },
          { status: 400 }
        )
      );
    }

    const emailUsuario = body.usuario.email;
    console.log("Procesando ventas para usuario:", emailUsuario);

    const ventasGuardadas = [];
    const errores = [];

    // Generador correlativo de número de pedido (VENTA-00001, etc.)
    const getNextVentaNumber = async () => {
      const snap = await getDocs(collection(db, "ventas"));
      let maxNum = 0;
      snap.docs.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.numeroPedido && String(data.numeroPedido).startsWith("VENTA-")) {
          const num = parseInt(String(data.numeroPedido).replace("VENTA-", ""), 10);
          if (!isNaN(num) && num > maxNum) maxNum = num;
        }
      });
      return `VENTA-${String(maxNum + 1).padStart(5, "0")}`;
    };

    // Procesar cada venta
    for (const ventaData of ventas) {
      try {
        // Validar campos requeridos de la venta (numeroPedido se genera si falta)
        const camposRequeridos = ['estado', 'total', 'fecha'];
        const camposFaltantes = camposRequeridos.filter(campo => !ventaData[campo]);
        
        if (camposFaltantes.length > 0) {
          errores.push({
            numeroPedido: ventaData.numeroPedido || 'N/A',
            error: `Campos faltantes: ${camposFaltantes.join(', ')}`,
            code: "MISSING_REQUIRED_FIELDS"
          });
          continue;
        }

        // Validar productos
        if (!ventaData.productos || !Array.isArray(ventaData.productos) || ventaData.productos.length === 0) {
          errores.push({
            numeroPedido: ventaData.numeroPedido,
            error: "La venta debe tener al menos un producto",
            code: "NO_PRODUCTS"
          });
          continue;
        }

        // Validar cliente
        if (!ventaData.cliente || !ventaData.cliente.nombre) {
          errores.push({
            numeroPedido: ventaData.numeroPedido,
            error: "Información de cliente requerida",
            code: "MISSING_CLIENT_INFO"
          });
          continue;
        }

        // Idempotencia básica: si viene un ID externo, evitar duplicados por idExterno
        if (ventaData.id) {
          const dupByExternalIdQ = query(
            collection(db, "ventas"),
            where("idExterno", "==", ventaData.id),
            limit(1)
          );
          const dupByExternalIdSnap = await getDocs(dupByExternalIdQ);
          if (!dupByExternalIdSnap.empty) {
            console.log(`Venta con idExterno ${ventaData.id} ya existe, omitiendo...`);
            ventasGuardadas.push({
              id: dupByExternalIdSnap.docs[0].id,
              numeroPedido: dupByExternalIdSnap.docs[0].data()?.numeroPedido || null,
              status: "already_exists"
            });
            continue;
          }
        }

        // Generar número de pedido correlativo (siempre interno)
        const numeroPedidoFinal = await getNextVentaNumber();

        // Fecha legible en formato argentino DD/MM/YYYY HH:mm (24h)
        const ahora = new Date();
        const fechaLegible =
          ahora.toLocaleDateString("es-AR", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
          }) +
          " " +
          ahora.toLocaleTimeString("es-AR", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          });

        // Calcular/normalizar totales y campos monetarios
        const subtotalCalculado =
          Array.isArray(ventaData.productos)
            ? ventaData.productos.reduce((sum, p) => {
                const precio = Number(p.precio) || 0;
                const cantidad = Number(p.cantidad) || 0;
                return sum + precio * cantidad;
              }, 0)
            : 0;
        const subtotal = Number(ventaData.subtotal) || subtotalCalculado;
        const descuentos = Number(ventaData.descuentos ?? ventaData.descuentoTotal) || 0;
        const descuentoTotal = descuentos; // Compatibilidad con estructura histórica.
        const descuentoEfectivo = Number(ventaData.descuentoEfectivo) || 0;
        const medioPagoOriginal = normalizePaymentMethod(ventaData.medioPago);
        const tipoEnvioOriginal = normalizeShippingType(
          ventaData.envio?.tipoEnvio || (ventaData.envio ? "domicilio" : "")
        );
        const estadoEnvioOriginal = normalizeShippingStatus(ventaData.envio?.estado);
        const costoEnvioOriginal =
          Number(ventaData.envio?.costoEnvio) ||
          Number(ventaData.envio?.costo) ||
          0;
        const direccionEnvioOriginal = ventaData.envio?.direccion || "";
        const transportistaOriginal = ventaData.envio?.transportista || "";
        const totalSinEfectivo =
          parseNullableNumber(ventaData.totalSinEfectivo) ??
          Math.max(0, subtotal - descuentos + costoEnvioOriginal);
        const totalConEfectivo =
          parseNullableNumber(ventaData.totalConEfectivo) ??
          (descuentoEfectivo > 0 ? Math.max(0, totalSinEfectivo - descuentoEfectivo) : null);
        const motivoPendienteRaw =
          ventaData.motivoPendiente ?? ventaData.envio?.motivoPendiente ?? null;
        const motivoPendiente = motivoPendienteRaw
          ? String(motivoPendienteRaw).trim().toLowerCase()
          : null;
        const pendienteLogistica = Boolean(
          motivoPendiente && /logistic|logístic|logistica/.test(motivoPendiente)
        );

        let medioPago = medioPagoOriginal;
        let tipoEnvio = tipoEnvioOriginal;
        let estadoEnvio = estadoEnvioOriginal;
        let costoEnvio = costoEnvioOriginal;
        let direccionEnvio = direccionEnvioOriginal;
        let transportista = transportistaOriginal;

        // Regla ecommerce: en pendientes por logística se reporta efectivo + envío a cotizar.
        if (pendienteLogistica) {
          medioPago = "efectivo";
          estadoEnvio = "a_cotizar";
          tipoEnvio = "domicilio";
        }

        // Regla ecommerce: pago efectivo implica retiro (sin envío), salvo excepción logística.
        if (!pendienteLogistica && medioPago === "efectivo") {
          tipoEnvio = "retiro";
          estadoEnvio = "pendiente";
        }

        const envioDomicilioConPagoInvalido =
          tipoEnvio === "domicilio" &&
          !["mercado_pago", "debito"].includes(medioPago) &&
          !pendienteLogistica;

        if (envioDomicilioConPagoInvalido) {
          errores.push({
            numeroPedido: ventaData.numeroPedido || "N/A",
            error: "Para envío a domicilio solo se permite Mercado Pago o débito",
            code: "INVALID_PAYMENT_FOR_SHIPPING"
          });
          continue;
        }

        if (tipoEnvio === "retiro") {
          costoEnvio = 0;
          direccionEnvio = "";
          transportista = "";
        }

        const pagoEnEfectivo =
          Boolean(ventaData.pagoEnEfectivo) ||
          medioPago === "efectivo" ||
          medioPago === "transferencia";

        // Preparar datos para Firestore
        const ventaParaFirestore = {
          // Información básica
          numeroPedido: numeroPedidoFinal,
          estadoPago: ventaData.estado || "pendiente",
          total: ventaData.total,
          subtotal,
          descuentos,
          descuentoTotal,
          descuentoEfectivo,
          totalSinEfectivo,
          totalConEfectivo,
          pagoEnEfectivo,
          motivoPendiente,
          fecha: fechaLegible,
          fechaEntrega: ventaData.fechaEntrega || null,
          formaPago: medioPago,
          vendedor: "ecommerce",
          
          // Cliente
          cliente: {
            email: emailUsuario,
            nombre: ventaData.cliente.nombre,
            telefono: ventaData.cliente.telefono || "",
            direccion: direccionEnvio
          },
          
          // Productos (mantener estructura original)
          productos: ventaData.productos.map(producto => ({
            id: producto.id || "",
            nombre: producto.nombre || "",
            cantidad: producto.cantidad || 0,
            precio: producto.precio || 0,
            unidad: producto.unidad || producto.unidadMedida || producto.unit || "",
            unidadMedida: producto.unidadMedida || producto.unidad || producto.unit || "",
            categoria: producto.categoria || "",
            imagen: producto.imagen || "",
            // Dimensiones para maderas
            alto: producto.alto || 0,
            ancho: producto.ancho || 0,
            largo: producto.largo || 0
          })),
          
          // Información de envío
          estadoEnvio,
          direccionEnvio,
          transportista,
          tipoEnvio,
          costoEnvio,
          fechaEntregaEnvio: ventaData.envio?.fechaEntrega || null,
          
          // Metadatos
          origen: "ecommerce_externo",
          creadoEn: new Date().toISOString(),
          fechaCreacion: new Date().toISOString(),
          actualizadoEn: new Date().toISOString(),
          
          // ID original del ecommerce externo (si existe)
          idExterno: ventaData.id || null
        };

        // Guardar en Firestore
        const docRef = await addDoc(collection(db, "ventas"), ventaParaFirestore);
        
        console.log(`Venta ${numeroPedidoFinal} guardada con ID:`, docRef.id);
        
        ventasGuardadas.push({
          id: docRef.id,
          numeroPedido: numeroPedidoFinal,
          status: "created"
        });

      } catch (ventaError) {
        console.error(`Error procesando venta ${ventaData.numeroPedido}:`, ventaError);
        errores.push({
          numeroPedido: ventaData.numeroPedido || 'N/A',
          error: ventaError.message,
          code: "VENTA_PROCESSING_ERROR"
        });
      }
    }

    // Preparar respuesta
    const respuesta = {
      success: true,
      message: `Procesadas ${ventasGuardadas.length} ventas correctamente`,
      ventas: ventasGuardadas,
      total: ventasGuardadas.length,
      usuario: {
        email: emailUsuario
      }
    };

    // Agregar errores si los hay
    if (errores.length > 0) {
      respuesta.errores = errores;
      respuesta.message += `, ${errores.length} errores encontrados`;
    }

    console.log("Respuesta final:", respuesta);

    return withCors(NextResponse.json(respuesta));

  } catch (err) {
    console.error("Error en /api/ventas:", {
      message: err.message,
      stack: err.stack
    });

    // Manejar errores específicos
    if (err.code === "permission-denied") {
      return withCors(
        NextResponse.json(
          {
            success: false,
            error: "Error de permisos en la base de datos",
            code: "PERMISSION_DENIED"
          },
          { status: 403 }
        )
      );
    }

    if (err.code === "unavailable") {
      return withCors(
        NextResponse.json(
          {
            success: false,
            error: "Base de datos no disponible",
            code: "DATABASE_UNAVAILABLE"
          },
          { status: 503 }
        )
      );
    }

    // Error genérico
    return withCors(
      NextResponse.json(
        {
          success: false,
          error: "Error interno del servidor",
          code: "INTERNAL_SERVER_ERROR",
          details: err.message
        },
        { status: 500 }
      )
    );
  }
}
