import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Pencil, Trash2, Search } from 'lucide-react';
import {
  searchEventHallPlans, updateEventHallPlan, deleteEventHallPlan,
} from '../services/eventHallPlansService';

/**
 * Página "Planes de precio — salón de eventos" (Wagner, Sprint 2):
 * HU-010 (buscar por nombre), HU-011 (editar) y HU-012 (eliminar
 * permanentemente).
 *
 * No incluye HU-008 (crear) ni HU-009 (listar todos): le corresponden
 * a Alison este mismo sprint. Por eso esta pantalla arranca sin ningún
 * plan visible — se llega a un plan únicamente buscándolo por nombre
 * (HU-010) — en vez de mostrar un listado completo desde el inicio.
 * Cuando exista GET /api/event-hall-plans (HU-009), tiene sentido
 * agregar acá un botón "ver todos" que llame a ese endpoint.
 *
 * Convención del equipo: página propia en pages/, ruta propia en
 * App.jsx (/salon/planes), sin tocar las rutas de nadie más.
 */

const currencyFormatter = new Intl.NumberFormat('es-CR', {
  style: 'currency', currency: 'CRC', maximumFractionDigits: 0,
});

const EMPTY_EDIT_FORM = { planName: '', hours: '', price: '' };

function AdminPlanesSalon() {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchState, setSearchState] = useState({ status: 'idle', message: '' });
  const [plans, setPlans] = useState(null); // null = aún no se buscó nada

  // Estado del plan que se está editando (uno a la vez): su id, los
  // valores del formulario y el feedback de esa operación puntual.
  const [editingPlanId, setEditingPlanId] = useState(null);
  const [editForm, setEditForm] = useState(EMPTY_EDIT_FORM);
  const [editState, setEditState] = useState({ status: 'idle', message: '' });

  // Id del plan para el que se está pidiendo confirmación de borrado.
  // Un solo campo (no un set) porque solo se confirma un plan a la vez.
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [deleteState, setDeleteState] = useState({ status: 'idle', message: '' });

  async function handleSearch(event) {
    event.preventDefault();
    const trimmed = searchTerm.trim();
    if (!trimmed) {
      setSearchState({ status: 'error', message: 'Ingresá al menos un caracter para buscar.' });
      return;
    }

    setSearchState({ status: 'loading', message: '' });
    setEditingPlanId(null);
    setConfirmDeleteId(null);
    try {
      const result = await searchEventHallPlans(trimmed);
      setPlans(result);
      setSearchState({ status: 'idle', message: '' });
    } catch (error) {
      setPlans(null);
      setSearchState({ status: 'error', message: error.message });
    }
  }

  function startEdit(plan) {
    setConfirmDeleteId(null);
    setEditingPlanId(plan.planId);
    setEditForm({ planName: plan.planName, hours: String(plan.hours), price: String(plan.price) });
    setEditState({ status: 'idle', message: '' });
  }

  function cancelEdit() {
    setEditingPlanId(null);
    setEditForm(EMPTY_EDIT_FORM);
    setEditState({ status: 'idle', message: '' });
  }

  async function handleSaveEdit(event, planId) {
    event.preventDefault();
    setEditState({ status: 'loading', message: '' });
    try {
      const { plan: updatedPlan, futureBookingsCount } = await updateEventHallPlan(planId, {
        planName: editForm.planName.trim(),
        hours: Number(editForm.hours),
        price: Number(editForm.price),
      });

      // CA-2: reservas futuras asociadas no bloquean la edición, solo se
      // informa que las reservas conservan las condiciones contratadas.
      const note = futureBookingsCount > 0
        ? ' Este plan tiene reservas futuras; el precio nuevo solo aplicará a solicitudes nuevas.'
        : '';
      setPlans((prev) => prev.map((p) => (p.planId === planId ? updatedPlan : p)));
      setEditingPlanId(null);
      setSearchState({ status: 'idle', message: `Plan actualizado exitosamente.${note}` });
    } catch (error) {
      setEditState({ status: 'error', message: error.message });
    }
  }

  async function handleConfirmDelete(planId) {
    setDeleteState({ status: 'loading', message: '' });
    try {
      await deleteEventHallPlan(planId);
      setPlans((prev) => prev.filter((p) => p.planId !== planId));
      setConfirmDeleteId(null);
      setDeleteState({ status: 'idle', message: '' });
      setSearchState({ status: 'idle', message: 'Plan eliminado permanentemente.' });
    } catch (error) {
      // CA-2: el plan tiene reservas asociadas (409) — el mensaje del
      // backend ya explica el motivo; se muestra junto a ESE plan, no
      // como error general de la búsqueda.
      setDeleteState({ status: 'error', message: error.message });
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6">
      <div>
        <Link
          to="/salon"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink"
        >
          <ArrowLeft size={15} />
          Volver a reservas del salón
        </Link>
        <h2 className="mt-3 font-display text-2xl font-semibold text-primary-900">
          Planes de precio del salón
        </h2>
        <p className="text-sm text-muted">Buscar, editar o eliminar un plan de precios existente.</p>
      </div>

      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          type="text"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          placeholder="Buscar por nombre del plan…"
          className="flex-1 rounded-lg border border-line px-3 py-2 text-sm focus:border-primary-400 focus:outline-none"
        />
        <button
          type="submit"
          disabled={searchState.status === 'loading'}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-800 disabled:opacity-60"
        >
          <Search size={15} />
          Buscar
        </button>
      </form>

      {searchState.status === 'error' && (
        <p className="rounded-lg bg-coral-50 px-3 py-2 text-xs text-coral-600">{searchState.message}</p>
      )}
      {searchState.status === 'idle' && searchState.message && (
        <p className="rounded-lg bg-teal-50 px-3 py-2 text-xs text-teal-600">{searchState.message}</p>
      )}

      {plans !== null && plans.length === 0 && (
        <p className="text-sm text-faint">No se encontraron planes con ese nombre.</p>
      )}

      <ul className="flex flex-col gap-3">
        {(plans ?? []).map((plan) => (
          <li key={plan.planId} className="rounded-xl border border-line bg-surface p-4 shadow-card">
            {editingPlanId === plan.planId ? (
              <form onSubmit={(event) => handleSaveEdit(event, plan.planId)} className="flex flex-col gap-2">
                <input
                  type="text"
                  required
                  minLength={1}
                  maxLength={50}
                  value={editForm.planName}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, planName: event.target.value }))}
                  className="rounded-lg border border-line px-3 py-2 text-sm focus:border-primary-400 focus:outline-none"
                  placeholder="Nombre del plan"
                  aria-label="Nombre del plan"
                />
                <div className="flex gap-2">
                  <input
                    type="number"
                    required
                    min={1}
                    step={1}
                    value={editForm.hours}
                    onChange={(event) => setEditForm((prev) => ({ ...prev, hours: event.target.value }))}
                    className="w-1/2 rounded-lg border border-line px-3 py-2 text-sm focus:border-primary-400 focus:outline-none"
                    placeholder="Horas"
                    aria-label="Horas"
                  />
                  <input
                    type="number"
                    required
                    min={0.01}
                    step={0.01}
                    value={editForm.price}
                    onChange={(event) => setEditForm((prev) => ({ ...prev, price: event.target.value }))}
                    className="w-1/2 rounded-lg border border-line px-3 py-2 text-sm focus:border-primary-400 focus:outline-none"
                    placeholder="Precio (₡)"
                    aria-label="Precio"
                  />
                </div>
                {editState.status === 'error' && (
                  <p className="rounded-lg bg-coral-50 px-3 py-2 text-xs text-coral-600">{editState.message}</p>
                )}
                <div className="flex gap-2 pt-1">
                  <button
                    type="submit"
                    disabled={editState.status === 'loading'}
                    className="flex-1 rounded-lg bg-primary-700 px-4 py-2 text-sm font-medium text-white hover:bg-primary-800 disabled:opacity-60"
                  >
                    {editState.status === 'loading' ? 'Guardando…' : 'Guardar cambios'}
                  </button>
                  <button
                    type="button"
                    onClick={cancelEdit}
                    disabled={editState.status === 'loading'}
                    className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-muted hover:bg-surface-alt disabled:opacity-60"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-ink">{plan.planName}</p>
                  <p className="text-xs text-faint">
                    {plan.hours} h · {currencyFormatter.format(plan.price)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => startEdit(plan)}
                    className="inline-flex items-center gap-1 rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-muted hover:bg-surface-alt"
                  >
                    <Pencil size={13} />
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => { setConfirmDeleteId(plan.planId); setDeleteState({ status: 'idle', message: '' }); }}
                    className="inline-flex items-center gap-1 rounded-lg border border-coral-200 px-3 py-1.5 text-xs font-medium text-coral-600 hover:bg-coral-50"
                  >
                    <Trash2 size={13} />
                    Eliminar
                  </button>
                </div>
              </div>
            )}

            {confirmDeleteId === plan.planId && (
              <div className="mt-3 rounded-lg border border-dashed border-coral-200 bg-coral-50 p-3">
                <p className="text-xs text-coral-700">
                  Esta acción elimina el plan de forma permanente y no se puede deshacer. ¿Confirmás?
                </p>
                {deleteState.status === 'error' && (
                  <p className="mt-2 text-xs font-medium text-coral-700">{deleteState.message}</p>
                )}
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleConfirmDelete(plan.planId)}
                    disabled={deleteState.status === 'loading'}
                    className="rounded-lg bg-coral-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-coral-700 disabled:opacity-60"
                  >
                    {deleteState.status === 'loading' ? 'Eliminando…' : 'Sí, eliminar'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(null)}
                    disabled={deleteState.status === 'loading'}
                    className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-muted hover:bg-surface-alt disabled:opacity-60"
                  >
                    No
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default AdminPlanesSalon;
