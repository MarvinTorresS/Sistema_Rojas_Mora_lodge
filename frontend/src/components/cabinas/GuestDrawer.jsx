import { useEffect } from 'react';
import { Check, IdCard, Users, X } from 'lucide-react';
import useEnterTransition from '../../hooks/useEnterTransition';

const INPUT_CLASS = 'w-full rounded-[9px] border px-3 py-2.5 text-[13.5px] outline-none transition-colors focus:border-primary-600 focus:ring-2 focus:ring-primary-200';

// `grow` solo se usa para campos que comparten FILA (Teléfono/Correo):
// flex-1 reparte el eje principal del contenedor, así que dentro de una
// COLUMNA haría crecer el campo en alto en vez de en ancho.
function Field({ id, label, value, onChange, error, locked = false, grow = false, icon: Icon, type = 'text', autoFocus = false, autoComplete }) {
  return (
    <div className={`flex min-w-0 flex-col gap-1.5 ${grow ? 'flex-1' : ''}`}>
      <label htmlFor={id} className="text-xs font-semibold text-muted">{label}</label>
      <div className="relative">
        {Icon && <Icon size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />}
        <input
          id={id} type={type} value={value} readOnly={locked} autoFocus={autoFocus} autoComplete={autoComplete}
          aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined}
          onChange={(event) => onChange(event.target.value)}
          className={`${INPUT_CLASS} ${Icon ? 'pl-9' : ''} ${
            locked ? 'border-line bg-surface-alt/60 text-muted' : `bg-white ${error ? 'border-coral-400' : 'border-faint'}`
          }`}
        />
      </div>
      {error && <span id={`${id}-error`} className="text-[11.5px] text-coral-600">{error}</span>}
    </div>
  );
}

/**
 * Panel lateral con los datos del huésped (concepto A3). La página es
 * dueña de los valores (componente CONTROLADO): si el recepcionista cierra
 * el panel por error, lo escrito no se pierde.
 *
 * CA-3: cuando el backend responde que la identificación ya existe, el
 * panel muestra el aviso, rellena y bloquea los datos del perfil
 * existente y el botón pasa a "Vincular y confirmar". Si el recepcionista
 * corrige la identificación, se deshace el vínculo.
 */
function GuestDrawer({
  summary, values, onFieldChange, existingGuest, onUnlinkGuest, fieldErrors, submitState,
  stayText, nightsText, totalText, onSubmit, onClose,
}) {
  const entered = useEnterTransition();
  const isSaving = submitState.status === 'loading';
  const locked = Boolean(existingGuest);

  // Escape cierra el panel (salvo mientras se guarda).
  useEffect(() => {
    function handleKey(event) { if (event.key === 'Escape') onClose(); }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="guest-drawer-title">
      <button
        type="button" aria-label="Cerrar panel" onClick={onClose}
        className={`absolute inset-0 h-full w-full cursor-default bg-primary-900/40 transition-opacity duration-300 ${entered ? 'opacity-100' : 'opacity-0'}`}
      />
      <form
        onSubmit={onSubmit} noValidate
        className={`absolute right-0 top-0 flex h-full w-[452px] max-w-full flex-col gap-[13px] overflow-y-auto bg-surface p-[26px] shadow-2xl transition-transform duration-300 ease-out ${
          entered ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center">
          <h2 id="guest-drawer-title" className="font-display text-[23px] font-bold text-primary-900">Datos del huésped</h2>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="ml-auto flex h-8 w-8 items-center justify-center rounded-full bg-surface-alt text-muted transition-colors hover:bg-line">
            <X size={16} />
          </button>
        </div>
        <p className="text-[12.5px] text-muted">{summary}</p>
        <div className="h-px bg-line" />

        <Field
          id="guest-identification" label="Identificación" icon={IdCard} autoFocus
          value={values.guestIdentification} error={fieldErrors.guestIdentification}
          onChange={(value) => onFieldChange('guestIdentification', value)}
        />

        {existingGuest && (
          <div className="flex flex-col gap-1 rounded-[10px] border border-teal-400 bg-teal-50 px-3 py-2.5">
            <span className="inline-flex items-center gap-1.5 text-[13px] font-bold text-teal-600">
              <Users size={15} /> {existingGuest.message}
            </span>
            <span className="text-[11.5px] text-ink">
              {[existingGuest.fullName, existingGuest.phone, existingGuest.email].filter(Boolean).join(' · ')}
            </span>
            <span className="text-[11px] text-muted">
              La reserva se vinculará a su perfil; sus datos no se vuelven a escribir.{' '}
              <button type="button" onClick={onUnlinkGuest} className="font-semibold text-teal-600 underline-offset-2 hover:underline">
                No es esta persona
              </button>
            </span>
          </div>
        )}

        <Field
          id="guest-name" label="Nombre completo" locked={locked} autoComplete="name"
          value={values.guestName} error={fieldErrors.guestName}
          onChange={(value) => onFieldChange('guestName', value)}
        />
        <div className="flex gap-2.5">
          <Field
            id="guest-phone" label="Teléfono" type="tel" grow locked={locked} autoComplete="tel"
            value={values.guestPhone} error={fieldErrors.guestPhone}
            onChange={(value) => onFieldChange('guestPhone', value)}
          />
          <Field
            id="guest-email" label="Correo" type="email" grow locked={locked} autoComplete="email"
            value={values.guestEmail} error={fieldErrors.guestEmail}
            onChange={(value) => onFieldChange('guestEmail', value)}
          />
        </div>

        <div className="flex flex-col gap-1.5 rounded-xl bg-primary-50 p-3">
          <div className="flex text-[12.5px]"><span className="text-muted">Estadía</span><span className="ml-auto font-semibold">{stayText}</span></div>
          <div className="flex text-[12.5px]"><span className="text-muted">Noches</span><span className="ml-auto font-semibold">{nightsText}</span></div>
          <div className="my-0.5 h-px bg-primary-200" />
          <div className="flex items-baseline">
            <span className="text-[13.5px] font-bold text-primary-900">Total estimado</span>
            <span className="ml-auto font-display text-[19px] font-bold text-primary-900">{totalText}</span>
          </div>
        </div>

        {submitState.status === 'error' && (
          <p role="alert" className="rounded-lg bg-coral-50 px-3 py-2 text-xs text-coral-600">{submitState.message}</p>
        )}

        <div className="mt-auto flex gap-2.5 pt-2">
          <button type="button" onClick={onClose} className="rounded-[10px] border-[1.5px] border-primary-700 bg-white px-[18px] py-[13px] text-sm font-semibold text-primary-800 transition-colors hover:bg-primary-50">
            Volver
          </button>
          <button
            type="submit" disabled={isSaving}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-[10px] bg-primary-800 px-[18px] py-[13px] text-sm font-semibold text-white transition-colors hover:bg-primary-900 disabled:cursor-wait disabled:opacity-60"
          >
            <Check size={16} />
            {isSaving ? 'Guardando…' : locked ? 'Vincular y confirmar' : 'Confirmar reserva'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default GuestDrawer;
