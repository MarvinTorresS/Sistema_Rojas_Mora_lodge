import { describe, expect, it } from 'vitest';
import {
  GUEST_MESSAGES, isFullName, isValidEmail, isValidName, normalizeIdentification, normalizePhone,
  typeIdentification, typePhone, validateGuestData,
} from './guestData';

describe('formato de los datos de una persona', () => {
  it('cédula: solo números, 9 dígitos (DIMEX 11 o 12)', () => {
    expect(normalizeIdentification('6-0495-0088')).toBe('604950088');
    expect(normalizeIdentification('155812345678')).toBe('155812345678');
    ['Juan Lopez', '60495008A', '60495008', '6049500889', '1234567890123', '']
      .forEach((value) => expect(normalizeIdentification(value)).toBeNull());
  });

  it('teléfono: 8 dígitos, acepta +506, espacios y guiones', () => {
    expect(normalizePhone('8557-1211')).toBe('85571211');
    expect(normalizePhone('+506 8557 1211')).toBe('85571211');
    ['abcdefgh', '8557121', '855712111', 'juan@gmail.com', '']
      .forEach((value) => expect(normalizePhone(value)).toBeNull());
  });

  it('correo y nombre', () => {
    expect(isValidEmail('juan@gmail.com')).toBe(true);
    ['juan', 'juan@gmail', 'juan@@gmail.com', 'ju an@gmail.com', '85571211'].forEach((value) => expect(isValidEmail(value)).toBe(false));
    expect(isValidName("María José O'Neil-Pérez")).toBe(true);
    ['Juan 123', '85571211', 'juan@gmail.com', '-Juan'].forEach((value) => expect(isValidName(value)).toBe(false));
  });

  it('nombre completo: nombre y apellido', () => {
    ['Juan Pérez', 'Juan Pérez Mora', 'María de los Ángeles Solís'].forEach((value) => expect(isFullName(value)).toBe(true));
    ['Juan', '  Juan ', 'J P'].forEach((value) => expect(isFullName(value)).toBe(false));
  });

  it('al escribir se quitan los caracteres que nunca valen', () => {
    expect(typeIdentification('6-0495-00ab88')).toBe('6-0495-0088');
    expect(typeIdentification('1234567890123456789')).toHaveLength(14);
    expect(typePhone('+506 8557-12x11')).toBe('+506 8557-1211');
  });

  it('validateGuestData marca solo lo escrito y mal escrito', () => {
    expect(validateGuestData({
      guestIdentification: 'Juan Lopez', guestName: 'Juan 1', guestPhone: '123', guestEmail: 'nope',
    })).toEqual({
      guestIdentification: GUEST_MESSAGES.IDENTIFICATION,
      guestName: GUEST_MESSAGES.NAME,
      guestPhone: GUEST_MESSAGES.PHONE,
      guestEmail: GUEST_MESSAGES.EMAIL,
    });
    expect(validateGuestData({
      guestIdentification: '6-0495-0088', guestName: 'Juan López', guestPhone: '8557-1211', guestEmail: 'juan@gmail.com',
    })).toEqual({});
    expect(validateGuestData({ guestName: 'Juan' })).toEqual({ guestName: GUEST_MESSAGES.FULL_NAME });
    // Vacío no es un error de formato (lo cubre el aviso de "obligatorio").
    expect(validateGuestData({ guestIdentification: '', guestPhone: '' })).toEqual({});
  });
});
