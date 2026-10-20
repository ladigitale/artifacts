/**
 * Contexte du viewer pour `sonic-p2p` (addon creative-stack : salons temps réel).
 *
 * `sonic-p2p` a besoin du slug de l'artefact et de l'origine de l'API Tadaaa. Un document
 * (donc un agent) ne peut pas les connaître de façon fiable : le slug peut être attribué à la
 * publication, et « même origine » viserait le serveur de fichiers du viewer, pas l'API.
 * Surtout, un `api` libre enverrait pseudo, états partagés et messages à n'importe quel serveur
 * https. Le viewer impose donc ces attributs, quoi que dise le document.
 *
 * Aperçu de l'atelier : aucun appel API (comme pour les sinks) ; `artifact` reste vide et le
 * composant annonce « attribut artifact manquant ou invalide » dans son état.
 */
const P2P_TAG = "sonic-p2p";
const MAX_DEPTH = 64;

export type RoomContext = {
  slug: string;
  /** Origine de l'API Tadaaa, sans `/api` final. */
  api: string;
  /** Jeton `?k=` d'un artefact « lien secret ». */
  linkToken: string | null;
  preview: boolean;
};

type Node = Record<string, unknown>;

function patchP2p(node: Node, ctx: RoomContext): Node {
  const attrs = {...((node.attributes as Record<string, unknown> | undefined) ?? {})};
  delete attrs["link-token"];
  delete attrs.linkToken;
  attrs.artifact = ctx.preview ? "" : ctx.slug;
  attrs.api = ctx.preview ? "" : ctx.api;
  if (!ctx.preview && ctx.linkToken) attrs["link-token"] = ctx.linkToken;
  return {...node, attributes: attrs};
}

function patchTree(value: unknown, ctx: RoomContext, depth = 0): unknown {
  if (depth > MAX_DEPTH || !value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => patchTree(v, ctx, depth + 1));
  let node = value as Node;
  if (typeof node.tagName === "string" && node.tagName.toLowerCase() === P2P_TAG) node = patchP2p(node, ctx);
  if (Array.isArray(node.nodes)) node = {...node, nodes: patchTree(node.nodes, ctx, depth + 1)};
  return node;
}

function patchRoot(root: unknown, ctx: RoomContext): unknown {
  if (!root || typeof root !== "object" || Array.isArray(root)) return root;
  const r = root as Node;
  const out: Node = {...r};
  if (Array.isArray(r.nodes)) out.nodes = patchTree(r.nodes, ctx);
  // Les entrées de `library` sont des gabarits instanciés par libraryKey.
  const library = r.library;
  if (library && typeof library === "object" && !Array.isArray(library)) {
    out.library = Object.fromEntries(Object.entries(library).map(([k, node]) => [k, patchTree(node, ctx)]));
  }
  return out;
}

/** Copie du document dont chaque `sonic-p2p` reçoit `artifact`, `api` et `link-token` du viewer. */
export function withRoomContext(doc: Record<string, unknown>, ctx: RoomContext): Record<string, unknown> {
  const views = (doc as {views?: unknown}).views;
  if (!Array.isArray(views) || !JSON.stringify(views).includes(P2P_TAG)) return doc;
  return {
    ...doc,
    views: views.map((v) =>
      v && typeof v === "object" && (v as Node).root ? {...(v as Node), root: patchRoot((v as Node).root, ctx)} : v,
    ),
  };
}
