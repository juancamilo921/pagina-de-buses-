-- Transporte Conexión
-- Esquema MySQL 8.0+ separado de la aplicación.
-- No elimina bases de datos ni tablas existentes.

CREATE DATABASE IF NOT EXISTS transporte_conexion
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;

USE transporte_conexion;

CREATE TABLE IF NOT EXISTS roles (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_roles_name UNIQUE (name)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS permissions (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(80) NOT NULL,
  description VARCHAR(200) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_permissions_code UNIQUE (code)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id INT UNSIGNED NOT NULL,
  permission_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (role_id, permission_id),
  CONSTRAINT fk_role_permissions_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  CONSTRAINT fk_role_permissions_permission FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  role_id INT UNSIGNED NOT NULL,
  email VARCHAR(120) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  first_name VARCHAR(50) NOT NULL,
  last_name VARCHAR(50) NOT NULL,
  phone_number VARCHAR(20) NOT NULL,
  document_type VARCHAR(20) NOT NULL,
  document_number VARCHAR(50) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  last_login_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_users_email UNIQUE (email),
  CONSTRAINT uq_users_document UNIQUE (document_number),
  CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS clients (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  preference_note VARCHAR(250) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_clients_user UNIQUE (user_id),
  CONSTRAINT fk_clients_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS drivers (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  license_number VARCHAR(50) NOT NULL,
  license_type VARCHAR(20) NOT NULL,
  license_expiry_date DATE NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_drivers_user UNIQUE (user_id),
  CONSTRAINT uq_drivers_license UNIQUE (license_number),
  CONSTRAINT fk_drivers_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS vehicles (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  plate_number VARCHAR(12) NOT NULL,
  brand VARCHAR(50) NOT NULL,
  model VARCHAR(50) NOT NULL,
  model_year SMALLINT UNSIGNED NOT NULL,
  capacity SMALLINT UNSIGNED NOT NULL,
  mileage INT UNSIGNED NOT NULL DEFAULT 0,
  status ENUM('ACTIVE', 'MAINTENANCE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_vehicles_plate UNIQUE (plate_number),
  CONSTRAINT chk_vehicles_capacity CHECK (capacity > 0),
  CONSTRAINT chk_vehicles_year CHECK (model_year BETWEEN 1990 AND 2100)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS vehicle_maintenances (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  vehicle_id INT UNSIGNED NOT NULL,
  maintenance_type VARCHAR(50) NOT NULL,
  notes VARCHAR(500) NOT NULL,
  maintenance_date DATE NOT NULL,
  status ENUM('OPEN', 'CLOSED') NOT NULL DEFAULT 'OPEN',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_maintenances_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE RESTRICT,
  INDEX ix_maintenances_vehicle_date (vehicle_id, maintenance_date)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS routes (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  origin VARCHAR(100) NOT NULL,
  destination VARCHAR(100) NOT NULL,
  distance_km DECIMAL(8,2) NOT NULL,
  estimated_duration_minutes SMALLINT UNSIGNED NOT NULL,
  base_price DECIMAL(12,2) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT chk_routes_distance CHECK (distance_km > 0),
  CONSTRAINT chk_routes_duration CHECK (estimated_duration_minutes > 0),
  CONSTRAINT chk_routes_price CHECK (base_price > 0),
  INDEX ix_routes_origin_destination (origin, destination)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS route_stops (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  route_id INT UNSIGNED NOT NULL,
  stop_order SMALLINT UNSIGNED NOT NULL,
  stop_name VARCHAR(120) NOT NULL,
  estimated_arrival_offset_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_route_stops_order UNIQUE (route_id, stop_order),
  CONSTRAINT fk_route_stops_route FOREIGN KEY (route_id) REFERENCES routes(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS route_schedules (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  route_id INT UNSIGNED NOT NULL,
  vehicle_id INT UNSIGNED NOT NULL,
  travel_date DATE NOT NULL,
  departure_time TIME NOT NULL,
  status ENUM('SCHEDULED', 'COMPLETED', 'CANCELED') NOT NULL DEFAULT 'SCHEDULED',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_route_schedules_vehicle_time UNIQUE (vehicle_id, travel_date, departure_time),
  CONSTRAINT fk_route_schedules_route FOREIGN KEY (route_id) REFERENCES routes(id) ON DELETE RESTRICT,
  CONSTRAINT fk_route_schedules_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE RESTRICT,
  INDEX ix_route_schedules_search (travel_date, route_id, status)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS driver_schedules (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  driver_id INT UNSIGNED NOT NULL,
  route_schedule_id INT UNSIGNED NOT NULL,
  status ENUM('ASSIGNED', 'UNASSIGNED') NOT NULL DEFAULT 'ASSIGNED',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_driver_schedules_route_schedule UNIQUE (route_schedule_id),
  CONSTRAINT fk_driver_schedules_driver FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE RESTRICT,
  CONSTRAINT fk_driver_schedules_route_schedule FOREIGN KEY (route_schedule_id) REFERENCES route_schedules(id) ON DELETE CASCADE,
  INDEX ix_driver_schedules_driver (driver_id, status)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS reservations (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  reference_code VARCHAR(20) NOT NULL,
  client_id INT UNSIGNED NOT NULL,
  route_schedule_id INT UNSIGNED NOT NULL,
  seat_count SMALLINT UNSIGNED NOT NULL,
  status ENUM('PENDING', 'CONFIRMED', 'CANCELED') NOT NULL DEFAULT 'PENDING',
  payment_status ENUM('UNPAID', 'PAID', 'REFUNDED') NOT NULL DEFAULT 'UNPAID',
  total_amount DECIMAL(12,2) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_reservations_reference UNIQUE (reference_code),
  CONSTRAINT chk_reservations_seat_count CHECK (seat_count > 0),
  CONSTRAINT chk_reservations_total CHECK (total_amount > 0),
  CONSTRAINT fk_reservations_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE RESTRICT,
  CONSTRAINT fk_reservations_schedule FOREIGN KEY (route_schedule_id) REFERENCES route_schedules(id) ON DELETE RESTRICT,
  INDEX ix_reservations_client_created (client_id, created_at),
  INDEX ix_reservations_schedule_status (route_schedule_id, status)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS reservation_passengers (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  reservation_id INT UNSIGNED NOT NULL,
  first_name VARCHAR(50) NOT NULL,
  last_name VARCHAR(50) NOT NULL,
  document_type VARCHAR(20) NOT NULL,
  document_number VARCHAR(50) NOT NULL,
  is_client TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_reservation_passenger_document UNIQUE (reservation_id, document_number),
  CONSTRAINT fk_reservation_passengers_reservation FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE CASCADE,
  INDEX ix_reservation_passengers_document (document_number)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS sales (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  reservation_id INT UNSIGNED NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  payment_method ENUM('CARD', 'TRANSFER', 'CASH', 'PSE') NOT NULL,
  receipt_number VARCHAR(30) NOT NULL,
  status ENUM('PAID', 'REFUNDED') NOT NULL DEFAULT 'PAID',
  paid_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_sales_reservation UNIQUE (reservation_id),
  CONSTRAINT uq_sales_receipt UNIQUE (receipt_number),
  CONSTRAINT chk_sales_amount CHECK (amount > 0),
  CONSTRAINT fk_sales_reservation FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE RESTRICT,
  INDEX ix_sales_paid_at (paid_at, status)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS notifications (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  message VARCHAR(500) NOT NULL,
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX ix_notifications_user_read (user_id, is_read, created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS shift_change_requests (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  driver_schedule_id INT UNSIGNED NOT NULL,
  reason VARCHAR(400) NOT NULL,
  status ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
  reviewed_by_user_id INT UNSIGNED NULL,
  reviewed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_shift_requests_assignment FOREIGN KEY (driver_schedule_id) REFERENCES driver_schedules(id) ON DELETE CASCADE,
  CONSTRAINT fk_shift_requests_reviewer FOREIGN KEY (reviewed_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX ix_shift_requests_status (status, created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NULL,
  action VARCHAR(80) NOT NULL,
  entity_type VARCHAR(80) NOT NULL,
  entity_id VARCHAR(80) NULL,
  details JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_audit_logs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX ix_audit_logs_entity (entity_type, entity_id, created_at)
) ENGINE=InnoDB;

CREATE OR REPLACE VIEW vw_schedule_availability AS
SELECT
  rs.id AS route_schedule_id,
  rs.travel_date,
  rs.departure_time,
  rs.status AS schedule_status,
  r.origin,
  r.destination,
  r.distance_km,
  r.estimated_duration_minutes,
  r.base_price,
  v.id AS vehicle_id,
  v.plate_number,
  v.capacity,
  COALESCE(SUM(CASE WHEN rv.status IN ('PENDING', 'CONFIRMED') THEN rv.seat_count ELSE 0 END), 0) AS reserved_seats,
  v.capacity - COALESCE(SUM(CASE WHEN rv.status IN ('PENDING', 'CONFIRMED') THEN rv.seat_count ELSE 0 END), 0) AS available_seats
FROM route_schedules rs
JOIN routes r ON r.id = rs.route_id
JOIN vehicles v ON v.id = rs.vehicle_id
LEFT JOIN reservations rv ON rv.route_schedule_id = rs.id
GROUP BY rs.id, rs.travel_date, rs.departure_time, rs.status, r.origin, r.destination,
         r.distance_km, r.estimated_duration_minutes, r.base_price, v.id, v.plate_number, v.capacity;
