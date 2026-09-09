'use strict';

// Linea de una cuenta de restaurante (un producto pedido, con su
// cantidad). kitchenStatus rastrea la preparacion en cocina: una linea
// solo puede eliminarse mientras sigue en 'pending'; una vez enviada a
// cocina el sistema debe impedir su eliminacion fisica y usar baja
// logica (isRemoved) en su lugar, con trazabilidad de quien y cuando.
module.exports = (sequelize, DataTypes) => {
  const AccountItem = sequelize.define('AccountItem', {
    itemId: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      field: 'item_id',
    },
    accountId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'account_id',
    },
    productId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'product_id',
    },
    quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'quantity',
    },
    unitPrice: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      field: 'unit_price',
    },
    kitchenStatus: {
      type: DataTypes.ENUM('pending', 'sent', 'preparing', 'served'),
      allowNull: false,
      defaultValue: 'pending',
      field: 'kitchen_status',
    },
    sentToKitchenAt: {
      type: DataTypes.DATE,
      field: 'sent_to_kitchen_at',
    },
    isRemoved: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'is_removed',
    },
    removedReason: {
      type: DataTypes.STRING(200),
      field: 'removed_reason',
    },
    removedAt: {
      type: DataTypes.DATE,
      field: 'removed_at',
    },
    removedByUserId: {
      type: DataTypes.INTEGER,
      field: 'removed_by_user_id',
    },
    createdAt: {
      type: DataTypes.DATE,
      field: 'created_at',
    },
  }, {
    tableName: 'account_items',
    timestamps: true,
    createdAt: 'createdAt',
    updatedAt: false,
  });

  AccountItem.associate = (models) => {
    AccountItem.belongsTo(models.RestaurantAccount, { foreignKey: 'account_id', as: 'account' });
    AccountItem.belongsTo(models.Product, { foreignKey: 'product_id', as: 'product' });
    AccountItem.belongsTo(models.User, { foreignKey: 'removed_by_user_id', as: 'removedBy' });
  };

  return AccountItem;
};
