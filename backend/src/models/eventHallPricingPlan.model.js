'use strict';

// Plan de precios del salon de eventos (ej. "medio dia", "dia completo").
// Una reserva de salon se hace siempre bajo un plan concreto.
module.exports = (sequelize, DataTypes) => {
  const EventHallPricingPlan = sequelize.define('EventHallPricingPlan', {
    planId: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      field: 'plan_id',
    },
    resourceId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'resource_id',
    },
    planName: {
      type: DataTypes.STRING(50),
      allowNull: false,
      field: 'plan_name',
    },
    hours: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'hours',
    },
    price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      field: 'price',
    },
  }, {
    tableName: 'event_hall_pricing_plans',
    timestamps: false,
  });

  EventHallPricingPlan.associate = (models) => {
    EventHallPricingPlan.belongsTo(models.Resource, { foreignKey: 'resource_id', as: 'resource' });
    EventHallPricingPlan.hasMany(models.Booking, { foreignKey: 'event_hall_plan_id', as: 'bookings' });
  };

  return EventHallPricingPlan;
};
