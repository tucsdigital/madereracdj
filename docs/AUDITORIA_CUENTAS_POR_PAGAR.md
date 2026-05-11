# Auditoría — Cuentas por Pagar (/gastos)

Este documento describe el estado actual del módulo **Cuentas por Pagar** (pantalla `/gastos`, pestaña “Cuentas por Pagar”), su modelo de datos en Firestore, endpoints/engines asociados y las inconsistencias detectadas con sus correcciones.

## Alcance

- UI principal: `app/[lang]/(dashboard)/gastos/page.jsx` (vista “proveedores”).
- UI secundaria: `app/[lang]/(dashboard)/proveedores/page.jsx` (consulta de cuentas por proveedor).
- Engines transaccionales (Admin SDK): `lib/erp/cuentas-pagar-engine.js`.
- APIs (Route Handlers): `app/api/erp/proveedores/*` y `app/api/erp/pagos-proveedores/*`.
- Categorías de “Gastos Internos” (porque conviven en `/gastos`): `hooks/useCategoriasGastos.js` + `components/gastos/*`.

## Mapa de archivos (referencia rápida)

### UI

- `app/[lang]/(dashboard)/gastos/page.jsx`
  - Tabs: gastos internos vs cuentas por pagar.
  - CRUD de cuentas y pagos manuales (cliente Firestore).
  - Integración de movimientos especiales (pago global / saldo a favor) desde `pagosProveedores`.
- `app/[lang]/(dashboard)/proveedores/page.jsx`
  - Vista por proveedor y cálculos de pendiente bruto/neto usando `saldoAFavor`.

### APIs (Node runtime)

- `app/api/erp/proveedores/[id]/pago-global/route.js`
  - Registra pago global y lo aplica a cuentas del proveedor.
- `app/api/erp/proveedores/[id]/saldo-a-favor/route.js`
  - “Quitar saldo a favor” (ajuste manual del saldo a favor del proveedor).
- `app/api/erp/pagos-proveedores/[id]/anular/route.js`
  - Anula un movimiento de `pagosProveedores` (pago global o saldo a favor) y revierte sus efectos.

### Engine (transaccional)

- `lib/erp/cuentas-pagar-engine.js`
  - `registrarPagoGlobalProveedorEngine`
  - `quitarSaldoAFavorProveedorEngine`
  - `anularPagoProveedorEngine`

### Categorías (gastos internos)

- `hooks/useCategoriasGastos.js`
- `components/gastos/GestionCategorias.jsx`
- `components/gastos/EstadisticasCategorias.jsx`

## Modelo de datos (Firestore)

### 1) `gastos` (colección)

En esta app, la colección `gastos` contiene dos “tipos” conceptuales:

#### A) Gasto interno (`tipo: "interno"`)

Campos típicos:

- `tipo`: `"interno"`
- `concepto`: string (opcional)
- `monto`: number
- `categoria`: string (id de categoría o legado por nombre)
- `fecha`: `YYYY-MM-DD`
- `observaciones`: string
- `responsable`: email/usuario
- `fechaCreacion`: serverTimestamp
- `fechaActualizacion`: serverTimestamp

#### B) Cuenta por pagar a proveedor (`tipo: "proveedor"`)

Campos típicos:

- `tipo`: `"proveedor"`
- `monto`: number (total de la cuenta)
- `montoPagado`: number (acumulado)
- `estadoPago`: `"pendiente" | "parcial" | "pagado"`
- `proveedorId`: string (docId del proveedor)
- `proveedor`: objeto denormalizado `{id,nombre,cuit,telefono}` (puede ser `null`)
- `fecha`: `YYYY-MM-DD` (fecha de la cuenta)
- `fechaVencimiento`: `YYYY-MM-DD | null`
- `observaciones`: string
- `responsable`: email/usuario
- `pagos`: array de pagos (ver siguiente)
- `fechaCreacion`: serverTimestamp
- `fechaActualizacion`: serverTimestamp

Estructura de `pagos[]` (pagos manuales o aplicados por pago global):

- `monto`: number
- `fecha`: `YYYY-MM-DD`
- `metodo`: string (Efectivo/Transferencia/Cheque/Tarjeta/…)
- `notas`: string
- `responsable`: string
- `fechaRegistro`: ISO string
- `pagoEnDolares`: boolean
- `valorOficialDolar`: number|null
- `comprobantes`: array (url/nombre/tipo)
- `pagoGlobalProveedor`: boolean (true si viene de un pago global)

### 2) `proveedores` (colección)

Campos relevantes para CxP:

- `saldoAFavor`: number
- `fechaActualizacion`: serverTimestamp

### 3) `pagosProveedores` (colección)

Se usa como “libro mayor” de movimientos del proveedor que **no son cuentas**:

Tipos actuales:

#### A) Pago global (`tipo: "pagoGlobal"`)

Campos clave:

- `tipo`: `"pagoGlobal"`
- `proveedorId`
- `proveedor` (objeto denormalizado)
- `monto` / `pagoIngresado`: number (monto ingresado)
- `aplicadoACuentas`: number (cuánto se aplicó a cuentas)
- `cuentasAplicadas`: array `{cuentaId, montoAplicado}`
- `saldoAFavorAntes` / `saldoAFavorDespues`: number
- `montoDeltaSaldoAFavor`: number (delta real aplicado al saldo a favor)
- `fecha`: `YYYY-MM-DD`
- `metodo`, `notas`, `responsable`
- `pagoEnDolares`, `valorOficialDolar`, `comprobantes`
- `fechaCreacion`, `fechaActualizacion`: serverTimestamp
- `actorUid`, `actorEmail`, `origen`
- Campos de anulación (si aplica): `anulado`, `anuladoEn`, `anuladoPor*`, `anulacionMotivo`

#### B) Movimiento saldo a favor (`tipo: "saldoAFavor"`)

Campos clave:

- `tipo`: `"saldoAFavor"`
- `direccion`: `"ajuste_manual"` (actual)
- `proveedorId`, `proveedor`
- `monto` / `montoDelta`: number (puede ser negativo en ciertos casos)
- `saldoAFavorAntes` / `saldoAFavorDespues`: number
- `fecha`, `metodo`, `notas`, `responsable`
- `fechaCreacion`, `fechaActualizacion`: serverTimestamp
- `actorUid`, `actorEmail`, `origen`
- Campos de anulación (si aplica): `anulado`, `anuladoEn`, `anuladoPor*`, `anulacionMotivo`

### 4) `auditoria` (colección)

El engine registra eventos:

- `PAGO_GLOBAL_PROVEEDOR`
- `AJUSTE_SALDO_A_FAVOR_PROVEEDOR`
- `ANULACION_PAGO_PROVEEDOR`

## Flujos funcionales actuales

### 1) Crear “Cuenta por Pagar”

- Se crea un doc en `gastos` con `tipo: "proveedor"`, `montoPagado: 0`, `pagos: []`, `estadoPago: "pendiente"`.
- Implementación UI: `onSubmitProveedor` en `app/[lang]/(dashboard)/gastos/page.jsx`.

### 2) Registrar pago manual sobre una cuenta

- Se actualiza el doc `gastos/<cuentaId>`:
  - agrega un item a `pagos[]`
  - recalcula `montoPagado`
  - recalcula `estadoPago`
- Implementación UI: `openPago` + `updateDoc` sobre `gastos`.

### 3) Editar / eliminar un pago manual

- Se reescribe `pagos[]` (reemplazo/eliminación por índice) y se recalculan montos/estado.
- Importante: esto es válido solo para pagos manuales (no para pagos aplicados desde pago global).

### 4) Pago global del proveedor (aplica a múltiples cuentas)

- Endpoint: `POST /api/erp/proveedores/:id/pago-global`
- Engine transaccional:
  1) suma el monto ingresado al saldo disponible (`saldoAFavor + monto`)
  2) aplica a cuentas `gastos` del proveedor en orden por fecha
  3) actualiza `montoPagado/estadoPago` y agrega `pagos[]` con `pagoGlobalProveedor: true`
  4) actualiza `proveedores.saldoAFavor`
  5) registra movimiento en `pagosProveedores` tipo `pagoGlobal`

### 5) Quitar saldo a favor (ajuste manual)

- Endpoint: `POST /api/erp/proveedores/:id/saldo-a-favor`
- Engine transaccional:
  - reduce `proveedores.saldoAFavor`
  - registra movimiento en `pagosProveedores` tipo `saldoAFavor`

### 6) Ver movimientos “especiales” en la tabla de cuentas

La tabla “Detalle de Cuentas por Pagar” mezcla:

- cuentas reales (docs `gastos` tipo proveedor)
- movimientos especiales (docs `pagosProveedores`) transformados a items visuales con ids sintéticos:
  - `pagoGlobal_<idPagosProveedores>`
  - `saldoAFavor_<idPagosProveedores>`

## Inconsistencias detectadas (y correcciones)

### A) Error al borrar desde historial: `No document to update: gastos/pagoGlobal_*`

**Causa**

- Los items de “Pago global” y “Saldo a favor” en el listado no son documentos reales en `gastos`, sino representaciones de `pagosProveedores` con ids sintéticos.
- El modal “Historial de pagos” reutilizaba la lógica de editar/borrar pagos manuales (que hace `updateDoc("gastos", cuentaSeleccionada.id)`).

**Efecto**

- Al intentar editar/borrar, Firestore fallaba porque `gastos/pagoGlobal_*` no existe.

**Corrección aplicada**

- Para movimientos especiales:
  - Se bloquea editar/eliminar pagos desde el historial.
  - Se agrega acción explícita “Anular movimiento” (tabla + modal), que llama a un endpoint dedicado.

### B) Acciones faltantes en el listado global

**Causa**

- Los movimientos especiales mostraban solo “ojo” (ver), pero no tenían acciones coherentes para operar.

**Corrección aplicada**

- Se incorpora acción “Anular movimiento” para `Pago global` y `Saldo a favor`.

## Anulación de movimientos (nuevo)

### API

- `POST /api/erp/pagos-proveedores/:id/anular`

### Reglas

- Si el movimiento es `pagoGlobal`:
  - revierte pagos aplicados a cuentas (usando `cuentasAplicadas`)
  - revierte el delta de `saldoAFavor`
  - marca el doc de `pagosProveedores` como anulado
- Si el movimiento es `saldoAFavor`:
  - revierte el delta de `saldoAFavor`
  - marca el doc como anulado

### Limitaciones actuales

- La anulación escribe una “reversión” como nuevo elemento dentro del array `gastos.pagos[]`. Esto mantiene trazabilidad, pero el array puede crecer.

## Recomendaciones (mejoras futuras)

- Unificar operaciones sensibles (crear/editar cuenta, pagos manuales) bajo engines/API transaccionales (hoy hay mezcla de “cliente directo” y “engine”).
- Definir un criterio único para “qué se puede borrar” vs “qué se debe anular”:
  - pagos manuales: borrar/editar permitido
  - pagos globales y saldo a favor: anulación (no borrado)
- Considerar persistir pagos como subcolección si se espera crecimiento alto de `pagos[]` (para evitar documentos grandes).
- Agregar UI de estado “anulado” para movimientos en `pagosProveedores` (filtrar o mostrar badge).

