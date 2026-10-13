# HU-011 Edición de planes del salón

Responsable: Wagner. Sprint 2.

Las reservas guardan las condiciones contratadas en `bookings.hall_plan_snapshot`.
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

## Preparación local

Con Docker y MySQL disponibles, ejecutar desde `backend`:

```powershell
pnpm migrate
```

La migración `20261012000001-preserve-contracted-hall-plan.js` agrega el campo y
conserva las condiciones actuales para las reservas antiguas. No recupera precios
históricos que no se hayan registrado. No usar `migrate:undo` sobre datos que se
necesiten conservar: eliminaría las condiciones contratadas guardadas.

## Comprobaciones realizadas

- Backend: 304 pruebas pasan y una permanece marcada TODO.
- Interfaz HU-011: pasa la prueba de la alerta sobre reservas futuras.
- Compilación del frontend: correcta.

## Comprobaciones pendientes

La migración todavía no se ha ejecutado contra MySQL porque el motor de Docker
local no responde. También falta verificar la identidad del editor al integrar
autenticación y realizar el recorrido manual para grabar evidencias.

1. Registrar una reserva con un plan y una hora extra. Anotar los importes.
2. Cambiar el precio y la duración del plan del catálogo.
3. Consultar la reserva y confirmar que conserva los importes y horas originales.
4. Crear otra reserva y verificar que usa las condiciones nuevas.
5. Revisar la entrada `event_hall_plan_updated` en auditoría.
6. Intentar editar con campos obligatorios incompletos y verificar que no se guarda.

Las evidencias Word se prepararán a partir de la plantilla existente del equipo.
Los documentos del Drive permanecen sin modificaciones.
