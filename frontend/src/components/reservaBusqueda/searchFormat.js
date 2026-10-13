import { addDays, countNights, formatDayRange, formatShortDate } from '../cabinas/cabinFormat';
import { LIMITS } from './searchConfig';
import {
  GUEST_MESSAGES, isFullName, isValidEmail, isValidName, normalizePhone,
} from '../common/guestData';

/**
 * Funciones auxiliares de la modificación de reservas (HU-019): armar el
 * borrador desde la reserva, calcular qué cambió y revisar el formulario.
 * La revisión de aquí SOLO ahorra un viaje a la red; la que decide es el
 * backend.
 */

const cleanText = (value) => value.trim().replace(/\s+/g, ' ');

// Borrador del formulario con los valores actuales de la reserva. Todo texto
// (los <input> trabajan con texto).
export function buildDraft(booking) {
  return {
    resourceId: String(booking.cabin.resourceId),
    checkInDate: booking.stay.checkInDate,
    checkOutDate: booking.stay.checkOutDate,
    companions: String(booking.companions),
    guestName: booking.guest.fullName ?? '',
    guestPhone: booking.guest.phone ?? '',
    guestEmail: booking.guest.email ?? '',
  };
}

/**
 * Compara el borrador con la reserva y devuelve SOLO lo que cambió, con la
 * forma exacta del cuerpo de PATCH (números como número, textos limpios).
 * Un campo igual al actual no se manda: así "no hay cambios" se detecta
 * aquí y el botón Guardar queda apagado.
 */
export function diffDraft(booking, draft) {
  const changes = {};
  if (Number(draft.resourceId) !== booking.cabin.resourceId) changes.resourceId = Number(draft.resourceId);
  if (draft.checkInDate !== booking.stay.checkInDate) changes.checkInDate = draft.checkInDate;
  if (draft.checkOutDate !== booking.stay.checkOutDate) changes.checkOutDate = draft.checkOutDate;
  if (draft.companions.trim() !== '' && Number(draft.companions) !== booking.companions) {
    changes.companions = Number(draft.companions);
  }
  if (cleanText(draft.guestName) !== (booking.guest.fullName ?? '')) changes.guestName = cleanText(draft.guestName);
  // El teléfono se compara y se manda como se guarda: solo los 8 dígitos.
  const phoneNow = normalizePhone(draft.guestPhone) ?? cleanText(draft.guestPhone);
  const phoneThen = normalizePhone(booking.guest.phone ?? '') ?? (booking.guest.phone ?? '');
  if (phoneNow !== phoneThen) changes.guestPhone = phoneNow;
  if (draft.guestEmail.trim().toLowerCase() !== (booking.guest.email ?? '').toLowerCase()) {
    changes.guestEmail = draft.guestEmail.trim();
  }
  return changes;
}

/**
 * Revisa el borrador y devuelve { campo: mensaje } SOLO de los campos con
 * problema. `cabins` es el catálogo (para la capacidad); `today` el
 * AAAA-MM-DD de hoy en el hotel. Solo se revisa lo que cambió: una reserva
 * cuya entrada ya pasó se puede corregir sin que eso se objete.
 */
export function validateDraft(booking, draft, { cabins = [], today }) {
  const errors = {};
  const changes = diffDraft(booking, draft);

  if (draft.guestName.trim() !== '' && cleanText(draft.guestName).length < LIMITS.NAME_MIN) {
    errors.guestName = 'El nombre del huésped debe tener entre 3 y 150 caracteres.';
  }
  if (cleanText(draft.guestName) === '') errors.guestName = 'El nombre completo del huésped es obligatorio.';
  // Nombre sin números, teléfono de 8 dígitos y correo válido. El formato se
  // exige a lo que se está escribiendo: un dato viejo que no se toca no
  // impide corregir, por ejemplo, las fechas.
  if (!errors.guestName && changes.guestName !== undefined) {
    if (!isValidName(draft.guestName)) errors.guestName = GUEST_MESSAGES.NAME;
    else if (!isFullName(draft.guestName)) errors.guestName = GUEST_MESSAGES.FULL_NAME;
  }

  if (draft.guestPhone.trim() === '') errors.guestPhone = 'El teléfono del huésped es obligatorio.';
  else if (changes.guestPhone !== undefined && normalizePhone(draft.guestPhone) === null) errors.guestPhone = GUEST_MESSAGES.PHONE;
  if (draft.guestEmail.trim() === '') errors.guestEmail = 'El correo del huésped es obligatorio.';
  else if (changes.guestEmail !== undefined && !isValidEmail(draft.guestEmail)) errors.guestEmail = GUEST_MESSAGES.EMAIL;

  const companions = Number(draft.companions);
  if (draft.companions.trim() === '' || !Number.isInteger(companions) || companions < 0 || companions > LIMITS.MAX_COMPANIONS) {
    errors.companions = `Indicá un número de acompañantes entre 0 y ${LIMITS.MAX_COMPANIONS}.`;
  }

  if (!draft.checkInDate) errors.checkInDate = 'La fecha de entrada es obligatoria.';
  if (!draft.checkOutDate) errors.checkOutDate = 'La fecha de salida es obligatoria.';
  if (!errors.checkInDate && !errors.checkOutDate) {
    if (countNights(draft.checkInDate, draft.checkOutDate) < 1) {
      errors.checkOutDate = 'La fecha de salida debe ser posterior a la fecha de entrada.';
    } else if (changes.checkInDate && draft.checkInDate < today) {
      errors.checkInDate = 'No se puede mover la fecha de entrada a un día anterior a hoy.';
    } else if (changes.checkOutDate && draft.checkOutDate < today) {
      errors.checkOutDate = 'No se puede mover la fecha de salida a un día anterior a hoy.';
    }
  }

  const cabin = cabins.find((item) => item.resourceId === Number(draft.resourceId));
  if (!errors.companions && cabin && companions + 1 > cabin.capacity) {
    errors.companions = `La cabina ${cabin.name} tiene capacidad para ${cabin.capacity} personas y el grupo es de ${companions + 1}.`;
  }
  return errors;
}

/**
 * Lista legible de lo que va a cambiar, para mostrar antes de confirmar:
 * [{ key, label, from, to }]. Usa los nombres de cabina del catálogo.
 */
export function describeChanges(booking, draft, cabins = []) {
  const changes = diffDraft(booking, draft);
  const rows = [];
  if (changes.resourceId !== undefined) {
    const nameOf = (id) => cabins.find((cabin) => cabin.resourceId === id)?.name ?? `Cabina ${id}`;
    rows.push({ key: 'resourceId', label: 'Cabina', from: booking.cabin.name, to: nameOf(changes.resourceId) });
  }
  if (changes.checkInDate !== undefined) {
    rows.push({
      key: 'checkInDate', label: 'Entrada',
      from: formatShortDate(booking.stay.checkInDate), to: formatShortDate(changes.checkInDate),
    });
  }
  if (changes.checkOutDate !== undefined) {
    rows.push({
      key: 'checkOutDate', label: 'Salida',
      from: formatShortDate(booking.stay.checkOutDate), to: formatShortDate(changes.checkOutDate),
    });
  }
  if (changes.companions !== undefined) {
    rows.push({ key: 'companions', label: 'Acompañantes', from: String(booking.companions), to: String(changes.companions) });
  }
  if (changes.guestName !== undefined) {
    rows.push({ key: 'guestName', label: 'Nombre', from: booking.guest.fullName, to: changes.guestName });
  }
  if (changes.guestPhone !== undefined) {
    rows.push({ key: 'guestPhone', label: 'Teléfono', from: booking.guest.phone || '—', to: changes.guestPhone });
  }
  if (changes.guestEmail !== undefined) {
    rows.push({ key: 'guestEmail', label: 'Correo', from: booking.guest.email || '—', to: changes.guestEmail });
  }
  return rows;
}

// "12 – 15 oct" de una fecha alternativa { checkInDate, checkOutDate }.
export function alternativeDatesLabel(option) {
  return formatDayRange(option.checkInDate, option.checkOutDate);
}

/**
 * Reserva de la lista a partir de la respuesta de PATCH, para que la ficha
 * muestre los datos nuevos sin volver a buscar.
 */
export function bookingFromUpdate(previous, result) {
  return {
    ...previous,
    status: result.booking.status,
    cabin: { resourceId: result.cabin.resourceId, name: result.cabin.name, capacity: result.cabin.capacity },
    guest: { ...previous.guest, ...result.guest },
    partySize: result.booking.partySize,
    companions: Math.max(result.booking.partySize - 1, 0),
    stay: result.stay,
    totalAmount: result.amounts?.totalAmount ?? previous.totalAmount,
    isTotalEstimated: result.amounts?.totalAmount != null ? false : previous.isTotalEstimated,
  };
}

// Salida sugerida mínima para el campo de fecha (un día después de la entrada).
export const minCheckOut = (checkInDate) => addDays(checkInDate, 1);
