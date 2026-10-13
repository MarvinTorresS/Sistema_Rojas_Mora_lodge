'use strict';

const { DomainError } = require('../../utils/domainError.util');
const TAX_PERCENTAGE = 13;

// DECIMAL(10,2) se recibe como texto. Operar en centimos evita errores binarios.
function moneyToCents(value) {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(value));
  if (!match) throw new DomainError('Un consumo tiene un precio registrado inválido.', 409);
  return BigInt(match[1]) * 100n + BigInt((match[2] ?? '').padEnd(2, '0'));
}

function centsToMoney(value) {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new DomainError('El importe de la cuenta supera el límite permitido.', 409);
  return Number(value) / 100;
}

function calculateAccountTotal(items) {
  let subtotalCents = 0n;
  const lines = [];
  for (const item of items) {
    if (item.isRemoved) continue;
    if (!Number.isSafeInteger(item.quantity) || item.quantity < 1) {
      throw new DomainError('Un consumo tiene una cantidad registrada inválida.', 409);
    }
    const unitCents = moneyToCents(item.unitPrice);
    const lineCents = unitCents * BigInt(item.quantity);
    subtotalCents += lineCents;
    lines.push({ itemId: item.itemId, productId: item.productId,
      productName: item.product?.name ?? 'Producto sin nombre disponible',
      quantity: item.quantity, unitPrice: centsToMoney(unitCents), amount: centsToMoney(lineCents) });
  }
  const taxCents = (subtotalCents * BigInt(TAX_PERCENTAGE) + 50n) / 100n;
  return { lines, subtotal: centsToMoney(subtotalCents), taxPercentage: TAX_PERCENTAGE,
    taxAmount: centsToMoney(taxCents), total: centsToMoney(subtotalCents + taxCents),
    message: lines.length ? null : 'No hay consumos registrados aún' };
}

module.exports = { calculateAccountTotal };
