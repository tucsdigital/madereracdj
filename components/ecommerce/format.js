export const money = (n) => `$${Number(n || 0).toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;

const TZ = "America/Argentina/Buenos_Aires";
export const formatDate = (iso, withTime = true) =>
  iso
    ? new Date(iso).toLocaleString("es-AR", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "2-digit", ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}) })
    : "—";

export const shortDay = (key) => {
  const [, m, d] = String(key).split("-");
  return m && d ? `${d}/${m}` : key;
};

/** Variación contra el período anterior, en texto corto ("+12 %", "−4 %") o vacío si no hay base de comparación. */
export const variation = (pct) => (pct === null || pct === undefined ? "" : `${pct > 0 ? "+" : pct < 0 ? "−" : ""}${Math.abs(pct).toLocaleString("es-AR")} %`);
