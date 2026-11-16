import dagre from "@dagrejs/dagre";
import { LABEL_HEIGHT, labelSize } from "./geometry.ts";
import type { ContentEdge, ContentNode, LayoutDirection, Position } from "./model.ts";

export const NODE_WIDTH = 180;
export const NODE_HEIGHT = 56;

export const autoLayout = <E extends Pick<ContentEdge, "id" | "source" | "target">>(
  nodes: Pick<ContentNode, "id" | "position">[],
  edges: E[],
  onlyUnplaced: boolean,
  direction: LayoutDirection,
  labelOf: (edge: E) => string = () => "",
) => {
  const g = new dagre.graphlib.Graph({ multigraph: true });
  g.setGraph({ rankdir: direction === "vertical" ? "TB" : "LR", nodesep: 50, ranksep: direction === "vertical" ? 80 : 110, marginx: 20, marginy: 20 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const node of nodes) g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  // One dagre edge for each pair of connected nodes. Its label is the stack of all label texts between the pair, so the
  // layout leaves room for the stack between the two nodes.
  const pairs = new Map<string, { source: string; target: string; width: number; count: number }>();
  for (const edge of edges) {
    if (edge.source === edge.target) continue;
    const key = [edge.source, edge.target].sort().join("|");
    const pair = pairs.get(key) ?? { source: edge.source, target: edge.target, width: 0, count: 0 };
    const text = labelOf(edge);
    if (text !== "") pairs.set(key, { ...pair, width: Math.max(pair.width, labelSize(text).width), count: pair.count + 1 });
    else pairs.set(key, pair);
  }
  for (const [key, { source, target, width, count }] of pairs) {
    g.setEdge(source, target, { width, height: count === 0 ? 0 : count * (LABEL_HEIGHT + 4) + 8, labelpos: "c" }, key);
  }
  dagre.layout(g);
  const placed = nodes.filter(({ position }) => position != null);
  const shiftY = onlyUnplaced && placed.length > 0 ? Math.max(...placed.map(({ position }) => (position as Position).y)) + NODE_HEIGHT + 60 : 0;
  const positions: Record<string, Position> = {};
  for (const node of nodes) {
    if (onlyUnplaced && node.position != null) continue;
    const { x, y } = g.node(node.id);
    positions[node.id] = { x: Math.round(x - NODE_WIDTH / 2), y: Math.round(y - NODE_HEIGHT / 2 + shiftY) };
  }
  return positions;
};
