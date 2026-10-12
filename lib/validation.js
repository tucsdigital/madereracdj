export function isValidEmail(email) {
  if (typeof email !== "string") return false;
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email.toLowerCase());
}

export function toNumberOrNull(value) {
  if (value == null || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

export function trimOrEmpty(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function requiredString(value, fieldName) {
  const v = trimOrEmpty(value);
  if (!v) {
    const err = new Error(`${fieldName} es obligatorio`);
    err.status = 400;
    throw err;
  }
  return v;
}

export function validateClienteUpsert(input) {
  const nombre = requiredString(input.nombre, "nombre");
  const telefono = requiredString(input.telefono, "telefono");
  const rawDni = trimOrEmpty(input.dni);
  const legacyDocument = trimOrEmpty(input.cuit);
  // Compatibilidad con clientes antiguos que guardaron DNI en el campo cuit.
  const dni = requiredString(rawDni || (/^\d{7,9}$/.test(legacyDocument.replace(/\D/g, "")) ? legacyDocument : ""), "dni");
  const dniDigits = dni.replace(/\D/g, "");
  if (!/^\d{7,9}$/.test(dniDigits)) {
    const err = new Error("dni debe tener entre 7 y 9 dígitos");
    err.status = 400;
    throw err;
  }
  const cuit = trimOrEmpty(input.cuit) && rawDni
    ? trimOrEmpty(input.cuit)
    : undefined;
  if (cuit && !/^\d{11}$/.test(cuit.replace(/\D/g, ""))) {
    const err = new Error("cuit debe tener 11 dígitos");
    err.status = 400;
    throw err;
  }
  const email = trimOrEmpty(input.email);
  if (email && !isValidEmail(email)) {
    const err = new Error("email inválido");
    err.status = 400;
    throw err;
  }
  return { nombre, telefono, dni: dniDigits, cuit, email };
}

export function validateDireccionUpsert(input) {
  const direccion = requiredString(input.direccion, "direccion");
  const localidad = requiredString(input.ciudad ?? input.localidad, "localidad");
  const codigoPostal = trimOrEmpty(input.codigoPostal);
  const lat = toNumberOrNull(input.lat);
  const lng = toNumberOrNull(input.lng);
  const email = trimOrEmpty(input.email);
  if (email && !isValidEmail(email)) {
    const err = new Error("email inválido");
    err.status = 400;
    throw err;
  }
  if ((input.lat != null && lat == null) || (input.lng != null && lng == null)) {
    const err = new Error("lat/lng deben ser numéricos");
    err.status = 400;
    throw err;
  }
  return { direccion, localidad, codigoPostal, lat, lng };
}


