export const DefaultSerialStructure: QueryPoolSerialStructures<any, any> = {
  query: {
    lastQuery: null,
    lastQueryState: "success",
    lastSuccessfullQuery: null,
    queryData: null,
    queryState: "idle",
    nextQueryCall: null,
  },
  mutation: {
    lastMutationState: "success",
    mutateData: null,
    mergeTactic: "none",
    mutateState: "idle",
    pushMutationAt: null,
    mutationMethod: "put",
  },
};

export type QueryPoolQuerySerialStructures<Q> = {
  queryData: Q | null;
  queryState: "idle" | "fetching";
  lastSuccessfullQuery: number | null;
  lastQuery: number | null;
  lastQueryState: "success" | "failure";
  nextQueryCall: number | null;
};
export type QueryPoolMutationSerialStructures<M> = {
  mutateData: M | null;
  mutateState: "idle" | "pending" | "mutating";
  pushMutationAt: number | null;
  mergeTactic: "refetch" | "overWrite" | "none";
  lastMutationState: "success" | "failure";
  mutationMethod: "delete" | "patch" | "put";
};
export type QueryPoolQueryActiveStructures<Q> = {
  queryFn?: () => Promise<Q>;
  nextQueryUpdate?: ((data: Q) => number) | null;
  queryInterval: number | null;
};
export type QueryPoolMutationActiveStructures<Q, M> = {
  mutateFn?: (
    queryData: Q,
    mutateData: M
  ) => Promise<(queryData: Q | undefined) => Promise<Q>>;
  optimisticUpdate?: (queryData: Q | undefined, mutateData: M) => Q;
  pushMutationAtFn?:
    | ((data: QueryPoolMutationSerialStructures<M>) => number)
    | null;
};
export type QueryPoolSerialStructures<Q, M> = {
  query: QueryPoolQuerySerialStructures<Q>;
  mutation: QueryPoolMutationSerialStructures<M>;
};

export type QueryPoolActiveStructures<Q, M> =
  QueryPoolQueryActiveStructures<Q> & QueryPoolMutationActiveStructures<Q, M>;

export type QueryPoolDataStructure<Q, M> = {
  data: QueryPoolSerialStructures<Q, M>;
  consumers: ConsumerSubscription<Q>[];
};

export type ConsumerSubscription<
  Q = any,
  M = any
> = QueryPoolQueryActiveStructures<Q> & {
  consumerId: string;
  enforceDefinitions?: boolean;
  onUpdate?: (
    d:
      | { query: QueryPoolQuerySerialStructures<Q> }
      | { mutation: QueryPoolMutationSerialStructures<M> }
  ) => void;
};
