import { del, get, set, update } from "idb-keyval";
import { CommonDataStorageAPI } from "../interfaces/dataStorage";
import { NoExtraProperties } from "../interfaces/misc";
import { DatabaseUpstreamEvents } from "../interfaces/internalEvents";

export class IndexDBStore<T = any> implements CommonDataStorageAPI<T> {
  logging;
  eventHandler;
  constructor(
    logging: boolean = false,
    eventHandler: (event: DatabaseUpstreamEvents<T>) => void
  ) {
    this.eventHandler = eventHandler;
    this.logging = logging;
  }
  createData(key: string, data: NoExtraProperties<T>) {
    set(key, data)
      .then((r) => {
        this.logging && console.log(`Database Value:${key} created`);
      })
      .catch((r) => {
        this.logging &&
          console.log(`Database Value:${key} creation failed ${r}`);
      });
  }
  async getData(key: string) {
    const data = await get<T>(key);
    if (!data) {
      throw Error(`Key ${key} does not exists!`);
    }
    return data;
  }
  updateData(key: string, fn: (old: T | undefined) => NoExtraProperties<T>) {
    update(key, fn)
      .then((r) => {
        this.logging && console.log(`Database Value:${key} updated`);
        this.getData(key).then((data) =>
          this.eventHandler({ data: data, event: "update", key })
        );
      })
      .catch((r) => {
        this.logging && console.log(`Database Value:${key} update failed ${r}`);
      });
  }
  deleteData(key: string) {
    del(key);
  }
  createOrUpdateData(
    key: string,
    fn: (old: T | undefined) => NoExtraProperties<T>
  ) {
    this.getData(key)
      .then((currentShape) => {
        this.updateData(key, fn);
      })
      .catch((err) => {
        this.createData(key, fn(undefined));
      });
  }
}
