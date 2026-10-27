'use strict';
const { checkOutCabin } = require('./cabinCheckOut.service');

async function checkOut(req, res, next) {
  try {
    const data = await checkOutCabin({ bookingId: Number(req.params.bookingId), userId: req.user?.userId ?? null });
    return res.json({ data });
  } catch (error) { return next(error); }
}
module.exports = { checkOut };
