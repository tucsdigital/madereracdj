import { NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { collection, doc, getDoc, getDocs, query, where, limit } from "firebase/firestore";
import { calcularPreciosProducto, normalizarProductoEntrada } from "@/lib/pricing";
import { getExternalProductoFields } from "@/lib/producto-utils";
import { getProductMeasure } from "@/lib/product-measure";
import {
  computeComboAvailableStock,
  getComboComponentIds,
  isComboProduct,
  normalizeComboComponents,
  withDerivedComboStock,
} from "@/lib/combos";

function getIntegrationFields(prod) {
  const { minimoCompra, minCompra, pack, packSize } = getExternalProductoFields(prod);
  return { minimoCompra, minCompra, pack, packSize };
}

async function getReservationTotals(productIds) {
  const ids = Array.from(new Set(productIds.map((id) => String(id).trim()).filter(Boolean)));
  const chunks = [];
  for (let index = 0; index < ids.length; index += 30) chunks.push(ids.slice(index, index + 30));
  const reservationQueries = chunks.flatMap((chunk) => [
    query(collection(db, "reservasStock"), where("productoId", "in", chunk)),
    query(collection(db, "reservasStock"), where("componentIds", "array-contains-any", chunk)),
  ]);
  const snapshots = await Promise.all(reservationQueries.map((reservationQuery) => getDocs(reservationQuery)));
  const reservations = new Map();
  snapshots.forEach((snapshot) => snapshot.docs.forEach((reservation) => {
    reservations.set(reservation.id, reservation.data() || {});
  }));
  const reservedByProductId = new Map(ids.map((id) => [id, 0]));
  const now = Date.now();
  reservations.forEach((reservation) => {
    if (String(reservation.estado || "").toLowerCase() !== "activa") return;
    const expiresAt = reservation.expiresAt?.toDate
      ? reservation.expiresAt.toDate().getTime()
      : Date.parse(reservation.expiresAt || "");
    if (!Number.isFinite(expiresAt) || expiresAt <= now) return;
    const quantity = Number(reservation.cantidad);
    if (!Number.isFinite(quantity) || quantity <= 0) return;
    const recipe = normalizeComboComponents(reservation.componentesReservados);
    if (recipe.length > 0) {
      recipe.forEach((component) => {
        if (reservedByProductId.has(component.productoId)) {
          reservedByProductId.set(
            component.productoId,
            reservedByProductId.get(component.productoId) + quantity * component.cantidad
          );
        }
      });
    } else {
      const productId = String(reservation.productoId || "");
      if (reservedByProductId.has(productId)) {
        reservedByProductId.set(productId, reservedByProductId.get(productId) + quantity);
      }
    }
  });
  return reservedByProductId;
}

async function enrichProductsStock(products, baseMap = new Map()) {
  const items = Array.isArray(products) ? products : [];
  const productoById = new Map(baseMap);
  items.forEach((producto) => productoById.set(String(producto.id), producto));
  const componentIds = Array.from(new Set(items.flatMap((producto) => getComboComponentIds(producto))));
  const missingIds = componentIds.filter((componentId) => !productoById.has(componentId));
  const snapshots = await Promise.all(missingIds.map((componentId) => getDoc(doc(db, "productos", componentId))));
  snapshots.forEach((snapshot, index) => {
    if (snapshot.exists()) {
      productoById.set(missingIds[index], { ...(snapshot.data() || {}), id: snapshot.id });
    }
  });

  const idsForAvailability = Array.from(new Set([
    ...items.map((producto) => String(producto.id)),
    ...componentIds,
  ]));
  const reservedByProductId = await getReservationTotals(idsForAvailability);
  return items.map((producto) => {
    const enriched = withDerivedComboStock(producto, productoById);
    const stockTotal = Math.max(0, Number(enriched.stock) || 0);
    const stockDisponible = isComboProduct(enriched)
      ? Math.max(
          0,
          computeComboAvailableStock(enriched, productoById, reservedByProductId) -
            (Number(reservedByProductId.get(String(enriched.id))) || 0)
        )
      : Math.max(
          0,
          stockTotal - (Number(reservedByProductId.get(String(enriched.id))) || 0)
        );
    const componentesCombo = isComboProduct(enriched)
      ? normalizeComboComponents(enriched.componentesCombo).map((component) => {
          const source = productoById.get(String(component.productoId)) || {};
          const rawImage = Array.isArray(source.imagenes) ? source.imagenes[0] : source.imagenes;
          const componentImage = typeof rawImage === "object" && rawImage
            ? rawImage.url || rawImage.src || rawImage.imageUrl || rawImage.imagen || ""
            : rawImage;
          return {
            ...component,
            nombre: String(source.nombre || component.nombre || "Producto"),
            codigo: String(source.codigo || component.codigo || ""),
            categoria: String(source.categoria || component.categoria || ""),
            unidadMedida: String(source.unidadMedida || source.unidad || component.unidadMedida || "Unidad"),
            descripcion: String(source.descripcion || ""),
            imagen: String(source.imagen || componentImage || source.srcUrl || ""),
            alto: Number(source.alto) || null,
            ancho: Number(source.ancho) || null,
            largo: Number(source.largo) || null,
            espesor: Number(source.espesor) || null,
            measure: getProductMeasure(source),
          };
        })
      : [];
    return {
      ...enriched,
      ...(isComboProduct(enriched) ? { componentesCombo } : {}),
      stockTotal,
      stockReservado: Math.max(0, stockTotal - stockDisponible),
      stockDisponible,
    };
  });
}

async function enrichComboStock(producto, baseMap = new Map()) {
  const [enriched] = await enrichProductsStock([producto], baseMap);
  return enriched;
}

/**
 * API de Precios - IMPORTANTE: SOLO devuelve productos con estadoTienda: "Activo"
 * 
 * Esta API está configurada para mostrar ÚNICAMENTE productos que estén activos en tienda.
 * Los productos sin campo estadoTienda o con estadoTienda diferente a "Activo" NO se muestran.
 * 
 * Filtros aplicados:
 * - estadoTienda debe ser "Activo"
 * - Productos sin estadoTienda se consideran inactivos
 * - Productos con estadoTienda: "Inactivo" se rechazan
 */

// Sencillo helper CORS
function withCors(resp) {
  const headers = new Headers(resp.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  return new NextResponse(resp.body, { status: resp.status, headers });
}

export function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

// GET /api/precios?id=...&cantidad=1
// GET /api/precios?codigo=ABC123 o ?nombre=...
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const codigo = searchParams.get("codigo");
    const nombre = searchParams.get("nombre");
    const cantidad = parseFloat(searchParams.get("cantidad") || "1");
    const redondearParam = searchParams.get("redondear");
    const redondear = redondearParam == null ? true : redondearParam.toLowerCase() !== "false";
    const modoRedondeo = (searchParams.get("modoRedondeo") || "total").toLowerCase();
    const allParam = searchParams.get("all");
    const listarTodos = allParam != null && ["1", "true", "t", "si", "sí", "yes"].includes(allParam.toLowerCase());

    // Listado completo del catálogo con pricing
    // SOLO productos activos en tienda (estadoTienda: "Activo")
    if (listarTodos) {
      const q = query(
        collection(db, "productos"),
        where("estadoTienda", "==", "Activo")
      );
      const snap = await getDocs(q);
      const baseProductos = snap.docs.map((d) => ({ ...(d.data() || {}), id: d.id }));
      const baseMap = new Map(baseProductos.map((producto) => [String(producto.id), producto]));
      const productosConStock = await enrichProductsStock(baseProductos, baseMap);
      const items = [];
      productosConStock.forEach((prod) => {
        const normalized = normalizarProductoEntrada(prod);
        const pricing = calcularPreciosProducto(normalized, { cantidad, redondear, modoRedondeo });
        const integration = getIntegrationFields(prod);
        const external = getExternalProductoFields(prod);
        items.push({
          id: prod.id,
          producto: { ...prod, ...integration },
          measure: getProductMeasure(prod),
           pricing,
          external,
          ...integration,
        });
      });
      return withCors(NextResponse.json({ 
        items, 
        total: items.length,
        filtro: "Solo productos activos en tienda (estadoTienda: 'Activo')"
      }));
    }

    let producto = null;

    if (id) {
      const ref = doc(db, "productos", id);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const prodData = snap.data();
        // Verificar que el producto esté activo en tienda
        if (prodData.estadoTienda === "Activo") {
          producto = { ...prodData, id: snap.id };
        } else {
          return withCors(NextResponse.json({ 
            error: "Producto inactivo en tienda", 
            estadoTienda: prodData.estadoTienda || "No definido",
            mensaje: "Solo se pueden consultar precios de productos activos en tienda"
          }, { status: 403 }));
        }
      }
    } else if (codigo) {
      const qq = query(
        collection(db, "productos"),
        where("codigo", "==", codigo),
        where("estadoTienda", "==", "Activo"),
        limit(1)
      );
      const snap = await getDocs(qq);
      snap.forEach((d) => (producto = { ...(d.data() || {}), id: d.id }));
    } else if (nombre) {
      // Búsqueda simple por igualdad; para fuzzy ver /api/productos/search
      // SOLO productos activos en tienda
      const qq = query(
        collection(db, "productos"),
        where("nombre", "==", nombre),
        where("estadoTienda", "==", "Activo"),
        limit(1)
      );
      const snap = await getDocs(qq);
      snap.forEach((d) => (producto = { ...(d.data() || {}), id: d.id }));
    } else {
      return withCors(NextResponse.json({ error: "Debe enviar id, codigo o nombre" }, { status: 400 }));
    }

    if (!producto) {
      return withCors(NextResponse.json({ error: "Producto no encontrado" }, { status: 404 }));
    }

    producto = await enrichComboStock(producto);
    const normalized = normalizarProductoEntrada(producto);
    const pricing = calcularPreciosProducto(normalized, { cantidad, redondear, modoRedondeo });
    const integration = getIntegrationFields(producto);
    const external = getExternalProductoFields(producto);
    return withCors(
      NextResponse.json({
        id: producto.id,
        producto: { ...producto, ...integration },
        measure: getProductMeasure(producto),
        pricing,
        external,
        ...integration,
      })
    );
  } catch (err) {
    return withCors(NextResponse.json({ error: err.message }, { status: 500 }));
  }
}

// POST /api/precios  Body: { items: [{ producto: {...}, cantidad } | { id, cantidad } ] }
export async function POST(request) {
  try {
    const body = await request.json();
    const items = Array.isArray(body?.items) ? body.items : [];
    const redondear = body?.redondear == null ? true : Boolean(body.redondear);
    const modoRedondeo = typeof body?.modoRedondeo === "string" ? String(body.modoRedondeo).toLowerCase() : "total";
    if (!Array.isArray(items) || items.length === 0) {
      return withCors(NextResponse.json({ error: "items vacío" }, { status: 400 }));
    }

    const resolvedEntries = await Promise.all(items.map(async (item) => {
      const suppliedProduct = item?.producto;
      const productId = String(item?.id || suppliedProduct?.id || "").trim();
      let product = null;
      if (productId) {
        const snapshot = await getDoc(doc(db, "productos", productId));
        if (snapshot.exists()) product = { id: snapshot.id, ...(snapshot.data() || {}) };
      } else if (suppliedProduct) {
        // Compatibilidad con consumidores antiguos que envían el producto embebido sin ID.
        product = suppliedProduct;
      }
      if (!product) return { item, error: "Producto no encontrado" };
      if (product.estadoTienda !== "Activo") {
        return {
          item,
          error: "Producto inactivo en tienda",
          estadoTienda: product.estadoTienda || "No definido",
          mensaje: "Solo se pueden consultar precios de productos activos en tienda",
        };
      }
      return { item, product: { ...product, id: product.id || item.id } };
    }));
    const eligibleProducts = resolvedEntries.filter((entry) => entry.product).map((entry) => entry.product);
    const enrichedProducts = await enrichProductsStock(eligibleProducts);
    const enrichedById = new Map(enrichedProducts.map((product) => [String(product.id), product]));
    const out = resolvedEntries.map((entry) => {
      if (entry.error) return { error: entry.error, estadoTienda: entry.estadoTienda, mensaje: entry.mensaje, input: entry.item };
      const prod = enrichedById.get(String(entry.product.id)) || entry.product;
      const cantidad = typeof entry.item.cantidad === "number" ? entry.item.cantidad : parseFloat(String(entry.item.cantidad || "1"));
      const normalized = normalizarProductoEntrada(prod);
      const pricing = calcularPreciosProducto(normalized, { cantidad, redondear, modoRedondeo });
      const integration = getIntegrationFields(prod);
      const external = getExternalProductoFields(prod);
      return {
        id: prod.id ?? normalized.id,
        producto: { ...prod, ...integration },
        measure: getProductMeasure(prod),
        pricing,
        external,
        ...integration,
      };
    });

    return withCors(NextResponse.json({ items: out }));
  } catch (err) {
    return withCors(NextResponse.json({ error: err.message }, { status: 500 }));
  }
}


