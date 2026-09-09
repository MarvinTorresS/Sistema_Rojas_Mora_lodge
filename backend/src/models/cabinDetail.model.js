'use strict';

// Datos propios de una cabana. Tabla de detalle 1:1 sobre Resource: la
// clave primaria de esta tabla ES la clave foranea hacia resources
// (mismo patron que RestaurantTable).
module.exports = (sequelize, DataTypes) => {
  const CabinDetail = sequelize.define('CabinDetail', {
    resourceId: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      field: 'resource_id',
    },
    capacity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'capacity',
    },
    pricePerNight: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      field: 'price_per_night',
    },
  }, {
    tableName: 'cabin_details',
    timestamps: false,
  });

  CabinDetail.associate = (models) => {
    CabinDetail.belongsTo(models.Resource, { foreignKey: 'resource_id', as: 'resource' });
  };

  return CabinDetail;
};
