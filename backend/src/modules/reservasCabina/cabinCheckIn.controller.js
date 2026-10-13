'use strict';

const { checkInCabin } = require('./cabinCheckIn.service');

async function checkIn(req, res, next) {
  try {
    const data = await checkInCabin({ bookingId: Number(req.params.bookingId), userId: req.user?.userId ?? null });
    return res.json({ data });
  } catch (error) {
    return next(error);
  }
}

module.exports = { checkIn };
