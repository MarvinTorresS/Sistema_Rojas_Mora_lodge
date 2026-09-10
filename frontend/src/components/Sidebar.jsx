import { NavLink } from 'react-router-dom';

/**
 * Menú lateral con los 11 módulos funcionales del sistema (uno por cada
 * carpeta de src/modules en el backend — ver Diccionario EDT / Matriz de
 * Trazabilidad para la correspondencia exacta).
 *
 * Cada entrada ya tiene su ruta declarada acá, en un solo lugar
 * compartido (src/App.jsx). La idea es que ningún integrante del equipo
 * tenga que volver a tocar el router al empezar su propio módulo: solo
 * crea su archivo en src/pages/ y reemplaza el componente placeholder
 * correspondiente en App.jsx.
 */
const MODULES = [
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

function Sidebar() {
  return (
    <nav className="hidden w-56 shrink-0 border-r border-line bg-surface p-4 md:block">
      <ul className="flex flex-col gap-1">
        {MODULES.map((mod) => (
          <li key={mod.to}>
            <NavLink
              to={mod.to}
              className={({ isActive }) =>
                `block rounded-lg px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? 'bg-primary-50 font-medium text-primary-800'
                    : 'text-muted hover:bg-surface-alt hover:text-ink'
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

export default Sidebar;
