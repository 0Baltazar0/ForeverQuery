import { IndexDBStore } from "./indexDBStorage/IndexDBStorage";
import { CommonDataStorageAPI } from "./interfaces/dataStorage";
import { DatabaseUpstreamEvents } from "./interfaces/internalEvents";
import {
  ConsumerSubscription,
  DefaultSerialStructure,
  QueryPoolDataStructure,
  QueryPoolMutationActiveStructures,
  QueryPoolMutationSerialStructures,
  QueryPoolQueryActiveStructures,
  QueryPoolSerialStructures,
} from "./interfaces/keyCacheStructure";
import { NoExtraProperties } from "./interfaces/misc";
import { MemDB } from "./memDBStorage/MemDBStorage";

//
export class QueryManager<
  Format extends {
    [key: string]: QueryPoolDataStructure<any, any>;
  }
> {
  protected queryStorage: CommonDataStorageAPI<
    QueryPoolSerialStructures<any, any>["query"]
  >;
  protected mutationStorage: CommonDataStorageAPI<
    QueryPoolSerialStructures<any, any>["mutation"]
  >;
  protected mutationActiveStorage: MemDB<
    QueryPoolMutationActiveStructures<any, any>
  >;
  protected consumerStorage: MemDB<ConsumerSubscription[]>;
  constructor(
    queryStorageTactic: "idb" | "memory" = "idb",
    mutationStorageTactic: "idb" | "memory" = "memory"
  ) {
    if (queryStorageTactic == "idb" && window.indexedDB) {
      this.queryStorage = new IndexDBStore(true, this.onQueryChange.bind(this));
    } else {
      this.queryStorage = new MemDB(true, this.onQueryChange.bind(this));
    }
    if (mutationStorageTactic == "idb" && window.indexedDB) {
      this.mutationStorage = new IndexDBStore(
        true,
        this.onMutationChange.bind(this)
      );
    } else
      this.mutationStorage = new MemDB(true, this.onMutationChange.bind(this));
    this.mutationActiveStorage = new MemDB(true, () => "");
    this.consumerStorage = new MemDB(true, this.onConsumerChange.bind(this));
  }

  private onQueryChange<K extends keyof Format, Data extends Format[K]>(
    e: DatabaseUpstreamEvents<Data["data"]["query"]>
  ) {
    this.consumerStorage.getData(e.key).then((consumers) => {
      consumers.forEach((consumer) => {
        if (consumer.onUpdate) consumer.onUpdate({ query: e.data });
      });
    });
  }
  private onMutationChange<K extends keyof Format, Data extends Format[K]>(
    e: DatabaseUpstreamEvents<Data["data"]["mutation"]>
  ) {
    this.consumerStorage.getData(e.key).then((consumers) => {
      consumers.forEach((consumer) => {
        if (consumer.onUpdate) consumer.onUpdate({ mutation: e.data });
      });
    });
  }
  private onConsumerChange<K extends keyof Format, Data extends Format[K]>(
    e: DatabaseUpstreamEvents<Data["consumers"]>
  ) {}

  private preBuildDataGetter(key: string) {
    return async () => ({
      query: await this.queryStorage.getData(key),
      mutation: await this.mutationStorage.getData(key),
    });
  }

  registerQuery<K extends keyof Format & string>(
    key: K,
    settings: ConsumerSubscription
  ) {
    this.queryStorage.createOrUpdateData(
      key,
      (
        exist
      ): NoExtraProperties<QueryPoolSerialStructures<any, any>["query"]> => {
        if (exist) {
          return exist;
        } else return DefaultSerialStructure.query;
      }
    );
    this.mutationStorage.createOrUpdateData(key, (old) => {
      if (old) return old;
      else return DefaultSerialStructure.mutation;
    });
    this.consumerStorage.createOrUpdateData(key, (old) => {
      if (old) {
        return old.reduce<ConsumerSubscription[]>((res, curr) => {
          if (curr.consumerId == settings.consumerId) res.push(settings);
          else res.push(curr);
          return res;
        }, []);
      }
      return [settings];
    });
    return this.preBuildDataGetter(key).bind(this);
  }
  removeConsumer(key: string, consumerId: string) {
    this.consumerStorage.updateData(
      key,
      (consumers) =>
        consumers?.filter((cs) => cs.consumerId != consumerId) ?? []
    );
  }
  pushMutation<K extends keyof Format & string>(
    key: K,
    serialfn: (
      existingMutation?: QueryPoolMutationSerialStructures<
        Format[K]["data"]["mutation"]["mutateData"]
      >
    ) => QueryPoolMutationSerialStructures<
      Format[K]["data"]["mutation"]["mutateData"]
    >,
    activeFn?: (
      data?: QueryPoolMutationActiveStructures<
        Format[K]["data"]["query"]["queryData"],
        Format[K]["data"]["mutation"]["mutateData"]
      >
    ) => QueryPoolMutationActiveStructures<
      Format[K]["data"]["query"]["queryData"],
      Format[K]["data"]["mutation"]["mutateData"]
    >
  ) {
    this.mutationStorage.createOrUpdateData(key, serialfn);
    if (activeFn) this.mutationActiveStorage.createOrUpdateData(key, activeFn);
  }
}

export class QueryPool<
  Format extends {
    [key: string]: QueryPoolDataStructure<any, any>;
  }
> extends QueryManager<Format> {
  constructor(defaultStorageTactic?: "idb" | "memory") {
    super(defaultStorageTactic);
    const fetching = this.fetchQueries.bind(this);
    const mutating = this.executeMutations.bind(this);
    setInterval(() => {
      fetching();
      mutating();
    }, 1000);
  }
  private callQuery(
    fn: () => Promise<any>,
    entryKey: string,
    nextQueryCalculator: QueryPoolQueryActiveStructures<any>["nextQueryUpdate"],
    nextInterval: number | null
  ) {
    fn()
      .then((newQData) => {
        const finish = Date.now();
        const nQ = nextQueryCalculator
          ? nextQueryCalculator(newQData)
          : nextInterval
          ? finish + nextInterval
          : nextInterval;
        this.queryStorage.updateData(entryKey, (old) => ({
          queryData: newQData,
          nextQueryCall: nQ,
          queryState: "idle",
          lastQueryState: "success",
          lastSuccessfullQuery: finish,
          lastQuery: finish,
        }));
      })
      .catch((err) => {
        const finish = Date.now();
        const nQ = nextQueryCalculator
          ? nextQueryCalculator(err)
          : nextInterval
          ? finish + nextInterval
          : null;
        this.queryStorage.updateData(entryKey, (old) => ({
          ...old!,
          lastQuery: finish,
          queryState: "idle",
          lastQueryState: "failure",
          nextQueryCall: nQ,
        }));
      });
  }

  private prepareQuery(
    now: number,
    entryKey: string,
    fn: () => Promise<any>,
    nextQueryCalculator: QueryPoolQueryActiveStructures<any>["nextQueryUpdate"],
    nextInterval: number | null
  ) {
    this.queryStorage.getData(entryKey).then((q) => {
      if (q.queryState == "fetching" || q.nextQueryCall == null) return;

      this.queryStorage.updateData(entryKey, (old) => ({
        ...old!,
        queryState: "fetching",
      }));
      if (!q.nextQueryCall || q.nextQueryCall < now) {
        this.callQuery(fn, entryKey, nextQueryCalculator, nextInterval);
      }
    });
  }

  private extractConsumerProperties(consumers: ConsumerSubscription[]) {
    const nextInterval = consumers.reduce<null | number>((res, curr) => {
      if (!res || (res && curr.queryInterval && res > curr.queryInterval)) {
        return curr.queryInterval;
      }
      return res;
    }, null);
    const nextQueryCalculator = consumers.reduce<((r: any) => number) | null>(
      (res, curr) => {
        if (res) return res;
        if (curr.nextQueryUpdate) return curr.nextQueryUpdate;
        return null;
      },
      null
    );
    const fn =
      consumers.find((el) => el.enforceDefinitions && el.queryFn)?.queryFn ??
      consumers.find((el) => el.queryFn)?.queryFn;
    return { fn, nextQueryCalculator, nextInterval };
  }

  private fetchQueries() {
    const now = Date.now();
    this.consumerStorage.getAllKeys().then((keys) => {
      keys.forEach((entryKey) => {
        this.consumerStorage.getData(entryKey).then((consumers) => {
          const { fn, nextInterval, nextQueryCalculator } =
            this.extractConsumerProperties(consumers);
          if (!fn) return;
          this.prepareQuery(
            now,
            entryKey,
            fn,
            nextQueryCalculator,
            nextInterval
          );
        });
      });
    });
  }
  private executeMutations() {
    const now = Date.now();
    this.mutationStorage.getAllKeys().then((keys) => {
      keys.map((entryKey) => {
        this.mutationActiveStorage.getData(entryKey).then((activeM) => {
          this.mutationStorage.getData(entryKey).then((m) => {
            if (m.mutateState == "mutating") return;
            if (m.mutateState == "idle") {
              this.mutationStorage.updateData(entryKey, (old) => ({
                ...DefaultSerialStructure.mutation,
              }));
              return;
            }

            if (!activeM.mutateFn) return;

            const mutator = activeM.mutateFn;

            if (activeM.pushMutationAtFn && activeM.pushMutationAtFn(m) > now)
              return;
            if (!m.pushMutationAt) return;
            if (m.pushMutationAt && m.pushMutationAt > now) return;
            this.mutationStorage.updateData(entryKey, (old) => ({
              ...DefaultSerialStructure.mutation,
              ...old,
              mutateState: "mutating",
            }));
            mutator(m.mutateData)
              .then((resp) => {
                const mergeFn = activeM.mergeFn;
                if (mergeFn)
                  this.queryStorage.updateData(entryKey, (old) =>
                    mergeFn(old, m.mutateData, resp)
                  );
                else
                  switch (m.mergeTactic) {
                    case "refetch":
                      this.queryStorage.updateData(entryKey, (old) => ({
                        ...DefaultSerialStructure.query,
                        ...old,
                        nextQueryCall: now,
                      }));
                      break;
                    case "overWrite":
                      this.queryStorage.updateData(entryKey, (old) => ({
                        ...DefaultSerialStructure.query,
                        ...old,
                        queryData: resp,
                      }));
                      break;

                    case "simpleMerge":
                      this.queryStorage.updateData(entryKey, (old) => ({
                        ...DefaultSerialStructure.query,
                        ...old,
                        queryData: {
                          ...(old?.queryData ??
                            DefaultSerialStructure.query.queryData),
                          ...resp,
                        },
                      }));
                      break;
                    case "none":
                      break;
                  }
                this.mutationStorage.updateData(entryKey, (old) => ({
                  lastMutationState: "success",
                  mergeTactic: "none",
                  mutateData: null,
                  mutateState: "idle",
                  pushMutationAt: null,
                }));
              })
              .catch((err) => {
                this.mutationStorage.updateData(entryKey, (old) => ({
                  ...DefaultSerialStructure.mutation,
                }));
              });
          });
        });
      });
    });
  }
}
