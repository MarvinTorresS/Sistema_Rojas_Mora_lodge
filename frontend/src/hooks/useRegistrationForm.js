import { useCallback, useRef, useState } from 'react';
import {
  REQUIRED_FIELDS_MESSAGE, fieldErrorsFromApi, findMissingFields, isDirty,
} from '../utils/restauranteFormulario';

/**
 * Estado y reglas COMUNES de un formulario de registro - Sprint 4 (Marvin).
 * Lo usan HU-102 (Registrar mesa) y HU-113 (Registrar producto), que tienen
 * los mismos CA-3 y CA-4. Asi esas reglas viven en un solo lugar (DRY) y cada
 * pantalla solo se ocupa de sus campos y de como se ve.
 *
 *   CA-3  Al guardar con obligatorios vacios: mensaje de la historia y cada
 *         campo faltante en rojo, SIN llamar a la API (respuesta inmediata).
 *         Si el backend igual responde 422/409, sus errores por campo se
 *         muestran de la misma forma.
 *   CA-4  Cancelar con datos sin guardar pide confirmacion; "Si" limpia el
 *         formulario sin guardar nada. Sin datos, cancelar sale directo.
 *
 * Parametros:
 *   initialValues   valores vacios del formulario (constante del modulo).
 *   requiredFields  { campo: mensaje } de los obligatorios.
 *   onSubmit        async (values) => resultado; lanza el Error del servicio.
 *   duplicateFields { CODIGO_409: campo } para marcar el campo duplicado.
 */
export default function useRegistrationForm({
  initialValues, requiredFields, onSubmit, duplicateFields = {},
}) {
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState({ state: 'idle', message: '', code: null, result: null });
  const [confirmingExit, setConfirmingExit] = useState(false);
  // Evita dos envios si se presiona Guardar dos veces seguidas.
  const sending = useRef(false);

  const dirty = isDirty(values, initialValues);
  const saving = status.state === 'saving';

  const setField = useCallback((field, value) => {
    setValues((previous) => ({ ...previous, [field]: value }));
    // Al corregir un campo se quita SU marca roja; las demas se mantienen.
    setErrors((previous) => {
      if (!previous[field]) return previous;
      const { [field]: _removed, ...rest } = previous;
      return rest;
    });
  }, []);

  async function submit(event) {
    event?.preventDefault();
    if (sending.current) return;

    const missing = findMissingFields(values, requiredFields);
    if (Object.keys(missing).length > 0) {
      setErrors(missing);
      setStatus({ state: 'error', message: REQUIRED_FIELDS_MESSAGE, code: 'REQUIRED_FIELDS', result: null });
      return;
    }

    sending.current = true;
    setStatus({ state: 'saving', message: '', code: null, result: null });
    try {
      const result = await onSubmit(values);
      setErrors({});
      setStatus({ state: 'success', message: result?.message ?? '', code: null, result });
    } catch (error) {
      setErrors(fieldErrorsFromApi(error, duplicateFields));
      setStatus({
        state: 'error',
        // El 422 de obligatorios trae un mensaje por campo; arriba va el de la historia.
        message: error.code === 'REQUIRED_FIELDS' ? REQUIRED_FIELDS_MESSAGE : error.message,
        code: error.code ?? null,
        result: null,
      });
    } finally {
      sending.current = false;
    }
  }

  const reset = useCallback(() => {
    setValues(initialValues);
    setErrors({});
    setStatus({ state: 'idle', message: '', code: null, result: null });
    setConfirmingExit(false);
  }, [initialValues]);

  // CA-4: `leave` es lo que pasa al cancelar un formulario vacio (volver).
  function requestCancel(leave) {
    if (saving) return;
    if (dirty) setConfirmingExit(true);
    else leave();
  }

  return {
    values, errors, status, saving, dirty, confirmingExit,
    setField, submit, reset, requestCancel,
    keepEditing: () => setConfirmingExit(false),
  };
}
