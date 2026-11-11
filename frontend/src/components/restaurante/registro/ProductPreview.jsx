import { money } from '../../../utils/restaurante';

/**
 * HU-113: tarjeta "así se verá al tomar pedidos". Imita la tarjeta del menú
 * de HU-025 para que el administrador vea el resultado antes de guardar.
 */
export default function ProductPreview({ name, category, price, stockQuantity }) {
  const stock = Number(stockQuantity) || 0;
  const soldOut = stock <= 0;
  return (
    <article className="rst-preview-product" aria-label="Vista previa del producto">
      <div className="rst-preview-product-head">
        <strong>{name?.trim() || 'Nombre del producto'}</strong>
        <span className={`rst-chip${soldOut ? ' is-bad' : ''}`}>{soldOut ? 'Agotado' : 'Disponible'}</span>
      </div>
      <span className="rst-muted">{category || 'Sin categoría'} · {stock} en existencia</span>
      <strong className="rst-preview-price">{price === null ? '₡ —' : money(price)}</strong>
    </article>
  );
}
