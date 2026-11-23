# diagram

A local macOS app to keep and edit graphs. It runs a Bun server (Hono) on `127.0.0.1`, opens a React Flow editor in your browser, and stores everything in SQLite.

## Model

The app uses the labeled property graph model of ISO GQL (ISO/IEC 39075). In graph theory terms it supports a mixed pseudograph: directed and undirected edges, parallel edges between the same two nodes, loops, and cycles.

| Entity | Fields | Rules |
|---|---|---|
| Node | `id`, `name`, `description`, `type`, `intent`, `status`, `labels[]`, `properties{}` | The core entity. A node does not store its edges. All fields except the name are optional. |
| Edge | `id`, `source`, `target`, `directed`, `type`, `label`, `description`, `intent`, `status`, `properties{}` | Its own entity. Deleting a node deletes its edges. The editor shows the label, or the type name when the label is empty. |
| Graph | `id`, `name`, `description` + its nodes (with `x`, `y`) and edges | A named subgraph. Every node and edge is in a graph: you create them only in a graph (`POST /api/graphs/{id}/nodes` and `.../edges`), and when no graph holds one any more, it is deleted. The API can also put one node in many graphs, with a different position in each. A graph can include an edge only if it includes both nodes. The description says what the graph is for. It is required when you create a graph. |
| Group | `id`, `graphId`, `name`, `description` | A named box in one graph that holds a set of its nodes, for example the parts that one file defines. Each node of a graph has a `groupId`, and a node is in at most one group of a graph. The same node can be in a different group in another graph. |
| Flow | `id`, `graphId`, `name`, `description`, `steps[]` (`nodeId`, `edgeId`) | One specific path through a graph, for example the main path of a feature or an edge case. A graph can have many flows. Each step after the first follows an edge of the graph from the node of the step before. A flow is part of the draft, so a publish saves it in the version. |
| Run | `id`, `graphId`, `version`, `flowId`, `label`, `status`, `note`, `properties{}`, `events[]` (`step`, `nodeId`, `at`, `note`), `startedAt`, `endedAt` | One instance of a flow on a published version. `status` is `running`, `completed`, `failed` or `cancelled`. The last event is the current step. Runs stay after the graph is deleted. |
| Change | `id`, `name`, `notes`, `graphId`, `repo`, `base`, `branch`, `ideas[]` (`id`, `text`), `blocks[]` (`id`, `layer`, `text`), `links[]` (`from`, `to`) | One code change in four views: the idea (notes and points), the concepts (a graph), the pseudocode (blocks in the layers `ui`, `api`, `store` and `data`) and the code (the diff of a git branch). A link connects an item to an item in the next view down. |
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

- **Publish** (at the top right of the canvas, or `POST /api/graphs/{id}/versions`) saves version `n + 1`. If nothing changed since the latest version, it returns that version. Positions do not count as a change.
- `GET /api/graphs/{id}/versions/{version}` returns one version. Use `latest` for the newest.
- `hash` is a SHA-256 of the graph content (name, description, nodes and edges, without positions and timestamps).

### Groups

A group puts a box around nodes that belong together, with a name and a description, for example all the rules that one CLAUDE.md file defines.

- `POST /api/graphs/{id}/groups` adds a group with a name, a description and its `nodeIds`. `PATCH /api/graphs/{id}/groups/{groupId}` changes it, and `nodeIds` replaces all its nodes. `DELETE` removes the group; its nodes stay in the graph.
- `PATCH /api/graphs/{id}/nodes/{nodeId}` with `groupId` puts one node in a group, or takes it out with `null`. A node that moves to a group leaves its old group. `POST /api/graphs/{id}/nodes` also takes a `groupId`.
- `GET /api/graphs/{id}` returns the groups, and each node has its `groupId`. A published version keeps the groups. Groups are part of the content hash only when the graph has groups.
- **Auto layout** places the nodes of each group together, and the canvas draws the box around them, so the box follows its nodes when you drag them.
- Proposals and undo do not include groups yet.

### Flows

A graph that describes a feature shows everything that can happen. A flow picks one path through it, step by step.

- `POST /api/graphs/{id}/flows` adds a flow with a name, a description and its steps. Each step names a node. A step after the first also names the edge it follows from the node before (`edgeId`). Omit `edgeId` when exactly one edge connects the two nodes in that direction. An undirected edge goes both ways.
- `PATCH /api/graphs/{id}/flows/{flowId}` changes a flow, and `steps` replaces all the steps. `DELETE` removes it. `GET /api/graphs/{id}` also returns the flows.
- A flow keeps its steps when a node or an edge leaves the graph. The editor shows those steps in red.
- Flows are part of the content hash only when the graph has flows, so the hash of a graph without flows does not change.
- Proposals and undo do not include flows yet.

### Runs

A run is one instance of a flow: one pass through its steps, for example one call. An app that follows a flow records each run through the API.

1. `POST /api/graphs/{id}/runs` with `flowId` (and optional `version`, `label`, `properties`) starts a run at step 1. The run uses the latest published version by default, and the flow must be in that version.
2. `POST .../runs/{runId}/advance` (optional `note`) moves the run to the next step of its flow.
3. `POST .../runs/{runId}/finish` with `status` `completed`, `failed` or `cancelled` (and an optional `note`) ends it. A run can end at any step, and it does not change after that.
4. `GET /api/graphs/{id}/runs` lists the runs, newest first. Add `?flowId=` for the runs of one flow.

### Changes

A change shows one code change in four views, from the general idea to the code. Trace links connect each item to the items in the next view that carry it out.

| View | Items | Kind in a link |
|---|---|---|
| Idea | The points (`ideas`). The notes are prose without links. | `idea:<id>` |
| Concepts | The nodes of the graph of the change (`graphId`) | `node:<node id>` |
| Pseudocode | The blocks, each in one layer | `pseudo:<id>` |
| Code | The hunks of `git diff base...branch` in `repo` | `hunk:<hunk id>` |

- `POST /api/changes` adds a change, and `PATCH /api/changes/{id}` changes it. `ideas`, `blocks` and `links` each replace the whole list. Give items your own ids to link them in the same request. When a point or a block is removed, its links are removed too.
- A link goes `from` an item `to` an item in the next view down: idea to node, node to pseudo, or pseudo to hunk.
- `GET /api/changes/{id}/diff` runs git in the repository and returns the files and hunks. The id of a hunk is a hash of its file and its changed lines, without line numbers, so it stays the same after a rebase. A link to a node or a hunk that is gone stays, and the editor shows it in red.
- **Feedback:** `GET /api/changes/{id}/feedback` lists the notes of feedback on a change, and `POST` adds one with `text` and an optional `ref` (the item it is about, as `kind:id`). `PATCH /api/changes/{id}/feedback/{noteId}` changes a note; `done: true` marks it as handled. `DELETE` removes it. Deleting a change deletes its notes.
- Deleting the graph of a change sets `graphId` to null. Deleting a change does not delete its graph.
- This is the first version: edits do not move into the other views yet.

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

- **Walkthrough graph** (`/graphs/walkthrough`): a realistic example that uses every node type, relationship type and status. It has two flows: the main path ("Small claim is paid at once") and an edge case ("Large claim needs an adjuster"). Each flow has two example runs on version 1: one completed, and one that is still running or failed. The server makes it and publishes version 1 at start when the database does not have it, so it comes back after a delete. The data is in `walkthrough.ts`.
- **Changes** (`/changes`, in the top bar): the table of changes. Click **+** to add one with a name, a repository, a base branch and a branch. A change page (`/changes/{id}/{view}`) has a tab for each view: **Idea**, **Concepts**, **Pseudocode** and **Code**. Click an item to select it. When you switch tabs, the items that trace to it stay marked, the rest are dimmed, and each tab shows how many items are linked. The panel lists the links of the selected item in the next view up and down. **Link items in …** opens that view in link mode: a click on an item there links it to the selected item, or removes the link. The concept view shows the graph read-only; **Edit the graph** opens it. The **Feedback** section at the bottom of the panel collects notes while you look at the change: type a note and click **Add note** (or press ⌘Enter). With an item selected, the note is about that item, and the item shows a note count in its view. Click the item under a note to go to it, check a note when it is done, and click **Copy list** to copy the open notes as a markdown list.
- **Guide** (`/guide`, in the top bar next to **Graphs** and **API**) explains the parts of a graph: node types, edges, statuses, intent, the kinds of graph you can make, versions and proposals. It shows the current vocabulary in the same look as the canvas.
- The first page is a table of graphs. Search it, and click a column name to sort it. The table shows the latest version, a **draft** mark when the draft has changes that are not published, and the number of open proposals. Click **+** to add a graph with a name and a description of its purpose. Click **…** at the end of a row for actions on that graph. **Delete** deletes the graph after you confirm.
- Click a graph to open its draft (`/graphs/{id}`). A floating group at the top left of the canvas shows **←** (back to the list of graphs), the graph name (click it to rename the graph) and **⋮**, a menu with **Delete graph**. The draft is always editable, and each change saves at once. The status next to **Publish** at the top right of the canvas says **Saving…** while a change is on its way, and then if the draft has changes since the latest version. Edit the graph purpose in the panel, add nodes from the bar on the left of the canvas (one button for each node type in the vocabulary, and one for a node without a type: drag it onto the canvas, or click it to add the node in the middle of the view), and click **Publish** to save a version. The app shows only the nodes of the open graph.
- **Undo and redo:** the editor keeps a history of the changes you make to the draft in this session (until you reload or leave the page). Press ⌘Z or Ctrl+Z to undo and ⇧⌘Z, Ctrl+Shift+Z or Ctrl+Y to redo, or use the undo and redo buttons under the node types on the left of the canvas. In a text field, these keys undo your typing instead. With nothing selected, the **History** section in the panel lists the changes; click one to go back to the state just after it. An undo puts back the whole draft state, positions and edge routes included (`PUT /api/graphs/{id}/draft`), so it also undoes changes that others made to this graph in the meantime. A deleted node or edge comes back with the same id. Applying a proposal clears the history.
- **Groups:** with nothing selected, the **Groups** section of the panel lists the groups. Click **+** next to **Groups** to add one. Pick a group for a node in the **Group** list of its inspector, or **New group…** to make one with that node. Click the name of a group on the canvas, or in the list, to edit its name and description, see its nodes, or delete it.
- **Flows:** with nothing selected, the **Flows** section of the panel lists the flows of the graph. Click **+** next to **Flows**, type a name and click **Add** to make a flow. While a flow is open, a click on a node adds it as the next step, and a click on an edge follows that edge. The canvas shows the path with step numbers and dims the rest. Click **×** on a step to remove it and the steps after it, and **Done** to close the flow. A flow in a published version is read-only. An open flow also lists its **runs**. **Start a run** starts one on the latest version, to step through the flow by hand. Click a run to show it on its version: the current step has a ring, and the steps it did not reach yet are faded. **Next step**, **Complete**, **Fail** and **Cancel run** move it on or end it.
- With nothing selected, the panel shows the graph purpose at the top (click to edit it), then the sections **Flows**, **Proposals**, **Versions** and **History**. Click a section name to open or close it; the browser keeps that state. Hold the pointer on a section name to read what it is for. Pick a version in the **Versions** section to look at it. A version is read-only; **Back to the draft** returns to the draft. Old links to `/graphs/{id}/edit` open the draft.
- **Move around the canvas:** on a trackpad, pinch to zoom and swipe with two fingers to move the view. With a mouse, the wheel moves the view, and ⌘ or Ctrl with the wheel zooms. A drag on an empty part of the canvas also moves it.
- Each node has a dot on each side. Drag from any dot on one node to any dot on another node to add an edge. The node where the drag starts is the source. Drag to another dot on the same node to add a loop.
- Select a node or an edge to edit it in the inspector. Set its type, status, description and intent there. **Delete node** or **Delete edge** removes it from this graph. It stays in other graphs that hold it.
- Press Delete or Backspace to remove the selection from the graph.
- **Auto layout** (at the bottom right of the canvas) places all nodes with ELK (the layered algorithm of `elkjs`, which runs in the page). ELK keeps edge crossings few and routes each edge around the nodes with right-angle bends. The positions and the edge routes are saved for each graph (`PUT /api/graphs/{id}/layout`). When you drag a node, the routes of its edges are removed, and those edges show as direct lines until the next **Auto layout**. New nodes without a position are placed below the others.
- The walkthrough graph starts with the layout in `walkthrough-layout.json`. Run `bun walkthrough-layout.ts` to make that file again after a change to `walkthrough.ts` or to the layout options in `layout.ts`.
- **Horizontal** and **Vertical** (at the bottom right of the canvas) set the layout direction of the graph and place all nodes again in that direction. Each graph keeps its direction, and **Auto layout** uses it. The direction is not a change to publish (`direction` on `PATCH /api/graphs/{id}`).

## API

The API docs are generated from the code. With the app running, open:

- http://127.0.0.1:4848/docs for the interactive reference (Scalar)
- http://127.0.0.1:4848/openapi.json for the OpenAPI 3.1 spec

Each route in `api.ts` is defined with the Zod schemas in `schemas.ts`. The same schemas validate requests, give the TypeScript types, generate the spec, and type the browser client (`hono/client`), so the docs cannot drift from the code. The docs page loads the Scalar viewer from a CDN, so it needs an internet connection.

## MCP server

Diagram serves an MCP server for Claude at http://127.0.0.1:4848/mcp (Streamable HTTP, JSON responses, `mcp.ts`). Its instructions tell Claude what Diagram is, and its tools read and edit graphs, flows, proposals, changes and feedback.

- Each tool is one API route, listed in `ROUTES` in `mcp.ts`. The tool calls the route in the same process, so the route validates the input and gives the errors. The input schema of each tool comes from the OpenAPI spec of its route, and the `id` in a path gets the name of what it is (`graphId`, `changeId`, `nodeId` or `edgeId`).
- Routes that delete a graph or a change, or that apply or discard a proposal, are not tools. The user does those in the app.
- The server refuses a request with an `Origin` that is not `localhost` or `127.0.0.1`, and a request that is not JSON, so a web page cannot call the tools.
- Add it to Claude Code for every project with `claude mcp add --scope user --transport http Diagram http://127.0.0.1:4848/mcp`. The tools are then `mcp__Diagram__<tool>`. Diagram must run for the tools to work.

## Check

```bash
bun test
bun run typecheck
```
