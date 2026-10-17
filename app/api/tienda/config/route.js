import { NextResponse } from "next/server";
import { getAdminDb, verifyFirebaseToken } from "@/lib/firebase-admin";
import { TIENDA_DEFAULTS, normalizeTiendaConfig, validateTiendaConfig } from "@/lib/tienda-config";
import { allowedImageHosts } from "@/lib/tienda-media";

export const runtime = "nodejs";

const imageHosts = () => allowedImageHosts(process.env.R2_PUBLIC_BASE);

const ref = () => getAdminDb().collection("settings").doc("tienda");

async function leer() {
  const data = (await ref().get()).data() || {};
  const published = normalizeTiendaConfig(data.published);
  const draft = data.draft ? normalizeTiendaConfig(data.draft) : null;
  return {
    data,
    published,
    draft,
    state: {
      hasPublished: Boolean(data.published),
      hasDraft: Boolean(draft),
      publishedAt: data.publishedAt || null,
      publishedBy: data.publishedBy || null,
      draftUpdatedAt: data.draftUpdatedAt || null,
      draftBy: data.draftBy || null,
    },
  };
}

const respuesta = async (extra = {}) => {
  const { published, draft, state } = await leer();
  const current = draft || published;
  return NextResponse.json({ published, draft: current, ...state, imageHosts: imageHosts(), validation: validateTiendaConfig(current, { imageHosts: imageHosts() }), ...extra });
};

const fail = (error) => {
  const status = error?.status || 500;
  const message = status === 401 ? "Iniciá sesión para administrar la tienda web." : error?.message || "No se pudo procesar la solicitud.";
  return NextResponse.json({ error: message }, { status });
};

export async function GET(request) {
  try {
    await verifyFirebaseToken(request.headers.get("authorization"));
    return await respuesta({ defaults: TIENDA_DEFAULTS });
  } catch (error) {
    return fail(error);
  }
}

// Guarda un borrador. No cambia lo que ve el público.
export async function PUT(request) {
  try {
    const actor = await verifyFirebaseToken(request.headers.get("authorization"));
    const body = await request.json().catch(() => ({}));
    const config = normalizeTiendaConfig(body?.config);
    // Los errores de contenido se permiten en un borrador; se exigen al publicar.
    await ref().set({ draft: config, draftUpdatedAt: new Date().toISOString(), draftBy: String(actor?.email || actor?.uid || "") }, { merge: true });
    return await respuesta();
  } catch (error) {
    return fail(error);
  }
}

// Acciones: publicar | descartar | valores_actuales
export async function POST(request) {
  try {
    const actor = await verifyFirebaseToken(request.headers.get("authorization"));
    const body = await request.json().catch(() => ({}));
    const accion = String(body?.accion || "");
    const at = new Date().toISOString();
    const by = String(actor?.email || actor?.uid || "");

    if (accion === "publicar") {
      const { data, published, draft } = await leer();
      if (!draft) return NextResponse.json({ error: "No hay cambios para publicar." }, { status: 400 });
      const { errors } = validateTiendaConfig(draft, { imageHosts: imageHosts() });
      if (errors.length) return NextResponse.json({ error: "Corregí los errores antes de publicar.", errores: errors }, { status: 400 });
      const db = getAdminDb();
      await db.collection("settingsHistory").add({
        tipo: "tienda", at, byUid: String(actor?.uid || ""), byEmail: String(actor?.email || ""),
        before: data.published ? published : null, after: draft,
      });
      const version = (Number(data.version) || 0) + 1;
      await ref().set({
        published: draft, publishedAt: at, publishedBy: by, version,
        draft: null, draftUpdatedAt: null, draftBy: null,
      }, { merge: true });
      return await respuesta({ message: "Cambios publicados." });
    }

    if (accion === "descartar") {
      await ref().set({ draft: null, draftUpdatedAt: null, draftBy: null }, { merge: true });
      return await respuesta({ message: "Borrador descartado." });
    }

    if (accion === "valores_actuales") {
      // Carga en el borrador los textos que hoy están fijos en la tienda, para empezar a editarlos.
      await ref().set({ draft: normalizeTiendaConfig(TIENDA_DEFAULTS), draftUpdatedAt: at, draftBy: by }, { merge: true });
      return await respuesta({ message: "Se cargaron los valores actuales de la tienda en el borrador." });
    }

    return NextResponse.json({ error: "Acción no válida." }, { status: 400 });
  } catch (error) {
    return fail(error);
  }
}
