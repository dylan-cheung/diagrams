import type { Term, Vocabulary } from "./model.ts";

export const DEFAULT_VOCABULARY: Vocabulary = {
  nodeTypes: [
    { id: "service", name: "Service", description: "A deployable unit that runs on its own and serves requests." },
    { id: "module", name: "Module", description: "A part of the code inside a service or an app, such as a package or a library." },
    { id: "database", name: "Database", description: "A store that keeps data, such as a SQL database, a cache or a queue." },
    { id: "external-system", name: "External System", description: "A system that another team or company owns and runs." },
    { id: "user-interface", name: "User Interface", description: "A screen, page or app that people use." },
    { id: "decision", name: "Decision", description: "A point where the flow takes one of two or more paths." },
  ],
  relationshipTypes: [
    { id: "calls", name: "Calls", description: "The source sends a request to the target and waits for the response." },
    { id: "publishes-event", name: "Publishes Event", description: "The source sends an event to the target, which is a topic, queue or bus." },
    { id: "consumes-event", name: "Consumes Event", description: "The source receives events from the target, which is a topic, queue or bus." },
    { id: "reads-from", name: "Reads From", description: "The source reads data from the target." },
    { id: "writes-to", name: "Writes To", description: "The source writes data to the target." },
    { id: "depends-on", name: "Depends On", description: "The source needs the target to work, for example as a library or at build time." },
  ],
  statuses: [
    { id: "proposed", name: "Proposed", description: "Suggested, not yet agreed." },
    { id: "planned", name: "Planned", description: "Agreed, not yet built." },
    { id: "active", name: "Active", description: "Built and in use." },
    { id: "deprecated", name: "Deprecated", description: "In use, but will be removed. Do not add new uses." },
    { id: "retired", name: "Retired", description: "Removed. Kept in the diagram as a record." },
  ],
};

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
