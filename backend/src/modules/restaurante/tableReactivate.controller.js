'use strict';
const { reactivateTable } = require('./tableReactivate.service');
async function reactivate(req, res, next) {
  try { return res.json({ data: await reactivateTable({ tableId: Number(req.params.tableId), userId: req.user?.userId ?? null }) }); }
  catch (error) { return next(error); }
}
module.exports = { reactivate };
