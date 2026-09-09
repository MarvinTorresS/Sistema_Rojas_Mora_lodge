'use strict';

// Linea de detalle de una factura. Es polimorfica a proposito:
// sourceType indica de que modulo viene el monto (cabana, salon,
// cancha, restaurante o descuento) y sourceId apunta al registro de
// ese modulo, pero SIN clave foranea formal, porque cada sourceType
// apunta a una tabla distinta y una FK no puede apuntar
// condicionalmente a varias tablas. La integridad de sourceId la
// garantiza la capa de servicio, no el motor de base de datos.
module.exports = (sequelize, DataTypes) => {
  const InvoiceLine = sequelize.define('InvoiceLine', {
    lineId: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      field: 'line_id',
    },
    invoiceId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'invoice_id',
    },
    sourceType: {
      type: DataTypes.ENUM('cabin', 'event_hall', 'field', 'restaurant', 'discount'),
      allowNull: false,
      field: 'source_type',
    },
    sourceId: {
      type: DataTypes.INTEGER,
      field: 'source_id',
    },
    description: {
      type: DataTypes.STRING(200),
      allowNull: false,
      field: 'description',
    },
    amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      field: 'amount',
    },
  }, {
    tableName: 'invoice_lines',
    timestamps: false,
  });

  InvoiceLine.associate = (models) => {
    InvoiceLine.belongsTo(models.Invoice, { foreignKey: 'invoice_id', as: 'invoice' });
  };

  return InvoiceLine;
};
