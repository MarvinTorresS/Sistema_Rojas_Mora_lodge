// Utilidades puras del restaurante (HU-025, HU-030, HU-031): formato, armado
// del pedido por agregar y exportacion del comprobante preliminar.

export const MAX_QUANTITY_PER_LINE = 99;
export const TIME_ZONE = 'America/Costa_Rica';

const moneyFormat = new Intl.NumberFormat('es-CR', { style: 'currency', currency: 'CRC', minimumFractionDigits: 0, maximumFractionDigits: 2 });
export const money = (value) => moneyFormat.format(Number(value) || 0);

const dateTimeFormat = new Intl.DateTimeFormat('es-CR', { timeZone: TIME_ZONE, dateStyle: 'short', timeStyle: 'short' });
const dateFormat = new Intl.DateTimeFormat('es-CR', { timeZone: TIME_ZONE, dateStyle: 'short' });
export const formatDateTime = (value) => (value ? dateTimeFormat.format(new Date(value)) : '—');
export const formatDate = (value) => (value ? dateFormat.format(new Date(value)) : '—');

const round2 = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

// Unidades que se pueden pedir de un producto: lo que queda, hasta 99 por linea.
export function maxQuantity(product) {
  return Math.max(0, Math.min(MAX_QUANTITY_PER_LINE, Number(product?.stockQuantity) || 0));
}

// ---- Pedido por agregar: [{ productId, quantity }] -------------------------
export function addToPending(pending, product) {
  const limit = maxQuantity(product);
  if (limit === 0) return pending;
  const current = pending.find((line) => line.productId === product.productId);
  if (!current) return [...pending, { productId: product.productId, quantity: 1 }];
  if (current.quantity >= limit) return pending;
  return pending.map((line) => (line.productId === product.productId ? { ...line, quantity: line.quantity + 1 } : line));
}

export function setPendingQuantity(pending, product, quantity) {
  const wanted = Math.floor(Number(quantity));
  if (!Number.isFinite(wanted) || wanted < 1) return pending.filter((line) => line.productId !== product.productId);
  const bounded = Math.min(wanted, maxQuantity(product) || 1);
  return pending.map((line) => (line.productId === product.productId ? { ...line, quantity: bounded } : line));
}

export const removeFromPending = (pending, productId) => pending.filter((line) => line.productId !== productId);

// Estimado con los precios que muestra el menu AHORA; el precio que se cobra es
// el vigente en el servidor al momento de agregar (HU-025 CA-2).
export function pendingTotal(pending, menu) {
  return round2(pending.reduce((sum, line) => {
    const product = menu.find((entry) => entry.productId === line.productId);
    return sum + (product ? Number(product.price) * line.quantity : 0);
  }, 0));
}

export const toRequestItems = (pending) => pending.map(({ productId, quantity }) => ({ productId, quantity }));

// ---- HU-031: comprobante preliminar -----------------------------------------
const csvCell = (value) => {
  const text = String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export function buildBalanceCsv(balance) {
  const rows = [
    ['Comprobante preliminar de consumos del restaurante'],
    ['Huésped', balance.guest.guestName],
    ['Cabina', balance.guest.cabinName ?? ''],
    ['Generado', formatDateTime(balance.generatedAt)],
    [],
    ['Fecha', 'Producto', 'Cantidad', 'Precio unitario', 'Monto'],
    ...balance.consumptions.map((line) => [formatDateTime(line.date), line.productName, line.quantity, line.unitPrice, line.amount]),
    ['Saldo total', '', '', '', balance.total],
  ];
  return `﻿${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

export function downloadTextFile(filename, text, mime = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export const slug = (text) => String(text ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'huesped';
