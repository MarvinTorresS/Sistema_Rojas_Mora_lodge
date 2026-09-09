'use strict';

// Cuenta abierta sobre una mesa (lo que en el negocio se conoce como
// "la cuenta de la mesa X"). version implementa control de concurrencia
// optimista: se incrementa en cada modificacion de la cuenta o de sus
// lineas, y permite detectar que otro mesero la altero entre la lectura
// y el guardado ("Esta cuenta fue actualizada por otro usuario").
module.exports = (sequelize, DataTypes) => {
  const RestaurantAccount = sequelize.define('RestaurantAccount', {
    accountId: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      field: 'account_id',
    },
    tableId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'table_id',
    },
    bookingId: {
      type: DataTypes.INTEGER,
      field: 'booking_id',
    },
    openedByUserId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'opened_by_user_id',
    },
    customerId: {
      type: DataTypes.INTEGER,
      field: 'customer_id',
    },
    status: {
      type: DataTypes.ENUM('open', 'closed', 'cancelled'),
      allowNull: false,
      defaultValue: 'open',
      field: 'status',
    },
    voidedReason: {
      type: DataTypes.STRING(250),
      field: 'voided_reason',
    },
    openedAt: {
      type: DataTypes.DATE,
      field: 'opened_at',
    },
    closedAt: {
      type: DataTypes.DATE,
      field: 'closed_at',
    },
    version: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
      field: 'version',
    },
  }, {
    tableName: 'restaurant_accounts',
    timestamps: false,
    // Habilita el bloqueo optimista nativo de Sequelize sobre esta
    // columna: en cada UPDATE compara la version leida contra la
    // version actual en BD y lanza OptimisticLockError si difieren.
    version: 'version',
  });

  RestaurantAccount.associate = (models) => {
    RestaurantAccount.belongsTo(models.RestaurantTable, { foreignKey: 'table_id', as: 'table' });
    RestaurantAccount.belongsTo(models.Booking, { foreignKey: 'booking_id', as: 'booking' });
    RestaurantAccount.belongsTo(models.User, { foreignKey: 'opened_by_user_id', as: 'openedBy' });
    RestaurantAccount.belongsTo(models.Customer, { foreignKey: 'customer_id', as: 'customer' });
    RestaurantAccount.hasMany(models.AccountItem, { foreignKey: 'account_id', as: 'items' });
  };

  return RestaurantAccount;
};
