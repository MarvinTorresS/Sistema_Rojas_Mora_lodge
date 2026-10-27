# Sprint 3 de Wagner: ingreso y salida de cabinas

> Guía actualizada de las funciones nuevas y sus resultados: consultar `HU-021_HU-022_Integracion.md`. Se añadieron autorización administrativa con cobro o exoneración y comprobación de cobertura por factura. La prueba integrada local pasó con la reserva 35 y una factura ficticia autorizada. Las secciones siguientes conservan el registro histórico de las pruebas anteriores y sus límites de aquel momento; los videos anteriores no demuestran las funciones nuevas.

## Alcance y estado

HU-021 registra el ingreso y HU-022 registra la salida. Se conservan el registro, listado, búsqueda y tarifas de cabinas y las dos pantallas de planes del salón. Esta entrega no implementa módulos de otros responsables.

No declarar todo Sprint 3 aprobado: están pendientes la excepción de ingreso anticipado con identidad y permisos reales, la integración de consumos HU-030 y la facturación HU-040. El bloqueo actual de salida es conservador: bloquea cualquier consumo no retirado de una cuenta no cancelada; todavía no distingue consumos facturados de pendientes. Una factura cualquiera no demuestra que cubra esos consumos.

## Antes de probar

Abrir Docker y ejecutar frontend y backend. Usar solo reservas ficticias autorizadas. Los cambios de estado son reales en la base local: no restaurar estados, borrar reservas ni ejecutar migraciones para repetir un video.

Datos al terminar las pruebas del 26 de octubre de 2026:

| Reserva | Nombre para buscar | Estado | Uso disponible |
| --- | --- | --- | --- |
| 25 | Wagner Prueba Ingreso | Finalizada | Salida ya registrada |
| 26 | Wagner Prueba Consumos | En curso | Ingreso ya registrado y bloqueo de salida con consumo |
| 27 | Wagner Prueba Futuro | Activa, entrada 27/10/2026 | Ingreso anticipado solo antes de esa fecha |

Las fechas importan: no usar el caso anticipado cuando su fecha de entrada ya llegó. Para repetir los dos casos exitosos hace falta otra reserva ficticia autorizada con entrada en la fecha actual, sin consumos y con cabina disponible. Su creación aún está pendiente de autorización específica; la reserva 25 ya no sirve para repetirlos.

## HU-021: tres videos de ingreso

Abrir http://127.0.0.1:5173/cabinas/check-in. Grabar la pantalla de escritorio sin narración, desde la búsqueda hasta el resultado, dejando visible el nombre, número de reserva y estado.

### CA-1: ingreso exitoso

1. Buscar una reserva ficticia activa cuya entrada sea hoy y cuya cabina esté disponible.
2. Mostrar el estado Activa y pulsar Registrar check-in una sola vez.
3. Mostrar el mensaje de éxito, el estado En curso y el botón Ingreso registrado deshabilitado.
4. Volver a buscar la reserva: debe conservar En curso.

Resultado comprobado con la reserva 25. Para un nuevo video, no reutilizarla. El resultado no demuestra por sí solo la integración de pedidos del restaurante HU-030.

### CA-2: ingreso anticipado rechazado

1. Buscar una reserva activa con fecha de entrada futura.
2. Mostrar la fecha y pulsar Registrar check-in.
3. Debe aparecer: No es posible realizar el check-in antes de la fecha de entrada.
4. Volver a buscar: debe seguir Activa.

La reserva 27 solo sirve antes del 27/10/2026. La excepción del administrador sigue pendiente; este video demuestra el rechazo normal.

### CA-3: impedir ingreso duplicado

1. Buscar Wagner Prueba Consumos (reserva 26), mientras siga En curso.
2. Mostrar En curso e Ingreso registrado deshabilitado: no permite repetir la acción.
3. Volver a buscar y mostrar que no cambia el estado.

El video demuestra el bloqueo de interfaz. El rechazo del backend ante una petición duplicada se verificó aparte: HTTP 409 y El check-in de esta reserva ya fue registrado. No afirmar que ese mensaje se muestra al pulsar un botón deshabilitado.

## HU-022: tres videos de salida

Abrir http://127.0.0.1:5173/cabinas/check-out.

### CA-1: salida exitosa

1. Usar la misma reserva nueva del video de ingreso exitoso, ya En curso y sin consumos.
2. Buscarla y mostrar estado y número de reserva.
3. Pulsar Registrar check-out y después Confirmar salida.
4. Mostrar el mensaje de éxito, Finalizada y Salida registrada deshabilitado.
5. Volver a buscar para comprobar persistencia. En http://127.0.0.1:5173/cabinas consultar las mismas fechas y comprobar que la cabina vuelve a estar disponible, siempre que no tenga otra reserva o bloqueo.

Se comprobó con la reserva 25 y la disponibilidad de Cabina 1. La emisión de factura HU-040 no está implementada y no debe presentarse como aprobada.

### CA-2: bloqueo con consumo pendiente

1. Buscar Wagner Prueba Consumos, reserva 26.
2. Pulsar Registrar check-out y Confirmar salida.
3. Mostrar Existen consumos pendientes de facturar y que sigue En curso.
4. Volver a buscar: debe continuar En curso.

La cuenta ficticia 2 tiene un consumo ficticio de 1500. No eliminarlo para fingir una factura pagada. El enlace de facturación conduce actualmente a una pantalla pendiente: no demuestra emisión ni pago. La salida después de facturar queda pendiente de integración HU-040.

### CA-3: impedir salida duplicada

1. Buscar Wagner Prueba Ingreso, reserva 25, o la nueva reserva después de su salida exitosa.
2. Mostrar Finalizada y Salida registrada deshabilitado.
3. Volver a buscar para confirmar que se mantiene Finalizada.

El backend también se comprobó aparte: HTTP 409 y El check-out de esta reserva ya fue registrado. La interfaz evita enviar de nuevo mediante el botón deshabilitado.

## Revisión antes de subir evidencias

- Registrar fecha, reserva y resultado real de cada video. Nombrar archivos HU-021-CA-1, HU-021-CA-2, HU-021-CA-3, HU-022-CA-1, HU-022-CA-2 y HU-022-CA-3.
- Si el estado o mensaje no coincide, detener ese caso y reportarlo; no marcarlo aprobado.
- No usar capturas de otra versión ni ocultar las dependencias descritas arriba.
- Comprobar que siguen accesibles /cabinas, /cabinas/reservas, /cabinas/buscar, /cabinas/tarifas, /salon/planes y /salon/planes/administrar.
- Wagner sube los archivos y actualiza los documentos de Drive. Esta guía no modifica Drive.

## Verificaciones técnicas realizadas

Backend: 369 pruebas aprobadas y una pendiente (todo). Frontend seleccionado: 45 pruebas aprobadas, incluidos router real de cabinas, navegación de planes, ingreso, salida y búsqueda. Compilación frontend correcta. No equivalen a aprobar las integraciones pendientes.

Pruebas manuales locales: ingreso de hoy, rechazo anticipado, rechazo duplicado por API, salida sin consumos, rechazo duplicado por API, bloqueo con consumo y disponibilidad posterior a salida. Los estados finales fueron 25 Finalizada, 26 En curso y 27 Activa.

GitHub consultado el 26/10/2026: HEAD y origin/main en cbfbfd0 antes de incorporar estos cambios locales. La entrega actual todavía requiere revisión, autorización de commit y autorización de publicación.
