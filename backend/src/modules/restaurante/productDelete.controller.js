'use strict';
const { deleteProduct } = require('./productDelete.service');
async function remove(req, res, next) {
  try { return res.json({ data: await deleteProduct({ productId: Number(req.params.productId), userId: req.user?.userId ?? null }) }); }
  catch (error) { return next(error); }
}
module.exports = { remove };
