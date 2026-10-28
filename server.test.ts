import { afterAll, describe, expect, test } from "bun:test";
import { openGraphStore } from "./db.ts";
import { createServer } from "./server.ts";

const store = openGraphStore(":memory:");
const server = createServer(store, 0);
const url = (path: string) => new URL(path, server.url).href;

const send = (path: string, method: string, body?: unknown) =>
  fetch(url(path), { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

afterAll(() => {
  server.stop(true);
  store.close();
});

describe("graphs API", () => {
  test("creates, reads, updates, lists and deletes a graph", async () => {
    const created = await (await send("/api/graphs", "POST", { name: "pipeline" })).json();
    expect(created.type).toBe("directional");
    expect(created.nodes).toHaveLength(1);

    const start = created.nodes[0];
    const nodes = [
      { ...start, next: "n2" },
      { id: "n2", type: "decision", label: "Decide", next: null, routes: [{ key: "done", label: "Done", target: null, stop: true }] },
    ];
    const updated = await (await send(`/api/graphs/${created._id}`, "PUT", { name: "pipeline", type: "directional", nodes })).json();
    expect(updated.nodes[1].routes[0]).toEqual({ key: "done", label: "Done", target: null, stop: true });

    const list = await (await fetch(url("/api/graphs"))).json();
    expect(list).toEqual([expect.objectContaining({ _id: created._id, nodeCount: 2 })]);

    expect((await send(`/api/graphs/${created._id}`, "DELETE")).status).toBe(204);
    expect((await fetch(url(`/api/graphs/${created._id}`))).status).toBe(404);
  });

  test("rejects an invalid graph and a duplicate name", async () => {
    const created = await (await send("/api/graphs", "POST", { name: "unique" })).json();
    const bad = await send(`/api/graphs/${created._id}`, "PUT", {
      name: "unique",
      type: "directional",
      nodes: [{ id: "a", type: "t", label: "A", next: "a", routes: [] }],
    });
    expect(bad.status).toBe(400);
    expect((await send("/api/graphs", "POST", { name: "unique" })).status).toBe(409);
  });
});
