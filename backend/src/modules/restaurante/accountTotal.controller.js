'use strict';
const { getAccountTotal } = require('./accountTotal.service');
async function getTotal(req, res, next) {
  try { return res.json({ data: await getAccountTotal(Number(req.params.accountId)) }); }
  catch (error) { return next(error); }
}
module.exports = { getTotal };
