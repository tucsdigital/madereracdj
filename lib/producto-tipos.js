// Modelo de edición de productos: qué campos tiene cada tipo, cómo se llaman, cómo se leen y cómo se guardan.
// Es JavaScript puro (sin Firebase ni React) para usarlo en la pantalla y probarlo.
import { isComboProduct } from "@/lib/combos";
import { calcularPreciosProducto, normalizarProductoEntrada, PricingUtils } from "@/lib/pricing";
import { commercialUnit } from "@/lib/product-measure";

const strip = (value) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

/** Número tolerante: "1.250,50", "1250.5" o "" (devuelve null si no es un número). */
export function parseNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const raw = String(value).trim();
  if (!raw) return null;
  const n = PricingUtils.toNumberPlain(raw);
  return Number.isFinite(n) && /\d/.test(raw) ? n : null;
}

const positive = (value) => {
  const n = parseNumber(value);
  return n !== null && n > 0 ? n : null;
};

/* ---------- Tipos ---------- */

export const KIND_LABEL = {
  madera: "Madera",
  ferreteria: "Ferretería",
  combo: "Combo",
  general: "Producto",
  obra: "Obra",
};

export const KIND_HELP = {
  madera: "Se vende por pie, m², metro lineal o unidad. El precio de cada pieza se calcula con sus medidas.",
  ferreteria: "Se vende por unidad o presentación. Tiene costo y precio de venta.",
  combo: "Reúne otros productos. Su stock y su costo se calculan según la composición.",
  general: "Producto con costo y precio de venta. Las medidas aparecen si se vende por m² o metro lineal.",
  obra: "Producto de obras. No se vende en la tienda.",
};

export function getProductKind(producto, collection = "productos") {
  if (collection === "productos_obras") return "obra";
  if (isComboProduct(producto) || strip(producto?.categoria) === "combos") return "combo";
  const categoria = strip(producto?.categoria);
  if (categoria === "maderas" || categoria === "madera") return "madera";
  if (categoria === "ferreteria") return "ferreteria";
  return "general";
}

/** Tipo según la categoría elegida en el formulario (puede cambiar mientras se edita). */
export function kindForCategory(categoria, collection = "productos") {
  return getProductKind({ categoria }, collection);
}

/* ---------- Unidades ---------- */

export const WOOD_UNITS = [
  { key: "Pie", label: "Pie tablar", store: "pie" },
  { key: "M2", label: "Metro cuadrado (m²)", store: "M2" },
  { key: "ML", label: "Metro lineal (ml)", store: "ML" },
  { key: "Unidad", label: "Unidad", store: "Unidad" },
];

export const DEFAULT_UNITS = ["Unidad", "Caja", "Pack", "Kit", "Rollo", "Bolsa", "Par", "Juego"];

export function getUnitKey(kind, unidad) {
  return commercialUnit({ unidadMedida: unidad, categoria: kind === "madera" ? "Maderas" : "" });
}

/** Valor que se guarda al elegir una unidad (conserva las mayúsculas históricas del producto). */
export function storedUnit(kind, key, current) {
  if (kind === "combo") return "Unidad";
  if (kind !== "madera") return key;
  if (getUnitKey(kind, current) === key && String(current ?? "").trim()) return String(current).trim();
  return WOOD_UNITS.find((unit) => unit.key === key)?.store ?? key;
}

/** Quita duplicados que sólo difieren en mayúsculas o tildes ("Pie" y "pie"). */
export function uniqueOptions(values) {
  const seen = new Map();
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (!text) continue;
    const key = strip(text);
    if (!seen.has(key)) seen.set(key, text);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, "es"));
}

/* ---------- Medidas ---------- */

export const MEASURE_HELP = {
  largo: "Largo de la pieza, en metros.",
  ancho: "Ancho de la pieza, en pulgadas.",
  espesor: "Espesor de la pieza, en pulgadas.",
  anchoUtil: "Ancho que cubre una pieza una vez colocada, en metros.",
};

export function getMeasureFields(kind, unitKey) {
  if (kind === "combo" || kind === "obra" || kind === "ferreteria") return [];
  if (unitKey === "Pie" && kind === "madera") {
    return [
      { key: "largo", label: "Largo", suffix: "m", help: MEASURE_HELP.largo },
      { key: "ancho", label: "Ancho", suffix: "pulg", help: MEASURE_HELP.ancho },
      { key: "espesor", label: "Espesor", suffix: "pulg", help: MEASURE_HELP.espesor },
    ];
  }
  if (unitKey === "M2") {
    return [
      { key: "largo", label: "Largo", suffix: "m", help: MEASURE_HELP.largo },
      { key: "anchoUtil", label: "Ancho útil", suffix: "m", help: MEASURE_HELP.anchoUtil },
    ];
  }
  if (unitKey === "ML") return [{ key: "largo", label: "Largo", suffix: "m", help: MEASURE_HELP.largo }];
  return [];
}

/* ---------- Precios ---------- */

export function getPriceModel(kind, unitKey) {
  if (kind === "madera") {
    const label = unitKey === "M2" ? "Precio por m²" : unitKey === "ML" ? "Precio por metro lineal" : unitKey === "Unidad" ? "Precio por unidad" : "Precio por pie";
    return {
      field: "precioPorPie",
      label,
      help: unitKey === "Unidad" ? "Es el precio final de cada unidad." : `Se multiplica por las medidas de la pieza para obtener su precio. ${label} en pesos.`,
      showPiece: true,
    };
  }
  return { field: "valorVenta", label: "Precio de venta", help: "Lo que paga el cliente por cada unidad, antes de descuentos.", showPiece: false };
}

const SALE_ALIASES = ["precioCalculado", "precioUnidad", "precioUnidadVenta", "precioUnidadHerraje", "precioUnidadQuimico", "precioUnidadHerramienta"];

export function readSalePrice(kind, p) {
  const money = (v) => {
    const n = PricingUtils.toMoneyNumber(v);
    return n > 0 ? n : null;
  };
  if (kind === "madera") return money(p?.precioPorPie);
  if (kind === "combo") return money(p?.precioVenta) ?? money(p?.valorVenta);
  return money(p?.valorVenta) ?? money(p?.precioVenta) ?? money(p?.precioCalculado);
}

export function readCost(p) {
  const n = PricingUtils.toMoneyNumber(p?.costo ?? p?.Costo ?? p?.valorCompra);
  return n > 0 ? n : null;
}

/** Valores de venta guardados que no coinciden entre sí (la tienda tomaba el mayor). */
export function detectPriceConflict(kind, p) {
  if (kind === "madera" || kind === "combo" || kind === "obra") return null;
  const values = [["valorVenta", p?.valorVenta], ["precioVenta", p?.precioVenta], ["precioCalculado", p?.precioCalculado]]
    .map(([field, raw]) => ({ field, value: PricingUtils.toMoneyNumber(raw) }))
    .filter((item) => item.value > 0);
  const distinct = new Set(values.map((item) => Math.round(item.value * 100)));
  return distinct.size > 1 ? values : null;
}

/** Productos con precios de venta guardados distintos: informe para revisarlos antes de unificarlos. */
export function findPriceConflicts(productos) {
  return (Array.isArray(productos) ? productos : [])
    .map((p) => {
      const kind = getProductKind(p, p?.__collection);
      const values = detectPriceConflict(kind, p);
      return values ? { id: p.id, codigo: p.codigo || "", nombre: p.nombre || "", categoria: p.categoria || "", kind, values, mayor: Math.max(...values.map((v) => v.value)) } : null;
    })
    .filter(Boolean)
    .sort((a, b) => String(a.codigo).localeCompare(String(b.codigo), "es"));
}

/* ---------- Formulario ---------- */

const text = (value) => String(value ?? "");
const numText = (value) => (value === null || value === undefined || value === "" ? "" : String(value));

export function readPack(raw) {
  const source = String(raw ?? "").trim();
  if (!source) return { value: "", legacy: "" };
  if (/^\d+$/.test(source)) return { value: source, legacy: "" };
  return { value: "", legacy: source };
}

export function productToForm(p, { collection = "productos", kind } = {}) {
  const k = kind || getProductKind(p, collection);
  const unitKey = getUnitKey(k, p?.unidadMedida || p?.unidad);
  const pack = readPack(p?.pack ?? p?.packSize);
  const alto = positive(p?.alto);
  const espesor = positive(p?.espesor);
  const price = readSalePrice(k, p);
  const cost = readCost(p);
  const pct = Number(p?.discount?.percentage) || 0;
  const amount = Number(p?.discount?.amount) || 0;
  return {
    codigo: text(p?.codigo),
    nombre: text(p?.nombre),
    categoria: text(p?.categoria),
    subcategoria: text(p?.subcategoria ?? p?.subCategoria),
    descripcion: text(p?.descripcion),
    detalle: text(p?.detalle),
    proveedor: text(p?.proveedor),
    uso: text(p?.uso),
    tipoMaterial: text(p?.tipoMaterial ?? p?.tipoMadera),
    unidadMedida: text(p?.unidadMedida || p?.unidad),
    deposito: text(p?.deposito || "deposito_1"),
    ubicacion: text(p?.ubicacion),
    estado: text(p?.estado || "Activo"),
    // Sin estado de tienda el producto no se publica: se muestra como Inactivo hasta que se decida.
    estadoTienda: text(p?.estadoTienda || "Inactivo"),
    largo: numText(p?.largo),
    ancho: numText(p?.ancho),
    // Ventas usa `alto`; la tienda prefiere `espesor`. Se lee `alto` y se unifica al guardar.
    espesor: numText(unitKey === "Pie" ? alto ?? espesor : espesor ?? alto),
    anchoUtil: numText(positive(p?.anchoUtil) ?? alto ?? positive(p?.ancho)),
    rendimiento: numText(p?.rendimiento ?? p?.rendimientoM2),
    peso: numText(p?.peso),
    costo: cost === null ? "" : String(cost),
    precio: price === null ? "" : String(price),
    stock: numText(p?.stock),
    stockMinimo: numText(p?.stockMinimo),
    minimoCompra: numText(p?.minimoCompra ?? p?.minCompra ?? 1),
    pack: pack.value,
    packLegacy: pack.legacy,
    imagenes: normalizeImages(p?.imagenes),
    discountMode: pct > 0 ? "percentage" : "amount",
    discountValue: pct > 0 ? String(pct) : amount > 0 ? String(amount) : "",
    newArrival: p?.newArrival === true,
    featuredBrand: p?.featuredBrand === true,
    specialOffer: p?.specialOffer === true,
  };
}

export function normalizeImages(value) {
  if (Array.isArray(value)) return value.map((v) => String(v ?? "").trim()).filter(Boolean);
  if (typeof value === "string") return value.split("|").map((v) => v.trim()).filter(Boolean);
  return [];
}

/** Campos del formulario que cambiaron (sirve para el contador de cambios y la barra de guardado). */
export function diffForm(initial, current) {
  if (!initial || !current) return [];
  return Object.keys(current).filter((key) => key !== "packLegacy" && JSON.stringify(initial[key] ?? "") !== JSON.stringify(current[key] ?? ""));
}

export const SECTION_OF_FIELD = {
  codigo: "general", nombre: "general", categoria: "general", subcategoria: "general", proveedor: "general", uso: "general",
  tipoMaterial: "general", deposito: "general", ubicacion: "general", estado: "general", estadoTienda: "general",
  descripcion: "descripcion", detalle: "descripcion",
  unidadMedida: "medidas", largo: "medidas", ancho: "medidas", espesor: "medidas", anchoUtil: "medidas", rendimiento: "medidas", peso: "medidas",
  costo: "precio", precio: "precio",
  stock: "stock", stockMinimo: "stock", minimoCompra: "stock", pack: "stock",
  imagenes: "imagenes",
  discountMode: "tienda", discountValue: "tienda", newArrival: "tienda", featuredBrand: "tienda", specialOffer: "tienda",
};

/* ---------- Precio de la pieza (madera) ---------- */

export function computePiecePrice(form, unitKey) {
  const rate = positive(form.precio);
  if (!rate) return 0;
  const stored = storedUnit("madera", unitKey, form.unidadMedida);
  const entrada = normalizarProductoEntrada({
    categoria: "Maderas",
    unidadMedida: stored,
    unidad: stored,
    alto: unitKey === "M2" ? form.anchoUtil : unitKey === "Pie" ? form.espesor : form.anchoUtil,
    ancho: form.ancho,
    largo: form.largo,
    precioPorPie: rate,
    ...(unitKey === "M2" ? { anchoUtil: form.anchoUtil } : {}),
    ...(unitKey === "Pie" ? { espesor: form.espesor } : {}),
  });
  const result = calcularPreciosProducto(entrada, { cantidad: 1 });
  return Number(result.precioUnitarioBase) || 0;
}

/** Precio que ve el cliente por unidad: el de la pieza o el precio de venta, con el descuento aplicado. */
export function previewStorePrice(form, kind) {
  const unitKey = getUnitKey(kind, form.unidadMedida);
  const base = kind === "madera" ? computePiecePrice(form, unitKey) : positive(form.precio) || 0;
  const value = positive(form.discountValue) || 0;
  const final = form.discountMode === "percentage" ? base * (1 - Math.min(100, value) / 100) : base - value;
  return { base, final: Math.max(0, Math.round(final * 100) / 100), discounted: base > 0 && final < base };
}

/* ---------- Validación ---------- */

export function validateProductForm(form, { kind, collection = "productos", blockPriceEdits = false } = {}) {
  const errors = {};
  const warnings = {};
  const req = (field, message) => { if (!String(form[field] ?? "").trim()) errors[field] = message; };
  const unitKey = getUnitKey(kind, form.unidadMedida);

  req("codigo", "Ingresá el código del producto.");
  req("nombre", "Ingresá el nombre del producto.");
  req("categoria", "Elegí una categoría.");
  if (kind !== "combo") req("unidadMedida", "Elegí la unidad de medida.");
  req("deposito", "Elegí el depósito.");
  if (kind !== "combo" && kind !== "obra") req("subcategoria", "Elegí una subcategoría.");
  const html = String(form.descripcion ?? "").replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
  if (!html) errors.descripcion = "Escribí una descripción: es lo que ve el cliente en la tienda.";

  if (kind !== "obra" && !blockPriceEdits) {
    const label = getPriceModel(kind, unitKey).label;
    if (!positive(form.precio)) errors.precio = `Ingresá el ${label.toLowerCase()} (mayor a 0).`;
    const cost = parseNumber(form.costo);
    if (form.costo !== "" && (cost === null || cost < 0)) errors.costo = "El costo debe ser un número igual o mayor a 0.";
    if (kind !== "madera" && kind !== "combo" && positive(form.precio) && cost && positive(form.precio) < cost) {
      warnings.precio = "El precio de venta es menor al costo: vas a perder plata en cada venta.";
    }
  }

  // Las medidas sólo son obligatorias en maderas: son las que calculan el precio de la pieza.
  if (kind === "madera") {
    for (const field of getMeasureFields(kind, unitKey)) {
      if (!positive(form[field.key])) errors[field.key] = `Ingresá ${field.label.toLowerCase()} (${field.suffix}) mayor a 0.`;
    }
  }

  if (form.peso !== "") {
    const peso = parseNumber(form.peso);
    if (peso === null || peso < 0 || peso > 100) errors.peso = "El peso va de 0 a 100 kg.";
  }
  if (kind !== "combo" && form.stock !== "") {
    const stock = parseNumber(form.stock);
    if (stock === null || stock < 0) errors.stock = "El stock no puede ser negativo.";
  }
  if (form.stockMinimo !== "") {
    const value = parseNumber(form.stockMinimo);
    if (value === null || value < 0) errors.stockMinimo = "El stock mínimo no puede ser negativo.";
  }
  const min = parseNumber(form.minimoCompra);
  const integerText = (value) => /^\d+$/.test(String(value ?? "").trim());
  if (form.minimoCompra !== "" && (!integerText(form.minimoCompra) || min < 1)) errors.minimoCompra = "La compra mínima es un número entero de 1 o más.";
  const pack = integerText(form.pack) ? parseNumber(form.pack) : null;
  if (form.pack !== "" && (pack === null || pack < 1)) errors.pack = "El pack es la cantidad de unidades por pack, en número entero.";
  if (pack && pack > 1 && min && min % pack !== 0 && !errors.minimoCompra) warnings.minimoCompra = `Con packs de ${pack}, la tienda redondea la compra mínima al próximo múltiplo.`;

  const discount = parseNumber(form.discountValue);
  if (form.discountValue !== "") {
    if (discount === null || discount < 0) errors.discountValue = "El descuento debe ser un número igual o mayor a 0.";
    else if (form.discountMode === "percentage" && discount > 100) errors.discountValue = "El porcentaje no puede superar 100.";
    else if (form.discountMode === "amount" && positive(form.precio) && kind !== "madera" && discount >= positive(form.precio)) errors.discountValue = "El descuento no puede ser igual o mayor al precio.";
  }
  return { errors, warnings, valid: Object.keys(errors).length === 0 };
}

/* ---------- Guardado ---------- */

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Cambios que hay que escribir en el producto: sólo lo modificado, en los campos que realmente lee el sistema
 * y la tienda. Los combos agregan su composición y su precio en la pantalla.
 */
export function buildProductUpdates({ producto, form, kind, collection = "productos", blockPriceEdits = false }) {
  const u = {};
  const unitKey = getUnitKey(kind, form.unidadMedida);
  const initial = productToForm(producto, { collection, kind });
  const changed = (...keys) => keys.some((key) => !same(initial[key], form[key]));
  const setText = (key, current = producto[key]) => {
    const next = String(form[key] ?? "").trim();
    if (next !== String(current ?? "").trim()) u[key] = next;
  };
  const setNumber = (key, current, { min, max, nullable = true, integer = false } = {}) => {
    const raw = form[key];
    const parsed = parseNumber(raw);
    const before = parseNumber(current);
    if (raw === "" || raw === null || raw === undefined) {
      if (before !== null && nullable) u[key] = null;
      return;
    }
    if (parsed === null) return;
    let value = integer ? Math.trunc(parsed) : parsed;
    if (min !== undefined) value = Math.max(min, value);
    if (max !== undefined) value = Math.min(max, value);
    if (value !== before) u[key] = value;
  };

  setText("codigo");
  setText("nombre");
  setText("categoria");
  if (form.descripcion !== (producto.descripcion ?? "")) u.descripcion = form.descripcion;
  setText("detalle");
  setText("proveedor");
  setText("uso");
  setText("deposito", producto.deposito || "deposito_1");
  setText("estado", producto.estado || "Activo");
  setText("estadoTienda", producto.estadoTienda || "Inactivo");
  if (kind === "madera") setText("ubicacion");

  const subActual = String(producto.subcategoria ?? producto.subCategoria ?? "");
  if (collection === "productos_obras") {
    if (form.subcategoria !== subActual) u.subCategoria = form.subcategoria;
    if (String(producto.subcategoria ?? "") !== "") u.subcategoria = "";
  } else {
    if (form.subcategoria !== subActual) u.subcategoria = form.subcategoria;
    if (String(producto.subCategoria ?? "") !== "") u.subCategoria = "";
  }

  // El material se guarda en los dos nombres que usa la tienda (tipoMadera tiene prioridad si quedara viejo).
  const material = String(form.tipoMaterial ?? "").trim();
  if (material !== String(producto.tipoMaterial ?? producto.tipoMadera ?? "").trim()) {
    u.tipoMaterial = material;
    if (kind === "madera" || "tipoMadera" in producto) u.tipoMadera = material;
  }

  if (kind !== "combo") {
    const stored = kind === "madera" ? storedUnit(kind, unitKey, form.unidadMedida) : String(form.unidadMedida ?? "").trim();
    if (stored !== String(producto.unidadMedida ?? "")) u.unidadMedida = stored;
  }

  // Medidas: se escriben en los campos que leen ventas (alto) y la tienda (anchoUtil, espesor) a la vez.
  if (changed("unidadMedida", "largo", "ancho", "espesor", "anchoUtil", "rendimiento") && (kind === "madera" || unitKey === "M2" || unitKey === "ML")) {
    if (unitKey === "Pie" && kind === "madera") {
      setNumber("largo", producto.largo);
      setNumber("ancho", producto.ancho);
      const espesor = parseNumber(form.espesor);
      if (espesor !== null) {
        if (espesor !== parseNumber(producto.alto)) u.alto = espesor;
        if (espesor !== parseNumber(producto.espesor)) u.espesor = espesor;
      }
      if (producto.anchoUtil != null && producto.anchoUtil !== "") u.anchoUtil = null;
    } else if (unitKey === "M2") {
      setNumber("largo", producto.largo);
      const util = parseNumber(form.anchoUtil);
      if (util !== null) {
        if (util !== parseNumber(producto.alto)) u.alto = util;
        if (util !== parseNumber(producto.anchoUtil)) u.anchoUtil = util;
        if (producto.espesor != null && producto.espesor !== "") u.espesor = null;
      }
      setNumber("rendimiento", producto.rendimiento ?? producto.rendimientoM2, { min: 0 });
    } else if (unitKey === "ML") {
      setNumber("largo", producto.largo);
    }
  }
  if (kind !== "combo") setNumber("peso", producto.peso, { min: 0, max: 100 });

  if (kind !== "combo") setNumber("stock", producto.stock, { min: 0, nullable: false });
  setNumber("stockMinimo", producto.stockMinimo, { min: 0 });
  const min = parseNumber(form.minimoCompra);
  const minBefore = parseNumber(producto.minimoCompra ?? producto.minCompra ?? 1);
  if (form.minimoCompra === "") {
    if (minBefore !== 1) u.minimoCompra = 1;
  } else if (min !== null && Math.max(1, Math.trunc(min)) !== minBefore) {
    u.minimoCompra = Math.max(1, Math.trunc(min));
  }
  const packNow = String(parseNumber(form.pack) ? Math.trunc(parseNumber(form.pack)) : "");
  // Un pack con texto antiguo ("Caja x12") se conserva hasta que se ingrese el número.
  if (changed("pack") && packNow !== String(producto.pack ?? producto.packSize ?? "").trim()) u.pack = packNow;

  if (!blockPriceEdits && kind !== "obra") {
    const price = positive(form.precio);
    if (kind === "madera") {
      const rate = price;
      if (changed("precio") && rate !== null && rate !== parseNumber(producto.precioPorPie)) u.precioPorPie = rate;
      if (changed("precio", "unidadMedida", "largo", "ancho", "espesor", "anchoUtil")) {
        const piece = computePiecePrice({ ...form, precio: rate ?? "" }, unitKey);
        const cepillado = producto.cepilladoAplicado === true && unitKey !== "Unidad";
        const stored = piece > 0 ? Math.round((cepillado ? piece * 1.06 : piece) / 100) * 100 : null;
        if (stored !== null && stored !== parseNumber(producto.precioCalculado)) u.precioCalculado = stored;
      }
    } else if (kind === "combo") {
      if (price !== null && price !== parseNumber(producto.precioVenta ?? producto.valorVenta)) u.precioVenta = price;
    } else if (price !== null && changed("precio")) {
      // Todos los campos de venta quedan iguales: la tienda toma el mayor, así que ninguno puede quedar viejo.
      const targets = ["valorVenta", "precioVenta", ...SALE_ALIASES.filter((key) => producto[key] != null && producto[key] !== "")];
      for (const key of targets) if (PricingUtils.toMoneyNumber(producto[key]) !== price) u[key] = price;
    }
    if (kind !== "combo") {
      const cost = parseNumber(form.costo);
      const targets = kind === "madera" ? ["costo"] : ["costo", "valorCompra"];
      if (form.costo === "") {
        for (const key of targets) if (producto[key] != null && producto[key] !== "") u[key] = null;
      } else if (cost !== null && cost >= 0) {
        for (const key of targets) if (parseNumber(producto[key]) !== cost) u[key] = cost;
      }
    }
  }

  if (!same(normalizeImages(producto.imagenes), form.imagenes)) u.imagenes = form.imagenes;

  const value = Math.max(0, parseNumber(form.discountValue) || 0);
  const discount = form.discountMode === "percentage" ? { amount: 0, percentage: Math.min(100, value) } : { amount: value, percentage: 0 };
  const before = { amount: Math.max(0, Number(producto.discount?.amount) || 0), percentage: Math.max(0, Math.min(100, Number(producto.discount?.percentage) || 0)) };
  if (!same(discount, before)) u.discount = discount;

  for (const flag of ["newArrival", "featuredBrand", "specialOffer"]) {
    if (form[flag] !== (producto[flag] === true)) u[flag] = form[flag];
  }
  return u;
}
