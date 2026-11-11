import { CakeSlice, CupSoda, Salad, UtensilsCrossed } from 'lucide-react';

// Icono por categoria conocida; una categoria nueva del backend usa el generico.
const ICONS = { Entrada: Salad, 'Plato fuerte': UtensilsCrossed, Bebida: CupSoda, Postre: CakeSlice };

/**
 * HU-113: categorias como tarjetas grandes (concepto A). Las opciones llegan
 * del backend (GET /restaurant-products/categories), unica fuente de verdad.
 */
export default function CategoryPicker({ categories, value, onChange, disabled, inputProps }) {
  return (
    <div id={inputProps.id} className="rst-category-grid" role="radiogroup" aria-label="Categoría"
      aria-invalid={inputProps['aria-invalid']} aria-describedby={inputProps['aria-describedby']}
      aria-required={inputProps['aria-required']}>
      {categories.map((category) => {
        const Icon = ICONS[category.value] ?? UtensilsCrossed;
        const checked = category.value === value;
        return (
          <button key={category.value} type="button" role="radio" aria-checked={checked} disabled={disabled}
            className="rst-category" onClick={() => onChange(category.value)}>
            <Icon size={22} aria-hidden="true" />
            <span>{category.label}</span>
          </button>
        );
      })}
    </div>
  );
}
