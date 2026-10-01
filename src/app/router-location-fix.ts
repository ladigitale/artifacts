/**
 * Le router Concorde matche sur `pathname + hash`. Le viewer utilise le hash
 * pour les vues d'artefact (#formulaire) et le MCP renvoie des URL avec "/"
 * final : "/:slug" ne matchait plus et la page restait vide.
 * On fait matcher le router sur le pathname seul, sans "/" final.
 */
import "@supersoniks/concorde/router";

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
