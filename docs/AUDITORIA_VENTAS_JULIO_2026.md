# Auditoria Ventas Julio 2026

Periodo auditado: `2026-07-01` a `2026-08-01` exclusivo.

## Metodologia

- Coleccion auditada: `ventas`
- Se excluyeron registros anulados: `estado = "anulada"` o `anulada = true`
- Se tomo como fecha de pertenencia al periodo: `fechaCreacion || fecha`
- Se reutilizo el mismo criterio del sistema para clasificar pagos:
  - `pagado` si `estadoPago` ya es reconocido o si `abonado >= total`
  - `parcial` si `abonado > 0` y `< total`
  - `pendiente` si `abonado = 0`
- El monto abonado se calculo priorizando `pagos[].monto`; si no hay historial, se usa `montoAbonado`

## Resumen Estadistico

- Ventas totales del mes: `190`
- Ventas completadas: `180`
- Porcentaje completadas: `94.74%`
- Ventas pendientes: `6`
- Ventas parciales: `4`
- Monto total facturado: `$30.030.943,30`
- Monto total cobrado: `$28.561.829,30`
- Monto total pendiente: `$1.490.566,00`

## Lista 1: Ventas con estado pendiente o parcial

| ID | Nro venta | Fecha emision | Estado pago | Monto total | Monto abonado | Fecha pago confirmado | Cliente |
| --- | --- | --- | --- | ---: | ---: | --- | --- |
| `dCoJsmkB3nRanXRwrlkd` | `VENTA-02075` | 2026-07-01 | parcial | 141000 | 30000 | 2026-07-01 | Santiago Nahuel Serrano |
| `01YEqqyoOC4gwbOUryQy` | `VENTA-02092` | 2026-07-02 | pendiente | 30000 | 0 | - | Smoke Order |
| `Bd6znDaGTEB9hcl4szzw` | `VENTA-02091` | 2026-07-02 | pendiente | 12000 | 0 | - | Smoke Backend Venta |
| `40Rek0tAyWvpXp2YMR3B` | `VENTA-02138` | 2026-07-11 | parcial | 170669 | 170669 | 2026-07-21 | Richard macie |
| `E8P2bQo5mt1EQ9hp6s8X` | `VENTA-02169` | 2026-07-16 | pendiente | 136200 | 0 | - | JUANCE CENTURION |
| `r4ILRc3vzCsc79liyaBD` | `VENTA-02180` | 2026-07-17 | parcial | 681900 | 681900 | 2026-07-21 | Yamila coronel |
| `TUU5IU28HhhrpRu5vbTo` | `VENTA-02174` | 2026-07-17 | pendiente | 157400 | 157400 | 2026-07-17 | Gonzalez Claudia Patricia |
| `GN6D8WNcqy0fKHOABIXl` | `VENTA-02199` | 2026-07-21 | parcial | 63000 | 50000 | 2026-07-21 | DOS SANTOS MARCOS |
| `jM3gqAoG94ZBV3W3kMwI` | `VENTA-02254` | 2026-07-27 | pendiente | 468066 | 0 | - | JUAN DANIEL |
| `TUM2214BMWUYhGka3bnO` | `VENTA-02267` | 2026-07-29 | pendiente | 697800 | 0 | - | Olivares agustin |

## Lista 2: Ventas no completadas con saldo pendiente, fecha limite y notas

| ID | Nro venta | Fecha emision | Estado pago | Monto pendiente | Fecha limite | Nota deuda | Cliente |
| --- | --- | --- | --- | ---: | --- | --- | --- |
| `dCoJsmkB3nRanXRwrlkd` | `VENTA-02075` | 2026-07-01 | parcial | 111000 | sin dato | - | Santiago Nahuel Serrano |
| `01YEqqyoOC4gwbOUryQy` | `VENTA-02092` | 2026-07-02 | pendiente | 30000 | sin dato | - | Smoke Order |
| `Bd6znDaGTEB9hcl4szzw` | `VENTA-02091` | 2026-07-02 | pendiente | 12000 | sin dato | - | Smoke Backend Venta |
| `40Rek0tAyWvpXp2YMR3B` | `VENTA-02138` | 2026-07-11 | parcial | 0 | sin dato | - | Richard macie |
| `E8P2bQo5mt1EQ9hp6s8X` | `VENTA-02169` | 2026-07-16 | pendiente | 136200 | sin dato | - | JUANCE CENTURION |
| `r4ILRc3vzCsc79liyaBD` | `VENTA-02180` | 2026-07-17 | parcial | 0 | sin dato | - | Yamila coronel |
| `TUU5IU28HhhrpRu5vbTo` | `VENTA-02174` | 2026-07-17 | pendiente | 0 | sin dato | - | Gonzalez Claudia Patricia |
| `GN6D8WNcqy0fKHOABIXl` | `VENTA-02199` | 2026-07-21 | parcial | 13000 | sin dato | - | DOS SANTOS MARCOS |
| `jM3gqAoG94ZBV3W3kMwI` | `VENTA-02254` | 2026-07-27 | pendiente | 468066 | sin dato | - | JUAN DANIEL |
| `TUM2214BMWUYhGka3bnO` | `VENTA-02267` | 2026-07-29 | pendiente | 697800 | sin dato | - | Olivares agustin |

## Validacion de Integridad

### Duplicados

- IDs duplicados: ninguno
- Numeros de venta duplicados en el periodo: ninguno

### Estados no reconocidos

- No se encontraron `estadoPago` crudos fuera de `pagado | parcial | pendiente`

### Inconsistencias detectadas

Se detectaron 4 ventas donde el `estadoPago` guardado no coincide con los montos efectivamente abonados:

| ID | Nro venta | Estado actual | Total | Abonado | Saldo | Observacion |
| --- | --- | --- | ---: | ---: | ---: | --- |
| `40Rek0tAyWvpXp2YMR3B` | `VENTA-02138` | parcial | 170669 | 170669 | 0 | Figura como parcial, pero el saldo es 0 |
| `ADi42kzBTfE7oPjKbg0Y` | `VENTA-02093` | pagado | 22500 | 0 | 22500 | Figura como pagado, pero no tiene pagos registrados |
| `TUU5IU28HhhrpRu5vbTo` | `VENTA-02174` | pendiente | 157400 | 157400 | 0 | Figura como pendiente, pero el saldo es 0 |
| `r4ILRc3vzCsc79liyaBD` | `VENTA-02180` | parcial | 681900 | 681900 | 0 | Figura como parcial, pero el saldo es 0 |

## Conclusiones

- La mayor parte del mes esta sana: `180 / 190` ventas quedaron completadas.
- El monto realmente pendiente del periodo asciende a `$1.490.566,00`.
- No hay duplicados ni estados crudos invalidos.
- El problema real esta en 4 ventas con `estadoPago` persistido en desacuerdo con el historial de pagos.
- En las ventas no completadas no aparece una `fecha limite de pago` estandar en los documentos revisados; todas quedaron con `sin dato`.
