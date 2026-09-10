import { Link } from 'react-router-dom';
import { ArrowLeft, Construction } from 'lucide-react';

/**
 * Placeholder para una tarea del Dashboard que todavía no tiene pantalla
 * real implementada.
 *
 * Recibe el mismo ícono y título de la tarjeta que el usuario presionó
 * (ver pages/Dashboard.jsx), para que quede claro a qué tarea corresponde
 * esta pantalla vacía, y qué HU hay que implementar para reemplazarla.
 */
function PantallaPendiente({ icon: Icon, titulo, huRelacionadas }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-10 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary-700">
        {Icon ? <Icon size={26} strokeWidth={1.8} /> : <Construction size={26} strokeWidth={1.8} />}
      </span>
      <div>
        <h2 className="font-display text-xl font-semibold text-primary-900">{titulo}</h2>
        <p className="mt-1 text-sm text-muted">
          Pantalla pendiente de implementar
          {huRelacionadas ? ` (${huRelacionadas})` : ''}.
        </p>
      </div>
      <Link
        to="/"
        className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-line bg-white px-4 py-2 text-sm font-medium text-muted hover:bg-surface-alt hover:text-ink"
      >
        <ArrowLeft size={15} />
        Volver al dashboard
      </Link>
    </div>
  );
}

export default PantallaPendiente;
