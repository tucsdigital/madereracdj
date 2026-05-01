import { NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs, updateDoc, doc, getDoc, limit } from "firebase/firestore";

function withCors(resp) {
  const headers = new Headers(resp.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET,OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  return new NextResponse(resp.body, { status: resp.status, headers });
}

export function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

// GET /api/orders/{id} - Obtener orden específica por ID
export async function GET(request, { params }) {
  try {
    const { id } = params;
    
    console.log("API GET /api/orders/{id} llamada con ID:", id);

    if (!id) {
      return withCors(
        NextResponse.json(
          {
            success: false,
            error: "ID de orden requerido",
            code: "MISSING_ORDER_ID"
          },
          { status: 400 }
        )
      );
    }

    // Buscar orden por orderId en la colección orders
    const ordersQuery = query(
      collection(db, "orders"),
      where("orderId", "==", id),
      limit(1)
    );

    const ordersSnap = await getDocs(ordersQuery);

    if (ordersSnap.empty) {
      // Fallback: intentar resolver desde la colección "ventas"
      try {
        // 1) Buscar venta por ID de documento
        const ventaRef = doc(db, "ventas", id);
        const ventaSnap = await getDoc(ventaRef);
        let ventaDocData = null;
        let ventaDocId = null;
        if (ventaSnap.exists()) {
          ventaDocData = ventaSnap.data();
          ventaDocId = ventaSnap.id;
        } else {
          // 2) Buscar por numeroPedido
          const qByNumero = query(collection(db, "ventas"), where("numeroPedido", "==", id), limit(1));
          const sByNumero = await getDocs(qByNumero);
          if (!sByNumero.empty) {
            ventaDocData = sByNumero.docs[0].data();
            ventaDocId = sByNumero.docs[0].id;
          } else {
            // 3) Buscar por idExterno
            const qByExterno = query(collection(db, "ventas"), where("idExterno", "==", id), limit(1));
            const sByExterno = await getDocs(qByExterno);
            if (!sByExterno.empty) {
              ventaDocData = sByExterno.docs[0].data();
              ventaDocId = sByExterno.docs[0].id;
            }
          }
        }

        if (!ventaDocData) {
          return withCors(
            NextResponse.json(
              {
                success: false,
                error: "Orden no encontrada",
                code: "ORDER_NOT_FOUND",
                orderId: id
              },
              { status: 404 }
            )
          );
        }

        // Mapear venta al formato de "orden" para API externa
        const venta = ventaDocData;
        const cliente = venta.cliente || {};
        const productos = Array.isArray(venta.productos) ? venta.productos : (venta.items || []);
        // Resolver envío básico
        let envioData = null;
        try {
          const envioQ = query(collection(db, "envios"), where("numeroPedido", "==", venta.numeroPedido), limit(1));
          const envioSnap = await getDocs(envioQ);
          if (!envioSnap.empty) {
            const e = envioSnap.docs[0].data();
            envioData = {
              estado: e.estado || "pendiente",
              direccionEnvio: e.direccionEnvio || venta.direccionEnvio || cliente.direccion || "",
              localidadEnvio: e.localidadEnvio || "",
              tipoEnvio: e.tipoEnvio || venta.tipoEnvio || "",
              transportista: e.transportista || venta.transportista || "",
              fechaEntrega: e.fechaEntrega || venta.fechaEntrega || null,
              costoEnvio: e.costoEnvio || venta.costoEnvio || 0,
            };
          }
        } catch {}

        const orderFromVenta = {
          id: ventaDocId || id,
          orderId: venta.numeroPedido || id,
          userId: cliente.email || "",
          status: venta.estadoPago || "pendiente",
          total: Number(venta.total) || 0,
          subtotal: Number(venta.subtotal) || 0,
          descuentos: Number(venta.descuentos ?? venta.descuentoTotal) || 0,
          descuentoEfectivo: Number(venta.descuentoEfectivo) || 0,
          totalSinEfectivo: venta.totalSinEfectivo ?? null,
          totalConEfectivo: venta.totalConEfectivo ?? null,
          motivoPendiente: venta.motivoPendiente || null,
          paymentMethod: venta.formaPago || "",
          pendingReason: venta.motivoPendiente || null,
          shippingPrice: Number(envioData?.costoEnvio ?? venta.costoEnvio ?? 0) || 0,
          createdAt: venta.fechaCreacion || venta.creadoEn || new Date().toISOString(),
          updatedAt: venta.actualizadoEn || null,
          customerInfo: {
            nombre: cliente.nombre || "",
            email: cliente.email || "",
            telefono: cliente.telefono || "",
            dni: "",
          },
          deliveryInfo: {
            direccion: (envioData?.direccionEnvio) || venta.direccionEnvio || cliente.direccion || "",
            ciudad: envioData?.localidadEnvio || "",
            codigoPostal: "",
            metodoEntrega: envioData?.tipoEnvio || venta.tipoEnvio || venta.transportista || "",
            shippingPrice: Number(envioData?.costoEnvio ?? venta.costoEnvio ?? 0) || 0,
            shippingTierKm: 0,
          },
          items: productos.map((p) => ({
            id: p.id || "",
            name: p.nombre || "",
            price: Number(p.precio) || 0,
            quantity: Number(p.cantidad) || 0,
            unidad: p.unidad || p.unidadMedida || p.unit || "",
            unidadMedida: p.unidadMedida || p.unidad || p.unit || "",
            category: p.categoria || "",
            subcategory: p.subcategoria || p.subCategoria || "",
          })),
        };

        return withCors(
          NextResponse.json({
            success: true,
            data: orderFromVenta,
            message: "Orden encontrada exitosamente (resuelta desde ventas)"
          })
        );
      } catch (fallbackErr) {
        return withCors(
          NextResponse.json(
            {
              success: false,
              error: "Orden no encontrada",
              code: "ORDER_NOT_FOUND",
              orderId: id,
              details: fallbackErr?.message
            },
            { status: 404 }
          )
        );
      }
    }

    const orderDoc = ordersSnap.docs[0];
    const orderData = orderDoc.data();

    // Estructura de respuesta
    const order = {
      id: orderDoc.id, // ID del documento en Firestore
      orderId: orderData.orderId,
      userId: orderData.userId,
      status: orderData.status,
      total: orderData.total,
      paymentMethod: orderData.paymentMethod || null,
      pendingReason: orderData.pendingReason || null,
      pricing: orderData.pricing || null,
      createdAt: orderData.createdAt,
      updatedAt: orderData.updatedAt,
      shippingPrice: Number(
        orderData.shippingPrice ?? orderData.deliveryInfo?.shippingPrice ?? 0
      ) || 0,
      shippingTierKm: Number(
        orderData.shippingTierKm ?? orderData.deliveryInfo?.shippingTierKm ?? 0
      ) || 0,
      
      customerInfo: {
        nombre: orderData.customerInfo?.nombre || "",
        email: orderData.customerInfo?.email || "",
        telefono: orderData.customerInfo?.telefono || "",
        dni: orderData.customerInfo?.dni || ""
      },
      
      deliveryInfo: {
        direccion: orderData.deliveryInfo?.direccion || "",
        ciudad: orderData.deliveryInfo?.ciudad || "",
        codigoPostal: orderData.deliveryInfo?.codigoPostal || "",
        metodoEntrega: orderData.deliveryInfo?.metodoEntrega || "",
        shippingPrice: Number(
          orderData.deliveryInfo?.shippingPrice ?? orderData.shippingPrice ?? 0
        ) || 0,
        shippingTierKm: Number(
          orderData.deliveryInfo?.shippingTierKm ?? orderData.shippingTierKm ?? 0
        ) || 0
      },
      
      items: (orderData.items || []).map(item => ({
        id: item.id || "",
        name: item.name || "",
        price: item.price || 0,
        quantity: item.quantity || 0,
        unidad: item.unidad || item.unidadMedida || item.unit || "",
        unidadMedida: item.unidadMedida || item.unidad || item.unit || "",
        category: item.category || "",
        subcategory: item.subcategory || ""
      }))
    };

    console.log(`Orden ${id} encontrada con estado:`, orderData.status);

    return withCors(
      NextResponse.json({
        success: true,
        data: order,
        message: "Orden encontrada exitosamente"
      })
    );

  } catch (err) {
    console.error("Error en GET /api/orders/{id}:", {
      message: err.message,
      stack: err.stack,
      orderId: params?.id
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
