import { IndexDBStore } from "./indexDBStorage/IndexDBStorage";
import { CommonDataStorageAPI } from "./interfaces/dataStorage";
import { DatabaseUpstreamEvents } from "./interfaces/internalEvents";
import {
  QueryPoolDataStructure,
  QueryPoolSerialStructures,
  QueryPoolMutationActiveStructures,
  ConsumerSubscription,
} from "./interfaces/keyCacheStructure";
import { QueryPoolConstructorVars } from "./interfaces/misc";
import { MemDB } from "./memDBStorage/MemDBStorage";

export class DataManager<
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
  constructor(settings: QueryPoolConstructorVars) {
    if (
      (!settings.queryStorageTactic || settings.queryStorageTactic == "idb") &&
      window.indexedDB
    ) {
      this.queryStorage = new IndexDBStore(true, this.onQueryChange.bind(this));
    } else {
      this.queryStorage = new MemDB(true, this.onQueryChange.bind(this));
    }
    if (
      (!settings.mutationStorageTactic ||
        settings.mutationStorageTactic == "idb") &&
      window.indexedDB
    ) {
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
}
