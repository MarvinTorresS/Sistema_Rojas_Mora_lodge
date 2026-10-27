'use strict';

const { checkInCabin } = require('./cabinCheckIn.service');
const { verifyCabinAdministrator } = require('./cabinAdminApproval.service');
const { getEarlyQuote } = require('./cabinEarlyQuote.service');

async function checkIn(req, res, next) {
  try {
    const approval = req.body?.adminApproval ? await verifyCabinAdministrator(req.body.adminApproval) : null;
    const data = await checkInCabin({ bookingId: Number(req.params.bookingId), userId: approval?.userId ?? req.user?.userId ?? null, approval });
    return res.json({ data });
  } catch (error) {
    return next(error);
  }
}

async function earlyQuote(req, res, next) {
  try { res.json({ data: await getEarlyQuote(Number(req.params.bookingId)) }); }
  catch (error) { next(error); }
}
module.exports = { checkIn, earlyQuote };
