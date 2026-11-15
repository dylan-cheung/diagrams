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
import { useEffect, useMemo, type ReactNode } from "react";
import { assignParallelSlots, edgePath, loopPath, type Box, type ParallelSlot } from "../geometry.ts";
import { NODE_HEIGHT, NODE_WIDTH } from "../layout.ts";
import type { ChangeStatus, GraphContent, Position, Vocabulary } from "../model.ts";
import { termName } from "../vocabulary.ts";
import { useVocabulary } from "./vocabulary.ts";

export type Selection = { kind: "node" | "edge"; id: string } | null;

export type Marks = { nodes: Map<string, ChangeStatus>; edges: Map<string, ChangeStatus> };

type Design = { type: string | null; status: string | null };
type EntityNode = Node<Design & { name: string; labels: string[]; mark: ChangeStatus | undefined }, "entity">;
type FloatingEdge = Edge<Design & { slot: ParallelSlot; flip: boolean; mark: ChangeStatus | undefined }, "floating">;

const markClass = (mark: ChangeStatus | undefined) => (mark == null ? "" : ` mark-${mark}`);

const designClass = ({ type, status }: Design) => `${type == null ? "" : ` type-${type}`}${status == null ? "" : ` status-${status}`}`;

// Every dot is a source handle. In loose connection mode a source handle can also end an edge, so a drag can start or end on any side.
// The node where the drag starts is the source of the edge.
const HANDLES = [
  { id: "top", position: HandlePosition.Top },
  { id: "right", position: HandlePosition.Right },
  { id: "bottom", position: HandlePosition.Bottom },
  { id: "left", position: HandlePosition.Left },
];

const EntityNodeView = ({ data, selected }: NodeProps<EntityNode>) => {
  const vocabulary = useVocabulary();
  const status = termName(vocabulary.statuses, data.status);
  return (
    <div
      className={`entity${selected ? " selected" : ""}${markClass(data.mark)}${designClass(data)}`}
      style={{ width: NODE_WIDTH, minHeight: NODE_HEIGHT }}
    >
      {HANDLES.map(({ id, position }) => (
        <Handle key={id} id={id} type="source" position={position} />
      ))}
      {data.type != null && <div className="entity-kind">{termName(vocabulary.nodeTypes, data.type)}</div>}
      <div className="entity-name">{data.name}</div>
      {(status != null || data.labels.length > 0) && (
        <div className="entity-meta">
          {status != null && <span className="entity-status">{status}</span>}
          {data.labels.length > 0 && <span>{data.labels.join(" · ")}</span>}
        </div>
      )}
    </div>
  );
};

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
      <BaseEdge
        id={id}
        path={geometry.path}
        markerEnd={markerEnd}
        className={`${selected ? "edge-selected" : ""}${markClass(data.mark)}${designClass(data)}`}
      />
      {label != null && label !== "" && (
        <EdgeLabelRenderer>
          <div
            className={`edge-label${selected ? " selected" : ""}${markClass(data.mark)}${designClass(data)}`}
            style={{ transform: `translate(-50%, -50%) translate(${geometry.label.x}px, ${geometry.label.y}px)` }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
};

const PRO_OPTIONS = { hideAttribution: true };

const NODE_TYPES = { entity: EntityNodeView };
const EDGE_TYPES = { floating: FloatingEdgeView };

const toFlowNodes = (view: GraphContent, selection: Selection, marks: Marks | undefined): EntityNode[] =>
  view.nodes.map((node) => ({
    id: node.id,
    type: "entity",
    position: node.position ?? { x: 0, y: 0 },
    data: { name: node.name, type: node.type, status: node.status, labels: node.labels, mark: marks?.nodes.get(node.id) },
    selected: selection?.kind === "node" && selection.id === node.id,
  }));

const toFlowEdges = (view: GraphContent, vocabulary: Vocabulary, selection: Selection, marks: Marks | undefined): FloatingEdge[] => {
  const slots = assignParallelSlots(view.edges);
  return view.edges.map((edge) => ({
    id: edge.id,
    type: "floating",
    source: edge.source,
    target: edge.target,
    sourceHandle: "right",
    targetHandle: "left",
    label: edge.label !== "" ? edge.label : (termName(vocabulary.relationshipTypes, edge.type) ?? ""),
    markerEnd: edge.directed ? { type: MarkerType.ArrowClosed, width: 18, height: 18 } : undefined,
    data: {
      slot: slots.get(edge.id) ?? { index: 0, count: 1 },
      flip: edge.source > edge.target,
      type: edge.type,
      status: edge.status,
      mark: marks?.edges.get(edge.id),
    },
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
  marks,
  readOnly = false,
  children,
}: {
  view: GraphContent;
  selection: Selection;
  onSelect: (selection: Selection) => void;
  onMove?: (positions: Record<string, Position>) => void;
  onConnect?: (source: string, target: string) => void;
  onRemove?: (nodeIds: string[], edgeIds: string[]) => void;
  marks?: Marks;
  readOnly?: boolean;
  children?: ReactNode;
}) => {
  const [nodes, setNodes, onNodesChange] = useNodesState<EntityNode>(toFlowNodes(view, selection, marks));
  useEffect(() => setNodes(toFlowNodes(view, selection, marks)), [view, selection, marks, setNodes]);
  const vocabulary = useVocabulary();
  const edges = useMemo(() => toFlowEdges(view, vocabulary, selection, marks), [view, vocabulary, selection, marks]);

  return (
    <ReactFlow
      className={readOnly ? "read-only" : "editing"}
      proOptions={PRO_OPTIONS}
      nodes={nodes}
      edges={edges}
      nodeTypes={NODE_TYPES}
      edgeTypes={EDGE_TYPES}
      onNodesChange={onNodesChange}
      nodesDraggable={!readOnly}
      nodesConnectable={!readOnly}
      connectionMode={ConnectionMode.Loose}
      connectionRadius={40}
      onConnect={({ source, target }) => {
        if (source != null && target != null) onConnect?.(source, target);
      }}
      onNodeClick={(_, node) => onSelect({ kind: "node", id: node.id })}
      onEdgeClick={(_, edge) => onSelect({ kind: "edge", id: edge.id })}
      onPaneClick={() => onSelect(null)}
      onNodeDragStop={(_, __, dragged) =>
        onMove?.(Object.fromEntries(dragged.map((node) => [node.id, { x: Math.round(node.position.x), y: Math.round(node.position.y) }])))
      }
      onDelete={({ nodes: removedNodes, edges: removedEdges }) =>
        onRemove?.(
          removedNodes.map(({ id }) => id),
          removedEdges.map(({ id }) => id),
        )
      }
      deleteKeyCode={readOnly ? null : ["Backspace", "Delete"]}
      fitView
      fitViewOptions={{ padding: 0.15, maxZoom: 1.1 }}
      minZoom={0.15}
    >
      <Background gap={20} />
      <Controls showInteractive={false} />
      <MiniMap pannable zoomable style={{ width: 140, height: 100 }} />
      {children}
    </ReactFlow>
  );
};
