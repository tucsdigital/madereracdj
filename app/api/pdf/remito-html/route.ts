import { NextRequest } from "next/server";
import { db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import {
  mapVentaToRemito,
  mapPresupuestoToRemito,
} from "@/src/lib/pdf/mappers";
import { buildRemitoHtml } from "@/src/lib/pdf/generate-remito-pdf";
import { generarContenidoImpresion } from "@/lib/obra-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Endpoint que devuelve HTML directamente para impresión rápida
 * No genera PDF, solo HTML optimizado para impresión
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { type, id, empleado } = body as {
      type: "venta" | "presupuesto" | "obra";
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

    const collectionName =
      type === "venta" ? "ventas" : type === "presupuesto" ? "presupuestos" : "obras";
    const snap = await getDoc(doc(db, collectionName, id));

    if (!snap.exists()) {
      return new Response(
        JSON.stringify({ error: "Documento no encontrado" }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const data: any = { id: snap.id, ...snap.data() };

    const html =
      type === "obra"
        ? await (async () => {
            const obra = data;
            const modoCosto =
              obra?.tipo === "presupuesto"
                ? "presupuesto"
                : obra?.presupuestoInicialId
                  ? "presupuesto"
                  : "gasto";

            let presupuesto: any = null;
            if (obra?.tipo === "obra" && obra?.presupuestoInicialId) {
              const presSnap = await getDoc(doc(db, "obras", obra.presupuestoInicialId));
              if (presSnap.exists()) {
                presupuesto = { id: presSnap.id, ...presSnap.data() };
              }
            }

            const c = obra?.cobranzas || {};
            const inicial: any[] = [];
            const forma = c.formaPago || "efectivo";
            const sen = Number(c.senia) || 0;
            const mon = Number(c.monto) || 0;

            if (sen > 0)
              inicial.push({
                fecha: c.fechaSenia || "",
                tipo: "seña",
                metodo: forma,
                monto: sen,
                nota: "Seña",
              });

            if (mon > 0)
              inicial.push({
                fecha: c.fechaMonto || "",
                tipo: "pago",
                metodo: forma,
                monto: mon,
                nota: "Pago",
              });

            const hist = Array.isArray(c.historialPagos) ? c.historialPagos : [];
            hist.forEach((p: any) => {
              inicial.push({
                fecha: p.fecha || "",
                tipo: p.tipo || "pago",
                metodo: p.metodo || "efectivo",
                monto: Number(p.monto) || 0,
                nota: p.nota || "",
              });
            });

            return generarContenidoImpresion(obra, presupuesto, modoCosto, inicial);
          })()
        : (() => {
            const remito =
              type === "venta"
                ? mapVentaToRemito(data)
                : mapPresupuestoToRemito(data);

            return buildRemitoHtml(remito, empleado || false, false);
          })();

    return new Response(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
      },
    });
  } catch (error: any) {
    console.error("Error generando remito HTML:", error);
    return new Response(
      JSON.stringify({
        error: "Error generando HTML",
        details: error?.message,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
