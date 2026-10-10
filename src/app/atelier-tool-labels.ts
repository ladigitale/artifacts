import type {ToolLabel} from "@ladigitale/agent-stack/chat";

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

/**
 * Libellés des outils de l'agent de l'atelier, affichés pendant l'attente.
 * `args` n'est connu qu'une fois l'appel complet : avant, on affiche la forme générale.
 */
export const atelierToolLabels: Record<string, ToolLabel> = {
  get_artifact_catalog: (_args, done) => (done ? "Catalogue consulté" : "Consultation du catalogue de composants"),
  find_icons: (args, done) => {
    const q = typeof args?.query === "string" ? args.query : "";
    return `${done ? "Icônes trouvées" : "Recherche d’icônes"}${q ? ` : ${q}` : ""}`;
  },
  start_from_kit: (args, done) => {
    const kit = typeof args?.kit === "string" ? ` « ${args.kit} »` : "";
    return done ? `Kit${kit} appliqué` : `Création à partir du kit${kit}`;
  },
  preview_artifact: (_args, done) => (done ? "Aperçu construit" : "Construction de l’aperçu"),
  edit_preview: (args, done) => {
    const n = Array.isArray(args?.ops) ? args.ops.length : 0;
    const what = n ? ` (${plural(n, "changement", "changements")})` : "";
    return done ? `Aperçu modifié${what}` : `Modification de l’aperçu${what}`;
  },
  read_preview: (_args, done) => (done ? "Aperçu relu" : "Relecture de l’aperçu"),
  publish_preview: (_args, done) => (done ? "Publication terminée" : "Publication de l’artefact"),
  get_artifact: (_args, done) => (done ? "Artefact chargé" : "Chargement de l’artefact"),
  validate_artifact: (_args, done) => (done ? "Document validé" : "Validation du document"),
  render_ui: (_args, done) => (done ? "Question posée" : "Préparation d’une question"),
};
