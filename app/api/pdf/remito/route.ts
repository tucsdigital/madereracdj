import { NextRequest } from "next/server";
import { getAdminDb, verifyFirebaseToken } from "@/lib/firebase-admin";
import {
  mapVentaToRemito,
  mapPresupuestoToRemito,
  mapObraToRemito,
} from "@/src/lib/pdf/mappers";
import { generateRemitoPDFBuffer } from "@/src/lib/pdf/generate-remito-pdf";
import { mergeVentaClientLocation } from "@/lib/pdf/venta-location.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    await verifyFirebaseToken(req.headers.get("authorization"));

    const body = await req.json();
    const { type, id, empleado, purpose } = body as {
      type: "venta" | "presupuesto" | "obra";
      id: string;
      empleado?: boolean;
      purpose?: "documento" | "envio";
    };

    if (!["venta", "presupuesto", "obra"].includes(type) || typeof id !== "string" || !id.trim()) {
      return new Response(
        JSON.stringify({ error: "type e id válidos son requeridos" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const collectionName =
      type === "venta" ? "ventas" : type === "presupuesto" ? "presupuestos" : "obras";
    const db = getAdminDb();
    const snap = await db.collection(collectionName).doc(id.trim()).get();

    if (!snap.exists) {
      return new Response(
        JSON.stringify({ error: "Documento no encontrado" }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    let data: any = { id: snap.id, ...snap.data() };
    if (type === "venta" && data.clienteId) {
      const clienteSnap = await db.collection("clientes").doc(String(data.clienteId)).get();
      if (clienteSnap.exists) {
        data = mergeVentaClientLocation(data, clienteSnap.data() || {});
      }
    }
    const docTipo = (data as any)?.tipo;
    let presupuestoInicial: any = null;
    if (type === "obra" && docTipo === "obra" && (data as any)?.presupuestoInicialId) {
      const presupuestoSnap = await db
        .collection("obras")
        .doc(String((data as any).presupuestoInicialId))
        .get();
      if (presupuestoSnap.exists) {
        presupuestoInicial = { id: presupuestoSnap.id, ...presupuestoSnap.data() };
      }
    }
    const remito =
      type === "venta"
        ? mapVentaToRemito(data)
        : type === "obra" || docTipo === "obra" || docTipo === "presupuesto"
          ? mapObraToRemito(data, presupuestoInicial)
          : mapPresupuestoToRemito(data);

    // Generar PDF
    const buffer = await generateRemitoPDFBuffer(remito, empleado || false, purpose || "documento");

    const suffix = empleado ? "-empleado" : "";
    // Eliminar prefijo "REMITO-" o "remito-" si existe
    const numeroSinPrefijo = remito.numero.replace(/^(REMITO-|remito-)/i, "");
    const filename = `${numeroSinPrefijo}${suffix}.pdf`;

    return new Response(Uint8Array.from(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
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
        status: Number(error?.status) || 500,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      }
    );
  }
}
