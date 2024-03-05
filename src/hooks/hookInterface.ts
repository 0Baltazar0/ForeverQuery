export interface HookCache {
  key: string;
  refetchInterval: number;
  regId: string;
  updater?: (cb: (d: any) => any) => void;
}
export interface HookContent {
  [key: string]: { hooks: HookCache[]; min: number };
}

export type RegisterHookType = (data: HookCache) => void;

export function recalculateMin(
  hooks: HookContent[keyof HookContent]
): HookContent[keyof HookContent] {
  const numbers = hooks.hooks.map((h) => h.refetchInterval);
  const positiveNumbers = numbers.filter((n) => n > 0);
  if (positiveNumbers.length == 0) return { ...hooks, min: -1 };
  const min = Math.min(...positiveNumbers);
  return { ...hooks, min: min };
}
export interface HookUpdate {
  data: HookCache;
  mode: "update";
}
export interface HookCreate {
  data: HookCache;
  mode: "create";
}
