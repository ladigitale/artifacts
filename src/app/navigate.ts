/** Navigation SPA (sonic-router écoute popstate). */
export function navigate(path: string): void {
  if (location.pathname + location.search + location.hash === path) return;
  history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
