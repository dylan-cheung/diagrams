import {
  Background,
  BaseEdge,
  ConnectionMode,
  Controls,
  EdgeLabelRenderer,
  Handle,
  MarkerType,
  Position as HandlePosition,
  ReactFlow,
  useInternalNode,
  useNodesState,
  useStore,
  useReactFlow,
  ViewportPortal,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { assignParallelSlots, edgePath, LABEL_STOPS, labelSize, loopPath, placeLabels, pointAlong, routePath, snapRoute, type Box, type Label, type ParallelSlot, type Point } from "../geometry.ts";
import { GROUP_PADDING, NODE_HEIGHT, NODE_WIDTH } from "../layout.ts";
import { GROUP_COLORS, type ChangeStatus, type ContentEdge, type GraphContent, type Position, type Vocabulary } from "../model.ts";
import { termName } from "../vocabulary.ts";
import { NODE_TYPE_DRAG, NodePalette } from "./node-palette.tsx";
import { useVocabulary } from "./vocabulary.ts";

export type Selection = { kind: "node" | "edge"; id: string } | null;

export type Marks = { nodes: Map<string, ChangeStatus>; edges: Map<string, ChangeStatus> };

// The path of a flow on the canvas: the step numbers of each node on it, and the edges it follows. For a run, the
// path also has the node of the current step and the nodes and edges that the run did not reach yet.
// A named color is a token in styles.css with a light and a dark shade. A group without a color takes the named colors
// in order.
const colorOf = (group: CanvasGroup, index: number) =>
  group.color?.startsWith("#") === true ? group.color : `var(--group-${group.color ?? GROUP_COLORS[index % GROUP_COLORS.length]})`;

// A group as the canvas draws it: a box around its nodes, with its name at the top.
export type CanvasGroup = { id: string; name: string; description: string; color: string | null; nodeIds: string[] };

// The box of each group around the live positions of its nodes, so a box follows a node while it is dragged.
const groupFrames = (groups: CanvasGroup[], nodes: EntityNode[]) =>
  groups.flatMap((group) => {
    const boxes = nodes.filter(({ id }) => group.nodeIds.includes(id)).map(boxOf);
    if (boxes.length === 0) return [];
    const left = Math.min(...boxes.map(({ x }) => x)) - GROUP_PADDING.side;
    const top = Math.min(...boxes.map(({ y }) => y)) - GROUP_PADDING.top;
    const right = Math.max(...boxes.map(({ x, width }) => x + width)) + GROUP_PADDING.side;
    const bottom = Math.max(...boxes.map(({ y, height }) => y + height)) + GROUP_PADDING.bottom;
    return [{ ...group, x: left, y: top, width: right - left, height: bottom - top }];
  });

export type FlowPath = { steps: Map<string, number[]>; edges: Set<string>; current?: string; pending?: Set<string> };

type Design = { type: string | null; status: string | null };
type StepState = "current" | "pending" | undefined;
type EntityNode = Node<
  Design & { name: string; labels: string[]; mark: ChangeStatus | undefined; steps: number[] | undefined; onPath: boolean | undefined; stepState: StepState },
  "entity"
>;
type EdgeFocus = "hovered" | "dimmed" | undefined;
type FloatingEdge = Edge<
  Design & {
    slot: ParallelSlot;
    flip: boolean;
    mark: ChangeStatus | undefined;
    labelAt: Point | undefined;
    route: Point[] | undefined;
    focus: EdgeFocus;
    onPath: boolean | undefined;
    pending: boolean;
    onHover: (hovered: boolean) => void;
    onSelect: () => void;
  },
  "floating"
>;

const focusClass = (focus: EdgeFocus) => (focus == null ? "" : ` edge-${focus}`);

const pathClass = (onPath: boolean | undefined) => (onPath == null ? "" : onPath ? " on-path" : " off-path");

const stepClass = (state: StepState | boolean) => (state === "current" ? " step-current" : state === "pending" || state === true ? " step-pending" : "");

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
      className={`entity${selected ? " selected" : ""}${markClass(data.mark)}${designClass(data)}${pathClass(data.onPath)}${stepClass(data.stepState)}`}
      style={{ width: NODE_WIDTH, minHeight: NODE_HEIGHT }}
    >
      {data.steps != null && data.steps.length > 0 && <div className="step-badge">{data.steps.join(", ")}</div>}
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
  const routed = data.route == null ? null : snapRoute(data.route, sourceBox, targetBox);
  const geometry =
    routed != null
      ? { path: routePath(routed), label: pointAlong(routed, 0.5) }
      : source === target
        ? loopPath(sourceBox, data.slot)
        : edgePath(sourceBox, targetBox, data.slot, data.flip);
  return (
    <>
      <BaseEdge
        id={id}
        path={geometry.path}
        markerEnd={markerEnd}
        className={`${selected ? "edge-selected" : ""}${markClass(data.mark)}${designClass(data)}${focusClass(data.focus)}${pathClass(data.onPath)}${stepClass(data.pending)}`}
      />
      {label != null && label !== "" && (
        <EdgeLabelRenderer>
          <div
            className={`edge-label${selected ? " selected" : ""}${markClass(data.mark)}${designClass(data)}${focusClass(data.focus)}${pathClass(data.onPath)}${stepClass(data.pending)}`}
            onMouseEnter={() => data.onHover(true)}
            onMouseLeave={() => data.onHover(false)}
            onClick={data.onSelect}
            style={{ transform: `translate(-50%, -50%) translate(${(data.labelAt ?? geometry.label).x}px, ${(data.labelAt ?? geometry.label).y}px)` }}
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

// With a focus, the canvas shows the nodes in it and dims the rest, as it does for the path of a flow.
const toFlowNodes = (view: GraphContent, selection: Selection, marks: Marks | undefined, path: FlowPath | undefined, focus: Set<string> | undefined): EntityNode[] =>
  view.nodes.map((node) => ({
    id: node.id,
    type: "entity",
    position: node.position ?? { x: 0, y: 0 },
    data: {
      name: node.name,
      type: node.type,
      status: node.status,
      labels: node.labels,
      mark: marks?.nodes.get(node.id),
      steps: path == null ? undefined : (path.steps.get(node.id) ?? []),
      onPath: path != null ? path.steps.has(node.id) : focus?.has(node.id),
      stepState: path?.current === node.id ? "current" : path?.pending?.has(node.id) === true ? "pending" : undefined,
    },
    selected: selection?.kind === "node" && selection.id === node.id,
  }));

export const edgeText = (edge: Pick<ContentEdge, "label" | "type">, vocabulary: Vocabulary) =>
  edge.label !== "" ? edge.label : (termName(vocabulary.relationshipTypes, edge.type ?? null) ?? "");

const boxOf = (node: EntityNode): Box => ({
  x: node.position.x,
  y: node.position.y,
  width: node.measured?.width ?? NODE_WIDTH,
  height: node.measured?.height ?? NODE_HEIGHT,
});

// Places on a route where its label can go: points along the route, then beside its middle, for a short route such as
// a loop that has no free place on it.
const routeLabelCandidates = (route: Point[], width: number) => {
  const middle = pointAlong(route, 0.5);
  const aside = width / 2 + 10;
  return [...LABEL_STOPS.map((t) => pointAlong(route, t)), { x: middle.x - aside, y: middle.y }, { x: middle.x + aside, y: middle.y }];
};

// The saved routes that still fit: a route is dropped as soon as one of its nodes is not at its saved position, for
// example while it is dragged.
const fittingRoutes = (view: GraphContent, nodes: EntityNode[], routes: Map<string, Point[]> | undefined) => {
  const fitting = new Map<string, Point[]>();
  if (routes == null) return fitting;
  const live = new Map(nodes.map((node) => [node.id, node.position]));
  const unmoved = new Set(
    view.nodes.flatMap(({ id, position }) => {
      const now = live.get(id);
      return position != null && now != null && now.x === position.x && now.y === position.y ? [id] : [];
    }),
  );
  for (const edge of view.edges) {
    const route = routes.get(edge.id);
    if (route != null && unmoved.has(edge.source) && unmoved.has(edge.target)) fitting.set(edge.id, route);
  }
  return fitting;
};

// Places the labels with the current node positions, so that no label covers a node or another label.
const labelPlaces = (
  view: GraphContent,
  nodes: EntityNode[],
  vocabulary: Vocabulary,
  slots: Map<string, ParallelSlot>,
  routes: Map<string, Point[]>,
) => {
  const boxes = new Map(nodes.map((node) => [node.id, boxOf(node)]));
  const labels: Label[] = [];
  for (const edge of view.edges) {
    const text = edgeText(edge, vocabulary);
    const source = boxes.get(edge.source);
    const target = boxes.get(edge.target);
    if (text === "" || source == null || target == null) continue;
    const slot = slots.get(edge.id) ?? { index: 0, count: 1 };
    const route = routes.get(edge.id);
    const candidates =
      route != null
        ? routeLabelCandidates(snapRoute(route, source, target), labelSize(text).width)
        : edge.source === edge.target
          ? [loopPath(source, slot).label]
          : LABEL_STOPS.map(edgePath(source, target, slot, edge.source > edge.target).at);
    labels.push({ id: edge.id, candidates, ...labelSize(text) });
  }
  return placeLabels(labels, [...boxes.values()]);
};

const toFlowEdges = (
  view: GraphContent,
  nodes: EntityNode[],
  vocabulary: Vocabulary,
  selection: Selection,
  marks: Marks | undefined,
  hovered: string | null,
  setHovered: (update: (current: string | null) => string | null) => void,
  onSelect: (selection: Selection) => void,
  savedRoutes: Map<string, Point[]> | undefined,
  path: FlowPath | undefined,
  focus: Set<string> | undefined,
): FloatingEdge[] => {
  const slots = assignParallelSlots(view.edges);
  const routes = fittingRoutes(view, nodes, savedRoutes);
  const places = labelPlaces(view, nodes, vocabulary, slots, routes);
  return view.edges.map((edge) => ({
    id: edge.id,
    type: "floating",
    source: edge.source,
    target: edge.target,
    sourceHandle: "right",
    targetHandle: "left",
    label: edgeText(edge, vocabulary),
    markerEnd: edge.directed ? { type: MarkerType.ArrowClosed, width: 18, height: 18 } : undefined,
    data: {
      slot: slots.get(edge.id) ?? { index: 0, count: 1 },
      flip: edge.source > edge.target,
      type: edge.type,
      status: edge.status,
      mark: marks?.edges.get(edge.id),
      labelAt: places.get(edge.id),
      route: routes.get(edge.id),
      focus: hovered == null ? undefined : hovered === edge.id ? "hovered" : "dimmed",
      onPath: path != null ? path.edges.has(edge.id) : focus == null ? undefined : focus.has(edge.source) && focus.has(edge.target),
      pending: path?.pending?.has(edge.id) === true,
      onHover: (on: boolean) => setHovered((current) => (on ? edge.id : current === edge.id ? null : current)),
      onSelect: () => onSelect({ kind: "edge", id: edge.id }),
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
  routes,
  path,
  focus,
  onAddNode,
  paletteFooter,
  readOnly = false,
  groups = [],
  selectedGroup = null,
  onSelectGroup,
  children,
}: {
  view: GraphContent;
  selection: Selection;
  onSelect: (selection: Selection) => void;
  onMove?: (positions: Record<string, Position>) => void;
  onConnect?: (source: string, target: string) => void;
  onRemove?: (nodeIds: string[], edgeIds: string[]) => void;
  marks?: Marks;
  routes?: Map<string, Point[]>;
  path?: FlowPath;
  focus?: Set<string>;
  onAddNode?: (type: string | null, position: Position) => void;
  paletteFooter?: ReactNode;
  readOnly?: boolean;
  groups?: CanvasGroup[];
  selectedGroup?: string | null;
  onSelectGroup?: (groupId: string) => void;
  children?: ReactNode;
}) => {
  const [nodes, setNodes, onNodesChange] = useNodesState<EntityNode>(toFlowNodes(view, selection, marks, path, focus));
  useEffect(() => setNodes(toFlowNodes(view, selection, marks, path, focus)), [view, selection, marks, path, focus, setNodes]);
  const vocabulary = useVocabulary();
  const [hovered, setHovered] = useState<string | null>(null);
  const { screenToFlowPosition } = useReactFlow();
  const frames = useMemo(() => groupFrames(groups, nodes), [groups, nodes]);
  // Below 100%, the name and the border of a group keep their size on the screen, so a zoomed-out graph still shows them.
  const grow = useStore((state) => Math.max(1, 1 / state.transform[2]));
  const canAdd = onAddNode != null && !readOnly;
  const edges = useMemo(
    () => toFlowEdges(view, nodes, vocabulary, selection, marks, hovered, setHovered, onSelect, routes, path, focus),
    [view, nodes, vocabulary, selection, marks, hovered, onSelect, routes, path, focus],
  );

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
      elementsSelectable={path == null}
      onDragOver={(event) => {
        if (!canAdd || !event.dataTransfer.types.includes(NODE_TYPE_DRAG)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDrop={(event) => {
        if (!canAdd || !event.dataTransfer.types.includes(NODE_TYPE_DRAG)) return;
        event.preventDefault();
        const type = event.dataTransfer.getData(NODE_TYPE_DRAG);
        const at = screenToFlowPosition({ x: event.clientX, y: event.clientY });
        onAddNode(type === "" ? null : type, { x: Math.round(at.x - NODE_WIDTH / 2), y: Math.round(at.y - NODE_HEIGHT / 2) });
      }}
      connectionMode={ConnectionMode.Loose}
      connectionRadius={40}
      onConnect={({ source, target }) => {
        if (source != null && target != null) onConnect?.(source, target);
      }}
      onNodeClick={(_, node) => onSelect({ kind: "node", id: node.id })}
      onEdgeClick={(_, edge) => onSelect({ kind: "edge", id: edge.id })}
      onEdgeMouseEnter={(_, edge) => setHovered(edge.id)}
      onEdgeMouseLeave={(_, edge) => setHovered((current) => (current === edge.id ? null : current))}
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
      // On a trackpad, a pinch zooms and a two-finger swipe moves the view. A mouse wheel moves the view too, and
      // Ctrl or ⌘ with the wheel zooms.
      zoomOnPinch
      panOnScroll
      zoomOnScroll={false}
    >
      <Background gap={20} />
      <Controls showInteractive={false} />
      {canAdd && <NodePalette onAdd={onAddNode} footer={paletteFooter} />}
      <ViewportPortal>
        {frames.map((frame) => (
          <div
            key={frame.id}
            className={`group-frame${frame.id === selectedGroup ? " selected" : ""}`}
            style={
              {
                transform: `translate(${frame.x}px, ${frame.y}px)`,
                width: frame.width,
                height: frame.height,
                "--group-color": colorOf(frame, groups.findIndex(({ id }) => id === frame.id)),
                "--grow": grow,
              } as CSSProperties
            }
          >
            <button type="button" className="group-label" onClick={() => onSelectGroup?.(frame.id)} title={frame.description === "" ? frame.name : frame.description}>
              {frame.name}
            </button>
          </div>
        ))}
      </ViewportPortal>
      {children}
    </ReactFlow>
  );
};
