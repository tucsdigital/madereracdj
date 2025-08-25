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

    // Buscar ventas directamente en la colección ventas por cliente.email
    const ventasQuery = query(
      collection(db, "ventas"),
      where("cliente.email", "==", userId),
      orderBy("fecha", "desc")
    );
    
    const ventasSnap = await getDocs(ventasQuery);
    
    const ventas = [];
    ventasSnap.forEach((doc) => {
      const venta = doc.data();
      ventas.push({
        id: doc.id,
        numeroPedido: venta.numeroPedido || doc.id,
        estado: venta.estadoPago || "pendiente",
        total: venta.total || 0,
        subtotal: venta.subtotal || 0,
        medioPago: venta.formaPago || "efectivo",
        fecha: venta.fecha || null,
        tipo: venta.tipo || "venta",
        vendedor: venta.vendedor || "",
        items: venta.items || [],
        cliente: {
          nombre: venta.cliente?.nombre || "",
          email: venta.cliente?.email || "",
          telefono: venta.cliente?.telefono || "",
          cuit: venta.cliente?.cuit || "",
          direccion: venta.cliente?.direccion || ""
        }
      });
    });

    // Si no hay ventas, devolver array vacío en lugar de error
    if (ventas.length === 0) {
      return withCors(NextResponse.json({
        success: true,
        data: [],
        total: 0,
        mensaje: "No se encontraron ventas para este usuario",
        usuario: {
          email: userId
        }
      }));
    }

    return withCors(NextResponse.json({
      success: true,
      data: ventas,
      total: ventas.length,
      usuario: {
        email: userId
      }
    }));

  } catch (err) {
    console.error("Error en /api/orders:", err);
    
    // Manejar errores específicos de Firestore
    if (err.code === 'permission-denied') {
      return withCors(NextResponse.json({ 
        error: "Error de permisos en la base de datos",
        message: "No se puede acceder a la colección de ventas"
      }, { status: 403 }));
    }
    
    if (err.code === 'unavailable') {
      return withCors(NextResponse.json({ 
        error: "Base de datos no disponible",
        message: "Error de conectividad con Firestore"
      }, { status: 503 }));
    }
    
    // Error genérico
    return withCors(NextResponse.json({ 
      error: "Error interno del servidor",
      message: "Error al consultar las ventas del usuario"
    }, { status: 500 }));
  }
}
