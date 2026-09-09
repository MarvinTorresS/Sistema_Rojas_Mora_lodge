'use strict';

// Pago (abono) efectivamente reconocido contra una factura. receiptId
// es nulo para pagos en efectivo o tarjeta recibidos directamente en
// caja, y esta presente cuando el pago proviene de una verificacion
// manual de PaymentReceipt.
module.exports = (sequelize, DataTypes) => {
  const Payment = sequelize.define('Payment', {
    paymentId: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      field: 'payment_id',
    },
    invoiceId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'invoice_id',
    },
    amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      field: 'amount',
    },
    paymentMethod: {
      type: DataTypes.ENUM('cash', 'card', 'transfer', 'sinpe_movil'),
      allowNull: false,
      field: 'payment_method',
    },
    receiptId: {
      type: DataTypes.INTEGER,
      field: 'receipt_id',
    },
    receivedByUserId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'received_by_user_id',
    },
    paidAt: {
      type: DataTypes.DATE,
      field: 'paid_at',
    },
  }, {
    tableName: 'payments',
    timestamps: false,
  });

  Payment.associate = (models) => {
    Payment.belongsTo(models.Invoice, { foreignKey: 'invoice_id', as: 'invoice' });
    Payment.belongsTo(models.PaymentReceipt, { foreignKey: 'receipt_id', as: 'receipt' });
    Payment.belongsTo(models.User, { foreignKey: 'received_by_user_id', as: 'receivedBy' });
  };

  return Payment;
};
