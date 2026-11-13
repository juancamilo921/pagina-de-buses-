-- Datos de demostración para Transporte Conexión.
-- Ejecutar después de database/schema.sql sobre una base recién creada.

USE transporte_conexion;

INSERT INTO roles (id, name, is_active) VALUES
  (1, 'Administrador', 1),
  (2, 'Conductor', 1),
  (3, 'Cliente', 1)
ON DUPLICATE KEY UPDATE name = VALUES(name), is_active = VALUES(is_active);

INSERT INTO permissions (id, code, description) VALUES
  (1, 'ADMINISTRAR', 'Gestionar configuración y operación'),
  (2, 'REPORTAR', 'Consultar y exportar indicadores'),
  (3, 'PROGRAMAR', 'Programar rutas y conductores'),
  (4, 'VER_TURNOS', 'Consultar turnos propios'),
  (5, 'ACTUALIZAR_DISPONIBILIDAD', 'Registrar disponibilidad operativa'),
  (6, 'RESERVAR', 'Crear reservas'),
  (7, 'PAGAR', 'Pagar reservas'),
  (8, 'CONSULTAR_RESERVAS', 'Consultar reservas propias')
ON DUPLICATE KEY UPDATE description = VALUES(description);

INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES
  (1, 1), (1, 2), (1, 3),
  (2, 4), (2, 5),
  (3, 6), (3, 7), (3, 8);

-- Los hash scrypt corresponden a las claves de demostración indicadas en README.md.
INSERT INTO users (id, role_id, email, password_hash, first_name, last_name, phone_number, document_type, document_number, is_active) VALUES
  (1, 1, 'admin@transporte.local', 'scrypt$00112233445566778899aabbccddeeff$80df955a0c3ea6e6f8d59ed57a1b1177942e2b6594e84716daa6b664fba7a3fe1d52e2e502a5bc01698c6ec85b677015d8a7e881401ffe3fc4ab1e4cc51e3a09', 'Ana', 'Administradora', '3000000001', 'CC', '100000001', 1),
  (2, 2, 'conductor@transporte.local', 'scrypt$11112222333344445555666677778888$61ce45a4aa9343d3a8e460942862d5a6dc93c1336dd0152b61d98f77d5cd05710864acf5865a41657967d64aeb0baac333bc841747c55d247a9bbed7ca3e05f9', 'Carlos', 'Conductor', '3000000002', 'CC', '100000002', 1),
  (3, 3, 'cliente@transporte.local', 'scrypt$abcdef0123456789abcdef0123456789$dc966ad40baf683c73ac16e1d5ce61edc11c658e7f3ca2df8259b77cc191f8d66be32709de085b199ecb72c0eee55fc3c8fcbfe236669f6a1314e41938b93631', 'Camila', 'Pasajera', '3000000003', 'CC', '100000003', 1)
ON DUPLICATE KEY UPDATE first_name = VALUES(first_name), last_name = VALUES(last_name), is_active = VALUES(is_active);

INSERT INTO clients (id, user_id, preference_note, is_active) VALUES (1, 3, 'Ventana', 1)
ON DUPLICATE KEY UPDATE preference_note = VALUES(preference_note), is_active = VALUES(is_active);

INSERT INTO drivers (id, user_id, license_number, license_type, license_expiry_date, is_active) VALUES (1, 2, 'C03-987654', 'C2', '2028-12-31', 1)
ON DUPLICATE KEY UPDATE license_type = VALUES(license_type), license_expiry_date = VALUES(license_expiry_date), is_active = VALUES(is_active);

INSERT INTO vehicles (id, plate_number, brand, model, model_year, capacity, mileage, status) VALUES
  (1, 'ABC123', 'Chevrolet', 'NPR Bus', 2023, 40, 28700, 'ACTIVE'),
  (2, 'DEF456', 'Mercedes-Benz', 'Sprinter', 2022, 19, 46200, 'ACTIVE'),
  (3, 'GHI789', 'Volkswagen', 'Delivery', 2021, 30, 61000, 'MAINTENANCE')
ON DUPLICATE KEY UPDATE brand = VALUES(brand), model = VALUES(model), capacity = VALUES(capacity), mileage = VALUES(mileage), status = VALUES(status);

INSERT INTO routes (id, origin, destination, distance_km, estimated_duration_minutes, base_price, is_active) VALUES
  (1, 'Bello', 'Medellín', 16.00, 45, 8500.00, 1),
  (2, 'Medellín', 'Rionegro', 36.00, 70, 15500.00, 1),
  (3, 'Bello', 'Santa Fe de Antioquia', 78.00, 130, 28000.00, 1)
ON DUPLICATE KEY UPDATE distance_km = VALUES(distance_km), estimated_duration_minutes = VALUES(estimated_duration_minutes), base_price = VALUES(base_price), is_active = VALUES(is_active);

INSERT INTO route_stops (route_id, stop_order, stop_name, estimated_arrival_offset_minutes) VALUES
  (1, 1, 'Bello', 0), (1, 2, 'Medellín', 45),
  (2, 1, 'Medellín', 0), (2, 2, 'Rionegro', 70),
  (3, 1, 'Bello', 0), (3, 2, 'Santa Fe de Antioquia', 130)
ON DUPLICATE KEY UPDATE stop_name = VALUES(stop_name), estimated_arrival_offset_minutes = VALUES(estimated_arrival_offset_minutes);

INSERT INTO route_schedules (id, route_id, vehicle_id, travel_date, departure_time, status) VALUES
  (1, 1, 1, DATE_ADD(CURDATE(), INTERVAL 1 DAY), '08:00:00', 'SCHEDULED'),
  (2, 2, 2, DATE_ADD(CURDATE(), INTERVAL 1 DAY), '10:30:00', 'SCHEDULED'),
  (3, 3, 1, DATE_ADD(CURDATE(), INTERVAL 2 DAY), '07:15:00', 'SCHEDULED')
ON DUPLICATE KEY UPDATE status = VALUES(status);

INSERT INTO driver_schedules (driver_id, route_schedule_id, status) VALUES
  (1, 1, 'ASSIGNED'), (1, 3, 'ASSIGNED')
ON DUPLICATE KEY UPDATE status = VALUES(status);

INSERT INTO reservations (id, reference_code, client_id, route_schedule_id, seat_count, status, payment_status, total_amount) VALUES
  (1, 'RES-000001', 1, 1, 2, 'CONFIRMED', 'PAID', 17000.00),
  (2, 'RES-000002', 1, 2, 1, 'PENDING', 'UNPAID', 15500.00)
ON DUPLICATE KEY UPDATE status = VALUES(status), payment_status = VALUES(payment_status), total_amount = VALUES(total_amount);

INSERT INTO reservation_passengers (reservation_id, first_name, last_name, document_type, document_number, is_client) VALUES
  (1, 'Camila', 'Pasajera', 'CC', '100000003', 1),
  (1, 'Laura', 'Gómez', 'CC', '100000004', 0),
  (2, 'Camila', 'Pasajera', 'CC', '100000003-R2', 1)
ON DUPLICATE KEY UPDATE first_name = VALUES(first_name), last_name = VALUES(last_name), is_client = VALUES(is_client);

INSERT INTO sales (reservation_id, amount, payment_method, receipt_number, status) VALUES
  (1, 17000.00, 'CARD', 'REC-000001', 'PAID')
ON DUPLICATE KEY UPDATE amount = VALUES(amount), payment_method = VALUES(payment_method), status = VALUES(status);

INSERT INTO vehicle_maintenances (vehicle_id, maintenance_type, notes, maintenance_date, status) VALUES
  (3, 'Preventivo', 'Revisión programada de frenos', CURDATE(), 'OPEN')
ON DUPLICATE KEY UPDATE notes = VALUES(notes), status = VALUES(status);

INSERT INTO notifications (user_id, message, is_read) VALUES
  (3, 'Tu reserva RES-000001 está confirmada.', 0);
