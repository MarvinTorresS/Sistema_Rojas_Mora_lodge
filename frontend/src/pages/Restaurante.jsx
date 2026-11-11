import { Link } from 'react-router-dom';
import { Armchair, ArrowLeft, ArrowRight, BedDouble, Receipt, UtensilsCrossed } from 'lucide-react';
import './ReservasCancha.css';
import './ReservasSalon.css';
import './Restaurante.css';

/**
 * Inicio del modulo Restaurante (Sprint 4, Alison). Reune las pantallas de las
 * HU de Alison; las de otros integrantes (apertura de cuenta, cierre, etc.)
 * se sumaran a esta misma portada cuando existan. Marvin agrego "Atender
 * mesas" (HU-024) y las HU-102/104/113 en las tarjetas de mesas y menu.
 */
const SECTIONS = [
  {
    // HU-024 (Marvin): primero, porque es la tarea diaria del mesero.
    to: '/tareas/mesa',
    icon: Armchair,
    title: 'Atender mesas',
    // Historias: HU-024 (solo como referencia; no se muestra en pantalla).
    text: 'Tocá una mesa disponible para abrir su cuenta y empezar a tomar el pedido.',
  },
  {
    to: '/restaurante/menu',
    icon: UtensilsCrossed,
    title: 'Productos del menú',
    // Historias: HU-113 · HU-114 (solo como referencia; no se muestra en pantalla).
    text: 'Registrá productos y consultá precios, existencias y disponibilidad de todo el menú.',
  },
  {
    to: '/restaurante/mesas',
    icon: UtensilsCrossed,
    title: 'Mesas',
    // Historias: HU-102 · HU-103 · HU-104 · HU-106 (solo como referencia; no se muestra en pantalla).
    text: 'Registrá y buscá mesas por número o capacidad; consultá su estado y desactivá las que no se usarán.',
  },
  {
    to: '/restaurante/cuentas',
    icon: Receipt,
    title: 'Cuentas de mesa',
    // Historias: HU-025 (solo como referencia; no se muestra en pantalla).
    text: 'Agregá productos a una cuenta abierta y seguí el consumo acumulado en tiempo real.',
  },
  {
    to: '/restaurante/huespedes',
    icon: BedDouble,
    title: 'Consumo de huéspedes',
    // Historias: HU-030 · HU-031 (solo como referencia; no se muestra en pantalla).
    text: 'Cargá consumos a nombre de un huésped de cabina y consultá su saldo acumulado.',
  },
];

export default function Restaurante() {
  return (
    <div className="bombonera bmb-salon bmb-restaurante">
      <div className="bmb-content">
        {/* Mismo "volver" que Salon y Cancha: al restaurante se entra desde
            "Elegir espacio" (/reservar). */}
        <Link to="/reservar" className="bmb-back"><ArrowLeft size={16} />Volver a elegir espacio</Link>
        <header className="bmb-intro">
          <div>
            <p className="bmb-eyebrow">ROJAS MORA SPORTS & LODGE</p>
            <h1><span>Restaurante</span>Mesas, pedidos y consumos</h1>
          </div>
          <div className="bmb-intro-side">
            <p>Elegí qué querés hacer.<br />Todo queda registrado en la cuenta.</p>
          </div>
        </header>
        <ul className="rst-hub" aria-label="Secciones del restaurante">
          {SECTIONS.map(({ to, icon: Icon, title, text }) => (
            <li key={to}>
              <Link to={to} className="bmb-card rst-hub-card">
                <span className="rst-hub-icon" aria-hidden="true"><Icon size={22} /></span>
                <strong>{title}</strong>
                <span className="rst-muted">{text}</span>
                <span className="rst-hub-go">Abrir <ArrowRight size={15} aria-hidden="true" /></span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
