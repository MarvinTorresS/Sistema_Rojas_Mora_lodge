import { useCallback, useState } from 'react';

// Código que manda el backend cuando el teléfono ya está registrado a
// nombre de OTRA persona (el backend no manda ningun dato de ese cliente; ver backend/src/services/customerResolution.service.js).
export const CUSTOMER_PHONE_CONFLICT = 'CUSTOMER_PHONE_CONFLICT';

/**
 * Estado del aviso "este teléfono ya pertenece a otro cliente", compartido
 * por las pantallas de cancha y salón.
 *
 * Por qué un hook: las dos pantallas necesitan exactamente la misma lógica
 * (reconocer el error y olvidarlo si cambian el nombre o el teléfono). Si cada pantalla la escribiera por su cuenta,
 * con el tiempo se irían separando; aquí vive una sola vez.
 *
 * @returns {{
 *   conflict: null | { message: string },
 *   captureConflict: (error: Error) => boolean,
 *   clearConflict: () => void,
 * }}
 */
export function useCustomerPhoneConflict() {
  const [conflict, setConflict] = useState(null);

  // Devuelve true si el error ERA el conflicto (y ya quedó guardado), para
  // que la pantalla sepa que no debe mostrarlo como un error común.
  const captureConflict = useCallback((error) => {
    if (error?.code !== CUSTOMER_PHONE_CONFLICT) return false;
    setConflict({ message: error.message });
    return true;
  }, []);

  const clearConflict = useCallback(() => setConflict(null), []);

  return { conflict, captureConflict, clearConflict };
}
