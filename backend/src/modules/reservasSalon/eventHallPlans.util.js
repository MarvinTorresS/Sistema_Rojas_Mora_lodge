'use strict';

// Reglas de FORMA y normalizacion de los planes de precios del salon
// (HU-008 y HU-009 -- Sprint 2).
//
// Por que un archivo aparte: son funciones puras (sin base de datos ni
// HTTP) que usan DOS capas -- el validator, para avisar al instante que un
// dato no sirve, y el service, como ultima barrera -- y asi las dos aplican
// exactamente la misma regla (una sola fuente de verdad, igual que
// cabinStay.util.js hace con la tarifa de la cabina).

// --- Limites --------------------------------------------------------------
// plan_name es VARCHAR(50) en la base (ver la migracion 20260907000007).
const MIN_PLAN_NAME_LENGTH = 3;
const MAX_PLAN_NAME_LENGTH = 50;

// Una reserva del salon no puede pasar de un dia; el tope tambien frena el
// error tipico de digitar un cero de mas (ej. 120 en vez de 12).
const MIN_PLAN_HOURS = 1;
const MAX_PLAN_HOURS = 24;

// Maximo que cabe en la columna DECIMAL(10,2).
const MAX_PLAN_PRICE = 99999999.99;

// Servicios incluidos: texto libre corto ("Mobiliario", "Sonido"...).
const MAX_SERVICES = 20;
const MAX_SERVICE_LENGTH = 60;

// Porcentaje de anticipo propio del plan (columna DECIMAL(5,2)).
const MIN_DEPOSIT_PERCENTAGE = 0;
const MAX_DEPOSIT_PERCENTAGE = 100;

// --- Nombre ----------------------------------------------------------------
// Quita espacios sobrantes de los extremos y colapsa los repetidos del
// medio: "Plan   Basico " y "Plan Basico" son el mismo nombre para el
// negocio.
function normalizePlanName(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

// Clave para comparar nombres. HU-008 CA-2: "la validacion no distingue
// mayusculas/minusculas". Se compara en JavaScript (y no con LOWER() de
// MySQL) para no depender del collation de la base: la tabla tiene pocas
// filas, asi que traerlas es barato y la regla queda probada sin base.
function planNameKey(value) {
  return normalizePlanName(value).toLocaleLowerCase('es');
}

function getPlanNameError(value) {
  const name = normalizePlanName(value);
  if (!name) return 'El nombre del plan es obligatorio.';
  if (name.length < MIN_PLAN_NAME_LENGTH || name.length > MAX_PLAN_NAME_LENGTH) {
    return `El nombre del plan debe tener entre ${MIN_PLAN_NAME_LENGTH} y ${MAX_PLAN_NAME_LENGTH} caracteres.`;
  }
  return null;
}

// --- Duracion en horas -------------------------------------------------------
// Acepta un numero o un texto con solo digitos ("12"), que es lo que manda
// un formulario HTML. Devuelve NaN si no es un entero interpretable. No
// acepta booleanos, arreglos ni texto vacio: Number('') o Number(true)
// darian 0 o 1 "validos" por accidente.
function parseHours(value) {
  if (typeof value === 'number') return Number.isInteger(value) ? value : Number.NaN;
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) return Number(value.trim());
  return Number.NaN;
}

function getPlanHoursError(value) {
  if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) {
    return 'La duración del plan en horas es obligatoria.';
  }
  const hours = parseHours(value);
  if (!Number.isInteger(hours) || hours < MIN_PLAN_HOURS || hours > MAX_PLAN_HOURS) {
    return `La duración debe ser un número entero de horas entre ${MIN_PLAN_HOURS} y ${MAX_PLAN_HOURS}.`;
  }
  return null;
}

// --- Precio -----------------------------------------------------------------
function parsePrice(value) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && /^\d+(\.\d+)?$/.test(value.trim())) return Number(value.trim());
  return Number.NaN;
}

function getPlanPriceError(value) {
  if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) {
    return 'El precio del plan es obligatorio.';
  }
  const price = parsePrice(value);
  if (!Number.isFinite(price) || price <= 0) return 'El precio debe ser un monto mayor a cero.';
  if (price > MAX_PLAN_PRICE) return 'El precio no puede superar los 99 999 999,99 colones.';
  if (Math.abs(price * 100 - Math.round(price * 100)) > 1e-6) return 'El precio admite como máximo 2 decimales.';
  return null;
}

// Precio ya validado -> Number con 2 decimales exactos.
function normalizePrice(value) {
  return Math.round(parsePrice(value) * 100) / 100;
}

// --- Servicios incluidos -----------------------------------------------------
// El formulario manda un texto ("Mobiliario, Sonido") y una API puede
// mandar un arreglo. Los dos se llevan a la misma forma: arreglo de textos
// sin vacios ni repetidos (sin importar mayusculas), en el orden dado.
//
// Devuelve { services, error }. Vacio / null / undefined es VALIDO: los
// servicios son opcionales.
function normalizeIncludedServices(value) {
  if (value === undefined || value === null) return { services: [], error: null };

  let items;
  if (typeof value === 'string') {
    items = value.split(/[,\n;]/);
  } else if (Array.isArray(value)) {
    if (!value.every((item) => typeof item === 'string')) {
      return { services: [], error: 'Los servicios incluidos deben ser texto.' };
    }
    items = value;
  } else {
    return { services: [], error: 'Los servicios incluidos deben ser una lista de textos.' };
  }

  const seen = new Set();
  const services = [];
  items.forEach((item) => {
    const service = item.trim().replace(/\s+/g, ' ');
    const key = service.toLocaleLowerCase('es');
    if (service && !seen.has(key)) {
      seen.add(key);
      services.push(service);
    }
  });

  if (services.length > MAX_SERVICES) {
    return { services: [], error: `Indique como máximo ${MAX_SERVICES} servicios incluidos.` };
  }
  if (services.some((service) => service.length > MAX_SERVICE_LENGTH)) {
    return { services: [], error: `Cada servicio debe tener como máximo ${MAX_SERVICE_LENGTH} caracteres.` };
  }
  return { services, error: null };
}

// Lo que se guarda en la columna TEXT: JSON, o NULL si no hay servicios.
function serializeServices(services) {
  return services.length > 0 ? JSON.stringify(services) : null;
}

// Lo que se lee de la columna TEXT. Tolera NULL (planes anteriores) y
// tambien un texto simple separado por comas, por si alguien lo cargo a
// mano directamente en la base.
function parseStoredServices(raw) {
  if (raw === undefined || raw === null || raw === '') return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((item) => typeof item === 'string' && item.trim());
  } catch (error) {
    // No era JSON: se interpreta como texto separado por comas.
  }
  return normalizeIncludedServices(String(raw)).services;
}

// --- Porcentaje de anticipo --------------------------------------------------
// "Si aplica": vacio / null / undefined significa que el plan NO define
// anticipo propio y es valido. Devuelve { percentage, error }, donde
// percentage es null o un Number con 2 decimales.
function normalizeDepositPercentage(value) {
  if (value === undefined || value === null) return { percentage: null, error: null };
  if (typeof value === 'string' && value.trim() === '') return { percentage: null, error: null };

  let percentage;
  if (typeof value === 'number') percentage = value;
  else if (typeof value === 'string' && /^\d+(\.\d+)?$/.test(value.trim())) percentage = Number(value.trim());
  else percentage = Number.NaN;

  if (!Number.isFinite(percentage)
    || percentage < MIN_DEPOSIT_PERCENTAGE || percentage > MAX_DEPOSIT_PERCENTAGE) {
    return {
      percentage: null,
      error: `El porcentaje de anticipo debe estar entre ${MIN_DEPOSIT_PERCENTAGE} y ${MAX_DEPOSIT_PERCENTAGE}.`,
    };
  }
  if (Math.abs(percentage * 100 - Math.round(percentage * 100)) > 1e-6) {
    return { percentage: null, error: 'El porcentaje de anticipo admite como máximo 2 decimales.' };
  }
  return { percentage: Math.round(percentage * 100) / 100, error: null };
}

// --- Costo por hora extra ----------------------------------------------------
// Opcional: vacio / null / undefined significa que el plan NO admite horas
// extra. Si se indica, es un monto mayor a cero con hasta 2 decimales (igual
// que el precio). Devuelve { price, error } con price = null o un Number.
function normalizeExtraHourPrice(value) {
  if (value === undefined || value === null) return { price: null, error: null };
  if (typeof value === 'string' && value.trim() === '') return { price: null, error: null };

  const price = parsePrice(value);
  if (!Number.isFinite(price) || price <= 0) {
    return { price: null, error: 'El costo por hora extra debe ser un monto mayor a cero.' };
  }
  if (price > MAX_PLAN_PRICE) {
    return { price: null, error: 'El costo por hora extra no puede superar los 99 999 999,99 colones.' };
  }
  if (Math.abs(price * 100 - Math.round(price * 100)) > 1e-6) {
    return { price: null, error: 'El costo por hora extra admite como máximo 2 decimales.' };
  }
  return { price: Math.round(price * 100) / 100, error: null };
}

module.exports = {
  MIN_PLAN_NAME_LENGTH,
  MAX_PLAN_NAME_LENGTH,
  MIN_PLAN_HOURS,
  MAX_PLAN_HOURS,
  MAX_PLAN_PRICE,
  MAX_SERVICES,
  MAX_SERVICE_LENGTH,
  normalizePlanName,
  planNameKey,
  getPlanNameError,
  parseHours,
  getPlanHoursError,
  getPlanPriceError,
  normalizePrice,
  normalizeIncludedServices,
  serializeServices,
  parseStoredServices,
  normalizeDepositPercentage,
  normalizeExtraHourPrice,
};
