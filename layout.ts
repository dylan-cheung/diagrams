import dagre from "@dagrejs/dagre";
import type { ContentEdge, ContentNode, Position } from "./model.ts";

export const NODE_WIDTH = 180;
export const NODE_HEIGHT = 56;

export const autoLayout = (nodes: Pick<ContentNode, "id" | "position">[], edges: Pick<ContentEdge, "id" | "source" | "target">[], onlyUnplaced: boolean) => {
  const g = new dagre.graphlib.Graph({ multigraph: true });
  g.setGraph({ rankdir: "LR", nodesep: 50, ranksep: 110, marginx: 20, marginy: 20 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const node of nodes) g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  for (const edge of edges) if (edge.source !== edge.target) g.setEdge(edge.source, edge.target, {}, edge.id);
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
