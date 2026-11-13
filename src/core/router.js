"use strict";

const { AppError } = require("./http");

function compilePath(pattern) {
  const keys = [];
  const escaped = pattern
    .split("/")
    .map((segment) => {
      if (segment.startsWith(":")) {
        keys.push(segment.slice(1));
        return "([^/]+)";
      }
      return segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("/");
  return { regex: new RegExp(`^${escaped}/?$`), keys };
}

class Router {
  constructor() {
    this.routes = [];
  }

  add(method, pattern, handler) {
    const { regex, keys } = compilePath(pattern);
    this.routes.push({ method: method.toUpperCase(), pattern, regex, keys, handler });
    return this;
  }

  get(pattern, handler) { return this.add("GET", pattern, handler); }
  post(pattern, handler) { return this.add("POST", pattern, handler); }
  put(pattern, handler) { return this.add("PUT", pattern, handler); }
  patch(pattern, handler) { return this.add("PATCH", pattern, handler); }
  delete(pattern, handler) { return this.add("DELETE", pattern, handler); }

  async dispatch(req, res, context) {
    const route = this.routes.find((candidate) => candidate.method === req.method && candidate.regex.test(context.pathname));
    if (!route) throw new AppError(404, "Recurso no encontrado.");
    const match = route.regex.exec(context.pathname);
    const params = Object.fromEntries(route.keys.map((key, index) => [key, decodeURIComponent(match[index + 1])]));
    return route.handler(req, res, { ...context, params });
  }
}

module.exports = { Router };
