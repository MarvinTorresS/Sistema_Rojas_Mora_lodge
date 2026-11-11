/**
 * Grupo de botones-ficha donde se elige UNA opcion (o ninguna, si se toca la
 * elegida otra vez y allowNone es true). Se usa para atajos de capacidad,
 * ubicaciones sugeridas y el filtro de capacidad minima de HU-104.
 * options: [{ value, label }]
 */
export default function ChoiceChips({
  options, value, onChange, label, allowNone = false, disabled = false,
}) {
  return (
    <div className="rst-chips" role="group" aria-label={label}>
      {options.map((option) => {
        const selected = String(option.value) === String(value);
        return (
          <button
            key={option.value} type="button" className="rst-choice" aria-pressed={selected} disabled={disabled}
            onClick={() => onChange(selected && allowNone ? '' : String(option.value))}
          >{option.label}</button>
        );
      })}
    </div>
  );
}
