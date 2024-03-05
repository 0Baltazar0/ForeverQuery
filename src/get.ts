import { useContext, useEffect, useId, useState } from "react";
import { ForeverQueryContext } from "./ForeverQuery";
import { HookCache } from "./hooks/hookInterface";
import { Cached } from "./caches/cacheInterface";

export function useForeverQuery<T>(options: {
  queryFn: () => Promise<T>;
  key: string;
  manualCheckInterval?: number;
  refetchInterval?: number;
}) {
  const {
    refetchInterval = 10000,
    manualCheckInterval = 0,
    key,
    queryFn,
  } = options;
  const [data, setData] = useState<Omit<Cached<T>, "fetchFn">>();
  const [fetcher, setFetcher] = useState<() => Omit<Cached<T>, "fetchFn">>();
  const { useRegisterCache, useRegisterHook } = useContext(ForeverQueryContext);
  const queryId = useId();
  const [settings, setSettings] = useState<HookCache>({
    regId: queryId,
    key: key,
    refetchInterval,
    updater: manualCheckInterval == 0 ? setData : undefined,
  });
  useEffect(() => {
    setSettings({
      key: key,
      refetchInterval,
      regId: queryId,
      updater: manualCheckInterval == 0 ? setData : undefined,
    });
  }, []);

  useEffect(() => {
    if (settings) {
      useRegisterHook(settings);
    }
  }, [settings]);
  useEffect(() => {
    setFetcher(() => useRegisterCache(key, queryFn));
  }, []);
  useEffect(() => {
    if (manualCheckInterval > 0 && fetcher) {
      const int = setInterval(() => {
        setData(() => fetcher());
      }, manualCheckInterval);
      return () => {
        clearInterval(int);
      };
    }
  }, [manualCheckInterval, fetcher]);
  return data;
}
