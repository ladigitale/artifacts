import {fetchPublicArtifact, fetchPublicCollection} from "./cloud/client";

/**
 * WebMCP (https://github.com/webmachinelearning/webmcp) — read-only tools for
 * in-browser agents. No-op when the browser exposes no model context.
 */
type ToolResult = {content: {type: "text"; text: string}[]};
type WebMcpTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: {readOnlyHint?: boolean};
  execute: (args: Record<string, unknown>) => Promise<ToolResult>;
};
type ModelContext = {registerTool: (tool: WebMcpTool) => unknown};

const RESERVED = new Set(["admin", "cloud", "demarrer"]);
const SLUG = {type: "string", pattern: "^[a-z0-9][a-z0-9-]{2,63}$", description: "Artefact slug (URL path)"};

const json = (value: unknown): ToolResult => ({
  content: [{type: "text", text: JSON.stringify(value, null, 2)}],
});

function displayedSlug(): string | null {
  const parts = location.pathname.split("/").filter(Boolean);
  return parts.length === 1 && !RESERVED.has(parts[0]) ? parts[0] : null;
}

const tools: WebMcpTool[] = [
  {
    name: "get_displayed_artifact",
    description:
      "Return the artefact shown on this page (title, description, version, SDUI document, collections) as JSON.",
    inputSchema: {type: "object", properties: {}},
    annotations: {readOnlyHint: true},
    async execute() {
      const slug = displayedSlug();
      if (!slug) return json({error: "No artefact is displayed on this page."});
      const k = new URLSearchParams(location.search).get("k");
      return json(await fetchPublicArtifact(slug, k));
    },
  },
  {
    name: "get_public_artifact",
    description: "Read a published artefact by slug (public, or link artefact with its share token k).",
    inputSchema: {
      type: "object",
      properties: {slug: SLUG, k: {type: "string", description: "Share token from a ?k= link"}},
      required: ["slug"],
    },
    annotations: {readOnlyHint: true},
    async execute({slug, k}) {
      return json(await fetchPublicArtifact(String(slug), k ? String(k) : null));
    },
  },
  {
    name: "read_public_collection",
    description: "Read the items of a public-read data collection of an artefact.",
    inputSchema: {
      type: "object",
      properties: {
        slug: SLUG,
        collection: {type: "string", description: "Collection name, from the artefact's collections"},
        k: {type: "string", description: "Share token from a ?k= link"},
      },
      required: ["slug", "collection"],
    },
    annotations: {readOnlyHint: true},
    async execute({slug, collection, k}) {
      return json(await fetchPublicCollection(String(slug), String(collection), k ? String(k) : null));
    },
  },
];

export function registerWebMcpTools(): void {
  const ctx = ((document as unknown as {modelContext?: ModelContext}).modelContext ??
    (navigator as unknown as {modelContext?: ModelContext}).modelContext) as ModelContext | undefined;
  if (typeof ctx?.registerTool !== "function") return;
  for (const tool of tools) {
    try {
      void Promise.resolve(ctx.registerTool(tool)).catch(() => {});
    } catch {
      /* tool already registered or API mismatch: ignore */
    }
  }
}
