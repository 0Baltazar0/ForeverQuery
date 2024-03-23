import { createContext, useReducer, useState } from "react";
import { HookCache, RegisterHookType } from "./hooks/hookInterface";
import { RegisterCacheType, STARTER_CACHE } from "./caches/cacheInterface";
import { ForeverQuery, PushMutationCall } from "./class/ForeverQuery";
import React from "react";
interface ForeverQueryType {
  useRegisterCache: RegisterCacheType;
  useRegisterHook: RegisterHookType;
  pushMutation: PushMutationCall;
}

export const ForeverQueryContext = createContext<ForeverQueryType>({
  useRegisterCache() {
    return () => STARTER_CACHE;
  },
  useRegisterHook() {},
  pushMutation() {},
});

function ForeverQueryProvider({
  settings,
  children,
}: {
  children: React.ReactNode;
  settings?: { logging?: "debug" | "info" | "error"; silentError?: boolean };
}) {
  const [foreverQuery, _setForeverQuery] = useState(new ForeverQuery(settings));

  function useRegisterCache<T>(
    key: string,
    fetchFn: (() => Promise<T>) | null
  ) {
    return foreverQuery.createCacheKey(key, { ...STARTER_CACHE, fetchFn });
  }

  function useRegisterHook(data: HookCache) {
    foreverQuery.createWatcher(data);
  }

  return (
    <ForeverQueryContext.Provider
      value={{
        useRegisterCache,
        useRegisterHook,
        pushMutation: foreverQuery.pushMutation.bind(foreverQuery),
      }}
    >
      {children}
    </ForeverQueryContext.Provider>
  );
}

export default ForeverQueryProvider;
