'use strict';

// Sustenta el restablecimiento de contrasena del cliente por enlace de
// correo. El token se guarda como hash, nunca en texto plano: si la base
// de datos se comprometiera, un token en claro permitiria tomar control
// de la cuenta antes de su expiracion.
module.exports = (sequelize, DataTypes) => {
  const PasswordResetToken = sequelize.define('PasswordResetToken', {
    tokenId: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      field: 'token_id',
    },
    customerId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'customer_id',
    },
    tokenHash: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
      field: 'token_hash',
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'expires_at',
    },
    usedAt: {
      type: DataTypes.DATE,
      field: 'used_at',
    },
    createdAt: {
      type: DataTypes.DATE,
      field: 'created_at',
    },
  }, {
    tableName: 'password_reset_tokens',
    timestamps: true,
    createdAt: 'createdAt',
    updatedAt: false,
  });

  PasswordResetToken.associate = (models) => {
    PasswordResetToken.belongsTo(models.Customer, { foreignKey: 'customer_id', as: 'customer' });
  };

  return PasswordResetToken;
};
