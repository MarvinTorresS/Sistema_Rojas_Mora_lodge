import { Plus, Check } from 'lucide-react';
import fieldBackgroundPhoto from '../assets/cancha-sintetica-noche.jpg';

/**
 * Grilla visual de disponibilidad para el módulo de cancha sintética.
 *
 * Reemplaza los <input type="time"> de texto libre por una cuadrícula
 * de horas en la que el recepcionista VE de un vistazo qué horario está
 * libre, cuál ya está confirmado y cuál está pendiente, en vez de tener
 * que adivinar y esperar el error 409 del backend (conflicto de
 * horario) después de escribir toda la hora a mano.
 *
 * Por qué es un componente aparte de ReservasCancha.jsx: esta grilla
 * solo sabe "mostrar horas + dejar elegir una libre" — no sabe nada del
 * formulario, ni de axios, ni de cómo se guarda la reserva. Esa
 * separación (la misma idea de responsabilidad única que ya usamos en
 * el backend) permite que, si mañana Wagner quiere algo parecido para
 * el salón, reutilice este componente en vez de copiar 150 líneas.
 *
 * IMPORTANTE (alcance de esta sesión, confirmado con Marvin): los datos
 * de ocupación son MOCK, derivados de las mismas reservas de ejemplo
 * que ya usaba la tabla — no vienen del backend. Pintar la grilla con
 * datos reales requiere poder listar las reservas del día
 * (GET /api/field-bookings?date=...), que es HU-002 (Wagner). Cuando
 * esa HU exista, este componente puede recibir `slots` ya armado desde
 * afuera con datos reales sin tener que cambiar nada de su lógica
 * interna — por eso `slots` entra como prop en vez de generarse adentro.
 */

// Fondo: foto real de una cancha sintética iluminada de noche,
// provista por Marvin y guardada como asset local del proyecto
// (src/assets/cancha-sintetica-noche.jpg) — NO como URL externa.
//
// Antes se había intentado con una foto de Unsplash referenciada por
// URL, y luego con un degradado 100% CSS como alternativa sin red.
// Ambas se descartaron: la URL externa devolvía 403 (se confirmó que
// NINGÚN host de imágenes es alcanzable desde este entorno de red, no
// fue un problema puntual de Unsplash), y el degradado, aunque
// funcionaba, no lograba la textura ni el realismo de una foto real
// que Marvin pidió explícitamente al comparar contra sus mockups de
// referencia. Un archivo local resuelve ambos problemas: no depende
// de red y es la foto real.
//
// Se optimizó antes de sumarla al repo: la original pesaba ~3.1 MB
// (2900x1440); se redujo a 1600px de ancho y JPEG calidad 78, quedando
// en ~200 KB — suficiente nitidez para un fondo de sección sin
// castigar el tiempo de carga del panel.
//
// El degradado oscuro superpuesto (de abajo hacia arriba) no es
// decorativo nada más: es lo que garantiza que el texto blanco de las
// celdas siga siendo legible encima de la foto, sea cual sea el brillo
// de la zona de la imagen que quede detrás de cada celda.
const FIELD_BACKDROP_STYLE = {
  backgroundImage: `
    linear-gradient(180deg, rgba(10,21,3,.35) 0%, rgba(10,21,3,.55) 55%, rgba(10,21,3,.8) 100%),
    url(${fieldBackgroundPhoto})
  `,
  backgroundSize: 'cover',
  backgroundPosition: 'center',
};

// Config visual por estado. Reutiliza los tokens de color que ya
// existen en tailwind.config.js (primary/amber), NO colores nuevos
// inventados para este componente — así la grilla se siente parte del
// mismo sistema en vez de una skin aparte.
//
// Nota sobre las opacidades: con la foto real de fondo (antes era un
// degradado CSS) hubo que bajarlas. Con la opacidad original
// (bg-primary-900/75, bg-amber-400/30 con texto oscuro) las celdas
// "Ocupado"/"Pendiente" tapaban casi toda la foto y se veían como un
// bloque de color sólido en vez de vidrio esmerilado — y en
// "Pendiente" el texto quedaba en un tono oscuro casi ilegible sobre
// el ámbar. Ahora todas las celdas usan texto blanco (mismo criterio
// que "Disponible") y opacidades bajas para que la textura de la foto
// siga visible detrás, coherente con el efecto glassmorphism pedido.
const STATUS_STYLES = {
  occupied: {
    label: 'Ocupado',
    cellClass: 'border-primary-400/40 bg-primary-900/45 text-white',
    badgeClass: 'bg-primary-700/90 text-white',
  },
  pending: {
    label: 'Pendiente',
    cellClass: 'border-amber-400/50 bg-amber-500/25 text-white',
    badgeClass: 'bg-amber-500/90 text-primary-900',
  },
  available: {
    label: 'Disponible',
    cellClass: 'border-white/30 bg-white/10 text-white hover:bg-white/20 hover:border-white/50',
    badgeClass: '',
  },
  // Slot cuya hora de inicio ya pasó (solo aplica cuando el día elegido
  // es hoy — ver buildSlotsFromReservations en ReservasCancha.jsx). No
  // es un error ni una reserva: simplemente ya no se puede elegir, así
  // que usa una opacidad baja fija (sin hover) para diferenciarlo de
  // "Disponible" sin confundirlo con "Ocupado"/"Pendiente".
  past: {
    label: 'Hora pasada',
    cellClass: 'border-white/10 bg-white/5 text-white/50',
    badgeClass: '',
  },
};

/**
 * @param {{
 *   slots: Array<{ hour: number, hourLabel: string, status: 'occupied'|'pending'|'available'|'past', clientName?: string }>,
 *   onSelectSlot: (hour: number) => void,
 *   selectedHour?: number|null,
 * }} props
 */
function DisponibilidadGrid({ slots, onSelectSlot, selectedHour }) {
  return (
    // flex + h-full: el contenedor padre le da a este componente toda
    // la altura disponible de la pantalla (ver ReservasCancha.jsx).
    <div
      className="relative flex h-full flex-col overflow-hidden rounded-xl border border-line shadow-card"
      style={FIELD_BACKDROP_STYLE}
    >
      {/* 4 columnas fijas desde el ancho "sm": con exactamente 4 slots
          (ver OPENING_HOUR/CLOSING_HOUR/SLOT_DURATION_HOURS en
          ReservasCancha.jsx) esto los reparte en una sola fila
          completa, sin celdas vacías sobrando como pasaba antes con el
          escalonado 2→3→4 columnas. En pantallas muy angostas caen a 2
          columnas para que no se aplasten.
          flex-1 + content-center + justify-items-center: a pedido de
          Marvin, las celdas quedan centradas (horizontal y vertical) en
          el espacio disponible en vez de estirarse a llenarlo — cada
          celda mantiene su propio tamaño (min-h-[130px], max-w-[220px]
          en el botón) y se ve más foto de fondo alrededor. */}
      <div className="grid flex-1 grid-cols-2 content-center justify-items-center gap-4 p-5 sm:grid-cols-4">
        {slots.map((slot) => {
          const style = STATUS_STYLES[slot.status];
          const isSelected = slot.status === 'available' && slot.hour === selectedHour;
          const isClickable = slot.status === 'available';

          return (
            <button
              key={slot.hour}
              type="button"
              disabled={!isClickable}
              onClick={() => isClickable && onSelectSlot(slot.hour)}
              className={`flex min-h-[130px] w-full max-w-[220px] flex-col rounded-lg border p-4 text-left backdrop-blur-md transition-all ${style.cellClass} ${
                isSelected ? 'ring-2 ring-white ring-offset-2 ring-offset-primary-900' : ''
              } ${isClickable ? 'cursor-pointer' : 'cursor-default'}`}
            >
              <span className="text-xs font-semibold tracking-wide">{slot.hourLabel}</span>

              {/* flex-1 + justify-center: centra el estado en el
                  espacio sobrante de la celda sea cual sea su alto
                  final, en vez de pegarlo siempre abajo del todo. */}
              <div className="flex flex-1 flex-col items-start justify-center">
                {slot.status === 'available' && (
                  <span className="flex items-center gap-1 text-[11px] text-white/80">
                    {isSelected ? <Check size={13} /> : <Plus size={13} />}
                    {isSelected ? 'Seleccionada' : 'Reservar'}
                  </span>
                )}
                {slot.status === 'past' && (
                  <span className="text-[11px] text-white/50">{style.label}</span>
                )}
                {(slot.status === 'occupied' || slot.status === 'pending') && (
                  <div>
                    <p className="truncate text-[13px] font-semibold">{slot.clientName}</p>
                    <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${style.badgeClass}`}>
                      {style.label}
                    </span>
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Leyenda — panel propio de vidrio, como pidió el mockup */}
      <div className="flex flex-wrap gap-3 border-t border-white/10 bg-black/20 px-5 py-3 backdrop-blur-sm">
        {Object.entries(STATUS_STYLES).map(([key, style]) => (
          <div key={key} className="flex items-center gap-1.5 text-[11px] text-white/85">
            <span className={`h-2.5 w-2.5 rounded-full border ${style.cellClass}`} />
            {style.label}
          </div>
        ))}
      </div>
    </div>
  );
}

export default DisponibilidadGrid;
