/**
 * Funciones de formateo para el sistema de PDF Remito
 */

/**
 * Formatea un número como moneda argentina
 */
export function formatCurrency(num: number | undefined | null): string {
  if (num === undefined || num === null || isNaN(num)) return "-";
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

/**
 * Formatea un número como texto argentino (sin símbolo de moneda)
 */
export function formatNumber(num: number | undefined | null): string {
  if (num === undefined || num === null || isNaN(num)) return "-";
  return num.toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Formatea una fecha a formato local argentino (DD/MM/YYYY)
 */
export function formatFechaLocal(dateString: string | undefined | null): string {
  if (!dateString) return "-";
  
  try {
    let date: Date;
    
    if (dateString.includes("T")) {
      date = new Date(dateString);
    } else {
      const [year, month, day] = dateString.split("-");
      if (!year || !month || !day) return dateString;
      date = new Date(Number(year), Number(month) - 1, Number(day));
    }
    
    if (isNaN(date.getTime())) return dateString;
    
    return date.toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return dateString;
  }
}

/**
 * Calcula fecha de vencimiento (30 días después de la fecha)
 */
export function calcularFechaVencimiento(fecha: string): string {
  if (!fecha) return "";
  
  try {
    let date: Date;
    
    if (fecha.includes("T")) {
      date = new Date(fecha);
    } else {
      const [year, month, day] = fecha.split("-");
      if (!year || !month || !day) return "";
      date = new Date(Number(year), Number(month) - 1, Number(day));
    }
    
    if (isNaN(date.getTime())) return "";
    
    date.setDate(date.getDate() + 30);
    
    return date.toISOString().split("T")[0];
  } catch {
    return "";
  }
}

/**
 * Genera número de comprobante con fallback
 */
export function buildNumeroComprobante(
  numeroPedido: string | undefined,
  id: string | undefined
): string {
  if (numeroPedido) return numeroPedido;
  if (id) return id.slice(-8).toUpperCase();
  return "SIN-NUMERO";
}

/**
 * Escapa HTML para prevenir XSS
 */
export function escapeHtml(text: string | undefined | null): string {
  if (!text) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Texto seguro con fallback
 */
export function safeText(
  text: string | undefined | null,
  fallback: string = "-"
): string {
  if (!text || !text.trim()) return fallback;
  return text.trim();
}
