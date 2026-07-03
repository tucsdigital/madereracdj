import { NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import {
  collection,
  query,
  where,
  getDocs,
  orderBy,
  limit,
  doc,
  getDoc,
  setDoc,
  runTransaction,
} from "firebase/firestore";
import crypto from "crypto";

function normalizePaymentMethod(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  if (["efectivo", "cash"].includes(raw)) return "efectivo";
  if (["transferencia", "transfer", "bank_transfer"].includes(raw)) return "transferencia";
  return raw;
}

function parseNullableNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeShippingType(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  if (["retiro", "pickup", "retiro_en_sucursal", "retira", "retira_en_local"].includes(raw)) {
    return "retiro";
  }
  if (["envio", "envío", "domicilio", "delivery"].includes(raw)) return "domicilio";
  return raw;
}

function mapEstadoPagoFromOrderStatus(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (["success", "paid", "approved", "pagado"].includes(raw)) return "pagado";
  if (["partial", "parcial"].includes(raw)) return "parcial";
  return "pendiente";
}

function formatFechaLegible(value = new Date()) {
  const d = value instanceof Date ? value : new Date(value);
  const safe = isNaN(d.getTime()) ? new Date() : d;
  return (
    safe.toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }) +
    " " +
    safe.toLocaleTimeString("es-AR", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
  );
}

function parseVentaNumero(value) {
  const raw = String(value || "").trim();
  const m = raw.match(/^VENTA-(\d+)$/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

async function ensureVentasCounterUpToDate(nowIso) {
  const counterRef = doc(db, "counters", "ventasNumero");
  const counterSnap = await getDoc(counterRef);
  const counterLast = counterSnap.exists() ? Number(counterSnap.data()?.last || 0) : 0;

  let maxFromVentas = 0;
  try {
    const ventasSnap = await getDocs(
      query(collection(db, "ventas"), orderBy("numeroPedido", "desc"), limit(50))
    );
    for (const d of ventasSnap.docs) {
      const n = parseVentaNumero(d.data()?.numeroPedido);
      if (n && n > maxFromVentas) maxFromVentas = n;
    }
  } catch {}

  const desired = Math.max(counterLast, maxFromVentas);
  if (!counterSnap.exists() || desired !== counterLast) {
    await setDoc(counterRef, { last: desired, updatedAt: nowIso }, { merge: true });
  }
}

function withCors(resp) {
  const headers = new Headers(resp.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization,X-Api-Key,X-Request-Timestamp,X-Request-Hash,X-Request-Signature"
  );
  return new NextResponse(resp.body, { status: resp.status, headers });
}

export function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

// GET /api/orders?userId={email}
export async function GET(request) {
  let userId = null;
  try {
    const { searchParams } = new URL(request.url);
    userId = searchParams.get("userId");

    console.log("API /api/orders llamada con userId:", userId);

    if (!userId) {
      return withCors(
        NextResponse.json(
          {
            error: "userId (email) requerido",
          },
          { status: 400 }
        )
      );
    }

    if (!userId.includes("@")) {
      return withCors(
        NextResponse.json(
          {
            error: "userId debe ser un email válido",
            userId,
          },
          { status: 400 }
        )
      );
    }

    const ventasQuery = query(collection(db, "ventas"), where("cliente.email", "==", userId));
    const ventasSnap = await getDocs(ventasQuery);

    const ventasDocs = ventasSnap.docs.sort((a, b) => {
      const fechaA = a.data().fecha || a.data().creadoEn || "";
      const fechaB = b.data().fecha || b.data().creadoEn || "";
      return fechaB.localeCompare(fechaA);
    });

    const ventas = [];
    for (const ventaDoc of ventasDocs) {
      const venta = ventaDoc.data();

      let envio = null;
      try {
        const envioQuery = query(
          collection(db, "envios"),
          where("numeroPedido", "==", venta.numeroPedido),
          limit(1)
        );
        const envioSnap = await getDocs(envioQuery);
        if (!envioSnap.empty) {
          const envioData = envioSnap.docs[0].data();
          envio = {
            id: envioSnap.docs[0].id,
            estado: envioData.estado || "pendiente",
            fechaEntrega: envioData.fechaEntrega || null,
            fechaCreacion: envioData.fechaCreacion || null,
            fechaActualizacion: envioData.fechaActualizacion || null,
            direccionEnvio: envioData.direccionEnvio || venta.cliente?.direccion || "",
            localidadEnvio: envioData.localidadEnvio || "",
            tipoEnvio: envioData.tipoEnvio || "",
            transportista: envioData.transportista || "",
            costoEnvio: envioData.costoEnvio || 0,
            prioridad: envioData.prioridad || "",
            historialEstados: envioData.historialEstados || [],
            creadoPor: envioData.creadoPor || "",
            ventaId: envioData.ventaId || "",
          };
        }
      } catch (envioError) {
        console.log("Error al buscar envío:", envioError.message);
      }

      ventas.push({
        id: ventaDoc.id,
        numeroPedido: venta.numeroPedido || ventaDoc.id,
        estado: venta.estadoPago || "pendiente",
        total: venta.total || 0,
        subtotal: Number(venta.subtotal) || 0,
        descuentos: Number(venta.descuentos ?? venta.descuentoTotal) || 0,
        descuentoEfectivo: Number(venta.descuentoEfectivo) || 0,
        totalSinEfectivo: parseNullableNumber(venta.totalSinEfectivo),
        totalConEfectivo: parseNullableNumber(venta.totalConEfectivo),
        motivoPendiente: venta.motivoPendiente || null,
        fecha: venta.fecha || null,
        fechaEntrega: venta.fechaEntrega || null,
        medioPago: venta.formaPago || "efectivo",
        productos: await Promise.all(
          (venta.productos || venta.items || []).map(async (producto) => {
            let imagen = "";
            try {
              const productoQuery = query(
                collection(db, "productos"),
                where("id", "==", producto.id),
                limit(1)
              );
              const productoSnap = await getDocs(productoQuery);
              if (!productoSnap.empty) {
                const productoData = productoSnap.docs[0].data();
                imagen =
                  productoData.imagenes && productoData.imagenes.length > 0
                    ? productoData.imagenes[0]
                    : "";
              }
            } catch (productoError) {
              console.log("Error al buscar imagen del producto:", productoError.message);
            }

            return {
              id: producto.id || "",
              nombre: producto.nombre || "",
              cantidad: producto.cantidad || 0,
              precio: producto.precio || 0,
              unidad: producto.unidad || producto.unidadMedida || producto.unit || "",
              unidadMedida: producto.unidadMedida || producto.unidad || producto.unit || "",
              categoria: producto.categoria || "",
              imagen,
              ...(producto.categoria === "Maderas" && {
                alto: producto.alto || 0,
                ancho: producto.ancho || 0,
                largo: producto.largo || 0,
              }),
            };
          })
        ),
        envio: {
          estado: envio?.estado || "pendiente",
          direccion: envio?.direccionEnvio || venta.direccionEnvio || venta.cliente?.direccion || "",
          transportista: envio?.transportista || venta.transportista || "",
          fechaEntrega: envio?.fechaEntrega || venta.fechaEntrega || null,
        },
        cliente: {
          nombre: venta.cliente?.nombre || "",
          telefono: venta.cliente?.telefono || "",
        },
      });
    }

    if (ventas.length === 0) {
      return withCors(
        NextResponse.json({
          success: true,
          data: [],
          total: 0,
          mensaje: "No se encontraron ventas para este usuario",
          usuario: {
            email: userId,
          },
        })
      );
    }

    return withCors(
      NextResponse.json({
        success: true,
        data: ventas,
        total: ventas.length,
        usuario: {
          email: userId,
        },
      })
    );
  } catch (err) {
    console.error("Error en /api/orders:", {
      message: err.message,
      code: err.code,
      stack: err.stack,
      userId,
    });

    if (err.code === "permission-denied") {
      return withCors(
        NextResponse.json(
          {
            error: "Error de permisos en la base de datos",
            message: "No se puede acceder a la colección de ventas",
            userId,
          },
          { status: 403 }
        )
      );
    }

    if (err.code === "unavailable") {
      return withCors(
        NextResponse.json(
          {
            error: "Base de datos no disponible",
            message: "Error de conectividad con Firestore",
            userId,
          },
          { status: 503 }
        )
      );
    }

    if (err.code === "failed-precondition") {
      return withCors(
        NextResponse.json(
          {
            error: "Error de índice en la base de datos",
            message: "La consulta requiere un índice que no existe",
            userId,
          },
          { status: 400 }
        )
      );
    }

    return withCors(
      NextResponse.json(
        {
          error: "Error interno del servidor",
          message: "Error al consultar las ventas del usuario",
          details: err.message,
          userId,
        },
        { status: 500 }
      )
    );
  }
}

// POST /api/orders - Crear nueva orden en colección orders
export async function POST(request) {
  try {
    console.log("API POST /api/orders llamada");

    const contentType = request.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      return withCors(
        NextResponse.json(
          {
            success: false,
            error: "Content-Type debe ser application/json",
            code: "INVALID_CONTENT_TYPE",
          },
          { status: 400 }
        )
      );
    }

    const rawBody = await request.text();
    const headers = request.headers || new Headers();
    const apiKeyHeader = String(headers.get("X-Api-Key") || "").trim();
    const tsHeader = String(headers.get("X-Request-Timestamp") || "").trim();
    const hashHeader = String(headers.get("X-Request-Hash") || "").trim();
    const sigHeader = String(headers.get("X-Request-Signature") || "").trim();
    const expectedApiKey = String(process.env.EXTERNAL_API_API_KEY || "").trim();
    const sharedSecret = String(process.env.EXTERNAL_API_SHARED_SECRET || "").trim();
    if (!apiKeyHeader || !expectedApiKey || apiKeyHeader !== expectedApiKey) {
      return withCors(
        NextResponse.json(
          { success: false, error: "invalid_api_key", code: "INVALID_API_KEY" },
          { status: 401 }
        )
      );
    }
    if (hashHeader !== "HMAC-SHA256") {
      return withCors(
        NextResponse.json(
          { success: false, error: "invalid_hash_algo", code: "INVALID_HASH" },
          { status: 400 }
        )
      );
    }
    const ts = Number(tsHeader);
    if (!Number.isFinite(ts)) {
      return withCors(
        NextResponse.json(
          { success: false, error: "invalid_timestamp", code: "INVALID_TIMESTAMP" },
          { status: 400 }
        )
      );
    }
    if (Math.abs(Date.now() - ts) > 300000) {
      return withCors(
        NextResponse.json(
          {
            success: false,
            error: "timestamp_out_of_window",
            code: "TIMESTAMP_OUT_OF_WINDOW",
          },
          { status: 401 }
        )
      );
    }
    if (!sharedSecret) {
      return withCors(
        NextResponse.json(
          {
            success: false,
            error: "server_not_configured",
            code: "SERVER_NOT_CONFIGURED",
          },
          { status: 500 }
        )
      );
    }
    const computed = crypto.createHmac("sha256", sharedSecret).update(`${tsHeader}:${rawBody}`).digest("hex");
    const equalLen = computed.length === sigHeader.length;
    const validSig = equalLen && crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(sigHeader));
    if (!validSig) {
      return withCors(
        NextResponse.json(
          { success: false, error: "invalid_signature", code: "INVALID_SIGNATURE" },
          { status: 401 }
        )
      );
    }

    const orderData = JSON.parse(rawBody || "{}");
    console.log("Datos de orden recibidos:", JSON.stringify(orderData, null, 2));

    const camposRequeridos = ["orderId", "userId", "customerInfo", "deliveryInfo", "items", "total", "status"];
    const camposFaltantes = camposRequeridos.filter((campo) => !orderData[campo]);

    if (camposFaltantes.length > 0) {
      return withCors(
        NextResponse.json(
          {
            success: false,
            error: `Campos requeridos faltantes: ${camposFaltantes.join(", ")}`,
            code: "MISSING_REQUIRED_FIELDS",
          },
          { status: 400 }
        )
      );
    }

    if (!orderData.customerInfo.nombre || !orderData.customerInfo.email) {
      return withCors(
        NextResponse.json(
          {
            success: false,
            error: "customerInfo debe incluir nombre y email",
            code: "INVALID_CUSTOMER_INFO",
          },
          { status: 400 }
        )
      );
    }

    if (!Array.isArray(orderData.items) || orderData.items.length === 0) {
      return withCors(
        NextResponse.json(
          {
            success: false,
            error: "La orden debe tener al menos un item",
            code: "NO_ITEMS",
          },
          { status: 400 }
        )
      );
    }

    for (let i = 0; i < orderData.items.length; i++) {
      const item = orderData.items[i];
      const itemRequired = ["id", "name", "price", "quantity"];
      const itemMissing = itemRequired.filter((field) => item[field] === undefined || item[field] === null);

      if (itemMissing.length > 0) {
        return withCors(
          NextResponse.json(
            {
              success: false,
              error: `Item ${i + 1} faltan campos: ${itemMissing.join(", ")}`,
              code: "INVALID_ITEM",
            },
            { status: 400 }
          )
        );
      }
    }

    const shippingPriceNumber = Number(orderData?.deliveryInfo?.shippingPrice ?? orderData?.shippingPrice ?? 0);
    const shippingTierKmNumber = Number(
      orderData?.deliveryInfo?.shippingTierKm ?? orderData?.shippingTierKm ?? 0
    );
    const shippingPrice = Number.isFinite(shippingPriceNumber) ? shippingPriceNumber : 0;
    const shippingTierKm = Number.isFinite(shippingTierKmNumber) ? shippingTierKmNumber : 0;
    const paymentMethod = normalizePaymentMethod(orderData.paymentMethod || orderData.medioPago || "");
    const pendingReason = orderData.pendingReason
      ? String(orderData.pendingReason).trim().toLowerCase()
      : null;
    const pricing =
      orderData.pricing && typeof orderData.pricing === "object"
        ? {
            subtotal: Number(orderData.pricing.subtotal) || 0,
            productDiscounts: Number(orderData.pricing.productDiscounts) || 0,
            transferDiscount: Number(orderData.pricing.transferDiscount) || 0,
            shipping: Number(orderData.pricing.shipping) || 0,
            total: Number(orderData.pricing.total) || Number(orderData.total) || 0,
          }
        : null;

    let orderRef = doc(db, "orders", orderData.orderId);
    let existingOrder = null;
    const orderSnapByDocId = await getDoc(orderRef);
    if (orderSnapByDocId.exists()) {
      existingOrder = orderSnapByDocId.data();
    } else {
      const orderByQuery = await getDocs(
        query(collection(db, "orders"), where("orderId", "==", orderData.orderId), limit(1))
      );
      if (!orderByQuery.empty) {
        const existingDoc = orderByQuery.docs[0];
        orderRef = doc(db, "orders", existingDoc.id);
        existingOrder = existingDoc.data();
      }
    }

    const createdAtResolved = orderData.createdAt || existingOrder?.createdAt || new Date().toISOString();

    const orderForFirestore = {
      orderId: orderData.orderId,
      userId: orderData.userId,
      total: orderData.total,
      status: orderData.status,
      createdAt: createdAtResolved,
      shippingPrice,
      shippingTierKm,
      paymentMethod: paymentMethod || null,
      pendingReason,
      pricing,
      customerInfo: {
        nombre: orderData.customerInfo.nombre,
        email: orderData.customerInfo.email,
        telefono: orderData.customerInfo.telefono || "",
        dni: orderData.customerInfo.dni || "",
      },
      deliveryInfo: {
        direccion: orderData.deliveryInfo.direccion,
        ciudad: orderData.deliveryInfo.ciudad || "",
        codigoPostal: orderData.deliveryInfo.codigoPostal || "",
        metodoEntrega: orderData.deliveryInfo.metodoEntrega || "",
        shippingPrice,
        shippingTierKm,
      },
      items: orderData.items.map((item) => ({
        id: item.id,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        unidad: item.unidad || item.unidadMedida || item.unit || "",
        unidadMedida: item.unidadMedida || item.unidad || item.unit || "",
        category: item.category || "",
        subcategory: item.subcategory || "",
      })),
      createdBy: "internal_api",
      updatedAt: new Date().toISOString(),
      extras: {
        paymentMethod: paymentMethod || null,
        pricing,
        pendingReason,
      },
    };

    await setDoc(orderRef, orderForFirestore, { merge: true });

    const nowIso = new Date().toISOString();
    await ensureVentasCounterUpToDate(nowIso);
    let ventaResult = null;

    try {
      const ventaExternalRef = doc(db, "ventasExternal", orderData.orderId);
      const counterRef = doc(db, "counters", "ventasNumero");
      const ventasColl = collection(db, "ventas");

      await runTransaction(db, async (tx) => {
        const extSnap = await tx.get(ventaExternalRef);
        if (extSnap.exists()) {
          const linked = extSnap.data() || {};
          ventaResult = {
            id: linked.ventaId || null,
            numeroPedido: linked.numeroPedido || null,
            status: "already_exists",
          };
          tx.set(
            orderRef,
            {
              ventaId: linked.ventaId || null,
              ventaNumeroPedido: linked.numeroPedido || null,
              updatedAt: nowIso,
            },
            { merge: true }
          );
          return;
        }

        const orderSnapTx = await tx.get(orderRef);
        if (orderSnapTx.exists()) {
          const orderTx = orderSnapTx.data() || {};
          const existingVentaId = String(orderTx.ventaId || "").trim();
          const existingNumeroPedido = String(orderTx.ventaNumeroPedido || "").trim();
          if (existingVentaId) {
            let numeroPedidoToUse = existingNumeroPedido || null;
            if (!numeroPedidoToUse) {
              const ventaSnapTx = await tx.get(doc(db, "ventas", existingVentaId));
              if (ventaSnapTx.exists()) {
                const ventaTx = ventaSnapTx.data() || {};
                numeroPedidoToUse = String(ventaTx.numeroPedido || "").trim() || null;
              }
            }
            tx.set(
              ventaExternalRef,
              {
                orderId: orderData.orderId,
                ventaId: existingVentaId,
                numeroPedido: numeroPedidoToUse,
                reconciledAt: nowIso,
                source: "api_orders",
              },
              { merge: true }
            );
            ventaResult = {
              id: existingVentaId,
              numeroPedido: numeroPedidoToUse,
              status: "linked_existing_order",
            };
            return;
          }
        }

        const counterSnap = await tx.get(counterRef);
        const last = counterSnap.exists() ? Number(counterSnap.data()?.last || 0) : 0;
        const next = last + 1;
        const numeroPedidoFinal = `VENTA-${String(next).padStart(5, "0")}`;
        tx.set(counterRef, { last: next, updatedAt: nowIso }, { merge: true });

        const ventaRef = doc(ventasColl);
        const createdAtIso = orderForFirestore.createdAt || nowIso;
        const fechaLegible = formatFechaLegible(createdAtIso);
        const items = Array.isArray(orderData.items) ? orderData.items : [];
        const subtotalCalculado = items.reduce(
          (acc, item) => acc + (Number(item.price) || 0) * (Number(item.quantity) || 0),
          0
        );
        const subtotal = pricing?.subtotal != null ? Number(pricing.subtotal) || 0 : subtotalCalculado;
        const descuentos = pricing?.productDiscounts != null ? Number(pricing.productDiscounts) || 0 : 0;
        const descuentoEfectivo = pricing?.transferDiscount != null ? Number(pricing.transferDiscount) || 0 : 0;
        const costoEnvio = Number.isFinite(shippingPrice) ? shippingPrice : 0;
        const estadoPago = mapEstadoPagoFromOrderStatus(orderData.status);
        const tipoEnvio = normalizeShippingType(orderData?.deliveryInfo?.metodoEntrega) || "domicilio";

        const ventaDoc = {
          numeroPedido: numeroPedidoFinal,
          estadoPago,
          total: Number(orderData.total) || 0,
          subtotal,
          descuentos,
          descuentoTotal: descuentos,
          descuentoEfectivo,
          totalSinEfectivo:
            parseNullableNumber(pricing?.total) ?? Math.max(0, subtotal - descuentos + costoEnvio),
          totalConEfectivo: null,
          motivoPendiente: pendingReason || null,
          fecha: fechaLegible,
          fechaEntrega: null,
          formaPago: paymentMethod || "",
          vendedor: "ecommerce",
          cliente: {
            email: orderData.customerInfo?.email || orderData.userId || "",
            nombre: orderData.customerInfo?.nombre || "",
            telefono: orderData.customerInfo?.telefono || "",
            direccion: orderData.deliveryInfo?.direccion || "",
          },
          productos: items.map((item) => ({
            id: item.id || "",
            nombre: item.name || "",
            cantidad: Number(item.quantity) || 0,
            precio: Number(item.price) || 0,
            unidad: item.unidad || item.unidadMedida || item.unit || "",
            unidadMedida: item.unidadMedida || item.unidad || item.unit || "",
            categoria: item.category || "",
            imagen: "",
            alto: item.alto || 0,
            ancho: item.ancho || 0,
            largo: item.largo || 0,
          })),
          estadoEnvio: "pendiente",
          direccionEnvio: orderData.deliveryInfo?.direccion || "",
          transportista: "",
          tipoEnvio,
          costoEnvio,
          fechaEntregaEnvio: null,
          origen: "ecommerce_externo",
          creadoEn: createdAtIso,
          fechaCreacion: createdAtIso,
          actualizadoEn: nowIso,
          idExterno: orderData.orderId,
        };

        tx.set(ventaRef, ventaDoc);
        tx.set(
          ventaExternalRef,
          {
            orderId: orderData.orderId,
            ventaId: ventaRef.id,
            numeroPedido: numeroPedidoFinal,
            createdAt: nowIso,
            source: "api_orders",
          },
          { merge: true }
        );
        tx.set(
          orderRef,
          { ventaId: ventaRef.id, ventaNumeroPedido: numeroPedidoFinal, updatedAt: nowIso },
          { merge: true }
        );

        ventaResult = { id: ventaRef.id, numeroPedido: numeroPedidoFinal, status: "created" };
      });
    } catch (errVenta) {
      await setDoc(orderRef, { ventaSyncError: errVenta?.message || "venta_sync_failed", updatedAt: nowIso }, { merge: true });
      ventaResult = { status: "error", error: errVenta?.message || "venta_sync_failed" };
    }

    console.log(`Orden ${orderData.orderId} creada exitosamente`);

    return withCors(
      NextResponse.json({
        success: true,
        message: "Orden creada correctamente",
        orderId: orderData.orderId,
        data: {
          orderId: orderData.orderId,
          userId: orderData.userId,
          status: orderData.status,
          total: orderData.total,
          paymentMethod: paymentMethod || null,
          pendingReason,
          pricing,
          itemsCount: orderData.items.length,
          venta: ventaResult,
        },
      })
    );
  } catch (err) {
    console.error("Error en POST /api/orders:", {
      message: err.message,
      stack: err.stack,
    });

    if (err.code === "permission-denied") {
      return withCors(
        NextResponse.json(
          {
            success: false,
            error: "Error de permisos en la base de datos",
            code: "PERMISSION_DENIED",
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
            code: "DATABASE_UNAVAILABLE",
          },
          { status: 503 }
        )
      );
    }

    return withCors(
      NextResponse.json(
        {
          success: false,
          error: "Error interno del servidor",
          code: "INTERNAL_SERVER_ERROR",
          details: err.message,
        },
        { status: 500 }
      )
    );
  }
}
