# graphs

A local macOS app to keep and edit graphs. It runs a Bun server (Hono) on `127.0.0.1`, opens a React Flow editor in your browser, and stores everything in SQLite.

## Model

The app uses the labeled property graph model of ISO GQL (ISO/IEC 39075). In graph theory terms it supports a mixed pseudograph: directed and undirected edges, parallel edges between the same two nodes, loops, and cycles.

| Entity | Fields | Rules |
|---|---|---|
| Node | `id`, `name`, `description`, `type`, `intent`, `status`, `labels[]`, `properties{}` | The core entity. A node does not store its edges. All fields except the name are optional. |
| Edge | `id`, `source`, `target`, `directed`, `type`, `label`, `description`, `intent`, `status`, `properties{}` | Its own entity. Deleting a node deletes its edges. The editor shows the label, or the type name when the label is empty. |
| Graph | `id`, `name`, `description` + its nodes (with `x`, `y`) and edges | A named subgraph. Nodes and edges are shared, so one node can be in many graphs with a different position in each. A graph can include an edge only if it includes both nodes. The description says what the graph is for. It is required when you create a graph. |
| Version | `graphId`, `version`, `hash`, `publishedAt`, `view` | A published copy of a graph that does not change. `view` holds the graph, its nodes with positions, and its edges as they were at publish time. Versions stay after the graph is deleted. |

Property values are strings, numbers, booleans or `null`. Use `properties` for extensible metadata.

### Design vocabulary

The vocabulary is the set of node types, relationship types and lifecycle statuses that the editor and API clients (for example Claude) share. `GET /api/vocabulary` returns it.

| Term | Default ids |
|---|---|
| Node type (`type` on a node) | `service`, `module`, `database`, `external-system`, `user-interface`, `decision` |
| Relationship type (`type` on an edge) | `calls`, `publishes-event`, `consumes-event`, `reads-from`, `writes-to`, `depends-on` |
| Lifecycle status (`status` on a node or an edge) | `proposed`, `planned`, `active`, `deprecated`, `retired` |

- `type` and `status` hold a vocabulary id or `null`. The server rejects an id that is not in the vocabulary, for every route that writes nodes, edges or proposals. The editor uses the same API, so the same rules apply to it.
- `intent` says why the element exists. `description` says what it is.
- The vocabulary holds meaning only. The editor sets the look of each default type and status in `client/styles.css`. A type without a style shows in the default look.
- To change the vocabulary, set `VOCABULARY` to a JSON file with `nodeTypes`, `relationshipTypes` and `statuses`. Each is a list of `{ "id", "name", "description" }`. An id uses lowercase letters, digits and hyphens. The defaults are in `vocabulary.ts`.
- When you remove an id from the vocabulary, nodes and edges that use it keep it. The editor marks it as not in the vocabulary.

### Published versions

Apps that run a graph, for example a voice app that walks a decision tree, must run a published version, not the editable graph. Each run records `graphId` and `version`, so you can see later the exact graph that made each decision. A copy of the full graph is necessary because nodes are shared: an edit to a node for one graph also changes every other graph that holds it.

- **Publish** (in the inspector, or `POST /api/graphs/{id}/versions`) saves version `n + 1`. If nothing changed since the latest version, it returns that version. Positions do not count as a change.
- `GET /api/graphs/{id}/versions/{version}` returns one version. Use `latest` for the newest.
- `hash` is a SHA-256 of the graph content (name, description, nodes and edges, without positions and timestamps).

### Proposals

A proposal is a changed copy of a graph that you review before it changes the graph. Claude (or any API client) makes one; you compare it with a published version and then apply or discard it.

| Field | Use |
|---|---|
| `title`, `rationale`, `workItem` | What the change is, why, and the ticket, document or link it is for. |
| `content` | The full proposed graph: name, description, nodes with positions, and edges. |
| `baseVersion` | The latest published version when the proposal was saved. |
| `status` | `open`, `applied` or `discarded`. Only an open proposal can change. |

1. Read the graph with `GET /api/graphs/{id}`.
2. Send the full proposed graph to `POST /api/graphs/{id}/proposals`. Use existing ids to keep or change nodes and edges, and new keys (for example `review-step`) for new ones. Omitted fields keep the existing value. A node or edge that is not in the list leaves the graph.
3. Read the changes with `GET /api/graphs/{id}/proposals/{proposalId}/diff`. `against` is `latest` (the default), a version number, or `draft`.
4. In the app, open the proposal from **Proposals** in the inspector. The **Ledger** tab lists each added, removed and changed node and edge, with the fields before and after. The **Graph** tab shows both graphs on one canvas in color. A warning shows when a changed node is also in other graphs, because the change applies there too.
5. **Apply and publish** makes the graph equal to the proposal and publishes a new version. **Apply to draft** changes only the editable graph. Apply replaces edits that are not published. Use `PUT` on the proposal to revise it.

Not supported: hyperedges (one edge with more than two nodes), nested nodes, and schemas that limit which labels can connect.

## Run

```bash
bun install
bun start
```

The app opens at http://127.0.0.1:4848.

| Variable | Default | Use |
|---|---|---|
| `PORT` | `4848` | Server port |
| `GRAPH_DB` | `~/Library/Application Support/graphs/graphs.sqlite` | Database file |
| `OPEN_BROWSER` | on | Set `0` to not open the browser |
| `VOCABULARY` | the defaults in `vocabulary.ts` | A JSON file with the design vocabulary |

`bun run build` makes one binary, `dist/graphs`, that holds the server and the UI.

## Use

- Add a graph on the left with a name and a description of its purpose. Edit both in the inspector. Add nodes with **Add node**, or add existing nodes from the **Node library**.
- Drag from a dot on one node to a dot on another node to add an edge. Drag to the other dot on the same node to add a loop.
- Select a node or an edge to edit it in the inspector. Set its type, status, description and intent there. **Remove from graph** keeps it in the library; **Delete everywhere** deletes it from every graph.
- Press Delete or Backspace to remove the selection from the graph.
- **Auto layout** places all nodes with dagre. New nodes without a position are placed below the others. Dragged positions are saved for each graph.

## API

The API docs are generated from the code. With the app running, open:

- http://127.0.0.1:4848/docs for the interactive reference (Scalar)
- http://127.0.0.1:4848/openapi.json for the OpenAPI 3.1 spec

Each route in `api.ts` is defined with the Zod schemas in `schemas.ts`. The same schemas validate requests, give the TypeScript types, generate the spec, and type the browser client (`hono/client`), so the docs cannot drift from the code. The docs page loads the Scalar viewer from a CDN, so it needs an internet connection.

## Check

```bash
bun test
bun run typecheck
```
