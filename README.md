# Rojas Mora Lodge — Sistema de Gestión Integral

Sistema de gestión de reservas, pedidos y facturación para Rojas Mora Sports & Lodge.
Proyecto de Ingeniería de Sistemas II — Universidad Nacional, Sede Regional Brunca,
Campus Coto.

## Equipo

| Integrante | Módulos que desarrolla (ver EDT / matriz de trazabilidad) |
|---|---|
| Marvin | Cancha, personal y autenticación interna, comprobantes SINPE, autoservicio (cancha y salón) |
| Wagner | Salón de eventos, perfiles de clientes web, disponibilidad y bloqueos |
| Kendall | Cabañas, facturación y pagos, auditoría y reportes |
| Alison | Restaurante, autoservicio (cabaña y mesa) |

La asignación detallada por historia de usuario está en `Matriz_Trazabilidad_HU.xlsx` y
la planificación por sprint en `Planificacion_del_Sprint_Rojas_Mora.xlsx` (carpeta
`Avance#1Corregido` de Drive/local, fuera de este repositorio).

## Stack tecnológico

| Capa | Tecnología | Motivo |
|---|---|---|
| Backend | Node.js + Express | Patrón de 3 capas: rutas → controlador → servicio |
| ORM | Sequelize | Migraciones versionadas + un modelo por tabla, compartido entre módulos |
| Base de datos | MySQL 8.4 (Docker) | Ya definida en el modelo relacional del Avance 1 |
| Frontend | React + Vite + React Router + axios | Vite en vez de Create React App (descontinuado) |
| Gestor de paquetes | pnpm | Bloquea por defecto los scripts `postinstall` (ver `.npmrc`), el vector de los ataques recientes a la cadena de suministro de npm. **Nunca mezclar con `npm install`**: generan lockfiles incompatibles. |

Estructura general: **monolito modular**. No se usan microservicios — la modularidad se
logra organizando el backend por carpetas (una por módulo del EDT), no separando
procesos. Para el alcance de este proyecto, microservicios habrían agregado
complejidad operativa (orquestación, comunicación entre servicios) sin ningún beneficio
real: los cuatro módulos comparten la misma base de datos y el mismo ciclo de despliegue.

## Arquitectura del backend

Cada módulo sigue el mismo patrón de tres capas, de afuera hacia adentro:

```
Cliente HTTP
    │
    ▼
routes/       → define el endpoint y qué controller lo atiende. No contiene lógica.
    │
    ▼
controller/   → lee la petición HTTP (req/res), valida la forma de la entrada,
    │           y llama al servicio. No sabe nada de Sequelize ni de SQL.
    ▼
service/      → la lógica de negocio real (reglas de la HU, validaciones,
    │           transacciones). No sabe nada de HTTP ni de Express.
    ▼
models/       → un modelo Sequelize por tabla, compartido por TODOS los módulos.
    │           No vive dentro de cada módulo: evita que dos personas definan el
    ▼           modelo de la misma tabla de dos formas distintas.
MySQL
```

Por qué separar controller de service: permite escribir tests del service (la lógica
que de verdad importa para la rúbrica) sin tener que simular peticiones HTTP, y permite
reusar la misma lógica de negocio desde, por ejemplo, un job programado o un seeder,
sin pasar por una ruta.

### Base de datos y migraciones

El schema de referencia (v4.1) vive en `backend/src/database/schema_referencia.sql` —
es documentación, **no se ejecuta directamente contra la base de datos**. La fuente de
verdad real son las migraciones versionadas en `backend/src/database/migrations/`, una
por tabla, aplicadas con `sequelize-cli`. Esto es intencional: así los cuatro quedamos
con el mismo schema exacto corriendo `pnpm migrate`, con historial de cada cambio en
Git, en vez de que cada quien corra el `.sql` a mano y las bases de datos locales se
desincronicen (nos pasó en el Avance 1 con otros documentos, no lo repetimos aquí).

Bloqueo optimista: `restaurant_accounts.version` usa el mecanismo nativo de Sequelize
para detectar que dos meseros editaron la misma cuenta al mismo tiempo (HU-026, HU-027).

## Estructura del repositorio

```
backend/
  src/
    app.js            → construye la app de Express (middlewares, rutas). No escucha puerto.
    server.js          → punto de entrada: verifica la conexión a BD y arranca el servidor.
    config/
      database.js       → instancia de Sequelize para la app (usa variables de entorno)
      config.js          → config en el formato que exige sequelize-cli (mismas env vars)
    models/             → un modelo Sequelize por tabla + index.js que los carga todos
    database/
      migrations/         → una migración por tabla, fuente de verdad del schema
      schema_referencia.sql → documentación del modelo v4.1, no se ejecuta
    modules/            → un módulo por nodo del EDT (routes + controller + service)
    middlewares/        → manejo centralizado de errores, 404, autenticación (por agregar)
  .sequelizerc          → le dice a sequelize-cli dónde están config/models/migrations

frontend/
  src/
    pages/             → una página por módulo, mismo nombre que en la matriz de trazabilidad
    services/          → cliente HTTP por módulo, espejo del backend
    components/        → piezas reutilizables entre páginas
    context/           → estado de sesión (usuario/rol logueado)

docker-compose.yml     → MySQL 8.4 para desarrollo local
SETUP.md               → guía paso a paso de instalación para el equipo
```

## Requisitos previos

- Node.js 18 o superior
- pnpm (`npm install -g pnpm`)
- Docker Desktop

## Arranque rápido

```bash
pnpm install                                    # dependencias de backend y frontend
cp .env.example backend/.env
cp frontend/.env.example frontend/.env
docker compose up -d                            # levanta MySQL (esperar ~15s la primera vez)
cd backend && pnpm migrate                       # crea las 21 tablas
pnpm dev                                         # arranca el backend en :4000
```

Y en otra terminal, para el frontend:

```bash
cd frontend && pnpm dev                          # arranca en :5173 (Vite)
```

Guía completa con explicación de cada paso y errores comunes: **[SETUP.md](./SETUP.md)**.

## Scripts disponibles

**Backend** (`cd backend`):

| Script | Qué hace |
|---|---|
| `pnpm dev` | Arranca el servidor con recarga automática (nodemon) |
| `pnpm start` | Arranca el servidor sin recarga (para producción) |
| `pnpm migrate` | Aplica las migraciones pendientes contra la base de datos |
| `pnpm migrate:undo` | Revierte la última migración aplicada |
| `pnpm seed` | Carga los datos semilla (seeders) |
| `pnpm test` | Corre las pruebas con Jest |

**Frontend** (`cd frontend`):

| Script | Qué hace |
|---|---|
| `pnpm dev` | Servidor de desarrollo de Vite |
| `pnpm build` | Genera el build de producción |
| `pnpm lint` | Corre ESLint sobre `src/` |

## Convención de ramas

`feature/<nodo-edt>-<nombre-corto>`, por ejemplo `feature/3.1.1-reservas-cancha`. El
nombre de la rama identifica el módulo que ataca, no quién la hizo.
