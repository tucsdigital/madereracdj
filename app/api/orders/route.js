import { NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs, orderBy } from "firebase/firestore";

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
    
    if (!userId) {
      return withCors(NextResponse.json({ 
        error: "userId (email) requerido" 
      }, { status: 400 }));
    }

    // Primero buscar el cliente por email para obtener su ID
    const clienteQuery = query(
      collection(db, "clientes"),
      where("email", "==", userId)
    );
    
    const clienteSnap = await getDocs(clienteQuery);
    
    if (clienteSnap.empty) {
      return withCors(NextResponse.json({ 
        error: "Usuario no encontrado",
        email: userId
      }, { status: 404 }));
    }

    const clienteId = clienteSnap.docs[0].id;

    // Buscar pedidos por clienteId
    const pedidosQuery = query(
      collection(db, "pedidos"),
      where("clienteId", "==", clienteId),
      orderBy("creadoEn", "desc")
    );
    
    const pedidosSnap = await getDocs(pedidosQuery);
    
    const pedidos = [];
    pedidosSnap.forEach((doc) => {
      const pedido = doc.data();
      pedidos.push({
        id: doc.id,
        numeroPedido: doc.id,
        estado: pedido.estado || "pendiente",
        total: pedido.total || 0,
        medioPago: pedido.medioPago || "",
        datosEnvio: pedido.datosEnvio || null,
        creadoEn: pedido.creadoEn || null,
        actualizadoEn: pedido.actualizadoEn || null,
        carritoId: pedido.carritoId || null
      });
    });

    // También buscar en la colección de ventas (si existe)
    try {
      const ventasQuery = query(
        collection(db, "ventas"),
        where("cliente.email", "==", userId),
        orderBy("fechaCreacion", "desc")
      );
      
      const ventasSnap = await getDocs(ventasQuery);
      
      ventasSnap.forEach((doc) => {
        const venta = doc.data();
        pedidos.push({
          id: doc.id,
          numeroPedido: venta.numeroPedido || doc.id,
          estado: venta.estado || "completada",
          total: venta.total || 0,
          medioPago: venta.medioPago || "efectivo",
          datosEnvio: {
            direccion: venta.direccionEnvio || "",
            localidad: venta.localidadEnvio || "",
            tipoEnvio: venta.tipoEnvio || ""
          },
          creadoEn: venta.fechaCreacion || null,
          actualizadoEn: venta.fechaActualizacion || null,
          tipo: "venta"
        });
      });
    } catch (ventasError) {
      // Si no existe la colección ventas, continuar
      console.log("Colección ventas no disponible:", ventasError.message);
    }

    // Ordenar todos los pedidos por fecha de creación
    pedidos.sort((a, b) => {
      const fechaA = new Date(a.creadoEn || 0);
      const fechaB = new Date(b.creadoEn || 0);
      return fechaB - fechaA;
    });

    return withCors(NextResponse.json({
      success: true,
      data: pedidos,
      total: pedidos.length,
      usuario: {
        id: clienteId,
        email: userId
      }
    }));

  } catch (err) {
    console.error("Error en /api/orders:", err);
    return withCors(NextResponse.json({ 
      error: "Error interno del servidor",
      message: err.message
    }, { status: 500 }));
  }
}
