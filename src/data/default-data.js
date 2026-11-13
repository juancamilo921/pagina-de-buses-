"use strict";

const { passwordHash } = require("../utils/security");

function isoDate(offset = 0) {
  const value = new Date();
  value.setHours(12, 0, 0, 0);
  value.setDate(value.getDate() + offset);
  return value.toISOString().slice(0, 10);
}

function now() {
  return new Date().toISOString();
}

function createInitialData() {
  const timestamp = now();
  const tomorrow = isoDate(1);
  const dayAfter = isoDate(2);
  const nextWeek = isoDate(6);

  return {
    meta: { version: 1, createdAt: timestamp },
    roles: [
      { id: 1, name: "Administrador", active: true, permissions: ["administrar", "reportar", "programar"], createdAt: timestamp },
      { id: 2, name: "Conductor", active: true, permissions: ["ver_turnos", "actualizar_disponibilidad"], createdAt: timestamp },
      { id: 3, name: "Cliente", active: true, permissions: ["reservar", "pagar", "consultar_reservas"], createdAt: timestamp },
    ],
    users: [
      {
        id: 1, email: "admin@transporte.local", passwordHash: passwordHash("Admin123*"), firstName: "Ana", lastName: "Administradora",
        phone: "3000000001", documentType: "CC", documentNumber: "100000001", roleId: 1, active: true, createdAt: timestamp,
      },
      {
        id: 2, email: "conductor@transporte.local", passwordHash: passwordHash("Conductor123*"), firstName: "Carlos", lastName: "Conductor",
        phone: "3000000002", documentType: "CC", documentNumber: "100000002", roleId: 2, active: true, createdAt: timestamp,
      },
      {
        id: 3, email: "cliente@transporte.local", passwordHash: passwordHash("Cliente123*"), firstName: "Camila", lastName: "Pasajera",
        phone: "3000000003", documentType: "CC", documentNumber: "100000003", roleId: 3, active: true, createdAt: timestamp,
      },
    ],
    clients: [{ id: 1, userId: 3, preference: "Ventana", active: true, createdAt: timestamp }],
    drivers: [{ id: 1, userId: 2, licenseNumber: "C03-987654", licenseType: "C2", licenseExpiryDate: "2028-12-31", active: true, createdAt: timestamp }],
    vehicles: [
      { id: 1, plateNumber: "ABC123", brand: "Chevrolet", model: "NPR Bus", year: 2023, capacity: 40, status: "ACTIVE", mileage: 28700, createdAt: timestamp },
      { id: 2, plateNumber: "DEF456", brand: "Mercedes-Benz", model: "Sprinter", year: 2022, capacity: 19, status: "ACTIVE", mileage: 46200, createdAt: timestamp },
      { id: 3, plateNumber: "GHI789", brand: "Volkswagen", model: "Delivery", year: 2021, capacity: 30, status: "MAINTENANCE", mileage: 61000, createdAt: timestamp },
    ],
    routes: [
      { id: 1, origin: "Bello", destination: "Medellín", distanceKm: 16, estimatedDurationMinutes: 45, price: 8500, active: true, createdAt: timestamp },
      { id: 2, origin: "Medellín", destination: "Rionegro", distanceKm: 36, estimatedDurationMinutes: 70, price: 15500, active: true, createdAt: timestamp },
      { id: 3, origin: "Bello", destination: "Santa Fe de Antioquia", distanceKm: 78, estimatedDurationMinutes: 130, price: 28000, active: true, createdAt: timestamp },
    ],
    schedules: [
      { id: 1, routeId: 1, date: tomorrow, time: "08:00:00", vehicleId: 1, status: "SCHEDULED", createdAt: timestamp },
      { id: 2, routeId: 2, date: tomorrow, time: "10:30:00", vehicleId: 2, status: "SCHEDULED", createdAt: timestamp },
      { id: 3, routeId: 3, date: dayAfter, time: "07:15:00", vehicleId: 1, status: "SCHEDULED", createdAt: timestamp },
      { id: 4, routeId: 1, date: nextWeek, time: "17:30:00", vehicleId: 2, status: "SCHEDULED", createdAt: timestamp },
    ],
    driverSchedules: [
      { id: 1, driverId: 1, scheduleId: 1, status: "ASSIGNED", createdAt: timestamp },
      { id: 2, driverId: 1, scheduleId: 3, status: "ASSIGNED", createdAt: timestamp },
    ],
    reservations: [
      { id: 1, reference: "RES-000001", clientId: 1, scheduleId: 1, seatCount: 2, status: "CONFIRMED", totalAmount: 17000, paymentStatus: "PAID", createdAt: timestamp },
      { id: 2, reference: "RES-000002", clientId: 1, scheduleId: 2, seatCount: 1, status: "PENDING", totalAmount: 15500, paymentStatus: "UNPAID", createdAt: timestamp },
    ],
    passengers: [
      { id: 1, reservationId: 1, firstName: "Camila", lastName: "Pasajera", documentType: "CC", documentNumber: "100000003", isClient: true },
      { id: 2, reservationId: 1, firstName: "Laura", lastName: "Gómez", documentType: "CC", documentNumber: "100000004", isClient: false },
      { id: 3, reservationId: 2, firstName: "Camila", lastName: "Pasajera", documentType: "CC", documentNumber: "100000003-R2", isClient: true },
    ],
    sales: [
      { id: 1, reservationId: 1, amount: 17000, paymentMethod: "CARD", receiptNumber: "REC-000001", date: timestamp, status: "PAID" },
    ],
    maintenances: [{ id: 1, vehicleId: 3, type: "Preventivo", notes: "Revisión programada de frenos", date: isoDate(-1), status: "OPEN", createdAt: timestamp }],
    notifications: [{ id: 1, userId: 3, message: `Tu reserva RES-000001 para ${tomorrow} está confirmada.`, read: false, createdAt: timestamp }],
    shiftChangeRequests: [],
    passwordResets: [],
  };
}

module.exports = { createInitialData };
