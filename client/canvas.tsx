import {
  Background,
  BaseEdge,
  ConnectionMode,
  Controls,
  EdgeLabelRenderer,
  Handle,
  MarkerType,
  MiniMap,
  Position as HandlePosition,
  ReactFlow,
  useInternalNode,
  useNodesState,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { useEffect, useMemo } from "react";
import { assignParallelSlots, edgePath, loopPath, type Box, type ParallelSlot } from "../geometry.ts";
import { NODE_HEIGHT, NODE_WIDTH } from "../layout.ts";
import type { GraphView, Position } from "../model.ts";

export type Selection = { kind: "node" | "edge"; id: string } | null;

type EntityNode = Node<{ name: string; labels: string[] }, "entity">;
type FloatingEdge = Edge<{ slot: ParallelSlot; flip: boolean }, "floating">;

const EntityNodeView = ({ data, selected }: NodeProps<EntityNode>) => (
  <div className={`entity${selected ? " selected" : ""}`} style={{ width: NODE_WIDTH, minHeight: NODE_HEIGHT }}>
    <Handle id="in" type="target" position={HandlePosition.Left} className="target-handle" />
    <div className="entity-name">{data.name}</div>
    {data.labels.length > 0 && (
      <div className="entity-labels">
        {data.labels.map((label) => (
          <span key={label} className="chip">
            {label}
          </span>
        ))}
      </div>
    )}
    <Handle id="out" type="source" position={HandlePosition.Right} className="source-handle" />
  </div>
);

const useBox = (id: string): Box | null => {
  const node = useInternalNode(id);
  if (node == null) return null;
  return {
    x: node.internals.positionAbsolute.x,
    y: node.internals.positionAbsolute.y,
    width: node.measured.width ?? NODE_WIDTH,
    height: node.measured.height ?? NODE_HEIGHT,
  };
};

const FloatingEdgeView = ({ id, source, target, data, label, markerEnd, selected }: EdgeProps<FloatingEdge>) => {
  const sourceBox = useBox(source);
  const targetBox = useBox(target);
  if (sourceBox == null || targetBox == null || data == null) return null;
  const geometry = source === target ? loopPath(sourceBox, data.slot) : edgePath(sourceBox, targetBox, data.slot, data.flip);
  return (
    <>
      <BaseEdge id={id} path={geometry.path} markerEnd={markerEnd} className={selected ? "edge-selected" : undefined} />
      {label != null && label !== "" && (
        <EdgeLabelRenderer>
          <div
            className={`edge-label${selected ? " selected" : ""}`}
            style={{ transform: `translate(-50%, -50%) translate(${geometry.label.x}px, ${geometry.label.y}px)` }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
};

const NODE_TYPES = { entity: EntityNodeView };
const EDGE_TYPES = { floating: FloatingEdgeView };

const toFlowNodes = (view: GraphView, selection: Selection): EntityNode[] =>
  view.nodes.map((node) => ({
    id: node.id,
    type: "entity",
    position: node.position ?? { x: 0, y: 0 },
    data: { name: node.name, labels: node.labels },
    selected: selection?.kind === "node" && selection.id === node.id,
  }));

const toFlowEdges = (view: GraphView, selection: Selection): FloatingEdge[] => {
  const slots = assignParallelSlots(view.edges);
  return view.edges.map((edge) => ({
    id: edge.id,
    type: "floating",
    source: edge.source,
    target: edge.target,
    sourceHandle: "out",
    targetHandle: "in",
    label: edge.label,
    markerEnd: edge.directed ? { type: MarkerType.ArrowClosed, width: 18, height: 18 } : undefined,
    data: { slot: slots.get(edge.id) ?? { index: 0, count: 1 }, flip: edge.source > edge.target },
    selected: selection?.kind === "edge" && selection.id === edge.id,
  }));
};

export const GraphCanvas = ({
  view,
  selection,
  onSelect,
  onMove,
  onConnect,
  onRemove,
}: {
  view: GraphView;
  selection: Selection;
  onSelect: (selection: Selection) => void;
  onMove: (positions: Record<string, Position>) => void;
  onConnect: (source: string, target: string) => void;
  onRemove: (nodeIds: string[], edgeIds: string[]) => void;
}) => {
  const [nodes, setNodes, onNodesChange] = useNodesState<EntityNode>(toFlowNodes(view, selection));
  useEffect(() => setNodes(toFlowNodes(view, selection)), [view, selection, setNodes]);
  const edges = useMemo(() => toFlowEdges(view, selection), [view, selection]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={NODE_TYPES}
      edgeTypes={EDGE_TYPES}
      onNodesChange={onNodesChange}
      connectionMode={ConnectionMode.Loose}
      connectionRadius={40}
      onConnect={({ source, target }) => {
        if (source != null && target != null) onConnect(source, target);
      }}
      onNodeClick={(_, node) => onSelect({ kind: "node", id: node.id })}
      onEdgeClick={(_, edge) => onSelect({ kind: "edge", id: edge.id })}
      onPaneClick={() => onSelect(null)}
      onNodeDragStop={(_, __, dragged) =>
        onMove(Object.fromEntries(dragged.map((node) => [node.id, { x: Math.round(node.position.x), y: Math.round(node.position.y) }])))
      }
      onDelete={({ nodes: removedNodes, edges: removedEdges }) =>
        onRemove(
          removedNodes.map(({ id }) => id),
          removedEdges.map(({ id }) => id),
        )
      }
      deleteKeyCode={["Backspace", "Delete"]}
      fitView
      fitViewOptions={{ padding: 0.25, maxZoom: 1.2 }}
      minZoom={0.2}
    >
      <Background gap={20} />
      <Controls showInteractive={false} />
      <MiniMap pannable zoomable />
    </ReactFlow>
  );
};
