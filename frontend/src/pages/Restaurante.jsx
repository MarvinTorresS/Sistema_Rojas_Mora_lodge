import { Link } from 'react-router-dom';
import { ArrowRight, BedDouble, Receipt, UtensilsCrossed } from 'lucide-react';
import './ReservasCancha.css';
import './ReservasSalon.css';
import './Restaurante.css';

/**
 * Inicio del modulo Restaurante (Sprint 4, Alison). Reune las pantallas de las
 * HU de Alison; las de otros integrantes (apertura de cuenta, cierre, etc.)
 * se sumaran a esta misma portada cuando existan.
 */
const SECTIONS = [
  {
    to: '/restaurante/mesas',
    icon: UtensilsCrossed,
    title: 'Mesas',
    hu: 'HU-103 · HU-106',
    text: 'Consultá número, capacidad, ubicación y estado de cada mesa, y desactivá las que no se usarán.',
  },
  {
    to: '/restaurante/cuentas',
    icon: Receipt,
    title: 'Cuentas de mesa',
    hu: 'HU-025',
    text: 'Agregá productos a una cuenta abierta y seguí el consumo acumulado en tiempo real.',
  },
  {
    to: '/restaurante/huespedes',
    icon: BedDouble,
    title: 'Consumo de huéspedes',
    hu: 'HU-030 · HU-031',
    text: 'Cargá consumos a nombre de un huésped de cabina y consultá su saldo acumulado.',
  },
];

export default function Restaurante() {
  return (
    <div className="bombonera bmb-salon bmb-restaurante">
      <div className="bmb-content">
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
          {SECTIONS.map(({ to, icon: Icon, title, hu, text }) => (
            <li key={to}>
              <Link to={to} className="bmb-card rst-hub-card">
                <span className="rst-hub-icon" aria-hidden="true"><Icon size={22} /></span>
                <span className="bmb-kicker">{hu}</span>
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
