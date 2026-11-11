'use strict';

const { Product, AuditLog, sequelize } = require('../../models');
const { Op } = require('sequelize');
const { DomainError } = require('../../utils/domainError.util');
const {
  MESSAGES, CODES, PRODUCT_CATEGORIES, PRODUCT_NAME_MAX_LENGTH,
  mapMenuProduct, mapCatalogProduct, escapeLike,
  normalizeProductName, productNameKey, resolveProductCategory, isValidPrice, parseStock,
} = require('./restaurante.util');
const { assertActingUser } = require('./usuarioResponsable.service');

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

// ---------------------------------------------------------------------
// HU-113 (Marvin) - Registrar un producto del menu.
//   CA-1: nombre nuevo en la categoria -> crea el producto (isAvailable =
//         true) y responde "Producto registrado exitosamente".
//   CA-2: mismo nombre en la misma categoria -> 409 PRODUCT_DUPLICATE.
//         Sin distinguir mayusculas ni tildes ("Café" = "cafe"), igual que
//         la collation utf8mb4_0900_ai_ci del indice uq_product_name_category.
//   CA-3: falta nombre, categoria o precio -> 422 REQUIRED_FIELDS con un
//         detalle por campo.
//   CA-4: cancelar es solo del frontend.
// ---------------------------------------------------------------------

// Lista oficial para el selector del formulario.
function listCategories() {
  return PRODUCT_CATEGORIES.map(({ value, label }) => ({ value, label }));
}

const isBlank = (value) => value === undefined || value === null || (typeof value === 'string' && value.trim() === '');

function normalizeNewProduct({ name, category, price, stockQuantity } = {}) {
  const required = [];
  const invalid = [];

  const cleanName = normalizeProductName(name);
  if (isBlank(name)) required.push({ field: 'name', message: 'El nombre del producto es obligatorio.' });
  else if (cleanName === null || cleanName.length > PRODUCT_NAME_MAX_LENGTH) {
    invalid.push({ field: 'name', message: `El nombre admite hasta ${PRODUCT_NAME_MAX_LENGTH} caracteres.` });
  }

  const cleanCategory = resolveProductCategory(category);
  if (isBlank(category)) required.push({ field: 'category', message: 'La categoría es obligatoria.' });
  else if (cleanCategory === null) {
    const list = PRODUCT_CATEGORIES.map((item) => item.label).join(', ');
    invalid.push({ field: 'category', message: `Seleccione una categoría válida: ${list}.` });
  }

  if (isBlank(price)) required.push({ field: 'price', message: 'El precio es obligatorio.' });
  else if (!isValidPrice(price)) {
    invalid.push({ field: 'price', message: 'El precio debe ser mayor que 0, hasta 99 999 999.99 y con máximo 2 decimales.' });
  }

  const stock = isBlank(stockQuantity) ? 0 : parseStock(stockQuantity);
  if (stock === null) {
    invalid.push({ field: 'stockQuantity', message: 'Las existencias iniciales deben ser un número entero mayor o igual a 0.' });
  }

  if (required.length) {
    throw new DomainError(MESSAGES.REQUIRED_FIELDS, 422, {
      code: CODES.REQUIRED_FIELDS, details: [...required, ...invalid],
    });
  }
  if (invalid.length) throw new DomainError(invalid[0].message, 422, { details: invalid });
  // DECIMAL como texto con 2 decimales: evita errores de coma flotante.
  return {
    name: cleanName, category: cleanCategory, price: Number(String(price).trim()).toFixed(2), stockQuantity: stock,
  };
}

function duplicateProductError(values, productId) {
  return new DomainError(MESSAGES.PRODUCT_DUPLICATE, 409, {
    code: CODES.PRODUCT_DUPLICATE,
    details: { name: values.name, category: values.category, ...(productId ? { productId } : {}) },
  });
}

async function createProduct(input = {}) {
  const values = normalizeNewProduct(input);
  try {
    return await sequelize.transaction(async (transaction) => {
      const userId = await assertActingUser(input.userId ?? null, { transaction, required: false });

      // CA-2: chequeo previo comparando explicitamente (no depende de la
      // collation de cada base local).
      const sameCategory = await Product.findAll({
        where: { category: values.category }, attributes: ['productId', 'name'], transaction,
      });
      const wanted = productNameKey(values.name);
      const clash = sameCategory.find((product) => productNameKey(normalizeProductName(product.name) ?? '') === wanted);
      if (clash) throw duplicateProductError(values, clash.productId);

      const product = await Product.create({ ...values, isAvailable: true }, { transaction });
      await AuditLog.create({
        userId,
        action: 'restaurant_product_created',
        entityType: 'product',
        entityId: product.productId,
        details: JSON.stringify(values),
      }, { transaction });
      return mapCatalogProduct(product);
    });
  } catch (error) {
    // Dos administradores registrando el mismo producto a la vez: el indice
    // uq_product_name_category rechaza al segundo (transaccion revertida).
    if (error.name === 'SequelizeUniqueConstraintError') throw duplicateProductError(values);
    throw error;
  }
}

module.exports = { listProducts, listCategories, createProduct };
