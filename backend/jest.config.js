'use strict';

// Configuracion explicita de Jest.
//
// Se agrega este archivo (antes Jest usaba su patron por defecto,
// implicito) porque el proyecto ahora tiene DOS test runners conviviendo:
// Jest (pruebas existentes, ver tests/unit/reservasCancha.service.test.js)
// y Vitest (pruebas nuevas, convencion de nombre *.vitest.test.js).
//
// Sin este archivo, el patron por defecto de Jest
// (**/?(*.)+(spec|test).[jt]s?(x)) tambien encontraria los archivos
// *.vitest.test.js y los ejecutaria con la API de Jest -- que no
// entiende `vi.mock`, `vi.fn`, etc. -- y fallaria. `testPathIgnorePatterns`
// le dice a Jest "de todos los *.test.js, ignora los que sean de Vitest".
module.exports = {
  testPathIgnorePatterns: ['/node_modules/', '\\.vitest\\.test\\.js$'],
};
