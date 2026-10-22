# Reglas de colaboración del proyecto

## Conservar funcionalidades del equipo

- Antes de editar, identificar la historia solicitada y revisar el estado de Git, las rutas y los puntos de entrada afectados.
- No sustituir una ruta existente por una pantalla nueva si deja inaccesible una función implementada. Conservar la ruta y añadir otra para el flujo nuevo, o integrar ambas funcionalidades manteniendo sus acciones.
- Revisar el diff contra `origin/main` antes de integrar o publicar. Comprobar expresamente rutas, enlaces, importaciones y funciones de otros responsables que desaparezcan o cambien.
- Cuando se cambie navegación compartida, probar con el router real que funcionan los flujos anteriores y los nuevos, incluidos enlaces de regreso y parámetros usados por otros módulos. La compilación y las pruebas aisladas de componentes no bastan.
- No afirmar que no se afectó trabajo ajeno sin comprobar los accesos y comportamientos correspondientes.

## Planes del salón

- `/salon/planes` conserva el catálogo, los filtros, el registro de planes y `?plan=<id>` de HU-008/HU-009.
- `/salon/planes/administrar` contiene búsqueda, edición y eliminación de HU-010/HU-011/HU-012.
- Ambas pantallas deben seguir accesibles y enlazadas. Los enlaces desde reservas al catálogo se conservan.

## Datos y publicación

- Nunca modificar documentos de Drive. Su consulta es de solo lectura y Wagner realiza las subidas.
- Consultar antes de modificar datos de prueba, eliminar registros, ejecutar migraciones o cambiar el esquema. Una autorización concreta no permite otras operaciones ni afectar datos de compañeros.
- No ejecutar reset, limpieza, force push ni sobrescribir cambios o stashes para resolver problemas de integración.
- Hacer commit y push solo con autorización del usuario; publicar en main solo cuando lo autorice expresamente. Conservar el trabajo remoto e indicar qué se verificó y qué permanece pendiente.
- No presentar un caso como aprobado por tener documentos o pruebas de otro alcance. Capturas, versión ejecutada y resultados deben coincidir; señalar las verificaciones que no pudieron realizarse.
