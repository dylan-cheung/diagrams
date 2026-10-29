import { afterAll, describe, expect, test } from "bun:test";
import { openGraphStore } from "./db.ts";
import { createServer } from "./server.ts";

const store = openGraphStore(":memory:");
const server = createServer(store, 0);

const send = async (method: string, path: string, body?: unknown) => {
  const res = await fetch(new URL(path, server.url), {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: res.status === 204 ? null : await res.json() };
};

afterAll(() => {
  server.stop(true);
  store.close();
});

describe("API", () => {
  test("builds a graph of nodes and edges", async () => {
    const graph = (await send("POST", "/api/graphs", { name: "people" })).body;
    const ada = (await send("POST", `/api/graphs/${graph.id}/nodes`, { name: "Ada", labels: ["Person"], position: { x: 0, y: 0 } })).body;
    const bob = (await send("POST", `/api/graphs/${graph.id}/nodes`, { name: "Bob", properties: { age: 41 } })).body;
    const knows = await send("POST", `/api/graphs/${graph.id}/edges`, { source: ada.id, target: bob.id, label: "knows", directed: false });
    expect(knows.status).toBe(200);

    await send("PUT", `/api/graphs/${graph.id}/positions`, { [bob.id]: { x: 200, y: 40 } });
    const view = (await send("GET", `/api/graphs/${graph.id}`)).body;
    expect(view.nodes.map(({ name, position }: { name: string; position: unknown }) => [name, position])).toEqual([
      ["Ada", { x: 0, y: 0 }],
      ["Bob", { x: 200, y: 40 }],
    ]);
    expect(view.edges[0]).toMatchObject({ label: "knows", directed: false });

    const renamed = await send("PATCH", `/api/nodes/${bob.id}`, { name: "Robert" });
    expect(renamed.body).toMatchObject({ name: "Robert", properties: { age: 41 } });

    expect((await send("GET", "/api/graphs")).body).toEqual([expect.objectContaining({ nodeCount: 2, edgeCount: 1 })]);
  });

  test("returns 400, 404 and 409 with messages", async () => {
    expect((await send("POST", "/api/nodes", { name: "" })).status).toBe(400);
    expect((await send("POST", "/api/nodes", { name: "X", properties: { nested: { a: 1 } } })).body.errors).toEqual([
      "Property nested must be a string, number, boolean or null.",
    ]);
    expect((await send("GET", "/api/nodes/missing")).status).toBe(404);
    await send("POST", "/api/graphs", { name: "dup" });
    expect((await send("POST", "/api/graphs", { name: "dup" })).status).toBe(409);
    expect((await send("PUT", "/api/graphs/missing/positions", { a: { x: "1" } })).status).toBe(400);
  });
});
