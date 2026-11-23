import type { PropertyValue } from "./schemas.ts";

export type {
  Change,
  ChangeDiff,
  ChangeInput,
  ChangeLink,
  ChangeStatus,
  DiffHunk,
  Feedback,
  FeedbackInput,
  IdeaItem,
  PseudoBlock,
  PseudoLayer,
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
  Group,
  GroupInput,
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
  FinishInput,
  Run,
  RunEvent,
  RunInput,
  Term,
  NodeTypeTerm,
  Library,
  LibraryInput,
  LibraryPatch,
  Vocabulary,
} from "./schemas.ts";

// The named colors of groups. Each one has a light and a dark shade in client/styles.css (--group-<name>). A group can
// also have a hex color, or no color: then it takes the named colors in order.
export const GROUP_COLORS = ["blue", "green", "purple", "orange", "cyan", "pink"] as const;

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
