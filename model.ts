import type { PropertyValue } from "./schemas.ts";

export type {
  EdgeInput,
  Graph,
  GraphEdge,
  GraphInput,
  GraphNode,
  GraphSummary,
  GraphVersion,
  GraphVersionSummary,
  GraphView,
  NodeInput,
  PlacedNode,
  Position,
  Properties,
  PropertyValue,
} from "./schemas.ts";

const isPropertyValue = (value: unknown): value is PropertyValue =>
  value === null || ["string", "number", "boolean"].includes(typeof value);

export const normalizeLabels = (labels: string[]) => [
  ...new Set(labels.map((label) => label.trim()).filter((label) => label !== "")),
];

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
