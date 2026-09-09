'use strict';

// Bloqueo temporal de un recurso (mantenimiento u otro motivo). Como
// 'restaurant_table' es un tipo de recurso mas, esta misma tabla sirve
// tambien para bloquear horarios de mesa, sin necesitar tabla propia.
module.exports = (sequelize, DataTypes) => {
  const ResourceBlock = sequelize.define('ResourceBlock', {
    blockId: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      field: 'block_id',
    },
    resourceId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'resource_id',
    },
    startDatetime: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'start_datetime',
    },
    endDatetime: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'end_datetime',
    },
    reason: {
      type: DataTypes.STRING(250),
      allowNull: false,
      field: 'reason',
    },
    // Permite activar/desactivar un bloqueo sin borrarlo, conservando el
    // registro para consulta posterior. Solo is_active = true impide
    // registrar reservas sobre ese rango.
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'is_active',
    },
    createdByUserId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'created_by_user_id',
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
    tableName: 'resource_blocks',
    timestamps: true,
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
  });

  ResourceBlock.associate = (models) => {
    ResourceBlock.belongsTo(models.Resource, { foreignKey: 'resource_id', as: 'resource' });
    ResourceBlock.belongsTo(models.User, { foreignKey: 'created_by_user_id', as: 'createdBy' });
  };

  return ResourceBlock;
};
