import {DataProviderKey} from "@supersoniks/concorde/dataProviderKey";

export type ArtifactsUi = {ready: boolean};
export const artifactsUiKey = new DataProviderKey<ArtifactsUi>("artifactsUi");
