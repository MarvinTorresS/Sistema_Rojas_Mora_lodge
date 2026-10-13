# HU-011 Edición de planes del salón

Responsable: Wagner. Sprint 2.

Las reservas guardan las condiciones contratadas en la tabla existente `audit_log`,
con la acción `hall_booking_plan_contracted` y el plan en `details`.
Editar un plan del catálogo conserva el precio, la duración y la tarifa de horas
extra de las reservas existentes. Seleccionar expresamente un plan en la edición
de una reserva fija las condiciones vigentes de ese plan.

La edición del catálogo registra en `audit_log` los datos anteriores y nuevos.
El cambio y la auditoría se ejecutan en una transacción. El controlador toma el
editor de `req.user.userId`; mientras no exista autenticación se guarda `null`.
La fecha de modificación queda en `audit_log.created_at`.

La pantalla muestra «Plan actualizado exitosamente» y, cuando hay reservas
futuras, «Este plan tiene reservas futuras; el precio nuevo solo aplicará a
solicitudes nuevas».

## Base de datos

Este ajuste no requiere migraciones, columnas nuevas ni cambios de esquema.
Antes de editar un plan se registran las condiciones actuales de las reservas
antiguas que no tengan una entrada de condiciones contratadas. Las entradas ya
existentes no se sobrescriben. No se pueden recuperar precios históricos que
nunca se hayan registrado.

Crear una reserva y registrar sus condiciones se ejecuta en una transacción.
Las consultas del listado leen las condiciones registradas en una consulta por
página. Si el registro está corrupto, se informa el error en lugar de reemplazar
silenciosamente el importe contratado por el precio actual.

## Comprobaciones realizadas

- Backend: 306 pruebas pasan y una permanece marcada TODO.
- Interfaz HU-011: pasa la prueba de la alerta sobre reservas futuras.
- Compilación del frontend: correcta.

## Comprobaciones pendientes

Falta probar las operaciones contra MySQL porque el motor de Docker local no
responde. También falta verificar la identidad del editor al integrar
autenticación y realizar el recorrido manual para grabar evidencias.

1. Registrar una reserva con un plan y una hora extra. Anotar los importes.
2. Cambiar el precio y la duración del plan del catálogo.
3. Consultar la reserva y confirmar que conserva los importes y horas originales.
4. Crear otra reserva y verificar que usa las condiciones nuevas.
5. Revisar la entrada `event_hall_plan_updated` en auditoría.
6. Intentar editar con campos obligatorios incompletos y verificar que no se guarda.

Las evidencias Word se prepararán a partir de la plantilla existente del equipo.
Los documentos del Drive permanecen sin modificaciones.
