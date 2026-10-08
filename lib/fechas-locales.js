// Utilidades de fechas de calendario ("YYYY-MM-DD") en hora local.
// Evitan new Date("YYYY-MM-DD") y toISOString(), que trabajan en UTC y
// corren el día según la zona horaria.

const pad = (n) => String(n).padStart(2, "0");

export const aFechaLocalISO = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

export const fechaLocalActual = () => aFechaLocalISO(new Date());

// Devuelve siempre "YYYY-MM-DD" (fecha local) o "" si no es interpretable.
export const normalizarFecha = (valor) => {
  if (!valor) return "";

  if (typeof valor === "object") {
    if (typeof valor.toDate === "function") return aFechaLocalISO(valor.toDate());
    if (typeof valor.seconds === "number") {
      return aFechaLocalISO(new Date(valor.seconds * 1000));
    }
    if (valor instanceof Date) return aFechaLocalISO(valor);
    return "";
  }

  const texto = String(valor).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) return texto;

  const dmy = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) return `${dmy[3]}-${pad(dmy[2])}-${pad(dmy[1])}`;

  return aFechaLocalISO(new Date(texto));
};

// Convierte a Date local al mediodía (evita saltos por cambios de horario).
export const parsearFechaLocal = (valor) => {
  const iso = normalizarFecha(valor);
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
};

export const sumarDias = (valor, dias) => {
  const fecha = parsearFechaLocal(valor);
  if (!fecha) return "";
  fecha.setDate(fecha.getDate() + Number(dias || 0));
  return aFechaLocalISO(fecha);
};

export const formatearFechaLocal = (valor, opciones) => {
  const fecha = parsearFechaLocal(valor);
  if (!fecha) return "-";
  if (!opciones) {
    return `${pad(fecha.getDate())}/${pad(fecha.getMonth() + 1)}/${fecha.getFullYear()}`;
  }
  return fecha.toLocaleDateString("es-AR", opciones);
};
