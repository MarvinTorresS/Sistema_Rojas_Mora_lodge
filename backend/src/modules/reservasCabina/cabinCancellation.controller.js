'use strict';
const { cancelCabinBooking } = require('./cabinCancellation.service');
async function cancelBooking(req, res, next) {
  try {
    const data = await cancelCabinBooking({ bookingId: Number(req.params.bookingId) });
    return res.json({ data });
  } catch (error) { return next(error); }
}
module.exports = { cancelBooking };
