# Rojas Mora Lodge — Sistema de Gestión Integral

Sistema de gestión de reservas, pedidos y facturación para Rojas Mora Sports & Lodge.
Proyecto de Ingeniería de Sistemas II.

## Equipo

Marvin · Wagner · Kendall · Alison

## Arquitectura

La guía completa de arquitectura (módulos, capas, convenciones de código, división de
responsabilidades) está en `Arquitectura_Rojas_Mora_Lodge.html`, en la carpeta raíz de
`Inge 2`. Ábranla en el navegador antes de empezar a codear — ahí está el porqué de cada
carpeta de este repositorio.

## Stack

- **Backend:** Node.js + Express, patrón de 3 capas (routes → controller → service)
- **ORM:** Sequelize
- **Base de datos:** MySQL 8.4 (Docker)
- **Frontend:** React + Vite + React Router + axios
- **Gestor de paquetes:** pnpm (ver sección de seguridad más abajo)

## Requisitos previos

- Node.js 18 o superior
- **pnpm** (no npm) — instalarlo una sola vez por máquina: `npm install -g pnpm`
- Docker Desktop (para levantar MySQL)

## Por qué pnpm y no npm

El registro de npm ha sufrido varios ataques a la cadena de suministro (el más reciente
conocido como "Shai-Hulud"): un paquete popular es comprometido y, al instalarlo, ejecuta
código malicioso automáticamente mediante scripts `postinstall`. Esto le puede pasar a
cualquier gestor que instale desde el mismo registro — pnpm no es inmune al paquete
malicioso en sí, pero **bloquea por defecto la ejecución automática de esos scripts**,
que es justo el mecanismo de ataque. Lo dejamos reforzado y explícito en `.npmrc`
(`ignore-scripts=true`) para que no dependa de la configuración de cada máquina.

Con esto, todo el equipo usa `pnpm install` en vez de `npm install` — **nunca mezclar
ambos** en el mismo proyecto, porque generan lockfiles distintos e incompatibles.

## Cómo arrancar el proyecto

### 1. Levantar la base de datos

```bash
docker compose up -d
```

Esto levanta MySQL 8.4 en `localhost:3306` con los datos definidos en `docker-compose.yml`.

### 2. Configurar variables de entorno

```bash
cp .env.example backend/.env
cp .env.example frontend/.env
```

Editar `backend/.env` y `frontend/.env` con los valores reales de cada quien (normalmente
los valores de ejemplo ya sirven para desarrollo local).

### 3. Backend

```bash
cd backend
pnpm install
pnpm dev
```

El backend queda escuchando en `http://localhost:4000`.

### 4. Frontend

```bash
cd frontend
pnpm install
pnpm dev
```

El frontend queda escuchando en `http://localhost:5173` (puerto por defecto de Vite).

## Estructura del repositorio

Ver el árbol de carpetas completo y comentado en la guía de arquitectura. Resumen rápido:

```
backend/src/
  config/        → conexión a la base de datos y variables de entorno
  models/        → un modelo Sequelize por tabla (compartido por todos los módulos)
  modules/       → un módulo por cada nodo del EDT (rutas + controller + service)
  middlewares/   → autenticación, control de acceso por rol, manejo de errores
  utils/         → lógica compartida entre módulos (traslape de horarios, bloqueo optimista)
  database/      → migraciones y seeders

frontend/src/
  pages/         → una página por módulo, mismo nombre que en la matriz de trazabilidad
  services/      → cliente HTTP por módulo, espejo del backend
  components/    → piezas reutilizables entre páginas
  context/       → estado de sesión (usuario/rol logueado)
```

## Convención de ramas

`feature/<nodo-edt>-<nombre-corto>`, por ejemplo `feature/3.1.1-reservas-cancha`.
El nombre de la rama identifica el módulo que ataca, no quién la hizo.

## Base de datos

El schema de referencia (versión 4.1, la misma del Avance 1 corregido) está en
`backend/src/database/schema_referencia.sql`. Las migraciones de Sequelize en
`backend/src/database/migrations/` son la fuente de verdad para desarrollo; el `.sql`
queda como snapshot de entrega.

## Buenas prácticas de dependencias (por los ataques recientes a npm)

- Nunca corran `pnpm add <paquete>` de un paquete que no reconozcan sin revisar antes
  cuántas descargas semanales tiene y cuándo fue su última actualización en
  [npmjs.com](https://www.npmjs.com).
- Antes de actualizar una dependencia existente a una versión mayor, revisen el changelog
  del paquete — no solo confíen en que "compila".
- Corran `pnpm audit` de vez en cuando para ver si alguna dependencia instalada tiene una
  vulnerabilidad conocida reportada después de que la instalamos.
- El archivo `pnpm-lock.yaml` **sí se sube a Git** (no va en `.gitignore`): fija las
  versiones exactas que todos instalamos, para que a nadie le toque una versión distinta
  o comprometida sin que el equipo se entere.
