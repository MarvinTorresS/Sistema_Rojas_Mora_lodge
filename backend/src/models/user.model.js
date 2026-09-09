'use strict';

// Personal interno con acceso al sistema (administrador, recepcionista,
// mesero). Distinto de Customer: este modelo representa a quien opera
// el sistema, no a quien consume el servicio.
module.exports = (sequelize, DataTypes) => {
  const User = sequelize.define('User', {
    userId: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      field: 'user_id',
    },
    fullName: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: 'full_name',
    },
    email: {
      type: DataTypes.STRING(150),
      allowNull: false,
      unique: true,
      field: 'email',
    },
    phone: {
      type: DataTypes.STRING(20),
      field: 'phone',
    },
    passwordHash: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'password_hash',
    },
    roleId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'role_id',
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'is_active',
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
    tableName: 'users',
    timestamps: true,
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
  });

  User.associate = (models) => {
    User.belongsTo(models.Role, { foreignKey: 'role_id', as: 'role' });

    // Un usuario interno puede aparecer en muchas relaciones distintas de
    // "quien hizo esto"; cada una necesita su propio alias porque todas
    // apuntan a la misma tabla (users).
    User.hasMany(models.Booking, { foreignKey: 'created_by_user_id', as: 'bookingsCreated' });
    User.hasMany(models.BookingExtensionRequest, { foreignKey: 'resolved_by_user_id', as: 'extensionsResolved' });
    User.hasMany(models.ResourceBlock, { foreignKey: 'created_by_user_id', as: 'resourceBlocksCreated' });
    User.hasMany(models.RestaurantAccount, { foreignKey: 'opened_by_user_id', as: 'accountsOpened' });
    User.hasMany(models.AccountItem, { foreignKey: 'removed_by_user_id', as: 'accountItemsRemoved' });
    User.hasMany(models.Invoice, { foreignKey: 'issued_by_user_id', as: 'invoicesIssued' });
    User.hasMany(models.PaymentReceipt, { foreignKey: 'reviewed_by_user_id', as: 'receiptsReviewed' });
    User.hasMany(models.Payment, { foreignKey: 'received_by_user_id', as: 'paymentsReceived' });
    User.hasMany(models.AuditLog, { foreignKey: 'user_id', as: 'auditLogs' });
  };

  return User;
};
