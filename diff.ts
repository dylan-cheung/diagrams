import type { ContentEdge, ContentNode, EdgeChange, FieldChange, GraphContent, GraphDiff, NodeChange, Properties } from "./model.ts";

export const EMPTY_CONTENT: GraphContent = { graph: { name: "", description: "" }, nodes: [], edges: [] };

export const toContent = ({ graph, nodes, edges }: GraphContent): GraphContent => ({
  graph: { name: graph.name, description: graph.description },
  nodes: nodes.map(({ id, name, description, labels, properties, position }) => ({ id, name, description, labels, properties, position })),
  edges: edges.map(({ id, source, target, directed, label, properties }) => ({ id, source, target, directed, label, properties })),
});

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const compare = <T extends Record<string, unknown>>(before: T, after: T, fields: (keyof T & string)[]): FieldChange[] =>
  fields.filter((field) => !same(before[field], after[field])).map((field) => ({ field, before: before[field], after: after[field] }));

const compareProperties = (before: Properties, after: Properties): FieldChange[] =>
  [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .sort()
    .filter((key) => !same(before[key], after[key]))
    .map((key) => ({ field: `properties.${key}`, before: before[key] ?? null, after: after[key] ?? null }));

const NODE_FIELDS: (keyof ContentNode & string)[] = ["name", "description", "labels"];
const EDGE_FIELDS: (keyof ContentEdge & string)[] = ["source", "target", "directed", "label"];

const pair = <T extends { id: string }, C>(
  before: T[],
  after: T[],
  change: (id: string, before: T | null, after: T | null) => C,
): C[] => {
  const old = new Map(before.map((item) => [item.id, item]));
  const next = new Set(after.map(({ id }) => id));
  return [
    ...after.map((item) => change(item.id, old.get(item.id) ?? null, item)),
    ...before.filter(({ id }) => !next.has(id)).map((item) => change(item.id, item, null)),
  ];
};

const status = (before: unknown, after: unknown, fields: FieldChange[]) =>
  before == null ? "added" : after == null ? "removed" : fields.length > 0 ? "changed" : "unchanged";

export const diffGraphs = (base: GraphContent, next: GraphContent): GraphDiff => ({
  graph: compare(base.graph, next.graph, ["name", "description"]),
  nodes: pair(base.nodes, next.nodes, (id, before, after): NodeChange => {
    const fields = before == null || after == null ? [] : [...compare(before, after, NODE_FIELDS), ...compareProperties(before.properties, after.properties)];
    const moved = before?.position != null && after?.position != null && !same(before.position, after.position);
    return { id, status: status(before, after, fields), before, after, fields, moved };
  }),
  edges: pair(base.edges, next.edges, (id, before, after): EdgeChange => {
    const fields = before == null || after == null ? [] : [...compare(before, after, EDGE_FIELDS), ...compareProperties(before.properties, after.properties)];
    return { id, status: status(before, after, fields), before, after, fields };
  }),
});

export const countChanges = (diff: GraphDiff) => {
  const count = (items: { status: string }[], status: string) => items.filter((item) => item.status === status).length;
  return {
    graph: diff.graph.length,
    nodes: { added: count(diff.nodes, "added"), removed: count(diff.nodes, "removed"), changed: count(diff.nodes, "changed") },
    edges: { added: count(diff.edges, "added"), removed: count(diff.edges, "removed"), changed: count(diff.edges, "changed") },
    moved: diff.nodes.filter(({ status, moved }) => status === "unchanged" && moved).length,
  };
};

export const hasChanges = (diff: GraphDiff) =>
  diff.graph.length > 0 || diff.nodes.some(({ status }) => status !== "unchanged") || diff.edges.some(({ status }) => status !== "unchanged");
