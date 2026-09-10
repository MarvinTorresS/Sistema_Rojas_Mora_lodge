import { Link } from 'react-router-dom';
import { ArrowLeft, CircleDot, PartyPopper, Home, UtensilsCrossed, ChevronRight } from 'lucide-react';

/**
 * Pantalla "Registrar reserva" → paso 1: elegir el espacio.
 *
 * Corresponde al paso 2 de 4 del panel lateral del prototipo original
 * (acá se volvió una pantalla completa en vez de un panel lateral, por
 * pedido de Marvin: "trabajamos con ese dashboard principal nada más").
 *
 * Cada opción es un <Link> real de react-router-dom: al elegir un
 * espacio, navega a la página de ese módulo (/cancha, /salon, /cabanas,
 * /restaurante). Todavía no hay estado de "reserva en progreso" — cada
 * módulo se construye por separado según su propia HU.
 */
const ESPACIOS = [
  {
    to: '/cancha',
    icon: CircleDot,
    titulo: 'Cancha sintética',
    detalle: '₡8.000 por hora · libre de 4 a 10 p.m.',
  },
  {
    to: '/salon',
    icon: PartyPopper,
    titulo: 'Salón de eventos',
    detalle: '3 planes · hasta 80 personas',
  },
  {
    to: '/cabanas',
    icon: Home,
    titulo: 'Cabaña',
    detalle: '4 cabañas · 3 disponibles hoy',
  },
  {
    to: '/restaurante',
    icon: UtensilsCrossed,
    titulo: 'Mesa del restaurante',
    detalle: '9 mesas · 5 libres ahora',
  },
];

function SeleccionarEspacio() {
  return (
    <div className="mx-auto w-full max-w-2xl p-10">
      <Link to="/" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink">
        <ArrowLeft size={15} />
        Volver al dashboard
      </Link>

      <h2 className="mt-4 font-display text-2xl font-semibold text-primary-900">Nueva reserva</h2>
      <p className="mt-1 text-sm text-muted">¿Qué espacio vas a reservar?</p>
      <p className="mt-3 text-xs leading-relaxed text-faint">
        Cada espacio cobra distinto: la cancha por hora, el salón por plan, la cabaña por noche y
        la mesa por comensales.
      </p>

      <div className="mt-6 flex flex-col gap-3">
        {ESPACIOS.map((espacio) => (
          <Link
            key={espacio.to}
            to={espacio.to}
            className="flex items-center gap-4 rounded-xl border border-line bg-white p-4 shadow-card transition-all hover:-translate-y-px hover:border-primary-400"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-700">
              <espacio.icon size={20} strokeWidth={1.8} />
            </span>
            <div className="min-w-0 flex-1">
              <b className="block text-sm font-semibold">{espacio.titulo}</b>
              <span className="text-xs text-faint">{espacio.detalle}</span>
            </div>
            <ChevronRight size={18} className="shrink-0 text-faint" />
          </Link>
        ))}
      </div>

      <div className="mt-6 flex items-start gap-2 rounded-lg bg-surface-alt p-3 text-xs leading-relaxed text-faint">
        <span className="mt-0.5">ⓘ</span>
        <span>
          La reserva que registra el personal queda activa de una vez; la que hace el cliente por
          la web entra como pendiente.
        </span>
      </div>
    </div>
  );
}

export default SeleccionarEspacio;
