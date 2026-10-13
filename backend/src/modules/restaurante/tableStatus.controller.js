'use strict';
const { listTableStatuses } = require('./tableStatus.service');
async function list(req, res, next) {
  try {
    const { items, ...meta } = await listTableStatuses();
    return res.json({ data: items, meta });
  } catch (error) { return next(error); }
}
module.exports = { list };
