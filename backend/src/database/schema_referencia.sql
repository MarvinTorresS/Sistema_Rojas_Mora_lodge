-- ============================================================
-- Base de datos: rojas_mora_lodge
-- Sistema de Gestion Integral de Reservas, Pedidos y Facturacion
-- Rojas Mora Sports & Lodge
-- Version: 4.1
--
-- CAMBIOS DE LA VERSION 4.1 (correccion del Avance 1)
-- ------------------------------------------------------------
--   1. account_items.kitchen_status y sent_to_kitchen_at: estado de
--      preparacion de cada linea en cocina, exigido por HU-027 esc.2.
--   2. account_items.is_removed, removed_at y removed_by_user_id:
--      trazabilidad completa del retiro de una linea. La version 4.0
--      solo guardaba removed_reason, sin indicar si la linea estaba
--      retirada, cuando ni por quien.
--   3. restaurant_accounts.version: control de concurrencia optimista
--      para detectar edicion simultanea (HU-026 esc.2, HU-027 esc.3).
--   4. Se documenta la decision de NO crear las entidades orders y
--      order_items: ninguna historia de usuario trata la comanda como
--      unidad independiente (ver seccion 2.6 del Diccionario de Datos).
--
-- CAMBIOS PRINCIPALES RESPECTO DE LA VERSION 3.0
-- ------------------------------------------------------------
-- La version 3.0 se construyo sobre la premisa de que el cliente
-- NO poseia cuenta de usuario y se identificaba mediante un token
-- de un solo proposito por reserva (access_token). Las historias
-- de usuario HU-30, HU-31, HU-32 y HU-33, validadas con el
-- representante de la empresa, revierten esa decision: el cliente
-- ahora crea una cuenta con contrasena, inicia sesion, y el
-- sistema lo redirige segun su rol. Esta version incorpora dicho
-- cambio y sus consecuencias en cascada.
--
-- Resumen de cambios:
--   1. customers pasa a ser una entidad con credenciales de acceso
--      (password_hash, is_active) y se agrega password_reset_tokens
--      para el flujo de recuperacion de contrasena (HU-30 a HU-32).
--   2. Las mesas del restaurante pasan a ser recursos reservables:
--      se agrega 'restaurant_table' a resources.resource_type y
--      restaurant_tables se vincula a resources como tabla de
--      detalle. Con esto las mesas heredan bookings, la validacion
--      de solapamiento y resource_blocks, sin duplicar logica
--      (HU-46 a HU-49, HU-52, HU-67 a HU-70).
--   3. resource_blocks incorpora is_active para permitir activar o
--      desactivar un bloqueo sin eliminarlo (HU-57, 61, 65, 69).
--   4. Se incorpora el metodo de pago SINPE Movil y la tabla
--      payment_receipts para la verificacion manual de comprobantes
--      contra el estado de cuenta del negocio (HU-53, HU-54).
--   5. Se incorpora booking_extension_requests para la solicitud de
--      extension de hospedaje (HU-89).
--   6. audit_log admite ahora que el autor del evento sea un cliente
--      autenticado y no unicamente un usuario interno.
--   7. restaurant_tables.status admite 'inactive' (HU-74) y
--      customers admite desactivacion (HU-77).
--
-- REGLA DE BAJA FISICA CONDICIONADA (HU-73, HU-81)
-- ------------------------------------------------------------
-- El principio de baja logica se mantiene sin excepcion para toda
-- entidad con relevancia contable o historica: reservas, cuentas,
-- facturas y usuarios. Para catalogos operativos (mesas y
-- productos) se admite la eliminacion fisica UNICAMENTE cuando el
-- registro no posee ningun registro asociado. Las claves foraneas
-- declaradas en account_items y restaurant_accounts garantizan a
-- nivel de motor que un producto ya consumido o una mesa ya
-- utilizada no puedan eliminarse; la capa de servicio debe capturar
-- ese rechazo y ofrecer la desactivacion como alternativa.
-- ============================================================

CREATE DATABASE IF NOT EXISTS rojas_mora_lodge
CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE rojas_mora_lodge;

-- ------------------------------------------------------------
-- Modulo: Administracion de usuarios internos
-- ------------------------------------------------------------

-- Tabla: roles
-- Define los perfiles de acceso del personal interno del sistema.
-- El rol Cliente NO se modela aqui: el cliente es una entidad
-- distinta (customers) porque no ejerce permisos sobre modulos
-- internos, sino unicamente sobre sus propias reservas.
CREATE TABLE roles (
    role_id INT AUTO_INCREMENT PRIMARY KEY,
    role_name VARCHAR(50) NOT NULL UNIQUE,
    description VARCHAR(200)
);

-- Tabla: users
-- Personal interno con acceso al sistema (administrador, recepcionista, mesero)
CREATE TABLE users (
    user_id INT AUTO_INCREMENT PRIMARY KEY,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    phone VARCHAR(20),
    password_hash VARCHAR(255) NOT NULL,
    role_id INT NOT NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (role_id) REFERENCES roles(role_id)
);

-- ------------------------------------------------------------
-- Modulo: Clientes
--
-- CAMBIO v4.0: el cliente pasa a ser un actor autenticado.
-- Existen dos poblaciones dentro de esta misma tabla:
--   - Cliente con cuenta (canal web): posee email y password_hash.
--     Se registra el mismo (HU-30) e inicia sesion (HU-31).
--   - Cliente sin cuenta (canal staff): el personal lo registra al
--     tomar una reserva telefonica o presencial. password_hash queda
--     nulo y no puede iniciar sesion.
-- Se modelan en una sola tabla porque ambos representan la misma
-- entidad de negocio (una persona que consume un servicio) y deben
-- compartir historial de reservas y facturacion. Distinguirlos en
-- dos tablas obligaria a duplicar toda relacion que apunte a un
-- cliente.
-- ------------------------------------------------------------

CREATE TABLE customers (
    customer_id INT AUTO_INCREMENT PRIMARY KEY,
    full_name VARCHAR(150) NOT NULL,
    identification_number VARCHAR(30) UNIQUE,
    phone VARCHAR(20),

    -- Unico e indispensable para el cliente con cuenta; puede ser
    -- nulo para el cliente registrado por el personal.
    email VARCHAR(150) UNIQUE,

    -- (Nuevo v4.0) Nulo cuando el cliente no posee cuenta de acceso.
    -- La capa de servicio exige su presencia al registrarse por el
    -- canal web (HU-30) y rechaza el inicio de sesion cuando es nulo.
    password_hash VARCHAR(255) NULL,

    -- (Nuevo v4.0) Permite al Administrador desactivar la cuenta de
    -- un cliente sin eliminar su historial de reservas (HU-77).
    is_active TINYINT(1) NOT NULL DEFAULT 1,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Tabla: password_reset_tokens (nueva en v4.0)
-- Sustenta el restablecimiento de contrasena mediante enlace
-- enviado al correo del cliente (HU-32).
-- El token se almacena cifrado (hash), nunca en texto plano: si la
-- base de datos se viera comprometida, un token en claro permitiria
-- tomar control de la cuenta antes de su expiracion.
CREATE TABLE password_reset_tokens (
    token_id INT AUTO_INCREMENT PRIMARY KEY,
    customer_id INT NOT NULL,
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    expires_at DATETIME NOT NULL,
    used_at DATETIME NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(customer_id),
    INDEX idx_reset_customer (customer_id, expires_at)
);

-- ------------------------------------------------------------
-- Modulo: Espacios reservables
--
-- CAMBIO v4.0: las mesas del restaurante se incorporan como un
-- cuarto tipo de recurso reservable. Esto permite que hereden sin
-- duplicacion de codigo: la tabla bookings, la validacion de
-- solapamiento de horario, la tabla resource_blocks y el flujo de
-- aprobacion del canal web. La alternativa (tablas table_bookings
-- y table_blocks independientes) habria replicado esa misma logica
-- en un segundo lugar, violando el principio de no repetir codigo.
-- ------------------------------------------------------------

CREATE TABLE resources (
    resource_id INT AUTO_INCREMENT PRIMARY KEY,
    resource_type ENUM('cabin', 'event_hall', 'field', 'restaurant_table') NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    status ENUM('available', 'maintenance', 'inactive') NOT NULL DEFAULT 'available'
);

-- Tabla: cabin_details
CREATE TABLE cabin_details (
    resource_id INT PRIMARY KEY,
    capacity INT NOT NULL,
    price_per_night DECIMAL(10,2) NOT NULL,
    FOREIGN KEY (resource_id) REFERENCES resources(resource_id)
);

-- Tabla: event_hall_pricing_plans
CREATE TABLE event_hall_pricing_plans (
    plan_id INT AUTO_INCREMENT PRIMARY KEY,
    resource_id INT NOT NULL,
    plan_name VARCHAR(50) NOT NULL,
    hours INT NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    FOREIGN KEY (resource_id) REFERENCES resources(resource_id)
);

-- Tabla: field_rate
CREATE TABLE field_rate (
    rate_id INT AUTO_INCREMENT PRIMARY KEY,
    resource_id INT NOT NULL,
    price_per_hour DECIMAL(10,2) NOT NULL,
    effective_from DATE NOT NULL,
    FOREIGN KEY (resource_id) REFERENCES resources(resource_id)
);

-- Tabla: bookings
-- Reserva de cualquier recurso: cabana, salon, cancha o mesa.
--
-- Canales de origen:
--   - 'staff': el personal la registra. Nace en estado 'active'.
--   - 'web': el cliente autenticado la registra desde su cuenta.
--     Nace en 'pending' y requiere aprobacion del personal (CU-13),
--     dado que el pago no se confirma en linea de forma automatica.
--
-- CAMBIO v4.0: la identificacion del cliente en el canal web ya no
-- depende de access_token sino de la sesion autenticada. El campo
-- access_token se conserva unicamente como mecanismo de consulta
-- para reservas creadas por el personal a nombre de un cliente que
-- no posee cuenta; deja de ser el mecanismo principal de
-- autoservicio.
CREATE TABLE bookings (
    booking_id INT AUTO_INCREMENT PRIMARY KEY,
    resource_id INT NOT NULL,
    customer_id INT NOT NULL,

    -- Nulo cuando origin_channel = 'web': la reserva la creo el
    -- propio cliente desde su cuenta, ningun empleado la registro.
    created_by_user_id INT NULL,

    origin_channel ENUM('staff', 'web') NOT NULL DEFAULT 'staff',

    -- Token opcional de consulta para reservas de clientes sin
    -- cuenta registrados por el personal. Ya no sustenta el
    -- autoservicio del cliente autenticado.
    access_token VARCHAR(64) NULL UNIQUE,

    start_datetime DATETIME NOT NULL,
    end_datetime DATETIME NOT NULL,

    -- Cantidad de personas. Para una reserva de mesa corresponde a
    -- la cantidad de comensales (HU-46, HU-48).
    party_size INT,

    event_hall_plan_id INT,

    status ENUM(
        'pending',
        'active',
        'rejected',
        'checked_in',
        'completed',
        'cancelled'
    ) NOT NULL DEFAULT 'active',

    cancellation_reason VARCHAR(250),
    rejection_reason VARCHAR(250),

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    FOREIGN KEY (resource_id) REFERENCES resources(resource_id),
    FOREIGN KEY (customer_id) REFERENCES customers(customer_id),
    FOREIGN KEY (created_by_user_id) REFERENCES users(user_id),
    FOREIGN KEY (event_hall_plan_id) REFERENCES event_hall_pricing_plans(plan_id),
    INDEX idx_bookings_resource_range (resource_id, start_datetime, end_datetime),
    INDEX idx_bookings_customer (customer_id, status)
);

-- Tabla: booking_extension_requests (nueva en v4.0)
-- Solicitud de extension de la estadia de un huesped ya hospedado
-- (HU-89). Se modela como entidad propia y no como una simple
-- modificacion de bookings.end_datetime porque la extension tiene
-- atributos y ciclo de vida propios: quien la solicita, quien la
-- resuelve, y el motivo del rechazo. Ademas debe validarse contra
-- la disponibilidad de la cabana en el periodo adicional, que puede
-- estar comprometida por otra reserva.
CREATE TABLE booking_extension_requests (
    extension_id INT AUTO_INCREMENT PRIMARY KEY,
    booking_id INT NOT NULL,
    requested_end_datetime DATETIME NOT NULL,
    status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
    request_notes VARCHAR(250),
    rejection_reason VARCHAR(250),
    requested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    resolved_by_user_id INT NULL,
    resolved_at DATETIME NULL,
    FOREIGN KEY (booking_id) REFERENCES bookings(booking_id),
    FOREIGN KEY (resolved_by_user_id) REFERENCES users(user_id)
);

-- Tabla: resource_blocks
-- Bloqueo temporal de un recurso por mantenimiento u otro motivo.
-- Al haberse incorporado 'restaurant_table' como tipo de recurso,
-- esta misma tabla sustenta tambien los bloqueos de horario de mesa
-- (HU-67 a HU-70) sin necesidad de una tabla adicional.
CREATE TABLE resource_blocks (
    block_id INT AUTO_INCREMENT PRIMARY KEY,
    resource_id INT NOT NULL,
    start_datetime DATETIME NOT NULL,
    end_datetime DATETIME NOT NULL,
    reason VARCHAR(250) NOT NULL,

    -- (Nuevo v4.0) Permite activar o desactivar un bloqueo sin
    -- eliminarlo, conservando el registro para consulta posterior
    -- (HU-57, HU-61, HU-65, HU-69). Solo los bloqueos con
    -- is_active = 1 impiden registrar reservas.
    is_active TINYINT(1) NOT NULL DEFAULT 1,

    created_by_user_id INT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (resource_id) REFERENCES resources(resource_id),
    FOREIGN KEY (created_by_user_id) REFERENCES users(user_id),
    INDEX idx_blocks_resource_range (resource_id, start_datetime, end_datetime, is_active)
);

-- ------------------------------------------------------------
-- Modulo: Restaurante
-- ------------------------------------------------------------

-- Tabla: restaurant_tables
-- Mesas fisicas del restaurante.
--
-- CAMBIO v4.0: cada mesa se vincula a un registro de resources
-- mediante resource_id, siguiendo el mismo patron de tabla de
-- detalle que cabin_details. Esto permite reservar la mesa por el
-- canal web y bloquear sus horarios reutilizando bookings y
-- resource_blocks.
--
-- El campo status describe la ocupacion operativa en el momento
-- actual (si hay o no una cuenta abierta sobre la mesa), mientras
-- que 'inactive' indica que la mesa fue retirada de servicio por el
-- Administrador (HU-74) y no debe ofrecerse ni para asignacion ni
-- para reserva.
CREATE TABLE restaurant_tables (
    table_id INT AUTO_INCREMENT PRIMARY KEY,
    resource_id INT NOT NULL UNIQUE,
    table_number VARCHAR(10) NOT NULL UNIQUE,
    seat_count INT NOT NULL,
    status ENUM('available', 'occupied', 'inactive') NOT NULL DEFAULT 'available',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (resource_id) REFERENCES resources(resource_id)
);

-- Tabla: products
-- Catalogo de platillos y bebidas del menu.
-- La eliminacion fisica solo procede cuando el producto no posee
-- ninguna linea en account_items; la clave foranea de esa tabla lo
-- garantiza a nivel de motor (HU-81).
CREATE TABLE products (
    product_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    category VARCHAR(60),
    price DECIMAL(10,2) NOT NULL,

    -- Existencias del producto, registradas al crearlo y ajustadas
    -- al editarlo (HU-78, HU-80).
    stock_quantity INT NOT NULL DEFAULT 0,

    is_available TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    -- Un producto no puede repetirse dentro de la misma categoria
    -- (escenario 2 de HU-78).
    UNIQUE KEY uq_product_name_category (name, category)
);

-- Tabla: restaurant_accounts
CREATE TABLE restaurant_accounts (
    account_id INT AUTO_INCREMENT PRIMARY KEY,
    table_id INT NOT NULL,
    booking_id INT NULL,
    opened_by_user_id INT NOT NULL,
    customer_id INT NULL,
    status ENUM('open', 'closed', 'cancelled') NOT NULL DEFAULT 'open',
    voided_reason VARCHAR(250) NULL,
    opened_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    closed_at DATETIME NULL,
    -- Control de concurrencia optimista (HU-026 esc.2, HU-027 esc.3).
    -- Se incrementa en cada modificacion de la cuenta o de sus lineas;
    -- permite detectar que otro mesero altero la cuenta entre la lectura
    -- y el guardado, y responder "Esta cuenta fue actualizada por otro usuario".
    version INT NOT NULL DEFAULT 1,
    FOREIGN KEY (table_id) REFERENCES restaurant_tables(table_id),
    FOREIGN KEY (booking_id) REFERENCES bookings(booking_id),
    FOREIGN KEY (opened_by_user_id) REFERENCES users(user_id),
    FOREIGN KEY (customer_id) REFERENCES customers(customer_id)
);

-- Tabla: account_items
CREATE TABLE account_items (
    item_id INT AUTO_INCREMENT PRIMARY KEY,
    account_id INT NOT NULL,
    product_id INT NOT NULL,
    quantity INT NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    -- Estado de preparacion de la linea en cocina (HU-027).
    -- Una linea solo puede eliminarse mientras siga en 'pending';
    -- una vez enviada a cocina el sistema debe impedir su eliminacion.
    kitchen_status ENUM('pending','sent','preparing','served') NOT NULL DEFAULT 'pending',
    sent_to_kitchen_at DATETIME NULL,
    -- Trazabilidad explicita del retiro de la linea (baja logica).
    -- is_removed indica el estado; removed_reason, removed_at y
    -- removed_by_user_id documentan el motivo, el momento y el responsable.
    is_removed TINYINT(1) NOT NULL DEFAULT 0,
    removed_reason VARCHAR(200) NULL,
    removed_at DATETIME NULL,
    removed_by_user_id INT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (account_id) REFERENCES restaurant_accounts(account_id),
    FOREIGN KEY (product_id) REFERENCES products(product_id),
    FOREIGN KEY (removed_by_user_id) REFERENCES users(user_id),
    INDEX idx_items_account_state (account_id, is_removed),
    INDEX idx_items_kitchen (kitchen_status, sent_to_kitchen_at)
);

-- ------------------------------------------------------------
-- Modulo: Descuentos y promociones
-- ------------------------------------------------------------

CREATE TABLE discounts (
    discount_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    discount_type ENUM('percentage', 'fixed_amount') NOT NULL,
    value DECIMAL(10,2) NOT NULL,
    applies_to ENUM('cabin', 'event_hall', 'field', 'restaurant', 'all') NOT NULL,
    valid_from DATE NOT NULL,
    valid_until DATE NOT NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1
);

-- ------------------------------------------------------------
-- Modulo: Facturacion y pagos
-- ------------------------------------------------------------

CREATE TABLE invoices (
    invoice_id INT AUTO_INCREMENT PRIMARY KEY,
    customer_id INT NOT NULL,
    booking_id INT NULL,
    subtotal DECIMAL(10,2) NOT NULL,
    discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    tax_amount DECIMAL(10,2) NOT NULL,
    total DECIMAL(10,2) NOT NULL,
    status ENUM('pending', 'paid', 'voided') NOT NULL DEFAULT 'pending',
    issued_by_user_id INT NOT NULL,
    issued_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    voided_reason VARCHAR(250) NULL,
    FOREIGN KEY (customer_id) REFERENCES customers(customer_id),
    FOREIGN KEY (booking_id) REFERENCES bookings(booking_id),
    FOREIGN KEY (issued_by_user_id) REFERENCES users(user_id)
);

CREATE TABLE invoice_lines (
    line_id INT AUTO_INCREMENT PRIMARY KEY,
    invoice_id INT NOT NULL,
    source_type ENUM('cabin', 'event_hall', 'field', 'restaurant', 'discount') NOT NULL,
    source_id INT NULL,
    description VARCHAR(200) NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    FOREIGN KEY (invoice_id) REFERENCES invoices(invoice_id)
);

-- Tabla: payment_receipts (nueva en v4.0)
-- Comprobante de pago aportado por el cliente que aun no constituye
-- un pago registrado.
--
-- Justificacion del diseno: un pago por SINPE Movil no puede darse
-- por recibido en el momento en que el cliente lo declara. El
-- negocio debe contrastar el comprobante contra su estado de cuenta
-- real antes de reconocerlo (HU-54). Por eso el comprobante y el
-- pago son entidades distintas: payment_receipts modela una
-- declaracion pendiente de verificacion, y payments modela dinero
-- efectivamente reconocido por el negocio. Solo cuando un
-- comprobante pasa a 'verified' la capa de servicio crea el
-- registro correspondiente en payments.
CREATE TABLE payment_receipts (
    receipt_id INT AUTO_INCREMENT PRIMARY KEY,
    invoice_id INT NULL,
    booking_id INT NULL,
    customer_id INT NOT NULL,

    declared_method ENUM('sinpe_movil', 'transfer') NOT NULL,

    -- Numero de referencia o comprobante que el cliente reporta.
    reference_number VARCHAR(80) NOT NULL,
    declared_amount DECIMAL(10,2) NOT NULL,

    -- Ruta o identificador del archivo de comprobante adjuntado por
    -- el cliente. El archivo no se almacena en la base de datos.
    receipt_file_path VARCHAR(255) NULL,

    status ENUM('pending_review', 'verified', 'rejected') NOT NULL DEFAULT 'pending_review',
    rejection_reason VARCHAR(250) NULL,

    submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    reviewed_by_user_id INT NULL,
    reviewed_at DATETIME NULL,

    FOREIGN KEY (invoice_id) REFERENCES invoices(invoice_id),
    FOREIGN KEY (booking_id) REFERENCES bookings(booking_id),
    FOREIGN KEY (customer_id) REFERENCES customers(customer_id),
    FOREIGN KEY (reviewed_by_user_id) REFERENCES users(user_id),
    INDEX idx_receipts_status (status, submitted_at)
);

-- Tabla: payments
-- Registra uno o mas pagos (abonos) efectivamente reconocidos
-- contra una factura.
CREATE TABLE payments (
    payment_id INT AUTO_INCREMENT PRIMARY KEY,
    invoice_id INT NOT NULL,
    amount DECIMAL(10,2) NOT NULL,

    -- (Ampliado v4.0) Se incorpora SINPE Movil como metodo de pago
    -- explicito (HU-53).
    payment_method ENUM('cash', 'card', 'transfer', 'sinpe_movil') NOT NULL,

    -- (Nuevo v4.0) Comprobante que dio origen a este pago, cuando
    -- provino de una verificacion manual. Nulo para pagos en
    -- efectivo o tarjeta recibidos directamente en caja.
    receipt_id INT NULL,

    received_by_user_id INT NOT NULL,
    paid_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (invoice_id) REFERENCES invoices(invoice_id),
    FOREIGN KEY (receipt_id) REFERENCES payment_receipts(receipt_id),
    FOREIGN KEY (received_by_user_id) REFERENCES users(user_id)
);

-- ------------------------------------------------------------
-- Modulo: Auditoria
-- ------------------------------------------------------------

-- Tabla: audit_log
-- Registra eventos de negocio relevantes, no cada UPDATE de fila.
--
-- CAMBIO v4.0: al pasar el cliente a ser un actor autenticado,
-- determinados eventos (creacion o cancelacion de una reserva desde
-- el canal web) los origina un cliente y no un usuario interno. Por
-- ello user_id admite nulo y se incorpora customer_id. La capa de
-- servicio garantiza que exactamente uno de los dos este presente
-- en cada registro.
--
-- Ejemplos de action: 'booking_created', 'booking_approved',
-- 'booking_rejected', 'booking_cancelled', 'account_closed',
-- 'account_voided', 'invoice_voided', 'user_deactivated',
-- 'receipt_verified', 'receipt_rejected', 'block_created',
-- 'extension_approved'.
CREATE TABLE audit_log (
    audit_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NULL,
    customer_id INT NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id INT NOT NULL,
    details TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id),
    FOREIGN KEY (customer_id) REFERENCES customers(customer_id),
    INDEX idx_audit_entity (entity_type, entity_id),
    INDEX idx_audit_created (created_at)
);
