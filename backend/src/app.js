'use strict';

// Construye y configura la aplicacion Express, pero NO la pone a
// escuchar en un puerto (eso es responsabilidad de server.js). Separar
// ambas cosas permite, por ejemplo, importar `app` desde un test de
// integracion con supertest sin tener que levantar un socket real.
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const notFoundHandler = require('./middlewares/notFound.middleware');
const errorHandler = require('./middlewares/errorHandler.middleware');

const app = express();

// --- Middlewares globales ---
app.use(helmet());
app.use(cors());
app.use(express.json());
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// --- Ruta de verificacion de vida del servicio ---
// Util para confirmar que el backend arranco y para health checks de
// Docker/orquestadores mas adelante.
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// --- Rutas de cada modulo ---
// Cada integrante monta el router de su modulo aqui, con su propio
// prefijo. Se agregan a medida que cada sprint las va completando.
app.use('/api/field-bookings', require('./modules/reservasCancha/reservasCancha.routes'));

// Sprint 2 (Marvin) — reservas del salon de eventos (HU-007, HU-013 a
// HU-015).
app.use('/api/hall-bookings', require('./modules/reservasSalon/reservasSalon.routes'));

// Sprint 3 (Marvin) — reservas de cabinas (HU-016 a HU-022, HU-127).
app.use('/api/cabin-bookings', require('./modules/reservasCabina/reservasCabina.routes'));

// Sprint 3 (Marvin) — cabinas como recurso: tarifa por noche (HU-128).
app.use('/api/cabins', require('./modules/reservasCabina/cabinRate.routes'));

// TODO (Alison/Wagner, Sprint 2): montar aqui el CRUD de planes de
// precio del salon (HU-008 a HU-012), ej.
// app.use('/api/event-hall-plans', require('./modules/reservasSalon/eventHallPlans.routes'));

// --- Manejo de rutas y errores (siempre al final) ---
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
