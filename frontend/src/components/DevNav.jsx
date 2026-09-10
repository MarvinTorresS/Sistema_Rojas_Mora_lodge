import { NavLink } from 'react-router-dom';

/**
 * Barra de navegación SOLO PARA DESARROLLO.
 *
 * El prototipo aprobado (Opción 3 · Por tareas) no tiene un menú lateral
 * de módulos — ahí se navega desde el Dashboard (grilla de tareas). Esta
 * barra es un atajo temporal para que cada integrante llegue directo a
 * SU módulo mientras lo construye, sin tener que esperar a que el
 * dashboard de tareas esté conectado. Se quita del Layout antes de la
 * entrega final.
 */
const MODULES = [
  { to: '/', label: '← Dashboard (prototipo)' },
  { to: '/cancha', label: 'Cancha sintética' },
  { to: '/salon', label: 'Salón de eventos' },
  { to: '/cabanas', label: 'Cabañas' },
  { to: '/restaurante', label: 'Restaurante' },
  { to: '/usuarios', label: 'Usuarios y roles' },
  { to: '/clientes', label: 'Clientes' },
  { to: '/facturacion', label: 'Facturación y pagos' },
  { to: '/sinpe', label: 'Comprobantes SINPE' },
  { to: '/disponibilidad', label: 'Disponibilidad y bloqueos' },
  { to: '/autoservicio', label: 'Solicitudes web (autoservicio)' },
  { to: '/auditoria', label: 'Auditoría y reportes' },
];

function DevNav() {
  return (
    <nav className="hidden w-52 shrink-0 overflow-y-auto border-r border-line bg-yellow-50 p-3 md:block">
      <p className="mb-2 px-1 text-[10px] font-bold uppercase tracking-wide text-amber-600">
        Solo desarrollo
      </p>
      <ul className="flex flex-col gap-1">
        {MODULES.map((mod) => (
          <li key={mod.to}>
            <NavLink
              to={mod.to}
              end={mod.to === '/'}
              className={({ isActive }) =>
                `block rounded-lg px-2.5 py-1.5 text-xs transition-colors ${
                  isActive
                    ? 'bg-primary-50 font-medium text-primary-800'
                    : 'text-muted hover:bg-white hover:text-ink'
                }`
              }
            >
              {mod.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export default DevNav;
