# Integración de checkout

## Responsabilidades

- El sistema calcula precio, descuentos, mínimos/packs y envío en `POST /api/checkout/quote`.
- `POST /api/orders` vuelve a validar el total antes de registrar el pedido y crear una venta pendiente. Una referencia no se reutiliza para otro carrito.
- El motor ERP reserva existencias (incluidos componentes de combos) sin descontar stock físico. Reservas: 30 minutos para Mercado Pago y 24 horas para transferencia. Las consultas de disponibilidad ignoran reservas vencidas.
- La preferencia de Mercado Pago usa el total persistido y vence junto con la reserva.
- El webhook consulta el pago directamente a Mercado Pago y entrega al sistema referencia, importe, moneda y estado. El sistema valida y confirma la venta, consumiendo stock una sola vez.
- Los cambios de pagos desde el ERP sincronizan el pedido. Anular un pendiente libera reservas; anular una venta que ya descontó inventario repone existencias una vez.
- Pagos tardíos sin disponibilidad, duplicados aprobados, reembolsos y contracargos requieren revisión en ventas (`requiereRevision`, `revisionPago`, `pagoPorConciliar` cuando corresponda).
- Las rutas `mark-success` y el proxy público `orders/:id/payment-webhook` están retiradas (410). La página de resultado sólo consulta el estado.
- `save-venta` es una ruta de compatibilidad de consulta/notificación, no crea ventas ni acepta importes del navegador.

## Configuración y publicación

Publicar primero **sistema** y luego **tienda**, coordinando el cambio para evitar compras desde clientes antiguos durante el despliegue.

En ambos servidores deben coincidir `EXTERNAL_API_API_KEY` y `EXTERNAL_API_SHARED_SECRET`. Nunca exponerlos con prefijo `NEXT_PUBLIC_`.

En tienda, `NEXT_PUBLIC_API_BASE` (o `NEXT_PUBLIC_API_BASE_URL`) debe ser la URL absoluta del sistema; `NEXT_PUBLIC_BASE_URL`, la URL pública de tienda. Configurar `MERCADOPAGO_ACCESS_TOKEN`, `RESEND_API_KEY` y `RESEND_FROM_EMAIL`.

El descuento por transferencia se lee de `settings/general.transferenciaDescuentoPct` (o del objeto general anidado ya utilizado por el sistema); como alternativa del servidor, `TRANSFERENCIA_DESCUENTO_PCT`. Por defecto es cero. El checkout muestra el importe autoritativo aunque el carrito tenga una estimación anterior.

El envío utiliza sucursales y tarifas existentes de settings. `shippingMaxWeightKg` permite definir el límite (100 por defecto). Un peso faltante, una zona sin tarifa o un exceso de peso requieren cotización; no se cobran como envío gratuito.

Los correos usan importes guardados, clave de idempotencia de Resend y registro `orders.emails`. Una falla de correo en webhook devuelve 503 para reintento. Los pedidos por transferencia reintentan al confirmar mediante `save-venta`; revisar logs si el proveedor permanece indisponible.

## Compatibilidad

Los documentos históricos sin `ecommerceLifecycle` mantienen su tratamiento de inventario. No se recalcula ni repone automáticamente el stock de ventas antiguas. Revisar los pagos abiertos anteriores al despliegue: las preferencias nuevas exigen una reserva vigente del nuevo circuito.

## Envíos (reglas y tarifas)

Todo el cálculo vive en `lib/shipping.js`, que usan el checkout (`/api/checkout/quote`), la estimación pública (`/api/check-delivery-radius`) y el simulador del panel (`/envios/zonas`).

- Se elige, entre las sucursales cuyo radio cubre la dirección, la más cercana. Fuera de radio, sin tramo o sin peso conocido se pide cotización; nunca se cobra $0 por falta de datos.
- Precio = tarifa del tramo por distancia + adicional de la franja de peso + recargo de combustible (%), con envío mínimo. Sin franjas cargadas rige el peso máximo (100 kg por defecto), como antes.
- Envío gratis desde un monto, evaluado sobre el neto de productos tras descuentos. La estimación del paso 2 no lo conoce; el total confirmado del paso 3 sí.
- Las reglas se guardan en `settings/general.shippingRules`. Sin ellas el comportamiento es el anterior.
- `PUT /api/envios/zonas` exige sesión del sistema. Cada cambio queda en `settingsHistory` (antes/después, usuario y fecha). Guardar sólo reglas conserva sucursales y tarifas, y viceversa.
- La pantalla muestra avisos si el radio de una sucursal supera el último tramo.

## Verificación

`node --test tests/ecommerce-payment.test.mjs tests/ecommerce-inventory.test.cjs`

Los tests ejecutan el motor real con almacenamiento transaccional en memoria. No sustituyen una prueba con Firestore y Mercado Pago de prueba. Antes de publicar, verificar: dos compras concurrentes del último producto; aprobación sin volver a la tienda; rechazo y reintento; pago tardío; transferencia confirmada desde ventas; combo; cancelación; entrega fuera de zona; correo y reconciliación de importes.
