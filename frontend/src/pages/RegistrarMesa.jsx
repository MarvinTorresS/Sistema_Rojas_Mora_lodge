import { Link, useNavigate } from 'react-router-dom';
import { Check } from 'lucide-react';
import EncabezadoRestaurante from '../components/restaurante/EncabezadoRestaurante';
import FormField from '../components/restaurante/registro/FormField';
import NumberStepper from '../components/restaurante/registro/NumberStepper';
import ChoiceChips from '../components/restaurante/registro/ChoiceChips';
import TablePreview from '../components/restaurante/registro/TablePreview';
import LeaveWithoutSavingDialog from '../components/restaurante/registro/LeaveWithoutSavingDialog';
import useRegistrationForm from '../hooks/useRegistrationForm';
import { createRestaurantTable } from '../services/restauranteService';
import {
  LOCATION_SUGGESTIONS, MAX_SEATS, MIN_SEATS, SEAT_SHORTCUTS, TABLE_LOCATION_MAX_LENGTH,
  TABLE_NUMBER_MAX_LENGTH, normalizeTableNumber,
} from '../utils/restauranteFormulario';
import './ReservasCancha.css';
import './ReservasSalon.css';
import './Restaurante.css';
import './RestauranteFormularios.css';

/**
 * HU-102 (Marvin, Sprint 4) - Registrar una nueva mesa (Administrador).
 *   CA-1  Número nuevo: la mesa se crea "Disponible" y se muestra
 *         "Mesa registrada exitosamente".
 *   CA-2  Número repetido: "Ya existe una mesa registrada con ese número"
 *         debajo del número; no se guarda y lo escrito se conserva.
 *   CA-3  Falta número o capacidad: "Los campos marcados con (*) son
 *         obligatorios" y esos campos en rojo.
 *   CA-4  Cancelar con datos: "¿Desea salir sin guardar los cambios?" (Sí/No);
 *         Sí limpia el formulario sin guardar.
 * Concepto A del prototipo: formulario + vista previa de la mesa.
 */
export const TABLES_PATH = '/restaurante/mesas';

const INITIAL_VALUES = { tableNumber: '', seatCount: '', location: '' };
const REQUIRED_FIELDS = {
  tableNumber: 'El número de mesa es obligatorio.',
  seatCount: 'La capacidad (comensales) es obligatoria.',
};
const DUPLICATE_FIELDS = { TABLE_NUMBER_DUPLICATE: 'tableNumber' };
const SEAT_OPTIONS = SEAT_SHORTCUTS.map((seats) => ({ value: seats, label: String(seats) }));
const LOCATION_OPTIONS = LOCATION_SUGGESTIONS.map((place) => ({ value: place, label: place }));

const saveTable = (values) => createRestaurantTable({
  tableNumber: values.tableNumber.trim(),
  seatCount: Number(values.seatCount),
  location: values.location.trim(),
});

export default function RegistrarMesa() {
  const navigate = useNavigate();
  const form = useRegistrationForm({
    initialValues: INITIAL_VALUES,
    requiredFields: REQUIRED_FIELDS,
    duplicateFields: DUPLICATE_FIELDS,
    onSubmit: saveTable,
  });
  const { values, errors, status, saving } = form;
  const saved = status.state === 'success' ? status.result.data : null;
  const isSuggestedLocation = LOCATION_SUGGESTIONS.includes(values.location);

  return (
    <div className="bombonera bmb-salon bmb-restaurante">
      <div className="bmb-content">
        <EncabezadoRestaurante
          kicker="Restaurante · Mesas" title="Registrar mesa"
          backTo={TABLES_PATH} backLabel="Volver a mesas"
          text={<>Los campos marcados con (*) son obligatorios.<br />La mesa se crea como Disponible.</>}
        />

        <div className="rst-register-layout">
          {saved ? (
            <section className="bmb-card rst-panel rst-register-done" aria-labelledby="rst-table-saved">
              <span className="rst-done-icon" aria-hidden="true"><Check size={26} /></span>
              <h2 id="rst-table-saved" role="status">{status.message || 'Mesa registrada exitosamente'}</h2>
              <p className="rst-muted">
                Mesa {saved.tableNumber} · {saved.seatCount} {saved.seatCount === 1 ? 'comensal' : 'comensales'}
                {saved.location ? ` · ${saved.location}` : ''} · Disponible
              </p>
              <div className="rst-actions">
                <button type="button" className="bmb-action" onClick={form.reset}>Registrar otra mesa</button>
                <Link to={TABLES_PATH} className="rst-ghost">Ver listado de mesas</Link>
              </div>
            </section>
          ) : (
            <form className="bmb-card rst-panel rst-register-form" noValidate onSubmit={form.submit} aria-label="Datos de la nueva mesa">
              {status.state === 'error' && (
                <p role="alert" className="rst-alert-text rst-form-alert">{status.message}</p>
              )}

              <FormField id="table-number" label="Número de mesa" required error={errors.tableNumber}
                hint={`Ej.: 12 o T-3. «05» se guarda como «5».`}>
                {(inputProps) => (
                  <input {...inputProps} className="rst-input is-big" maxLength={TABLE_NUMBER_MAX_LENGTH}
                    autoComplete="off" value={values.tableNumber} disabled={saving}
                    onChange={(event) => form.setField('tableNumber', event.target.value)} />
                )}
              </FormField>

              <FormField id="table-seats" label="Capacidad (comensales)" required error={errors.seatCount}
                hint={`Entre ${MIN_SEATS} y ${MAX_SEATS} comensales.`}>
                {(inputProps) => (
                  <div className="rst-inline-group">
                    <NumberStepper value={values.seatCount} min={MIN_SEATS} max={MAX_SEATS} unitLabel="un comensal"
                      disabled={saving} inputProps={inputProps} onChange={(value) => form.setField('seatCount', value)} />
                    <ChoiceChips label="Capacidades frecuentes" options={SEAT_OPTIONS} value={values.seatCount}
                      disabled={saving} onChange={(value) => form.setField('seatCount', value)} />
                  </div>
                )}
              </FormField>

              <FormField id="table-location" label="Ubicación" optional error={errors.location}>
                {(inputProps) => (
                  <>
                    <ChoiceChips label="Ubicaciones sugeridas" options={LOCATION_OPTIONS} allowNone
                      value={isSuggestedLocation ? values.location : ''} disabled={saving}
                      onChange={(value) => form.setField('location', value)} />
                    <input {...inputProps} className="rst-input" placeholder="Otra ubicación…"
                      maxLength={TABLE_LOCATION_MAX_LENGTH} disabled={saving}
                      value={isSuggestedLocation ? '' : values.location}
                      onChange={(event) => form.setField('location', event.target.value)} />
                  </>
                )}
              </FormField>

              <div className="rst-form-actions">
                <button type="submit" className="bmb-continue rst-save" disabled={saving}>
                  {saving ? 'Guardando…' : 'Guardar mesa'}
                </button>
                <button type="button" className="rst-ghost rst-cancel" disabled={saving}
                  onClick={() => form.requestCancel(() => navigate(TABLES_PATH))}>Cancelar</button>
              </div>
            </form>
          )}

          <aside className="bmb-card rst-panel rst-preview" aria-label="Vista previa de la mesa">
            <p className="bmb-kicker">Vista previa</p>
            <TablePreview
              tableNumber={saved ? saved.tableNumber : normalizeTableNumber(values.tableNumber)}
              seatCount={saved ? saved.seatCount : values.seatCount}
              location={saved ? saved.location : values.location.trim()}
            />
            <p className="rst-muted rst-preview-note">
              Las sillas cambian con la capacidad. Al guardar, la mesa aparece en el listado y ya se le puede abrir una cuenta.
            </p>
          </aside>
        </div>

        {form.confirmingExit && (
          <LeaveWithoutSavingDialog
            detail="Se descartarán los datos de la mesa que escribió."
            onConfirm={form.reset} onCancel={form.keepEditing} />
        )}
      </div>
    </div>
  );
}
