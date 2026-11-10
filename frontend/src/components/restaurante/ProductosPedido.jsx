import { useMemo, useState } from 'react';
import { Minus, Plus, Search, X } from 'lucide-react';
import {
  addToPending, maxQuantity, money, pendingTotal, removeFromPending, setPendingQuantity,
} from '../../utils/restaurante';

/**
 * Catalogo de productos del menu (HU-025 / HU-030). Cada producto muestra su
 * precio vigente y su estado: "Agotado" cuando no quedan existencias (CA-3),
 * que ya no se puede agregar.
 */
export function SelectorProductos({
  menu, pending, onChange, disabled = false, loading = false, error = '', onRetry,
}) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const categories = useMemo(
    () => [...new Set(menu.map((product) => product.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')),
    [menu],
  );
  const text = search.trim().toLowerCase();
  const visible = menu.filter((product) => (!category || product.category === category)
    && (!text || product.name.toLowerCase().includes(text)));

  return (
    <div>
      <div className="rst-filters">
        <label className="rst-search">
          <Search size={15} aria-hidden="true" />
          <span className="sr-only">Buscar producto</span>
          <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar producto" />
        </label>
        <label className="rst-select">
          <span className="sr-only">Categoría</span>
          <select value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Categoría">
            <option value="">Todas las categorías</option>
            {categories.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
      </div>

      {loading && <p role="status" className="rst-muted">Cargando menú…</p>}
      {error && (
        <div className="rst-alert" role="alert">
          <span>{error}</span>
          {onRetry && <button type="button" onClick={onRetry}>Reintentar</button>}
        </div>
      )}
      {!loading && !error && menu.length === 0 && <p className="rst-muted">Todavía no hay productos registrados en el menú.</p>}
      {!loading && menu.length > 0 && visible.length === 0 && <p className="rst-muted">Ningún producto coincide con la búsqueda.</p>}

      <ul className="rst-products" aria-label="Productos del menú">
        {visible.map((product) => {
          const inPending = pending.find((line) => line.productId === product.productId)?.quantity ?? 0;
          const limit = maxQuantity(product);
          const reached = inPending >= limit;
          return (
            <li key={product.productId} className={`rst-product ${product.soldOut ? 'is-sold-out' : ''}`}>
              <div>
                <strong>{product.name}</strong>
                <small>{product.category ?? 'Sin categoría'}</small>
              </div>
              <div className="rst-product-meta">
                <span className="rst-price">{money(product.price)}</span>
                <span className={`rst-chip ${product.soldOut ? 'is-bad' : 'is-ok'}`}>{product.status}</span>
              </div>
              <button
                type="button" disabled={disabled || product.soldOut || reached}
                aria-label={`Agregar ${product.name}`}
                title={product.soldOut ? 'Producto sin existencias disponibles' : reached ? 'Ya pediste todas las existencias' : undefined}
                onClick={() => onChange(addToPending(pending, product))}
              >
                <Plus size={15} aria-hidden="true" />{inPending > 0 ? `En el pedido: ${inPending}` : 'Agregar'}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Lista "Por agregar": cantidades editables, estimado y las acciones de la pagina. */
export function PedidoPendiente({
  menu, pending, onChange, disabled = false, title = 'Por agregar', children,
}) {
  return (
    <section className="rst-pending" aria-label={title}>
      <h3>{title}</h3>
      {pending.length === 0 ? (
        <p className="rst-muted">Elegí productos del menú para armar el pedido.</p>
      ) : (
        <ul>
          {pending.map((line) => {
            const product = menu.find((entry) => entry.productId === line.productId);
            if (!product) return null;
            const limit = maxQuantity(product);
            return (
              <li key={line.productId}>
                <div>
                  <strong>{product.name}</strong>
                  <small>{money(product.price)} c/u</small>
                </div>
                <div className="rst-stepper">
                  <button type="button" aria-label={`Quitar una unidad de ${product.name}`} disabled={disabled}
                    onClick={() => onChange(setPendingQuantity(pending, product, line.quantity - 1))}><Minus size={14} /></button>
                  <input
                    type="number" min={1} max={limit} value={line.quantity} disabled={disabled}
                    aria-label={`Cantidad de ${product.name}`}
                    onChange={(event) => onChange(setPendingQuantity(pending, product, event.target.value))}
                  />
                  <button type="button" aria-label={`Agregar una unidad de ${product.name}`} disabled={disabled || line.quantity >= limit}
                    onClick={() => onChange(addToPending(pending, product))}><Plus size={14} /></button>
                </div>
                <span className="rst-line-total">{money(Number(product.price) * line.quantity)}</span>
                <button type="button" className="rst-remove" aria-label={`Quitar ${product.name} del pedido`} disabled={disabled}
                  onClick={() => onChange(removeFromPending(pending, line.productId))}><X size={15} /></button>
              </li>
            );
          })}
        </ul>
      )}
      {pending.length > 0 && (
        <p className="rst-estimate">
          <span>Estimado con precios vigentes</span><strong>{money(pendingTotal(pending, menu))}</strong>
        </p>
      )}
      {children}
    </section>
  );
}
