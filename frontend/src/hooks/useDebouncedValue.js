import { useEffect, useState } from 'react';

/**
 * Devuelve `value` pero con retraso: solo cambia cuando el valor original
 * lleva `delayMs` sin modificarse.
 *
 * Sirve para que un campo de búsqueda no dispare una consulta al backend
 * por cada tecla: el usuario escribe "lau" y se hace UNA sola petición, no
 * tres. El `clearTimeout` del cleanup cancela la espera anterior cada vez
 * que el valor vuelve a cambiar (eso es lo que realmente "debouncea").
 */
export default function useDebouncedValue(value, delayMs) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
