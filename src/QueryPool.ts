import { IndexDBStore } from "./indexDBStorage/IndexDBStorage";
import { CommonDataStorageAPI } from "./interfaces/dataStorage";
import { DatabaseUpstreamEvents } from "./interfaces/internalEvents";
import {
  ConsumerSubscription,
  DefaultSerialStructure,
  QueryPoolDataStructure,
  QueryPoolMutationActiveStructures,
  QueryPoolMutationSerialStructures,
  QueryPoolSerialStructures,
} from "./interfaces/keyCacheStructure";
import { NoExtraProperties } from "./interfaces/misc";
import { MemDB } from "./memDBStorage/MemDBStorage";

//
export class ForeverQuery<
  Format extends {
    [key: string]: QueryPoolDataStructure<any, any>;
  }
> {
  private queryStorage: CommonDataStorageAPI<
    QueryPoolSerialStructures<any, any>["query"]
  >;
  private mutationStorage: MemDB<
    QueryPoolSerialStructures<any, any>["mutation"] &
      QueryPoolMutationActiveStructures<any>
  >;
  private consumerStorage: MemDB<ConsumerSubscription[]>;
  constructor(defaultStorageTactic: "idb" | "memory" = "idb") {
    if (defaultStorageTactic == "idb" && window.indexedDB) {
      this.queryStorage = new IndexDBStore(true, this.onQueryChange.bind(this));
    } else {
      this.queryStorage = new MemDB(true, this.onQueryChange.bind(this));
    }
    this.consumerStorage = new MemDB(true, this.onConsumerChange.bind(this));
    this.mutationStorage = new MemDB(true, this.onMutationChange.bind(this));
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
    console.log("Mutation is fired");
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
          if (
            settings.queryInterval &&
            (!exist.queryInterval ||
              exist.queryInterval > settings.queryInterval)
          )
            return {
              ...exist,
              queryInterval: settings.queryInterval,
            };
          else {
            return exist;
          }
        } else
          return {
            ...DefaultSerialStructure.query,
            queryInterval: settings.queryInterval,
          };
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
    fn: (
      existingMutation: Format[K]["data"]["mutation"] | undefined
    ) => Format[K]["data"]["mutation"] & QueryPoolMutationSerialStructures<any>
  ) {
    this.mutationStorage.createOrUpdateData(key, fn);
  }
}
