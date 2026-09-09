'use strict';

// Reserva de cualquier recurso (cabana, salon, cancha o mesa). El campo
// originChannel distingue si la origino el personal ('staff', nace
// activa) o el propio cliente autenticado desde su cuenta ('web', nace
// pendiente de aprobacion). accessToken es solo un mecanismo de consulta
// para reservas de clientes sin cuenta registradas por el personal.
module.exports = (sequelize, DataTypes) => {
  const Booking = sequelize.define('Booking', {
    bookingId: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      field: 'booking_id',
    },
    resourceId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'resource_id',
    },
    customerId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'customer_id',
    },
    createdByUserId: {
      type: DataTypes.INTEGER,
      field: 'created_by_user_id',
    },
    originChannel: {
      type: DataTypes.ENUM('staff', 'web'),
      allowNull: false,
      defaultValue: 'staff',
      field: 'origin_channel',
    },
    accessToken: {
      type: DataTypes.STRING(64),
      unique: true,
      field: 'access_token',
    },
    startDatetime: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'start_datetime',
    },
    endDatetime: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'end_datetime',
    },
    partySize: {
      type: DataTypes.INTEGER,
      field: 'party_size',
    },
    eventHallPlanId: {
      type: DataTypes.INTEGER,
      field: 'event_hall_plan_id',
    },
    status: {
      type: DataTypes.ENUM('pending', 'active', 'rejected', 'checked_in', 'completed', 'cancelled'),
      allowNull: false,
      defaultValue: 'active',
      field: 'status',
    },
    cancellationReason: {
      type: DataTypes.STRING(250),
      field: 'cancellation_reason',
    },
    rejectionReason: {
      type: DataTypes.STRING(250),
      field: 'rejection_reason',
    },
    createdAt: {
      type: DataTypes.DATE,
      field: 'created_at',
    },
    updatedAt: {
      type: DataTypes.DATE,
      field: 'updated_at',
    },
  }, {
    tableName: 'bookings',
    timestamps: true,
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
  });

  Booking.associate = (models) => {
    Booking.belongsTo(models.Resource, { foreignKey: 'resource_id', as: 'resource' });
    Booking.belongsTo(models.Customer, { foreignKey: 'customer_id', as: 'customer' });
    Booking.belongsTo(models.User, { foreignKey: 'created_by_user_id', as: 'createdBy' });
    Booking.belongsTo(models.EventHallPricingPlan, { foreignKey: 'event_hall_plan_id', as: 'eventHallPlan' });

    Booking.hasMany(models.BookingExtensionRequest, { foreignKey: 'booking_id', as: 'extensionRequests' });
    Booking.hasMany(models.RestaurantAccount, { foreignKey: 'booking_id', as: 'restaurantAccounts' });
    Booking.hasMany(models.Invoice, { foreignKey: 'booking_id', as: 'invoices' });
    Booking.hasMany(models.PaymentReceipt, { foreignKey: 'booking_id', as: 'paymentReceipts' });
  };

  return Booking;
};
