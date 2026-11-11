/**
 * Campo de formulario con etiqueta, marca de obligatorio (*), ayuda y error.
 * Usa "render prop": entrega al input los atributos de accesibilidad ya
 * armados (id, aria-invalid, aria-describedby) para que el lector de
 * pantalla lea el error junto al campo (HU-102 / HU-113, CA-3).
 */
export default function FormField({
  id, label, required = false, optional = false, hint, error, children, as = 'div',
}) {
  const Wrapper = as;
  const describedBy = [error ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean).join(' ') || undefined;
  const LabelTag = as === 'fieldset' ? 'legend' : 'label';

  return (
    <Wrapper className={`rst-form-field${error ? ' is-invalid' : ''}`}>
      <LabelTag {...(LabelTag === 'label' ? { htmlFor: id } : {})} className="rst-form-label">
        {label}
        {required && <span className="rst-required" aria-hidden="true"> *</span>}
        {optional && <span className="rst-optional"> (opcional)</span>}
      </LabelTag>
      {children({ id, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy, 'aria-required': required || undefined })}
      {error && <p id={`${id}-error`} className="rst-form-error">{error}</p>}
      {hint && <p id={`${id}-hint`} className="rst-form-hint">{hint}</p>}
    </Wrapper>
  );
}
