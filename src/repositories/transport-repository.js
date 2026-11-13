"use strict";

const { AppError } = require("../core/http");

function nextId(data, collection) {
  const entries = data[collection] || [];
  return entries.reduce((highest, entry) => Math.max(highest, Number(entry.id) || 0), 0) + 1;
}

function byId(data, collection, id, label = "Registro") {
  const item = (data[collection] || []).find((entry) => Number(entry.id) === Number(id));
  if (!item) throw new AppError(404, `${label} no encontrado.`);
  return item;
}

function findOne(data, collection, predicate) {
  return (data[collection] || []).find(predicate);
}

function removeById(data, collection, id, label = "Registro") {
  const position = (data[collection] || []).findIndex((entry) => Number(entry.id) === Number(id));
  if (position < 0) throw new AppError(404, `${label} no encontrado.`);
  return data[collection].splice(position, 1)[0];
}

module.exports = { nextId, byId, findOne, removeById };
