# Sprint 4 — Backend de HU-102, HU-104, HU-113 y HU-024 (Marvin)

> Borrador. Estado: implementado y probado en el entorno local el 2026-11-11. **Sin commit.**

## 1. Resumen

| Historia | Qué hace | Endpoint |
|---|---|---|
| HU-102 | Registrar una mesa (Resource + RestaurantTable, estado "Disponible") | `POST /api/restaurant-tables` |
| HU-104 | Buscar mesas por número exacto y/o capacidad mínima | `GET /api/restaurant-tables?number=&minSeats=` |
| HU-113 | Registrar un producto del menú + lista oficial de categorías | `POST /api/restaurant-products`, `GET /api/restaurant-products/categories` |
| HU-024 | Abrir la cuenta de una mesa (mesa → "Ocupada") | `POST /api/restaurant-accounts` |

### Archivos creados

| Archivo | Por qué |
|---|---|
| `backend/src/database/migrations/20261111000001-add-location-to-restaurant-tables.js` | La columna `location` (VARCHAR(60) NULL) no existía. Es una migración nueva, así que las anteriores no se editan. |
| `backend/src/modules/restaurante/cuentaApertura.service.js` | `openTableAccount` (HU-024). |
| `backend/src/modules/restaurante/usuarioResponsable.service.js` | `assertActingUser(userId, { required })`: comprueba que el usuario exista y esté activo. HU-024 lo exige; en HU-102 y HU-113 es opcional (solo auditoría). |
| `backend/src/modules/restaurante/catalogoProductos.validator.js` | Reglas de `POST /api/restaurant-products`. |
| `backend/tests/unit/restaurantTables.createTable.vitest.test.js` | 21 pruebas, HU-102 |
| `backend/tests/unit/restaurantTables.searchTables.vitest.test.js` | 16 pruebas, HU-104 |
| `backend/tests/unit/restaurantProducts.createProduct.vitest.test.js` | 22 pruebas, HU-113 |
| `backend/tests/unit/restaurantAccounts.openTableAccount.vitest.test.js` | 18 pruebas, HU-024 |

### Archivos modificados (solo se agregó código)

| Archivo | Cambio |
|---|---|
| `models/restaurantTable.model.js` | Atributo `location`. |
| `restaurante/restaurante.util.js` | Nuevos `MESSAGES` y `CODES`; constantes (`PRODUCT_CATEGORIES`, límites); funciones puras `normalizeTableNumber`, `isValidTableNumber`, `normalizeProductName`, `productNameKey`, `resolveProductCategory`, `isValidPrice`, `parseStock`, `mapCatalogProduct`. |
| `restaurante/catalogoMesas.service.js` | `createTable` (HU-102). `listTables(criteria = {})` acepta filtros y, **sin ellos, devuelve exactamente lo mismo que antes** (HU-103). |
| `restaurante/catalogoMesas.validator.js` | `createTableRules`, `searchTablesRules` y `handleRequiredFieldErrors` (un 422 con `code: REQUIRED_FIELDS` cuando falta un obligatorio). |
| `restaurante/catalogoMesas.controller.js` / `.routes.js` | `POST /`; `GET /` pasa `number` y `minSeats` al service. |
| `restaurante/catalogoProductos.service.js` / `.controller.js` / `.routes.js` | `createProduct`, `listCategories`, `GET /categories` y `POST /`. `listProducts` (HU-114/115) no cambia. |
| `restaurante/cuentasMesa.validator.js` / `.controller.js` / `.routes.js` | `openAccountRules`, `openAccount` y `POST /`. |

### Decisiones

- **Número de mesa:** se recortan los espacios y se valida el formato (letras, dígitos y guion, hasta 10 caracteres). Si es solo dígitos se quitan los ceros a la izquierda (`"05"` → `"5"`); si lleva letras se pasa a mayúsculas (`"t-1"` → `"T-1"`). La collation `utf8mb4_0900_ai_ci` ya trata `a1` y `A1` como iguales en el índice UNIQUE; con las mayúsculas, lo que se guarda coincide con lo que se compara. HU-104 aplica la misma normalización al buscar.
- **Duplicados (mesa y producto):** se hace un chequeo previo para dar el mensaje de la historia y, además, se captura `SequelizeUniqueConstraintError` para el caso de dos administradores al mismo tiempo. Las dos rutas terminan en el mismo 409. El rollback evita que queden `Resource` huérfanos (verificado en MySQL).
- **Productos duplicados:** la comparación se hace en JS sin distinguir mayúsculas ni tildes (`"Café negro"` = `"cafe NEGRO"`), dentro de la misma categoría. Así no depende de la collation de cada base local.
- **Categorías:** en `products.category` se guarda la etiqueta legible (`Entrada`, `Plato fuerte`, `Bebida`, `Postre`), para que HU-114 la muestre tal cual y su búsqueda por texto funcione. La API acepta cualquier combinación de mayúsculas y minúsculas (`"bebida"` → `"Bebida"`).
- **Precio:** se guarda como texto con 2 decimales (`"1200.50"`) para evitar errores de coma flotante. **Existencias:** el valor por defecto es 0.
- **Un producto con existencias 0** se crea con `isAvailable: true`, pero el catálogo de HU-114 lo muestra como **"Agotado"** porque la regla de esa historia depende de las existencias. El CA-1 dice "Disponible": si el equipo quiere que se vea así, conviene exigir existencias > 0 o revisar la regla de HU-114.
- **HU-024, concurrencia:** la fila de la mesa se bloquea con `LOCK.UPDATE` y la cuenta `open` se busca con bloqueo. La fuente de verdad es si existe una cuenta `open`, no `table.status`: una mesa con `status = occupied` pero sin cuenta abierta (dato desincronizado) sí se puede abrir. Una cuenta `closed` anterior no impide abrir otra.
- **CA-2 vs CA-3:** se distinguen por `seenTableStatus`. Si el mesero vio la mesa `available` → `TABLE_ALREADY_OPENED`; si vio `occupied` o no envía el campo → `TABLE_OCCUPIED`. En ambos casos `details.accountId` permite que el frontend ofrezca "Ir a la cuenta abierta".
- **HU-104:** los totales (`total`, `activeTotal`, `inactiveTotal`, `totalCapacity`) se calculan sobre todo el catálogo. `matchedTotal` y `filters` **solo aparecen si llega algún filtro**: el test Jest de HU-103 compara la respuesta sin filtros con `toEqual` exacto. Un parámetro vacío (`?number=`) cuenta como ausente.

### Propuestas de refactor para el equipo (no aplicadas)

1. `consumoHuesped.service.js` (HU-030) abre una cuenta dentro de `registerGuestConsumption` con reglas casi iguales a `openTableAccount`, y tiene su propio `assertActingUser` privado. Ambas historias podrían usar `cuentaApertura.service.js` y `usuarioResponsable.service.js`.
2. `listProducts` (HU-114) podría usar `mapCatalogProduct` de `restaurante.util.js`, que devuelve la misma forma.

## 2. Contrato de la API

Formato de error (el de siempre): `{ "error": { "message", "code"?, "details"? } }`. **El frontend decide por `code`.**

| Método | Ruta | Body / Query | 2xx | Errores (status · code · mensaje) |
|---|---|---|---|---|
| POST | `/api/restaurant-tables` | `{ tableNumber*, seatCount*, location?, userId? }` | **201** `{ data: Table, message: "Mesa registrada exitosamente" }` | 422 · `REQUIRED_FIELDS` · "Los campos marcados con (*) son obligatorios" (`details[]`) — 422 · (sin code) · formato inválido (`details[]`) — 422 · `ACTING_USER_INVALID` — 409 · `TABLE_NUMBER_DUPLICATE` · "Ya existe una mesa registrada con ese número" (`details: { tableNumber, tableId? }`) |
| GET | `/api/restaurant-tables` | `?number=` (exacto, normalizado) `&minSeats=` (1-20), opcionales y combinables | **200** `{ data: Table[], meta: { total, activeTotal, inactiveTotal, totalCapacity, matchedTotal?, filters? } }` | 422 · (sin code) · criterio inválido (`details[]`). Sin coincidencias **no** es error: `data: []`, y el frontend muestra "No se encontraron mesas con los criterios indicados" (`MESSAGES.TABLES_NOT_FOUND`). |
| GET | `/api/restaurant-products/categories` | — | **200** `{ data: [{ value, label }], meta: { total } }` | — |
| POST | `/api/restaurant-products` | `{ name*, category*, price*, stockQuantity?, userId? }` | **201** `{ data: Product, message: "Producto registrado exitosamente" }` | 422 · `REQUIRED_FIELDS` (`details[]`) — 422 · (sin code) · categoría, precio o existencias inválidos — 422 · `ACTING_USER_INVALID` — 409 · `PRODUCT_DUPLICATE` · "Ya existe un producto con ese nombre en esta categoría" (`details: { name, category, productId? }`) |
| POST | `/api/restaurant-accounts` | `{ tableId* (número), seenTableStatus? ("available"\|"occupied"), userId* }` | **201** `{ data: { account: AccountDetail, table: Table }, message: "Cuenta abierta exitosamente" }` | 422 · (sin code) · `tableId` / `seenTableStatus` / `userId` inválidos — 422 · `ACTING_USER_INVALID` · "El usuario indicado no existe o está inactivo." — 404 · (sin code) · "La mesa indicada no existe." — 409 · `TABLE_INACTIVE` · "La mesa seleccionada está inactiva" — 409 · `TABLE_ALREADY_OPENED` · "Esta mesa ya fue abierta" (`details: { tableId, accountId }`) — 409 · `TABLE_OCCUPIED` · "La mesa ya se encuentra ocupada" (`details: { tableId, accountId }`) |

`*` = obligatorio. `userId` es temporal hasta la autenticación del Sprint 5 (`RESTAURANT_USER_ID` en el frontend).

**Reglas de campos**
- `tableNumber`: letras, dígitos y guion, hasta 10 caracteres; `"05"` se trata como `"5"`.
- `seatCount` / `minSeats`: entero entre 1 y 20.
- `location`: hasta 60 caracteres; vacía se guarda como `null`.
- `name`: hasta 100 caracteres; se colapsan los espacios.
- `category`: una de `GET /categories`.
- `price`: mayor que 0, hasta 99 999 999.99, con máximo 2 decimales (número o texto).
- `stockQuantity`: entero ≥ 0; por defecto 0.

**Formas de respuesta**
- `Table` = `{ tableId, tableNumber, seatCount, location, status: "available"|"occupied"|"inactive", isActive, stateLabel: "Activa"|"Inactiva", isOccupied }`
- `Product` = `{ productId, name, category, price, stockQuantity, soldOut, status: "Disponible"|"Agotado"|"No disponible", isAvailable }` (la misma forma que HU-114)
- `AccountDetail` = `{ accountId, status, version, openedAt, bookingId, customerId, table: { tableId, tableNumber, seatCount }, items: [], itemCount, accumulatedTotal }` (la misma forma que HU-025)

### Ejemplos por CA (respuestas reales del entorno local)

**HU-102 CA-1** — `POST /api/restaurant-tables`
```json
{ "tableNumber": "05", "seatCount": 4, "location": " Terraza ", "userId": 1 }
```
```json
201 { "data": { "tableId": 1, "tableNumber": "5", "seatCount": 4, "location": "Terraza", "status": "available",
  "isActive": true, "stateLabel": "Activa", "isOccupied": false }, "message": "Mesa registrada exitosamente" }
```
**HU-102 CA-2** — `{ "tableNumber": "5", "seatCount": 6 }`
```json
409 { "error": { "message": "Ya existe una mesa registrada con ese número", "code": "TABLE_NUMBER_DUPLICATE",
  "details": { "tableNumber": "5", "tableId": 1 } } }
```
**HU-102 CA-3** — `{ "location": "x" }`
```json
422 { "error": { "message": "Los campos marcados con (*) son obligatorios", "code": "REQUIRED_FIELDS", "details": [
  { "field": "tableNumber", "message": "El número de mesa es obligatorio." },
  { "field": "seatCount", "message": "La capacidad (comensales) es obligatoria." } ] } }
```
**HU-104 CA-1** — `GET /api/restaurant-tables?number=05`
```json
200 { "data": [ { "tableId": 1, "tableNumber": "5", "seatCount": 4, "location": "Terraza", "status": "available",
  "isActive": true, "stateLabel": "Activa", "isOccupied": false } ],
  "meta": { "total": 4, "activeTotal": 4, "inactiveTotal": 0, "totalCapacity": 18, "matchedTotal": 1, "filters": { "number": "5" } } }
```
**HU-104 CA-2** — `GET /api/restaurant-tables?number=99&minSeats=2`
```json
200 { "data": [], "meta": { "total": 4, "activeTotal": 4, "inactiveTotal": 0, "totalCapacity": 18,
  "matchedTotal": 0, "filters": { "number": "99", "minSeats": 2 } } }
```
**HU-104 criterio inválido** — `?minSeats=0`
```json
422 { "error": { "message": "La capacidad mínima debe ser un número entero entre 1 y 20.",
  "details": [ { "field": "minSeats", "message": "La capacidad mínima debe ser un número entero entre 1 y 20." } ] } }
```
**HU-113 categorías** — `GET /api/restaurant-products/categories`
```json
200 { "data": [ { "value": "Entrada", "label": "Entrada" }, { "value": "Plato fuerte", "label": "Plato fuerte" },
  { "value": "Bebida", "label": "Bebida" }, { "value": "Postre", "label": "Postre" } ], "meta": { "total": 4 } }
```
**HU-113 CA-1** — `POST /api/restaurant-products`
```json
{ "name": "  Café   negro ", "category": "bebida", "price": "1200.5", "stockQuantity": 20, "userId": 1 }
```
```json
201 { "data": { "productId": 1, "name": "Café negro", "category": "Bebida", "price": 1200.5, "stockQuantity": 20,
  "soldOut": false, "status": "Disponible", "isAvailable": true }, "message": "Producto registrado exitosamente" }
```
**HU-113 CA-2** — `{ "name": "cafe NEGRO", "category": "Bebida", "price": 900 }`
```json
409 { "error": { "message": "Ya existe un producto con ese nombre en esta categoría", "code": "PRODUCT_DUPLICATE",
  "details": { "name": "cafe NEGRO", "category": "Bebida", "productId": 1 } } }
```
**HU-113 CA-3** — `{ "stockQuantity": 5 }`
```json
422 { "error": { "message": "Los campos marcados con (*) son obligatorios", "code": "REQUIRED_FIELDS", "details": [
  { "field": "name", "message": "El nombre del producto es obligatorio." },
  { "field": "category", "message": "La categoría es obligatoria." },
  { "field": "price", "message": "El precio es obligatorio." } ] } }
```
**HU-024 CA-1** — `POST /api/restaurant-accounts`
```json
{ "tableId": 1, "seenTableStatus": "available", "userId": 1 }
```
```json
201 { "data": {
  "account": { "accountId": 1, "status": "open", "version": 1, "openedAt": "2026-11-11T17:30:05.599Z", "bookingId": null,
    "customerId": null, "table": { "tableId": 1, "tableNumber": "5", "seatCount": 4 }, "items": [], "itemCount": 0, "accumulatedTotal": 0 },
  "table": { "tableId": 1, "tableNumber": "5", "seatCount": 4, "location": "Terraza", "status": "occupied",
    "isActive": true, "stateLabel": "Activa", "isOccupied": true } },
  "message": "Cuenta abierta exitosamente" }
```
**HU-024 CA-2** — el mesero veía la mesa `available` y otro se le adelantó
```json
409 { "error": { "message": "Esta mesa ya fue abierta", "code": "TABLE_ALREADY_OPENED", "details": { "tableId": 1, "accountId": 1 } } }
```
**HU-024 CA-3** — `{ "tableId": 1, "seenTableStatus": "occupied", "userId": 1 }`
```json
409 { "error": { "message": "La mesa ya se encuentra ocupada", "code": "TABLE_OCCUPIED", "details": { "tableId": 1, "accountId": 1 } } }
```

> Con `NODE_ENV=development`, las respuestas de error también traen `stack` (es el comportamiento del `errorHandler` existente).

## 3. Comandos

```bash
cd backend
pnpm run migrate          # aplica 20261111000001-add-location-to-restaurant-tables
pnpm run test:vitest      # Vitest (incluye las 4 suites nuevas)
pnpm test                 # Jest del equipo
npx vitest run tests/unit/restaurant --reporter=verbose   # solo las suites de este documento
pnpm run dev              # API en el puerto de .env, para Postman
```

**Importante para el equipo:** el modelo `RestaurantTable` ahora lee `location`. Quien no corra la migración recibirá un error de columna desconocida en `GET /api/restaurant-tables` (HU-103), así que hay que correr `pnpm run migrate` después de integrar.

**Usuario para HU-024:** no hay seeder de usuarios ni de roles. En mi base local creé, con autorización, el rol `Mesero` (`role_id 1`) y el usuario `mesero.prueba@lodge.local` (`user_id 1`). Para crearlo en otra base:
```bash
node -e "const {Role,User,sequelize}=require('./src/models');const b=require('bcrypt');(async()=>{const [r]=await Role.findOrCreate({where:{roleName:'Mesero'}});const [u]=await User.findOrCreate({where:{email:'mesero.prueba@lodge.local'},defaults:{fullName:'Mesero Prueba',passwordHash:await b.hash('Prueba123!',10),roleId:r.roleId,isActive:true}});console.log('userId',u.userId);await sequelize.close()})()"
```

## 4. Verificación realizada (2026-11-11)

- **Vitest (suites nuevas):** 4 archivos, 77 pruebas, todas pasan.
- **Vitest (completo):** 122 de 140 pasan. Los 18 fallos están en `reservasSalon.checkHallAvailability` y `reservasSalon.createHallBooking` (HU-007/HU-013). No tienen relación con este trabajo: esas pruebas esperan el comportamiento anterior del salón, que cambió en el commit `d5cd6bf` (reserva por día; ahora devuelve `checkInTime`/`checkOutTime` y otros mensajes).
- **Jest del equipo:** 17 de 17 suites; 511 pruebas pasan y 1 está marcada como `todo`. Incluye HU-103/106, HU-105, HU-025/030/031, HU-026 y HU-114/115.
- **HTTP contra MySQL local** (router real con supertest):
  - Todos los CA de las 4 historias.
  - HU-102: dos registros simultáneos del mismo número dan un 201 y un 409, sin `Resource` huérfano.
  - HU-024: dos aperturas simultáneas de la misma mesa dan un 201 y un 409 `TABLE_ALREADY_OPENED`, con una sola cuenta `open` por mesa.
  - HU-103 sin filtros mantiene su forma, HU-114 lista los productos nuevos y HU-025 lista las cuentas abiertas.
- **Pendiente:**
  - Probar desde el frontend, que todavía no existe.
  - Datos de prueba que quedaron en la base local: 4 mesas (5, 12, 15 y 20), 2 cuentas abiertas (mesas 5 y 12), 2 productos, 1 rol, 1 usuario y sus registros en `audit_log`.
