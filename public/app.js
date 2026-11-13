"use strict";

const app = document.querySelector("#app");
const toastRegion = document.querySelector("#toast-region");

const state = {
  token: localStorage.getItem("transporte_token") || "",
  user: null,
  loading: true,
  modal: null,
  publicCatalog: [],
  clientCatalog: [],
  clientReservations: [],
  notifications: [],
  driverSchedules: [],
  dashboard: null,
  references: null,
  adminItems: [],
  adminResource: "vehicles",
  view: "home",
  reservationDraft: null,
  selectedResourceRecord: null,
  selectedPayment: null,
  recoveryCode: "",
  adminSearch: "",
  pendingScheduleId: null,
};

const RESOURCE_LABELS = {
  roles: "Configuración",
  users: "Usuarios",
  vehicles: "Vehículos",
  routes: "Rutas",
  schedules: "Programación de rutas",
  drivers: "Conductores",
  clients: "Clientes",
  reservations: "Reservas",
  sales: "Ventas",
  maintenances: "Mantenimientos",
};

const RESOURCE_SINGULAR_LABELS = {
  roles: "rol", users: "usuario", vehicles: "vehículo", routes: "ruta", drivers: "conductor",
  clients: "cliente", schedules: "programación", maintenances: "mantenimiento", reservations: "reserva", sales: "venta",
};
const money = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const dateFormatter = new Intl.DateTimeFormat("es-CO", { day: "2-digit", month: "short", year: "numeric" });

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[character]));
}

function escapeAttribute(value) { return escapeHtml(value).replace(/`/g, "&#96;"); }
function formatMoney(value) { return money.format(Number(value || 0)); }
function formatDate(value) { return value ? dateFormatter.format(new Date(`${value}T12:00:00`)) : "Sin fecha"; }
function formatTime(value) { return String(value || "").slice(0, 5); }
function initials(user) { return `${user.firstName?.[0] || ""}${user.lastName?.[0] || ""}`.toUpperCase(); }
function selected(condition) { return condition ? "selected" : ""; }
function checked(condition) { return condition ? "checked" : ""; }

function toast(message, type = "success") {
  const element = document.createElement("div");
  element.className = `toast ${type === "error" ? "error" : ""}`;
  element.textContent = message;
  toastRegion.append(element);
  window.setTimeout(() => element.remove(), 4600);
}

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(path, { method: options.method || "GET", headers, body: options.body === undefined ? undefined : JSON.stringify(options.body) });
  if (options.raw) {
    if (!response.ok) throw new Error("No fue posible descargar el reporte.");
    return response;
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) clearSession();
    throw new Error(payload.error || "La operación no se pudo completar.");
  }
  return payload;
}

function clearSession() {
  state.token = "";
  state.user = null;
  localStorage.removeItem("transporte_token");
}

function saveSession(session) {
  state.token = session.token;
  state.user = session.user;
  localStorage.setItem("transporte_token", session.token);
  state.modal = null;
  state.view = session.user.role.name === "Administrador" ? "dashboard" : session.user.role.name === "Conductor" ? "shifts" : "book";
}

function statusBadge(status) {
  const normalized = String(status || "").toLowerCase();
  const names = { active: "Activo", inactive: "Inactivo", maintenance: "Mantenimiento", scheduled: "Programada", completed: "Completada", canceled: "Cancelada", pending: "Pendiente", confirmed: "Confirmada", paid: "Pagado", unpaid: "Sin pagar", open: "Abierto", closed: "Cerrado", assigned: "Asignado" };
  return `<span class="badge ${escapeAttribute(normalized)}">${escapeHtml(names[normalized] || status)}</span>`;
}

function publicHeader() {
  return `<header class="site-header">
    <a class="brand" href="#home" aria-label="Inicio de Transporte Conexión"><span class="brand-mark">🚌</span><span>Transporte Conexión</span></a>
    <nav class="public-links" aria-label="Navegación principal"><a href="#home">Inicio</a><a href="#about">Quiénes somos</a><a href="#contact">Contáctenos</a></nav>
    <div class="header-actions"><button class="button secondary" data-action="open-register">Crear cuenta</button><button class="button" data-action="open-login">Iniciar sesión</button></div>
  </header>`;
}

function scheduleCard(schedule, action = "open-login") {
  return `<article class="schedule-card">
    <div class="schedule-card-top"><span>${formatDate(schedule.date)}</span><span>${formatTime(schedule.time)}</span></div>
    <div class="schedule-card-body">
      <p class="route-title">${escapeHtml(schedule.route.origin)} <span aria-hidden="true">→</span> ${escapeHtml(schedule.route.destination)}</p>
      <div class="route-meta"><span>🕒 ${schedule.route.estimatedDurationMinutes} min</span><span>📍 ${schedule.route.distanceKm} km</span><span>🪑 ${schedule.availableSeats} cupos</span></div>
      <strong class="route-price">${formatMoney(schedule.route.price)}</strong>
    </div>
    <footer><button class="button ${action === "open-reservation" ? "accent" : ""}" data-action="${action}" data-id="${schedule.id}">${action === "open-reservation" ? "Reservar salida" : "Ver disponibilidad"}</button></footer>
  </article>`;
}

function searchPanel(id, values = {}) {
  return `<form id="${id}" class="search-panel">
    <div class="field"><label for="${id}-origin">Origen</label><input id="${id}-origin" name="origin" value="${escapeAttribute(values.origin || "")}" placeholder="Ej. Bello" /></div>
    <div class="field"><label for="${id}-destination">Destino</label><input id="${id}-destination" name="destination" value="${escapeAttribute(values.destination || "")}" placeholder="Ej. Medellín" /></div>
    <div class="field"><label for="${id}-date">Fecha</label><input id="${id}-date" name="date" type="date" value="${escapeAttribute(values.date || "")}" /></div>
    <button class="button" type="submit">Buscar rutas</button>
  </form>`;
}

function renderPublic() {
  const cards = state.publicCatalog.length
    ? state.publicCatalog.map((schedule) => scheduleCard(schedule)).join("")
    : `<div class="empty">No encontramos salidas con esos filtros. Prueba con otra fecha o ciudad.</div>`;
  app.innerHTML = `${publicHeader()}
    <main id="home">
      <section class="hero"><div class="hero-content"><p class="eyebrow">Agencia de transporte de pasajeros</p><h1>Tu próximo viaje comienza aquí</h1><p>Consulta las salidas disponibles, compara horarios y organiza tu viaje desde un solo lugar.</p><button class="button accent" data-action="open-register">Crear cuenta de cliente</button></div><div class="hero-note"><span class="hero-note-icon">✦</span><div><strong>Viaja con tranquilidad</strong><p>Consulta destino, horario, tarifa y cupos antes de reservar.</p></div></div></section>
      ${searchPanel("public-search")}
      <section class="public-content" id="salidas"><div class="section-heading"><div><p class="eyebrow">Planea tu viaje</p><h2>Salidas disponibles</h2><p>Resultados de la búsqueda y cupos disponibles.</p></div></div><div class="schedule-grid">${cards}</div>
      <div class="feature-grid" id="about"><article class="feature"><div class="feature-icon">🔎</div><h3>Consulta las rutas</h3><p>Busca por origen, destino y fecha para conocer las opciones disponibles.</p></article><article class="feature"><div class="feature-icon">🎫</div><h3>Reserva tus puestos</h3><p>Registra los datos de cada pasajero y consulta el estado de tus reservas.</p></article><article class="feature"><div class="feature-icon">🚌</div><h3>Sobre Transporte Conexión</h3><p>La agencia organiza rutas, vehículos y conductores para prestar el servicio de transporte de pasajeros.</p></article></div>
      <section class="contact-card" id="contact"><div><p class="eyebrow">Atención al viajero</p><h2>¿Necesitas gestionar un viaje?</h2><p>Consulta las rutas disponibles o inicia sesión para revisar tus reservas.</p></div><div class="contact-actions"><a class="button secondary" href="#salidas">Ver salidas</a><button class="button" data-action="open-login">Iniciar sesión</button></div></section>
      </section>
    </main>${renderModal()}`;
}

function appHeader() {
  return `<header class="app-header"><a class="brand" href="#" data-action="go-home"><span class="brand-mark">🚌</span><span>Transporte Conexión</span></a><div class="nav-actions"><span class="header-context">Agencia de transporte</span><div class="user-chip"><span class="avatar">${initials(state.user)}</span><span><strong>${escapeHtml(state.user.firstName)}</strong><small>${escapeHtml(state.user.role.name)}</small></span></div><button class="button secondary small" data-action="logout">Cerrar sesión</button></div></header>`;
}

function navButton(view, label, icon) {
  return `<button class="${state.view === view ? "active" : ""}" data-action="set-view" data-view="${view}"><span class="nav-icon">${icon}</span><span>${label}</span></button>`;
}

function adminModuleButton(resource) {
  const active = state.view === "manage" && state.adminResource === resource;
  const icons = { roles: "⚙", users: "♙", vehicles: "▰", routes: "↗", drivers: "♧", schedules: "▦", maintenances: "⌁", clients: "♧", reservations: "▣", sales: "$" };
  return `<button class="${active ? "active" : ""}" data-action="open-admin-module" data-resource="${resource}"><span class="nav-icon">${icons[resource] || "•"}</span><span>${RESOURCE_LABELS[resource]}</span></button>`;
}

function renderAuthed() {
  const role = state.user.role.name;
  let nav = "";
  let content = "";
  if (role === "Administrador") {
    nav = `${navButton("dashboard", "Dashboard", "▦")}${Object.keys(RESOURCE_LABELS).map(adminModuleButton).join("")}`;
    content = state.view === "manage" ? renderAdminManager() : renderAdminDashboard();
  } else if (role === "Cliente") {
    nav = `${navButton("book", "Buscar rutas", "⌕")}${navButton("reservations", "Mis reservas", "🎫")}`;
    content = state.view === "reservations" ? renderClientReservations() : renderClientBooking();
  } else {
    nav = `${navButton("shifts", "Programación de conductores", "▦")}${navButton("vehicle-info", "Vehículos asignados", "🚌")}`;
    content = state.view === "vehicle-info" ? renderDriverVehicles() : renderDriver();
  }
  app.innerHTML = `${appHeader()}<div class="app-frame"><aside class="sidebar"><a class="brand" href="#" data-action="go-home"><span class="brand-mark">🚌</span><span>Transporte Conexión</span></a><p class="sidebar-caption">MENÚ PRINCIPAL</p><nav class="sidebar-nav">${nav}</nav><div class="sidebar-footnote">Sistema de gestión de viajes</div></aside><main class="app-main">${content}</main></div>${renderModal()}`;
}

function demandChart(rows, title, order = "desc") {
  const grouped = new Map();
  for (const row of rows) {
    const current = grouped.get(row.route) || { route: row.route, passengers: 0 };
    current.passengers += Number(row.passengers || 0);
    grouped.set(row.route, current);
  }
  const entries = [...grouped.values()].sort((a, b) => order === "asc" ? a.passengers - b.passengers : b.passengers - a.passengers).slice(0, 5);
  const total = entries.reduce((sum, entry) => sum + entry.passengers, 0);
  const palette = ["#2378c8", "#20a6bd", "#f1b941", "#7868c9", "#59a878"];
  let current = 0;
  const segments = entries.map((entry, index) => {
    const start = current;
    current += total ? (entry.passengers / total) * 100 : 0;
    return `${palette[index % palette.length]} ${start}% ${current}%`;
  });
  const style = total ? `conic-gradient(${segments.join(", ")})` : "conic-gradient(#e5ebf2 0 100%)";
  const legend = entries.map((entry, index) => `<li><span class="legend-swatch" style="--legend-color:${palette[index % palette.length]}"></span><span>${escapeHtml(entry.route)}</span><strong>${entry.passengers}</strong></li>`).join("");
  return `<article class="panel demand-card"><h2>${title}</h2>${total ? `<div class="demand-layout"><div class="donut" style="--donut:${escapeAttribute(style)}"><span><strong>${total}</strong><small>pasajeros</small></span></div><ul class="demand-legend">${legend}</ul></div>` : `<p class="empty chart-empty">No hay datos de pasajeros para mostrar.</p>`}</article>`;
}

function renderAdminDashboard() {
  if (!state.dashboard) return `<div class="loading">Cargando indicadores…</div>`;
  const metrics = state.dashboard.metrics;
  const routeRows = state.dashboard.byRoute.map((row) => `<tr><td>${escapeHtml(row.route)}</td><td>${row.scheduledTrips}</td><td>${row.passengers}</td><td>${row.occupancyPercent}%</td><td>${formatMoney(row.revenue)}</td></tr>`).join("") || `<tr><td colspan="5">No hay datos para este filtro.</td></tr>`;
  const reservationRows = state.dashboard.recentReservations.map((reservation) => `<tr><td>${escapeHtml(reservation.reference)}</td><td>${escapeHtml(reservation.client.name)}</td><td>${escapeHtml(`${reservation.schedule.route.origin} - ${reservation.schedule.route.destination}`)}</td><td>${statusBadge(reservation.status)}</td><td>${formatMoney(reservation.totalAmount)}</td></tr>`).join("") || `<tr><td colspan="5">Aún no hay reservas.</td></tr>`;
  const routeOptions = (state.references?.routes || []).map((route) => `<option value="${route.id}" ${selected(String(state.dashboard.filters.routeId) === String(route.id))}>${escapeHtml(`${route.origin} - ${route.destination}`)}</option>`).join("");
  const vehicleOptions = (state.references?.vehicles || []).map((vehicle) => `<option value="${vehicle.id}" ${selected(String(state.dashboard.filters.vehicleId) === String(vehicle.id))}>${escapeHtml(vehicle.plateNumber)}</option>`).join("");
  return `<section class="content-heading"><p class="eyebrow">Panel administrativo</p><h1>Dashboard</h1><p>Resumen de la operación de la agencia de transporte.</p></section>
    <form id="dashboard-filter" class="filter-row panel"><div class="field"><label>Fecha</label><input name="date" type="date" value="${escapeAttribute(state.dashboard.filters.date)}" /></div><div class="field"><label>Ruta</label><select name="routeId"><option value="">Todas las rutas</option>${routeOptions}</select></div><div class="field"><label>Vehículo</label><select name="vehicleId"><option value="">Todos los vehículos</option>${vehicleOptions}</select></div><button class="button" type="submit">Consultar</button><button class="button secondary" data-action="download-dashboard" type="button">Descargar CSV</button></form>
    <div class="metric-grid"><article class="metric"><span>Salidas programadas</span><strong>${metrics.scheduledTrips}</strong></article><article class="metric"><span>Vehículos activos</span><strong>${metrics.activeVehicles}</strong></article><article class="metric"><span>Reservas</span><strong>${metrics.reservations}</strong></article><article class="metric"><span>Pasajeros</span><strong>${metrics.passengers}</strong></article><article class="metric"><span>Ocupación</span><strong>${metrics.occupancyPercent}%</strong></article><article class="metric"><span>Ingresos</span><strong>${formatMoney(metrics.totalRevenue)}</strong></article></div>
    <div class="chart-grid">${demandChart(state.dashboard.byRoute, "Top 5 rutas con mayor demanda")}${demandChart(state.dashboard.byRoute, "Top 5 rutas con menor demanda", "asc")}</div>
    <section class="panel dashboard-table"><div class="panel-header"><div><h2>Salidas de transporte</h2><p class="helper">Pasajeros, ocupación e ingresos por salida.</p></div></div><div class="table-wrap"><table><thead><tr><th>Ruta</th><th>Salidas</th><th>Pasajeros</th><th>Ocupación</th><th>Ingresos</th></tr></thead><tbody>${routeRows}</tbody></table></div></section>
    <section class="panel dashboard-table"><div class="panel-header"><h2>Reservas recientes</h2></div><div class="table-wrap"><table><thead><tr><th>Referencia</th><th>Cliente</th><th>Ruta</th><th>Estado</th><th>Total</th></tr></thead><tbody>${reservationRows}</tbody></table></div></section>`;
}

function resourceTable(resource, items) {
  const readOnly = ["clients", "reservations", "sales"].includes(resource);
  const rows = items.map((item) => {
    let cells = "";
    if (resource === "roles") cells = `<td>${item.id}</td><td>${escapeHtml(item.name)}</td><td>${statusBadge(item.active ? "ACTIVE" : "INACTIVE")}</td><td>${escapeHtml((item.permissions || []).join(", "))}</td>`;
    if (resource === "users") cells = `<td>${escapeHtml(`${item.firstName} ${item.lastName}`)}</td><td>${escapeHtml(item.email)}</td><td>${escapeHtml(item.roleName)}</td><td>${statusBadge(item.active ? "ACTIVE" : "INACTIVE")}</td>`;
    if (resource === "vehicles") cells = `<td><strong>${escapeHtml(item.plateNumber)}</strong></td><td>${escapeHtml(`${item.brand} ${item.model}`)}</td><td>${item.capacity}</td><td>${statusBadge(item.status)}</td>`;
    if (resource === "routes") cells = `<td>${escapeHtml(item.origin)}</td><td>${escapeHtml(item.destination)}</td><td>${item.distanceKm} km</td><td>${formatMoney(item.price)}</td><td>${statusBadge(item.active ? "ACTIVE" : "INACTIVE")}</td>`;
    if (resource === "drivers") cells = `<td>${escapeHtml(`${item.user.firstName} ${item.user.lastName}`)}</td><td>${escapeHtml(item.licenseNumber)}</td><td>${escapeHtml(item.licenseType)}</td><td>${formatDate(item.licenseExpiryDate)}</td><td>${statusBadge(item.active ? "ACTIVE" : "INACTIVE")}</td>`;
    if (resource === "clients") cells = `<td>${escapeHtml(`${item.user.firstName} ${item.user.lastName}`)}</td><td>${escapeHtml(item.user.email)}</td><td>${escapeHtml(item.user.phone || "—")}</td><td>${statusBadge(item.active ? "ACTIVE" : "INACTIVE")}</td>`;
    if (resource === "schedules") cells = `<td>${escapeHtml(`${item.route.origin} - ${item.route.destination}`)}</td><td>${formatDate(item.date)} ${formatTime(item.time)}</td><td>${escapeHtml(item.vehicle.plateNumber)}</td><td>${escapeHtml(item.driver?.name || "Sin asignar")}</td><td>${item.availableSeats} cupos</td><td>${statusBadge(item.status)}</td>`;
    if (resource === "maintenances") cells = `<td>${escapeHtml(item.vehicle.plateNumber)}</td><td>${escapeHtml(item.type)}</td><td>${formatDate(item.date)}</td><td>${statusBadge(item.status)}</td>`;
    if (resource === "reservations") cells = `<td><strong>${escapeHtml(item.reference)}</strong></td><td>${escapeHtml(item.client.name)}</td><td>${escapeHtml(`${item.schedule.route.origin} - ${item.schedule.route.destination}`)}</td><td>${formatDate(item.schedule.date)} ${formatTime(item.schedule.time)}</td><td>${item.seatCount}</td><td>${statusBadge(item.status)}</td><td>${formatMoney(item.totalAmount)}</td>`;
    if (resource === "sales") cells = `<td><strong>${escapeHtml(item.receiptNumber)}</strong></td><td>${escapeHtml(item.reservation.reference)}</td><td>${formatDate(String(item.date || "").slice(0, 10))}</td><td>${escapeHtml(item.paymentMethod)}</td><td>${statusBadge(item.status)}</td><td>${formatMoney(item.amount)}</td>`;
    let actions = "";
    if (readOnly) {
      actions = `<button class="button small secondary" data-action="show-admin-detail" data-resource="${resource}" data-id="${item.id}">Ver detalle</button>`;
      if (resource === "reservations" && item.status === "PENDING" && item.paymentStatus !== "PAID") {
        actions += `<button class="button small danger" data-action="admin-cancel-reservation" data-id="${item.id}">Anular</button>`;
      }
    } else {
      actions = `<button class="button small secondary" data-action="edit-resource" data-resource="${resource}" data-id="${item.id}">Editar</button><button class="button small danger" data-action="delete-resource" data-resource="${resource}" data-id="${item.id}">Eliminar</button>`;
    }
    return `<tr>${cells}<td><div class="table-actions">${actions}</div></td></tr>`;
  }).join("");
  const headings = {
    roles: ["ID", "Rol", "Estado", "Permisos"], users: ["Nombre", "Correo", "Rol", "Estado"], vehicles: ["Placa", "Vehículo", "Capacidad", "Estado"], routes: ["Origen", "Destino", "Distancia", "Tarifa", "Estado"], drivers: ["Conductor", "Licencia", "Categoría", "Vencimiento", "Estado"], clients: ["Cliente", "Correo", "Teléfono", "Estado"], schedules: ["Ruta", "Fecha y hora", "Vehículo", "Conductor", "Cupos", "Estado"], maintenances: ["Vehículo", "Tipo", "Fecha", "Estado"], reservations: ["Reserva", "Cliente", "Ruta", "Salida", "Puestos", "Estado", "Total"], sales: ["Recibo", "Reserva", "Fecha", "Método", "Estado", "Valor"],
  }[resource] || [];
  if (!items.length) return `<div class="empty">No hay registros para mostrar en este módulo.</div>`;
  return `<div class="table-wrap"><table><thead><tr>${headings.map((heading) => `<th>${heading}</th>`).join("")}<th>Acciones</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function renderAdminManager() {
  const label = RESOURCE_LABELS[state.adminResource];
  const readOnly = ["clients", "reservations", "sales"].includes(state.adminResource);
  return `<section class="content-heading"><p class="eyebrow">Administración de la agencia</p><h1>${label}</h1><p>Consulta la información y gestiona los registros de este módulo.</p></section>
    <form id="admin-search" class="admin-search"><div class="field"><label for="admin-search-input">Buscar en ${label.toLowerCase()}</label><input id="admin-search-input" name="search" type="search" value="${escapeAttribute(state.adminSearch)}" placeholder="Escribe un nombre, ruta o estado" /></div><button class="button" type="submit">Buscar</button><button class="button secondary" type="button" data-action="clear-admin-search">Limpiar</button></form>
    <section class="panel resource-panel"><div class="panel-header"><div><span class="eyebrow">Módulo</span><h2>${label}</h2><p class="helper">${readOnly ? "Consulta registros y abre su detalle." : "Crea, edita o elimina registros. El sistema confirma antes de borrar."}</p></div>${readOnly ? "" : `<button class="button" data-action="add-resource" data-resource="${state.adminResource}">＋ Agregar ${RESOURCE_SINGULAR_LABELS[state.adminResource]}</button>`}</div>${resourceTable(state.adminResource, state.adminItems)}</section>`;
}

function renderClientBooking() {
  const cards = state.clientCatalog.length ? state.clientCatalog.map((schedule) => scheduleCard(schedule, "open-reservation")).join("") : `<div class="empty">No hay salidas disponibles con esos filtros.</div>`;
  return `<section class="content-heading"><p class="eyebrow">Reservas</p><h1>Encuentra tu salida</h1><p>Selecciona una ruta disponible y registra a los pasajeros de tu reserva.</p></section>${searchPanel("client-search", state.clientFilters || {})}<section style="margin-top:28px"><div class="schedule-grid">${cards}</div></section>`;
}

function reservationCard(reservation) {
  const line = `${reservation.schedule.route.origin} - ${reservation.schedule.route.destination}`;
  const details = `${formatDate(reservation.schedule.date)} · ${formatTime(reservation.schedule.time)} · ${reservation.seatCount} puesto${reservation.seatCount === 1 ? "" : "s"}`;
  const canPay = reservation.status !== "CANCELED" && reservation.paymentStatus !== "PAID";
  const canCancel = reservation.status === "PENDING" && reservation.paymentStatus !== "PAID";
  return `<article class="reservation"><div><h3>${escapeHtml(line)} ${statusBadge(reservation.status)}</h3><p>${details}</p><p><strong>${escapeHtml(reservation.reference)}</strong> · ${formatMoney(reservation.totalAmount)} · ${reservation.paymentStatus === "PAID" ? "Pago registrado" : "Pendiente de pago"}</p></div><div class="reservation-actions">${canPay ? `<button class="button accent small" data-action="open-payment" data-id="${reservation.id}">Pagar</button>` : ""}${canCancel ? `<button class="button danger small" data-action="cancel-reservation" data-id="${reservation.id}">Cancelar</button>` : ""}${reservation.sale ? `<button class="button secondary small" data-action="show-receipt" data-id="${reservation.id}">Recibo</button>` : ""}</div></article>`;
}

function renderClientReservations() {
  const cards = state.clientReservations.length ? state.clientReservations.map(reservationCard).join("") : `<div class="empty">Todavía no tienes reservas. Busca una ruta para comenzar.</div>`;
  const notifications = state.notifications.length ? state.notifications.slice(0, 5).map((notification) => `<div class="notification">${escapeHtml(notification.message)}<br><small class="helper">${new Date(notification.createdAt).toLocaleString("es-CO")}</small></div>`).join("") : `<p class="helper">No tienes notificaciones nuevas.</p>`;
  return `<section class="content-heading"><p class="eyebrow">Mi cuenta</p><h1>Mis reservas</h1><p>Revisa el estado, confirma el pago o cancela una reserva pendiente.</p></section><div class="dashboard-grid"><section class="panel"><div class="reservation-list">${cards}</div></section><aside class="panel"><h2>Notificaciones</h2>${notifications}</aside></div>`;
}

function renderDriver() {
  const shifts = state.driverSchedules.length ? state.driverSchedules.map((assignment) => {
    const schedule = assignment.schedule;
    return `<article class="reservation"><div><h3>${escapeHtml(`${schedule.route.origin} - ${schedule.route.destination}`)} ${statusBadge(assignment.status)}</h3><p>${formatDate(schedule.date)} · ${formatTime(schedule.time)} · Vehículo ${escapeHtml(schedule.vehicle.plateNumber)}</p><p>${schedule.availableSeats} cupos disponibles · ${schedule.route.estimatedDurationMinutes} minutos estimados</p></div><div class="reservation-actions"><button class="button secondary small" data-action="open-shift-request" data-id="${schedule.id}">Solicitar cambio</button></div></article>`;
  }).join("") : `<div class="empty">No tienes turnos asignados.</div>`;
  return `<section class="content-heading"><p class="eyebrow">Operación del conductor</p><h1>Programación de conductores</h1><p>Consulta las rutas, vehículos y horarios asignados a tu cuenta.</p></section><section class="panel"><div class="shift-list">${shifts}</div></section>`;
}

function renderDriverVehicles() {
  const vehicles = new Map();
  for (const assignment of state.driverSchedules) {
    const schedule = assignment.schedule;
    if (!vehicles.has(schedule.vehicle.plateNumber)) vehicles.set(schedule.vehicle.plateNumber, { vehicle: schedule.vehicle, schedules: [] });
    vehicles.get(schedule.vehicle.plateNumber).schedules.push(schedule);
  }
  const cards = [...vehicles.values()].map(({ vehicle, schedules }) => `<article class="vehicle-card"><div class="vehicle-card-head"><span class="vehicle-icon">🚌</span>${statusBadge(vehicle.status)}</div><p class="eyebrow">Vehículo asignado</p><h2>${escapeHtml(`${vehicle.brand} ${vehicle.model}`)}</h2><p class="vehicle-plate">${escapeHtml(vehicle.plateNumber)}</p><p class="helper">Capacidad: ${vehicle.capacity} pasajeros</p><div class="vehicle-routes">${schedules.map((schedule) => `<p><strong>${escapeHtml(`${schedule.route.origin} - ${schedule.route.destination}`)}</strong><br><span>${formatDate(schedule.date)} · ${formatTime(schedule.time)}</span></p>`).join("")}</div></article>`).join("");
  return `<section class="content-heading"><p class="eyebrow">Mi operación</p><h1>Vehículos asignados</h1><p>Vehículos que aparecen en tus programaciones de trabajo.</p></section><div class="vehicle-grid">${cards || `<div class="empty">No tienes vehículos asignados por el momento.</div>`}</div>`;
}

function field(label, name, value = "", type = "text", extra = "") {
  return `<div class="field"><label for="field-${name}">${label}</label><input id="field-${name}" name="${name}" type="${type}" value="${escapeAttribute(value)}" ${extra} /></div>`;
}

function selectField(label, name, options, value = "", extra = "") {
  return `<div class="field"><label for="field-${name}">${label}</label><select id="field-${name}" name="${name}" ${extra}>${options.map((option) => `<option value="${escapeAttribute(option.value)}" ${selected(String(option.value) === String(value))}>${escapeHtml(option.label)}</option>`).join("")}</select></div>`;
}

function activeCheckbox(value) {
  return `<div class="field"><label><input name="active" type="checkbox" ${checked(value !== false)} style="width:auto; margin-right:8px" /> Registro activo</label></div>`;
}

function resourceForm(resource, record = null) {
  const item = record || {};
  const title = (record ? "Editar " : "Agregar ") + RESOURCE_SINGULAR_LABELS[resource];
  const refs = state.references || { roles: [], users: [], vehicles: [], routes: [], drivers: [] };
  const roleOptions = refs.roles.map((role) => ({ value: role.id, label: role.name }));
  const driverUsers = refs.users.filter((user) => user.roleName === "Conductor").map((user) => ({ value: user.id, label: `${user.firstName} ${user.lastName} (${user.email})` }));
  const routeOptions = refs.routes.map((route) => ({ value: route.id, label: `${route.origin} - ${route.destination}` }));
  const vehicleOptions = refs.vehicles.map((vehicle) => ({ value: vehicle.id, label: `${vehicle.plateNumber} · ${vehicle.brand} ${vehicle.model}` }));
  const driverOptions = [{ value: "", label: "Sin asignar" }, ...refs.drivers.filter((driver) => driver.active).map((driver) => ({ value: driver.id, label: `${driver.user.firstName} ${driver.user.lastName}` }))];
  let fields = "";
  if (resource === "roles") fields = `${field("Nombre", "name", item.name, "text", "required")}<div class="field full"><label for="field-permissions">Permisos</label><input id="field-permissions" name="permissions" value="${escapeAttribute((item.permissions || []).join(", "))}" placeholder="administrar, reportar" /></div>${activeCheckbox(item.active)}`;
  if (resource === "users") fields = `${field("Nombres", "firstName", item.firstName, "text", "required")}${field("Apellidos", "lastName", item.lastName, "text", "required")}${field("Correo", "email", item.email, "email", "required")}${field("Teléfono", "phone", item.phone, "tel", "required")}${field("Tipo de documento", "documentType", item.documentType || "CC", "text", "required")}${field("Número de documento", "documentNumber", item.documentNumber, "text", "required")}${selectField("Rol", "roleId", roleOptions, item.roleId)}${field(record ? "Nueva contraseña (opcional)" : "Contraseña", "password", "", "password", record ? "" : "required")}${activeCheckbox(item.active)}`;
  if (resource === "vehicles") fields = `${field("Placa", "plateNumber", item.plateNumber, "text", "required")}${field("Marca", "brand", item.brand, "text", "required")}${field("Modelo", "model", item.model, "text", "required")}${field("Año", "year", item.year, "number", "min=1990 max=2100 required")}${field("Capacidad", "capacity", item.capacity, "number", "min=1 max=100 required")}${field("Kilometraje", "mileage", item.mileage || 0, "number", "min=0 required")}${selectField("Estado", "status", VEHICLE_STATUS_OPTIONS, item.status || "ACTIVE")}`;
  if (resource === "routes") fields = `${field("Origen", "origin", item.origin, "text", "required")}${field("Destino", "destination", item.destination, "text", "required")}${field("Distancia (km)", "distanceKm", item.distanceKm, "number", "min=1 required")}${field("Duración (minutos)", "estimatedDurationMinutes", item.estimatedDurationMinutes, "number", "min=5 required")}${field("Tarifa por pasajero", "price", item.price, "number", "min=1 required")}${activeCheckbox(item.active)}`;
  if (resource === "drivers") fields = `${selectField("Usuario conductor", "userId", driverUsers, item.userId)}${field("Número de licencia", "licenseNumber", item.licenseNumber, "text", "required")}${field("Categoría", "licenseType", item.licenseType, "text", "required")}${field("Vencimiento de licencia", "licenseExpiryDate", item.licenseExpiryDate, "date", "required")}${activeCheckbox(item.active)}`;
  if (resource === "schedules") fields = `${selectField("Ruta", "routeId", routeOptions, item.routeId)}${selectField("Vehículo", "vehicleId", vehicleOptions, item.vehicleId)}${selectField("Conductor asignado", "driverId", driverOptions, item.driver?.id || "")} ${field("Fecha", "date", item.date, "date", "required")}${field("Hora", "time", formatTime(item.time), "time", "required")}${selectField("Estado", "status", SCHEDULE_STATUS_OPTIONS, item.status || "SCHEDULED")}`;
  if (resource === "maintenances") fields = `${selectField("Vehículo", "vehicleId", vehicleOptions, item.vehicleId)}${field("Tipo", "type", item.type, "text", "required")}${field("Fecha", "date", item.date, "date", "required")}<div class="field full"><label for="field-notes">Detalle</label><textarea id="field-notes" name="notes" required>${escapeHtml(item.notes || "")}</textarea></div>${selectField("Estado", "status", [{ value: "OPEN", label: "Abierto" }, { value: "CLOSED", label: "Cerrado" }], item.status || "OPEN")}`;
  return `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-label="${escapeAttribute(title)}"><header class="modal-header"><div><h2>${title}</h2><p class="helper">Los campos marcados son necesarios para guardar el registro.</p></div><button class="icon-button" data-action="close-modal" aria-label="Cerrar">×</button></header><form id="resource-form" class="modal-body" data-resource="${resource}" data-id="${item.id || ""}"><div class="form-grid">${fields}</div><div class="form-actions"><button type="button" class="button secondary" data-action="close-modal">Cancelar</button><button class="button" type="submit">Guardar cambios</button></div></form></section></div>`;
}

const VEHICLE_STATUS_OPTIONS = [{ value: "ACTIVE", label: "Activo" }, { value: "MAINTENANCE", label: "Mantenimiento" }, { value: "INACTIVE", label: "Inactivo" }];
const SCHEDULE_STATUS_OPTIONS = [{ value: "SCHEDULED", label: "Programada" }, { value: "COMPLETED", label: "Completada" }, { value: "CANCELED", label: "Cancelada" }];

function renderPassengerFields() {
  const draft = state.reservationDraft;
  const count = draft.seatCount;
  return Array.from({ length: count }, (_, index) => {
    const defaultClient = index === 0 ? state.user : {};
    return `<div class="passenger-block"><h4>Pasajero ${index + 1}</h4><div class="form-grid">${field("Nombres", `passenger-${index}-firstName`, defaultClient.firstName || "", "text", "required")}${field("Apellidos", `passenger-${index}-lastName`, defaultClient.lastName || "", "text", "required")}${field("Tipo documento", `passenger-${index}-documentType`, defaultClient.documentType || "CC", "text", "required")}${field("Número documento", `passenger-${index}-documentNumber`, defaultClient.documentNumber || "", "text", "required")}</div></div>`;
  }).join("");
}

function loginModal() {
  return `<div class="modal-backdrop auth-screen"><section class="modal auth-modal" role="dialog" aria-modal="true" aria-label="Iniciar sesión"><header class="modal-header"><div><p class="eyebrow">Acceso al sistema</p><h2>Iniciar sesión</h2><p class="helper">Ingresa con el perfil asignado por la agencia.</p></div><button class="icon-button" data-action="close-modal" aria-label="Cerrar">×</button></header><form id="login-form" class="modal-body"><p class="auth-message">Cuentas de demostración: <strong>admin@transporte.local</strong>, <strong>conductor@transporte.local</strong> o <strong>cliente@transporte.local</strong>.</p><div class="form-grid">${field("Correo", "email", "", "email", "required")}<div class="field"><label for="field-password">Contraseña</label><input id="field-password" name="password" type="password" required /></div></div><p class="helper">Contraseñas demo: Admin123*, Conductor123* y Cliente123*.</p><div class="form-actions"><button type="button" class="form-link" data-action="open-recover">¿Olvidaste tu contraseña?</button><button class="button" type="submit">Entrar</button></div><p class="helper">¿No tienes cuenta? <button type="button" class="form-link" data-action="open-register">Regístrate como cliente</button>.</p></form></section></div>`;
}

function registerModal() {
  return `<div class="modal-backdrop auth-screen"><section class="modal auth-modal" role="dialog" aria-modal="true" aria-label="Crear cuenta"><header class="modal-header"><div><p class="eyebrow">Nuevo cliente</p><h2>Crear cuenta</h2><p class="helper">Completa tus datos para reservar viajes.</p></div><button class="icon-button" data-action="close-modal" aria-label="Cerrar">×</button></header><form id="register-form" class="modal-body"><div class="form-grid">${field("Nombres", "firstName", "", "text", "required")}${field("Apellidos", "lastName", "", "text", "required")}${field("Correo", "email", "", "email", "required")}${field("Teléfono", "phone", "", "tel", "required")}${field("Tipo documento", "documentType", "CC", "text", "required")}${field("Número documento", "documentNumber", "", "text", "required")}${field("Contraseña", "password", "", "password", "minlength=8 required")}</div><div class="form-actions"><button type="button" class="button secondary" data-action="open-login">Ya tengo cuenta</button><button class="button" type="submit">Crear cuenta</button></div></form></section></div>`;
}

function recoverModal() {
  const codeNote = state.recoveryCode ? `<p class="auth-message">Código de demostración: <strong>${escapeHtml(state.recoveryCode)}</strong>. En producción se envía por correo.</p>` : "";
  return `<div class="modal-backdrop auth-screen"><section class="modal auth-modal" role="dialog" aria-modal="true" aria-label="Recuperar contraseña"><header class="modal-header"><div><p class="eyebrow">Seguridad de la cuenta</p><h2>Recuperar contraseña</h2><p class="helper">Solicita un código temporal para actualizar tu contraseña.</p></div><button class="icon-button" data-action="close-modal" aria-label="Cerrar">×</button></header><form id="recover-form" class="modal-body">${codeNote}${field("Correo", "email", "", "email", "required")}<div class="form-actions"><button type="button" class="button secondary" data-action="open-login">Volver</button><button class="button" type="submit">Solicitar código</button></div></form>${state.recoveryCode ? `<form id="reset-form" class="modal-body" style="border-top:1px solid var(--line)"><div class="form-grid">${field("Correo", "email", "", "email", "required")}${field("Código", "code", state.recoveryCode, "text", "required")}${field("Nueva contraseña", "password", "", "password", "minlength=8 required")}</div><div class="form-actions"><button class="button" type="submit">Restablecer</button></div></form>` : ""}</section></div>`;
}

function reservationModal() {
  const schedule = state.reservationDraft.schedule;
  const draft = state.reservationDraft;
  return `<div class="modal-backdrop"><section class="modal booking-modal" role="dialog" aria-modal="true" aria-label="Crear reserva"><header class="modal-header"><div><p class="eyebrow">Confirma tu viaje</p><h2>Reservar salida</h2><p class="helper">${escapeHtml(`${schedule.route.origin} - ${schedule.route.destination}`)} · ${formatDate(schedule.date)} · ${formatTime(schedule.time)}</p></div><button class="icon-button" data-action="close-modal" aria-label="Cerrar">×</button></header><form id="reservation-form" class="modal-body booking-form">
    <section class="booking-step"><span class="step-number">1</span><div><h3>Información del viaje</h3><p>${escapeHtml(`${schedule.route.origin} → ${schedule.route.destination}`)} · ${formatDate(schedule.date)} a las ${formatTime(schedule.time)}</p></div></section>
    <section class="booking-section"><h3>2. Reserva de asientos</h3><div class="form-grid"><div class="field"><label for="reservation-seat-count">Cantidad de pasajeros</label><select id="reservation-seat-count" name="seatCount" data-action="reservation-seat-count">${[1,2,3,4,5,6,7,8].filter((number) => number <= schedule.availableSeats).map((number) => `<option value="${number}" ${selected(number === draft.seatCount)}>${number}</option>`).join("")}</select></div><div class="field"><label>Total estimado</label><input disabled value="${escapeAttribute(formatMoney(schedule.route.price * draft.seatCount))}" /></div></div></section>
    <section class="booking-section"><h3>3. Información de pasajeros</h3><p class="helper">Registra una persona por cada puesto seleccionado.</p>${renderPassengerFields()}</section>
    <section class="booking-section"><h3>4. Método de pago</h3><p class="helper">El registro del pago es una simulación académica; no se procesa dinero real.</p><div class="form-grid">${selectField("Selecciona un método", "paymentMethod", [{value:"CARD",label:"Tarjeta"},{value:"PSE",label:"PSE"},{value:"TRANSFER",label:"Transferencia"},{value:"CASH",label:"Efectivo"}], "CARD")}</div></section>
    <div class="form-actions"><button type="button" class="button secondary" data-action="close-modal">Cancelar</button><button class="button accent" type="submit">Confirmar reserva y pago</button></div></form></section></div>`;
}

function paymentModal() {
  const reservation = state.selectedPayment;
  return `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-label="Pagar reserva"><header class="modal-header"><div><h2>Confirmar pago</h2><p class="helper">${escapeHtml(reservation.reference)} · ${formatMoney(reservation.totalAmount)}</p></div><button class="icon-button" data-action="close-modal" aria-label="Cerrar">×</button></header><form id="payment-form" class="modal-body"><p class="auth-message">Esta demostración registra el pago y genera el recibo de la reserva.</p>${selectField("Método de pago", "paymentMethod", [{value:"CARD",label:"Tarjeta"},{value:"PSE",label:"PSE"},{value:"TRANSFER",label:"Transferencia"},{value:"CASH",label:"Efectivo"}], "CARD")}<div class="form-actions"><button type="button" class="button secondary" data-action="close-modal">Cancelar</button><button class="button accent" type="submit">Pagar ${formatMoney(reservation.totalAmount)}</button></div></form></section></div>`;
}

function shiftModal() {
  return `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-label="Solicitar cambio de turno"><header class="modal-header"><div><h2>Solicitar cambio de turno</h2><p class="helper">La solicitud quedará pendiente para revisión de administración.</p></div><button class="icon-button" data-action="close-modal" aria-label="Cerrar">×</button></header><form id="shift-form" class="modal-body"><div class="field"><label for="shift-reason">Motivo</label><textarea id="shift-reason" name="reason" required placeholder="Describe el motivo de tu solicitud."></textarea></div><div class="form-actions"><button type="button" class="button secondary" data-action="close-modal">Cancelar</button><button class="button" type="submit">Enviar solicitud</button></div></form></section></div>`;
}

function receiptModal() {
  const reservation = state.selectedPayment;
  return `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-label="Recibo de pago"><header class="modal-header"><div><h2>Recibo de pago</h2><p class="helper">Comprobante de Transporte Conexión</p></div><button class="icon-button" data-action="close-modal" aria-label="Cerrar">×</button></header><div class="modal-body"><p><strong>Recibo:</strong> ${escapeHtml(reservation.sale.receiptNumber)}</p><p><strong>Reserva:</strong> ${escapeHtml(reservation.reference)}</p><p><strong>Ruta:</strong> ${escapeHtml(`${reservation.schedule.route.origin} - ${reservation.schedule.route.destination}`)}</p><p><strong>Fecha:</strong> ${formatDate(reservation.schedule.date)} ${formatTime(reservation.schedule.time)}</p><p><strong>Monto pagado:</strong> ${formatMoney(reservation.sale.amount)}</p><p><strong>Método:</strong> ${escapeHtml(reservation.sale.paymentMethod)}</p><div class="form-actions"><button class="button" data-action="close-modal">Cerrar</button></div></div></section></div>`;
}

function resourceDetailModal() {
  const item = state.selectedResourceRecord;
  const resource = state.adminResource;
  if (!item) return "";
  let details = [];
  if (resource === "clients") details = [["Cliente", `${item.user.firstName} ${item.user.lastName}`], ["Correo", item.user.email], ["Teléfono", item.user.phone || "—"], ["Documento", `${item.user.documentType} ${item.user.documentNumber}`], ["Estado", item.active ? "Activo" : "Inactivo"]];
  if (resource === "reservations") details = [["Referencia", item.reference], ["Cliente", item.client.name], ["Correo", item.client.email], ["Ruta", `${item.schedule.route.origin} - ${item.schedule.route.destination}`], ["Salida", `${formatDate(item.schedule.date)} · ${formatTime(item.schedule.time)}`], ["Pasajeros", item.seatCount], ["Estado", item.status], ["Pago", item.paymentStatus], ["Total", formatMoney(item.totalAmount)]];
  if (resource === "sales") details = [["Recibo", item.receiptNumber], ["Reserva", item.reservation.reference], ["Cliente", item.reservation.client.name], ["Ruta", `${item.reservation.schedule.route.origin} - ${item.reservation.schedule.route.destination}`], ["Método de pago", item.paymentMethod], ["Estado", item.status], ["Valor", formatMoney(item.amount)]];
  const passengers = resource === "reservations" ? item.passengers.map((passenger) => `<li><strong>${escapeHtml(`${passenger.firstName} ${passenger.lastName}`)}</strong> · ${escapeHtml(`${passenger.documentType} ${passenger.documentNumber}`)}</li>`).join("") : "";
  return `<div class="modal-backdrop"><section class="modal detail-modal" role="dialog" aria-modal="true" aria-label="Detalle de ${escapeAttribute(RESOURCE_LABELS[resource])}"><header class="modal-header"><div><p class="eyebrow">Detalle del registro</p><h2>${escapeHtml(RESOURCE_LABELS[resource])}</h2></div><button class="icon-button" data-action="close-modal" aria-label="Cerrar">×</button></header><div class="modal-body"><dl class="detail-list">${details.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}</dl>${passengers ? `<section class="detail-passengers"><h3>Pasajeros</h3><ul>${passengers}</ul></section>` : ""}<div class="form-actions"><button class="button" data-action="close-modal">Cerrar</button></div></div></section></div>`;
}


function renderModal() {
  if (!state.modal) return "";
  if (state.modal === "detail") return resourceDetailModal();
  if (state.modal === "login") return loginModal();
  if (state.modal === "register") return registerModal();
  if (state.modal === "recover") return recoverModal();
  if (state.modal === "reservation") return reservationModal();
  if (state.modal === "payment") return paymentModal();
  if (state.modal === "resource") return resourceForm(state.adminResource, state.selectedResourceRecord);
  if (state.modal === "shift") return shiftModal();
  if (state.modal === "receipt") return receiptModal();
  return "";
}

function render() {
  if (state.loading) { app.innerHTML = `${publicHeader()}<div class="loading">Cargando Transporte Conexión…</div>`; return; }
  if (state.user) renderAuthed(); else renderPublic();
}

async function refreshAdmin() {
  const [dashboard, references] = await Promise.all([api("/api/admin/dashboard"), api("/api/admin/reference-data")]);
  state.dashboard = dashboard;
  state.references = references;
  if (state.view === "manage") state.adminItems = (await api(`/api/admin/${state.adminResource}`)).items;
}

async function refreshClient() {
  const [catalog, reservations, notifications] = await Promise.all([api("/api/catalog/schedules"), api("/api/client/reservations"), api("/api/notifications")]);
  state.clientCatalog = catalog.items;
  state.clientReservations = reservations.items;
  state.notifications = notifications.items;
}

async function refreshDriver() { state.driverSchedules = (await api("/api/driver/schedules")).items; }

async function refreshRoleData() {
  if (!state.user) return;
  if (state.user.role.name === "Administrador") await refreshAdmin();
  if (state.user.role.name === "Cliente") await refreshClient();
  if (state.user.role.name === "Conductor") await refreshDriver();
}

function resumePendingReservation() {
  if (!state.pendingScheduleId || state.user?.role?.name !== "Cliente") return;
  const schedule = state.clientCatalog.find((item) => item.id === state.pendingScheduleId);
  state.pendingScheduleId = null;
  if (!schedule) { toast("La salida ya no está disponible. Busca una nueva opción.", "error"); return; }
  state.reservationDraft = { schedule, seatCount: 1 };
  state.modal = "reservation";
}

async function boot() {
  try {
    if (state.token) {
      state.user = (await api("/api/auth/me")).user;
      state.view = state.user.role.name === "Administrador" ? "dashboard" : state.user.role.name === "Conductor" ? "shifts" : "book";
    }
  } catch { clearSession(); }
  try {
    if (state.user) await refreshRoleData();
    else state.publicCatalog = (await api("/api/catalog/schedules")).items;
  } catch (error) { toast(error.message, "error"); }
  state.loading = false;
  render();
}

async function selectAdminResource(resource) {
  state.adminResource = resource;
  state.adminSearch = "";
  state.adminItems = [];
  render();
  try { state.adminItems = (await api(`/api/admin/${resource}`)).items; } catch (error) { toast(error.message, "error"); }
  render();
}

async function downloadDashboard() {
  try {
    const filters = state.dashboard?.filters || {};
    const params = new URLSearchParams(Object.entries(filters).filter(([, value]) => value));
    const response = await api(`/api/admin/dashboard.csv?${params}`, { raw: true });
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = "indicadores-transporte.csv"; link.click(); URL.revokeObjectURL(url);
    toast("Reporte CSV descargado.");
  } catch (error) { toast(error.message, "error"); }
}

app.addEventListener("click", async (event) => {
  const trigger = event.target.closest("[data-action]");
  if (!trigger) return;
  const action = trigger.dataset.action;
  if (["open-login", "open-register", "open-recover"].includes(action)) {
    state.modal = action.replace("open-", "");
    if (action !== "open-recover") state.recoveryCode = "";
    render();
    return;
  }
  if (action === "close-modal") { state.modal = null; state.selectedResourceRecord = null; render(); return; }
  if (action === "logout") { clearSession(); state.modal = null; state.publicCatalog = (await api("/api/catalog/schedules")).items; render(); toast("Sesión cerrada."); return; }
  if (action === "go-home") { state.view = state.user?.role?.name === "Administrador" ? "dashboard" : state.user?.role?.name === "Cliente" ? "book" : "shifts"; render(); return; }
  if (action === "set-view") { state.view = trigger.dataset.view; if (state.view === "manage" && !state.adminItems.length) await selectAdminResource(state.adminResource); else render(); return; }
  if (action === "open-admin-module") { state.view = "manage"; state.selectedResourceRecord = null; await selectAdminResource(trigger.dataset.resource); return; }
  if (action === "clear-admin-search") { await selectAdminResource(state.adminResource); return; }
  if (action === "show-admin-detail") {
    state.adminResource = trigger.dataset.resource;
    state.selectedResourceRecord = state.adminItems.find((item) => item.id === Number(trigger.dataset.id));
    state.modal = "detail";
    render();
    return;
  }
  if (action === "open-reservation") {
    const id = Number(trigger.dataset.id);
    const schedule = [...state.clientCatalog, ...state.publicCatalog].find((item) => item.id === id);
    if (!schedule) { toast("No encontramos esa salida. Busca las rutas otra vez.", "error"); return; }
    if (!state.user) { state.pendingScheduleId = id; state.modal = "login"; render(); return; }
    if (state.user.role.name !== "Cliente") { toast("Inicia sesión con una cuenta de cliente para reservar.", "error"); return; }
    state.reservationDraft = { schedule, seatCount: 1 };
    state.modal = "reservation";
    render();
    return;
  }
  if (action === "add-resource") { state.adminResource = trigger.dataset.resource; state.selectedResourceRecord = null; state.modal = "resource"; render(); return; }
  if (action === "edit-resource") { state.adminResource = trigger.dataset.resource; state.selectedResourceRecord = state.adminItems.find((item) => item.id === Number(trigger.dataset.id)); state.modal = "resource"; render(); return; }
  if (action === "admin-cancel-reservation") {
    if (!window.confirm("¿Anular esta reserva pendiente?")) return;
    try {
      await api(`/api/client/reservations/${trigger.dataset.id}/status`, { method: "PATCH", body: { status: "CANCELED" } });
      await selectAdminResource("reservations");
      toast("Reserva anulada.");
    } catch (error) { toast(error.message, "error"); }
    return;
  }

  if (action === "delete-resource") {
    if (!window.confirm("¿Eliminar este registro? Esta acción no se puede deshacer.")) return;
    try { await api(`/api/admin/${trigger.dataset.resource}/${trigger.dataset.id}`, { method: "DELETE" }); await selectAdminResource(trigger.dataset.resource); toast("Registro eliminado."); } catch (error) { toast(error.message, "error"); }
    return;
  }
  if (action === "open-payment") { state.selectedPayment = state.clientReservations.find((item) => item.id === Number(trigger.dataset.id)); state.modal = "payment"; render(); return; }
  if (action === "cancel-reservation") {
    if (!window.confirm("¿Cancelar esta reserva pendiente?")) return;
    try { await api(`/api/client/reservations/${trigger.dataset.id}/status`, { method: "PATCH", body: { status: "CANCELED" } }); await refreshClient(); render(); toast("Reserva cancelada."); } catch (error) { toast(error.message, "error"); }
    return;
  }
  if (action === "show-receipt") { state.selectedPayment = state.clientReservations.find((item) => item.id === Number(trigger.dataset.id)); state.modal = "receipt"; render(); return; }
  if (action === "open-shift-request") { state.selectedScheduleId = Number(trigger.dataset.id); state.modal = "shift"; render(); return; }
  if (action === "download-dashboard") { await downloadDashboard(); return; }
});

app.addEventListener("change", (event) => {
  if (event.target.dataset.action === "reservation-seat-count") {
    state.reservationDraft.seatCount = Number(event.target.value);
    render();
  }
});

app.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.target;
  const fields = Object.fromEntries(new FormData(form).entries());
  try {
    if (form.id === "login-form") {
      saveSession(await api("/api/auth/login", { method: "POST", body: fields }));
      await refreshRoleData(); resumePendingReservation(); render(); toast("Bienvenido de nuevo."); return;
    }
    if (form.id === "register-form") {
      saveSession(await api("/api/auth/register", { method: "POST", body: fields }));
      await refreshRoleData(); resumePendingReservation(); render(); toast("Cuenta creada correctamente."); return;
    }
    if (form.id === "recover-form") {
      const response = await api("/api/auth/recovery", { method: "POST", body: fields }); state.recoveryCode = response.developmentCode || ""; render(); toast(response.message); return;
    }
    if (form.id === "reset-form") {
      const response = await api("/api/auth/reset", { method: "POST", body: fields }); state.modal = "login"; state.recoveryCode = ""; render(); toast(response.message); return;
    }
    if (form.id === "public-search") { state.publicCatalog = (await api(`/api/catalog/schedules?${new URLSearchParams(fields)}`)).items; render(); return; }
    if (form.id === "client-search") { state.clientFilters = fields; state.clientCatalog = (await api(`/api/catalog/schedules?${new URLSearchParams(fields)}`)).items; render(); return; }
    if (form.id === "admin-search") {
      state.adminSearch = String(fields.search || "").trim();
      const query = state.adminSearch ? `?${new URLSearchParams({ search: state.adminSearch })}` : "";
      state.adminItems = (await api(`/api/admin/${state.adminResource}${query}`)).items;
      render(); return;
    }
    if (form.id === "reservation-form") {
      const passengers = Array.from({ length: state.reservationDraft.seatCount }, (_, index) => ({
        firstName: fields[`passenger-${index}-firstName`],
        lastName: fields[`passenger-${index}-lastName`],
        documentType: fields[`passenger-${index}-documentType`],
        documentNumber: fields[`passenger-${index}-documentNumber`],
        isClient: index === 0,
      }));
      const created = await api("/api/client/reservations", { method: "POST", body: {
        scheduleId: state.reservationDraft.schedule.id,
        seatCount: state.reservationDraft.seatCount,
        passengers,
      } });
      try {
        await api(`/api/client/reservations/${created.item.id}/pay`, { method: "POST", body: { paymentMethod: fields.paymentMethod } });
        state.modal = null; await refreshClient(); state.view = "reservations"; render();
        toast("Reserva confirmada. El pago se registró en modo de demostración.");
      } catch (paymentError) {
        state.modal = null; await refreshClient(); state.view = "reservations"; render();
        toast(`La reserva se creó, pero el pago quedó pendiente: ${paymentError.message}`, "error");
      }
      return;
    }
    if (form.id === "payment-form") {
      await api(`/api/client/reservations/${state.selectedPayment.id}/pay`, { method: "POST", body: fields }); state.modal = null; await refreshClient(); render(); toast("Pago registrado y reserva confirmada."); return;
    }
    if (form.id === "resource-form") {
      const resource = form.dataset.resource; const id = form.dataset.id;
      if (resource === "roles") fields.permissions = String(fields.permissions || "").split(",").map((value) => value.trim()).filter(Boolean);
      if (["roles", "users", "routes", "drivers"].includes(resource)) fields.active = form.elements.active?.checked !== false;
      const endpoint = `/api/admin/${resource}${id ? `/${id}` : ""}`;
      await api(endpoint, { method: id ? "PUT" : "POST", body: fields });
      state.modal = null; state.selectedResourceRecord = null; await refreshAdmin(); state.adminItems = (await api(`/api/admin/${resource}`)).items; render(); toast("Registro guardado correctamente."); return;
    }
    if (form.id === "dashboard-filter") { state.dashboard = await api(`/api/admin/dashboard?${new URLSearchParams(fields)}`); render(); return; }
    if (form.id === "shift-form") { await api(`/api/driver/schedules/${state.selectedScheduleId}/change-request`, { method: "POST", body: fields }); state.modal = null; render(); toast("Solicitud enviada a administración."); return; }
  } catch (error) { toast(error.message, "error"); }
});

boot();
