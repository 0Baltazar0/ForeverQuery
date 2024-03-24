export type DatabaseUpstreamEvents<D> = {
  event: "update";
  data: D;
  key: string;
};
