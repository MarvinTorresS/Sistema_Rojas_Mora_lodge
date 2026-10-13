'use strict';
const service = require('./productEdit.service');
async function get(req, res, next) {
  try { return res.json({ data: await service.getProduct(Number(req.params.productId)) }); }
  catch (error) { return next(error); }
}
async function update(req, res, next) {
  try { return res.json({ data: await service.editProduct({ productId: Number(req.params.productId), changes: req.body, userId: req.user?.userId ?? null }) }); }
  catch (error) { return next(error); }
}
module.exports = { get, update };
