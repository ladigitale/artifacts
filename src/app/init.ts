import {dp, set} from "@supersoniks/concorde/utils";
import {artifactsUiKey} from "./dp";

export function initArtifactsStore(): void {
  dp(artifactsUiKey);
  set(artifactsUiKey, {ready: true});
}
