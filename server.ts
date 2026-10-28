import { homedir } from "node:os";
import { join } from "node:path";
import index from "./index.html";
import { DuplicateNameError, openGraphStore, type GraphStore } from "./db.ts";
import { validateGraph, type GraphInput } from "./graph.ts";

const PORT = Number(process.env.PORT ?? 4848);
const DB_PATH =
  process.env.GRAPH_DB ?? join(homedir(), "Library", "Application Support", "graph-app", "graphs.sqlite");

const readJson = async (req: Request) => {
  try {
    return (await req.json()) as Partial<GraphInput>;
  } catch {
    return null;
  }
};

const invalid = (errors: string[]) => Response.json({ errors }, { status: 400 });

const notFound = () => Response.json({ errors: ["The graph does not exist."] }, { status: 404 });

const saveOrConflict = (save: () => unknown) => {
  try {
    const graph = save();
    return graph == null ? notFound() : Response.json(graph);
  } catch (error) {
    if (error instanceof DuplicateNameError) return Response.json({ errors: [error.message] }, { status: 409 });
    throw error;
  }
};

export const createServer = (store: GraphStore, port = PORT) =>
  Bun.serve({
    port,
    hostname: "127.0.0.1",
    routes: {
      "/": index,
      "/favicon.ico": new Response(null, { status: 204 }),
      "/api/graphs": {
        GET: () => Response.json(store.list()),
        POST: async (req) => {
          const body = await readJson(req);
          if (body == null) return invalid(["The request body must be JSON."]);
          const input = { name: body.name ?? "", type: body.type ?? "directional", nodes: body.nodes };
          const errors = validateGraph({ ...input, nodes: input.nodes ?? [] });
          if (errors.length > 0) return invalid(errors);
          return saveOrConflict(() => store.create(input));
        },
      },
      "/api/graphs/:id": {
        GET: (req) => {
          const graph = store.get(req.params.id);
          return graph == null ? notFound() : Response.json(graph);
        },
        PUT: async (req) => {
          const body = await readJson(req);
          if (body == null) return invalid(["The request body must be JSON."]);
          const errors = validateGraph(body);
          if (errors.length > 0) return invalid(errors);
          return saveOrConflict(() => store.update(req.params.id, body as GraphInput));
        },
        DELETE: (req) => (store.remove(req.params.id) ? new Response(null, { status: 204 }) : notFound()),
      },
    },
    development: process.env.NODE_ENV !== "production" && { hmr: true, console: true },
  });

if (import.meta.main) {
  const server = createServer(openGraphStore(DB_PATH));
  console.log(`Graph app on ${server.url} (database ${DB_PATH})`);
  if (process.env.OPEN_BROWSER !== "0") Bun.spawn(["open", server.url.href]);
}
