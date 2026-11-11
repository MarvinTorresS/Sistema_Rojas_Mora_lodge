# Corrección: reserva registrada con el nombre del dueño del teléfono (26/10/2026)

## Problema

En cancha (HU-001) y salón (HU-013), si se registraba una reserva con un nombre nuevo pero con un teléfono que ya pertenecía a otro cliente, la reserva quedaba a nombre de ese otro cliente, sin aviso.

## Causa raíz

- La reserva (`bookings`) no guarda el nombre: guarda `customer_id`, y el nombre sale de `customers.full_name`.
- Los dos módulos resolvían al cliente con `Customer.findOrCreate({ where: { phone }, defaults: { fullName, phone } })`. Si el teléfono existe, `findOrCreate` devuelve ese registro e **ignora los `defaults`**, o sea, el nombre escrito.
- Error de modelado: el teléfono se usaba como identidad de la persona, pero no lo es (familias y oficinas comparten número). La tabla ni siquiera lo marca `UNIQUE`; cédula y correo sí lo son.
- Cabinas no tenía el problema: identifica al huésped por **cédula**, que sí es única por persona (CA-3 de HU-016).

## Solución (Opción A, elegida por el equipo)

Cuando el teléfono ya existe con **otro** nombre, el sistema deja de decidir solo y pregunta, con el mismo patrón que el CA-3 de cabinas.

| Situación | Resultado |
|---|---|
| Teléfono nuevo | Se crea el cliente con el nombre escrito |
| Teléfono existente, mismo nombre (sin importar mayúsculas, tildes ni espacios) | Se reutiliza ese cliente |
| Teléfono existente, otro nombre | `409` con `code: CUSTOMER_PHONE_CONFLICT` y `details.existingCustomers` |
| Reintento con `linkCustomerId` | La reserva queda a nombre del cliente elegido |
| Reintento con `confirmNewCustomer: true` | Se crea otro cliente con el mismo teléfono |

### Contrato de la API (`POST /api/field-bookings` y `POST /api/hall-bookings`)

Campos opcionales nuevos en el body:

- `linkCustomerId`: entero positivo.
- `confirmNewCustomer`: booleano.

Mandar los dos a la vez responde `422`.

```json
{
  "error": {
    "message": "Este teléfono ya está registrado a nombre de Juan Pérez Mora. ...",
    "code": "CUSTOMER_PHONE_CONFLICT",
    "details": { "phone": "88887777", "existingCustomers": [{ "customerId": 4, "fullName": "Juan Pérez Mora" }] }
  }
}
```

## Archivos

### Backend

- `src/services/customerResolution.service.js` (nuevo). Lógica única de cliente por teléfono: `matchCustomerByPhone` (solo lectura) y `createCustomer`. Reemplaza las dos copias de `findOrCreateCustomer`.
- `src/utils/customerResolutionRules.util.js` (nuevo). Reglas de express-validator de los dos campos nuevos.
- `reservasCancha.service.js` / `.validator.js`. Usa el servicio compartido. El teléfono se normaliza a 8 dígitos, porque antes `8888-7777` y `88887777` contaban como teléfonos distintos.
- `reservasSalon.service.js` / `.validator.js`. Usa el servicio compartido. El cliente ahora se crea **dentro** de la transacción de la reserva; antes quedaba guardado aunque la reserva fallara.

### Frontend

- `hooks/useCustomerPhoneConflict.js` y `components/common/CustomerPhoneConflict.jsx` (nuevos, compartidos). El aviso ofrece "Usar a <cliente>" o "Es otra persona: registrar a <nombre>".
- `pages/ReservasCancha.jsx` y `pages/ReservasSalon.jsx`. Muestran el aviso y reenvían la reserva con la elección. Al cambiar el nombre o el teléfono, el aviso desaparece.
- `services/reservasCanchaService.js` y `services/reservasSalonService.js`. Propagan `error.code`. En salón, `details` ya no se asume como arreglo: con el 409 nuevo, el `details.map` anterior habría lanzado `TypeError`.

## Pruebas

- `backend/tests/unit/customerResolution.test.js` (nuevo, Jest, 20 casos): servicio aislado más el flujo HTTP de cancha y salón. Una prueba de mutación confirmó que reintroducir el bug hace fallar 4 casos.
- `frontend/src/components/common/CustomerPhoneConflict.test.jsx` (nuevo, Vitest, 7 casos): componente y flujo completo en salón y cancha.
- Se adaptaron los mocks de las pruebas existentes (`findOrCreate` → `findAll` + `create`) sin cambiar los IDs de caso.
- Resultado: Jest backend 406 ✓, Vitest backend 27 ✓, Vitest frontend 247 ✓, `vite build` ✓.

## Ajuste: teléfonos guardados con formato viejo

En la prueba manual, el salón no preguntaba. La causa: antes de esta corrección, cancha guardaba el teléfono tal como se escribía (`8888-7777`). El salón busca `88887777`, y la comparación exacta en SQL no encontraba esos clientes viejos: creaba un duplicado y no avisaba.

Ahora `buildPhoneLookupWhere` compara solo los dígitos del teléfono guardado. En MySQL genera:

```sql
REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(`phone`, '-', ''), ' ', ''), '(', ''), ')', ''), '+', '') IN ('88887777', '50688887777')
```

No hace falta migrar datos. Una prueba de Jest verifica este SQL generado por Sequelize.

## Pendiente fuera de este alcance

- En cabinas, la modificación de reserva (HU-019) hace `guest.update({ fullName })`, y eso cambia el nombre del huésped en **todas** sus reservas.
- La mejora "guardar el nombre ligado al teléfono" (autocompletar el nombre al escribir el teléfono) puede construirse sobre este mismo servicio.
