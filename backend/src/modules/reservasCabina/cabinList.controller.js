'use strict';
const service = require('./cabinList.service');

async function listBookings(req, res, next) {
  try {
    const { items, ...meta } = await service.listCabinBookings({
      page: req.query.page, pageSize: req.query.pageSize,
    });
    return res.json({ data: items, meta });
  } catch (error) {
    return next(error);
  }
}
module.exports = { listBookings };
