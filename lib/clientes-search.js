const digitsOnly = (value) => String(value ?? "").replace(/\D/g, "");

export const normalizeClienteText = (value) => String(value ?? "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLocaleLowerCase("es")
  .trim()
  .replace(/\s+/g, " ");

export const normalizeClienteDigits = digitsOnly;

export function getClienteDni(cliente = {}) {
  const dni = digitsOnly(cliente.dni);
  if (dni) return dni;

  // Compatibilidad con clientes antiguos cuyo DNI quedó guardado en `cuit`.
  const legacy = digitsOnly(cliente.cuit);
  return legacy.length >= 7 && legacy.length <= 9 ? legacy : "";
}

export function getClienteCuit(cliente = {}) {
  const cuit = String(cliente.cuit ?? "");
  const digits = digitsOnly(cuit);
  return !cliente.dni && digits.length >= 7 && digits.length <= 9 ? "" : cuit;
}

const textFields = (cliente) => [
  cliente.nombre,
  cliente.telefono,
  cliente.celular,
  cliente.whatsapp,
  getClienteDni(cliente),
  getClienteCuit(cliente),
  cliente.cuil,
  cliente.email,
  cliente.direccion,
  cliente.localidad,
  cliente.provincia,
  cliente.partido,
  cliente.barrio,
  cliente.area,
  cliente.lote,
  cliente.codigoPostal,
];

const numericFields = (cliente) => [
  getClienteDni(cliente),
  getClienteCuit(cliente),
  cliente.cuil,
  cliente.telefono,
  cliente.celular,
  cliente.whatsapp,
  cliente.codigoPostal,
];

export function matchesClienteSearch(cliente, search) {
  const query = normalizeClienteText(search);
  if (!query) return true;
  if (!/[a-z0-9]/i.test(query)) return false;

  if (textFields(cliente).some((value) => normalizeClienteText(value).includes(query))) {
    return true;
  }

  // Solo una búsqueda compuesta por números y separadores activa la búsqueda
  // numérica. Así, texto como "Juan 123" no puede coincidir por accidente con
  // el teléfono o documento de otra persona.
  if (!/^[\d\s().+/-]+$/.test(String(search ?? "").trim())) return false;
  const queryDigits = digitsOnly(search);
  if (!queryDigits) return false;

  return numericFields(cliente).some((value) => {
    const fieldDigits = digitsOnly(value);
    return fieldDigits.length > 0 && fieldDigits.includes(queryDigits);
  });
}

export const clienteDocumentNumbers = (cliente = {}) => [...new Set([
  getClienteDni(cliente),
  digitsOnly(getClienteCuit(cliente)),
  digitsOnly(cliente.cuil),
].filter(Boolean))];

const documentQueryVariants = (value) => {
  const raw = String(value ?? "").trim();
  const digits = digitsOnly(value);
  if (!digits) return raw ? [raw] : [];

  const variants = [raw, digits];
  if (digits.length >= 7 && digits.length <= 9) {
    variants.push(digits.replace(/\B(?=(\d{3})+(?!\d))/g, "."));
  } else if (digits.length === 11) {
    variants.push(`${digits.slice(0, 2)}-${digits.slice(2, 10)}-${digits.slice(10)}`);
  }
  return [...new Set(variants.filter(Boolean))];
};

/** Valores típicos para consultas Firestore indexadas, sin normalizar documentos existentes. */
export function getClienteIdentityQueryValues(cliente = {}) {
  const dniValues = documentQueryVariants(cliente.dni || getClienteDni(cliente));
  if (!cliente.dni && cliente.cuit && getClienteDni(cliente)) {
    dniValues.push(...documentQueryVariants(cliente.cuit));
  }
  const cuitValues = documentQueryVariants(cliente.cuit);
  const cuilValues = documentQueryVariants(cliente.cuil);
  return {
    dni: [...new Set(dniValues)],
    cuit: cuitValues,
    cuil: cuilValues,
    all: [...new Set([...dniValues, ...cuitValues, ...cuilValues])],
  };
}

export function getUniqueClienteIdentityQueryValues(cliente = {}, identityIndex) {
  const identityValues = getClienteIdentityQueryValues(cliente);
  const uniqueNumbers = new Set(clienteDocumentNumbers(cliente).filter((number) => {
    const identity = identityIndex?.documents?.get(number);
    return identity?.count === 1 && identity.clienteId === String(cliente.id ?? "");
  }));
  const onlyUnique = (values) => values.filter((value) => uniqueNumbers.has(digitsOnly(value)));
  const dni = onlyUnique(identityValues.dni);
  const cuit = onlyUnique(identityValues.cuit);
  const cuil = onlyUnique(identityValues.cuil);
  return { dni, cuit, cuil, all: [...new Set([...dni, ...cuit, ...cuil])] };
}

export function addClienteToIdentityIndex(index, cliente = {}) {
  const clienteId = String(cliente.id ?? "");
  if (!clienteId) return index;

  index.clientIds.add(clienteId);
  for (const documentNumber of clienteDocumentNumbers(cliente)) {
    const current = index.documents.get(documentNumber);
    if (!current) {
      index.documents.set(documentNumber, { count: 1, clienteId });
    } else if (current.clienteId !== clienteId) {
      current.count = 2;
      current.clienteId = null;
    }
  }
  return index;
}

export const createClienteIdentityIndex = () => ({ documents: new Map(), clientIds: new Set() });

function isUniqueDocumentForCliente(documentNumber, cliente, identitySource = []) {
  const normalized = digitsOnly(documentNumber);
  if (!normalized || !clienteDocumentNumbers(cliente).includes(normalized)) return false;

  if (identitySource instanceof Map) {
    const identity = identitySource.get(normalized);
    return identity?.count === 1 && identity.clienteId === String(cliente.id ?? "");
  }
  if (identitySource?.documents instanceof Map) {
    const identity = identitySource.documents.get(normalized);
    return identity?.count === 1 && identity.clienteId === String(cliente.id ?? "");
  }

  const matchingClientIds = new Set(
    identitySource
      .filter((candidate) => clienteDocumentNumbers(candidate).includes(normalized))
      .map((candidate) => String(candidate.id ?? ""))
      .filter(Boolean),
  );

  return matchingClientIds.size === 1 && matchingClientIds.has(String(cliente.id ?? ""));
}

function getUniqueClienteIdForDocument(documentNumber, identitySource = []) {
  const normalized = digitsOnly(documentNumber);
  if (!normalized) return null;

  if (identitySource instanceof Map) {
    const identity = identitySource.get(normalized);
    return identity?.count === 1 ? identity.clienteId : null;
  }
  if (identitySource?.documents instanceof Map) {
    const identity = identitySource.documents.get(normalized);
    return identity?.count === 1 ? identity.clienteId : null;
  }

  const matchingClientIds = new Set(
    identitySource
      .filter((candidate) => clienteDocumentNumbers(candidate).includes(normalized))
      .map((candidate) => String(candidate.id ?? ""))
      .filter(Boolean),
  );
  return matchingClientIds.size === 1 ? [...matchingClientIds][0] : null;
}

/**
 * Relaciona presupuestos con un cliente por ID estable. Solo para registros
 * históricos sin ID acepta DNI/CUIT exacto y único entre los clientes.
 */
export function getRegistroClienteIds(registro = {}, identitySource = []) {
  const references = [registro.clienteId, registro.cliente?.id]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);

  if (references.length) {
    const knownClientIds = identitySource?.clientIds instanceof Set
      ? identitySource.clientIds
      : identitySource instanceof Map
        ? new Set([...identitySource.values()].map((identity) => String(identity?.clienteId ?? "")).filter(Boolean))
        : new Set(identitySource.map((candidate) => String(candidate.id ?? "")).filter(Boolean));
    const stableReferences = references.filter((reference) => knownClientIds.has(reference));
    if (stableReferences.length) {
      const stableIds = new Set(stableReferences);
      return stableIds.size === 1 ? [...stableIds] : [];
    }

    // En registros antiguos `clienteId` a veces guardaba el documento, no el ID.
    // Solo se acepta si el documento pertenece inequívocamente a este cliente.
    const documentIds = references.map((reference) => getUniqueClienteIdForDocument(reference, identitySource));
    return documentIds.length > 0 && documentIds[0] && documentIds.every((id) => id === documentIds[0])
      ? [documentIds[0]]
      : [];
  }

  const snapshotDocuments = [
    registro.cliente?.dni,
    registro.cliente?.cuit,
    registro.cliente?.cuil,
  ].map(digitsOnly).filter(Boolean);

  return [...new Set(snapshotDocuments
    .map((documentNumber) => getUniqueClienteIdForDocument(documentNumber, identitySource))
    .filter(Boolean))];
}

export function registroMatchesCliente(registro = {}, cliente = {}, identitySource = []) {
  return getRegistroClienteIds(registro, identitySource).includes(String(cliente.id ?? ""));
}

export const presupuestoMatchesCliente = registroMatchesCliente;
export const ventaMatchesCliente = registroMatchesCliente;

/**
 * Escanea datos paginados y devuelve una página filtrada sin guardar el conjunto
 * completo en memoria. El cursor de continuación queda en la última coincidencia
 * visible; el siguiente pedido vuelve a recorrer el tramo de lookahead sin omitir filas.
 */
export async function scanMatchingCursorPage({
  fetchBatch,
  matches,
  cursor = null,
  pageSize = 25,
  batchSize = 100,
  onBatch,
  shouldContinue,
}) {
  const safePageSize = Math.min(100, Math.max(1, Number(pageSize) || 25));
  const safeBatchSize = Math.min(500, Math.max(1, Number(batchSize) || 100));
  const items = [];
  let scanCursor = cursor;
  let lastVisibleCursor = cursor;
  let scanned = 0;
  let exhausted = false;
  let hasNext = false;

  while (!exhausted && !hasNext) {
    if (shouldContinue && !shouldContinue()) {
      return { items, nextCursor: scanCursor, hasNext: false, exhausted: false, scanned, cancelled: true };
    }
    const batch = await fetchBatch(scanCursor, safeBatchSize);
    if (shouldContinue && !shouldContinue()) {
      return { items, nextCursor: scanCursor, hasNext: false, exhausted: false, scanned, cancelled: true };
    }
    if (!Array.isArray(batch) || batch.length === 0) {
      exhausted = true;
      break;
    }

    scanned += batch.length;
    for (const entry of batch) {
      if (matches(entry.value)) {
        if (items.length === safePageSize) {
          hasNext = true;
          break;
        }
        items.push(entry.value);
        lastVisibleCursor = entry.cursor;
      }
      scanCursor = entry.cursor;
    }

    onBatch?.(scanned);
    if (!hasNext && batch.length < safeBatchSize) exhausted = true;
  }

  return {
    items,
    nextCursor: hasNext ? lastVisibleCursor : scanCursor,
    hasNext,
    exhausted,
    scanned,
  };
}
