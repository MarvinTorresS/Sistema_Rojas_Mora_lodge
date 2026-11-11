'use strict';

// Configuracion de Vitest para el backend.
//
// El proyecto ya tenia Jest (ver tests/unit/reservasCancha.service.test.js,
// de Kendall/Alison) antes de que este archivo existiera, asi que Vitest
// se agrega SIN reemplazarlo: ambos runners conviven, cada uno con su
// propio patron de archivo.
//
// `include` limita Vitest a *.vitest.test.js (nunca *.test.js a secas),
// para que nunca intente ejecutar las pruebas de Jest -- que usan
// `jest.mock`/`jest.fn`, API que Vitest no entiende igual.
const { defineConfig } = require('vitest/config');

module.exports = defineConfig({
  test: {
    include: ['tests/**/*.vitest.test.js'],
    environment: 'node',
    globals: false, // se importa describe/it/expect/vi explicitamente en cada archivo
  },
});
