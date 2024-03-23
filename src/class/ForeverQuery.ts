import { CacheContent, Cached, DirtyCache } from "../caches/cacheInterface";
import { HookCache, HookContent } from "../hooks/hookInterface";
import { HookManager, CacheManager } from "./DataManager";

export type PushMutationCall<
  OriginalData = any,
  MutationResponse = any,
  MutationError = any,
  MutatetData = any
> = (
  key: string,
  mutateData: DirtyCache<
    OriginalData,
    MutationResponse,
    MutationError,
    MutatetData
  >,
  mutateMerger?:
    | ((
        oldMutateCache: MutatetData,
        newMutatedCache: MutatetData
      ) => MutatetData)
    | undefined
) => void;

export interface ForeverQuerySettings {
  logging?: "debug" | "info" | "error";
  silentError?: boolean;
  actionInterval?: number;
}

export class ForeverQuery {
  private cacheManager: CacheManager;
  private hookManager: HookManager;
  private runtime: NodeJS.Timeout | undefined = undefined;
  private logging;
  private silentError;
  private actionInterval;

  constructor(settings?: ForeverQuerySettings) {
    this.logging = settings?.logging ?? "debug";
    this.silentError = settings?.silentError ?? false;
    this.actionInterval = settings?.actionInterval ?? 2000;
    this.runtime = setInterval(this.updater.bind(this), this.actionInterval);
    this.cacheManager = new CacheManager();
    this.hookManager = new HookManager();
  }
  updater = () => {
    this.sync();
    this.mutate();
  };
  createCacheKey(key: string, data: Cached) {
    if (this.cacheManager.getAvailableKeys().includes(key)) {
      const currentCache = this.cacheManager.getCacheByKey(key);
      return this.cacheManager.createCacheByKey(
        key,
        Object.keys(currentCache).reduce(
          (res, curr) => {
            if (
              ["fetchFn"].includes(curr) &&
              curr in data &&
              data[curr as keyof Cached] != null
            ) {
              res[curr as keyof Cached] = data[curr as keyof Cached];
            }
            return res;
          },
          { ...currentCache }
        )
      );
    } else {
      return this.cacheManager.createCacheByKey(key, data);
    }
  }
  createWatcher(data: HookCache) {
    return this.hookManager.createWatcher(data);
  }

  getCacheKey(key: string) {
    return () => this.cacheManager.getCacheByKeyCallback(key);
  }

  callUpdaters(key: string, udpatedCache: Cached) {
    this.hookManager.getWatchersByKey(key).hooks.forEach((h) => {
      if (h.updater != undefined) h.updater(() => udpatedCache);
    });
  }

  updateCacheKey(key: string, data: Partial<Omit<Cached, "fetchFn">>) {
    const udpatedCache = { ...this.cacheManager.getCacheByKey(key), ...data };
    this.cacheManager.putCacheByKey(key, udpatedCache);
    this.callUpdaters(key, udpatedCache);
  }

  pushMutation<
    OriginalData = any,
    MutationResponse = any,
    MutationError = any,
    MutatetData = any
  >(
    key: string,
    mutateData: DirtyCache<
      OriginalData,
      MutationResponse,
      MutationError,
      MutatetData
    >,
    mutateMerger?: (
      oldMutateCache: MutatetData,
      newMutatedCache: MutatetData
    ) => MutatetData
  ) {
    if (!this.cacheManager.getAvailableKeys().includes(key)) {
      console.log("Key is not ready!");
      return;
    }
    const cache = this.cacheManager.getCacheByKey(key);
    let dirt: DirtyCache<
      OriginalData,
      MutationResponse,
      MutationError,
      MutatetData
    >;
    if (cache.dirty) {
      dirt = {
        ...cache.dirty,
        ...mutateData,
        mutationFn: cache.dirty.mutationFn,
        onSuccess: cache.dirty.onSuccess.concat(...mutateData.onSuccess),
        onError: cache.dirty.onError.concat(...mutateData.onError),
        data: mutateMerger
          ? mutateMerger(cache.dirty.data, mutateData.data)
          : mutateData.data,
      };
    } else {
      dirt = mutateData;
    }
    const updater = {
      ...cache,
      dirty: dirt,
    };

    this.cacheManager.putCacheByKey(key, updater);
    this.callUpdaters(key, updater);
  }

  sync() {
    const now = Date.now();
    this.cacheManager.getAvailableKeys().forEach((hookKey) => {
      const cacheData = this.cacheManager.getCacheByKey(hookKey);
      const hookData = this.hookManager.getWatchersByKey(hookKey);

      if (cacheData.dirty || !cacheData.fetchFn) return;

      if (
        cacheData.fetcherStatus === "loading" ||
        cacheData.state === "mutating"
      ) {
        console.log(
          `${hookKey} is ${cacheData.state} and ${cacheData.fetcherStatus}`
        );
        return;
      }
      if (cacheData.refetchedAt && cacheData.lastFetchResult === "success") {
        if (hookData.min === -1 || now - cacheData.refetchedAt < hookData.min) {
          console.log("Skipped");
          return;
        } else {
        }
      }
      this.updateCacheKey(hookKey, { fetcherStatus: "loading" });

      cacheData
        .fetchFn()
        .then((data) => {
          this.updateCacheKey(hookKey, {
            data,
            lastFetchResult: "success",
            fetcherStatus: "idle",
            refetchedAt: Date.now(),
          });
        })
        .catch((res) => {
          this.updateCacheKey(hookKey, {
            fetcherStatus: "idle",
            lastFetchResult: "failed",
          });
        });
    });
  }
  mutate() {
    const now = Date.now();
    this.cacheManager.getAvailableKeys().forEach((hookKey) => {
      const cacheData = this.cacheManager.getCacheByKey(hookKey);
      const dirtyCache = cacheData.dirty;
      if (
        dirtyCache == null ||
        dirtyCache.executeBy === null ||
        cacheData.fetcherStatus === "loading"
      ) {
        console.log(`Mutation is not due${JSON.stringify(dirtyCache)}`);
        return;
      }
      if (dirtyCache.executeBy > now) {
        console.log("Mutation is not due");
        return;
      }
      this.updateCacheKey(hookKey, { dirty: undefined, state: "mutating" });
      dirtyCache
        .mutationFn(dirtyCache.data)
        .then((res) => {
          dirtyCache.onSuccess.forEach((succ) => {
            succ(dirtyCache.data, res);
          });
          this.updateCacheKey(hookKey, { state: "idle" });
          dirtyCache.merger &&
            this.updateCacheKey(hookKey, {
              data: dirtyCache.merger(
                this.getCacheKey(hookKey)(),
                dirtyCache.data,
                res
              ),
            });
        })
        .catch((res) => {
          dirtyCache.onError.forEach((err) => {
            err(dirtyCache.data, res);
          });
        });
    });
  }
}
