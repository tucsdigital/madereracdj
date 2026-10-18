const MATCH_FIELDS = ["categoria", "subcategoria", "tipoProducto", "tipoMadera", "unidad", "uso"];

const text = (value) => String(value ?? "").trim();
const key = (value) => text(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es");
const hasOwn = (value, field) => Object.prototype.hasOwnProperty.call(value || {}, field);

function normalizeImages(images) {
  if (!Array.isArray(images)) return [];
  return images
    .slice(0, 50)
    .map((image) => {
      if (typeof image === "string") return { url: image.trim(), alt: "", ratio: "square" };
      return {
        url: text(image?.url),
        alt: text(image?.alt).slice(0, 180),
        ratio: "square",
      };
    })
    .filter((image) => image.url);
}

function normalizePatch(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const patch = {};
  if (hasOwn(source, "description")) {
    patch.description = source.description == null ? null : text(source.description).replace(/<[^>]*>/g, "").slice(0, 6000);
  }
  if (hasOwn(source, "images")) {
    patch.images = source.images == null ? null : normalizeImages(source.images);
  }
  return patch;
}

export function normalizeProductContent(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const products = source.products && typeof source.products === "object" && !Array.isArray(source.products)
    ? Object.fromEntries(Object.entries(source.products).map(([id, patch]) => [String(id), normalizePatch(patch)]))
    : {};
  const rules = Array.isArray(source.rules)
    ? source.rules.slice(0, 300).map((rule, index) => ({
        id: text(rule?.id) || `regla-${index + 1}`,
        active: rule?.active !== false,
        match: Object.fromEntries(MATCH_FIELDS.map((field) => [field, text(rule?.match?.[field])]).filter(([, value]) => value)),
        content: normalizePatch(rule?.content),
        order: Number.isFinite(Number(rule?.order)) ? Number(rule.order) : index,
      }))
    : [];
  return {
    global: normalizePatch(source.global),
    rules,
    products,
  };
}

function sourceImages(product) {
  const values = [product?.imagenes, product?.images, product?.imagen, product?.srcUrl];
  const flatten = (value) => {
    if (Array.isArray(value)) return value.flatMap(flatten);
    if (value && typeof value === "object") return flatten(value.url || value.src || value.imageUrl || value.imagen || value.srcUrl);
    if (typeof value !== "string") return [];
    const cleaned = value.replace(/`/g, "").replace(/%7C/gi, "|").trim();
    const urls = (cleaned.match(/https?:\/\/[^\s"|,]+/g) || []);
    const candidates = urls.length > 1 ? urls : cleaned.split(/\s*\|\s*/);
    return candidates.map((url) => url.trim()).filter((url) => /^(https?:\/\/|\/)/.test(url));
  };
  return [...new Set(values.flatMap(flatten))].map((url) => ({ url, alt: text(product?.nombre || product?.descripcion), ratio: "square" }));
}

function productValue(product, field) {
  if (field === "categoria") return product?.categoria ?? product?.category;
  if (field === "subcategoria") return product?.subcategoria ?? product?.subCategoria ?? product?.subcategory;
  if (field === "unidad") return product?.unidadMedida ?? product?.unidad ?? product?.unit;
  return product?.[field];
}

function matches(product, match) {
  return Object.entries(match || {}).every(([field, expected]) => key(productValue(product, field)) === key(expected));
}

function specificity(rule) {
  return Object.keys(rule.match || {}).length;
}

function specificityRank(rule) {
  return Object.keys(rule.match || {}).some((field) => field !== "categoria") ? 1 : 0;
}

function applyPatch(target, patch) {
  if (hasOwn(patch, "description") && patch.description !== null) target.description = patch.description;
  if (hasOwn(patch, "images") && patch.images !== null && patch.images.length > 0) target.images = patch.images;
}

/** Resuelve el contenido de tienda sin alterar los campos comerciales del producto. */
export function resolveProductContent(product, rawConfig) {
  const config = normalizeProductContent(rawConfig);
  const result = {
    description: text(product?.descripcion ?? product?.description),
    images: sourceImages(product),
    source: { description: "catalogo", images: "catalogo" },
  };

  applyPatch(result, config.global);
  if (hasOwn(config.global, "description") && config.global.description !== null) result.source.description = "global";
  if (hasOwn(config.global, "images") && config.global.images !== null) result.source.images = "global";

  const orderedRules = config.rules
    .map((rule, index) => ({ rule, index }))
    .filter(({ rule }) => rule.active && Object.keys(rule.match).length > 0 && matches(product, rule.match))
    .sort((a, b) => specificity(a.rule) - specificity(b.rule) || specificityRank(a.rule) - specificityRank(b.rule) || a.rule.order - b.rule.order || a.index - b.index);
  for (const { rule } of orderedRules) {
    applyPatch(result, rule.content);
    if (hasOwn(rule.content, "description") && rule.content.description !== null) result.source.description = rule.id;
    if (hasOwn(rule.content, "images") && rule.content.images !== null) result.source.images = rule.id;
  }

  const id = String(product?.id ?? product?.codigo ?? "");
  const override = config.products[id];
  if (override) {
    applyPatch(result, override);
    if (hasOwn(override, "description") && override.description !== null) result.source.description = "producto";
    if (hasOwn(override, "images") && override.images !== null) result.source.images = "producto";
  }

  result.description = String(result.description || "");
  result.images = normalizeImages(result.images);
  return result;
}

export function productContentIssues(rawConfig, imageHosts = []) {
  const config = normalizeProductContent(rawConfig);
  const issues = [];
  const allowedHosts = new Set(imageHosts.map((host) => String(host).toLowerCase()));
  const validatePatch = (patch, label) => {
    if (typeof patch.description === "string" && patch.description.length > 6000) issues.push(`${label}: la descripción supera los 6000 caracteres.`);
    if (patch.images === null || patch.images === undefined) return;
    if (patch.images.length > 12) issues.push(`${label}: se permiten hasta 12 imágenes cuadradas.`);
    patch.images.forEach((image, index) => {
      if (!image.url.startsWith("/images/")) {
        try {
          const url = new URL(image.url);
          if (url.protocol !== "https:" || !allowedHosts.has(url.host.toLowerCase()) || !url.pathname.includes("/tienda/")) {
            issues.push(`${label}, imagen ${index + 1}: usá una imagen local del sitio o cargada en la biblioteca.`);
          }
        } catch {
          issues.push(`${label}, imagen ${index + 1}: la imagen no es válida.`);
        }
      }
    });
  };
  validatePatch(config.global, "Contenido general");
  config.rules.forEach((rule, index) => {
    if (!Object.keys(rule.match).length) issues.push(`Regla ${index + 1}: elegí al menos un filtro.`);
    validatePatch(rule.content, `Regla ${index + 1}`);
  });
  Object.entries(config.products).forEach(([id, patch]) => validatePatch(patch, `Producto ${id}`));
  return [...new Set(issues)];
}

export function productContentImageUrls(rawConfig) {
  const config = normalizeProductContent(rawConfig);
  const urls = new Set();
  const collect = (patch) => (patch?.images || []).forEach((image) => image?.url && urls.add(image.url));
  collect(config.global);
  config.rules.forEach((rule) => collect(rule.content));
  Object.values(config.products).forEach(collect);
  return [...urls];
}
