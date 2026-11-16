import type { PropertyValue } from "./schemas.ts";

export type {
  ChangeStatus,
  ContentEdge,
  ContentNode,
  DraftState,
  EdgeChange,
  EdgeInput,
  FieldChange,
  Flow,
  FlowInput,
  FlowStep,
  Graph,
  GraphEdge,
  GraphContent,
  GraphDiff,
  GraphInput,
  GraphPatch,
  GraphNode,
  GraphSummary,
  GraphVersion,
  GraphVersionSummary,
  GraphView,
  LayoutDirection,
  LayoutInput,
  NodeChange,
  NodeInput,
  PlacedEdge,
  PlacedNode,
  Position,
  Properties,
  PropertyValue,
  Proposal,
  ProposalInput,
  ProposalSummary,
  Term,
  Vocabulary,
} from "./schemas.ts";

export const NODE_DESIGN_DEFAULTS = { type: null, intent: "", status: null };

export const EDGE_DESIGN_DEFAULTS = { type: null, description: "", intent: "", status: null };

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
