import { homedir } from "node:os";
import { join } from "node:path";
import index from "./index.html";
import { StoreError, openGraphStore, type GraphStore } from "./db.ts";
import {
  isNonEmptyString,
  validateEdgeInput,
  validateNodeInput,
  type EdgeInput,
  type NodeInput,
  type Position,
} from "./model.ts";

const PORT = Number(process.env.PORT ?? 4848);
const DB_PATH =
  process.env.GRAPH_DB ?? join(homedir(), "Library", "Application Support", "graph-app", "graph.sqlite");

type Body = Record<string, unknown>;

class BadRequest extends Error {
  constructor(readonly errors: string[]) {
    super(errors.join(" "));
  }
}

const readBody = async (req: Request): Promise<Body> => {
  const text = await req.text();
  if (text.trim() === "") return {};
  try {
    const body: unknown = JSON.parse(text);
    if (typeof body === "object" && body != null && !Array.isArray(body)) return body as Body;
  } catch {}
  throw new BadRequest(["The request body must be a JSON object."]);
};

const check = (errors: string[]) => {
  if (errors.length > 0) throw new BadRequest(errors);
};

const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

const readPosition = (value: unknown): Position | null => {
  if (value == null) return null;
  const position = value as Partial<Position>;
  if (!isFiniteNumber(position.x) || !isFiniteNumber(position.y)) throw new BadRequest(["A position needs numeric x and y."]);
  return { x: position.x, y: position.y };
};

const readPositions = (value: unknown) => {
  if (typeof value !== "object" || value == null) throw new BadRequest(["Positions must be an object of node ids."]);
  return Object.fromEntries(Object.entries(value).map(([nodeId, position]) => [nodeId, readPosition(position) as Position]));
};

const readName = (body: Body) => {
  check(isNonEmptyString(body.name) ? [] : ["A graph needs a name."]);
  return body.name as string;
};

const handle =
  <R extends Request>(action: (req: R) => unknown | Promise<unknown>) =>
  async (req: R) => {
    try {
      const result = await action(req);
      return result === undefined ? new Response(null, { status: 204 }) : Response.json(result);
    } catch (error) {
      if (error instanceof BadRequest) return Response.json({ errors: error.errors }, { status: 400 });
      if (error instanceof StoreError) return Response.json({ errors: [error.message] }, { status: error.status });
      throw error;
    }
  };

const nodeInput = async (req: Request, partial = false) => {
  const body = await readBody(req);
  check(validateNodeInput(body as Partial<NodeInput>, partial));
  return body as Partial<NodeInput>;
};

const edgeInput = async (req: Request, partial = false) => {
  const body = await readBody(req);
  check(validateEdgeInput(body as Partial<EdgeInput>, partial));
  return body as Partial<EdgeInput>;
};

export const createServer = (store: GraphStore, port = PORT) =>
  Bun.serve({
    port,
    hostname: "127.0.0.1",
    routes: {
      "/": index,
      "/favicon.ico": new Response(null, { status: 204 }),

      "/api/nodes": {
        GET: handle(() => store.listNodes()),
        POST: handle(async (req) => store.createNode((await nodeInput(req)) as NodeInput)),
      },
      "/api/nodes/:id": {
        GET: handle((req) => store.getNode(req.params.id)),
        PATCH: handle(async (req) => store.updateNode(req.params.id, await nodeInput(req, true))),
        DELETE: handle((req) => store.deleteNode(req.params.id)),
      },

      "/api/edges": {
        GET: handle(() => store.listEdges()),
        POST: handle(async (req) => store.createEdge((await edgeInput(req)) as EdgeInput)),
      },
      "/api/edges/:id": {
        GET: handle((req) => store.getEdge(req.params.id)),
        PATCH: handle(async (req) => store.updateEdge(req.params.id, await edgeInput(req, true))),
        DELETE: handle((req) => store.deleteEdge(req.params.id)),
      },

      "/api/graphs": {
        GET: handle(() => store.listGraphs()),
        POST: handle(async (req) => store.createGraph(readName(await readBody(req)))),
      },
      "/api/graphs/:id": {
        GET: handle((req) => store.view(req.params.id)),
        PATCH: handle(async (req) => store.renameGraph(req.params.id, readName(await readBody(req)))),
        DELETE: handle((req) => store.deleteGraph(req.params.id)),
      },
      "/api/graphs/:id/nodes": {
        POST: handle(async (req) => {
          const body = await readBody(req);
          check(validateNodeInput(body as Partial<NodeInput>));
          return store.createNodeInGraph(req.params.id, body as NodeInput, readPosition(body.position));
        }),
      },
      "/api/graphs/:id/positions": {
        PUT: handle(async (req) => store.moveNodes(req.params.id, readPositions(await readBody(req)))),
      },
      "/api/graphs/:id/nodes/:nodeId": {
        PUT: handle(async (req) =>
          store.addNodeToGraph(req.params.id, req.params.nodeId, readPosition((await readBody(req)).position)),
        ),
        DELETE: handle((req) => store.removeNodeFromGraph(req.params.id, req.params.nodeId)),
      },
      "/api/graphs/:id/edges": {
        POST: handle(async (req) => store.createEdgeInGraph(req.params.id, (await edgeInput(req)) as EdgeInput)),
      },
      "/api/graphs/:id/edges/:edgeId": {
        PUT: handle((req) => store.addEdgeToGraph(req.params.id, req.params.edgeId)),
        DELETE: handle((req) => store.removeEdgeFromGraph(req.params.id, req.params.edgeId)),
      },
    },
    development: process.env.NODE_ENV !== "production" && { hmr: true, console: true },
  });

if (import.meta.main) {
  const server = createServer(openGraphStore(DB_PATH));
  console.log(`Graph app on ${server.url} (database ${DB_PATH})`);
  if (process.env.OPEN_BROWSER !== "0") Bun.spawn(["open", server.url.href]);
}
