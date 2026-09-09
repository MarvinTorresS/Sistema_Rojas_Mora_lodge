'use strict';

// Mesa fisica del restaurante. Tabla de detalle 1:1 sobre Resource
// (mismo patron que CabinDetail), lo que permite reservar la mesa por el
// canal web y bloquearla reutilizando Booking y ResourceBlock. status
// describe la ocupacion operativa actual; 'inactive' indica que el
// Administrador la retiro de servicio.
module.exports = (sequelize, DataTypes) => {
  const RestaurantTable = sequelize.define('RestaurantTable', {
    tableId: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      field: 'table_id',
    },
    resourceId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      unique: true,
      field: 'resource_id',
    },
    tableNumber: {
      type: DataTypes.STRING(10),
      allowNull: false,
      unique: true,
      field: 'table_number',
    },
    seatCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'seat_count',
    },
    status: {
      type: DataTypes.ENUM('available', 'occupied', 'inactive'),
      allowNull: false,
      defaultValue: 'available',
      field: 'status',
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
    tableName: 'restaurant_tables',
    timestamps: true,
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
  });

  RestaurantTable.associate = (models) => {
    RestaurantTable.belongsTo(models.Resource, { foreignKey: 'resource_id', as: 'resource' });
    RestaurantTable.hasMany(models.RestaurantAccount, { foreignKey: 'table_id', as: 'restaurantAccounts' });
  };

  return RestaurantTable;
};
