import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import index from "./index.html";
import { createApi } from "./api.ts";
import { openGraphStore, type GraphStore } from "./db.ts";
import { Vocabulary } from "./schemas.ts";
import { DEFAULT_VOCABULARY } from "./vocabulary.ts";

const PORT = Number(process.env.PORT ?? 4848);
const DB_PATH =
  process.env.GRAPH_DB ?? join(homedir(), "Library", "Application Support", "diagram", "graphs.sqlite");

const loadVocabulary = (path: string | undefined): Vocabulary => {
  if (path == null || path === "") return DEFAULT_VOCABULARY;
  const result = Vocabulary.safeParse(JSON.parse(readFileSync(path, "utf8")));
  if (!result.success) throw new Error(`The vocabulary file ${path} is not valid: ${result.error.issues.map(({ message }) => message).join(" ")}`);
  return result.data;
};

export const createServer = (store: GraphStore, port = PORT) => {
  const api = createApi(store);
  return Bun.serve({
    port,
    hostname: "127.0.0.1",
    routes: {
      "/": index,
      "/graphs/*": index,
      "/guide": index,
      "/favicon.ico": new Response(null, { status: 204 }),
    },
    fetch: api.fetch,
    development: process.env.NODE_ENV !== "production" && { hmr: true, console: true },
  });
};

if (import.meta.main) {
  const server = createServer(openGraphStore(DB_PATH, loadVocabulary(process.env.VOCABULARY)));
  console.log(`Diagram on ${server.url} (API docs at ${new URL("/docs", server.url)}, database ${DB_PATH})`);
  if (process.env.OPEN_BROWSER !== "0") Bun.spawn(["open", server.url.href]);
}
