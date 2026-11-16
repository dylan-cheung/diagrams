import { openGraphStore } from "./db.ts";
import { autoLayout } from "./layout.ts";
import { termName } from "./vocabulary.ts";
import { ensureWalkthrough, WALKTHROUGH_ID, WALKTHROUGH_NODES, type SavedLayout } from "./walkthrough.ts";

// `bun walkthrough-layout.ts` runs ELK on the walkthrough graph and writes walkthrough-layout.json, which the server uses
// when it makes the walkthrough graph. Run it after a change to the nodes or edges in walkthrough.ts, or to the layout
// options in layout.ts.
const store = openGraphStore(":memory:");
ensureWalkthrough(store);
const { nodes, edges } = store.view(WALKTHROUGH_ID);
const vocabulary = store.vocabulary();
const { positions, routes } = await autoLayout(nodes, edges, false, "vertical", (edge) =>
  edge.label !== "" ? edge.label : (termName(vocabulary.relationshipTypes, edge.type) ?? ""),
);
const saved: SavedLayout = {
  positions: Object.fromEntries(WALKTHROUGH_NODES.map(({ key }, i) => [key, positions[nodes[i]?.id ?? ""] ?? { x: 0, y: 0 }])),
  routes: edges.map(({ id }) => routes[id] ?? []),
};
await Bun.write(new URL("./walkthrough-layout.json", import.meta.url), `${JSON.stringify(saved)}\n`);
console.log(`Wrote the layout of ${nodes.length} nodes and ${edges.length} edges.`);
