'use strict';
const { Booking, CabinDetail } = require('../../models');
const { getRecordedStayTotal } = require('./cabinBilling.service');
const { toHotelDate, countNights, calculateStayCost } = require('./cabinStay.util');
const { DomainError } = require('../../utils/domainError.util');

async function buildEarlyQuote(booking, now, transaction) {
  const today = toHotelDate(now);
  const arrival = toHotelDate(booking.startDatetime);
  if (booking.status !== 'active' || arrival <= today) throw new DomainError('La reserva debe estar activa y tener entrada futura.', 409);
  const detail = await CabinDetail.findByPk(booking.resourceId, { transaction, ...(transaction ? { lock: transaction.LOCK.UPDATE } : {}) });
  if (!detail || !Number.isFinite(Number(detail.pricePerNight)) || Number(detail.pricePerNight) <= 0) throw new DomainError('La cabina no tiene una tarifa válida.', 409);
  const originalNights = countNights(arrival, toHotelDate(booking.endDatetime));
  const previous = await getRecordedStayTotal({ bookingId: booking.bookingId, fallbackTotal: calculateStayCost({ nights: originalNights, pricePerNight: detail.pricePerNight }), transaction });
  const additionalNights = countNights(today, arrival);
  const additionalAmount = calculateStayCost({ nights: additionalNights, pricePerNight: detail.pricePerNight });
  return { bookingId: booking.bookingId, checkInDate: today, checkOutDate: toHotelDate(booking.endDatetime), originalCheckInDate: arrival, additionalNights, nightlyRate: Number(detail.pricePerNight), previousTotal: previous.totalAmount, additionalAmount, totalAmount: Math.round((previous.totalAmount + additionalAmount) * 100) / 100 };
}
async function getEarlyQuote(bookingId) {
  const booking = await Booking.findByPk(bookingId);
  if (!booking) throw new DomainError('La reserva indicada no existe.', 404);
  return buildEarlyQuote(booking, new Date());
}
module.exports = { buildEarlyQuote, getEarlyQuote };
