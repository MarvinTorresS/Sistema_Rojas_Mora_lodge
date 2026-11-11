import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Check } from 'lucide-react';
import EncabezadoRestaurante from '../components/restaurante/EncabezadoRestaurante';
import FormField from '../components/restaurante/registro/FormField';
import NumberStepper from '../components/restaurante/registro/NumberStepper';
import CategoryPicker from '../components/restaurante/registro/CategoryPicker';
import ProductPreview from '../components/restaurante/registro/ProductPreview';
import LeaveWithoutSavingDialog from '../components/restaurante/registro/LeaveWithoutSavingDialog';
import useRegistrationForm from '../hooks/useRegistrationForm';
import { createMenuProduct, listProductCategories } from '../services/productosMenuService';
import { MAX_STOCK, PRODUCT_NAME_MAX_LENGTH, parsePriceInput } from '../utils/restauranteFormulario';
import { money } from '../utils/restaurante';
import './ReservasCancha.css';
import './ReservasSalon.css';
import './Restaurante.css';
import './RestauranteFormularios.css';

/**
 * HU-113 (Marvin, Sprint 4) - Registrar un producto del menú (Administrador).
 *   CA-1  Nombre nuevo en la categoría: el producto se crea "Disponible" y se
 *         muestra "Producto registrado exitosamente".
 *   CA-2  Mismo nombre en la misma categoría: "Ya existe un producto con ese
 *         nombre en esta categoría" debajo del nombre; no se guarda.
 *   CA-3  Falta nombre, categoría o precio: "Los campos marcados con (*) son
 *         obligatorios" y esos campos en rojo.
 *   CA-4  Cancelar con datos: "¿Desea salir sin guardar los cambios?" (Sí/No).
 * Concepto A del prototipo: categorías como tarjetas + vista previa.
 */
export const MENU_PATH = '/restaurante/menu';
export const INVALID_PRICE_MESSAGE = 'Indique un precio mayor que 0, con máximo 2 decimales.';

const INITIAL_VALUES = { name: '', category: '', price: '', stockQuantity: '' };
const REQUIRED_FIELDS = {
  name: 'El nombre del producto es obligatorio.',
  category: 'La categoría es obligatoria.',
  price: 'El precio es obligatorio.',
};
const DUPLICATE_FIELDS = { PRODUCT_DUPLICATE: 'name' };

// Un precio escrito pero ilegible ("abc") se rechaza aqui con el mismo
// formato de error del backend, para que el hook lo marque en el campo.
async function saveProduct(values) {
  const price = parsePriceInput(values.price);
  if (price === null) {
    throw Object.assign(new Error(INVALID_PRICE_MESSAGE), {
      details: [{ field: 'price', message: INVALID_PRICE_MESSAGE }],
    });
  }
  return createMenuProduct({
    name: values.name.trim(),
    category: values.category,
    price,
    stockQuantity: values.stockQuantity === '' ? undefined : Number(values.stockQuantity),
  });
}

export default function RegistrarProducto() {
  const navigate = useNavigate();
  const [categories, setCategories] = useState({ status: 'loading', data: [], message: '' });
  const form = useRegistrationForm({
    initialValues: INITIAL_VALUES,
    requiredFields: REQUIRED_FIELDS,
    duplicateFields: DUPLICATE_FIELDS,
    onSubmit: saveProduct,
  });
  const { values, errors, status, saving } = form;
  const saved = status.state === 'success' ? status.result.data : null;

  const loadCategories = useCallback(async () => {
    setCategories((previous) => ({ ...previous, status: 'loading', message: '' }));
    try {
      setCategories({ status: 'success', data: await listProductCategories(), message: '' });
    } catch (error) {
      setCategories({ status: 'error', data: [], message: error.message });
    }
  }, []);
  useEffect(() => { loadCategories(); }, [loadCategories]);

  const preview = saved
    ? { name: saved.name, category: saved.category, price: saved.price, stockQuantity: saved.stockQuantity }
    : { ...values, price: parsePriceInput(values.price) };

  return (
    <div className="bombonera bmb-salon bmb-restaurante">
      <div className="bmb-content">
        <EncabezadoRestaurante
          kicker="Restaurante · Menú" title="Registrar producto"
          backTo={MENU_PATH} backLabel="Volver al menú"
          text={<>Los campos marcados con (*) son obligatorios.<br />El producto queda listo para tomar pedidos.</>}
        />

        <div className="rst-register-layout">
          {saved ? (
            <section className="bmb-card rst-panel rst-register-done" aria-labelledby="rst-product-saved">
              <span className="rst-done-icon" aria-hidden="true"><Check size={26} /></span>
              <h2 id="rst-product-saved" role="status">{status.message || 'Producto registrado exitosamente'}</h2>
              <p className="rst-muted">
                {saved.name} · {saved.category} · {money(saved.price)} · {saved.stockQuantity} en existencia
              </p>
              <div className="rst-actions">
                <button type="button" className="bmb-action" onClick={form.reset}>Registrar otro producto</button>
                <Link to={MENU_PATH} className="rst-ghost">Ver productos del menú</Link>
              </div>
            </section>
          ) : (
            <form className="bmb-card rst-panel rst-register-form" noValidate onSubmit={form.submit} aria-label="Datos del nuevo producto">
              {status.state === 'error' && (
                <p role="alert" className="rst-alert-text rst-form-alert">{status.message}</p>
              )}

              <FormField id="product-name" label="Nombre" required error={errors.name}>
                {(inputProps) => (
                  <input {...inputProps} className="rst-input" maxLength={PRODUCT_NAME_MAX_LENGTH} autoComplete="off"
                    value={values.name} disabled={saving} onChange={(event) => form.setField('name', event.target.value)} />
                )}
              </FormField>

              <FormField id="product-category" label="Categoría" required error={errors.category} as="fieldset">
                {(inputProps) => (
                  <>
                    {categories.status === 'loading' && <p role="status" className="rst-muted">Cargando categorías…</p>}
                    {categories.status === 'error' && (
                      <div className="rst-alert" role="alert">
                        <span>{categories.message}</span>
                        <button type="button" onClick={loadCategories}>Reintentar</button>
                      </div>
                    )}
                    {categories.status === 'success' && (
                      <CategoryPicker categories={categories.data} value={values.category} disabled={saving}
                        inputProps={inputProps} onChange={(value) => form.setField('category', value)} />
                    )}
                  </>
                )}
              </FormField>

              <div className="rst-form-row">
                <FormField id="product-price" label="Precio" required error={errors.price} hint="En colones. Ej.: 4500 o 4500,50">
                  {(inputProps) => (
                    <div className="rst-money-input">
                      <span aria-hidden="true">₡</span>
                      <input {...inputProps} className="rst-input is-big" inputMode="decimal" autoComplete="off"
                        placeholder="0" value={values.price} disabled={saving}
                        onChange={(event) => form.setField('price', event.target.value)} />
                    </div>
                  )}
                </FormField>
                <FormField id="product-stock" label="Existencias iniciales" optional error={errors.stockQuantity}
                  hint="Vacío o 0: se mostrará como Agotado al tomar pedidos.">
                  {(inputProps) => (
                    <NumberStepper value={values.stockQuantity} min={0} max={MAX_STOCK} unitLabel="una unidad"
                      disabled={saving} inputProps={inputProps} onChange={(value) => form.setField('stockQuantity', value)} />
                  )}
                </FormField>
              </div>

              <div className="rst-form-actions">
                <button type="submit" className="bmb-continue rst-save" disabled={saving || categories.status !== 'success'}>
                  {saving ? 'Guardando…' : 'Guardar producto'}
                </button>
                <button type="button" className="rst-ghost rst-cancel" disabled={saving}
                  onClick={() => form.requestCancel(() => navigate(MENU_PATH))}>Cancelar</button>
              </div>
            </form>
          )}

          <aside className="bmb-card rst-panel rst-preview" aria-label="Vista previa del producto">
            <p className="bmb-kicker">Así se verá al tomar pedidos</p>
            <ProductPreview {...preview} />
            <p className="rst-muted rst-preview-note">
              La tarjeta se actualiza mientras escribe. Si el nombre ya existe en la misma categoría, se avisa debajo del nombre y no se borra lo escrito.
            </p>
          </aside>
        </div>

        {form.confirmingExit && (
          <LeaveWithoutSavingDialog
            detail="Se descartarán los datos del producto que escribió."
            onConfirm={form.reset} onCancel={form.keepEditing} />
        )}
      </div>
    </div>
  );
}
