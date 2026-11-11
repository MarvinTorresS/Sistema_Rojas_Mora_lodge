// Etiqueta visible y texto para lector de pantalla por estado operativo.
const STATE_LABEL = { available: 'Disponible', occupied: 'Ocupada', inactive: 'Inactiva' };

/**
 * HU-024: una mesa del panel de atención. Es un <button> real (se puede usar
 * con teclado) y el estado se dice en texto, no solo con color.
 */
export default function TableTile({ table, state, selected, onSelect }) {
  const people = `${table.seatCount} ${table.seatCount === 1 ? 'persona' : 'personas'}`;
  return (
    <button
      type="button" className={`rst-tile is-${state}`} aria-pressed={selected}
      aria-label={`Mesa ${table.tableNumber}, ${people}, ${STATE_LABEL[state].toLowerCase()}`}
      disabled={state === 'inactive'} onClick={() => onSelect(table)}
    >
      <span className="rst-tile-top">
        <strong>{table.tableNumber}</strong>
        <small>{table.seatCount} pers.</small>
      </span>
      <span className="rst-tile-state">{selected ? 'Seleccionada' : STATE_LABEL[state]}</span>
    </button>
  );
}
