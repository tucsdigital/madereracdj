import test from "node:test";
import assert from "node:assert/strict";
import { buildMapsUrlFallback } from "../lib/maps-location.mjs";
import { createMapsQrDataUrl } from "../lib/pdf/maps-qr.mjs";
import { mergeVentaClientLocation } from "../lib/pdf/venta-location.mjs";

test("usa el enlace Maps o coordenadas válidas antes que la dirección escrita", () => {
  const savedUrl = "https://maps.app.goo.gl/saved-place";
  assert.equal(buildMapsUrlFallback({ explicitMapsUrl: savedUrl, lat: -34.6, lng: -58.4 }), savedUrl);
  assert.equal(
    buildMapsUrlFallback({ lat: -34.6, lng: -58.4, direccion: "Dirección antigua" }),
    "https://www.google.com/maps/search/?api=1&query=-34.6%2C-58.4",
  );
  assert.equal(
    buildMapsUrlFallback({ explicitMapsUrl: "javascript:alert(1)", direccion: "Calle 1", localidad: "Pilar" }),
    "https://www.google.com/maps/search/?api=1&query=Calle%201%2C%20Pilar",
  );
});

test("coordenadas nulas, incompletas o fuera de rango no generan un QR a 0,0", () => {
  assert.equal(
    buildMapsUrlFallback({ lat: null, lng: null, direccion: "Av. Siempre Viva 123", localidad: "Pilar" }),
    "https://www.google.com/maps/search/?api=1&query=Av.%20Siempre%20Viva%20123%2C%20Pilar",
  );
  assert.equal(buildMapsUrlFallback({ lat: -34.6, lng: null }), undefined);
  assert.equal(buildMapsUrlFallback({ lat: 91, lng: 0 }), undefined);
});

test("recupera geodatos desde el cliente guardado en ventas anteriores", () => {
  const result = mergeVentaClientLocation(
    { cliente: { nombre: "Cliente", direccion: "Calle 1", lat: null } },
    { mapsUrl: "https://maps.google.com/?q=saved", lat: -34.5, lng: -58.7, localidad: "Pilar" },
  );
  assert.equal(result.cliente.mapsUrl, "https://maps.google.com/?q=saved");
  assert.equal(result.cliente.lat, -34.5);
  assert.equal(result.cliente.lng, -58.7);
  assert.equal(result.cliente.direccion, "Calle 1");
});

test("QR de Maps se genera como PNG inline, sin cargar un servicio remoto al imprimir", async () => {
  const qr = await createMapsQrDataUrl("https://www.google.com/maps/?q=-34.6,-58.4");
  assert.match(qr, /^data:image\/png;base64,/);
  assert.deepEqual(Buffer.from(qr.split(",")[1], "base64").subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  assert.equal(await createMapsQrDataUrl(""), "");
});
