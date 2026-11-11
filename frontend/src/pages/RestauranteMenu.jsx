import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import EncabezadoRestaurante from '../components/restaurante/EncabezadoRestaurante';
import { listMenuProducts } from '../services/productosMenuService';
import { money } from '../utils/restaurante';
import './ReservasCancha.css';
import './ReservasSalon.css';
import './Restaurante.css';

export default function RestauranteMenu() {
  const [result, setResult] = useState({ status: 'loading', data: [], message: '' });
  const [attempt, setAttempt] = useState(0);
  const [draft, setDraft] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    let active = true;
    setResult({ status: 'loading', data: [], message: '' });
    listMenuProducts(search).then(({ data }) => {
      if (active) setResult({ status: 'success', data, message: '' });
    }).catch((error) => {
      if (active) setResult({ status: 'error', data: [], message: error.message });
    });
    return () => { active = false; };
  }, [attempt, search]);

  return (
    <div className="bombonera bmb-salon bmb-restaurante">
      <div className="bmb-content">
        <EncabezadoRestaurante kicker="Restaurante" title="Productos del menú"
          text="Consultá precios, existencias y disponibilidad de los productos registrados."
          actions={(
            // HU-113 (Marvin): acceso al formulario de registro de productos.
            <Link to="/restaurante/menu/registrar" className="bmb-pill-link"><Plus size={16} aria-hidden="true" />Registrar producto</Link>
          )} />
        <section className="bmb-card rst-panel" aria-label="Catálogo del menú">
          <form className="rst-filters" role="search" onSubmit={(event) => {
            event.preventDefault();
            setSearch(draft.trim());
            setAttempt((value) => value + 1);
          }}>
            <label className="rst-search">
              <span className="sr-only">Buscar por nombre o categoría</span>
              <input type="search" maxLength={100} value={draft}
                placeholder="Nombre o categoría" onChange={(event) => setDraft(event.target.value)} />
            </label>
            <button type="submit" className="rst-ghost">Buscar</button>
            <button type="button" className="rst-ghost" onClick={() => {
              setDraft(''); setSearch(''); setAttempt((value) => value + 1);
            }}>Limpiar búsqueda</button>
          </form>
          {result.status === 'loading' && <p role="status" className="rst-muted">Cargando productos…</p>}
          {result.status === 'error' && (
            <div role="alert" className="rst-alert">
              <span>{result.message}</span>
              <button type="button" onClick={() => setAttempt((value) => value + 1)}>Reintentar</button>
            </div>
          )}
          {result.status === 'success' && (result.data.length === 0 ? (
            <p role="status" className="rst-empty">{search ? 'No se encontraron productos que coincidan con la búsqueda' : 'No hay productos registrados'}</p>
          ) : (
            <div className="rst-table-wrap">
              <table className="rst-table">
                <caption className="sr-only">Productos registrados</caption>
                <thead><tr>
                  <th scope="col">Nombre</th><th scope="col">Categoría</th>
                  <th scope="col">Precio</th><th scope="col">Existencias</th><th scope="col">Disponibilidad</th>
                </tr></thead>
                <tbody>{result.data.map((product) => (
                  <tr key={product.productId}>
                    <th scope="row">{product.name}</th>
                    <td>{product.category ?? 'Sin categoría'}</td>
                    <td>{money(product.price)}</td>
                    <td>{product.stockQuantity}</td>
                    <td><span className={`rst-chip${product.status === 'Disponible' ? '' : ' is-bad'}`}>{product.status}</span></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
