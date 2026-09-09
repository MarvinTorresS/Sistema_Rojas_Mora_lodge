'use strict';

// Descuento o promocion aplicable a una o varias areas del negocio.
// Tabla independiente, sin relaciones FK entrantes ni salientes: se
// referencia por su discountId desde InvoiceLine (source_type =
// 'discount', source_id = discountId), no mediante FK formal, porque
// InvoiceLine es polimorfica (puede apuntar a distintos tipos de
// origen).
module.exports = (sequelize, DataTypes) => {
  const Discount = sequelize.define('Discount', {
    discountId: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      field: 'discount_id',
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: 'name',
    },
    discountType: {
      type: DataTypes.ENUM('percentage', 'fixed_amount'),
      allowNull: false,
      field: 'discount_type',
    },
    value: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      field: 'value',
    },
    appliesTo: {
      type: DataTypes.ENUM('cabin', 'event_hall', 'field', 'restaurant', 'all'),
      allowNull: false,
      field: 'applies_to',
    },
    validFrom: {
      type: DataTypes.DATEONLY,
      allowNull: false,
      field: 'valid_from',
    },
    validUntil: {
      type: DataTypes.DATEONLY,
      allowNull: false,
      field: 'valid_until',
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'is_active',
    },
  }, {
    tableName: 'discounts',
    timestamps: false,
  });

  return Discount;
};
