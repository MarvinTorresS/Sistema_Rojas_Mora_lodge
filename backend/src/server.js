'use strict';

// Punto de entrada del proceso. Verifica la conexion a la base de datos
// ANTES de aceptar trafico: preferimos que el proceso falle rapido y
// visible en consola si MySQL no esta disponible, en vez de arrancar
// "a medias" y que cada request falle de forma confusa mas adelante.
require('dotenv').config();

const app = require('./app');
const sequelize = require('./config/database');

const PORT = process.env.PORT || 4000;

async function startServer() {
  try {
    await sequelize.authenticate();
    console.log('Conexion a la base de datos establecida correctamente.');

    app.listen(PORT, () => {
      console.log(`Servidor backend escuchando en http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('No fue posible conectar a la base de datos:', error.message);
    process.exit(1);
  }
}

startServer();
