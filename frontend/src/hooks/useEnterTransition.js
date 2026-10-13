import { useEffect, useState } from 'react';

/**
 * Anima la entrada de quien lo use: arranca "oculto" (opacity-0 y
 * levemente desplazado/achicado, según las clases que le pongas) y, un
 * frame después, pasa al estado final -- ahí es cuando `transition-all`
 * de Tailwind SÍ se nota. Un cambio de clase dentro del MISMO render no
 * anima (el navegador nunca llega a pintar el estado inicial); por eso
 * hace falta el paso extra con requestAnimationFrame.
 *
 * Nació dentro de ReservasSalon.jsx (Sprint 2). Se movió a src/hooks/ en
 * el Sprint 3 porque la pantalla de cabinas usa exactamente la misma
 * animación: con dos usuarios, una copia por archivo sería duplicar
 * lógica (DRY).
 *
 * No es una librería de animaciones -- es el truco mínimo para lograr
 * una transición de "aparecer" sin agregar una dependencia nueva.
 */
export default function useEnterTransition() {
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  return entered;
}
