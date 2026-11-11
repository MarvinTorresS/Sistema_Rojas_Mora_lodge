'use strict';

const service = require('./catalogoProductos.service');
const { actingUserId } = require('./catalogoMesas.controller');
const { MESSAGES } = require('./restaurante.util');

async function listProducts(req, res, next) {
  try {
    const data = await service.listProducts({ q: req.query.q });
    return res.json({ data, meta: { total: data.length } });
  } catch (error) { return next(error); }
}

// HU-113 (Marvin) - Categorias oficiales del menu para el formulario.
async function listCategories(req, res, next) {
  try {
    const data = service.listCategories();
    return res.json({ data, meta: { total: data.length } });
  } catch (error) { return next(error); }
}

// HU-113 (Marvin) - Registrar un producto del menu.
async function createProduct(req, res, next) {
  try {
    const { name, category, price, stockQuantity } = req.body;
    const data = await service.createProduct({
      name, category, price, stockQuantity, userId: actingUserId(req),
    });
    return res.status(201).json({ data, message: MESSAGES.PRODUCT_CREATED });
  } catch (error) { return next(error); }
}

module.exports = { listProducts, listCategories, createProduct };
