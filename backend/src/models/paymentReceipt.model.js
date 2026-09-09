'use strict';

// Comprobante de pago declarado por el cliente (ej. SINPE Movil), que
// aun NO constituye un pago reconocido. Es una entidad distinta de
// Payment a proposito: el negocio debe contrastar el comprobante contra
// su estado de cuenta real antes de reconocerlo. Solo cuando este
// registro pasa a 'verified' la capa de servicio crea el Payment
// correspondiente.
module.exports = (sequelize, DataTypes) => {
  const PaymentReceipt = sequelize.define('PaymentReceipt', {
    receiptId: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      field: 'receipt_id',
    },
    invoiceId: {
      type: DataTypes.INTEGER,
      field: 'invoice_id',
    },
    bookingId: {
      type: DataTypes.INTEGER,
      field: 'booking_id',
    },
    customerId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'customer_id',
    },
    declaredMethod: {
      type: DataTypes.ENUM('sinpe_movil', 'transfer'),
      allowNull: false,
      field: 'declared_method',
    },
    referenceNumber: {
      type: DataTypes.STRING(80),
      allowNull: false,
      field: 'reference_number',
    },
    declaredAmount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      field: 'declared_amount',
    },
    // Ruta o identificador del archivo adjuntado por el cliente. El
    // archivo en si no se guarda en la base de datos, solo la referencia.
    receiptFilePath: {
      type: DataTypes.STRING(255),
      field: 'receipt_file_path',
    },
    status: {
      type: DataTypes.ENUM('pending_review', 'verified', 'rejected'),
      allowNull: false,
      defaultValue: 'pending_review',
      field: 'status',
    },
    rejectionReason: {
      type: DataTypes.STRING(250),
      field: 'rejection_reason',
    },
    submittedAt: {
      type: DataTypes.DATE,
      field: 'submitted_at',
    },
    reviewedByUserId: {
      type: DataTypes.INTEGER,
      field: 'reviewed_by_user_id',
    },
    reviewedAt: {
      type: DataTypes.DATE,
      field: 'reviewed_at',
    },
  }, {
    tableName: 'payment_receipts',
    timestamps: false,
  });

  PaymentReceipt.associate = (models) => {
    PaymentReceipt.belongsTo(models.Invoice, { foreignKey: 'invoice_id', as: 'invoice' });
    PaymentReceipt.belongsTo(models.Booking, { foreignKey: 'booking_id', as: 'booking' });
    PaymentReceipt.belongsTo(models.Customer, { foreignKey: 'customer_id', as: 'customer' });
    PaymentReceipt.belongsTo(models.User, { foreignKey: 'reviewed_by_user_id', as: 'reviewedBy' });
    PaymentReceipt.hasMany(models.Payment, { foreignKey: 'receipt_id', as: 'payments' });
  };

  return PaymentReceipt;
};
