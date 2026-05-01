import { NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs, limit } from "firebase/firestore";

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

// GET /api/ventas/buscar/{externalReference}
export async function GET(_request, { params }) {
  try {
    const externalReference = String(params?.externalReference || "").trim();
    if (!externalReference) {
      return withCors(
        NextResponse.json(
          {
            success: false,
            error: "externalReference requerido",
            code: "MISSING_EXTERNAL_REFERENCE",
          },
          { status: 400 }
        )
      );
    }

    const byExternalRefQ = query(
      collection(db, "ventas"),
      where("idExterno", "==", externalReference),
      limit(1)
    );
    const byExternalRefSnap = await getDocs(byExternalRefQ);
    if (!byExternalRefSnap.empty) {
      const d = byExternalRefSnap.docs[0];
      const v = d.data() || {};
      return withCors(
        NextResponse.json({
          success: true,
          data: {
            id: d.id,
            numeroPedido: v.numeroPedido || null,
            idExterno: v.idExterno || externalReference,
            estadoPago: v.estadoPago || "pendiente",
            estadoEnvio: v.estadoEnvio || "pendiente",
            total: v.total ?? 0,
            fechaCreacion: v.fechaCreacion || v.creadoEn || null,
            origen: v.origen || null,
          },
        })
      );
    }

    const byNumeroPedidoQ = query(
      collection(db, "ventas"),
      where("numeroPedido", "==", externalReference),
      limit(1)
    );
    const byNumeroPedidoSnap = await getDocs(byNumeroPedidoQ);
    if (!byNumeroPedidoSnap.empty) {
      const d = byNumeroPedidoSnap.docs[0];
      const v = d.data() || {};
      return withCors(
        NextResponse.json({
          success: true,
          data: {
            id: d.id,
            numeroPedido: v.numeroPedido || externalReference,
            idExterno: v.idExterno || null,
            estadoPago: v.estadoPago || "pendiente",
            estadoEnvio: v.estadoEnvio || "pendiente",
            total: v.total ?? 0,
            fechaCreacion: v.fechaCreacion || v.creadoEn || null,
            origen: v.origen || null,
          },
        })
      );
    }

    return withCors(
      NextResponse.json(
        {
          success: false,
          error: "Venta no encontrada",
          code: "VENTA_NOT_FOUND",
          externalReference,
        },
        { status: 404 }
      )
    );
  } catch (err) {
    return withCors(
      NextResponse.json(
        {
          success: false,
          error: "Error interno del servidor",
          code: "INTERNAL_SERVER_ERROR",
          details: err?.message,
        },
        { status: 500 }
      )
    );
  }
}

