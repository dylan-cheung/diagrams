export const ROUTE_KEY_PATTERN = /^[a-z0-9_]+$/;

export type GraphRoute = {
  key: string;
  label: string;
  description?: string;
  target: string | null;
  stop: boolean;
};

export type GraphNode = {
  id: string;
  type: string;
  label: string;
  next: string | null;
  routes: GraphRoute[];
};

export type Graph = {
  _id: string;
  name: string;
  type: string;
  nodes: GraphNode[];
  createdAt: string;
  updatedAt: string;
};

export type GraphInput = Pick<Graph, "name" | "type" | "nodes">;

export type NodePosition = { depth: number; row: number };

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim() !== "";

export const createNode = (type = "step", label = "New step"): GraphNode => ({
  id: crypto.randomUUID(),
  type,
  label,
  next: null,
  routes: [],
});

export const createEmptyNodes = (): GraphNode[] => [createNode("start", "Start")];

export const childIds = (node: GraphNode) =>
  [node.next, ...node.routes.map(({ target }) => target)].filter(
    (id): id is string => id != null,
  );

export const normalizeNode = (raw: Partial<GraphNode>): GraphNode => ({
  id: raw.id ?? crypto.randomUUID(),
  type: raw.type ?? "",
  label: raw.label ?? "",
  next: raw.next ?? null,
  routes: (raw.routes ?? []).map((route) => ({
    key: route.key ?? "",
    label: route.label ?? "",
    ...(isNonEmptyString(route.description) ? { description: route.description } : {}),
    target: route.target ?? null,
    stop: route.stop ?? false,
  })),
});

export const findCycleNodeId = (nodes: GraphNode[]) => {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (nodeId: string): string | null => {
    if (visiting.has(nodeId)) return nodeId;
    if (visited.has(nodeId)) return null;
    visiting.add(nodeId);
    const node = nodesById.get(nodeId);
    for (const childId of node == null ? [] : childIds(node)) {
      const cycleNodeId = visit(childId);
      if (cycleNodeId != null) return cycleNodeId;
    }
    visiting.delete(nodeId);
    visited.add(nodeId);
    return null;
  };
  for (const nodeId of nodesById.keys()) {
    const cycleNodeId = visit(nodeId);
    if (cycleNodeId != null) return cycleNodeId;
  }
  return null;
};

export const validateGraph = (input: Partial<GraphInput>) => {
  const errors: string[] = [];
  if (!isNonEmptyString(input.name)) errors.push("The graph needs a name.");
  if (!isNonEmptyString(input.type)) errors.push("The graph needs a type.");
  if (!Array.isArray(input.nodes)) {
    errors.push("The graph needs a nodes array.");
    return errors;
  }
  const ids = new Set<string>();
  for (const node of input.nodes) {
    if (!isNonEmptyString(node.id)) errors.push("Every node needs an id.");
    else if (ids.has(node.id)) errors.push(`Node id ${node.id} is used more than once.`);
    else ids.add(node.id);
  }
  for (const node of input.nodes) {
    const name = isNonEmptyString(node.label) ? `"${node.label}"` : node.id;
    if (!isNonEmptyString(node.label)) errors.push(`Node ${node.id} needs a label.`);
    if (!isNonEmptyString(node.type)) errors.push(`Node ${name} needs a type.`);
    if (node.next != null && !ids.has(node.next)) errors.push(`Node ${name} points to a missing node.`);
    const keys = new Set<string>();
    for (const route of node.routes ?? []) {
      if (!ROUTE_KEY_PATTERN.test(route.key ?? "")) {
        errors.push(`A route on ${name} needs a key of lowercase letters, digits and underscores.`);
      } else if (keys.has(route.key)) {
        errors.push(`Route key ${route.key} is used more than once on ${name}.`);
      } else keys.add(route.key);
      if (!isNonEmptyString(route.label)) errors.push(`Route ${route.key} on ${name} needs a label.`);
      if (route.target != null && !ids.has(route.target)) {
        errors.push(`Route ${route.key} on ${name} points to a missing node.`);
      }
      if (route.stop && route.target != null) {
        errors.push(`Route ${route.key} on ${name} cannot stop and have a target.`);
      }
    }
  }
  if (errors.length === 0) {
    const cycleNodeId = findCycleNodeId(input.nodes);
    if (cycleNodeId != null) {
      const label = input.nodes.find(({ id }) => id === cycleNodeId)?.label ?? cycleNodeId;
      errors.push(`The graph has a cycle through "${label}".`);
    }
  }
  return errors;
};

export const findRootIds = (nodes: GraphNode[]) => {
  const targets = new Set(nodes.flatMap(childIds));
  return nodes.filter(({ id }) => !targets.has(id)).map(({ id }) => id);
};

export const layoutGraph = (nodes: GraphNode[]) => {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const depths = new Map<string, number>();
  const place = (nodeId: string, depth: number, path: Set<string>) => {
    if (path.has(nodeId) || (depths.get(nodeId) ?? -1) >= depth) return;
    depths.set(nodeId, depth);
    const node = nodesById.get(nodeId);
    if (node == null) return;
    const nextPath = new Set(path).add(nodeId);
    for (const childId of childIds(node)) place(childId, depth + 1, nextPath);
  };
  for (const rootId of findRootIds(nodes)) place(rootId, 0, new Set());
  for (const node of nodes) if (!depths.has(node.id)) place(node.id, 0, new Set());
  const rowsByDepth = new Map<number, number>();
  const positions = new Map<string, NodePosition>();
  for (const node of nodes) {
    const depth = depths.get(node.id) ?? 0;
    const row = rowsByDepth.get(depth) ?? 0;
    rowsByDepth.set(depth, row + 1);
    positions.set(node.id, { depth, row });
  }
  return positions;
};

export const removeNode = (nodes: GraphNode[], nodeId: string): GraphNode[] =>
  nodes
    .filter(({ id }) => id !== nodeId)
    .map((node) => ({
      ...node,
      next: node.next === nodeId ? null : node.next,
      routes: node.routes.map((route) =>
        route.target === nodeId ? { ...route, target: null } : route,
      ),
    }));
