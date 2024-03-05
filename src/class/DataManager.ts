import { CacheContent, Cached } from "../caches/cacheInterface";
import { HookCache, HookContent } from "../hooks/hookInterface";

export class CacheManager {
  private SCHEMAS: CacheContent = {};

  getAvailableKeys() {
    return Object.keys(this.SCHEMAS);
  }
  getCacheByKey(key: string) {
    if (key in this.SCHEMAS == false) throw Error("Key not in schemas");

    return this.SCHEMAS[key];
  }
  getCacheByKeyCallback(key: string) {
    return () => this.getCacheByKey(key);
  }
  putCacheByKey(key: string, data: CacheContent[keyof CacheContent]) {
    return (this.SCHEMAS[key] = data);
  }
  deleteCache(key: string) {
    delete this.SCHEMAS[key];
  }
  createCacheByKey(key: string, data: Cached) {
    if (key in this.SCHEMAS) return () => this.SCHEMAS[key];
    else {
      this.SCHEMAS[key] = data;
    }
    return () => this.SCHEMAS[key];
  }
}

export class HookManager {
  private HOOKS: HookContent = {};

  hasKey(key: string) {
    return key in this.HOOKS;
  }

  getWatchersByKey(key: string) {
    if (key in this.HOOKS == false) throw Error("Key not in schemas");

    return this.HOOKS[key];
  }
  putWatchersByKey(key: string, data: HookContent[keyof HookContent]) {
    return (this.HOOKS[key] = data);
  }
  deleteWatchers(key: string) {
    delete this.HOOKS[key];
  }
  private mergeWatchers(
    raw: HookContent[keyof HookContent],
    entry: HookCache
  ): HookContent[keyof HookContent] {
    const hookIds = raw.hooks.map((h) => h.regId);
    if (hookIds.includes(entry.regId)) {
      return {
        ...raw,
        hooks: raw.hooks.map((h) => {
          if (h.regId === entry.regId) return entry;
          return h;
        }),
      };
    }
    return { ...raw, hooks: [...raw.hooks, entry] };
  }
  private removeWatcher(
    raw: HookContent[keyof HookContent],
    entry: HookCache
  ): HookContent[keyof HookContent] {
    return { ...raw, hooks: raw.hooks.filter((h) => h.regId != entry.regId) };
  }

  private recalculateRefetchInterval(
    raw: HookContent[keyof HookContent]
  ): HookContent[keyof HookContent] {
    const minPositive = raw.hooks
      .filter((h) => h.refetchInterval > 0)
      .map((h) => h.refetchInterval);
    if (minPositive.length > 0)
      return { ...raw, min: Math.min(...minPositive) };
    return { ...raw, min: -1 };
  }

  createWatcher(data: HookCache) {
    if (this.hasKey(data.key)) {
      this.putWatchersByKey(
        data.key,
        this.recalculateRefetchInterval(
          this.mergeWatchers(this.getWatchersByKey(data.key), data)
        )
      );
      return;
    }
    this.putWatchersByKey(data.key, {
      hooks: [data],
      min: data.refetchInterval,
    });
    return;
  }
  updateWatcher(data: HookCache) {
    if (this.hasKey(data.key)) {
      this.putWatchersByKey(
        data.key,
        this.recalculateRefetchInterval(
          this.mergeWatchers(this.getWatchersByKey(data.key), data)
        )
      );
      return;
    } else {
      throw Error("Hook watcher not in Hooks!");
    }
  }
  unRegisterWatcher(data: HookCache) {
    if (this.hasKey(data.key)) {
      this.putWatchersByKey(
        data.key,
        this.recalculateRefetchInterval(
          this.removeWatcher(this.getWatchersByKey(data.key), data)
        )
      );
      return;
    } else {
      throw Error("Hook watcher not in Hooks!");
    }
  }
}
