"use strict";

const { AppError } = require("../core/http");
const { passwordHash, verifyPassword, issueToken, verifyToken, randomCode } = require("../utils/security");
const { text, email } = require("../utils/validation");
const { nextId } = require("../repositories/transport-repository");

class AuthService {
  constructor(store, tokenSecret) {
    this.store = store;
    this.tokenSecret = tokenSecret;
  }

  publicUser(data, user) {
    const role = data.roles.find((entry) => entry.id === user.roleId);
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      documentType: user.documentType,
      documentNumber: user.documentNumber,
      active: user.active,
      role: role ? { id: role.id, name: role.name, permissions: role.permissions || [] } : null,
    };
  }

  session(data, user) {
    const safeUser = this.publicUser(data, user);
    return {
      token: issueToken({ userId: user.id, roleId: user.roleId }, this.tokenSecret),
      user: safeUser,
    };
  }

  async login(payload) {
    const userEmail = email(payload.email);
    const password = text(payload.password, "Contraseña", { min: 1, max: 200, required: true });
    const data = await this.store.read();
    const user = data.users.find((entry) => entry.email === userEmail);
    if (!user || !user.active || !verifyPassword(password, user.passwordHash)) {
      throw new AppError(401, "Correo o contraseña incorrectos.");
    }
    const role = data.roles.find((entry) => entry.id === user.roleId);
    if (!role || !role.active) throw new AppError(403, "La cuenta no tiene un rol activo.");
    return this.session(data, user);
  }

  async register(payload) {
    const user = await this.store.transaction((data) => {
      const userEmail = email(payload.email);
      const documentNumber = text(payload.documentNumber, "Número de documento", { min: 4, max: 50, required: true });
      const password = text(payload.password, "Contraseña", { min: 8, max: 100, required: true });
      if (data.users.some((entry) => entry.email === userEmail)) throw new AppError(409, "Ya existe una cuenta con ese correo.");
      if (data.users.some((entry) => entry.documentNumber === documentNumber)) throw new AppError(409, "Ya existe una cuenta con ese documento.");
      const clientRole = data.roles.find((entry) => entry.name === "Cliente" && entry.active);
      if (!clientRole) throw new AppError(500, "No existe un rol de cliente disponible.");
      const created = {
        id: nextId(data, "users"),
        email: userEmail,
        passwordHash: passwordHash(password),
        firstName: text(payload.firstName, "Nombres", { min: 2, max: 50, required: true }),
        lastName: text(payload.lastName, "Apellidos", { min: 2, max: 50, required: true }),
        phone: text(payload.phone, "Teléfono", { min: 7, max: 20, required: true }),
        documentType: text(payload.documentType || "CC", "Tipo de documento", { min: 2, max: 20, required: true }),
        documentNumber,
        roleId: clientRole.id,
        active: true,
        createdAt: new Date().toISOString(),
      };
      data.users.push(created);
      data.clients.push({ id: nextId(data, "clients"), userId: created.id, preference: "", active: true, createdAt: created.createdAt });
      return created;
    });
    const data = await this.store.read();
    return this.session(data, data.users.find((entry) => entry.id === user.id));
  }

  async authenticate(token) {
    const payload = verifyToken(token, this.tokenSecret);
    const data = await this.store.read();
    const user = data.users.find((entry) => entry.id === payload.userId && entry.active);
    if (!user) throw new AppError(401, "La cuenta no está disponible.");
    return this.publicUser(data, user);
  }

  async recover(payload) {
    const userEmail = email(payload.email);
    let devCode = null;
    await this.store.transaction((data) => {
      const user = data.users.find((entry) => entry.email === userEmail && entry.active);
      if (!user) return;
      const code = randomCode();
      data.passwordResets = data.passwordResets.filter((entry) => entry.userId !== user.id);
      data.passwordResets.push({ userId: user.id, code, expiresAt: Date.now() + 15 * 60 * 1000 });
      if (process.env.NODE_ENV !== "production") devCode = code;
    });
    return {
      message: "Si el correo está registrado, recibirás las instrucciones para restablecer la contraseña.",
      developmentCode: devCode,
    };
  }

  async reset(payload) {
    const userEmail = email(payload.email);
    const code = text(payload.code, "Código", { min: 6, max: 6, required: true });
    const password = text(payload.password, "Contraseña", { min: 8, max: 100, required: true });
    await this.store.transaction((data) => {
      const user = data.users.find((entry) => entry.email === userEmail);
      const reset = user && data.passwordResets.find((entry) => entry.userId === user.id && entry.code === code);
      if (!reset || reset.expiresAt < Date.now()) throw new AppError(422, "El código no es válido o expiró.");
      user.passwordHash = passwordHash(password);
      data.passwordResets = data.passwordResets.filter((entry) => entry !== reset);
    });
    return { message: "La contraseña se actualizó correctamente." };
  }
}

module.exports = { AuthService };
