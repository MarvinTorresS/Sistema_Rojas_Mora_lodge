/**
 * Placeholder genérico para un módulo que todavía no tiene pantalla propia.
 *
 * Cuando alguien del equipo empiece su HU, reemplaza el uso de este
 * componente en src/App.jsx por su propia página en src/pages/, sin tocar
 * las rutas de los demás módulos.
 */
function PaginaEnConstruccion({ titulo }) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-surface p-10 text-center">
      <h2 className="font-display text-xl font-semibold text-primary-900">{titulo}</h2>
      <p className="mt-2 text-sm text-muted">Este módulo todavía no tiene pantalla implementada.</p>
    </div>
  );
}

export default PaginaEnConstruccion;
