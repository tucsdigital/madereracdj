const toPositiveInt = (value) => {
  const parsed = Math.ceil(Number(value) || 0);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const getLineItemBaseId = (item) =>
  String(item?.originalId || item?.productoId || item?.id || "").trim();

export function isComboProduct(producto) {
  if (!producto || typeof producto !== "object") return false;
  if (producto.esCombo === true) return true;
  if (String(producto.tipoProducto || "").trim().toLowerCase() === "combo") return true;
  return Array.isArray(producto.componentesCombo) && producto.componentesCombo.length > 0;
}

export function normalizeComboComponents(rawComponents) {
  const grouped = new Map();

  for (const raw of Array.isArray(rawComponents) ? rawComponents : []) {
    const productoId = String(
      raw?.productoId || raw?.id || raw?.originalId || ""
    ).trim();
    const cantidad = toPositiveInt(raw?.cantidad);
    if (!productoId || cantidad <= 0) continue;

    const prev = grouped.get(productoId);
    grouped.set(productoId, {
      productoId,
      cantidad: (prev?.cantidad || 0) + cantidad,
      nombre: String(raw?.nombre || prev?.nombre || "").trim(),
      codigo: String(raw?.codigo || prev?.codigo || "").trim(),
    });
  }

  return Array.from(grouped.values());
}

export function getComboComponentIds(producto) {
  return normalizeComboComponents(producto?.componentesCombo).map((item) => item.productoId);
}

export function computeComboStock(combo, productoById = new Map()) {
  const componentes = normalizeComboComponents(combo?.componentesCombo);
  if (componentes.length === 0) return 0;

  let maxCombos = Infinity;
  for (const componente of componentes) {
    const producto = productoById.get(String(componente.productoId));
    const stock = Number(producto?.stock);
    if (!Number.isFinite(stock) || stock <= 0) return 0;

    const available = Math.floor(stock / componente.cantidad);
    maxCombos = Math.min(maxCombos, Math.max(0, available));
  }

  return Number.isFinite(maxCombos) ? Math.max(0, maxCombos) : 0;
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
    const cantidadLinea = toPositiveInt(item?.cantidad);
    if (!baseId || cantidadLinea <= 0) continue;

    const producto = productoById.get(baseId);
    const esCombo = isComboProduct(item) || isComboProduct(producto);

    if (!esCombo) {
      requiredById.set(baseId, (requiredById.get(baseId) || 0) + cantidadLinea);
      continue;
    }

    const componentes = normalizeComboComponents(
      item?.componentesCombo || producto?.componentesCombo
    );

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
