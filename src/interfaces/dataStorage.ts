import { NoExtraProperties } from "./misc";

export interface CommonDataStorageAPI<D> {
  getData: (key: string) => Promise<D>;
  updateData: (
    key: string,
    fn: (old: D | undefined) => NoExtraProperties<D>
  ) => void;
  createData: (key: string, data: NoExtraProperties<D>) => void;
  createOrUpdateData: (
    key: string,
    fn: (old: D | undefined) => NoExtraProperties<D>
  ) => void;
  deleteData: (key: string) => void;
}
