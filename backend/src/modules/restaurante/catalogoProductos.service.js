'use strict';

const { Product } = require('../../models');
const { Op } = require('sequelize');
const { mapMenuProduct, escapeLike } = require('./restaurante.util');

// HU-114: catálogo completo de consulta. El menú de pedidos mantiene sus
// restricciones: aquí también se muestran productos desactivados.
async function listProducts({ q = '' } = {}) {
  const term = q.trim();
  const products = await Product.findAll({
    ...(term ? { where: { [Op.or]: [
      { name: { [Op.like]: `%${escapeLike(term)}%` } },
      { category: { [Op.like]: `%${escapeLike(term)}%` } },
    ] } } : {}),
    order: [['category', 'ASC'], ['name', 'ASC']],
  });
  return products.map((product) => {
    const row = typeof product.get === 'function' ? product.get({ plain: true }) : product;
    const item = mapMenuProduct(row);
    return {
      ...item,
      isAvailable: row.isAvailable,
      status: item.soldOut ? 'Agotado' : row.isAvailable ? 'Disponible' : 'No disponible',
    };
  });
}

module.exports = { listProducts };
