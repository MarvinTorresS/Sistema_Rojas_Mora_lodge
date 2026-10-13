'use strict';
const { Product, AuditLog, sequelize } = require('../../models');
const { DomainError } = require('../../utils/domainError.util');

function productView(product) {
  return { productId: product.productId, name: product.name, category: product.category,
    price: Number(product.price), stockQuantity: product.stockQuantity, isAvailable: product.isAvailable };
}
async function getProduct(productId) {
  const product = await Product.findByPk(productId);
  if (!product) throw new DomainError('El producto indicado no existe.', 404);
  return productView(product);
}
async function editProduct({ productId, changes, userId = null }) {
  try {
    return await sequelize.transaction(async (transaction) => {
      const product = await Product.findByPk(productId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!product) throw new DomainError('El producto indicado no existe.', 404);
      const before = productView(product);
      await product.update({ name: changes.name.trim(), category: changes.category.trim(), price: changes.price,
        stockQuantity: Number(changes.stockQuantity), isAvailable: Number(changes.stockQuantity) > 0 }, { transaction });
      const after = productView(product);
      await AuditLog.create({ userId, action: 'restaurant_product_updated', entityType: 'product', entityId: product.productId,
        details: JSON.stringify({ previousProduct: before, newProduct: after }) }, { transaction });
      return { product: after, message: 'Producto actualizado exitosamente' };
    });
  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') throw new DomainError('Ya existe un producto con ese nombre en la misma categoría.', 409);
    throw error;
  }
}
module.exports = { getProduct, editProduct };
