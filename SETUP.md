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

Vite les va a dar una URL local (normalmente `http://localhost:5173`).

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
