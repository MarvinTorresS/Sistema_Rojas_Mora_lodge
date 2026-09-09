'use strict';

// Configuracion en el formato que espera sequelize-cli (distinto del
// formato de config/database.js, que exporta una instancia ya construida
// de Sequelize para uso de la aplicacion en tiempo de ejecucion). Ambos
// archivos leen las mismas variables de entorno para no duplicar valores.
require('dotenv').config();

const common = {
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 3306,
  dialect: 'mysql',
};

module.exports = {
  development: { ...common },
  test: { ...common, database: `${process.env.DB_NAME}_test` },
  production: { ...common },
};
