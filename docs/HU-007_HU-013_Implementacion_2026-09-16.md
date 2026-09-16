# HU-007 y HU-013 — Reservas del salón de eventos (implementación) — 16/09/2026

Primeras HU implementadas del Sprint 2 bajo el nuevo modelo de reparto
por rebanada vertical (ver `Reparto_Sprints_4_personas_2026-09-10.md`
y la reorganización del 16/09/2026): a Marvin le corresponde el
subgrupo "ReservaSalon-Alta" — HU-007 (consultar disponibilidad) y
HU-013 (registrar reserva con plan de precios), 3.0h — sin depender de
la implementación de ningún compañero del mismo sprint.

## Refactor previo (aprobado por Marvin antes de implementar)

Se extrajeron a `backend/src/utils/` dos piezas que antes vivían
duplicadas dentro de `reservasCancha.service.js`, porque HU-013
necesitaba exactamente la misma lógica:

- `domainError.util.js` — la clase `DomainError` (error de dominio con
  `statusCode` adjunto).
- `bookingOverlap.util.js` — `ACTIVE_BOOKING_STATUSES` y dos
  constructores de cláusula `where` de Sequelize:
  `buildBookingOverlapWhere({ start, end, excludeBookingId })` (contra
  `Booking`) y `buildBlockOverlapWhere({ start, end })` (contra
  `ResourceBlock`).

De paso se eliminó `rangesOverlap(aStart, aEnd, bStart, bEnd)`: estaba
declarada y exportada en `reservasCancha.service.js` pero nunca se
llamaba desde ningún lado (cada consulta armaba su propio filtro
`Op.lt`/`Op.gt` a mano) — código muerto, confirmado con `grep` en todo
el backend y en los tests antes de borrarla.

`reservasCancha.service.js` quedó modificado para importar
`DomainError` y los constructores de solapamiento en vez de definirlos
localmente; sigue re-exportando `DomainError` en su `module.exports`
para no romper `tests/unit/reservasCancha.service.test.js` (que hace
`service.DomainError`). Cambio de comportamiento: ninguno — mismas
reglas, mismos mensajes, mismos códigos HTTP.

`handleValidationErrors` (en los `.validator.js`) se dejó duplicada a
propósito, sin extraer, para no ampliar el refactor más allá de lo
acordado con Marvin — queda anotada como candidata a una limpieza
futura.

## Arquitectura

Mismo patrón de 3 capas que `reservasCancha` (routes → controller →
service), dentro de `backend/src/modules/reservasSalon/`:

- `reservasSalon.validator.js` — reglas de forma para `checkAvailabilityRules`
  (HU-007) y `createHallBookingRules` (HU-013).
- `reservasSalon.service.js` — `checkHallAvailability` y
  `createHallBooking`. Contiene dos constantes de política de negocio
  propias del módulo (no importadas de cancha, a propósito — cada
  módulo es dueño de su propia política):
  - `MAX_ADVANCE_BOOKING_DAYS = 30` (mismo valor que cancha, sin pedido
    de un valor distinto para salón).
  - `EVENT_HALL_DEPOSIT_PERCENTAGE = 0.30` — CA-3 de HU-013 ("cálculo
    automático del anticipo") no especifica el porcentaje; confirmado
    con Marvin usar 30% del precio del plan como valor de arranque,
    **pendiente de validar con el encargado del negocio** (mismo
    patrón que `MAX_ADVANCE_BOOKING_DAYS` en HU-001).
- `reservasSalon.controller.js` — traduce HTTP ↔ service.
- `reservasSalon.routes.js` — monta `GET /availability` (HU-007) y
  `POST /` (HU-013, implementadas); deja `PATCH /:bookingId` (HU-014,
  Kendall) y `POST /:bookingId/cancel` (HU-015, Kendall) como TODO
  comentado, mismo patrón que `reservasCancha.routes.js`.

El CRUD de planes de precio (HU-008 a HU-012, Alison/Wagner este
sprint) es una entidad distinta (`event_hall_pricing_plans` vs.
`bookings`) y **no** se creó en esta sesión: va en un archivo hermano
`eventHallPlans.routes.js` dentro de la misma carpeta
`modules/reservasSalon/`, montado bajo `/api/event-hall-plans` — hay
un TODO explícito en `app.js` señalando dónde va esa línea.

`app.js` monta el nuevo router en `/api/hall-bookings`.

### Independencia de datos frente a Alison/Wagner (mismo sprint)

HU-013 necesita un plan de precios existente para poder registrar una
reserva, pero HU-008/HU-009 (creación y listado de planes) son de
Alison este sprint. En vez de depender de que ese código exista y esté
fusionado, se sembraron datos propios de prueba:
`backend/src/database/seeders/20260916000001-seed-event-hall-resource.js`
inserta un `resource` (`resource_id = 2`, `resource_type = 'event_hall'`)
y dos `event_hall_pricing_plans` de ejemplo — mismo patrón que
`20260910000001-seed-field-resource.js` usó para la cancha en Sprint 1.

El frontend usa las constantes `EVENT_HALL_RESOURCE_ID = 2` y una
lista fija `EVENT_HALL_PLANS` (debe coincidir con el seeder) con un TODO
para reemplazarla por `GET /api/event-hall-plans` en cuanto HU-009
exista — mismo criterio que `CANCHA_RESOURCE_ID` en HU-001.

### Frontend — diseño explorado en Figma y elegido por Marvin

En vez de replicar el formulario apilado de `ReservasCancha.jsx`, se
armó una sesión de exploración visual en Figma (3 propuestas, mismo
contexto de HU-007/HU-013 dado como brief):

- **Concepto A** — línea de tiempo interactiva (arrastrar para elegir
  horario, conflictos visibles como bloques rojos sobre la línea).
- **Concepto B** — tarjetas grandes para elegir el plan primero, y un
  panel de resumen fijo (tipo checkout) con fecha/plan/depósito/total
  en vivo y el botón de confirmar ahí mismo.
- **Concepto C** — asistente conversacional por pasos (una pregunta
  grande a la vez, con progreso).

Archivo de la exploración: https://www.figma.com/design/J4HLNUGrliMsen98PEy0Fu

Marvin eligió el **Concepto B**, por ser el más simple de entender
para el encargado: en todo momento hay un solo lugar (el panel lateral)
donde ver "cuánto es y qué falta", sin necesitar arrastrar sobre una
línea de tiempo ni seguir una secuencia de pasos ocultos.

**Implementación** (`frontend/src/pages/ReservasSalon.jsx` +
`services/reservasSalonService.js`, reemplazando el placeholder
`<Route path="salon">` en `App.jsx`):

- Componentes locales no exportados, solo usados en esta página:
  `PlanOptionCard` (tarjeta de plan seleccionable), `SummaryRow` (fila
  etiqueta/valor del panel de resumen), y — desde el ajuste #5 más
  abajo — `ReservationSummaryPanel` y `ReservationConfirmationPanel`
  (los dos estados posibles del panel derecho). No se extrajeron a
  archivos aparte por no haber reutilización real fuera de esta
  pantalla.
- Un único `<form>` envuelve la columna izquierda (fecha/hora + datos
  del cliente) y el panel de resumen de la derecha (con el botón
  "Confirmar reserva"), aunque estén separados visualmente — el botón
  de submit no necesita estar pegado a los inputs. El bloque de
  "Consultar disponibilidad" queda **fuera** de ese `<form>` (HTML no
  permite formularios anidados) y usa un botón `type="button"` con su
  propio `onClick`.
- Flujo: elegir plan (no depende de la disponibilidad) → consultar
  disponibilidad del horario (HU-007) → si está libre, se habilitan
  los campos del cliente → "Confirmar reserva" (HU-013, deshabilitado
  hasta que la disponibilidad esté confirmada).
- El panel de resumen calcula un depósito de **vista previa** en el
  frontend (`DEPOSIT_PERCENTAGE_PREVIEW = 0.30`, duplicando a
  propósito el valor de `EVENT_HALL_DEPOSIT_PERCENTAGE` del backend,
  con comentario explicando por qué) solo para mostrarlo mientras el
  usuario decide; el monto real que se cobra sigue viniendo de la
  respuesta de `POST /hall-bookings` una vez creada la reserva.

**Decisión de diseño que se revirtió a medio camino (antes de llegar a
Figma):** se había planeado reutilizar `DisponibilidadGrid.jsx` (el
comentario original de ese componente invitaba a reutilizarlo para el
salón). Al revisar las HU del sprint se confirmó que el salón no tiene
ninguna historia de "listar reservas del día" (el equivalente a HU-002
de cancha), y esa grilla necesita justo esos datos (incluyendo el
nombre del cliente de cada celda ocupada) para pintar el día completo.
Se optó por resolver HU-007 tal como la pide la historia. Sí se dejó
lista la reutilización futura: se agregó la prop opcional
`backdropStyle` a `DisponibilidadGrid.jsx` (con el fondo de cancha como
valor por defecto, así `ReservasCancha.jsx` no cambia de
comportamiento) para cuando el salón tenga su propia HU de listado.

### Ajustes post-entrega (16/09/2026, feedback de Marvin sobre la UI ya funcionando)

Cinco retoques pedidos después de ver la pantalla corriendo, todos en
`ReservasSalon.jsx`:

1. **Compactación**: la primera versión tenía 3 tarjetas apiladas
   (plan / fecha-hora / datos del cliente), cada una con su propio
   borde y sombra — obligaba a hacer scroll para llegar a los datos
   del cliente. Se unificaron en una sola tarjeta con divisores finos
   entre secciones, y las tarjetas de plan pasaron de bloques grandes
   a chips de una sola línea.
2. **Simetría entre columnas**: el panel de resumen (verde, derecha)
   quedaba más corto que la tarjeta izquierda. Se cambió
   `lg:items-start` a `lg:items-stretch` en el `<form>` para que ambas
   columnas midan lo mismo, y se separó el contenido del panel en dos
   bloques (resumen arriba, botón abajo con `mt-auto`) para que el
   espacio extra quede *entre* ambos en vez de dejar el botón colgando
   a media altura.
3. **Contraste de los campos**: los inputs (blancos) sobre la tarjeta
   (`bg-surface`, casi blanca) con `border-line` (casi del mismo tono)
   eran casi invisibles. Se cambió el borde de reposo a `border-faint`
   (tono ya existente en la paleta, no uno nuevo) y se agregó un
   estado de foco con borde y halo verde
   (`focus:border-primary-600 focus:ring-2 focus:ring-primary-200`) —
   el verde de marca se reserva para el momento en que el campo tiene
   el foco, no como color de reposo permanente.
4. **Tipografía inconsistente**: "Datos del cliente" era un `<h4>` sin
   la clase `font-display` (por lo que salía en la sans-serif del
   body, DM Sans) mientras "Plan y horario" y "Resumen de la reserva"
   sí la tenían (Playfair Display). Se igualó a `<h3>` con la misma
   clase que los otros dos títulos de sección.
5. **Confirmación de la reserva sin dejar la pantalla vacía**: la
   primera versión, al confirmar (HU-013), reemplazaba **toda** el
   área de la tarjeta y el panel por un cuadro de éxito pequeño,
   dejando gran parte de la pantalla en blanco. Marvin pidió
   explícitamente que la tarjeta izquierda ("Plan y horario" / "Datos
   del cliente") se quedara siempre visible, y que solo el contenido
   del `<aside>` derecho cambiara — en el mismo espacio, con una
   animación — entre el resumen y la confirmación.

   Se resolvió sacando el `{confirmation ? ... : ...}` que antes
   envolvía **toda** la página y dejándolo únicamente dentro del
   `<aside>`: el `<form>` con las dos columnas ahora se renderiza
   siempre, y lo único condicional es cuál de dos sub-componentes
   nuevos se monta ahí — `ReservationSummaryPanel` (el resumen de
   antes) o `ReservationConfirmationPanel` (el "recibo": check ✓,
   número de reserva, desglose de plan/depósito y botón "Registrar
   otra reserva").

   Para la animación se armó un hook pequeño y sin dependencias
   nuevas, `useEnterTransition` (`useState` + `useEffect` +
   `requestAnimationFrame`), que arranca en `false` y pasa a `true`
   un frame después de montarse. Cada uno de los dos paneles lo usa
   para condicionar sus propias clases de Tailwind
   (`transition-all duration-300 ease-out` + un estado inicial/final
   distinto: slide+fade para el resumen, scale+fade para la
   confirmación) — como React desmonta un componente y monta el otro
   al cambiar `confirmation`, cada montaje dispara su propia
   animación de entrada, sin necesitar ninguna librería de animación
   ni CSS keyframes escritos a mano.

   El botón "Registrar otra reserva" limpia `confirmation` (React
   vuelve a montar `ReservationSummaryPanel`, que se anima de entrada
   otra vez) y reinicia `queryForm` para la siguiente consulta.

   Verificado por Marvin en `pnpm dev`: la tarjeta izquierda nunca
   desaparece, el panel derecho hace la transición sin dejar espacio
   en blanco, y "Registrar otra reserva" regresa animado al resumen.

## Cobertura de criterios de aceptación

| HU | CA | Dónde se resuelve |
|---|---|---|
| HU-007 | CA-1 Consulta exitosa | `checkHallAvailability` (camino feliz, `available: true`) |
| HU-007 | CA-2 Salón no disponible | `resource.status !== 'available'` o bloqueo vigente (`ResourceBlock`) |
| HU-007 | CA-3 Horario con solicitud pendiente | Reserva existente (`pending` o `active`) que se solapa, vía `buildBookingOverlapWhere` |
| HU-007 | CA-4 Fecha fuera de rango permitido | Pasado, o más de `MAX_ADVANCE_BOOKING_DAYS` en el futuro |
| HU-013 | CA-1 Registro exitoso | `createHallBooking` (camino feliz) |
| HU-013 | CA-2 Conflicto de horario | Igual que HU-007, contra `Booking` y `ResourceBlock` |
| HU-013 | CA-3 Cálculo automático del anticipo | `depositAmount = plan.price * EVENT_HALL_DEPOSIT_PERCENTAGE`, redondeado a 2 decimales |
| HU-013 | CA-4 Campos obligatorios incompletos | `createHallBookingRules` (validator) |

Nota: a diferencia de HU-001 (cancha), la matriz de trazabilidad no le
asigna a HU-013 un criterio de "reserva superpuesta del mismo cliente"
(era CA-5 en HU-001) — no se agregó esa regla aquí para no exceder el
alcance declarado de los 4 CA de HU-013.

## Verificación

Dos niveles de verificación, uno hecho por Claude en esta sesión y
otro por Marvin en su propia máquina (el bridge remoto no puede
ejecutar `pnpm test`/`pnpm dev`/`vite build` — no resuelve los
symlinks que crea pnpm dentro de `node_modules` — así que todo lo que
requiere ejecutar código real quedó del lado de Marvin):

**Hecho por Claude (revisión estática, 16/09/2026):**
- `node --check` (sintaxis) sobre los 9 archivos backend tocados o
  creados, y sobre `reservasSalonService.js` — todos pasaron.
- Revisión cruzada manual de cada campo usado en `reservasSalon.service.js`
  contra los modelos Sequelize reales (`booking.model.js`,
  `eventHallPricingPlan.model.js`, `resource.model.js`,
  `resourceBlock.model.js`, incluyendo el ENUM de `status` y el nombre
  de columna `event_hall_plan_id`).
- Confirmación de que `reservasCancha.service.js` quedó importando
  (no redefiniendo) `DomainError` y los constructores de solapamiento,
  y que sigue re-exportando `DomainError` para no romper
  `tests/unit/reservasCancha.service.test.js`.
- `ReservasSalon.jsx` (no se puede correr `node --check` sobre JSX):
  conteo programático de llaves/paréntesis balanceados y de
  apertura/cierre de cada etiqueta usada, repetido después de cada
  ajuste — incluyendo la versión final de 499 líneas con el rediseño
  del panel de confirmación (ajuste #5) — y confirmación de que solo
  existe un `<form>` real en el archivo. Para ese último ajuste
  también se cruzó la forma del objeto que devuelve
  `createHallBooking` (`{ booking, plan, depositAmount,
  depositPercentage }`, según `reservasSalonService.js`) contra lo que
  consume `ReservationConfirmationPanel` — coincide exacto.

**Confirmado por Marvin en su máquina (16/09/2026):**
- `pnpm test` corrió limpio — las pruebas existentes de
  `reservasCancha.service.test.js` siguen pasando después del refactor
  de `utils/`.
- Flujo completo de HU-013 probado de principio a fin en `pnpm dev`:
  elegir plan → consultar disponibilidad → completar datos del cliente
  → "Confirmar reserva" → pantalla de éxito con el número de reserva y
  el depósito calculado por el backend.
- Ajuste #5 (panel de confirmación animado, sin espacio vacío)
  probado en `pnpm dev` y aprobado ("listo, me gusto asi").

**Sigue sin existir (no es lo mismo que "sin verificar"):** no se
escribieron pruebas unitarias nuevas para `reservasSalon.service.js`
en esta sesión — a diferencia de `reservasCancha`, este módulo no
tiene todavía su propio `tests/unit/reservasSalon.service.test.js`.
La verificación de HU-007/HU-013 hasta ahora es manual (la de Marvin,
de principio a fin) más la revisión estática de Claude, no
automatizada. Mismo estado que varias HU de Sprint 1 en la
planificación ("Implementación completa, faltan pruebas unitarias").

## Pendiente

1. Escribir pruebas unitarias para `reservasSalon.service.js`
   (`checkHallAvailability` y `createHallBooking`), siguiendo el mismo
   patrón que `tests/unit/reservasCancha.service.test.js`.
2. Validar con Jonathan Rojas Mora (o quien corresponda) el porcentaje
   real del anticipo (queda en 30% como valor de arranque).
3. HU-008/HU-009 (Alison): crear `eventHallPlans.*` en
   `modules/reservasSalon/` y montar `/api/event-hall-plans` en
   `app.js` (línea ya señalada con TODO); cuando exista, reemplazar la
   lista fija `EVENT_HALL_PLANS` en `ReservasSalon.jsx` por la llamada
   real.
4. HU-014/HU-015 (Kendall): completar `reservasSalon.routes.js` (las
   dos líneas TODO) reutilizando `reservasSalon.service.js`.
5. Decidir si vale la pena extraer también `handleValidationErrors`
   (duplicada en `reservasCancha.validator.js` y
   `reservasSalon.validator.js`) a un utils compartido.
