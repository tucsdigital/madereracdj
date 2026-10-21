/** Fill missing embedded customer geodata from the canonical customer document. */
export function mergeVentaClientLocation(venta, savedClient) {
  const embeddedClient = venta?.cliente || {};
  const customer = savedClient || {};

  return {
    ...venta,
    cliente: {
      ...customer,
      ...embeddedClient,
      localidad: embeddedClient.localidad || customer.localidad || "",
      mapsUrl: embeddedClient.mapsUrl || customer.mapsUrl || "",
      lat: embeddedClient.lat ?? customer.lat ?? null,
      lng: embeddedClient.lng ?? customer.lng ?? null,
    },
  };
}
