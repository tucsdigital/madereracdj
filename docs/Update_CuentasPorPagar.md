Necesito rediseñar y perfeccionar por completo el funcionamiento del módulo "Cuentas por Pagar" dentro de /gastos.

IMPORTANTE:
Por ahora NO quiero enfocarme en mockup visual. Primero quiero corregir arquitectura funcional, lógica de datos, consistencia, flujo de pagos, reglas de negocio y experiencia operativa del módulo.

Contexto actual:
El módulo de Cuentas por Pagar está dentro de /gastos y actualmente mezcla en una misma vista:

- cuentas reales por pagar a proveedores;
- pagos manuales;
- pagos globales;
- movimientos de saldo a favor;
- anulaciones;
- registros sintéticos que no existen realmente como documentos en gastos.

Esto genera desorden, confusión e inconsistencias.

Problema crítico detectado:
La tabla actual muestra algunos registros que parecen cuentas, pero en realidad son movimientos provenientes de pagosProveedores, con ids sintéticos como:

- pagoGlobal\_<id>
- saldoAFavor\_<id>

Estos registros NO son documentos reales de la colección gastos. Por eso no deben tratarse como cuentas reales, no deben editarse como cuentas y no deben eliminarse con lógica de gastos.

Objetivo general:
Transformar el módulo en un sistema sólido de "Cuentas por Pagar + Cuenta Corriente de Proveedores", donde el control sea perfecto entre:

- cuentas que se le deben a proveedores;
- pagos realizados;
- pagos parciales;
- pagos globales;
- saldo a favor;
- vencimientos;
- anulaciones;
- historial de movimientos;
- trazabilidad de cada operación.

El resultado debe ser un módulo confiable, intuitivo, ágil y preparado para evitar inconsistencias financieras.

\==================================================

1. NUEVA SEPARACIÓN CONCEPTUAL OBLIGATORIA
   \==================================================

Separar definitivamente estos conceptos:

A) CUENTAS POR PAGAR
Son deudas reales con proveedores.
Deben venir únicamente de documentos de la colección gastos con:
tipo: "proveedor"

Una cuenta por pagar puede tener:

- proveedorId
- proveedor denormalizado
- monto total
- montoPagado
- saldo pendiente
- estadoPago
- fecha
- fechaVencimiento
- observaciones
- pagos aplicados
- estado operativo

B) MOVIMIENTOS DE PROVEEDOR
Son operaciones financieras que impactan la cuenta corriente del proveedor.
Deben venir de la colección pagosProveedores.

Tipos de movimientos:

- pagoGlobal
- saldoAFavor
- anulacion
- reverso
- ajusteManual

C) PAGOS MANUALES SOBRE CUENTA
Son pagos aplicados directamente a una cuenta puntual.

D) SALDO A FAVOR
Es crédito disponible del proveedor.
No es una cuenta.
No es una deuda.
No debe aparecer como cuenta por pagar.

E) ANULACIONES
No deben borrar información.
Deben registrar reversión y mantener trazabilidad.

\==================================================
2\. REGLA PRINCIPAL DE FUNCIONAMIENTO
=====================================

En la tabla/listado de "Cuentas por Pagar" solo deben aparecer cuentas reales:

gastos where tipo == "proveedor"

NO deben aparecer ahí:

- pagos globales;
- saldo a favor;
- movimientos de pagosProveedores;
- anulaciones;
- ids sintéticos pagoGlobal\_\*;
- ids sintéticos saldoAFavor\_\*.

Los movimientos deben tener su propia sección, tabla o pestaña llamada:
"Movimientos de proveedor" o "Cuenta corriente".

\==================================================
3\. NUEVA ESTRUCTURA FUNCIONAL DEL MÓDULO
=========================================

Reorganizar la pestaña "Cuentas por Pagar" en estas vistas internas:

1. Resumen
2. Proveedores
3. Cuentas
4. Movimientos
5. Alertas / Vencimientos

No hace falta diseñar visualmente todavía, pero sí dejar preparada la lógica, los datos y los componentes para esta estructura.

\==================================================
4\. VISTA RESUMEN
=================

Debe calcular correctamente:

- Total de cuentas generadas
- Total pagado
- Saldo pendiente bruto
- Saldo a favor total de proveedores
- Saldo pendiente neto
- Cantidad de cuentas pendientes
- Cantidad de cuentas pagadas
- Cantidad de cuentas parciales
- Cantidad de cuentas vencidas
- Cantidad de movimientos anulados

Definiciones:

totalCuentas = suma de monto de cuentas reales tipo proveedor

totalPagado = suma de montoPagado de cuentas reales

saldoPendienteBruto = suma de monto - montoPagado en cuentas no pagadas

saldoAFavorTotal = suma de proveedores.saldoAFavor

saldoPendienteNeto = saldoPendienteBruto - saldoAFavorTotal
Si el resultado es menor a 0, mostrar 0 como deuda neta y el excedente como saldo a favor.

\==================================================
5\. VISTA PROVEEDORES
=====================

Crear una vista agrupada por proveedor, pensada como cuenta corriente.

Por cada proveedor calcular:

- proveedorId
- nombre proveedor
- cantidad de cuentas activas
- total histórico de cuentas
- total pagado
- saldo pendiente bruto
- saldo a favor
- saldo pendiente neto
- próxima fecha de vencimiento
- cantidad de cuentas vencidas
- porcentaje pagado
- estado general del proveedor

Estados sugeridos del proveedor:

- Sin deuda
- Con deuda
- Con deuda vencida
- Con saldo a favor
- Deuda parcial
- Requiere revisión

Regla de cálculo:

saldoPendienteBruto = suma de saldos pendientes de cuentas reales
saldoAFavor = proveedores.saldoAFavor || 0
saldoPendienteNeto = max(saldoPendienteBruto - saldoAFavor, 0)

Si saldoAFavor > saldoPendienteBruto:
el proveedor no tiene deuda neta y queda con saldo a favor restante.

Acciones permitidas por proveedor:

- Ver cuenta corriente
- Crear nueva cuenta
- Registrar pago global
- Ajustar saldo a favor
- Ver movimientos
- Ver cuentas vencidas

\==================================================
6\. DETALLE DE PROVEEDOR / CUENTA CORRIENTE
===========================================

Crear o mejorar una vista de detalle por proveedor.

Debe mostrar:

A) Resumen financiero del proveedor:

- deuda total
- pagado total
- saldo pendiente bruto
- saldo a favor
- saldo pendiente neto
- próximo vencimiento
- cuentas vencidas

B) Cuentas del proveedor:
Solo cuentas reales desde gastos tipo proveedor.

Columnas:

- fecha
- vencimiento
- total
- pagado
- saldo
- estado
- acciones

C) Movimientos del proveedor:
Desde pagosProveedores.

Columnas:

- fecha
- tipo de movimiento
- monto
- aplicado a cuentas
- saldo a favor antes
- saldo a favor después
- estado
- responsable
- acciones

D) Historial de pagos aplicados:
Debe poder verse por cuenta y por movimiento.

\==================================================
7\. VISTA CUENTAS
=================

Esta vista reemplaza la tabla actual desordenada.

Debe listar solamente cuentas reales:

source:
gastos where tipo == "proveedor"

Columnas necesarias:

- Fecha
- Proveedor
- Total
- Pagado
- Saldo pendiente
- Vencimiento
- Estado
- Responsable
- Acciones

Estados posibles de cuenta:

- pendiente
- parcial
- pagado
- vencida
- anulada

Reglas:

- Una cuenta con saldo pendiente y fechaVencimiento menor a hoy debe mostrarse como vencida o con indicador de vencimiento.
- Una cuenta con montoPagado = 0 debe ser pendiente.
- Una cuenta con montoPagado > 0 y montoPagado < monto debe ser parcial.
- Una cuenta con montoPagado >= monto debe ser pagada.
- Una cuenta anulada no debe sumar como deuda activa.

Acciones por cuenta:

- Ver detalle
- Registrar pago manual
- Editar cuenta, solo si no está anulada
- Anular cuenta
- Ver historial de pagos

Evitar eliminar cuentas con pagos.
Si una cuenta tiene pagos, debe anularse o ajustarse, no borrarse directamente.

\==================================================
8\. VISTA MOVIMIENTOS
=====================

Crear una vista específica para movimientos de proveedor.

Source:
pagosProveedores

Debe mostrar:

- pagos globales
- ajustes de saldo a favor
- anulaciones
- reversos
- movimientos anulados

Columnas:

- Fecha
- Proveedor
- Tipo de movimiento
- Monto ingresado
- Aplicado a cuentas
- Impacto en saldo a favor
- Estado
- Responsable
- Acciones

Estados de movimiento:

- activo
- anulado
- revertido

Acciones:

- Ver detalle
- Anular movimiento, solo si está activo
- Ver cuentas impactadas

IMPORTANTE:
Los movimientos NO deben poder editarse como cuentas.
Los movimientos NO deben poder eliminarse físicamente desde la UI.
La acción correcta es ANULAR.

\==================================================
9\. PAGO MANUAL SOBRE CUENTA
============================

Actualmente parte de la lógica de pagos manuales se hace desde cliente con updateDoc sobre gastos.

Refactorizar para que los pagos manuales pasen por API/engine transaccional.

Crear endpoint sugerido:

POST /api/erp/cuentas-pagar/\[id]/registrar-pago

Debe:

- validar que la cuenta exista;
- validar que sea tipo proveedor;
- validar que no esté anulada;
- validar monto > 0;
- calcular saldo actual;
- impedir sobrepago accidental, salvo que explícitamente se permita convertir excedente en saldo a favor;
- agregar pago al historial;
- actualizar montoPagado;
- recalcular estadoPago;
- registrar auditoría;
- devolver cuenta actualizada.

Payload sugerido:
{
monto,
fecha,
metodo,
notas,
responsable,
pagoEnDolares,
valorOficialDolar,
comprobantes
}

Regla:
Si monto ingresado > saldo pendiente:
Preguntar o manejar con opción:

- aplicar solo hasta cubrir cuenta;
- enviar excedente a saldo a favor del proveedor.

\==================================================
10\. PAGO GLOBAL DE PROVEEDOR
=============================

Mantener endpoint actual:

POST /api/erp/proveedores/\[id]/pago-global

Pero mejorar su funcionamiento y UI lógica.

Debe:

- obtener saldo a favor actual del proveedor;
- sumar el monto ingresado;
- aplicar automáticamente a cuentas pendientes del proveedor ordenadas por fecha/vencimiento;
- actualizar montoPagado y estadoPago de cada cuenta;
- guardar en pagos\[] de cada cuenta un pago con referencia al pago global;
- registrar movimiento en pagosProveedores;
- guardar cuentasAplicadas;
- actualizar saldoAFavor;
- registrar auditoría;
- operar dentro de transacción.

Reglas:

- El pago global no es una cuenta.
- El pago global debe aparecer solo en movimientos.
- Las cuentas impactadas deben mostrar el pago aplicado en su historial.
- Si sobra dinero luego de pagar cuentas, queda como saldo a favor.
- Si no hay cuentas pendientes, todo el pago queda como saldo a favor.

\==================================================
11\. SALDO A FAVOR
==================

El saldo a favor debe vivir principalmente en proveedores.saldoAFavor.

Los movimientos de saldo a favor deben estar en pagosProveedores.

Acciones posibles:

- generar saldo a favor por excedente de pago global;
- ajustar/quitar saldo a favor manualmente;
- aplicar saldo a favor a cuentas existentes;
- anular un movimiento de saldo a favor.

Crear o revisar endpoint para aplicar saldo a favor a deuda:

POST /api/erp/proveedores/\[id]/aplicar-saldo-a-favor

Debe:

- tomar saldoAFavor disponible;
- aplicar a cuentas pendientes del proveedor;
- actualizar cuentas;
- reducir saldoAFavor;
- registrar movimiento;
- registrar auditoría.

\==================================================
12\. ANULACIÓN DE MOVIMIENTOS
=============================

Mantener y reforzar endpoint:

POST /api/erp/pagos-proveedores/\[id]/anular

Reglas:
Si el movimiento es pagoGlobal:

- revertir pagos aplicados a cuentas usando cuentasAplicadas;
- recalcular montoPagado y estadoPago de cada cuenta;
- revertir delta de saldoAFavor;
- marcar pagosProveedores como anulado;
- registrar motivo, responsable y fecha de anulación;
- registrar auditoría.

Si el movimiento es saldoAFavor:

- revertir el delta de saldoAFavor;
- marcar movimiento como anulado;
- registrar auditoría.

IMPORTANTE:
No borrar movimientos.
No editar movimientos históricos.
No permitir anular dos veces el mismo movimiento.
No permitir anular movimientos ya anulados.

\==================================================
13\. ANULACIÓN DE CUENTAS
=========================

Crear endpoint sugerido:

POST /api/erp/cuentas-pagar/\[id]/anular

Debe:

- validar que la cuenta exista;
- validar tipo proveedor;
- no eliminar físicamente;
- marcar estadoOperativo: "anulada";
- guardar motivoAnulacion;
- guardar fechaAnulacion;
- guardar responsableAnulacion;
- excluir de cálculos de deuda activa;
- mantener historial para trazabilidad.

Si la cuenta tiene pagos:

- no borrar pagos;
- mantener historial;
- mostrar como cuenta anulada;
- definir si los pagos quedan como saldo a favor del proveedor o si se requiere reversión manual.

\==================================================
14\. CÁLCULOS CENTRALIZADOS
===========================

Crear helpers centralizados para evitar cálculos repetidos y distintos entre pantallas.

Archivo sugerido:
lib/erp/cuentas-pagar-calculos.js

Funciones sugeridas:

calcularSaldoCuenta(cuenta)
calcularEstadoCuenta(cuenta)
calcularResumenProveedor(cuentas, proveedor, movimientos)
calcularResumenGeneral(cuentas, proveedores, movimientos)
normalizarCuentaProveedor(doc)
normalizarMovimientoProveedor(doc)
esCuentaVencida(cuenta)
puedeEditarCuenta(cuenta)
puedeAnularMovimiento(movimiento)
puedeRegistrarPago(cuenta)

Todos los componentes deben usar estos helpers para evitar inconsistencias visuales y numéricas.

\==================================================
15\. FORMATOS DE FECHA Y MONEDA
===============================

Unificar formato de moneda:

- ARS
- sin decimales salvo que sea necesario
- formato argentino

Ejemplo:
$1.248.145

Unificar formato de fecha:

- DD/MM/YYYY
- Si hay hora: DD/MM/YYYY HH:mm
- Horario argentino cuando corresponda

Evitar mostrar fechas como:
2026-05-31

Debe mostrarse:
31/05/2026

\==================================================
16\. FILTROS NECESARIOS
=======================

Agregar filtros funcionales:

Para cuentas:

- proveedor
- estado
- fecha desde/hasta
- vencimiento
- solo vencidas
- con saldo pendiente
- pagadas
- anuladas

Para movimientos:

- proveedor
- tipo de movimiento
- estado
- fecha desde/hasta
- responsable

Para proveedores:

- con deuda
- con deuda vencida
- con saldo a favor
- sin deuda
- mayor deuda primero

\==================================================
17\. VALIDACIONES IMPORTANTES
=============================

Validar siempre:

- monto debe ser mayor a 0;
- proveedorId obligatorio;
- fecha obligatoria;
- cuenta debe existir;
- cuenta debe ser tipo proveedor;
- no registrar pagos sobre cuentas anuladas;
- no anular movimientos ya anulados;
- no editar pagos provenientes de pago global desde el historial manual;
- no borrar movimientos de pagosProveedores desde la UI;
- no mezclar ids sintéticos con ids reales de gastos.

\==================================================
18\. LIMPIEZA DE LA UI ACTUAL
=============================

Modificar la pantalla actual para que:

- No aparezcan pagos globales dentro de "Detalle de Cuentas por Pagar".
- No aparezcan saldos a favor dentro de "Detalle de Cuentas por Pagar".
- El resumen por proveedor no calcule mal por mezclar movimientos.
- Las acciones sean coherentes según el tipo de registro.
- No haya botones de eliminar sobre movimientos especiales.
- No haya lógica que intente hacer updateDoc en gastos usando ids pagoGlobal\_\* o saldoAFavor\_\*.

\==================================================
19\. EXPERIENCIA DE USUARIO FUNCIONAL
=====================================

Aunque el mockup visual se hará después, dejar la experiencia funcional preparada así:

Flujo 1:
Crear cuenta por pagar
→ aparece en cuentas
→ impacta resumen proveedor
→ impacta resumen general

Flujo 2:
Registrar pago manual
→ se aplica a una cuenta
→ recalcula estado de cuenta
→ recalcula proveedor
→ recalcula resumen general
→ queda historial

Flujo 3:
Registrar pago global
→ se aplica automáticamente a cuentas pendientes
→ si sobra, genera saldo a favor
→ aparece en movimientos
→ no aparece como cuenta
→ las cuentas impactadas muestran el pago aplicado

Flujo 4:
Anular pago global
→ revierte impacto en cuentas
→ revierte saldo a favor
→ marca movimiento como anulado
→ no borra datos

Flujo 5:
Ajustar saldo a favor
→ actualiza proveedor
→ registra movimiento
→ aparece en movimientos
→ no aparece como cuenta

Flujo 6:
Anular cuenta
→ no borra documento
→ deja trazabilidad
→ excluye de deuda activa

\==================================================
20\. CRITERIO DE IMPLEMENTACIÓN
===============================

Antes de tocar diseño visual:

1. Auditar el código actual del módulo /gastos.
2. Identificar dónde se mezclan gastos tipo proveedor con pagosProveedores.
3. Separar queries y estados:
   - cuentasProveedor
   - movimientosProveedor
   - proveedoresResumen
4. Crear helpers centralizados de cálculo.
5. Crear/reforzar endpoints transaccionales.
6. Eliminar operaciones sensibles directas desde cliente.
7. Corregir tablas para que cada una muestre solo lo que corresponde.
8. Validar flujos completos.
9. Recién después mejorar UI visual.

\==================================================
21\. RESULTADO ESPERADO
=======================

El módulo debe quedar funcionalmente preparado como un sistema de control financiero real.

Debe evitar:

- inconsistencias de saldo;
- pagos duplicados;
- movimientos tratados como cuentas;
- eliminaciones peligrosas;
- cálculos distintos entre pantallas;
- errores por ids sintéticos;
- registros sin trazabilidad.

Debe lograr:

- control perfecto por proveedor;
- deuda clara;
- pagos claros;
- saldo a favor claro;
- historial auditable;
- anulaciones seguras;
- cálculos centralizados;
- experiencia simple para el usuario final.

Ejecutar con criterio profesional, revisando el código existente antes de modificar, manteniendo compatibilidad con los datos actuales y evitando romper flujos existentes.
