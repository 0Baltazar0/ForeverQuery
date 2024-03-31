import { DataManager } from "./DataManager";
import {
  ConsumerSubscription,
  DefaultSerialStructure,
  QueryPoolDataStructure,
  QueryPoolMutationActiveStructures,
  QueryPoolMutationSerialStructures,
} from "./interfaces/keyCacheStructure";
import { QueryPoolConstructorVars } from "./interfaces/misc";

//
export class MutationPool<
  Format extends {
    [key: string]: QueryPoolDataStructure<any, any>;
  }
> extends DataManager<Format> {
  constructor(settings: QueryPoolConstructorVars) {
    super(settings);
    const fn = this.executeMutations.bind(this);
    setInterval(() => {
      fn;
    }, 1000);
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
  private async executeMutations() {
    const now = Date.now();

    const allActiveKeys = await this.mutationActiveStorage.getAllKeys();

    for (const activeKey of allActiveKeys) {
      const activeConfig = await this.mutationActiveStorage.getData(activeKey);
      const mutateData = await this.mutationStorage.getData(activeKey);
      if (mutateData.mutateState !== "mutating") break;
      if (
        activeConfig.pushMutationAtFn &&
        activeConfig.pushMutationAtFn(mutateData) > now
      ) {
        break;
      }
      if (
        !activeConfig.pushMutationAtFn &&
        (!mutateData.pushMutationAt || mutateData.pushMutationAt > now)
      ) {
        break;
      }

      if (!activeConfig.mutateFn) {
        throw Error("Mutate is due, but no mutation function is supplied!");
      }

      this.mutationStorage.createOrUpdateData(activeKey, (old) => ({
        ...DefaultSerialStructure.mutation,
        ...old,
        mutateState: "mutating",
      }));
      try {
        if (activeConfig.optimisticUpdate)
          this.queryStorage.createOrUpdateData(activeKey, (old) =>
            activeConfig.optimisticUpdate!(old, mutateData.mutateData)
          );
        const qData = await this.queryStorage.getData(activeKey);
        const resp = await activeConfig.mutateFn(qData, mutateData);

        // if (activeConfig.mergeFn) {
        //   const mfn = activeConfig.mergeFn;
        //   this.queryStorage.createOrUpdateData(activeKey, (old) =>
        //     mfn(old, mutateData.mutateData, resp)
        //   );
        // } else
        //  {
        switch (mutateData.mergeTactic) {
          case "refetch":
            this.queryStorage.createOrUpdateData(activeKey, (old) => ({
              ...DefaultSerialStructure.query,
              ...old,
              nextQueryCall: now,
            }));
            break;
          case "overWrite":
            this.queryStorage.createOrUpdateData(activeKey, (old) => ({
              ...DefaultSerialStructure.query,
              ...old,
              queryData: resp(old?.queryData),
            }));
            break;

          case "none":

          default:
            break;
        }
        // }
        this.mutationStorage.createOrUpdateData(activeKey, (old) => ({
          ...DefaultSerialStructure.mutation,
        }));
      } catch (error) {
        this.mutationStorage.createOrUpdateData(activeKey, (old) => ({
          ...DefaultSerialStructure.mutation,
          ...old,
          lastMutationState: "failure",
        }));
        if (activeConfig.optimisticUpdate)
          this.queryStorage.createOrUpdateData(activeKey, (old) => ({
            ...DefaultSerialStructure.query,
            ...old,
            nextQueryCall: now,
          }));
      }
    }
  }
}
