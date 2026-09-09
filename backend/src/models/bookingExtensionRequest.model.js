'use strict';

// Solicitud de extension de estadia de un huesped ya hospedado. Es una
// entidad propia (no un simple UPDATE de bookings.endDatetime) porque
// tiene ciclo de vida propio: quien la pide, quien la resuelve, y el
// motivo de un eventual rechazo.
module.exports = (sequelize, DataTypes) => {
  const BookingExtensionRequest = sequelize.define('BookingExtensionRequest', {
    extensionId: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      field: 'extension_id',
    },
    bookingId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'booking_id',
    },
    requestedEndDatetime: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'requested_end_datetime',
    },
    status: {
      type: DataTypes.ENUM('pending', 'approved', 'rejected'),
      allowNull: false,
      defaultValue: 'pending',
      field: 'status',
    },
    requestNotes: {
      type: DataTypes.STRING(250),
      field: 'request_notes',
    },
    rejectionReason: {
      type: DataTypes.STRING(250),
      field: 'rejection_reason',
    },
    requestedAt: {
      type: DataTypes.DATE,
      field: 'requested_at',
    },
    resolvedByUserId: {
      type: DataTypes.INTEGER,
      field: 'resolved_by_user_id',
    },
    resolvedAt: {
      type: DataTypes.DATE,
      field: 'resolved_at',
    },
  }, {
    tableName: 'booking_extension_requests',
    timestamps: false,
  });

  BookingExtensionRequest.associate = (models) => {
    BookingExtensionRequest.belongsTo(models.Booking, { foreignKey: 'booking_id', as: 'booking' });
    BookingExtensionRequest.belongsTo(models.User, { foreignKey: 'resolved_by_user_id', as: 'resolvedBy' });
  };

  return BookingExtensionRequest;
};
