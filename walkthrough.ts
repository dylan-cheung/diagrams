import type { GraphStore } from "./db.ts";
import type { EdgeInput, NodeInput, Position } from "./model.ts";
import LAYOUT from "./walkthrough-layout.json";

// The walkthrough graph: a realistic example that uses every default node type, relationship type and status, and
// shows parallel edges, a loop, a cycle and an undirected edge. The server makes it at start when it does not exist,
// so a new database has it, and it comes back after a delete. The Guide page links to it.
export const WALKTHROUGH_ID = "walkthrough";

const GRAPH = {
  name: "Walkthrough: Insurance claim intake and payout",
  description:
    "An example to learn Diagram with. It shows how a claim moves from the customer app to a payout or an adjuster review, today and with a planned fraud check. It uses every node type, relationship type and status. Select a node or an edge to see its description and intent.",
};

type SeedNode = NodeInput & { key: string };

const NODES: SeedNode[] = [
  {
    key: "app",
    name: "Customer mobile app",
    type: "user-interface",
    status: "active",
    description: "iOS and Android app where a customer reports a claim with photos.",
    intent: "Let customers start a claim without a phone call.",
    labels: ["customer"],
    properties: { platforms: "ios, android" },
  },
  {
    key: "dash",
    name: "Adjuster dashboard",
    type: "user-interface",
    status: "active",
    description: "Web page where adjusters review and approve claims.",
    intent: "Give adjusters one queue for every claim that needs a person.",
    labels: ["staff"],
  },
  {
    key: "api",
    name: "Claims API",
    type: "service",
    status: "active",
    description: "Receives new claims, validates them and routes them.",
    intent: "Keep one entry point for all claim changes.",
    labels: ["core"],
    properties: { owner: "claims team", sla_ms: 300 },
  },
  {
    key: "validator",
    name: "Claim validator",
    type: "module",
    status: "active",
    description: "Library in the Claims API that checks required fields and policy dates.",
    intent: "Stop bad claims before they reach a person.",
    labels: ["core"],
  },
  {
    key: "pay",
    name: "Payments service",
    type: "service",
    status: "active",
    description: "Sends payouts and tracks their state.",
    intent: "Keep payout state in one place.",
    labels: ["money"],
  },
  {
    key: "notify",
    name: "Notification service",
    type: "service",
    status: "active",
    description: "Sends texts to customers when a claim changes.",
    intent: "Tell customers about progress without an adjuster.",
    labels: ["comms"],
  },
  {
    key: "fraud",
    name: "Fraud scoring service",
    type: "service",
    status: "planned",
    description: "Gives each claim a fraud score from 0 to 100.",
    intent: "Catch likely fraud before money leaves.",
    labels: ["risk"],
  },
  {
    key: "db",
    name: "Claims database",
    type: "database",
    status: "active",
    description: "Postgres tables for claims, photos and notes.",
    intent: "Keep the record of each claim.",
    properties: { engine: "postgres" },
  },
  {
    key: "queue",
    name: "Claim events queue",
    type: "database",
    status: "active",
    description: "Topic that carries claim.submitted and claim.paid events.",
    intent: "Let services react to claims without direct calls.",
    properties: { engine: "kafka" },
  },
  {
    key: "archive",
    name: "Legacy claims archive",
    type: "database",
    status: "deprecated",
    description: "Old warehouse that gets a nightly copy of claims.",
    intent: "Keep reports running until the new warehouse is ready.",
  },
  {
    key: "card",
    name: "Card processor",
    type: "external-system",
    status: "active",
    description: "Third-party company that sends money to cards and bank accounts.",
    intent: "Pay customers without holding card data.",
    labels: ["vendor"],
  },
  {
    key: "sms",
    name: "SMS provider",
    type: "external-system",
    status: "active",
    description: "Third-party text message gateway.",
    intent: "Reach customers on any phone.",
    labels: ["vendor"],
  },
  {
    key: "fax",
    name: "Fax gateway",
    type: "external-system",
    status: "retired",
    description: "Old fax intake for claims from body shops.",
    intent: "Accept claims from partners without an app (no longer needed).",
    labels: ["vendor"],
  },
  {
    key: "small",
    name: "Claim under $5,000?",
    type: "decision",
    status: "active",
    description: "Compares the claim amount with the auto-pay limit.",
    intent: "Pay small claims at once, to make them faster.",
    properties: { limit_usd: 5000 },
  },
  {
    key: "risky",
    name: "Fraud score above 70?",
    type: "decision",
    status: "proposed",
    description: "Compares the fraud score with the review limit.",
    intent: "Send only risky claims to a person.",
    properties: { threshold: 70 },
  },
];

type SeedEdge = Omit<EdgeInput, "source" | "target"> & { from: string; to: string };

const EDGES: SeedEdge[] = [
  { from: "app", to: "api", type: "calls", label: "Submit claim", intent: "Start every claim in the Claims API.", status: "active" },
  { from: "api", to: "validator", type: "depends-on", status: "active", description: "Built into the Claims API." },
  { from: "api", to: "db", type: "writes-to", label: "Save claim", status: "active" },
  { from: "api", to: "queue", type: "publishes-event", label: "claim.submitted", status: "active" },
  { from: "notify", to: "queue", type: "consumes-event", label: "claim.submitted, claim.paid", status: "active" },
  { from: "notify", to: "sms", type: "calls", label: "Send text", status: "active" },
  { from: "dash", to: "db", type: "reads-from", label: "Open claims", status: "active" },
  { from: "api", to: "small", label: "Route claim", status: "active", description: "Decision step after validation." },
  { from: "small", to: "pay", label: "Yes", status: "active" },
  { from: "small", to: "dash", label: "No", status: "active" },
  {
    from: "dash",
    to: "api",
    type: "calls",
    label: "Approve claim",
    status: "active",
    description: "An approved claim goes back through routing. This makes a cycle.",
  },
  { from: "pay", to: "card", type: "calls", label: "Send payout", status: "active" },
  { from: "card", to: "pay", type: "calls", label: "Payout webhook", status: "active", description: "Parallel edge in the other direction." },
  { from: "pay", to: "pay", label: "Retry failed payout", status: "active", description: "Loop: retries up to three times." },
  { from: "pay", to: "queue", type: "publishes-event", label: "claim.paid", status: "active" },
  { from: "api", to: "fraud", type: "calls", label: "Score claim", status: "planned" },
  { from: "fraud", to: "risky", label: "Score", status: "proposed" },
  { from: "risky", to: "dash", label: "Yes: review", status: "proposed" },
  { from: "risky", to: "small", label: "No", status: "proposed" },
  { from: "db", to: "archive", type: "writes-to", label: "Nightly copy", status: "deprecated" },
  { from: "fax", to: "api", type: "calls", label: "Fax intake", status: "retired" },
  {
    from: "app",
    to: "dash",
    directed: false,
    label: "Share UI components",
    description: "Undirected: no direction, both use the same component library.",
  },
];

type SeedFlow = { name: string; description: string; steps: string[] };

// Each step is a node key. Between two steps, exactly one edge goes from the first node to the second, so the store finds it.
const FLOWS: SeedFlow[] = [
  {
    name: "Small claim is paid at once",
    description: "The main path. A customer submits a claim under $5,000, the Claims API routes it straight to payment, and the card processor confirms the payout.",
    steps: ["app", "api", "small", "pay", "card", "pay", "queue"],
  },
  {
    name: "Large claim needs an adjuster",
    description:
      "An edge case. A claim of $5,000 or more goes to the adjuster dashboard. After the adjuster approves it, the claim goes back through routing and is paid.",
    steps: ["app", "api", "small", "dash", "api", "small", "pay", "card", "pay", "queue"],
  },
];

export type SavedLayout = { positions: Record<string, Position>; routes: Position[][] };

// Makes the walkthrough graph with its saved ELK layout (walkthrough-layout.json), and publishes it as version 1, when
// the database does not have it.
export const WALKTHROUGH_NODES = NODES;
export const WALKTHROUGH_EDGES = EDGES;

export const ensureWalkthrough = (store: GraphStore) => {
  if (store.listGraphs().some(({ id }) => id === WALKTHROUGH_ID)) return false;
  const layout = LAYOUT as SavedLayout;
  store.createGraph(GRAPH, WALKTHROUGH_ID);
  store.updateGraph(WALKTHROUGH_ID, { direction: "vertical" });
  const ids = new Map<string, string>();
  for (const { key, ...input } of NODES) ids.set(key, store.createNodeInGraph(WALKTHROUGH_ID, input, layout.positions[key] ?? null).id);
  const id = (key: string) => {
    const value = ids.get(key);
    if (value == null) throw new Error(`The walkthrough has no node ${key}.`);
    return value;
  };
  const edgeIds = EDGES.map(({ from, to, ...input }) => store.createEdgeInGraph(WALKTHROUGH_ID, { ...input, source: id(from), target: id(to) }).id);
  store.setLayout(WALKTHROUGH_ID, {
    positions: Object.fromEntries(NODES.flatMap(({ key }) => (layout.positions[key] == null ? [] : [[id(key), layout.positions[key]]]))),
    routes: Object.fromEntries(edgeIds.flatMap((edgeId, i) => (layout.routes[i] == null ? [] : [[edgeId, layout.routes[i]]]))),
  });
  for (const { steps, ...flow } of FLOWS) store.createFlow(WALKTHROUGH_ID, { ...flow, steps: steps.map((key) => ({ nodeId: id(key) })) });
  store.publish(WALKTHROUGH_ID);
  return true;
};
