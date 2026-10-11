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
    // HU-008/HU-009 (Sprint 2). Columnas agregadas por la
    // migracion 20261008000001. Ambas son opcionales (NULL en los planes
    // anteriores): included_services guarda un arreglo JSON en texto y
    // deposit_percentage el porcentaje de anticipo propio del plan (0-100).
    includedServices: {
      type: DataTypes.TEXT,
      field: 'included_services',
    },
    depositPercentage: {
      type: DataTypes.DECIMAL(5, 2),
      field: 'deposit_percentage',
    },
    // Costo de CADA hora extra de este plan (migracion 20261010000001).
    // NULL = el plan no admite horas extra.
    extraHourPrice: {
      type: DataTypes.DECIMAL(10, 2),
      field: 'extra_hour_price',
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
