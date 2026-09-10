# Guía de arranque — Sistema Rojas Mora Sports & Lodge

Sigan estos pasos en orden, en su propia computadora, después de clonar el
repositorio. Están pensados para que a los cuatro nos quede exactamente el
mismo entorno.

## 0. Requisitos previos

- **Node.js 18 o superior** instalado.
- **pnpm** instalado globalmente: `npm install -g pnpm`
- **Docker Desktop** instalado y corriendo.
- **Git**.

## 1. Clonar el repositorio

```
git clone https://github.com/MarvinTorresS/Sistema_Rojas_Mora_lodge.git
cd Sistema_Rojas_Mora_lodge
```

## 2. Instalar dependencias

Usamos **pnpm**, no npm ni yarn — no mezclar gestores de paquetes, generan
lockfiles distintos y rompen la instalación de los demás.

```
pnpm install
```

El proyecto tiene configurado `ignore-scripts=true` por seguridad (evita que
un paquete comprometido ejecute código al instalarse). Dos paquetes sí
necesitan compilar algo nativo y ya están aprobados de antemano en
`pnpm-workspace.yaml` (`bcrypt` y `esbuild`), así que `pnpm install` los
compila automáticamente sin que ustedes tengan que hacer nada extra.

## 3. Variables de entorno

Copien los archivos de ejemplo — nunca subimos los `.env` reales a Git:

```
cp .env.example backend/.env
cp frontend/.env.example frontend/.env
```

Los valores por defecto ya sirven para desarrollo local (coinciden con el
`docker-compose.yml`), no hay que cambiar nada a menos que su máquina tenga
el puerto 3306 o 4000 ocupado por otra cosa.

## 4. Levantar la base de datos con Docker

```
docker compose up -d
```

La primera vez que MySQL arranca contra un volumen nuevo tarda unos 10-20
segundos en inicializar (crea sus tablas de sistema y la base de datos
`rojas_mora_lodge` vacía). Pueden verificar que ya está listo con:

```
docker ps
```

Busquen que la columna de estado diga `(healthy)` y no `(health: starting)`.
Si intentan conectarse antes de eso van a ver un error de socket — no es un
problema, solo hay que esperar unos segundos más.

## 5. Crear las tablas (migraciones)

**Nunca ejecuten `schema.sql` a mano contra la base de datos.** Todo el
schema se gestiona por migraciones versionadas en `backend/src/database/
migrations/`, para que las cuatro computadoras del equipo queden
idénticas y con historial de cambios. Desde `backend/`:

```
cd backend
pnpm migrate
```

Deberían ver 21 líneas terminando en `migrated`. Si alguna migración falla
con "table already exists", probablemente ya habían corrido `schema.sql` a
mano antes — avísenle a Marvin antes de seguir, no la fuercen.

## 6. Arrancar el backend

Sigan dentro de `backend/`:

```
pnpm dev
```

Deberían ver en consola `Conexion a la base de datos establecida
correctamente.` y luego `Servidor backend escuchando en
http://localhost:4000`. Prueben abrir `http://localhost:4000/api/health`
en el navegador — debe responder un JSON con `"status":"ok"`.

## 7. Arrancar el frontend

En otra terminal, desde la raíz del proyecto:

```
cd frontend
pnpm dev
```

Vite les va a dar una URL local (normalmente `http://localhost:5173`). El
`pnpm install` del paso 2 ya trajo todo lo que usa el frontend (Tailwind,
PostCSS, autoprefixer y `lucide-react`, la librería de íconos) porque es
un solo workspace de pnpm — no hace falta instalar nada aparte dentro de
`frontend/`.

### Qué van a ver al abrir `http://localhost:5173`

Ya no es una página en blanco: hay una base construida sobre el prototipo
**Opción 3 · Por tareas** que el equipo eligió (header verde oscuro +
Dashboard con 9 tarjetas de tarea). Todavía no tiene lógica real, es la
plantilla común de la que parte cada módulo:

- **"Registrar reserva"** navega a una pantalla real de selección de
  espacio (cancha/salón/cabaña/mesa). "Cancha sintética" entra al módulo
  de Marvin (`pages/ReservasCancha.jsx`, HU-001 a HU-006), que sigue
  siendo solo plantilla (tabla de ejemplo, sin conectar al backend
  todavía).
- **Las otras 8 tarjetas** (y los otros módulos: salón, cabañas,
  restaurante, usuarios, clientes, facturación, autoservicio, SINPE,
  disponibilidad, auditoría) muestran una pantalla de "pendiente de
  implementar" con las HU exactas que le corresponden a cada quien según
  la matriz de trazabilidad.

**Convención para cuando empiecen su módulo:** creen su propio archivo en
`frontend/src/pages/` (ej. `ReservasSalon.jsx` para Wagner), siguiendo el
mismo patrón de `ReservasCancha.jsx`, y reemplacen ÚNICAMENTE el
`<Route>` de su módulo o tarea en `frontend/src/App.jsx` — no toquen las
rutas de los demás, para no generar conflictos de Git en ese archivo que
compartimos los cuatro.

**Hay 3 archivos que van a encontrar en `frontend/src/components/` y que
ya no se usan** (quedaron de una versión anterior del dashboard, antes de
simplificarlo a solo navegación por tarjetas): `DevNav.jsx`,
`Sidebar.jsx` y `PaginaEnConstruccion.jsx`. Se borran en el mismo commit
que trae esta base — si ya actualizaron su copia local y siguen ahí,
bórrenlos a mano.

## Reglas del equipo (para no perder tiempo como ya nos pasó)

- **No mezclar `npm install` con `pnpm install`.**
- **No renombrar archivos de migración ya creados** (los que están en
  `backend/src/database/migrations/`). Sequelize los identifica por su
  nombre exacto; renombrar uno que ya corrió hace que se intente ejecutar
  de nuevo y falle.
- **No correr `schema.sql`/`schema_referencia.sql` directamente contra la
  base de datos.** Si necesitan un cambio de schema, se agrega como una
  migración nueva (pídanle a Marvin que se las explique si no las han
  tocado antes).
- Si necesitan reiniciar la base de datos desde cero (por ejemplo,
  quedó en un estado raro mientras prueban): `docker compose down -v`
  seguido de `docker compose up -d` y `pnpm migrate` otra vez. El `-v`
  borra los datos, así que solo úsenlo si no les importa perder lo que
  tengan cargado en local.
