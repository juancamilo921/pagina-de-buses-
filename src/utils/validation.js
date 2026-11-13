"use strict";

const { AppError } = require("../core/http");

function required(value, label) {
  if (value === undefined || value === null || String(value).trim() === "") throw new AppError(422, `${label} es obligatorio.`);
  return value;
}

function text(value, label, { min = 0, max = 255, required: isRequired = false } = {}) {
  if (isRequired) required(value, label);
  if (value === undefined || value === null || value === "") return "";
  const clean = String(value).trim();
  if (clean.length < min || clean.length > max) throw new AppError(422, `${label} debe tener entre ${min} y ${max} caracteres.`);
  return clean;
}

function number(value, label, { min = -Infinity, max = Infinity, integer = false, required: isRequired = false } = {}) {
  if (isRequired) required(value, label);
  if (value === undefined || value === null || value === "") return null;
  const converted = Number(value);
  if (!Number.isFinite(converted) || (integer && !Number.isInteger(converted)) || converted < min || converted > max) {
    throw new AppError(422, `${label} no tiene un valor válido.`);
  }
  return converted;
}

function oneOf(value, allowed, label) {
  if (!allowed.includes(value)) throw new AppError(422, `${label} debe ser uno de: ${allowed.join(", ")}.`);
  return value;
}

function email(value, requiredValue = true) {
  const clean = text(value, "Correo", { min: 5, max: 120, required: requiredValue }).toLowerCase();
  if (clean && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) throw new AppError(422, "El correo no tiene un formato válido.");
  return clean;
}

function date(value, label, requiredValue = true) {
  const clean = text(value, label, { min: 10, max: 10, required: requiredValue });
  if (clean && !/^\d{4}-\d{2}-\d{2}$/.test(clean)) throw new AppError(422, `${label} debe usar el formato AAAA-MM-DD.`);
  return clean;
}

function time(value, label, requiredValue = true) {
  const clean = text(value, label, { min: 5, max: 8, required: requiredValue });
  if (clean && !/^\d{2}:\d{2}(:\d{2})?$/.test(clean)) throw new AppError(422, `${label} debe usar el formato HH:MM.`);
  return clean.length === 5 ? `${clean}:00` : clean;
}

module.exports = { required, text, number, oneOf, email, date, time };
