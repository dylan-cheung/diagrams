# diagram

A local macOS app to keep and edit graphs. It runs a Bun server (Hono) on `127.0.0.1`, opens a React Flow editor in your browser, and stores everything in SQLite.

## Model

The app uses the labeled property graph model of ISO GQL (ISO/IEC 39075). In graph theory terms it supports a mixed pseudograph: directed and undirected edges, parallel edges between the same two nodes, loops, and cycles.

| Entity | Fields | Rules |
|---|---|---|
| Node | `id`, `name`, `description`, `type`, `intent`, `status`, `labels[]`, `properties{}` | The core entity. A node does not store its edges. All fields except the name are optional. |
| Edge | `id`, `source`, `target`, `directed`, `type`, `label`, `description`, `intent`, `status`, `properties{}` | Its own entity. Deleting a node deletes its edges. The editor shows the label, or the type name when the label is empty. |
| Graph | `id`, `name`, `description` + its nodes (with `x`, `y`) and edges | A named subgraph. Every node and edge is in a graph: you create them only in a graph (`POST /api/graphs/{id}/nodes` and `.../edges`), and when no graph holds one any more, it is deleted. The API can also put one node in many graphs, with a different position in each. A graph can include an edge only if it includes both nodes. The description says what the graph is for. It is required when you create a graph. |
| Flow | `id`, `graphId`, `name`, `description`, `steps[]` (`nodeId`, `edgeId`) | One specific path through a graph, for example the main path of a feature or an edge case. A graph can have many flows. Each step after the first follows an edge of the graph from the node of the step before. A flow is part of the draft, so a publish saves it in the version. |
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

### Flows

A graph that describes a feature shows everything that can happen. A flow picks one path through it, step by step.

- `POST /api/graphs/{id}/flows` adds a flow with a name, a description and its steps. Each step names a node. A step after the first also names the edge it follows from the node before (`edgeId`). Omit `edgeId` when exactly one edge connects the two nodes in that direction. An undirected edge goes both ways.
- `PATCH /api/graphs/{id}/flows/{flowId}` changes a flow, and `steps` replaces all the steps. `DELETE` removes it. `GET /api/graphs/{id}` also returns the flows.
- A flow keeps its steps when a node or an edge leaves the graph. The editor shows those steps in red.
- Flows are part of the content hash only when the graph has flows, so the hash of a graph without flows does not change.
- Proposals and undo do not include flows yet.

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
4. In the app, open the proposal from **Proposals** in the panel of the graph, or at `/graphs/{id}/proposals/{proposalId}`. The **Ledger** tab lists each added, removed and changed node and edge, with the fields before and after. The **Graph** tab shows both graphs on one canvas in color. A warning shows when a changed node is also in other graphs, because the change applies there too.
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
| `GRAPH_DB` | `~/Library/Application Support/diagram/graphs.sqlite` | Database file |
| `OPEN_BROWSER` | on | Set `0` to not open the browser |
| `VOCABULARY` | the defaults in `vocabulary.ts` | A JSON file with the design vocabulary |

`bun run build` makes one binary, `dist/diagram`, that holds the server and the UI.

## Use

- **Walkthrough graph** (`/graphs/walkthrough`): a realistic example that uses every node type, relationship type and status. The server makes it and publishes version 1 at start when the database does not have it, so it comes back after a delete. The data is in `walkthrough.ts`.
- **Guide** (`/guide`, in the top bar next to **Graphs** and **API**) explains the parts of a graph: node types, edges, statuses, intent, the kinds of graph you can make, versions and proposals. It shows the current vocabulary in the same look as the canvas.
- The first page is a table of graphs. Search it, and click a column name to sort it. The table shows the latest version, a **draft** mark when the draft has changes that are not published, and the number of open proposals. Click **+** to add a graph with a name and a description of its purpose. Click **…** at the end of a row for actions on that graph. **Delete** deletes the graph after you confirm.
- Click a graph to open its draft (`/graphs/{id}`). The draft is always editable, and each change saves at once. The status at the top right of the canvas says **Saving…** while a change is on its way, and then if the draft has changes since the latest version. Edit the graph name and purpose in the panel, add nodes from the bar on the left of the canvas (one button for each node type in the vocabulary, and one for a node without a type: drag it onto the canvas, or click it to add the node in the middle of the view), and click **Publish** to save a version. The app shows only the nodes of the open graph.
- **Undo and redo:** the editor keeps a history of the changes you make to the draft in this session (until you reload or leave the page). Press ⌘Z or Ctrl+Z to undo and ⇧⌘Z, Ctrl+Shift+Z or Ctrl+Y to redo, or use the undo and redo buttons under the node types on the left of the canvas. In a text field, these keys undo your typing instead. With nothing selected, the **History** section in the panel lists the changes; click one to go back to the state just after it. An undo puts back the whole draft state, positions and edge routes included (`PUT /api/graphs/{id}/draft`), so it also undoes changes that others made to this graph in the meantime. A deleted node or edge comes back with the same id. Applying a proposal clears the history.
- **Flows:** with nothing selected, the **Flows** section of the panel lists the flows of the graph. Type a name and click **Add** to make a flow. While a flow is open, a click on a node adds it as the next step, and a click on an edge follows that edge. The canvas shows the path with step numbers and dims the rest. Click **×** on a step to remove it and the steps after it, and **Done** to close the flow. A flow in a published version is read-only.
- With nothing selected, the panel lists the proposals and the versions. Pick a version (in the panel or the version list) to look at it. A version is read-only; **Back to the draft** returns to the draft. Old links to `/graphs/{id}/edit` open the draft.
- Each node has a dot on each side. Drag from any dot on one node to any dot on another node to add an edge. The node where the drag starts is the source. Drag to another dot on the same node to add a loop.
- Select a node or an edge to edit it in the inspector. Set its type, status, description and intent there. **Delete node** or **Delete edge** removes it from this graph. It stays in other graphs that hold it.
- Press Delete or Backspace to remove the selection from the graph.
- **Auto layout** places all nodes with ELK (the layered algorithm of `elkjs`, which runs in the page). ELK keeps edge crossings few and routes each edge around the nodes with right-angle bends. The positions and the edge routes are saved for each graph (`PUT /api/graphs/{id}/layout`). When you drag a node, the routes of its edges are removed, and those edges show as direct lines until the next **Auto layout**. New nodes without a position are placed below the others.
- The walkthrough graph starts with the layout in `walkthrough-layout.json`. Run `bun walkthrough-layout.ts` to make that file again after a change to `walkthrough.ts` or to the layout options in `layout.ts`.
- **Horizontal** and **Vertical** (at the bottom right of the canvas) set the layout direction of the graph and place all nodes again in that direction. Each graph keeps its direction, and **Auto layout** uses it. The direction is not a change to publish (`direction` on `PATCH /api/graphs/{id}`).

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
