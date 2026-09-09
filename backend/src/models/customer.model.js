'use strict';

// El cliente. Modela dos poblaciones en una sola tabla: el cliente con
// cuenta (canal web, tiene email + passwordHash) y el cliente sin cuenta
// (registrado por el personal, passwordHash queda nulo). Se unifican
// porque ambos representan la misma entidad de negocio y comparten
// historial de reservas y facturacion.
module.exports = (sequelize, DataTypes) => {
  const Customer = sequelize.define('Customer', {
    customerId: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      field: 'customer_id',
    },
    fullName: {
      type: DataTypes.STRING(150),
      allowNull: false,
      field: 'full_name',
    },
    identificationNumber: {
      type: DataTypes.STRING(30),
      unique: true,
      field: 'identification_number',
    },
    phone: {
      type: DataTypes.STRING(20),
      field: 'phone',
    },
    email: {
      type: DataTypes.STRING(150),
      unique: true,
      field: 'email',
    },
    // Nulo cuando el cliente no posee cuenta de acceso (lo registro el
    // personal). La capa de servicio exige su presencia al registrarse
    // por el canal web.
    passwordHash: {
      type: DataTypes.STRING(255),
      field: 'password_hash',
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
    tableName: 'customers',
    timestamps: true,
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
  });

  Customer.associate = (models) => {
    Customer.hasMany(models.PasswordResetToken, { foreignKey: 'customer_id', as: 'passwordResetTokens' });
    Customer.hasMany(models.Booking, { foreignKey: 'customer_id', as: 'bookings' });
    Customer.hasMany(models.RestaurantAccount, { foreignKey: 'customer_id', as: 'restaurantAccounts' });
    Customer.hasMany(models.Invoice, { foreignKey: 'customer_id', as: 'invoices' });
    Customer.hasMany(models.PaymentReceipt, { foreignKey: 'customer_id', as: 'paymentReceipts' });
    Customer.hasMany(models.AuditLog, { foreignKey: 'customer_id', as: 'auditLogs' });
  };

  return Customer;
};
