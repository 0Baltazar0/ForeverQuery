import { MutationPool } from "./MutationPool";
import {
  ConsumerSubscription,
  DefaultSerialStructure,
  QueryPoolDataStructure,
  QueryPoolSerialStructures,
} from "./interfaces/keyCacheStructure";
import { NoExtraProperties, QueryPoolConstructorVars } from "./interfaces/misc";

//
export class QueryManager<
  Format extends {
    [key: string]: QueryPoolDataStructure<any, any>;
  }
> extends MutationPool<Format> {
  constructor(settings: QueryPoolConstructorVars) {
    super(settings);
    const fn = this.fetchQueries.bind(this);
    setInterval(() => {
      fn;
    }, 1000);
  }

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
  private async fetchQueries() {
    const now = Date.now();
    const allActiveKeys = await this.consumerStorage.getAllKeys();
    for (const activeKey of allActiveKeys) {
      const activeData = await this.consumerStorage.getData(activeKey);
      const fetchFn = activeData.reduce<ConsumerSubscription["queryFn"]>(
        (res, curr) => {
          if (!res && curr.queryFn) return curr.queryFn;
          if (res && curr.queryFn && curr.enforceDefinitions)
            return curr.queryFn;
          return res;
        },
        undefined
      );
      if (!fetchFn) break;
      const data = await this.queryStorage.getData(activeKey);
      if (data.queryState !== "idle") break;
      const nextQueryUpdate = activeData.reduce<
        ConsumerSubscription["nextQueryUpdate"]
      >((res, curr) => {
        if (!res && curr.nextQueryUpdate) return curr.nextQueryUpdate;
        if (res && curr.nextQueryUpdate && curr.enforceDefinitions)
          return curr.nextQueryUpdate;
        return res;
      }, undefined);
      if (nextQueryUpdate && nextQueryUpdate(data.queryData) > now) break;
      if (!nextQueryUpdate && (!data.nextQueryCall || data.nextQueryCall > now))
        break;
      const interval = activeData.reduce<ConsumerSubscription["queryInterval"]>(
        (res, curr) => {
          if (!res && curr.queryInterval) return curr.queryInterval;
          if (res && curr.queryInterval && curr.enforceDefinitions)
            return curr.queryInterval;
          return res;
        },
        null
      );

      this.queryStorage.createOrUpdateData(activeKey, (old) => ({
        ...DefaultSerialStructure.query,
        ...old,
        queryState: "fetching",
      }));
      try {
        const resp = fetchFn();

        this.queryStorage.createOrUpdateData(activeKey, (old) => ({
          ...DefaultSerialStructure.query,
          ...old,
          queryData: resp,
          nextQueryCall: interval ? Date.now() + interval : interval,
          queryState: "idle",
          lastQueryState: "success",
          lastSuccessfullQuery: interval ? Date.now() + interval : interval,
          lastQuery: now,
        }));
      } catch (error) {
        this.queryStorage.createOrUpdateData(activeKey, (old) => ({
          ...DefaultSerialStructure.query,
          ...old,
          nextQueryCall: interval ? Date.now() + interval : interval,
          queryState: "idle",
          lastQueryState: "failure",
          lastQuery: now,
        }));
        break;
      }
    }
  }
}
