import { homedir } from "node:os";
import { join } from "node:path";
import index from "./index.html";
import { createApi } from "./api.ts";
import { openGraphStore, type GraphStore } from "./db.ts";

const PORT = Number(process.env.PORT ?? 4848);
const DB_PATH =
  process.env.GRAPH_DB ?? join(homedir(), "Library", "Application Support", "diagram", "graphs.sqlite");

export const createServer = (store: GraphStore, port = PORT) => {
  const api = createApi(store);
  return Bun.serve({
    port,
    hostname: "127.0.0.1",
    routes: {
      "/": index,
      "/favicon.ico": new Response(null, { status: 204 }),
    },
    fetch: api.fetch,
    development: process.env.NODE_ENV !== "production" && { hmr: true, console: true },
  });
};

if (import.meta.main) {
  const server = createServer(openGraphStore(DB_PATH));
  console.log(`Graph app on ${server.url} (API docs at ${new URL("/docs", server.url)}, database ${DB_PATH})`);
  if (process.env.OPEN_BROWSER !== "0") Bun.spawn(["open", server.url.href]);
}
