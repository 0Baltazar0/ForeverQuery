export type fetcherStatus = "idle" | "loading";
export type lastResult = "success" | "failed" | null;
export type cacheStates = "idle" | "mutating";
export const STARTER_CACHE: Omit<Cached, "fetchFn"> = {
  data: undefined,
  fetcherStatus: "idle",
  state: "idle",
  refetchedAt: null,
  lastFetchResult: null,
  dirty: null,
};

export interface CacheUpdate {
  data: Partial<Omit<Cached, "fetchFn">>;
  mode: "update";
  key: string;
}
export interface CacheCreate {
  data: Cached;
  mode: "create";
  key: string;
}

export interface Cached<
  CacheData = any,
  MutationResponse = any,
  MutationError = any,
  MutationData = any
> {
  data: CacheData;
  fetcherStatus: fetcherStatus;
  state: cacheStates;
  lastFetchResult: lastResult;
  refetchedAt: number | null;
  dirty: DirtyCache<
    MutationData,
    MutationResponse,
    MutationError,
    CacheData
  > | null;
  fetchFn: (() => Promise<CacheData>) | null;
}
export interface DirtyCache<
  OriginalData = any,
  MutationResponse = any,
  MutationError = any,
  MutateData = any
> {
  data: MutateData;
  merger?(
    oldData: OriginalData,
    newData: MutateData,
    res: MutationResponse
  ): OriginalData;
  mutationFn: (data: MutateData) => Promise<MutationResponse>;
  onSuccess: ((data: MutateData, sent: MutationResponse) => void)[];
  onError: ((data: MutateData, err: MutationError) => void)[];
  executeBy: number | null;
}
export type cacheStatus = "dirty" | "clean";
export interface CacheContent {
  [key: string]: Cached;
}

export type RegisterCacheType<T = any> = (
  key: string,
  fetchFn: (() => Promise<T>) | null
) => () => Omit<Cached, "fetchFn">;
