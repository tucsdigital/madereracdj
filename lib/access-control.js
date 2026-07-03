// Reglas simples de acceso por usuario (email).
// Nota: si más adelante querés roles, esto se puede migrar a claims / Firestore.

function extractEmail(userOrEmail) {
  if (typeof userOrEmail === "string") return userOrEmail;
  const user = userOrEmail;
  if (!user || typeof user !== "object") return "";
  const direct = user.email;
  if (direct) return direct;
  const providerData = Array.isArray(user.providerData) ? user.providerData : [];
  const fromProvider = providerData.find((p) => p?.email)?.email;
  if (fromProvider) return fromProvider;
  if (user.user?.email) return user.user.email;
  if (user.data?.email) return user.data.email;
  return "";
}

const normalizeEmail = (userOrEmail) =>
  (extractEmail(userOrEmail) || "").toString().trim().toLowerCase();

const RESTRICTED_DASHBOARD_EMAILS = new Set([]);
const RESTRICTED_COST_EMAILS = new Set([]);
const RESTRICTED_SECTIONS_EMAILS = new Set([]);
const RESTRICTED_SECTION_IDS = new Set(["dashboard", "gastos", "proveedores"]);
const RESTRICTED_SECTION_HREFS = new Set(["/dashboard", "/gastos", "/proveedores"]);

function parseFlag(v) {
  if (v == null) return true;
  const s = String(v).trim().toLowerCase();
  return ["1", "true", "t", "si", "sí", "yes", "y"].includes(s);
}

const FEATURE_FLAGS = {
  deliveryZonesEnabled: parseFlag(process.env.NEXT_PUBLIC_DELIVERY_ZONES_ENABLED),
};

export function canViewDashboard(user) {
  const email = normalizeEmail(user);
  if (!email) return true;
  return !RESTRICTED_DASHBOARD_EMAILS.has(email);
}

export function canViewGastos(user) {
  const email = normalizeEmail(user);
  if (!email) return true;
  return !RESTRICTED_SECTIONS_EMAILS.has(email);
}

export function canViewProveedores(user) {
  const email = normalizeEmail(user);
  if (!email) return true;
  return !RESTRICTED_SECTIONS_EMAILS.has(email);
}

export function canAccessSection(user, { id, href, title, roles, featureFlag }) {
  const email = normalizeEmail(user);
  if (featureFlag && !FEATURE_FLAGS[featureFlag]) {
    return false;
  }
  if (roles && Array.isArray(roles) && user) {
    const userRole = user.role || user.rol;
    if (userRole && !roles.includes(userRole)) return false;
  }
  if (!email) return true;
  if (!RESTRICTED_SECTIONS_EMAILS.has(email)) return true;

  const _id = (id || "").toString().toLowerCase();
  const _href = (href || "").toString();
  const _title = (title || "").toString().toLowerCase();

  if (RESTRICTED_SECTION_IDS.has(_id)) return false;
  if (RESTRICTED_SECTION_HREFS.has(_href)) return false;
  if (/^\/([a-z]{2}\/)?dashboard(\/|$)/i.test(_href)) return false;
  if (/^\/([a-z]{2}\/)?gastos(\/|$)/i.test(_href)) return false;
  if (/^\/([a-z]{2}\/)?proveedores(\/|$)/i.test(_href)) return false;
  if (RESTRICTED_SECTION_IDS.has(_title)) return false;
  return true;
}

export function shouldHideProductCost(user) {
  const email = normalizeEmail(user);
  if (!email) return false;
  return RESTRICTED_COST_EMAILS.has(email);
}

export function shouldRestrictProductPricing(user) {
  const email = normalizeEmail(user);
  if (!email) return false;
  return RESTRICTED_COST_EMAILS.has(email);
}

export function shouldHideStockActions(user) {
  const email = normalizeEmail(user);
  if (!email) return false;
  return RESTRICTED_COST_EMAILS.has(email);
}

export function filterMenusForUser(menus, user) {
  if (!Array.isArray(menus)) return [];
  return menus.filter((item) => {
    if (!item || typeof item !== "object") return false;
    if (item.isHeader) return true;
    return canAccessSection(user, item);
  });
}
