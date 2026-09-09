'use strict';

// Bitacora de auditoria: registra eventos de negocio relevantes (ej.
// 'booking_created', 'invoice_voided'), no cada UPDATE de fila. userId y
// customerId son ambos nulos-posibles porque el evento puede originarlo
// un empleado o un cliente autenticado; la capa de servicio garantiza
// que exactamente uno de los dos este presente en cada registro.
module.exports = (sequelize, DataTypes) => {
  const AuditLog = sequelize.define('AuditLog', {
    auditId: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      field: 'audit_id',
    },
    userId: {
      type: DataTypes.INTEGER,
      field: 'user_id',
    },
    customerId: {
      type: DataTypes.INTEGER,
      field: 'customer_id',
    },
    action: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: 'action',
    },
    entityType: {
      type: DataTypes.STRING(50),
      allowNull: false,
      field: 'entity_type',
    },
    entityId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'entity_id',
    },
    details: {
      type: DataTypes.TEXT,
      field: 'details',
    },
    createdAt: {
      type: DataTypes.DATE,
      field: 'created_at',
    },
  }, {
    tableName: 'audit_log',
    timestamps: true,
    createdAt: 'createdAt',
    updatedAt: false,
  });

  AuditLog.associate = (models) => {
    AuditLog.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
    AuditLog.belongsTo(models.Customer, { foreignKey: 'customer_id', as: 'customer' });
  };

  return AuditLog;
};
