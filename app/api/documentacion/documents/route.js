import { NextResponse } from "next/server";
import { getAdminDb, verifyFirebaseToken } from "@/lib/firebase-admin";
import { addDocumentoEvent, nowIso } from "@/lib/documentacion-server";
import { getNextDocumentacionNumber } from "@/lib/obra-numbering";
import { DOCUMENTO_ESTADOS } from "@/lib/documentacion-states";

const toInt = (v, fallback) => {
  const n = Number.parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) ? n : fallback;
};

export async function GET(request) {
  try {
    const authHeader = request.headers.get("authorization") || "";
    await verifyFirebaseToken(authHeader);

    const url = new URL(request.url);
    const estado = url.searchParams.get("estado") || "";
    const obraId = url.searchParams.get("obraId") || "";
    const clienteId = url.searchParams.get("clienteId") || "";
    const responsableUid = url.searchParams.get("responsableUid") || "";
    const limit = Math.min(200, Math.max(1, toInt(url.searchParams.get("limit"), 50)));

    const db = getAdminDb();
    let q = db.collection("documentos").where("archived", "==", false);
    if (estado) q = q.where("estado", "==", estado);
    if (obraId) q = q.where("obra.id", "==", obraId);
    if (clienteId) q = q.where("cliente.id", "==", clienteId);
    if (responsableUid) q = q.where("responsable.uid", "==", responsableUid);

    const snap = await q.orderBy("createdAt", "desc").limit(limit).get();
    return NextResponse.json({
      ok: true,
      items: snap.docs.map((d) => ({ id: d.id, ...d.data() })),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Error" },
      { status: e?.status || 500 }
    );
  }
}

export async function POST(request) {
  try {
    const authHeader = request.headers.get("authorization") || "";
    const user = await verifyFirebaseToken(authHeader);
    const body = await request.json();

    const titulo = String(body?.titulo || "").trim();
    const obra = body?.obra && typeof body.obra === "object" ? body.obra : null;
    const cliente = body?.cliente && typeof body.cliente === "object" ? body.cliente : null;
    const ubicacion = body?.ubicacion && typeof body.ubicacion === "object" ? body.ubicacion : null;
    const responsable = body?.responsable && typeof body.responsable === "object" ? body.responsable : null;
    const template = body?.template && typeof body.template === "object" ? body.template : null;
    const contentHtml = String(body?.contentHtml || "").trim();
    const legalHtml = String(body?.legalHtml || "").trim();
    const inputsRaw = body?.inputs && typeof body.inputs === "object" ? body.inputs : null;
    const inputs = inputsRaw
      ? Object.fromEntries(
          Object.entries(inputsRaw)
            .slice(0, 80)
            .map(([k, v]) => [String(k || ""), String(v ?? "")])
            .filter(([k]) => Boolean(k))
        )
      : null;

    const inputValue = (key) => {
      const v = String(inputs?.[key] ?? "").trim();
      return v ? v : "";
    };

    const clienteNombreFromInputs = inputValue("clienteNombre");
    const clienteTelefonoFromInputs = inputValue("clienteTelefono");
    const clienteEmailFromInputs = inputValue("clienteEmail");
    const clienteCuitFromInputs = inputValue("clienteDniCuit");
    const ubicacionDireccionFromInputs = inputValue("ubicacionObra");

    const hasClienteInputs =
      Boolean(clienteNombreFromInputs) ||
      Boolean(clienteTelefonoFromInputs) ||
      Boolean(clienteEmailFromInputs) ||
      Boolean(clienteCuitFromInputs);

    const hasUbicacionInputs = Boolean(ubicacionDireccionFromInputs);

    const numero = await getNextDocumentacionNumber();
    const now = nowIso();
    const db = getAdminDb();
    const ref = db.collection("documentos").doc();

    const clienteBase = cliente
      ? {
          id: String(cliente.id || ""),
          nombre: String(cliente.nombre || ""),
          telefono: String(cliente.telefono || ""),
          email: String(cliente.email || ""),
          cuit: String(cliente.cuit || ""),
          direccion: String(cliente.direccion || ""),
          localidad: String(cliente.localidad || ""),
          provincia: String(cliente.provincia || ""),
          partido: String(cliente.partido || ""),
        }
      : hasClienteInputs
        ? {
            id: "",
            nombre: "",
            telefono: "",
            email: "",
            cuit: "",
            direccion: "",
            localidad: "",
            provincia: "",
            partido: "",
          }
        : null;

    const clienteFinal = clienteBase
      ? {
          ...clienteBase,
          ...(clienteNombreFromInputs ? { nombre: clienteNombreFromInputs } : {}),
          ...(clienteTelefonoFromInputs ? { telefono: clienteTelefonoFromInputs } : {}),
          ...(clienteEmailFromInputs ? { email: clienteEmailFromInputs } : {}),
          ...(clienteCuitFromInputs ? { cuit: clienteCuitFromInputs } : {}),
        }
      : null;

    const ubicacionBase = ubicacion
      ? {
          direccion: String(ubicacion.direccion || ""),
          localidad: String(ubicacion.localidad || ""),
          provincia: String(ubicacion.provincia || ""),
          partido: String(ubicacion.partido || ""),
          barrio: String(ubicacion.barrio || ""),
          area: String(ubicacion.area || ""),
          lote: String(ubicacion.lote || ""),
          descripcion: String(ubicacion.descripcion || ""),
        }
      : hasUbicacionInputs
        ? {
            direccion: "",
            localidad: "",
            provincia: "",
            partido: "",
            barrio: "",
            area: "",
            lote: "",
            descripcion: "",
          }
        : null;

    const ubicacionFinal = ubicacionBase
      ? {
          ...ubicacionBase,
          ...(ubicacionDireccionFromInputs ? { direccion: ubicacionDireccionFromInputs } : {}),
        }
      : null;

    await ref.set({
      numero,
      titulo,
      estado: DOCUMENTO_ESTADOS.BORRADOR,
      archived: false,
      bloqueado: false,
      obra: obra
        ? {
            id: String(obra.id || ""),
            numeroPedido: String(obra.numeroPedido || ""),
            tipo: String(obra.tipo || ""),
          }
        : null,
      cliente: clienteFinal,
      ubicacion: ubicacionFinal,
      responsable: responsable
        ? {
            uid: String(responsable.uid || ""),
            email: String(responsable.email || ""),
            nombre: String(responsable.nombre || ""),
          }
        : {
            uid: String(user.uid || ""),
            email: String(user.email || ""),
            nombre: "",
          },
      template: template
        ? {
            id: String(template.id || ""),
            nombre: String(template.nombre || ""),
            version: Number(template.version || 1),
            descripcionHtml: String(template.descripcionHtml || ""),
          }
        : null,
      inputs,
      contentHtml,
      legalHtml,
      createdAt: now,
      createdByUid: String(user.uid || ""),
      createdByEmail: String(user.email || ""),
      updatedAt: now,
      updatedByUid: String(user.uid || ""),
      updatedByEmail: String(user.email || ""),
    });

    await addDocumentoEvent({
      documentoId: ref.id,
      type: "document_created",
      actorType: "internal",
      actorId: user.uid,
      actorEmail: user.email,
      ip: "",
      userAgent: request.headers.get("user-agent") || "",
      details: { numero },
    });

    return NextResponse.json({ ok: true, id: ref.id, numero });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Error" },
      { status: e?.status || 500 }
    );
  }
}
