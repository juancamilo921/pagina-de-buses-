"use strict";

const { AppError } = require("../core/http");
const { text, number, oneOf, email, date, time } = require("../utils/validation");
const { passwordHash } = require("../utils/security");
const { nextId, byId, removeById } = require("../repositories/transport-repository");

const VEHICLE_STATUSES = ["ACTIVE", "MAINTENANCE", "INACTIVE"];
const SCHEDULE_STATUSES = ["SCHEDULED", "COMPLETED", "CANCELED"];
const RESERVATION_STATUSES = ["PENDING", "CONFIRMED", "CANCELED"];
const PAYMENT_METHODS = ["CARD", "TRANSFER", "CASH", "PSE"];

function timestamp() { return new Date().toISOString(); }
function own(object, key) { return Object.prototype.hasOwnProperty.call(object, key); }
function normalizedPlate(value) { return text(value, "Placa", { min: 5, max: 12, required: true }).toUpperCase().replace(/\s+/g, ""); }

class TransportService {
  constructor(store) {
    this.store = store;
  }

  roleName(data, roleId) {
    return data.roles.find((entry) => entry.id === roleId)?.name || "Sin rol";
  }

  userView(data, user) {
    return {
      id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, phone: user.phone,
      documentType: user.documentType, documentNumber: user.documentNumber, active: user.active, roleId: user.roleId,
      roleName: this.roleName(data, user.roleId), createdAt: user.createdAt,
    };
  }

  scheduleView(data, schedule) {
    const route = byId(data, "routes", schedule.routeId, "Ruta");
    const vehicle = byId(data, "vehicles", schedule.vehicleId, "Vehículo");
    const driverLink = data.driverSchedules.find((entry) => entry.scheduleId === schedule.id && entry.status === "ASSIGNED");
    const driver = driverLink ? byId(data, "drivers", driverLink.driverId, "Conductor") : null;
    const driverUser = driver ? byId(data, "users", driver.userId, "Usuario conductor") : null;
    const reservedSeats = data.reservations
      .filter((entry) => entry.scheduleId === schedule.id && entry.status !== "CANCELED")
      .reduce((sum, entry) => sum + entry.seatCount, 0);
    return {
      ...schedule,
      route: { id: route.id, origin: route.origin, destination: route.destination, distanceKm: route.distanceKm, estimatedDurationMinutes: route.estimatedDurationMinutes, price: route.price, active: route.active },
      vehicle: { id: vehicle.id, plateNumber: vehicle.plateNumber, brand: vehicle.brand, model: vehicle.model, capacity: vehicle.capacity, status: vehicle.status },
      driver: driverUser ? { id: driver.id, name: `${driverUser.firstName} ${driverUser.lastName}` } : null,
      reservedSeats,
      availableSeats: Math.max(0, vehicle.capacity - reservedSeats),
    };
  }

  reservationView(data, reservation) {
    const client = byId(data, "clients", reservation.clientId, "Cliente");
    const user = byId(data, "users", client.userId, "Usuario cliente");
    const schedule = this.scheduleView(data, byId(data, "schedules", reservation.scheduleId, "Programación"));
    return {
      ...reservation,
      client: { id: client.id, name: `${user.firstName} ${user.lastName}`, email: user.email },
      schedule,
      passengers: data.passengers.filter((entry) => entry.reservationId === reservation.id),
      sale: data.sales.find((entry) => entry.reservationId === reservation.id) || null,
    };
  }

  async currentClient(userId) {
    const data = await this.store.read();
    const client = data.clients.find((entry) => entry.userId === userId && entry.active);
    if (!client) throw new AppError(403, "Tu cuenta no está configurada como cliente.");
    return client;
  }

  async listResource(resource, query = {}) {
    const data = await this.store.read();
    let items;
    switch (resource) {
      case "roles": items = data.roles; break;
      case "users": items = data.users.map((entry) => this.userView(data, entry)); break;
      case "vehicles": items = data.vehicles; break;
      case "routes": items = data.routes; break;
      case "drivers": items = data.drivers.map((entry) => ({ ...entry, user: this.userView(data, byId(data, "users", entry.userId, "Usuario")) })); break;
      case "clients": items = data.clients.map((entry) => ({ ...entry, user: this.userView(data, byId(data, "users", entry.userId, "Usuario")) })); break;
      case "schedules": items = data.schedules.map((entry) => this.scheduleView(data, entry)); break;
      case "reservations": items = data.reservations.map((entry) => this.reservationView(data, entry)); break;
      case "sales": items = data.sales.map((entry) => ({ ...entry, reservation: this.reservationView(data, byId(data, "reservations", entry.reservationId, "Reserva")) })); break;
      case "maintenances": items = data.maintenances.map((entry) => ({ ...entry, vehicle: byId(data, "vehicles", entry.vehicleId, "Vehículo") })); break;
      default: throw new AppError(404, "Módulo no encontrado.");
    }
    const search = String(query.search || "").trim().toLocaleLowerCase("es-CO");
    if (search) items = items.filter((entry) => JSON.stringify(entry).toLocaleLowerCase("es-CO").includes(search));
    return items;
  }

  validateRole(data, payload, existing) {
    const name = text(payload.name, "Nombre del rol", { min: 3, max: 50, required: true });
    if (data.roles.some((entry) => entry.name.toLowerCase() === name.toLowerCase() && entry.id !== existing?.id)) throw new AppError(409, "Ya existe un rol con ese nombre.");
    const permissions = Array.isArray(payload.permissions) ? payload.permissions.map((entry) => String(entry).trim()).filter(Boolean) : (existing?.permissions || []);
    return { name, active: own(payload, "active") ? Boolean(payload.active) : (existing?.active ?? true), permissions };
  }

  validateUser(data, payload, existing) {
    const userEmail = email(payload.email ?? existing?.email);
    const documentNumber = text(payload.documentNumber ?? existing?.documentNumber, "Número de documento", { min: 4, max: 50, required: true });
    if (data.users.some((entry) => entry.email === userEmail && entry.id !== existing?.id)) throw new AppError(409, "Ya existe un usuario con ese correo.");
    if (data.users.some((entry) => entry.documentNumber === documentNumber && entry.id !== existing?.id)) throw new AppError(409, "Ya existe un usuario con ese documento.");
    const roleId = number(payload.roleId ?? existing?.roleId, "Rol", { integer: true, min: 1, required: true });
    byId(data, "roles", roleId, "Rol");
    const result = {
      email: userEmail,
      firstName: text(payload.firstName ?? existing?.firstName, "Nombres", { min: 2, max: 50, required: true }),
      lastName: text(payload.lastName ?? existing?.lastName, "Apellidos", { min: 2, max: 50, required: true }),
      phone: text(payload.phone ?? existing?.phone, "Teléfono", { min: 7, max: 20, required: true }),
      documentType: text(payload.documentType ?? existing?.documentType, "Tipo de documento", { min: 2, max: 20, required: true }),
      documentNumber,
      roleId,
      active: own(payload, "active") ? Boolean(payload.active) : (existing?.active ?? true),
    };
    if (payload.password) result.passwordHash = passwordHash(text(payload.password, "Contraseña", { min: 8, max: 100, required: true }));
    if (!existing && !result.passwordHash) throw new AppError(422, "La contraseña es obligatoria para crear un usuario.");
    return result;
  }

  validateVehicle(data, payload, existing) {
    const plateNumber = normalizedPlate(payload.plateNumber ?? existing?.plateNumber);
    if (data.vehicles.some((entry) => entry.plateNumber === plateNumber && entry.id !== existing?.id)) throw new AppError(409, "Ya existe un vehículo con esa placa.");
    return {
      plateNumber,
      brand: text(payload.brand ?? existing?.brand, "Marca", { min: 2, max: 50, required: true }),
      model: text(payload.model ?? existing?.model, "Modelo", { min: 1, max: 50, required: true }),
      year: number(payload.year ?? existing?.year, "Año", { integer: true, min: 1990, max: 2100, required: true }),
      capacity: number(payload.capacity ?? existing?.capacity, "Capacidad", { integer: true, min: 1, max: 100, required: true }),
      status: oneOf(payload.status ?? existing?.status ?? "ACTIVE", VEHICLE_STATUSES, "Estado"),
      mileage: number(payload.mileage ?? existing?.mileage ?? 0, "Kilometraje", { integer: true, min: 0, required: true }),
    };
  }

  validateRoute(data, payload, existing) {
    const origin = text(payload.origin ?? existing?.origin, "Origen", { min: 2, max: 100, required: true });
    const destination = text(payload.destination ?? existing?.destination, "Destino", { min: 2, max: 100, required: true });
    if (origin.toLowerCase() === destination.toLowerCase()) throw new AppError(422, "El origen y el destino deben ser diferentes.");
    return {
      origin, destination,
      distanceKm: number(payload.distanceKm ?? existing?.distanceKm, "Distancia", { min: 1, max: 2000, required: true }),
      estimatedDurationMinutes: number(payload.estimatedDurationMinutes ?? existing?.estimatedDurationMinutes, "Duración estimada", { integer: true, min: 5, max: 1440, required: true }),
      price: number(payload.price ?? existing?.price, "Tarifa", { min: 1, max: 10000000, required: true }),
      active: own(payload, "active") ? Boolean(payload.active) : (existing?.active ?? true),
    };
  }

  validateDriver(data, payload, existing) {
    const userId = number(payload.userId ?? existing?.userId, "Usuario conductor", { integer: true, min: 1, required: true });
    const user = byId(data, "users", userId, "Usuario");
    if (this.roleName(data, user.roleId) !== "Conductor") throw new AppError(422, "El usuario seleccionado debe tener el rol Conductor.");
    const licenseNumber = text(payload.licenseNumber ?? existing?.licenseNumber, "Número de licencia", { min: 4, max: 50, required: true });
    if (data.drivers.some((entry) => entry.licenseNumber === licenseNumber && entry.id !== existing?.id)) throw new AppError(409, "Ya existe un conductor con esa licencia.");
    if (data.drivers.some((entry) => entry.userId === userId && entry.id !== existing?.id)) throw new AppError(409, "Ese usuario ya está registrado como conductor.");
    return {
      userId, licenseNumber,
      licenseType: text(payload.licenseType ?? existing?.licenseType, "Categoría de licencia", { min: 1, max: 20, required: true }),
      licenseExpiryDate: date(payload.licenseExpiryDate ?? existing?.licenseExpiryDate, "Vencimiento de licencia"),
      active: own(payload, "active") ? Boolean(payload.active) : (existing?.active ?? true),
    };
  }

  validateSchedule(data, payload, existing) {
    const routeId = number(payload.routeId ?? existing?.routeId, "Ruta", { integer: true, min: 1, required: true });
    const vehicleId = number(payload.vehicleId ?? existing?.vehicleId, "Vehículo", { integer: true, min: 1, required: true });
    byId(data, "routes", routeId, "Ruta");
    const vehicle = byId(data, "vehicles", vehicleId, "Vehículo");
    if (vehicle.status !== "ACTIVE") throw new AppError(422, "Solo se puede programar un vehículo activo.");
    const scheduleDate = date(payload.date ?? existing?.date, "Fecha");
    const scheduleTime = time(payload.time ?? existing?.time, "Hora");
    if (data.schedules.some((entry) => entry.vehicleId === vehicleId && entry.date === scheduleDate && entry.time === scheduleTime && entry.id !== existing?.id && entry.status !== "CANCELED")) {
      throw new AppError(409, "El vehículo ya tiene una salida programada en esa fecha y hora.");
    }
    return { routeId, vehicleId, date: scheduleDate, time: scheduleTime, status: oneOf(payload.status ?? existing?.status ?? "SCHEDULED", SCHEDULE_STATUSES, "Estado") };
  }

  assignDriver(data, schedule, driverIdValue) {
    const current = data.driverSchedules.find((entry) => entry.scheduleId === schedule.id);
    if (driverIdValue === undefined) return;
    if (driverIdValue === null || driverIdValue === "") {
      if (current) current.status = "UNASSIGNED";
      return;
    }
    const driverId = number(driverIdValue, "Conductor", { integer: true, min: 1, required: true });
    const driver = byId(data, "drivers", driverId, "Conductor");
    if (!driver.active) throw new AppError(422, "El conductor seleccionado está inactivo.");
    const conflict = data.driverSchedules.some((entry) => {
      if (entry.driverId !== driverId || entry.scheduleId === schedule.id || entry.status !== "ASSIGNED") return false;
      const assignedSchedule = byId(data, "schedules", entry.scheduleId, "Salida");
      return assignedSchedule.date === schedule.date && assignedSchedule.time === schedule.time;
    });
    if (conflict) throw new AppError(409, "El conductor ya tiene una salida asignada en esa fecha y hora.");
    if (current) {
      current.driverId = driverId;
      current.status = "ASSIGNED";
      current.updatedAt = timestamp();
    } else {
      data.driverSchedules.push({ id: nextId(data, "driverSchedules"), driverId, scheduleId: schedule.id, status: "ASSIGNED", createdAt: timestamp() });
    }
  }

  validateMaintenance(data, payload, existing) {
    const vehicleId = number(payload.vehicleId ?? existing?.vehicleId, "Vehículo", { integer: true, min: 1, required: true });
    byId(data, "vehicles", vehicleId, "Vehículo");
    return {
      vehicleId,
      type: text(payload.type ?? existing?.type, "Tipo de mantenimiento", { min: 3, max: 50, required: true }),
      notes: text(payload.notes ?? existing?.notes, "Detalle", { min: 3, max: 500, required: true }),
      date: date(payload.date ?? existing?.date, "Fecha"),
      status: oneOf(payload.status ?? existing?.status ?? "OPEN", ["OPEN", "CLOSED"], "Estado"),
    };
  }

  async createResource(resource, payload) {
    return this.store.transaction((data) => {
      const validators = { roles: this.validateRole, users: this.validateUser, vehicles: this.validateVehicle, routes: this.validateRoute, drivers: this.validateDriver, schedules: this.validateSchedule, maintenances: this.validateMaintenance };
      const validate = validators[resource];
      if (!validate) throw new AppError(404, "Este recurso no admite creación directa.");
      const created = { id: nextId(data, resource), ...validate.call(this, data, payload), createdAt: timestamp() };
      data[resource].push(created);
      if (resource === "schedules") this.assignDriver(data, created, payload.driverId);
      return this.resourceView(data, resource, created);
    });
  }

  resourceView(data, resource, record) {
    if (resource === "users") return this.userView(data, record);
    if (resource === "drivers") return { ...record, user: this.userView(data, byId(data, "users", record.userId, "Usuario")) };
    if (resource === "schedules") return this.scheduleView(data, record);
    if (resource === "maintenances") return { ...record, vehicle: byId(data, "vehicles", record.vehicleId, "Vehículo") };
    return record;
  }

  async updateResource(resource, id, payload) {
    return this.store.transaction((data) => {
      const labels = { roles: "Rol", users: "Usuario", vehicles: "Vehículo", routes: "Ruta", drivers: "Conductor", schedules: "Programación", maintenances: "Mantenimiento" };
      const existing = byId(data, resource, id, labels[resource] || "Registro");
      const validators = { roles: this.validateRole, users: this.validateUser, vehicles: this.validateVehicle, routes: this.validateRoute, drivers: this.validateDriver, schedules: this.validateSchedule, maintenances: this.validateMaintenance };
      const validate = validators[resource];
      if (!validate) throw new AppError(404, "Este recurso no admite actualización directa.");
      Object.assign(existing, validate.call(this, data, payload, existing), { updatedAt: timestamp() });
      if (resource === "schedules") this.assignDriver(data, existing, payload.driverId);
      return this.resourceView(data, resource, existing);
    });
  }

  async deleteResource(resource, id) {
    return this.store.transaction((data) => {
      const relations = {
        roles: () => data.users.some((entry) => entry.roleId === Number(id)),
        users: () => data.clients.some((entry) => entry.userId === Number(id)) || data.drivers.some((entry) => entry.userId === Number(id)),
        vehicles: () => data.schedules.some((entry) => entry.vehicleId === Number(id)),
        routes: () => data.schedules.some((entry) => entry.routeId === Number(id)),
        drivers: () => data.driverSchedules.some((entry) => entry.driverId === Number(id)),
        schedules: () => data.reservations.some((entry) => entry.scheduleId === Number(id)),
      };
      if (relations[resource]?.()) throw new AppError(409, "No se puede eliminar porque el registro tiene información relacionada. Cámbialo a inactivo o cancelado.");
      const deleted = removeById(data, resource, id);
      return { id: deleted.id, message: "Registro eliminado correctamente." };
    });
  }

  async getCatalog(query = {}) {
    const schedules = await this.listResource("schedules");
    const origin = String(query.origin || "").trim().toLowerCase();
    const destination = String(query.destination || "").trim().toLowerCase();
    return schedules.filter((entry) => entry.status === "SCHEDULED" && entry.route.active && entry.vehicle.status === "ACTIVE" && entry.availableSeats > 0)
      .filter((entry) => !query.date || entry.date === query.date)
      .filter((entry) => !origin || entry.route.origin.toLowerCase().includes(origin))
      .filter((entry) => !destination || entry.route.destination.toLowerCase().includes(destination));
  }

  async createReservation(userId, payload) {
    return this.store.transaction((data) => {
      const client = data.clients.find((entry) => entry.userId === Number(userId) && entry.active);
      if (!client) throw new AppError(403, "Solo las cuentas de cliente pueden crear reservas.");
      const scheduleId = number(payload.scheduleId, "Salida", { integer: true, min: 1, required: true });
      const schedule = byId(data, "schedules", scheduleId, "Salida");
      if (schedule.status !== "SCHEDULED") throw new AppError(422, "La salida ya no está disponible.");
      const vehicle = byId(data, "vehicles", schedule.vehicleId, "Vehículo");
      const route = byId(data, "routes", schedule.routeId, "Ruta");
      const seatCount = number(payload.seatCount, "Cantidad de puestos", { integer: true, min: 1, max: 8, required: true });
      const reserved = data.reservations.filter((entry) => entry.scheduleId === scheduleId && entry.status !== "CANCELED").reduce((sum, entry) => sum + entry.seatCount, 0);
      if (reserved + seatCount > vehicle.capacity) throw new AppError(409, "No hay cupos suficientes para esta reserva.");
      const passengers = Array.isArray(payload.passengers) ? payload.passengers : [];
      if (passengers.length !== seatCount) throw new AppError(422, "Debes registrar exactamente un pasajero por cada puesto reservado.");
      const id = nextId(data, "reservations");
      const reservation = { id, reference: `RES-${String(id).padStart(6, "0")}`, clientId: client.id, scheduleId, seatCount, status: "PENDING", totalAmount: Math.round(route.price * seatCount), paymentStatus: "UNPAID", createdAt: timestamp() };
      data.reservations.push(reservation);
      passengers.forEach((passenger, index) => {
        const documentNumber = text(passenger.documentNumber, `Documento del pasajero ${index + 1}`, { min: 4, max: 50, required: true });
        data.passengers.push({
          id: nextId(data, "passengers"), reservationId: id,
          firstName: text(passenger.firstName, `Nombre del pasajero ${index + 1}`, { min: 2, max: 50, required: true }),
          lastName: text(passenger.lastName, `Apellido del pasajero ${index + 1}`, { min: 2, max: 50, required: true }),
          documentType: text(passenger.documentType || "CC", "Tipo de documento", { min: 2, max: 20, required: true }), documentNumber,
          isClient: Boolean(passenger.isClient),
        });
      });
      const user = byId(data, "users", userId, "Usuario");
      data.notifications.push({ id: nextId(data, "notifications"), userId: user.id, message: `La reserva ${reservation.reference} fue creada y espera pago.`, read: false, createdAt: timestamp() });
      return this.reservationView(data, reservation);
    });
  }

  async listMyReservations(userId) {
    const data = await this.store.read();
    const client = data.clients.find((entry) => entry.userId === Number(userId));
    if (!client) throw new AppError(403, "Tu cuenta no es de cliente.");
    return data.reservations.filter((entry) => entry.clientId === client.id).map((entry) => this.reservationView(data, entry));
  }

  async updateReservationStatus(user, id, status) {
    return this.store.transaction((data) => {
      const reservation = byId(data, "reservations", id, "Reserva");
      const role = this.roleName(data, user.role.id);
      const client = data.clients.find((entry) => entry.userId === user.id);
      if (role !== "Administrador" && (!client || reservation.clientId !== client.id)) throw new AppError(403, "No tienes permiso para modificar esta reserva.");
      const requested = oneOf(status, RESERVATION_STATUSES, "Estado");
      if (requested === "CANCELED" && reservation.paymentStatus === "PAID") throw new AppError(422, "Una reserva pagada debe ser gestionada por administración para su reembolso.");
      if (reservation.status === "CANCELED") throw new AppError(422, "La reserva ya fue cancelada.");
      reservation.status = requested;
      reservation.updatedAt = timestamp();
      return this.reservationView(data, reservation);
    });
  }

  async payReservation(user, id, payload) {
    return this.store.transaction((data) => {
      const reservation = byId(data, "reservations", id, "Reserva");
      const client = data.clients.find((entry) => entry.userId === user.id);
      if (!client || reservation.clientId !== client.id) throw new AppError(403, "Solo el cliente titular puede pagar la reserva.");
      if (reservation.status === "CANCELED") throw new AppError(422, "No puedes pagar una reserva cancelada.");
      if (reservation.paymentStatus === "PAID") throw new AppError(409, "Esta reserva ya está pagada.");
      const paymentMethod = oneOf(payload.paymentMethod, PAYMENT_METHODS, "Método de pago");
      reservation.paymentStatus = "PAID";
      reservation.status = "CONFIRMED";
      reservation.updatedAt = timestamp();
      const sale = { id: nextId(data, "sales"), reservationId: reservation.id, amount: reservation.totalAmount, paymentMethod, receiptNumber: `REC-${String(nextId(data, "sales")).padStart(6, "0")}`, date: timestamp(), status: "PAID" };
      data.sales.push(sale);
      data.notifications.push({ id: nextId(data, "notifications"), userId: user.id, message: `Pago recibido. La reserva ${reservation.reference} está confirmada.`, read: false, createdAt: timestamp() });
      return { reservation: this.reservationView(data, reservation), sale };
    });
  }

  async driverSchedules(userId) {
    const data = await this.store.read();
    const driver = data.drivers.find((entry) => entry.userId === Number(userId) && entry.active);
    if (!driver) throw new AppError(403, "Tu cuenta no es de conductor.");
    return data.driverSchedules.filter((entry) => entry.driverId === driver.id).map((entry) => ({ ...entry, schedule: this.scheduleView(data, byId(data, "schedules", entry.scheduleId, "Salida")) }));
  }

  async requestShiftChange(userId, scheduleId, reason) {
    return this.store.transaction((data) => {
      const driver = data.drivers.find((entry) => entry.userId === Number(userId) && entry.active);
      if (!driver) throw new AppError(403, "Tu cuenta no es de conductor.");
      const assignment = data.driverSchedules.find((entry) => entry.driverId === driver.id && entry.scheduleId === Number(scheduleId));
      if (!assignment) throw new AppError(403, "No tienes asignación para esa salida.");
      const request = { id: nextId(data, "shiftChangeRequests"), driverScheduleId: assignment.id, reason: text(reason, "Motivo", { min: 5, max: 400, required: true }), status: "PENDING", createdAt: timestamp() };
      data.shiftChangeRequests.push(request);
      return request;
    });
  }

  async dashboard(query = {}) {
    const data = await this.store.read();
    let schedules = data.schedules.map((entry) => this.scheduleView(data, entry));
    if (query.date) schedules = schedules.filter((entry) => entry.date === query.date);
    if (query.routeId) schedules = schedules.filter((entry) => entry.routeId === Number(query.routeId));
    if (query.vehicleId) schedules = schedules.filter((entry) => entry.vehicleId === Number(query.vehicleId));
    const scheduleIds = new Set(schedules.map((entry) => entry.id));
    const reservations = data.reservations.filter((entry) => scheduleIds.has(entry.scheduleId) && entry.status !== "CANCELED");
    const sales = data.sales.filter((entry) => reservations.some((reservation) => reservation.id === entry.reservationId) && entry.status === "PAID");
    const totalCapacity = schedules.reduce((sum, entry) => sum + entry.vehicle.capacity, 0);
    const occupiedSeats = reservations.reduce((sum, entry) => sum + entry.seatCount, 0);
    const byRoute = schedules.map((schedule) => {
      const scheduleRevenue = sales
        .filter((sale) => data.reservations.find((reservation) => reservation.id === sale.reservationId)?.scheduleId === schedule.id)
        .reduce((sum, sale) => sum + sale.amount, 0);
      return {
        route: `${schedule.route.origin} - ${schedule.route.destination}`,
        scheduledTrips: 1,
        passengers: schedule.reservedSeats,
        occupancyPercent: schedule.vehicle.capacity ? Math.round((schedule.reservedSeats / schedule.vehicle.capacity) * 100) : 0,
        revenue: scheduleRevenue,
      };
    });
    return {
      filters: { date: query.date || "", routeId: query.routeId || "", vehicleId: query.vehicleId || "" },
      metrics: {
        scheduledTrips: schedules.length,
        activeVehicles: data.vehicles.filter((entry) => entry.status === "ACTIVE").length,
        reservations: reservations.length,
        passengers: occupiedSeats,
        totalRevenue: sales.reduce((sum, entry) => sum + entry.amount, 0),
        occupancyPercent: totalCapacity ? Math.round((occupiedSeats / totalCapacity) * 100) : 0,
      },
      byRoute,
      recentReservations: data.reservations.slice(-8).reverse().map((entry) => this.reservationView(data, entry)),
    };
  }

  async dashboardCsv(query) {
    const dashboard = await this.dashboard(query);
    const rows = [
      ["Ruta", "Viajes programados", "Pasajeros", "Ocupación", "Ingresos"],
      ...dashboard.byRoute.map((entry) => [entry.route, entry.scheduledTrips, entry.passengers, `${entry.occupancyPercent}%`, entry.revenue]),
    ];
    return rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
  }
}

module.exports = { TransportService };
