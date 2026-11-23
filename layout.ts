import ELK, { type ElkExtendedEdge, type ElkNode } from "elkjs/lib/elk.bundled.js";
import { LABEL_HEIGHT, labelSize, type Point } from "./geometry.ts";
import type { ContentEdge, ContentNode, LayoutDirection, Position } from "./model.ts";

export const NODE_WIDTH = 180;
export const NODE_HEIGHT = 56;

// A node with a type, a name and a status line is 63 px high. The layout uses this height, so routes and labels do not
// touch the bottom of such a node.
const LAYOUT_NODE_HEIGHT = 64;

export type Layout = { positions: Record<string, Position>; routes: Record<string, Point[]> };

// The room inside a group box around its nodes. The top has room for the name of the group.
export const GROUP_PADDING = { top: 40, side: 16, bottom: 16 };

// The room inside a node that holds other nodes (a first-tier node with its second-tier nodes). The top has room for its
// type and its name.
export const CONTAINER_PADDING = { top: 52, side: 14, bottom: 14 };

// In the browser, the bundled build runs ELK in the page. A layout of a graph with tens of nodes takes a few
// milliseconds. Outside a browser (Bun tests and scripts), the bundled build cannot start its fake worker, so ELK runs in
// a Bun worker that does not keep the process alive. ELK starts at the first layout, so the server loads it only when a client asks it for an auto layout.
let instance: InstanceType<typeof ELK> | null = null;
const elk = () => {
  instance ??=
    typeof document !== "undefined"
      ? new ELK()
      : new ELK({
          workerFactory: () => {
            const worker = new Worker(import.meta.resolve("elkjs/lib/elk-worker.min.js"));
            (worker as Worker & { unref: () => void }).unref();
            return worker;
          },
        });
  return instance;
};

// ELK's layered algorithm places the nodes in layers with few edge crossings, and routes each edge around the nodes
// with right-angle bends. Each edge label has its size, so ELK leaves room for it.
const options = (direction: LayoutDirection) => ({
  "elk.algorithm": "layered",
  "elk.direction": direction === "vertical" ? "DOWN" : "RIGHT",
  "elk.edgeRouting": "ORTHOGONAL",
  "elk.spacing.nodeNode": "50",
  "elk.layered.spacing.nodeNodeBetweenLayers": "60",
  "elk.layered.spacing.edgeNodeBetweenLayers": "24",
  "elk.spacing.edgeEdge": "16",
  "elk.layered.spacing.edgeEdgeBetweenLayers": "16",
  "elk.spacing.edgeLabel": "4",
  // In a cycle, the edge that goes against the order of the nodes in the graph is the one that points back. So the nodes
  // made first, which usually start the flow, stay at the top.
  "elk.layered.cycleBreaking.strategy": "GREEDY_MODEL_ORDER",
  "elk.layered.crossingMinimization.thoroughness": "30",
  "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
  "elk.padding": "[top=20,left=20,bottom=20,right=20]",
  // Groups are nodes that hold their nodes, and the edges into and out of groups are laid out with the rest.
  "elk.hierarchyHandling": "INCLUDE_CHILDREN",
});

const CONTAINER_OPTIONS = {
  "elk.padding": `[top=${CONTAINER_PADDING.top + 6},left=${CONTAINER_PADDING.side + 6},bottom=${CONTAINER_PADDING.bottom + 6},right=${CONTAINER_PADDING.side + 6}]`,
  "elk.spacing.nodeNode": "24",
};

const GROUP_OPTIONS = { "elk.padding": `[top=${GROUP_PADDING.top + 8},left=${GROUP_PADDING.side + 8},bottom=${GROUP_PADDING.bottom + 8},right=${GROUP_PADDING.side + 8}]` };

// Places every node and routes every edge. The nodes of a group are placed together, in a box. With onlyUnplaced, it returns positions only for the nodes that have no
// position, below the placed nodes, and no routes, so the placed nodes and their routes stay as they are.
export const autoLayout = async <E extends Pick<ContentEdge, "id" | "source" | "target">>(
  nodes: (Pick<ContentNode, "id" | "position"> & { groupId?: string | null; parentId?: string | null })[],
  edges: E[],
  onlyUnplaced: boolean,
  direction: LayoutDirection,
  labelOf: (edge: E) => string = () => "",
): Promise<Layout> => {
  const ids = new Set(nodes.map(({ id }) => id));
  const parentOf = (node: { parentId?: string | null }) => (node.parentId != null && ids.has(node.parentId) ? node.parentId : null);
  // A node that holds other nodes is a box around them, as a group is. A node within another node goes with it, not with
  // its own group.
  const leaf = ({ id }: { id: string }): ElkNode => {
    const inner = nodes.filter((node) => parentOf(node) === id);
    return inner.length === 0
      ? { id, width: NODE_WIDTH, height: LAYOUT_NODE_HEIGHT }
      : { id, layoutOptions: CONTAINER_OPTIONS, children: inner.map(leaf) };
  };
  const top = nodes.filter((node) => parentOf(node) == null);
  const groupIds = [...new Set(top.flatMap(({ groupId }) => (groupId == null ? [] : [groupId])))];
  const graph: ElkNode = {
    id: "root",
    layoutOptions: options(direction),
    children: [
      ...top.filter(({ groupId }) => groupId == null).map(leaf),
      ...groupIds.map((groupId) => ({ id: `group:${groupId}`, layoutOptions: GROUP_OPTIONS, children: top.filter((node) => node.groupId === groupId).map(leaf) })),
    ],
    edges: edges.map((edge): ElkExtendedEdge => {
      const text = labelOf(edge);
      return { id: edge.id, sources: [edge.source], targets: [edge.target], labels: text === "" ? [] : [{ text, ...labelSize(text), height: LABEL_HEIGHT }] };
    }),
  };
  const result = await elk().layout(graph);

  const placed = nodes.filter(({ position }) => position != null);
  const shiftY = onlyUnplaced && placed.length > 0 ? Math.max(...placed.map(({ position }) => (position as Position).y)) + LAYOUT_NODE_HEIGHT + 60 : 0;
  const unplaced = new Set(nodes.filter(({ position }) => position == null).map(({ id }) => id));
  const positions: Record<string, Position> = {};
  // The position of a node in a group or in another node is relative to that box. The points of an edge are relative
  // to the innermost box that holds both of its ends.
  const offsets = new Map<string, Point>([["root", { x: 0, y: 0 }]]);
  const boxOf = new Map<string, string>();
  const flatten = (children: ElkNode[], dx: number, dy: number, box: string): ElkNode[] =>
    children.flatMap((child) => {
      const x = dx + (child.x ?? 0);
      const y = dy + (child.y ?? 0);
      offsets.set(child.id, { x, y });
      boxOf.set(child.id, box);
      const inner = flatten(child.children ?? [], x, y, child.id);
      return child.id.startsWith("group:") ? inner : [{ ...child, x, y }, ...inner];
    });
  const leaves = flatten(result.children ?? [], 0, 0, "root");
  const chain = (id: string) => {
    const ids = [id];
    for (let box = boxOf.get(id); box != null; box = boxOf.get(box)) ids.push(box);
    return [...ids, "root"];
  };
  const edgeOffset = (source: string, target: string) => {
    const around = new Set(chain(target));
    return offsets.get(chain(source).find((id) => around.has(id)) ?? "root") ?? { x: 0, y: 0 };
  };
  for (const child of leaves) {
    if (onlyUnplaced && !unplaced.has(child.id)) continue;
    positions[child.id] = { x: Math.round(child.x ?? 0), y: Math.round((child.y ?? 0) + shiftY) };
  }

  const routes: Record<string, Point[]> = {};
  if (!onlyUnplaced) {
    for (const edge of result.edges ?? []) {
      const section = edge.sections?.[0];
      if (section == null) continue;
      const shift = edgeOffset(edge.sources[0] ?? "", edge.targets[0] ?? "");
      routes[edge.id] = [section.startPoint, ...(section.bendPoints ?? []), section.endPoint].map(({ x, y }) => ({ x: Math.round(x + shift.x), y: Math.round(y + shift.y) }));
    }
  }
  return { positions, routes };
};
