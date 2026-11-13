"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const { createInitialData } = require("../data/default-data");

class FileStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.queue = Promise.resolve();
  }

  async initialize() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    try {
      await fs.access(this.filePath);
    } catch {
      await this.save(createInitialData());
    }
  }

  async load() {
    const content = await fs.readFile(this.filePath, "utf8");
    return JSON.parse(content);
  }

  async save(data) {
    const temporary = `${this.filePath}.tmp`;
    await fs.writeFile(temporary, JSON.stringify(data, null, 2), "utf8");
    await fs.rename(temporary, this.filePath);
  }

  async read() {
    await this.queue;
    return this.load();
  }

  async transaction(work) {
    const operation = this.queue.then(async () => {
      const data = await this.load();
      const result = await work(data);
      await this.save(data);
      return result;
    });
    this.queue = operation.catch(() => undefined);
    return operation;
  }
}

module.exports = { FileStore };
