export type PropertyValue = string | number | boolean | null;

export type Properties = Record<string, PropertyValue>;

export type GraphNode = {
  id: string;
  name: string;
  labels: string[];
  properties: Properties;
  createdAt: string;
  updatedAt: string;
};

export type GraphEdge = {
  id: string;
  source: string;
  target: string;
  directed: boolean;
  label: string;
  properties: Properties;
  createdAt: string;
  updatedAt: string;
};

export type Graph = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type Position = { x: number; y: number };

export type PlacedNode = GraphNode & { position: Position | null };

export type GraphSummary = Graph & { nodeCount: number; edgeCount: number };

export type GraphView = { graph: Graph; nodes: PlacedNode[]; edges: GraphEdge[] };

export type NodeInput = { name: string; labels?: string[]; properties?: Properties };

export type EdgeInput = {
  source: string;
  target: string;
  directed?: boolean;
  label?: string;
  properties?: Properties;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value != null && !Array.isArray(value);

const isPropertyValue = (value: unknown): value is PropertyValue =>
  value === null || ["string", "number", "boolean"].includes(typeof value);

export const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim() !== "";

export const normalizeLabels = (labels: string[]) => [
  ...new Set(labels.map((label) => label.trim()).filter((label) => label !== "")),
];

export const validateProperties = (properties: unknown) => {
  if (properties === undefined) return [];
  if (!isPlainObject(properties)) return ["Properties must be an object."];
  return Object.entries(properties).flatMap(([key, value]) => [
    ...(key.trim() === "" ? ["A property needs a key."] : []),
    ...(isPropertyValue(value) ? [] : [`Property ${key} must be a string, number, boolean or null.`]),
  ]);
};

export const validateNodeInput = (input: Partial<NodeInput>, partial = false) => {
  const errors: string[] = [];
  if (!(partial && input.name === undefined) && !isNonEmptyString(input.name)) errors.push("A node needs a name.");
  if (input.labels !== undefined && (!Array.isArray(input.labels) || !input.labels.every((label) => typeof label === "string"))) {
    errors.push("Labels must be a list of strings.");
  }
  return [...errors, ...validateProperties(input.properties)];
};

export const validateEdgeInput = (input: Partial<EdgeInput>, partial = false) => {
  const errors: string[] = [];
  if (!partial && !isNonEmptyString(input.source)) errors.push("An edge needs a source node.");
  if (!partial && !isNonEmptyString(input.target)) errors.push("An edge needs a target node.");
  if (input.directed !== undefined && typeof input.directed !== "boolean") errors.push("Directed must be true or false.");
  if (input.label !== undefined && typeof input.label !== "string") errors.push("An edge label must be a string.");
  return [...errors, ...validateProperties(input.properties)];
};

export const parsePropertyValue = (text: string): PropertyValue => {
  const trimmed = text.trim();
  if (trimmed === "") return "";
  try {
    const value: unknown = JSON.parse(trimmed);
    return isPropertyValue(value) ? value : text;
  } catch {
    return text;
  }
};

export const formatPropertyValue = (value: PropertyValue) =>
  typeof value === "string" ? value : JSON.stringify(value);
