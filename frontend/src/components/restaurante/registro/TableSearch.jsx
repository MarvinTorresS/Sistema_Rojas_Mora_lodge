import { useState } from 'react';
import { Search } from 'lucide-react';
import FormField from './FormField';
import ChoiceChips from './ChoiceChips';
import {
  MIN_SEAT_FILTERS, TABLE_NUMBER_MAX_LENGTH, buildTableFilters,
} from '../../../utils/restauranteFormulario';

const CAPACITY_OPTIONS = MIN_SEAT_FILTERS.map((seats) => ({ value: seats, label: `${seats}+` }));

/**
 * HU-104 (Marvin) - Buscar mesa por número o capacidad (Administrador).
 *   CA-1  "Buscar" o Enter aplica los criterios (combinables).
 *   CA-2  El criterio escrito SE CONSERVA en el formulario para corregirlo;
 *         el mensaje de "sin resultados" lo muestra la pantalla de mesas.
 * Componente "controlado a medias": guarda lo que se escribe (borrador) y
 * solo avisa al padre con onSearch(filtros | null) al presionar Buscar.
 */
export default function TableSearch({ onSearch, disabled = false }) {
  const [number, setNumber] = useState('');
  const [minSeats, setMinSeats] = useState('');

  function submit(event) {
    event.preventDefault();
    onSearch(buildTableFilters({ number, minSeats }));
  }

  function clear() {
    setNumber('');
    setMinSeats('');
    onSearch(null);
  }

  return (
    <form role="search" className="rst-table-search" aria-label="Buscar mesas" onSubmit={submit}>
      <FormField id="table-search-number" label="Número de mesa">
        {(inputProps) => (
          <input {...inputProps} type="search" className="rst-input" placeholder="Ej.: 7"
            maxLength={TABLE_NUMBER_MAX_LENGTH} value={number} disabled={disabled}
            onChange={(event) => setNumber(event.target.value)} />
        )}
      </FormField>
      <div className="rst-form-field rst-search-capacity">
        <span className="rst-form-label" id="table-search-capacity">Capacidad mínima</span>
        <ChoiceChips label="Capacidad mínima" options={CAPACITY_OPTIONS} value={minSeats} allowNone
          disabled={disabled} onChange={setMinSeats} />
      </div>
      <div className="rst-table-search-actions">
        <button type="submit" className="bmb-action" disabled={disabled}>
          <Search size={15} aria-hidden="true" /> Buscar
        </button>
        <button type="button" className="rst-ghost" disabled={disabled} onClick={clear}>Limpiar búsqueda</button>
      </div>
    </form>
  );
}
