"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createApplication } = require("../src/server");

let application;
let baseUrl;
let temporaryDirectory;

async function request(pathname, { method = "GET", token, body } = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { response, body: await response.json() };
}

test.before(async () => {
  temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "transporte-conexion-test-"));
  application = await createApplication({ dataFile: path.join(temporaryDirectory, "database.json"), tokenSecret: "test-secret" });
  await new Promise((resolve) => application.server.listen(0, "127.0.0.1", resolve));
  const address = application.server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

test.after(async () => {
  await new Promise((resolve) => application.server.close(resolve));
  await fs.rm(temporaryDirectory, { recursive: true, force: true });
});

test("el catálogo público muestra salidas disponibles", async () => {
  const result = await request("/api/catalog/schedules");
  assert.equal(result.response.status, 200);
  assert.ok(result.body.items.length >= 3);
  assert.ok(result.body.items.every((item) => item.availableSeats > 0));
});

test("la interfaz web se entrega con sus recursos principales", async () => {
  const home = await fetch(`${baseUrl}/`);
  const script = await fetch(`${baseUrl}/app.js`);
  const styles = await fetch(`${baseUrl}/styles.css`);
  assert.equal(home.status, 200);
  assert.match(await home.text(), /Transporte Conexión/);
  assert.equal(script.status, 200);
  assert.match(await script.text(), /function render/);
  assert.equal(styles.status, 200);
  assert.match(await styles.text(), /\.schedule-card/);
});

test("un cliente puede crear y pagar una reserva", async () => {
  const login = await request("/api/auth/login", { method: "POST", body: { email: "cliente@transporte.local", password: "Cliente123*" } });
  assert.equal(login.response.status, 200);
  const token = login.body.token;
  const catalog = await request("/api/catalog/schedules");
  const schedule = catalog.body.items[0];
  const reservation = await request("/api/client/reservations", {
    method: "POST", token,
    body: {
      scheduleId: schedule.id,
      seatCount: 1,
      passengers: [{ firstName: "Camila", lastName: "Pasajera", documentType: "CC", documentNumber: "100000003-TEST", isClient: true }],
    },
  });
  assert.equal(reservation.response.status, 201);
  assert.equal(reservation.body.item.status, "PENDING");
  const payment = await request(`/api/client/reservations/${reservation.body.item.id}/pay`, { method: "POST", token, body: { paymentMethod: "PSE" } });
  assert.equal(payment.response.status, 200);
  assert.equal(payment.body.reservation.status, "CONFIRMED");
  assert.equal(payment.body.reservation.paymentStatus, "PAID");
  assert.match(payment.body.sale.receiptNumber, /^REC-/);
});

test("el dashboard exige rol administrador", async () => {
  const clientLogin = await request("/api/auth/login", { method: "POST", body: { email: "cliente@transporte.local", password: "Cliente123*" } });
  const denied = await request("/api/admin/dashboard", { token: clientLogin.body.token });
  assert.equal(denied.response.status, 403);
  const adminLogin = await request("/api/auth/login", { method: "POST", body: { email: "admin@transporte.local", password: "Admin123*" } });
  const dashboard = await request("/api/admin/dashboard", { token: adminLogin.body.token });
  assert.equal(dashboard.response.status, 200);
  assert.ok(dashboard.body.metrics.totalRevenue >= 17000);
});

test("la programación bloquea solapamiento de vehículo", async () => {
  const login = await request("/api/auth/login", { method: "POST", body: { email: "admin@transporte.local", password: "Admin123*" } });
  const schedules = await request("/api/admin/schedules", { token: login.body.token });
  const original = schedules.body.items[0];
  const attempted = await request("/api/admin/schedules", {
    method: "POST", token: login.body.token,
    body: { routeId: 2, vehicleId: original.vehicleId, driverId: "", date: original.date, time: original.time, status: "SCHEDULED" },
  });
  assert.equal(attempted.response.status, 409);
});
