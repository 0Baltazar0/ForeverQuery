import { CommonDataStorageAPI } from "../interfaces/dataStorage";
import { DatabaseUpstreamEvents } from "../interfaces/internalEvents";

export class MemDB<T = any> implements CommonDataStorageAPI<T> {
  logging;
  eventHandler;

  data: { [key: string]: T } = {};
  constructor(
    logging: boolean = false,
    eventHandler: (event: DatabaseUpstreamEvents<T>) => void
  ) {
    this.logging = logging;
    this.eventHandler = eventHandler;
  }
  createData(key: string, data: T) {
    this.data[key] = data;
  }
  updateData(key: string, fn: (old: T | undefined) => T) {
    this.data[key] = fn(this.data[key]);
    this.eventHandler({ data: this.data[key], event: "update", key });
  }
  deleteData(key: string) {
    delete this.data[key];
  }
  async getData(key: string) {
    return this.data[key];
  }
  createOrUpdateData(key: string, fn: (old: T | undefined) => T) {
    if (key in this.data) {
      this.updateData(key, fn);
    } else this.createData(key, fn(undefined));
  }
}
