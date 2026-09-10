import { Link } from 'react-router-dom';
import {
  CalendarPlus,
  UtensilsCrossed,
  Receipt,
  CircleCheck,
  Banknote,
  Clock,
  Lock,
  UserPlus,
  ScrollText,
  PartyPopper,
  Home,
} from 'lucide-react';

/**
 * Dashboard principal — pantalla de inicio del panel de colaboradores.
 *
 * Estructura basada en la Opción 3 (Por tareas) del prototipo que eligió
 * el equipo, simplificada por pedido de Marvin: en vez de un panel
 * lateral tipo asistente que cambia según la tarjeta seleccionada, cada
 * tarjeta es un enlace directo a su propia pantalla (patrón más simple
 * de navegar y de repartir entre el equipo — cada quien construye la
 * pantalla de su propia tarea/HU sin tocar este archivo).
 *
 * "Registrar reserva" lleva a SeleccionarEspacio.jsx, que si navega a
 * los módulos reales (cancha, salón, cabañas, restaurante). Las otras 8
 * tareas llevan a una pantalla PantallaPendiente.jsx con el mismo ícono
 * y título de la tarjeta, hasta que se implemente su HU correspondiente.
 *
 * Los datos de TASKS y "Te toca a vos hoy" siguen siendo fijos (mock),
 * copiados del prototipo original — no hay llamadas a services/api.js.
 */

const TASKS = [
  {
    to: '/reservar',
    icon: CalendarPlus,
    n: 'Registrar reserva',
    s: 'Cancha, salón, cabaña o mesa',
    badge: 0,
  },
  {
    to: '/tareas/mesa',
    icon: UtensilsCrossed,
    n: 'Abrir cuenta de mesa',
    s: 'Tomar el pedido del restaurante',
    badge: 0,
  },
  {
    to: '/tareas/factura',
    icon: Receipt,
    n: 'Cobrar y facturar',
    s: 'Cerrar cuenta y emitir factura',
    badge: 0,
  },
  {
    to: '/tareas/aprobar',
    icon: CircleCheck,
    n: 'Aprobar solicitudes',
    s: 'Reservas hechas desde la web',
    badge: 5,
  },
  {
    to: '/tareas/sinpe',
    icon: Banknote,
    n: 'Verificar SINPE',
    s: 'Comprobantes sin confirmar',
    badge: 2,
  },
  {
    to: '/tareas/extender',
    icon: Clock,
    n: 'Extender hospedaje',
    s: 'Alargar la estadía de un huésped',
    badge: 1,
  },
  {
    to: '/tareas/bloquear',
    icon: Lock,
    n: 'Bloquear espacio',
    s: 'Mantenimiento o uso interno',
    badge: 0,
  },
  {
    to: '/tareas/cliente',
    icon: UserPlus,
    n: 'Registrar cliente',
    s: 'Alta de un cliente nuevo',
    badge: 0,
  },
  {
    to: '/tareas/bitacora',
    icon: ScrollText,
    n: 'Consultar bitácora',
    s: 'Quién hizo qué y cuándo',
    badge: 0,
  },
];

function Dashboard() {
  return (
    <div className="w-full space-y-[18px] px-10 py-7">
      <div>
        <h2 className="font-display text-[33px] font-semibold leading-tight text-primary-800">
          Plantilla inicial de panel de colaboradores
        </h2>
      </div>

      <div className="flex items-center gap-3 rounded-[13px] border-[1.5px] border-line bg-white px-[18px] py-3.5 shadow-card">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8A8880" strokeWidth="2">
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
        <input
          placeholder="¿Qué necesitás hacer? Escribí «cancha», «mesa 7», «factura de Ana»…"
          disabled
          className="flex-1 bg-transparent text-[15.5px] text-ink placeholder:text-faint focus:outline-none"
        />
        <span className="rounded-[5px] border border-line bg-surface px-1.5 py-0.5 text-[10.5px] font-semibold text-faint">
          Ctrl K
        </span>
      </div>

      <div>
        <div className="text-[10.5px] font-bold uppercase tracking-widest text-faint">
          Tareas del turno
        </div>
        <div className="mt-2 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {TASKS.map((task) => (
            <Link
              key={task.to}
              to={task.to}
              className="relative flex flex-col gap-2 rounded-xl border-[1.5px] border-line bg-white p-3.5 text-left transition-all hover:-translate-y-px hover:border-primary-400 hover:shadow-card"
            >
              {task.badge > 0 && (
                <span className="absolute right-3 top-3 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-coral-400 px-1.5 text-[10.5px] font-bold text-white">
                  {task.badge}
                </span>
              )}
              <span className="flex h-[34px] w-[34px] items-center justify-center rounded-[9px] bg-primary-50 text-primary-700">
                <task.icon size={18} strokeWidth={1.8} />
              </span>
              <b className="text-[13.5px] font-semibold">{task.n}</b>
              <em className="text-[11.5px] not-italic leading-snug text-faint">{task.s}</em>
            </Link>
          ))}
        </div>
      </div>

      <div>
        <div className="text-[10.5px] font-bold uppercase tracking-widest text-faint">
          Te toca a vos hoy
        </div>
        <div className="mt-2 overflow-hidden rounded-[13px] border border-line bg-white shadow-card">
          <div className="flex items-center gap-3 border-b border-line2 px-[17px] py-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
              <PartyPopper size={16} strokeWidth={1.9} />
            </span>
            <div className="min-w-0 flex-1">
              <b className="block text-[13px] font-semibold">Salón de eventos · Grupo Solano</b>
              <span className="text-[11.5px] text-faint">
                Solicitud web sin responder hace 2 días · quinceaños, 60 personas
              </span>
            </div>
            <button type="button" disabled className="rounded-[7px] border border-line px-3 py-1.5 text-xs font-semibold text-muted">
              Rechazar
            </button>
            <button type="button" disabled className="rounded-[7px] bg-primary-700 px-3 py-1.5 text-xs font-semibold text-white">
              Aprobar
            </button>
          </div>
          <div className="flex items-center gap-3 border-b border-line2 px-[17px] py-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-600">
              <Banknote size={16} strokeWidth={1.9} />
            </span>
            <div className="min-w-0 flex-1">
              <b className="block text-[13px] font-semibold">Comprobante SINPE · ₡30.000</b>
              <span className="text-[11.5px] text-faint">
                Ana Castro · referencia 8712449 · falta comparlo con el estado de cuenta
              </span>
            </div>
            <button type="button" disabled className="rounded-[7px] border border-line px-3 py-1.5 text-xs font-semibold text-muted">
              Ver imagen
            </button>
            <button type="button" disabled className="rounded-[7px] bg-primary-700 px-3 py-1.5 text-xs font-semibold text-white">
              Verificar
            </button>
          </div>
          <div className="flex items-center gap-3 px-[17px] py-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-coral-50 text-coral-600">
              <Home size={16} strokeWidth={1.9} />
            </span>
            <div className="min-w-0 flex-1">
              <b className="block text-[13px] font-semibold">Cabaña 3 · María Jiménez</b>
              <span className="text-[11.5px] text-faint">
                Salida hoy a las 12 m.d. · falta cerrar la cuenta del restaurante (₡14.500)
              </span>
            </div>
            <button type="button" disabled className="rounded-[7px] border border-line px-3 py-1.5 text-xs font-semibold text-muted">
              Ver cuenta
            </button>
            <button type="button" disabled className="rounded-[7px] bg-primary-700 px-3 py-1.5 text-xs font-semibold text-white">
              Cerrar salida
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
