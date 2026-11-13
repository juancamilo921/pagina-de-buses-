"use strict";

const http = require("node:http");
const path = require("node:path");
const { Router } = require("./core/router");
const { AppError, sendJson, serveStatic, getRequestContext } = require("./core/http");
const { FileStore } = require("./infrastructure/file-store");
const { AuthService } = require("./services/auth-service");
const { TransportService } = require("./services/transport-service");
const { ApiController } = require("./controllers/api-controller");

function createRouter(controller) {
  const router = new Router();
  router.get("/api/health", controller.health.bind(controller));
  router.post("/api/auth/login", controller.login.bind(controller));
  router.post("/api/auth/register", controller.register.bind(controller));
  router.post("/api/auth/recovery", controller.recover.bind(controller));
  router.post("/api/auth/reset", controller.reset.bind(controller));
  router.get("/api/auth/me", controller.me.bind(controller));
  router.get("/api/catalog/schedules", controller.catalog.bind(controller));
  router.get("/api/admin/reference-data", controller.referenceData.bind(controller));
  router.get("/api/admin/dashboard", controller.dashboard.bind(controller));
  router.get("/api/admin/dashboard.csv", controller.dashboardCsv.bind(controller));
  router.get("/api/admin/:resource", controller.listResource.bind(controller));
  router.post("/api/admin/:resource", controller.createResource.bind(controller));
  router.put("/api/admin/:resource/:id", controller.updateResource.bind(controller));
  router.delete("/api/admin/:resource/:id", controller.deleteResource.bind(controller));
  router.get("/api/client/reservations", controller.myReservations.bind(controller));
  router.post("/api/client/reservations", controller.reserve.bind(controller));
  router.patch("/api/client/reservations/:id/status", controller.reservationStatus.bind(controller));
  router.post("/api/client/reservations/:id/pay", controller.pay.bind(controller));
  router.get("/api/driver/schedules", controller.driverSchedules.bind(controller));
  router.post("/api/driver/schedules/:scheduleId/change-request", controller.shiftChange.bind(controller));
  router.get("/api/notifications", controller.notifications.bind(controller));
  return router;
}

async function createApplication(options = {}) {
  const root = path.resolve(__dirname, "..");
  const store = new FileStore(options.dataFile || process.env.DATA_FILE || path.join(root, ".data", "transporte.json"));
  await store.initialize();
  const auth = new AuthService(store, options.tokenSecret || process.env.TOKEN_SECRET || "change-this-development-secret-before-deploying");
  const transport = new TransportService(store);
  const controller = new ApiController(auth, transport);
  const router = createRouter(controller);
  const publicDir = options.publicDir || path.join(root, "public");

  const server = http.createServer(async (req, res) => {
    try {
      if (req.method === "OPTIONS") {
        res.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type, Authorization", "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS" });
        res.end();
        return;
      }
      const context = getRequestContext(req);
      if (context.pathname.startsWith("/api/")) {
        await router.dispatch(req, res, context);
        return;
      }
      const served = await serveStatic(res, publicDir, context.pathname);
      if (!served) {
        if (context.pathname.includes(".")) throw new AppError(404, "Archivo no encontrado.");
        await serveStatic(res, publicDir, "/index.html");
      }
    } catch (error) {
      const status = error instanceof AppError ? error.status : 500;
      if (status === 500) console.error(error);
      if (!res.headersSent) sendJson(res, status, { error: error.message || "Ocurrió un error inesperado.", details: error.details });
      else res.end();
    }
  });
  return { server, store, auth, transport };
}

if (require.main === module) {
  createApplication().then(({ server }) => {
    const port = Number(process.env.PORT || 3000);
    server.listen(port, () => console.log(`Transporte Conexión disponible en http://localhost:${port}`));
  }).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { createApplication };
