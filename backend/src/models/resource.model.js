'use strict';

// Recurso reservable generico: cabana, salon, cancha o mesa de
// restaurante. Las mesas se incorporaron como un cuarto tipo de recurso
// para heredar sin duplicar codigo: la reserva (Booking), la validacion
// de solapamiento de horario y los bloqueos (ResourceBlock) se escriben
// una sola vez y sirven para las cuatro areas.
module.exports = (sequelize, DataTypes) => {
  const Resource = sequelize.define('Resource', {
    resourceId: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      field: 'resource_id',
    },
    resourceType: {
      type: DataTypes.ENUM('cabin', 'event_hall', 'field', 'restaurant_table'),
      allowNull: false,
      field: 'resource_type',
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: 'name',
    },
    description: {
      type: DataTypes.TEXT,
      field: 'description',
    },
    status: {
      type: DataTypes.ENUM('available', 'maintenance', 'inactive'),
      allowNull: false,
      defaultValue: 'available',
      field: 'status',
    },
  }, {
    tableName: 'resources',
    timestamps: false,
  });

  Resource.associate = (models) => {
    Resource.hasOne(models.CabinDetail, { foreignKey: 'resource_id', as: 'cabinDetail' });
    Resource.hasOne(models.RestaurantTable, { foreignKey: 'resource_id', as: 'restaurantTable' });
    Resource.hasMany(models.EventHallPricingPlan, { foreignKey: 'resource_id', as: 'eventHallPricingPlans' });
    Resource.hasMany(models.FieldRate, { foreignKey: 'resource_id', as: 'fieldRates' });
    Resource.hasMany(models.Booking, { foreignKey: 'resource_id', as: 'bookings' });
    Resource.hasMany(models.ResourceBlock, { foreignKey: 'resource_id', as: 'resourceBlocks' });
  };

  return Resource;
};
