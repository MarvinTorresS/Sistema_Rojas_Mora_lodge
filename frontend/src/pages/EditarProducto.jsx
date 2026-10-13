import { useState } from 'react';
import { Link } from 'react-router-dom';
import { getProduct, editProduct } from '../services/productEditService';

export default function EditarProducto() {
  const [id, setId] = useState('');
  const [product, setProduct] = useState(null);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fields, setFields] = useState({});
  const [notice, setNotice] = useState('');

  async function lookup(event) {
    event.preventDefault(); setError(''); setNotice(''); setFields({});
    if (!/^\d+$/.test(id) || Number(id) < 1 || Number(id) > 2147483647) { setError('Ingresá un número de producto válido.'); return; }
    setBusy(true); setProduct(null); setForm(null);
    try { const result = await getProduct(Number(id)); setProduct(result); setForm({ name: result.name, category: result.category ?? '', price: String(result.price), stockQuantity: String(result.stockQuantity) }); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  async function save(event) {
    event.preventDefault(); setError(''); setNotice(''); setFields({});
    const missing = Object.fromEntries(['name', 'category', 'price'].filter((key) => !form[key].trim()).map((key) => [key, 'Este campo es obligatorio.']));
    if (Object.keys(missing).length) { setFields(missing); setError('Los campos marcados con (*) son obligatorios'); return; }
    setBusy(true);
    try {
      const result = await editProduct(product.productId, { ...form, name: form.name.trim(), category: form.category.trim() });
      setProduct(result.product); setNotice(result.message);
    } catch (err) { setError(err.message); setFields(Object.fromEntries(err.details?.map((detail) => [detail.field, detail.message]) ?? [])); }
    finally { setBusy(false); }
  }
  function input(key, label, type = 'text', options = {}) {
    return <label className="flex flex-col gap-2 text-sm">{label}
      <input type={type} value={form[key]} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}
        aria-invalid={!!fields[key]} aria-describedby={fields[key] ? `${key}-error` : undefined} disabled={busy} {...options}
        className="rounded-lg border border-line bg-surface px-3 py-2" />
      {fields[key] && <span id={`${key}-error`} className="text-coral-700">{fields[key]}</span>}
    </label>;
  }
  return <section className="mx-auto w-full max-w-2xl space-y-6 p-6" aria-busy={busy}>
    <Link to="/" className="text-sm text-primary-700">Volver al inicio</Link>
    <div><h1 className="font-display text-3xl font-semibold text-primary-900">Editar producto</h1><p className="mt-2 text-muted">Actualizá sus datos y existencias.</p></div>
    <form onSubmit={lookup} className="flex flex-wrap gap-3">
      <label className="flex flex-1 flex-col gap-2 text-sm">Número de producto<input type="number" min="1" step="1" value={id} onChange={(event) => setId(event.target.value)} disabled={busy} className="rounded-lg border border-line bg-surface px-3 py-2" /></label>
      <button disabled={busy} className="self-end rounded-lg bg-primary-700 px-4 py-2 text-white disabled:opacity-50">Consultar producto</button>
    </form>
    {error && <p role="alert" className="rounded-lg bg-coral-50 p-3 text-coral-700">{error}</p>}
    {notice && <p role="status" className="rounded-lg bg-teal-50 p-3 text-teal-700">{notice}</p>}
    {product && form && <form onSubmit={save} className="space-y-4 rounded-xl border border-line bg-surface p-5">
      <h2 className="text-lg font-semibold">Producto #{product.productId}</h2>
      <p className="text-sm font-medium">Estado guardado: {product.isAvailable ? 'Disponible' : 'Agotado'}</p>
      <p className="text-sm text-muted">Los campos marcados con (*) son obligatorios.</p>
      {input('name', 'Nombre *', 'text', { maxLength: 100 })}
      {input('category', 'Categoría *', 'text', { maxLength: 60 })}
      {input('price', 'Precio *', 'number', { min: 0.01, max: 99999999.99, step: 0.01 })}
      {input('stockQuantity', 'Existencias', 'number', { min: 0, max: 2147483647, step: 1, required: true })}
      <p className="text-sm text-muted">Con cero existencias quedará agotado; al reponerlo volverá a estar disponible.</p>
      <button disabled={busy} className="rounded-lg bg-primary-700 px-4 py-2 text-white disabled:opacity-50">{busy ? 'Guardando…' : 'Guardar cambios'}</button>
    </form>}
  </section>;
}
