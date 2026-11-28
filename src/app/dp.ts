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
  /** Catégories séparées par des virgules (la première s'affiche sur les cartes). */
  tags: string;
};

export const artifactEditFormKey = new DataProviderKey<ArtifactEditForm>("artifactEditForm");

export function emptyArtifactEditForm(): ArtifactEditForm {
  return {title: "", description: "", slug: "", visibility: "private", tags: ""};
}

/** Filtres de `/admin/vitrine` : recherche, visibilité, place sur l'accueil. */
export type ShowcaseFilter = {q: string; visibility: string; place: string};
export const showcaseFilterKey = new DataProviderKey<ShowcaseFilter>("showcaseFilter");
export function emptyShowcaseFilter(): ShowcaseFilter {
  return {q: "", visibility: "all", place: "all"};
}

/** Carte en cours de réglage dans la modale de `/admin/vitrine`. */
export type ShowcaseCardForm = {title: string; kind: string; blurb: string};
export const showcaseCardFormKey = new DataProviderKey<ShowcaseCardForm>("showcaseCardForm");
