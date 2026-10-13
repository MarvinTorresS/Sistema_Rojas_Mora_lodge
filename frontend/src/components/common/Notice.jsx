import { CircleCheck, Info, TriangleAlert } from 'lucide-react';

// Aviso reutilizable (HU-127 y HU-128). Vive en components/common/ porque lo
// usan dos pantallas distintas; antes estaba dentro de components/extension/.
//
// Tabla de configuración por tono (mismo patrón que cabinLooks.js): el
// componente no decide colores, solo los busca aquí.
//  - danger:  algo impide continuar (CA-2, CA-4, errores).
//  - info:    aclaración neutral, NO una alerta (ej. la nota de tarifa).
//  - success: la operación terminó bien (CA-1).
const TONES = {
  danger: { box: 'border-coral-400 bg-coral-50 text-coral-600', Icon: TriangleAlert, role: 'alert' },
  info: { box: 'border-teal-400/50 bg-teal-50 text-teal-600', Icon: Info, role: 'note' },
  success: { box: 'border-primary-400 bg-primary-50 text-primary-800', Icon: CircleCheck, role: 'status' },
};

/**
 * Aviso en caja con ícono. `title` es la frase principal (en negrita) y
 * `children` el detalle opcional. El `role` ARIA cambia con el tono para
 * que un lector de pantalla anuncie los errores de inmediato (alert) y las
 * aclaraciones sin interrumpir (note/status).
 */
function Notice({ tone = 'info', title, children }) {
  const { box, Icon, role } = TONES[tone];
  return (
    <div role={role} className={`flex gap-2.5 rounded-xl border px-3.5 py-3 ${box}`}>
      <Icon size={17} className="mt-0.5 shrink-0" aria-hidden="true" />
      <div className="min-w-0 text-[13px]">
        {title && <p className="font-bold">{title}</p>}
        {children && <div className={title ? 'mt-1' : ''}>{children}</div>}
      </div>
    </div>
  );
}

export default Notice;
