'use strict';

// Tarifa por hora de la cancha, vigente desde una fecha determinada.
// Permite conservar el historico de tarifas en vez de sobrescribir el
// precio anterior.
module.exports = (sequelize, DataTypes) => {
  const FieldRate = sequelize.define('FieldRate', {
    rateId: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      field: 'rate_id',
    },
    resourceId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'resource_id',
    },
    pricePerHour: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      field: 'price_per_hour',
    },
    effectiveFrom: {
      type: DataTypes.DATEONLY,
      allowNull: false,
      field: 'effective_from',
    },
  }, {
    tableName: 'field_rate',
    timestamps: false,
  });

  FieldRate.associate = (models) => {
    FieldRate.belongsTo(models.Resource, { foreignKey: 'resource_id', as: 'resource' });
  };

  return FieldRate;
};
