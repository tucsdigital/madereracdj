"use client";

export const TICKET_PRIORITIES = [
  { id: "low", label: "Baja" },
  { id: "medium", label: "Media" },
  { id: "high", label: "Alta" },
  { id: "urgent", label: "Urgente" },
];

export const TICKET_STATUSES = [
  { id: "open", label: "Abierto" },
  { id: "triage", label: "Triage" },
  { id: "in_progress", label: "En progreso" },
  { id: "blocked", label: "Bloqueado" },
  { id: "waiting_client", label: "Esperando cliente" },
  { id: "done", label: "Finalizado" },
  { id: "cancelled", label: "Cancelado" },
];

export const TICKET_MODULES = [
  { id: "general", label: "General" },
  { id: "ventas", label: "Ventas / Presupuestos" },
  { id: "envios", label: "Envíos" },
  { id: "productos", label: "Productos" },
  { id: "stock", label: "Stock" },
  { id: "gastos", label: "Gastos" },
  { id: "dolares", label: "Dólares" },
  { id: "proveedores", label: "Proveedores" },
  { id: "obras", label: "Obras" },
  { id: "documentacion", label: "Documentación" },
  { id: "clientes", label: "Clientes" },
  { id: "precios", label: "Precios" },
  { id: "auditoria", label: "Auditoría" },
  { id: "asistencia", label: "Asistencia" },
];

export const TICKETS_AGENCY_ASSIGNEES = [
  { id: "coco", label: "Coco", email: "brian@maderascaballero.com" },
  { id: "damian", label: "Damian", email: "luisdamian@maderascaballero.com" },
  { id: "ivan", label: "Ivan", email: "ivan@maderascaballero.com" },
];

export const findAgencyAssigneeByEmail = (email) => {
  const e = normalizeEmail(email);
  if (!e) return null;
  return TICKETS_AGENCY_ASSIGNEES.find((a) => normalizeEmail(a.email) === e) || null;
};

export const getTicketsAdminEmails = () => {
  const raw = (process.env.NEXT_PUBLIC_TICKETS_ADMIN_EMAILS || "").trim();
  const fallback = ["admin@admin.com"];
  if (!raw) return fallback;
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
};

export const isTicketsAdminUser = (user) => {
  const email = String(user?.email || "").toLowerCase().trim();
  if (!email) return false;
  const allow = getTicketsAdminEmails();
  return allow.includes(email);
};

export const toIsoNow = () => new Date().toISOString();

export const normalizeEmail = (v) => String(v || "").trim().toLowerCase();

export const uniqueEmails = (emails = []) => {
  const out = [];
  const seen = new Set();
  for (const e of emails) {
    const n = normalizeEmail(e);
    if (!n) continue;
    if (seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
};

export const labelFor = (arr, id, fallback = "-") => {
  const found = (Array.isArray(arr) ? arr : []).find((x) => x.id === id);
  return found?.label || fallback;
};

export const formatDateAR = (isoDate) => {
  const s = String(isoDate || "").trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "";
  const [, y, mo, d] = m;
  return `${d}/${mo}/${y}`;
};

export const parseDateARToISO = (arDate) => {
  const s = String(arDate || "").trim();
  if (!s) return "";
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const d = Number(dd);
  const mo = Number(mm);
  const y = Number(yyyy);
  if (!(y >= 2000 && y <= 2100)) return null;
  if (!(mo >= 1 && mo <= 12)) return null;
  if (!(d >= 1 && d <= 31)) return null;
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== mo - 1 ||
    date.getUTCDate() !== d
  ) {
    return null;
  }
  const mm2 = String(mo).padStart(2, "0");
  const dd2 = String(d).padStart(2, "0");
  return `${y}-${mm2}-${dd2}`;
};
