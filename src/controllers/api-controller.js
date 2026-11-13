"use strict";

const { AppError, readJson, sendJson, sendText } = require("../core/http");
const { getBearerToken } = require("../utils/security");

const ADMIN_RESOURCES = new Set(["roles", "users", "vehicles", "routes", "drivers", "clients", "schedules", "reservations", "sales", "maintenances"]);
const WRITABLE_RESOURCES = new Set(["roles", "users", "vehicles", "routes", "drivers", "schedules", "maintenances"]);

class ApiController {
  constructor(authService, transportService) {
    this.auth = authService;
    this.transport = transportService;
  }

  async user(req) {
    return this.auth.authenticate(getBearerToken(req.headers));
  }

  requireRole(user, ...allowed) {
    if (!user.role || !allowed.includes(user.role.name)) throw new AppError(403, "No tienes permisos para realizar esta acción.");
  }

  async health(_req, res) {
    sendJson(res, 200, { status: "ok", app: "Transporte Conexión", storage: "JSON local", time: new Date().toISOString() });
  }

  async login(req, res) {
    sendJson(res, 200, await this.auth.login(await readJson(req)));
  }

  async register(req, res) {
    sendJson(res, 201, await this.auth.register(await readJson(req)));
  }

  async recover(req, res) {
    sendJson(res, 200, await this.auth.recover(await readJson(req)));
  }

  async reset(req, res) {
    sendJson(res, 200, await this.auth.reset(await readJson(req)));
  }

  async me(req, res) {
    sendJson(res, 200, { user: await this.user(req) });
  }

  async catalog(req, res, ctx) {
    sendJson(res, 200, { items: await this.transport.getCatalog(ctx.query) });
  }

  async referenceData(req, res) {
    const user = await this.user(req);
    this.requireRole(user, "Administrador");
    const [roles, users, vehicles, routes, drivers] = await Promise.all([
      this.transport.listResource("roles"), this.transport.listResource("users"), this.transport.listResource("vehicles"),
      this.transport.listResource("routes"), this.transport.listResource("drivers"),
    ]);
    sendJson(res, 200, { roles, users, vehicles, routes, drivers });
  }

  async listResource(req, res, ctx) {
    const user = await this.user(req);
    this.requireRole(user, "Administrador");
    const { resource } = ctx.params;
    if (!ADMIN_RESOURCES.has(resource)) throw new AppError(404, "Módulo no encontrado.");
    sendJson(res, 200, { items: await this.transport.listResource(resource, ctx.query) });
  }

  async createResource(req, res, ctx) {
    const user = await this.user(req);
    this.requireRole(user, "Administrador");
    const { resource } = ctx.params;
    if (!WRITABLE_RESOURCES.has(resource)) throw new AppError(405, "Este módulo no admite creación directa.");
    sendJson(res, 201, { item: await this.transport.createResource(resource, await readJson(req)) });
  }

  async updateResource(req, res, ctx) {
    const user = await this.user(req);
    this.requireRole(user, "Administrador");
    const { resource, id } = ctx.params;
    if (!WRITABLE_RESOURCES.has(resource)) throw new AppError(405, "Este módulo no admite actualización directa.");
    sendJson(res, 200, { item: await this.transport.updateResource(resource, Number(id), await readJson(req)) });
  }

  async deleteResource(req, res, ctx) {
    const user = await this.user(req);
    this.requireRole(user, "Administrador");
    const { resource, id } = ctx.params;
    if (!WRITABLE_RESOURCES.has(resource)) throw new AppError(405, "Este módulo no admite eliminación directa.");
    sendJson(res, 200, await this.transport.deleteResource(resource, Number(id)));
  }

  async dashboard(req, res, ctx) {
    const user = await this.user(req);
    this.requireRole(user, "Administrador");
    sendJson(res, 200, await this.transport.dashboard(ctx.query));
  }

  async dashboardCsv(req, res, ctx) {
    const user = await this.user(req);
    this.requireRole(user, "Administrador");
    const csv = await this.transport.dashboardCsv(ctx.query);
    res.setHeader("Content-Disposition", "attachment; filename=indicadores-transporte.csv");
    sendText(res, 200, `\uFEFF${csv}`, "text/csv; charset=utf-8");
  }

  async myReservations(req, res) {
    const user = await this.user(req);
    this.requireRole(user, "Cliente");
    sendJson(res, 200, { items: await this.transport.listMyReservations(user.id) });
  }

  async reserve(req, res) {
    const user = await this.user(req);
    this.requireRole(user, "Cliente");
    sendJson(res, 201, { item: await this.transport.createReservation(user.id, await readJson(req)) });
  }

  async reservationStatus(req, res, ctx) {
    const user = await this.user(req);
    const payload = await readJson(req);
    sendJson(res, 200, { item: await this.transport.updateReservationStatus(user, Number(ctx.params.id), payload.status) });
  }

  async pay(req, res, ctx) {
    const user = await this.user(req);
    this.requireRole(user, "Cliente");
    sendJson(res, 200, await this.transport.payReservation(user, Number(ctx.params.id), await readJson(req)));
  }

  async driverSchedules(req, res) {
    const user = await this.user(req);
    this.requireRole(user, "Conductor");
    sendJson(res, 200, { items: await this.transport.driverSchedules(user.id) });
  }

  async shiftChange(req, res, ctx) {
    const user = await this.user(req);
    this.requireRole(user, "Conductor");
    const payload = await readJson(req);
    sendJson(res, 201, { item: await this.transport.requestShiftChange(user.id, Number(ctx.params.scheduleId), payload.reason) });
  }

  async notifications(req, res) {
    const user = await this.user(req);
    const data = await this.transport.store.read();
    const items = data.notifications.filter((entry) => entry.userId === user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    sendJson(res, 200, { items });
  }
}

module.exports = { ApiController };
