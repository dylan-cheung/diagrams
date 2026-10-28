import {
  createNode,
  findRootIds,
  layoutGraph,
  removeNode,
  validateGraph,
  type Graph,
  type GraphNode,
  type GraphRoute,
} from "./graph.ts";
import type { GraphSummary } from "./db.ts";

const NODE_W = 190;
const NODE_H = 56;
const COL_STEP = 290;
const ROW_STEP = 112;
const STOP_LINE = 15;
const SVG_NS = "http://www.w3.org/2000/svg";

type State = {
  graphs: GraphSummary[];
  saved: Graph | null;
  draft: Graph | null;
  selectedId: string | null;
  errors: string[];
};

const state: State = { graphs: [], saved: null, draft: null, selectedId: null, errors: [] };

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const graphList = $<HTMLUListElement>("graph-list");
const newGraphForm = $<HTMLFormElement>("new-graph");
const graphTitle = $("graph-title");
const dirtyBadge = $("dirty");
const addNodeButton = $<HTMLButtonElement>("add-node");
const revertButton = $<HTMLButtonElement>("revert");
const saveButton = $<HTMLButtonElement>("save");
const errorList = $<HTMLUListElement>("errors");
const canvas = $("canvas");
const inspector = $("inspector");

type Attrs = Record<string, string | number | boolean | null | undefined>;

const h = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: (Node | string | null)[]
) => {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key in el && typeof value !== "string") (el as unknown as Record<string, unknown>)[key] = value;
    else el.setAttribute(key, value === true ? "" : String(value));
  }
  for (const child of children) if (child != null) el.append(child);
  return el;
};

const s = (tag: string, attrs: Attrs = {}, text?: string) => {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) if (value != null) el.setAttribute(key, String(value));
  if (text != null) el.textContent = text;
  return el;
};

const clone = <T>(value: T): T => structuredClone(value);

const isDirty = () =>
  state.draft != null &&
  state.saved != null &&
  JSON.stringify({ ...state.draft, updatedAt: null }) !== JSON.stringify({ ...state.saved, updatedAt: null });

const api = async <T>(path: string, init?: RequestInit) => {
  const res = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  if (res.status === 204) return { ok: true as const, data: null as T };
  const body = await res.json();
  return res.ok ? { ok: true as const, data: body as T } : { ok: false as const, errors: (body.errors ?? []) as string[] };
};

const nodeById = (id: string | null) => state.draft?.nodes.find((node) => node.id === id) ?? null;

const truncate = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

const renderList = () => {
  graphList.replaceChildren(
    ...state.graphs.map((graph) => {
      const button = h(
        "button",
        { type: "button", class: graph._id === state.saved?._id ? "active" : null },
        h("span", {}, graph.name),
        h("span", { class: "meta" }, `${graph.nodeCount} nodes · ${graph.type}`),
      );
      button.addEventListener("click", () => void openGraph(graph._id));
      return h("li", {}, button);
    }),
  );
};

const renderToolbar = () => {
  const hasGraph = state.draft != null;
  const dirty = isDirty();
  graphTitle.textContent = state.draft?.name ?? "No graph selected";
  dirtyBadge.hidden = !dirty;
  addNodeButton.disabled = !hasGraph;
  revertButton.disabled = !dirty;
  saveButton.disabled = !dirty;
  errorList.hidden = state.errors.length === 0;
  errorList.replaceChildren(...state.errors.map((error) => h("li", {}, error)));
};

const nodePoint = (positions: ReturnType<typeof layoutGraph>, id: string) => {
  const pos = positions.get(id) ?? { depth: 0, row: 0 };
  return { x: pos.depth * COL_STEP, y: pos.row * ROW_STEP };
};

const curve = (x1: number, y1: number, x2: number, y2: number) => {
  const dx = Math.max(40, Math.abs(x2 - x1) / 2);
  return `M${x1} ${y1} C${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
};

const renderCanvas = () => {
  const draft = state.draft;
  if (draft == null) {
    canvas.replaceChildren(h("p", { class: "empty" }, "Pick a graph on the left, or add a new one."));
    return;
  }
  const positions = layoutGraph(draft.nodes);
  const roots = new Set(findRootIds(draft.nodes));
  const maxDepth = Math.max(0, ...[...positions.values()].map(({ depth }) => depth));
  const maxRow = Math.max(0, ...[...positions.values()].map(({ row }) => row));
  const width = maxDepth * COL_STEP + NODE_W + 140;
  const maxStops = Math.max(0, ...draft.nodes.map(({ routes }) => routes.filter(({ stop }) => stop).length));
  const height = maxRow * ROW_STEP + NODE_H + 20 + maxStops * STOP_LINE;
  const svg = s("svg", { width, height, viewBox: `-10 -10 ${width} ${height}` });
  const defs = s("defs");
  const marker = s("marker", {
    id: "arrow",
    viewBox: "0 0 10 10",
    refX: 9,
    refY: 5,
    markerWidth: 7,
    markerHeight: 7,
    orient: "auto-start-reverse",
  });
  marker.append(s("path", { d: "M0 0L10 5L0 10z", class: "arrow" }));
  defs.append(marker);
  svg.append(defs);

  const edges = s("g");
  const labels = s("g");
  for (const node of draft.nodes) {
    const from = nodePoint(positions, node.id);
    const startX = from.x + NODE_W;
    const midY = from.y + NODE_H / 2;
    if (node.next != null && nodeById(node.next) != null) {
      const to = nodePoint(positions, node.next);
      edges.append(s("path", { d: curve(startX, midY, to.x - 2, to.y + NODE_H / 2), class: "edge", "marker-end": "url(#arrow)" }));
    }
    const routeText = (route: GraphRoute) => truncate(route.label === "" ? route.key : route.label, 22);
    const targeted = node.routes.filter((route) => route.target != null && nodeById(route.target) != null);
    targeted.forEach((route, i) => {
      const y1 = midY + (targeted.length === 1 ? 0 : (i - (targeted.length - 1) / 2) * 12);
      const to = nodePoint(positions, route.target as string);
      const x2 = to.x - 2;
      const y2 = to.y + NODE_H / 2;
      const text = routeText(route);
      edges.append(s("path", { d: curve(startX, y1, x2, y2), class: "edge route", "marker-end": "url(#arrow)" }));
      const lx = startX + 16;
      const ly = y1 + (y2 - y1) * 0.18 - 4;
      labels.append(s("rect", { x: lx - 3, y: ly - 11, width: text.length * 6.2 + 6, height: 15, rx: 3, class: "edge-label-bg" }));
      labels.append(s("text", { x: lx, y: ly, class: "edge-label" }, text));
    });
    node.routes
      .filter((route) => route.stop)
      .forEach((route, i) => {
        const y = from.y + NODE_H + 13 + i * STOP_LINE;
        labels.append(s("text", { x: from.x + 12, y, class: "stop-mark" }, `■ ${routeText(route)} · stop`));
      });
  }
  svg.append(edges);

  for (const node of draft.nodes) {
    const { x, y } = nodePoint(positions, node.id);
    const classes = ["node", roots.has(node.id) ? "root" : "", node.id === state.selectedId ? "selected" : ""];
    const g = s("g", { class: classes.join(" ").trim(), transform: `translate(${x} ${y})` });
    g.append(s("rect", { width: NODE_W, height: NODE_H, rx: 8 }));
    g.append(s("text", { x: 12, y: 23, class: "label" }, truncate(node.label === "" ? "(no label)" : node.label, 24)));
    g.append(s("text", { x: 12, y: 42, class: "type" }, truncate(node.type === "" ? "(no type)" : node.type, 28)));
    g.addEventListener("click", (event) => {
      event.stopPropagation();
      selectNode(node.id);
    });
    svg.append(g);
  }
  svg.append(labels);
  svg.addEventListener("click", () => selectNode(null));
  canvas.replaceChildren(svg);
};

const field = (label: string, control: HTMLElement) => h("label", { class: "field" }, h("span", {}, label), control);

const textInput = (value: string, onInput: (value: string) => void, attrs: Attrs = {}) => {
  const input = h("input", { value, ...attrs });
  input.addEventListener("input", () => onInput(input.value));
  return input;
};

const textArea = (value: string, onInput: (value: string) => void) => {
  const area = h("textarea", { rows: 2 });
  area.value = value;
  area.addEventListener("input", () => onInput(area.value));
  return area;
};

const nodeSelect = (value: string | null, excludeId: string, onChange: (value: string | null) => void, disabled = false) => {
  const select = h(
    "select",
    { disabled },
    h("option", { value: "" }, "None"),
    ...(state.draft?.nodes ?? [])
      .filter(({ id }) => id !== excludeId)
      .map((node) => h("option", { value: node.id, selected: node.id === value }, node.label === "" ? node.id : node.label)),
  );
  select.addEventListener("change", () => onChange(select.value === "" ? null : select.value));
  return select;
};

const button = (label: string, onClick: () => void, attrs: Attrs = {}) => {
  const el = h("button", { type: "button", ...attrs }, label);
  el.addEventListener("click", onClick);
  return el;
};

const changed = (rebuildInspector = false) => {
  state.errors = [];
  renderCanvas();
  renderToolbar();
  if (rebuildInspector) renderInspector();
};

const updateNode = (nodeId: string, patch: Partial<GraphNode>, rebuildInspector = false) => {
  const node = nodeById(nodeId);
  if (node == null) return;
  Object.assign(node, patch);
  changed(rebuildInspector);
};

const updateRoute = (nodeId: string, index: number, patch: Partial<GraphRoute>, rebuildInspector = false) => {
  const route = nodeById(nodeId)?.routes[index];
  if (route == null) return;
  Object.assign(route, patch);
  changed(rebuildInspector);
};

const routeEditor = (node: GraphNode, route: GraphRoute, index: number) =>
  h(
    "div",
    { class: "route" },
    h(
      "div",
      { class: "row" },
      field("Key", textInput(route.key, (key) => updateRoute(node.id, index, { key }), { placeholder: "lowercase_key" })),
    ),
    field("Label", textInput(route.label, (label) => updateRoute(node.id, index, { label }))),
    field(
      "Description",
      textArea(route.description ?? "", (description) => updateRoute(node.id, index, { description })),
    ),
    field(
      "Target",
      nodeSelect(route.target, node.id, (target) => updateRoute(node.id, index, { target }, true), route.stop),
    ),
    (() => {
      const box = h("input", { type: "checkbox", checked: route.stop });
      box.addEventListener("change", () =>
        updateRoute(node.id, index, { stop: box.checked, target: box.checked ? null : route.target }, true),
      );
      return h("label", { class: "check" }, box, "Stop here");
    })(),
    button(
      "Remove route",
      () => {
        node.routes.splice(index, 1);
        changed(true);
      },
      { class: "danger" },
    ),
  );

const renderGraphInspector = (draft: Graph) => {
  inspector.replaceChildren(
    h(
      "section",
      { class: "section" },
      h("h2", {}, "Graph"),
      field(
        "Name",
        textInput(draft.name, (name) => {
          draft.name = name;
          changed();
        }),
      ),
      field(
        "Type",
        textInput(draft.type, (type) => {
          draft.type = type;
          changed();
        }),
      ),
      h("p", { class: "hint" }, `${draft.nodes.length} nodes. Click a node in the diagram to edit it.`),
      h("p", { class: "mono" }, draft._id),
      button("Delete graph", () => void deleteGraph(), { class: "danger" }),
    ),
  );
};

const renderNodeInspector = (node: GraphNode) => {
  inspector.replaceChildren(
    h(
      "section",
      { class: "section" },
      h("h2", {}, "Node"),
      field("Label", textInput(node.label, (label) => updateNode(node.id, { label }))),
      field("Type", textInput(node.type, (type) => updateNode(node.id, { type }), { placeholder: "start, step, decision…" })),
      field("Next", nodeSelect(node.next, node.id, (next) => updateNode(node.id, { next }, true))),
      h(
        "div",
        { class: "row" },
        button("Add next node", () => addNode(node.id)),
        button(
          "Delete node",
          () => {
            if (state.draft == null) return;
            state.draft.nodes = removeNode(state.draft.nodes, node.id);
            state.selectedId = null;
            changed(true);
          },
          { class: "danger" },
        ),
      ),
      h("p", { class: "mono" }, node.id),
    ),
    h(
      "section",
      { class: "section" },
      h("h2", {}, `Routes (${node.routes.length})`),
      ...node.routes.map((route, index) => routeEditor(node, route, index)),
      button("Add route", () => {
        node.routes.push({ key: `route_${node.routes.length + 1}`, label: "New route", target: null, stop: false });
        changed(true);
      }),
    ),
  );
};

const renderInspector = () => {
  const draft = state.draft;
  if (draft == null) {
    inspector.replaceChildren(h("p", { class: "hint" }, "No graph selected."));
    return;
  }
  const node = nodeById(state.selectedId);
  if (node == null) renderGraphInspector(draft);
  else renderNodeInspector(node);
};

const render = () => {
  renderList();
  renderToolbar();
  renderCanvas();
  renderInspector();
};

const selectNode = (id: string | null) => {
  state.selectedId = id;
  renderCanvas();
  renderInspector();
};

const addNode = (afterId: string | null) => {
  if (state.draft == null) return;
  const node = createNode();
  const parent = nodeById(afterId);
  state.draft.nodes.push(node);
  if (parent != null && parent.next == null) parent.next = node.id;
  state.selectedId = node.id;
  changed(true);
};

const confirmDiscard = () => !isDirty() || confirm("Discard unsaved changes?");

const loadList = async () => {
  const result = await api<GraphSummary[]>("/api/graphs");
  if (result.ok) state.graphs = result.data;
};

const openGraph = async (id: string) => {
  if (id === state.saved?._id || !confirmDiscard()) return;
  const result = await api<Graph>(`/api/graphs/${id}`);
  if (!result.ok) {
    state.errors = result.errors;
    renderToolbar();
    return;
  }
  state.saved = result.data;
  state.draft = clone(result.data);
  state.selectedId = null;
  state.errors = [];
  render();
};

const save = async () => {
  const draft = state.draft;
  if (draft == null || !isDirty()) return;
  const errors = validateGraph(draft);
  if (errors.length > 0) {
    state.errors = errors;
    renderToolbar();
    return;
  }
  const result = await api<Graph>(`/api/graphs/${draft._id}`, {
    method: "PUT",
    body: JSON.stringify({ name: draft.name, type: draft.type, nodes: draft.nodes }),
  });
  if (!result.ok) {
    state.errors = result.errors;
    renderToolbar();
    return;
  }
  state.saved = result.data;
  state.draft = clone(result.data);
  state.errors = [];
  await loadList();
  render();
};

const deleteGraph = async () => {
  const saved = state.saved;
  if (saved == null || !confirm(`Delete the graph "${saved.name}"? This cannot be undone.`)) return;
  const result = await api<null>(`/api/graphs/${saved._id}`, { method: "DELETE" });
  if (!result.ok) {
    state.errors = result.errors;
    renderToolbar();
    return;
  }
  state.saved = null;
  state.draft = null;
  state.selectedId = null;
  await loadList();
  render();
};

newGraphForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!confirmDiscard()) return;
  const input = newGraphForm.elements.namedItem("name") as HTMLInputElement;
  const result = await api<Graph>("/api/graphs", { method: "POST", body: JSON.stringify({ name: input.value }) });
  if (!result.ok) {
    state.errors = result.errors;
    renderToolbar();
    return;
  }
  input.value = "";
  await loadList();
  state.saved = null;
  await openGraph(result.data._id);
});

addNodeButton.addEventListener("click", () => addNode(state.selectedId));
saveButton.addEventListener("click", () => void save());
revertButton.addEventListener("click", () => {
  if (state.saved == null) return;
  state.draft = clone(state.saved);
  if (nodeById(state.selectedId) == null) state.selectedId = null;
  state.errors = [];
  render();
});

document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === "s") {
    event.preventDefault();
    void save();
  }
});

window.addEventListener("beforeunload", (event) => {
  if (isDirty()) event.preventDefault();
});

await loadList();
render();
