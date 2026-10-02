/**
 * Normalize URL before sonic-router boots:
 * - drop trailing "/" on pathname (MCP used to emit /slug/?k=…)
 * - keep search + hash
 * Also patch Concorde cleanLocation (pathname only, no trailing slash).
 */
import "@supersoniks/concorde/router";

(function normalizeArtifactPathname() {
  try {
    const {pathname, search, hash} = window.location;
    if (pathname.length > 1 && pathname.endsWith("/")) {
      const next = pathname.replace(/\/+$/, "") + search + hash;
      window.history.replaceState(window.history.state, "", next);
    }
  } catch {
    /* ignore */
  }
})();

const Router = customElements.get("sonic-router");
if (Router) {
  Object.defineProperty(Router.prototype, "cleanLocation", {
    configurable: true,
    get(this: {location: string}) {
      const {pathname} = new URL(this.location, document.location.origin);
      return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
    },
  });
}

export {};
