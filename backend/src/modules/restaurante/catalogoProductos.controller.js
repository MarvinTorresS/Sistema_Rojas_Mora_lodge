'use strict';

const service = require('./catalogoProductos.service');

async function listProducts(req, res, next) {
  try {
    const data = await service.listProducts({ q: req.query.q });
    return res.json({ data, meta: { total: data.length } });
  } catch (error) { return next(error); }
}

module.exports = { listProducts };
