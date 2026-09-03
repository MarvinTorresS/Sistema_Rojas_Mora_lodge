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

## Requisitos previos

- Node.js 18 o superior
- Docker Desktop (para levantar MySQL)

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
npm install
npm run dev
```

El backend queda escuchando en `http://localhost:4000`.

### 4. Frontend

```bash
cd frontend
npm install
npm run dev
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
