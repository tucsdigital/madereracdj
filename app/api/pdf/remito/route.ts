import { NextRequest } from "next/server";
import { db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import {
  mapVentaToRemito,
  mapPresupuestoToRemito,
} from "@/src/lib/pdf/mappers";
import { generateRemitoPDFBuffer } from "@/src/lib/pdf/generate-remito-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { type, id, empleado } = body as {
      type: "venta" | "presupuesto";
      id: string;
      empleado?: boolean;
    };

    if (!type || !id) {
      return new Response(
        JSON.stringify({ error: "type e id son requeridos" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const collectionName = type === "venta" ? "ventas" : "presupuestos";
    const docRef = doc(db, collectionName, id);
    const snap = await getDoc(docRef);

    if (!snap.exists()) {
      return new Response(
        JSON.stringify({ error: "Documento no encontrado" }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const data = { id: snap.id, ...snap.data() };
    const remito =
      type === "venta"
        ? mapVentaToRemito(data)
        : mapPresupuestoToRemito(data);

    // Generar PDF
    const buffer = await generateRemitoPDFBuffer(remito, empleado || false);

    const suffix = empleado ? "-empleado" : "";
    // Eliminar prefijo "REMITO-" o "remito-" si existe
    const numeroSinPrefijo = remito.numero.replace(/^(REMITO-|remito-)/i, "");
    const filename = `${numeroSinPrefijo}${suffix}.pdf`;

    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error: any) {
    console.error("Error generando remito PDF:", error);
    return new Response(
      JSON.stringify({
        error: "Error generando PDF",
        details: error?.message,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
