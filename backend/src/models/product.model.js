'use strict';

// Catalogo de platillos y bebidas del menu. La eliminacion fisica solo
// procede cuando el producto no tiene ninguna linea en AccountItem; la
// FK de esa tabla lo garantiza a nivel de motor, y la capa de servicio
// debe capturar ese rechazo y ofrecer la desactivacion como alternativa.
module.exports = (sequelize, DataTypes) => {
  const Product = sequelize.define('Product', {
    productId: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      field: 'product_id',
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: 'name',
    },
    category: {
      type: DataTypes.STRING(60),
      field: 'category',
    },
    price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      field: 'price',
    },
    stockQuantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'stock_quantity',
    },
    isAvailable: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'is_available',
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
    tableName: 'products',
    timestamps: true,
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
    indexes: [
      // Un producto no puede repetirse dentro de la misma categoria.
      { unique: true, fields: ['name', 'category'], name: 'uq_product_name_category' },
    ],
  });

  Product.associate = (models) => {
    Product.hasMany(models.AccountItem, { foreignKey: 'product_id', as: 'accountItems' });
  };

  return Product;
};
