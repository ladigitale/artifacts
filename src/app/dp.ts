import {DataProviderKey} from "@supersoniks/concorde/dataProviderKey";

export type ArtifactsUi = {ready: boolean};
export const artifactsUiKey = new DataProviderKey<ArtifactsUi>("artifactsUi");

export type ArtifactListFilter = {
  q: string;
  visibility: string;
  sort: string;
};

export const artifactListFilterKey = new DataProviderKey<ArtifactListFilter>(
  "artifactListFilter",
);

export function emptyArtifactListFilter(): ArtifactListFilter {
  return {q: "", visibility: "all", sort: "updatedAt"};
}

export type ArtifactEditForm = {
  title: string;
  description: string;
  slug: string;
  visibility: string;
};

export const artifactEditFormKey = new DataProviderKey<ArtifactEditForm>("artifactEditForm");

export function emptyArtifactEditForm(): ArtifactEditForm {
  return {title: "", description: "", slug: "", visibility: "private"};
}
