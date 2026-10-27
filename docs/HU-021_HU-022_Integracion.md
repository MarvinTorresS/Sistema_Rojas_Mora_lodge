# HU-021 y HU-022: integración y validación

## Ingreso anticipado

La interfaz consulta `GET /api/cabin-bookings/:bookingId/early-check-in-quote`. La respuesta indica entrada nueva, noches adicionales, tarifa vigente, recargo y total. El administrador puede elegir cobrar (opción predeterminada) o exonerar el recargo, siempre con motivo. El importe original registrado se conserva; la auditoría distingue el cargo del monto exonerado.

En `POST /api/cabin-bookings/:bookingId/check-in`, el objeto opcional `adminApproval` contiene correo, contraseña, motivo y `expectedAdditionalAmount`. El servidor verifica contraseña con bcrypt, cuenta activa y rol Administrador real. No acepta un rol declarado por el navegador. Las credenciales no se guardan; se limpia el formulario al terminar o cancelar. Se limitan a cinco intentos por IP cada quince minutos, en memoria del proceso. En despliegues con múltiples procesos se necesitará un limitador compartido y HTTPS.

La operación bloquea reserva y recurso, comprueba ocupación y bloqueos en el periodo ampliado, recalcula el recargo y rechaza la confirmación si cambió. Al autorizar, adelanta el inicio a la hora real de ingreso, conserva la salida y registra estado, responsable, motivo, fechas originales y nuevo importe en auditoría. La auditoría del importe reutiliza la acción existente `cabin_booking_updated`, para que búsquedas y extensiones lean el total correcto. Todo ocurre en una transacción.

El flujo de ingreso no crea usuarios, roles ni sesiones. El ingreso normal mantiene su comportamiento. Para la prueba integrada, Wagner autorizó expresamente crear un rol Administrador y un usuario ficticio local (roleId 2 y userId 2). Las credenciales están fuera del repositorio y no se deben publicar.

## Verificación de consumos facturados

La salida examina los consumos no retirados de cuentas no canceladas de la reserva. Un consumo se considera cubierto cuando existe una factura emitida (`issuedAt` no nulo), no anulada (estado pending o paid), del mismo huésped y reserva, con una línea `sourceType=restaurant`, `sourceId=AccountItem.itemId` e importe igual a cantidad por precio unitario. Una factura ajena, anulada, sin emisión, con otra línea o importe insuficiente no habilita la salida.

Este es el contrato que debe respetar HU-040 para integrarse. El repositorio todavía no tiene implementación de emisión de facturas ni un contrato más específico de sourceId. Debe acordarse con su responsable antes de publicar como integración completa. No se ha sustituido la pantalla compartida `/facturacion` ni se ha creado otro módulo de cobro. La salida puede consumir facturas compatibles existentes, pero todavía no se puede demostrar el ciclo de generación desde esa pantalla.

## Verificaciones y límites

- Regresión backend final: 382 aprobadas, una marcada como todo; 16 suites aprobadas. Incluye rechazo de credenciales, rol, cuenta inactiva, recargo cambiado, bloqueo de cabina, exoneración y cobertura de factura.
- Frontend seleccionado: diez aprobadas, incluidos selección de cobro/exoneración, cancelación, navegación real de cabinas y conservación de planes.
- Compilación frontend correcta.
- Prueba integrada local autorizada: reserva 35, Wagner Validacion Completa. El administrador adelantó la entrada del 27 al 26/10/2026, sumó una noche de 45000 al importe original de 45000 y conservó la salida del 28/10. Se verificó rechazo de contraseña incorrecta.
- La cuenta ficticia 3 y su consumo 4 (1500) bloquearon la salida con HTTP 409 y el mensaje requerido, también visible en la interfaz. La factura ficticia emitida 1 cubrió el hospedaje y ese consumo; después la interfaz permitió finalizar la reserva 35. Se verificó auditoría de cambio de importe, ingreso y salida.
- La factura se insertó como dato ficticio autorizado; no es prueba de generación desde HU-040. La exoneración pasó pruebas automáticas; la operación manual integrada usó cobro.
- No hubo migraciones ni modificaciones de esquema. Las escrituras se limitaron a los datos ficticios autorizados. Wagner completó personalmente el ingreso y salida de la reserva 30 para liberar la cabina; el agente no modificó esa reserva.
- Pendiente externo: acuerdo del contrato con HU-040 y su pantalla de generación de facturas. No afirmar que ese módulo ni todo Sprint 3 del equipo están terminados.

## Ejemplo para la prueba manual de Wagner

En `/cabinas/check-in`, buscar **Wagner Video Cinco** (reserva 32) y pulsar Autorizar ingreso anticipado. A fecha 26/10/2026, la cotización muestra dos noches adicionales: cobrando, recargo 90000 y total 135000; sin recargo, total 45000. Entrar con el administrador ficticio, escribir motivo y confirmar solo una de las opciones. Luego buscar el mismo nombre en `/cabinas/check-out` y confirmar salida. No hay consumos en esa reserva.

Para bloqueo de salida, sigue disponible **Wagner Prueba Consumos**, reserva 26. **Wagner Validacion Completa**, reserva 35, ya está finalizada y sirve para demostrar el bloqueo de salida duplicada.
