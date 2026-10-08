import { ART_PALETTES } from './cabinLooks';

/**
 * Ilustración de la cabina (la misma del prototipo A3 en Figma).
 *
 * Es SVG en línea y no una imagen: así el color del techo, puerta y
 * ventanas cambia con el estado SIN tener un archivo por estado, y con
 * `transition-colors` el cambio se anima (igual que el Smart Animate del
 * prototipo). Se dibuja en una caja de 120x86 y se escala con `width`.
 */
function CabinArt({ palette = 'available', width = 150, className = '' }) {
  const colors = ART_PALETTES[palette] ?? ART_PALETTES.available;
  const height = Math.round((width * 86) / 120);
  const animated = 'transition-colors duration-300';
  return (
    <svg
      width={width} height={height} viewBox="0 0 120 86" aria-hidden="true"
      className={className} xmlns="http://www.w3.org/2000/svg"
    >
      <rect className={animated} x="4" y="78" width="112" height="6" rx="3" fill={colors.ground} />
      <rect className={animated} x="80" y="14" width="10" height="20" rx="1" fill={colors.roof} />
      <rect
        className={animated} x="20" y="40" width="80" height="40" rx="3"
        fill={colors.wall} stroke={colors.roof} strokeOpacity="0.35" strokeWidth="1.5"
      />
      <path
        className={animated} d="M10 44 L60 10 L110 44 Z"
        fill={colors.roof} stroke={colors.roof} strokeWidth="5" strokeLinejoin="round"
      />
      <rect className={animated} x="52" y="54" width="16" height="26" rx="2" fill={colors.door} />
      <rect className={animated} x="29" y="51" width="15" height="13" rx="2" fill={colors.window} />
      <rect className={animated} x="76" y="51" width="15" height="13" rx="2" fill={colors.window} />
    </svg>
  );
}

export default CabinArt;
