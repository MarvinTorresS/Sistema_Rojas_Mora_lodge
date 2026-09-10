/**
 * Página del módulo "Cancha sintética" (HU-001 a HU-006).
 *
 * Esta es la plantilla base del Sprint 1: la estructura visual del
 * módulo, siguiendo el layout de la Opción 3 del prototipo (panel
 * principal a la izquierda + panel lateral tipo asistente a la derecha).
 *
 * A propósito NO tiene todavía:
 *  - useState ni manejo de formulario real.
 *  - Llamadas a services/api.js (eso llega con HU-001 implementada).
 *  - Botones que hagan algo: son solo referencia visual.
 * Los datos de la tabla de abajo son un arreglo fijo (mock), no vienen
 * del backend.
 *
 * Sirve como referencia de patrón para Wagner, Kendall y Alison cuando
 * armen sus propias páginas de módulo.
 */

// Datos de ejemplo, solo para tener algo que mostrar en la plantilla.
// Se reemplazan por datos reales de la API cuando se implemente HU-002.
const RESERVAS_EJEMPLO = [
  { id: 1, cliente: 'Luis Vargas Mora', horario: '4:00 p.m. – 5:00 p.m.', estado: 'Confirmada' },
  { id: 2, cliente: 'Grupo Solano', horario: '6:00 p.m. – 8:00 p.m.', estado: 'Pendiente' },
];

function ReservasCancha() {
  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      {/* Panel principal */}
      <div className="flex-1 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl font-semibold text-primary-900">
              Cancha sintética
            </h2>
            <p className="text-sm text-muted">
              Abierta de 4:00 p.m. a 10:00 p.m. · tarifa ₡8.000 por hora
            </p>
          </div>
          {/* Botón sin acción todavía — se conecta cuando se implemente HU-001 */}
          <button
            type="button"
            className="rounded-lg bg-primary-700 px-4 py-2 text-sm font-medium text-white opacity-60"
            disabled
            title="Pendiente de implementar (HU-001)"
          >
            Registrar reserva
          </button>
        </div>

        <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-alt text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Horario</th>
                <th className="px-4 py-3">Estado</th>
              </tr>
            </thead>
            <tbody>
              {RESERVAS_EJEMPLO.map((reserva) => (
                <tr key={reserva.id} className="border-t border-line">
                  <td className="px-4 py-3">{reserva.cliente}</td>
                  <td className="px-4 py-3">{reserva.horario}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-primary-50 px-2.5 py-1 text-xs font-medium text-primary-800">
                      {reserva.estado}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Panel lateral — referencia visual del "asistente" del prototipo.
          Todavía no tiene pasos reales ni formulario: es solo el molde. */}
      <aside className="w-full shrink-0 rounded-xl border border-line bg-surface p-5 shadow-card lg:w-80">
        <h3 className="font-display text-base font-semibold text-primary-900">
          Nueva reserva
        </h3>
        <p className="mt-1 text-xs text-muted">Plantilla del panel — sin lógica todavía</p>

        <div className="mt-4 flex gap-1">
          {[1, 2, 3, 4].map((paso) => (
            <span key={paso} className="h-1.5 flex-1 rounded-full bg-primary-100" />
          ))}
        </div>

        <div className="mt-5 rounded-lg border border-dashed border-line p-4 text-center text-xs text-faint">
          Acá va el formulario/flujo de la reserva (HU-001), cuando se implemente.
        </div>
      </aside>
    </div>
  );
}

export default ReservasCancha;
