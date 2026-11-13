"use strict";

const crypto = require("node:crypto");
const { AppError } = require("../core/http");

function passwordHash(password, salt = crypto.randomBytes(16).toString("hex")) {
  const derived = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return `scrypt$${salt}$${derived}`;
}

function verifyPassword(password, stored) {
  if (!stored || !stored.startsWith("scrypt$")) return false;
  const [, salt, expected] = stored.split("$");
  const actual = passwordHash(password, salt).split("$")[2];
  return expected.length === actual.length && crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(actual, "hex"));
}

function toBase64Url(value) {
  return Buffer.from(value).toString("base64url");
}

function fromBase64Url(value) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sign(value, secret) {
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

function issueToken(payload, secret, lifetimeSeconds = 8 * 60 * 60) {
  const encoded = toBase64Url(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + lifetimeSeconds }));
  return `${encoded}.${sign(encoded, secret)}`;
}

function verifyToken(token, secret) {
  if (!token || !token.includes(".")) throw new AppError(401, "Debes iniciar sesión para continuar.");
  const [encoded, signature] = token.split(".");
  const expected = sign(encoded, secret);
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    throw new AppError(401, "La sesión no es válida.");
  }
  let payload;
  try {
    payload = JSON.parse(fromBase64Url(encoded));
  } catch {
    throw new AppError(401, "La sesión no es válida.");
  }
  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) throw new AppError(401, "La sesión expiró. Inicia sesión de nuevo.");
  return payload;
}

function getBearerToken(headers) {
  const value = headers.authorization || "";
  return value.startsWith("Bearer ") ? value.slice(7) : null;
}

function randomCode() {
  return String(crypto.randomInt(100000, 1000000));
}

module.exports = {
  passwordHash,
  verifyPassword,
  issueToken,
  verifyToken,
  getBearerToken,
  randomCode,
};
