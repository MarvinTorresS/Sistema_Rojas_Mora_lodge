'use strict';

// Factura emitida a un cliente. bookingId es opcional porque una
// factura puede originarse solo de consumo de restaurante, sin reserva
// de por medio.
module.exports = (sequelize, DataTypes) => {
  const Invoice = sequelize.define('Invoice', {
    invoiceId: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      field: 'invoice_id',
    },
    customerId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'customer_id',
    },
    bookingId: {
      type: DataTypes.INTEGER,
      field: 'booking_id',
    },
    subtotal: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      field: 'subtotal',
    },
    discountAmount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
      field: 'discount_amount',
    },
    taxAmount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      field: 'tax_amount',
    },
    total: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      field: 'total',
    },
    status: {
      type: DataTypes.ENUM('pending', 'paid', 'voided'),
      allowNull: false,
      defaultValue: 'pending',
      field: 'status',
    },
    issuedByUserId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'issued_by_user_id',
    },
    issuedAt: {
      type: DataTypes.DATE,
      field: 'issued_at',
    },
    voidedReason: {
      type: DataTypes.STRING(250),
      field: 'voided_reason',
    },
  }, {
    tableName: 'invoices',
    timestamps: false,
  });

  Invoice.associate = (models) => {
    Invoice.belongsTo(models.Customer, { foreignKey: 'customer_id', as: 'customer' });
    Invoice.belongsTo(models.Booking, { foreignKey: 'booking_id', as: 'booking' });
    Invoice.belongsTo(models.User, { foreignKey: 'issued_by_user_id', as: 'issuedBy' });
    Invoice.hasMany(models.InvoiceLine, { foreignKey: 'invoice_id', as: 'lines' });
    Invoice.hasMany(models.PaymentReceipt, { foreignKey: 'invoice_id', as: 'paymentReceipts' });
    Invoice.hasMany(models.Payment, { foreignKey: 'invoice_id', as: 'payments' });
  };

  return Invoice;
};
