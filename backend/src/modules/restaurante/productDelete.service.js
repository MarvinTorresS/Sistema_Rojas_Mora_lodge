'use strict';
const { Product, AccountItem, AuditLog, sequelize } = require('../../models');
const { DomainError } = require('../../utils/domainError.util');
const HISTORY_MESSAGE = 'No es posible eliminar un producto con historial de pedidos; márquelo como agotado o inactivo en su lugar';

async function deleteProduct({ productId, userId = null }) {
  try {
    return await sequelize.transaction(async (transaction) => {
      const product = await Product.findByPk(productId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!product) throw new DomainError('El producto indicado no existe.', 404);
      // No filtrar isRemoved: los pedidos retirados tambien forman historial.
      if (await AccountItem.count({ where: { productId: product.productId }, transaction })) {
        throw new DomainError(HISTORY_MESSAGE, 409, { code: 'PRODUCT_HAS_HISTORY' });
      }
      const previousProduct = { productId: product.productId, name: product.name, category: product.category,
        price: Number(product.price), stockQuantity: product.stockQuantity, isAvailable: product.isAvailable };
      await product.destroy({ transaction });
      await AuditLog.create({ userId, action: 'restaurant_product_deleted', entityType: 'product', entityId: product.productId,
        details: JSON.stringify({ previousProduct }) }, { transaction });
      return { productId: product.productId, message: 'Producto eliminado exitosamente' };
    });
  } catch (error) {
    // La FK mantiene la proteccion si aparece otra referencia concurrente.
    if (error.name === 'SequelizeForeignKeyConstraintError') throw new DomainError(HISTORY_MESSAGE, 409, { code: 'PRODUCT_HAS_HISTORY' });
    throw error;
  }
}
module.exports = { deleteProduct };
