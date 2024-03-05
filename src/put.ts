import { useContext, useEffect, useState } from "react";
import { Cached, DirtyCache } from "./caches/cacheInterface";
import { ForeverQueryContext } from "./ForeverQuery";
import { PushMutationCall } from "./class/ForeverQuery";

export function useMutateForeverQuery<
  OriginalData = any,
  MutationResponse = any,
  MutationError = any,
  MutateData = any
>(
  key: string,
  settings: Pick<
    DirtyCache<OriginalData, MutationResponse, MutationError, MutateData>,
    "mutationFn" | "merger"
  > & {
    bounce?: number;
    mutateMerger?: (
      oldMutateCache: MutateData,
      newMutatedCache: MutateData
    ) => MutateData;
  } & Partial<
      Pick<
        DirtyCache<OriginalData, MutationResponse, MutationError, MutateData>,
        "onError" | "onSuccess"
      >
    >
) {
  const [bounceFn, setBounceFn] = useState(
    () => () =>
      settings?.bounce !== undefined ? Date.now() + settings?.bounce : null
  );

  useEffect(() => {
    setBounceFn(
      () => () =>
        settings?.bounce !== undefined ? Date.now() + settings?.bounce : null
    );
  }, [settings?.bounce]);
  const [data, setData] =
    useState<
      Omit<
        Cached<OriginalData, MutationResponse, MutationError, MutateData>,
        "fetchFn"
      >
    >();
  const [fetcher, setFetcher] =
    useState<
      () => Omit<
        Cached<OriginalData, MutationResponse, MutationError, MutateData>,
        "fetchFn"
      >
    >();
  const { useRegisterCache, pushMutation } = useContext(ForeverQueryContext);

  useEffect(() => {
    setFetcher(() => useRegisterCache(key, null));
  }, []);

  return {
    mutate: (
      data: MutateData,
      props?: Partial<
        Pick<
          DirtyCache<OriginalData, MutationResponse, MutationError, MutateData>,
          "onError" | "onSuccess" | "executeBy"
        >
      >
    ) =>
      (
        pushMutation as PushMutationCall<
          OriginalData,
          MutationResponse,
          MutationError,
          MutateData
        >
      )(
        key,
        {
          mutationFn: settings.mutationFn,
          merger: settings.merger,
          onError: (props?.onError && props?.onError?.length > 0
            ? props.onError
            : []
          ).concat(
            ...(settings.onError && settings.onError.length > 0
              ? settings.onError
              : [])
          ),
          onSuccess: (props?.onSuccess && props?.onSuccess.length > 0
            ? props?.onSuccess
            : []
          ).concat(
            ...(settings.onSuccess && settings.onSuccess.length > 0
              ? settings.onSuccess
              : [])
          ),
          executeBy:
            props?.executeBy != undefined ? props?.executeBy : bounceFn(),
          data,
        },
        settings.mutateMerger
      ),
    isLoading: data?.fetcherStatus == "loading",
    isMutatin: data?.state == "mutating",
    data,
  };
}
