// Interruptores de funciones que dependen de HU de sprints futuros.
//
// Se leen en el momento de usarse (no al cargar el modulo) para que las
// pruebas puedan encenderlos con vi.stubEnv sin recargar nada.

// La autorizacion con credenciales de Administrador (HU-105, eliminar mesa)
// necesita usuarios y roles, que llegan en el Sprint 5 (HU-032 a HU-039).
// Mientras no existan, queda apagada. Para encenderla, en frontend/.env:
//   VITE_ADMIN_AUTH_ENABLED=true
export function isAdminAuthEnabled() {
  return import.meta.env?.VITE_ADMIN_AUTH_ENABLED === 'true';
}

export const ROLES_PENDING_MESSAGE = 'La gestión de roles y permisos todavía no está implementada';
