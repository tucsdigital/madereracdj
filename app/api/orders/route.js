import { NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs, orderBy, limit } from "firebase/firestore";

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

// GET /api/orders?userId={email}
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

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

    // Validar formato de email básico
    if (!userId.includes("@")) {
      return withCors(
        NextResponse.json(
          {
            error: "userId debe ser un email válido",
            userId: userId
          },
          { status: 400 }
        )
      );
    }

    // Buscar ventas directamente en la colección ventas por cliente.email
    // Primero sin orderBy para evitar problemas de índice compuesto
    const ventasQuery = query(
      collection(db, "ventas"),
      where("cliente.email", "==", userId)
    );

    const ventasSnap = await getDocs(ventasQuery);

    // Ordenar manualmente por fecha (más recientes primero)
    const ventasDocs = ventasSnap.docs.sort((a, b) => {
      const fechaA = a.data().fecha || a.data().creadoEn || "";
      const fechaB = b.data().fecha || b.data().creadoEn || "";
      return fechaB.localeCompare(fechaA);
    });

    const ventas = [];
    for (const doc of ventasDocs) {
      const venta = doc.data();

      // Buscar información de envío en la colección envios
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

      // Estructura simplificada para ecommerce externo
      ventas.push({
        // Información básica del pedido
        id: doc.id,
        numeroPedido: venta.numeroPedido || doc.id,
        estado: venta.estadoPago || "pendiente",
        total: venta.total || 0,
        fecha: venta.fecha || null,
        fechaEntrega: venta.fechaEntrega || null,
        medioPago: venta.formaPago || "efectivo",

        // Productos simplificados (solo lo esencial)
        productos: await Promise.all((venta.productos || venta.items || []).map(async (producto) => {
          // Buscar imagen del producto desde la colección productos
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
              imagen = productoData.imagenes && productoData.imagenes.length > 0 
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
            unidad: producto.unidad || "",
            categoria: producto.categoria || "",
            imagen: imagen,
            // Solo dimensiones para maderas
            ...(producto.categoria === "Maderas" && {
              alto: producto.alto || 0,
              ancho: producto.ancho || 0,
              largo: producto.largo || 0,
              cepilladoAplicado: producto.cepilladoAplicado || false,
            }),
          };
        })),

        // Información de envío esencial
        envio: {
          estado: envio?.estado || "pendiente",
          direccion: envio?.direccionEnvio || venta.direccionEnvio || venta.cliente?.direccion || "",
          transportista: envio?.transportista || venta.transportista || "",
          fechaEntrega: envio?.fechaEntrega || venta.fechaEntrega || null,
        },

        // Cliente básico
        cliente: {
          nombre: venta.cliente?.nombre || "",
          telefono: venta.cliente?.telefono || "",
        },
      });
    }

    // Si no hay ventas, devolver array vacío en lugar de error
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
      userId: userId
    });

    // Manejar errores específicos de Firestore
    if (err.code === "permission-denied") {
      return withCors(
        NextResponse.json(
          {
            error: "Error de permisos en la base de datos",
            message: "No se puede acceder a la colección de ventas",
            userId: userId
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
            userId: userId
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
            userId: userId
          },
          { status: 400 }
        )
      );
    }

    // Error genérico
    return withCors(
      NextResponse.json(
        {
          error: "Error interno del servidor",
          message: "Error al consultar las ventas del usuario",
          details: err.message,
          userId: userId
        },
        { status: 500 }
      )
    );
  }
}
