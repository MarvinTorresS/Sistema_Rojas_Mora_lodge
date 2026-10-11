# HU-008, HU-009, HU-018 y HU-019 — Planes del salón y búsqueda/modificación de reservas de cabina — 08/10/2026

Cubre el Sprint 2 (planes de precio del salón) y el Sprint 3
(buscar y modificar reservas de cabina). Sprint 1 ya estaba hecho.

> **Antes de probar:** correr `pnpm migrate` en `backend/` (agrega dos columnas
> a `event_hall_pricing_plans`, ver "Base de datos"). Si se olvida, las pantallas de
> planes muestran "La base de datos no está actualizada. Ejecutá `pnpm migrate`…".

## Qué se construyó

| HU | Qué hace | Backend | Pantalla |
|----|----------|---------|----------|
| HU-008 | Registrar un plan de precios del salón | `POST /api/event-hall-plans` | `/salon/planes` → botón **Nuevo plan** |
| HU-009 | Consultar los planes (con filtro por horas) | `GET /api/event-hall-plans?hours=` | `/salon/planes` |
| HU-018 | Buscar una reserva de cabina por huésped | `GET /api/cabin-bookings/search?q=` | `/cabinas/buscar` |
| HU-019 | Modificar una reserva de cabina | `PATCH /api/cabin-bookings/:bookingId` | `/cabinas/buscar` → **Modificar reserva** |

Accesos agregados (un botón pequeño en cada encabezado, sin mover nada):
**Planes** en la pantalla del salón y **Buscar reserva** junto a **Tarifas** en cabinas.

## Criterios de aceptación → dónde se cumplen

**HU-008** — CA-1 el plan se crea y queda disponible de inmediato (la pantalla del
salón ya lee los planes de la base). CA-2 nombre repetido, sin distinguir mayúsculas
ni espacios dobles: 409 `DUPLICATE_PLAN_NAME`, "Ya existe un plan con ese nombre".
CA-3 nombre, duración y precio obligatorios: 422 y se marcan todos los pendientes a la vez.

**HU-009** — CA-1 lista con precio y servicios incluidos, sin depender de HU-007.
CA-2 el filtro por horas sin resultados muestra "No hay planes disponibles para el
horario indicado".

**HU-018** — CA-1 coincidencia parcial por nombre o cédula, sin distinguir mayúsculas
(los `%` y `_` escritos se toman literales); se busca con **Buscar** o **Enter**, no al
escribir. CA-2 sin resultados: "No se encontraron reservas con los criterios indicados"
y el texto buscado se mantiene.

**HU-019** — CA-1 solo reservas activas (o con ingreso registrado); valida la nueva
disponibilidad (la propia reserva se excluye del choque) y deja el registro de la
modificación en `audit_log` (`cabin_booking_updated`, con la fecha/hora de la tabla;
el usuario queda nulo hasta la autenticación del Sprint 5, igual que HU-127).
CA-2 cabina u horario ocupado: 409 `CABIN_NOT_AVAILABLE`, la reserva no cambia y se
sugieren **cabinas libres** y **fechas libres** (mismas noches). CA-3 con check-in
hecho: "No es posible reasignar cabina con huésped hospedado"; sí se puede cambiar la
salida y los datos de contacto (la fecha de entrada tampoco se mueve).

## Base de datos

Migración nueva `20261008000001-add-services-and-deposit-to-event-hall-pricing-plans.js`
(no se editó la original, que ya corrió en todas las bases): agrega
`included_services` (TEXT, JSON) y `deposit_percentage` (DECIMAL(5,2)), ambas con NULL
para no inventar datos de los planes sembrados.

## Archivos

**Backend** — `modules/reservasSalon/eventHallPlans.{util,validator,service,controller,routes}.js`;
`modules/reservasCabina/cabinSearch.{util,validator,service,controller}.js` y
`cabinBookingUpdate.{util,validator,service,controller}.js`. Pruebas:
`tests/unit/eventHallPlans.test.js` y `tests/unit/cabinSearchUpdate.test.js`.

**Frontend** — `pages/PlanesSalon.jsx`, `pages/BuscarReservaCabina.jsx`,
`components/planes/*`, `components/reservaBusqueda/*`, `services/planesSalonService.js`.
Pruebas junto a cada pieza (`*.test.js(x)`).

## Líneas tocadas en archivos de otros compañeros (todas aditivas)

- `app.js`: se montó `/api/event-hall-plans` en el lugar del TODO.
- `reservasCabina.routes.js`: solo se reemplazaron las líneas TODO de HU-018 y HU-019.
- `cabinBilling.service.js`: acción `BOOKING_UPDATED` en `CABIN_AUDIT_ACTIONS`, para que
  `getRecordedStayTotal` (HU-127) lea también el total tras una modificación.
- `reservasCabina.service.js`: se exporta `findAlternativeCabins` (ya existía) para
  reutilizarla en las sugerencias de HU-019.
- `reservasCabinaService.js` (frontend): dos funciones al final (`searchCabinBookings`,
  `updateCabinBooking`).
- `ReservasSalon.jsx`: botón **Planes**, y los planes ahora vienen de la API; la lista fija
  quedó solo como respaldo si la API no responde. Si el catálogo está vacío se avisa y no
  se deja confirmar.
- `ReservasCabina.jsx`: botón **Buscar reserva**. `App.jsx`: dos rutas nuevas.

## Decisiones y supuestos (por confirmar con el equipo / el negocio)

1. **Anticipo por plan.** HU-008 pide "porcentaje de anticipo si aplica". Se guarda y se
   muestra en el plan, pero **no se conectó** a HU-013/HU-014 (anticipo fijo de 30 % en
   `EVENT_HALL_DEPOSIT_PERCENTAGE`) para no tocar el código de Marvin/Kendall. Para
   conectarlo: usar `plan.depositPercentage / 100` cuando no sea nulo.
2. **Planes estándar.** HU-009 habla de Básico 4 h, Medio 8 h y Completo 12 h; el seeder
   siembra solo "Medio día" (6 h) y "Día completo" (12 h). Se pueden registrar los que
   falten desde la nueva pantalla.
3. **"Plan activo".** HU-008 CA-2 dice "plan activo", pero la tabla no tiene estado: el
   nombre se compara contra todos los planes del salón.
4. **Estados modificables (HU-019):** `active` y `checked_in` (igual que HU-127);
   `pending`, `completed`, `cancelled` y `rejected` se rechazan.
5. **Monto al modificar.** Si cambian las noches o la cabina, la estadía se vuelve a
   valorar con la tarifa **vigente** de la cabina elegida y se informa (`repriced`);
   si no, se conserva el total ya registrado. Cambios solo de datos del huésped no
   revisan agenda (no fallan porque la cabina esté en mantenimiento).
6. **Datos del huésped.** Nombre, teléfono y correo se actualizan en la ficha del
   huésped (aplican a todas sus reservas). La cédula no se puede cambiar.
7. **Roles.** HU-008 es del Administrador; los accesos quedan abiertos con un TODO para
   el Sprint 5.
8. La matriz de trazabilidad asigna HU-018/HU-019 a Marvin, pero el plan de sprint las
   asigna a esta parte del trabajo; se siguió el plan de sprint.

## Verificación

Backend: 255 pruebas pasan (127 previas + 128 nuevas). Frontend: 189 pruebas pasan (60
previas + 129 nuevas) y `vite build` compila.

## Verificación contra base de datos real (2026-10-10)

Además de las pruebas unitarias (que simulan la base), los cuatro flujos se probaron
de punta a punta con las migraciones y seeders reales, el backend levantado y el
frontend en un navegador:

- HU-008/009: crear plan, nombre repetido sin distinguir mayúsculas (409), campos
  inválidos (422), filtro por duración y que el plan nuevo se pueda usar de inmediato
  en una reserva del salón.
- HU-018: búsqueda por nombre y por cédula (parcial, sin distinguir mayúsculas),
  sin resultados, criterio vacío o demasiado largo, paginación inválida y texto con
  caracteres especiales.
- HU-019: cambio de datos, fechas y cabina con recálculo de precio, conflicto de
  disponibilidad con alternativas, restricciones de huésped hospedado, reservas no
  modificables, reserva inexistente, campos no editables y dos modificaciones
  simultáneas a la misma cabina (una se aplica y la otra recibe 409).
- Si el servidor no responde, las pantallas de planes y de búsqueda muestran
  "No se pudo conectar con el servidor. Verificá que el sistema esté encendido e
  intentá de nuevo."

## Salón único y bases sin datos iniciales (2026-10-10)

- El formulario de **Nuevo plan** nunca pide elegir salón: Rojas Mora tiene uno solo y el
  backend lo usa automáticamente.
- Si la base todavía no tiene el salón (no se corrió el seeder
  `20260916000001-seed-event-hall-resource.js`), al registrar el primer plan el sistema
  crea el salón "Salón de eventos principal" con id 2 (el mismo que usa el seeder y la
  pantalla de reservas del salón; si el 2 lo ocupa otro recurso, toma el id que asigne la
  base). Ese seeder no es repetible: si ya se creó el salón de esta forma, no hay que
  correrlo después, porque fallaría por id duplicado.
- Dos personas que registren el mismo nombre al mismo tiempo: solo una se guarda, la otra
  recibe "Ya existe un plan con ese nombre" (la revisión de nombres usa lectura bloqueada).

## Pantalla Reservas del salón: planes en desplegable (2026-10-10)

Cambios en `pages/ReservasSalon.jsx` (la lógica de reservas existentes HU-014/015 y el
alta HU-013 no cambió; solo la forma de elegir el plan y el orden de los bloques):

- **Reservas existentes al final**: primero se ve el formulario para registrar la reserva
  y debajo el listado.
- **Plan en un desplegable** junto al título "Plan y horario" (en lugar de una tarjeta por
  plan). Al abrirlo lista todos los planes del catálogo; cada uno tiene "Más información",
  que abre `/salon/planes?plan=<id>`. Se cierra con Escape, con clic fuera o al elegir.
- **Sin plan por defecto**: la reserva empieza sin plan elegido (el resumen muestra
  "Plan sin elegir"). Tampoco se elige uno solo al cargar el catálogo ni después de reservar.
- **Aviso de campos incompletos**: el botón "Confirmar reserva" ya no queda apagado por
  un dato faltante. Si se intenta reservar incompleto no se envía nada y se avisa qué
  falta ("Para reservar falta: elegir un plan y consultar la disponibilidad."), con el
  campo marcado en rojo (plan, nombre, teléfono). Los avisos se quitan al completar cada
  campo. Solo queda apagado si ya se confirmó, si está guardando o si no hay planes.
- `pages/PlanesSalon.jsx` / `components/planes/PlanCard.jsx`: con `?plan=<id>` se resalta
  ese plan ("Plan consultado"), se lleva a la vista y, si el plan ya no existe, se avisa.
- Pruebas: `ReservasSalon.planes.test.jsx` (13) y `PlanesSalon.test.jsx` (17) cubren el
  desplegable, el orden de la pantalla, los avisos y el resaltado. Probado además en
  navegador con la base real (escritorio y celular).

### Ajustes siguientes (2026-10-10)

- **"Consultar disponibilidad" exige plan**: sin plan elegido no se llama a la API; se
  marca el selector de plan en rojo, se muestra "Elegí un plan antes de consultar la
  disponibilidad." y el foco pasa al selector. El aviso se quita al elegir un plan.
- **Tarjetas de planes (`PlanCard`) rediseñadas**: letra más grande (nombre 18 px, precio
  24 px, etiquetas 13 px, servicios 14 px), más espacio y dos zonas: arriba nombre,
  duración, anticipo y precio; abajo "Qué incluye" con cada servicio en su fila con marca de
  visto. En pantallas anchas los planes se ven en dos columnas.
- **Planes sin servicios**: una lista vacía dice "Sin servicios registrados". Si en el
  campo de servicios se escribió "No incluye", "Ninguno", "N/A" o "Sin servicios" (también
  con errores como "No inlcuye"), se muestra "Este plan no incluye servicios adicionales."
  en vez de pintarlo como un servicio (`readServices` en `planesFormat.js`). El dato guardado
  no se modifica.

## Horas extra del salón (2026-10-10)

Un plan cubre una cantidad fija de horas (ej. "Común": 2 h). Si el cliente quiere más
tiempo, las horas que sobran del horario se cobran como **horas extra**.

- **Plan**: campo opcional **"Costo por hora extra"** al registrar el plan
  (`extra_hour_price`). Vacío = el plan no admite horas extra (es el caso de los planes
  que ya existían). La tarjeta del plan muestra "Hora extra ₡X" cuando lo tiene.
- **Reserva**: al elegir un plan y un horario más largo que el plan aparece **"Horas
  extra"** ya calculado (el horario dura 4 h, el plan cubre 2 h → 2 horas extra), con su
  valor (`2 × ₡8 000 = ₡16 000`). El resumen suma las horas extra al **total** y el
  **anticipo (30 %) se calcula sobre ese total**. Cambiar de plan o de horario
  recalcula; el número se puede escribir a mano.
- **Regla (también en el servidor)**: las horas extra deben ser **exactamente** las que el
  horario necesita; ni menos (se cobraría de menos) ni más (se cobrarían horas que no están
  en el horario). Las horas se cuentan completas (2 h 30 min sobre 2 h = 1 hora extra). Un
  plan sin costo por hora extra no deja pasarse del horario y el mensaje dice qué hacer
  (elegir un plan más largo o acortar el horario). Esto cierra el hueco de que se podía
  reservar 4 h con un plan de 2 h pagando solo 2 h.
- **Editar una reserva** (HU-014): campo "Horas extra", vista previa con total y
  anticipo, y el listado indica "+N h extra". Si no se cambian las horas extra, no se envían.
- **Base de datos**: migración nueva `20261010000001-add-extra-hours-to-event-hall.js`
  (`event_hall_pricing_plans.extra_hour_price` DECIMAL nullable y `bookings.extra_hours`
  INT con default 0; las reservas existentes y las de cancha y cabina quedan igual).
  **Hay que correr `pnpm migrate`**; sin eso el listado de reservas del salón falla.
- **Archivos de Marvin tocados** (cambios aditivos; sus pruebas siguen pasando):
  `reservasSalon.service.js`, `reservasSalon.validator.js`, `models/booking.model.js` y, en el
  frontend, `pages/ReservasSalon.jsx` (campo de horas extra, filas del resumen y de la
  confirmación, y la edición).
- **Limitación**: los planes ya registrados no tienen costo por hora extra y todavía no se
  pueden editar (HU-010, de otro compañero). Para ofrecer horas extra en uno de ellos hay
  que registrar un plan nuevo con su costo.
- Pruebas nuevas: `eventHallExtraHours.test.js` (backend), `horasExtra.test.js` y
  `ReservasSalon.horasExtra.test.jsx` (frontend).

## Buscar reserva de cabina: búsqueda arriba y resultados abajo (2026-10-10)

- La pantalla `/cabinas/buscar` (HU-018/HU-019) ya no muestra el buscador y la ficha lado a lado:
  arriba va el buscador con los resultados en una cuadrícula (1, 2 o 3 columnas según el ancho)
  y debajo, a todo el ancho, la ficha de la reserva elegida.
- La ficha aparece solo cuando se elige una reserva; antes quedaba un cuadro vacío enorme.
  Mientras no se elige ninguna, la lista indica "Tocá una para ver su ficha".
- Archivos: `pages/BuscarReservaCabina.jsx` y `components/reservaBusqueda/GuestSearchPanel.jsx`
  (solo cambia la disposición; la lógica y los textos son los mismos). Las 189 pruebas del
  frontend siguen pasando.

## Buscar reserva de cabina: total de personas y tarifa total (2026-10-10)

- En la ficha de la reserva, el campo "Acompañantes" se reemplazó por **Total de personas** y se
  agregó **Tarifa total a pagar** (la estadía completa). El formulario de modificar sigue
  trabajando con acompañantes.
- La búsqueda (`GET /api/cabin-bookings/search`) ahora devuelve `totalAmount` e `isTotalEstimated`
  en cada reserva. El total es el último registrado de la reserva (el mismo que usan extender y
  modificar); si la reserva es anterior a ese registro (por ejemplo las del seeder) se calcula
  con noches × tarifa actual y la ficha lo indica. Se consulta la auditoría una sola vez por página.
- Al guardar una modificación, la ficha toma el nuevo total de la respuesta.
- Archivos: `cabinSearch.service.js`, `cabinBilling.service.js` (función `getRecordedStayTotals`),
  `BookingSheet.jsx`, `searchFormat.js` y sus pruebas (backend 256, frontend 192).

## Validación de cédula, teléfono, correo y nombre (2026-10-10)

Antes la cédula solo se revisaba por largo (se aceptaba "Juan Lopez") y el teléfono también (se
aceptaban letras). Ahora es la misma regla en cabina (registrar y modificar), en salón (registrar) y
en buscar reserva, y se revisa en la pantalla y otra vez en el backend:

| Dato | Regla | Cómo se guarda |
|------|-------|----------------|
| Cédula | solo números: 9 dígitos (cédula) u 11 o 12 (DIMEX); se aceptan guiones y espacios al escribir | solo los números (6-0495-0088 → 604950088) |
| Teléfono | 8 dígitos; se acepta +506, espacios, guiones y paréntesis | solo los 8 dígitos |
| Correo | usuario@dominio.extension, sin espacios ni `..` | tal cual |
| Nombre | letras, espacios, punto, guion y apóstrofo; sin números | tal cual |

- En los campos de cédula y teléfono no se pueden escribir letras ni símbolos.
- Modificar reserva: el formato se exige a lo que se está cambiando, así un dato viejo que no se toca
  no impide corregir, por ejemplo, las fechas.
- Los huéspedes guardados antes con guiones (1-1234-5678) se siguen reconociendo al registrar con
  `112345678`; la búsqueda por cédula también encuentra "6-0495-0088".
- **No se tocó cancha** (otro compañero); usa todavía la regla vieja de teléfono.
- Código nuevo: `backend/src/utils/guestData.util.js` y `frontend/src/components/common/guestData.js`
  (misma regla, un archivo para cada lado). Pruebas: `guestData.test.js` en ambos.
- Archivos de otros compañeros tocados (cambios pequeños): `reservasCabina.validator.js`,
  `reservasCabina.service.js` (solo la búsqueda del huésped por cédula), `reservasSalon.validator.js`,
  `GuestDrawer.jsx`, `ReservasCabina.jsx` y `ReservasSalon.jsx`.
- Datos viejos: los clientes ya guardados con una cédula inválida (por ejemplo "Juan Lopez") no se
  corrigen solos; la cédula no se puede editar desde la pantalla.

### Ajuste: nombre con apellidos y correo ligado a la cédula (2026-10-10)

- **Cabina (registrar y modificar):** el nombre debe llevar nombre y apellido (al menos dos palabras
  de 2 letras o más). Los nombres pueden repetirse entre personas; lo que identifica a cada una es la
  cédula (única). En modificar se exige solo si se cambia el nombre.
- **Correo ligado a la cédula:** cada cédula tiene su propio correo. Si se escribe un correo que ya
  pertenece a otra cédula, se rechaza con "Ese correo ya está registrado con otra cédula…" (código
  `EMAIL_IN_USE`, marcado en el campo del correo, tanto al registrar como al modificar).
- **Teléfono:** puede repetirse (una familia comparte número).
- Salón: el nombre del cliente sigue pidiendo solo letras (sin números), sin exigir apellidos.
- Archivos: `guestData.util.js` y `guestData.js` (`isFullName`), validadores y servicios de cabina,
  `GuestDrawer.jsx`, `ReservasCabina.jsx`, `searchFormat.js` y sus pruebas.
