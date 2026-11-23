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

// In the browser, the bundled build runs ELK in the page. A layout of a graph with tens of nodes takes a few
// milliseconds. Outside a browser (Bun tests and scripts), the bundled build cannot start its fake worker, so ELK runs in
// a Bun worker that does not keep the process alive. ELK starts at the first layout, so the server never loads it.
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

const GROUP_OPTIONS = { "elk.padding": `[top=${GROUP_PADDING.top + 8},left=${GROUP_PADDING.side + 8},bottom=${GROUP_PADDING.bottom + 8},right=${GROUP_PADDING.side + 8}]` };

// Places every node and routes every edge. The nodes of a group are placed together, in a box. With onlyUnplaced, it returns positions only for the nodes that have no
// position, below the placed nodes, and no routes, so the placed nodes and their routes stay as they are.
export const autoLayout = async <E extends Pick<ContentEdge, "id" | "source" | "target">>(
  nodes: (Pick<ContentNode, "id" | "position"> & { groupId?: string | null })[],
  edges: E[],
  onlyUnplaced: boolean,
  direction: LayoutDirection,
  labelOf: (edge: E) => string = () => "",
): Promise<Layout> => {
  const leaf = ({ id }: { id: string }): ElkNode => ({ id, width: NODE_WIDTH, height: LAYOUT_NODE_HEIGHT });
  const groupIds = [...new Set(nodes.flatMap(({ groupId }) => (groupId == null ? [] : [groupId])))];
  const graph: ElkNode = {
    id: "root",
    layoutOptions: options(direction),
    children: [
      ...nodes.filter(({ groupId }) => groupId == null).map(leaf),
      ...groupIds.map((groupId) => ({ id: `group:${groupId}`, layoutOptions: GROUP_OPTIONS, children: nodes.filter((node) => node.groupId === groupId).map(leaf) })),
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
  // The position of a node in a group is relative to the group. The edges are at the top level, so their points are not.
  const leaves = (result.children ?? []).flatMap((child) =>
    child.id.startsWith("group:") ? (child.children ?? []).map((inner) => ({ ...inner, x: (child.x ?? 0) + (inner.x ?? 0), y: (child.y ?? 0) + (inner.y ?? 0) })) : [child],
  );
  for (const child of leaves) {
    if (onlyUnplaced && !unplaced.has(child.id)) continue;
    positions[child.id] = { x: Math.round(child.x ?? 0), y: Math.round((child.y ?? 0) + shiftY) };
  }

  const routes: Record<string, Point[]> = {};
  if (!onlyUnplaced) {
    for (const edge of result.edges ?? []) {
      const section = edge.sections?.[0];
      if (section == null) continue;
      routes[edge.id] = [section.startPoint, ...(section.bendPoints ?? []), section.endPoint].map(({ x, y }) => ({ x: Math.round(x), y: Math.round(y) }));
    }
  }
  return { positions, routes };
};
