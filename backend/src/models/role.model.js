'use strict';

// Perfiles de acceso del personal interno (administrador, recepcionista,
// mesero). El cliente NO es un rol de esta tabla: es una entidad distinta
// (Customer) porque no ejerce permisos sobre modulos internos.
module.exports = (sequelize, DataTypes) => {
  const Role = sequelize.define('Role', {
    roleId: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      field: 'role_id',
    },
    roleName: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
      field: 'role_name',
    },
    description: {
      type: DataTypes.STRING(200),
      field: 'description',
    },
  }, {
    tableName: 'roles',
    timestamps: false,
  });

  Role.associate = (models) => {
    Role.hasMany(models.User, { foreignKey: 'role_id', as: 'users' });
  };

  return Role;
};
