import { chairLayout } from '../../../utils/restauranteFormulario';

const chairs = (count, side) => Array.from({ length: count }, (_, index) => (
  <span key={`${side}-${index}`} className={`rst-chair is-${side}`} />
));

/**
 * HU-102: vista previa de la mesa mientras se llena el formulario. Las
 * sillas salen de chairLayout(), una funcion pura ya probada; este
 * componente solo las dibuja. Es decorativo (aria-hidden): la informacion
 * real se repite en texto debajo.
 */
export default function TablePreview({ tableNumber, seatCount, location, statusLabel = 'Disponible' }) {
  const layout = chairLayout(seatCount);
  const seats = Number(seatCount) || 0;
  const longTable = layout.top >= 3;

  return (
    <div className="rst-preview-table">
      <div className="rst-table-art" aria-hidden="true">
        <div className="rst-chair-row">{chairs(layout.top, 'top')}</div>
        <div className="rst-table-middle">
          <div className="rst-chair-col">{chairs(layout.left, 'left')}</div>
          <div className={`rst-table-top${longTable ? ' is-long' : ''}`}>{tableNumber || '?'}</div>
          <div className="rst-chair-col">{chairs(layout.right, 'right')}</div>
        </div>
        <div className="rst-chair-row">{chairs(layout.bottom, 'bottom')}</div>
      </div>
      <div className="rst-preview-caption">
        <strong>{tableNumber ? `Mesa ${tableNumber}` : 'Mesa sin número'}</strong>
        <span>
          {seats > 0 ? `${seats} ${seats === 1 ? 'comensal' : 'comensales'}` : 'Capacidad sin definir'}
          {location ? ` · ${location}` : ''}
        </span>
        <span className="rst-chip">{statusLabel}</span>
      </div>
    </div>
  );
}
