const toPositiveInt = (value) => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0;
};

const toPositiveQuantity = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.round(parsed * 1_000_000) / 1_000_000;
};

// Unidades comerciales que se venden completas. M2/ML cuentan como unidades de producto
// (cada pieza aporta una medida fija), igual que en ventas y presupuestos, donde se redondea hacia arriba.
const DISCRETE_UNITS = new Set([
  "M2", "MT2", "METROCUADRADO", "METROSCUADRADOS", "ML", "MTL", "METROLINEAL", "METROSLINEALES",
  "U", "UN", "UNI", "UNID", "UNIDAD", "UNIDADES", "PZ", "PZA", "PZAS", "PIEZA", "PIEZAS",
  "CAJA", "CAJAS", "PACK", "PACKS", "PAQUETE", "PAQUETES", "BULTO", "BULTOS",
  "BOLSA", "BOLSAS", "ROLLO", "ROLLOS", "SET", "JUEGO", "JUEGOS", "KIT", "KITS",
  "PAR", "PARES", "DOCENA", "DOCENAS", "BLISTER", "BLISTERS", "PALLET", "PALET",
]);

export function normalizeComboUnit(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[²]/g, "2")
    .replace(/[.\s_-]/g, "");
}

export function isDiscreteComboUnit(value) {
  const unit = normalizeComboUnit(value);
  if (!unit) return false;
  if (DISCRETE_UNITS.has(unit)) return true;
  return ["UNIDAD", "PIEZA", "CAJA", "PACK", "PAQUETE", "BULTO", "BOLSA", "ROLLO", "JUEGO", "KIT", "DOCENA", "BLISTER", "PALLET", "PALET"]
    .some((prefix) => unit.startsWith(prefix));
}

export function normalizeComboQuantity(value) {
  return toPositiveQuantity(value);
}

export function isValidComboQuantity(value, unit) {
  const quantity = Number(value);
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1_000_000) return false;
  if (isDiscreteComboUnit(unit)) return Number.isSafeInteger(quantity);
  return quantity >= 0.001;
}

const getLineItemBaseId = (item) =>
  String(item?.originalId || item?.productoId || item?.id || "").trim();

export function isComboProduct(producto) {
  if (!producto || typeof producto !== "object") return false;
  if (producto.esCombo === true) return true;
  if (String(producto.tipoProducto || "").trim().toLowerCase() === "combo") return true;
  if (String(producto.categoria || "").trim().toLowerCase() === "combos") return true;
  return Array.isArray(producto.componentesCombo) && producto.componentesCombo.length > 0;
}

export function normalizeComboComponents(rawComponents) {
  const grouped = new Map();

  for (const raw of Array.isArray(rawComponents) ? rawComponents : []) {
    const productoId = String(
      raw?.productoId || raw?.id || raw?.originalId || ""
    ).trim();
    const cantidad = toPositiveQuantity(raw?.cantidad);
    if (!productoId || cantidad <= 0) continue;

    const prev = grouped.get(productoId);
    grouped.set(productoId, {
      productoId,
      cantidad: toPositiveQuantity((prev?.cantidad || 0) + cantidad),
      nombre: String(raw?.nombre || prev?.nombre || "").trim(),
      codigo: String(raw?.codigo || prev?.codigo || "").trim(),
      categoria: String(raw?.categoria || prev?.categoria || "").trim(),
      unidadMedida: String(raw?.unidadMedida || prev?.unidadMedida || "").trim(),
    });
  }

  return Array.from(grouped.values());
}

export function getComboComponentIds(producto) {
  return normalizeComboComponents(producto?.componentesCombo).map((item) => item.productoId);
}

export function computeComboStock(combo, productoById = new Map()) {
  return getComboStockAnalysis(combo, productoById).stock;
}

export function computeComboAvailableStock(combo, productoById = new Map(), reservedByProductId = new Map()) {
  const componentes = normalizeComboComponents(combo?.componentesCombo);
  if (componentes.length === 0) return 0;
  let availableCombos = Infinity;
  for (const componente of componentes) {
    const producto = productoById.get(String(componente.productoId));
    const physicalStock = Number(producto?.stock);
    if (!Number.isFinite(physicalStock)) return 0;
    const reserved = Number(reservedByProductId.get(String(componente.productoId))) || 0;
    const availableUnits = Math.max(0, physicalStock - reserved);
    availableCombos = Math.min(availableCombos, Math.floor(availableUnits / componente.cantidad));
  }
  return Number.isFinite(availableCombos) ? Math.max(0, availableCombos) : 0;
}

export function getComboStockAnalysis(combo, productoById = new Map()) {
  const componentes = normalizeComboComponents(combo?.componentesCombo);
  if (componentes.length === 0) {
    return { stock: 0, limitantes: [], componentes: [], costoComponentes: null };
  }

  let maxCombos = Infinity;
  let costoComponentes = 0;
  let costosCompletos = true;
  const componentesAnalizados = [];
  for (const componente of componentes) {
    const producto = productoById.get(String(componente.productoId));
    const stock = Number(producto?.stock);
    const stockValido = Number.isFinite(stock) ? Math.max(0, stock) : 0;
    const available = Math.floor(stockValido / componente.cantidad);
    maxCombos = Math.min(maxCombos, Math.max(0, available));
    const costo = Number(
      producto?.costo ?? producto?.valorCompra ?? producto?.costoCompra ?? 0
    );
    if (Number.isFinite(costo) && costo > 0) {
      costoComponentes += costo * componente.cantidad;
    } else {
      costosCompletos = false;
    }
    componentesAnalizados.push({
      ...componente,
      stock: stockValido,
      requeridoPorCombo: componente.cantidad,
      unidadesArmables: available,
      costoUnitario: Number.isFinite(costo) && costo > 0 ? costo : null,
      costoComponente: Number.isFinite(costo) && costo > 0 ? costo * componente.cantidad : null,
    });
  }

  const stock = Number.isFinite(maxCombos) ? Math.max(0, maxCombos) : 0;
  const limitantes = componentesAnalizados.filter((componente) => componente.unidadesArmables === stock);
  return {
    stock,
    limitantes,
    componentes: componentesAnalizados,
    costoComponentes: costosCompletos ? costoComponentes : null,
  };
}

export function withDerivedComboStock(producto, productoById = new Map()) {
  if (!isComboProduct(producto)) return producto;

  const componentesCombo = normalizeComboComponents(producto?.componentesCombo);
  const stockDerivado = computeComboStock({ ...producto, componentesCombo }, productoById);

  return {
    ...producto,
    esCombo: true,
    tipoProducto: "combo",
    unidadMedida: producto?.unidadMedida || "Unidad",
    unidad: producto?.unidad || producto?.unidadMedida || "Unidad",
    stock: stockDerivado,
    stockCalculadoCombo: stockDerivado,
    componentesCombo,
    comboComponentIds: getComboComponentIds({ componentesCombo }),
  };
}

export function applyDerivedComboStock(productos) {
  const list = Array.isArray(productos) ? productos : [];
  const productoById = new Map(
    list.map((producto) => [String(producto?.id || "").trim(), producto])
  );

  return list.map((producto) => withDerivedComboStock(producto, productoById));
}

export function collectInventoryRequirements({ lineItems, productoById = new Map() }) {
  const requiredById = new Map();
  const combosExpandidos = [];
  const combosInvalidos = [];

  for (const item of Array.isArray(lineItems) ? lineItems : []) {
    const baseId = getLineItemBaseId(item);
    if (!baseId) continue;

    const producto = productoById.get(baseId);
    const esCombo = isComboProduct(item) || isComboProduct(producto);
    const cantidadOriginal = Number(item?.cantidad);
    const cantidadLinea = esCombo ? toPositiveInt(cantidadOriginal) : toPositiveQuantity(cantidadOriginal);

    if (cantidadLinea <= 0) {
      if (esCombo) {
        combosInvalidos.push({
          comboId: baseId,
          comboNombre: String(item?.nombre || producto?.nombre || baseId),
          motivo: "cantidad_combo_invalida",
        });
      }
      continue;
    }

    if (!esCombo) {
      // Las unidades pedidas sin stock (cantidadSinStock) no descuentan ni reservan inventario.
      const sinStock = Math.min(cantidadLinea, toPositiveQuantity(item?.cantidadSinStock));
      if (cantidadLinea - sinStock > 0) requiredById.set(baseId, (requiredById.get(baseId) || 0) + cantidadLinea - sinStock);
      continue;
    }

    const componentesSnapshot = normalizeComboComponents(item?.componentesCombo);
    const componentes = componentesSnapshot.length > 0
      ? componentesSnapshot
      : normalizeComboComponents(producto?.componentesCombo);

    if (componentes.length === 0) {
      combosInvalidos.push({
        comboId: baseId,
        comboNombre: String(item?.nombre || producto?.nombre || baseId),
        motivo: "combo_sin_componentes",
      });
      continue;
    }

    combosExpandidos.push({
      comboId: baseId,
      comboNombre: String(item?.nombre || producto?.nombre || baseId),
      cantidadCombos: cantidadLinea,
      componentes,
    });

    for (const componente of componentes) {
      const requerido = cantidadLinea * componente.cantidad;
      requiredById.set(
        componente.productoId,
        (requiredById.get(componente.productoId) || 0) + requerido
      );
    }
  }

  return {
    requiredById,
    combosExpandidos,
    combosInvalidos,
  };
}
