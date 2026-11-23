import type { Library, Term, Vocabulary } from "./model.ts";

// The lifecycle statuses are the same for every graph. The node and relationship types come from the libraries.
export const STATUSES: Term[] = [
  { id: "proposed", name: "Proposed", description: "Suggested, not yet agreed." },
  { id: "planned", name: "Planned", description: "Agreed, not yet built." },
  { id: "active", name: "Active", description: "Built and in use." },
  { id: "deprecated", name: "Deprecated", description: "In use, but will be removed. Do not add new uses." },
  { id: "retired", name: "Retired", description: "Removed. Kept in the diagram as a record." },
];

// The vocabulary of a set of libraries: their node and relationship types, and the statuses.
export const vocabularyOf = (libraries: Pick<Library, "nodeTypes" | "relationshipTypes">[]): Vocabulary => ({
  nodeTypes: libraries.flatMap(({ nodeTypes }) => nodeTypes),
  relationshipTypes: libraries.flatMap(({ relationshipTypes }) => relationshipTypes),
  statuses: STATUSES,
});

type Design = { type?: string | null; status?: string | null };

const termError = (kind: string, terms: Term[], value: string | null | undefined) =>
  value == null || terms.some(({ id }) => id === value)
    ? []
    : [`The ${kind} ${value} is not in the vocabulary. Use one of: ${terms.map(({ id }) => id).join(", ")}.`];

export const nodeDesignErrors = (vocabulary: Vocabulary, { type, status }: Design) => [
  ...termError("node type", vocabulary.nodeTypes, type),
  ...termError("status", vocabulary.statuses, status),
];

export const edgeDesignErrors = (vocabulary: Vocabulary, { type, status }: Design) => [
  ...termError("relationship type", vocabulary.relationshipTypes, type),
  ...termError("status", vocabulary.statuses, status),
];

export const termName = (terms: Term[], id: string | null) => (id == null ? null : (terms.find((term) => term.id === id)?.name ?? id));
