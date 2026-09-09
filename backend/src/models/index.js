'use strict';

const fs = require('fs');
const path = require('path');
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const basename = path.basename(__filename);
const db = {};

// Carga automaticamente todos los archivos *.model.js de esta carpeta.
// Al agregar un modelo nuevo solo hay que crear el archivo: no hay que
// registrarlo a mano en ningun lado (principio abierto/cerrado).
fs.readdirSync(__dirname)
  .filter((file) => file !== basename && file.endsWith('.model.js'))
  .forEach((file) => {
    const defineModel = require(path.join(__dirname, file));
    const model = defineModel(sequelize, DataTypes);
    db[model.name] = model;
  });

// Segunda pasada: las asociaciones se resuelven aqui porque un modelo
// puede referenciar a otro que todavia no existia en memoria mientras
// se cargaban los archivos de la carpeta.
Object.keys(db).forEach((modelName) => {
  if (typeof db[modelName].associate === 'function') {
    db[modelName].associate(db);
  }
});

db.sequelize = sequelize;

module.exports = db;
