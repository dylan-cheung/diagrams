import type { ReactNode } from "react";
import type { Term } from "../model.ts";
import { WALKTHROUGH_ID } from "../walkthrough.ts";
import { AppNav } from "./app-nav.tsx";
import { Link } from "./router.tsx";
import { useVocabulary } from "./vocabulary.ts";

const SECTIONS = [
  ["walkthrough", "Walkthrough"],
  ["graphs", "Graphs"],
  ["nodes", "Nodes"],
  ["edges", "Edges"],
  ["status", "Lifecycle status"],
  ["intent", "Intent"],
  ["shapes", "Kinds of graph"],
  ["versions", "Versions"],
  ["proposals", "Proposals"],
] as const;

const Section = ({ id, title, children }: { id: string; title: string; children: ReactNode }) => (
  <section id={id} className="guide-section">
    <h2>{title}</h2>
    {children}
  </section>
);

const SampleNode = ({ name, type, status, kind }: { name: string; type?: string | null; status?: Term | null; kind?: string }) => (
  <div className={`entity guide-node${type == null ? "" : ` type-${type}`}${status == null ? "" : ` status-${status.id}`}`}>
    {kind != null && <div className="entity-kind">{kind}</div>}
    <div className="entity-name">{name}</div>
    {status != null && (
      <div className="entity-meta">
        <span className="entity-status">{status.name}</span>
      </div>
    )}
  </div>
);

const SampleEdge = ({ type, status, directed = true }: { type?: string | null; status?: string | null; directed?: boolean }) => (
  <svg className="guide-edge" viewBox="0 0 120 16" aria-hidden="true">
    <line
      x1="4"
      y1="8"
      x2={directed ? 108 : 116}
      y2="8"
      className={`react-flow__edge-path${type == null ? "" : ` type-${type}`}${status == null ? "" : ` status-${status}`}`}
    />
    {directed && <path d="M106 3 L116 8 L106 13 Z" className="guide-arrow" />}
  </svg>
);

const TermTable = ({ terms, sample }: { terms: Term[]; sample: (term: Term) => ReactNode }) => (
  <table className="guide-table">
    <thead>
      <tr>
        <th>Looks like</th>
        <th>Id</th>
        <th>Meaning</th>
      </tr>
    </thead>
    <tbody>
      {terms.map((term) => (
        <tr key={term.id}>
          <td className="guide-sample">{sample(term)}</td>
          <td>
            <code>{term.id}</code>
          </td>
          <td>{term.description}</td>
        </tr>
      ))}
    </tbody>
  </table>
);

const FieldTable = ({ rows }: { rows: [string, string][] }) => (
  <table className="guide-table">
    <thead>
      <tr>
        <th>Field</th>
        <th>Use</th>
      </tr>
    </thead>
    <tbody>
      {rows.map(([field, use]) => (
        <tr key={field}>
          <td>
            <code>{field}</code>
          </td>
          <td>{use}</td>
        </tr>
      ))}
    </tbody>
  </table>
);

export const Guide = () => {
  const vocabulary = useVocabulary();

  return (
    <div className="app">
      <header className="toolbar">
        <h1>Diagram</h1>
        <AppNav current="guide" />
      </header>
      <div className="guide">
        <nav className="guide-nav" aria-label="Guide sections">
          {SECTIONS.map(([id, title]) => (
            <a key={id} href={`#${id}`}>
              {title}
            </a>
          ))}
        </nav>
        <article className="guide-body">
          <p className="guide-lead">
            Diagram keeps graphs: nodes that stand for things, and edges that connect them. Each node and edge can say what kind of thing it is (type), where it
            is in its life (status), what it is (description) and why it exists (intent). This page explains each part, and the kinds of graph that you can make.
          </p>

          <Section id="walkthrough" title="Walkthrough">
            <p>
              Open the <Link to={{ page: "graph", graphId: WALKTHROUGH_ID, mode: "view" }}>walkthrough graph</Link> to see each part of this guide in one
              realistic example. Select a node or an edge to read its description and intent. To make your own graph:
            </p>
            <ol>
              <li>
                On the <b>Graphs</b> page, click <b>+</b>. Give the graph a name and a purpose. The purpose says what question the graph answers.
              </li>
              <li>
                The graph opens in <b>Edit</b> mode. Click <b>Add node</b> for each thing in the graph.
              </li>
              <li>Select a node. In the inspector, set its name, type, status, description and intent.</li>
              <li>Drag from any dot on one node to any dot on another node. This adds an edge. The node where the drag starts is the source. Select the edge and set its type, label and direction.</li>
              <li>
                Click <b>Auto layout</b> to place the nodes. Use <b>Horizontal</b> or <b>Vertical</b> to set the flow direction.
              </li>
              <li>
                Click <b>Publish</b>. This saves a version that does not change. Apps that run the graph use a published version.
              </li>
              <li>
                Later, a person or Claude can send a <b>proposal</b>. Review it in <b>View</b> mode, then apply or discard it.
              </li>
            </ol>
          </Section>

          <Section id="graphs" title="Graphs">
            <p>
              A graph is a named set of nodes and edges, with a position for each node. Every node and edge is in at least one graph. When no graph holds a node or an
              edge, the app deletes it.
            </p>
            <ul>
              <li>
                <b>Name</b> and <b>purpose</b> (<code>description</code>) are required. The purpose says why the graph exists, for example "How a claim moves from
                intake to payment".
              </li>
              <li>
                <b>Shared nodes.</b> The API can put one node in many graphs, with a different position in each graph. An edit to a shared node changes it in every
                graph that holds it.
              </li>
              <li>A graph can hold an edge only when it holds both nodes of that edge.</li>
              <li>
                <b>Draft and versions.</b> The editable graph is the draft. A published version is a copy of the draft that does not change.
              </li>
            </ul>
          </Section>

          <Section id="nodes" title="Nodes">
            <p>A node is one thing: a service, a screen, a table, a step or a decision. A node does not store its edges. Only the name is required.</p>
            <FieldTable
              rows={[
                ["name", "The short name that shows on the canvas."],
                ["type", "What kind of thing the node is. Use an id from the node types below, or leave it empty."],
                ["status", "Where the node is in its life. See Lifecycle status."],
                ["description", "What the node is or does."],
                ["intent", "Why the node exists. See Intent."],
                ["labels", "Free tags, for example a team or an area. They show under the name."],
                ["properties", "Extra key-value data. A value is a string, a number, a boolean or null."],
              ]}
            />
            <h3>Node types</h3>
            <p>The node type sets the color of the node. A node without a type shows in the default look.</p>
            <TermTable terms={vocabulary.nodeTypes} sample={(term) => <SampleNode name={term.name} type={term.id} kind={term.name} />} />
          </Section>

          <Section id="edges" title="Edges">
            <p>An edge connects two nodes: the source and the target. It is its own entity, so it has its own fields. When you delete a node, its edges are deleted too.</p>
            <FieldTable
              rows={[
                ["source, target", "The two nodes. For a loop, they are the same node."],
                ["directed", "True: the edge goes from the source to the target and shows an arrow. False: the edge has no direction and no arrow."],
                ["type", "What the connection means. Use an id from the relationship types below, or leave it empty."],
                ["label", "The text on the edge. When the label is empty, the edge shows its type name."],
                ["status, description, intent", "The same use as on a node."],
                ["properties", "Extra key-value data."],
              ]}
            />
            <h3>Edge rules</h3>
            <ul>
              <li>
                <b>Direction.</b> A directed edge reads "source → target", for example "Checkout calls Payments". Use an undirected edge when the link has no
                direction, for example "these two modules are related".
              </li>
              <li>
                <b>Parallel edges.</b> Two nodes can have many edges between them, for example one edge that calls and one edge that reads. The canvas draws them
                side by side.
              </li>
              <li>
                <b>Loops.</b> An edge can start and end on the same node, for example a retry. To add a loop, drag from one dot to another dot on the same node.
              </li>
              <li>
                <b>Cycles.</b> Edges can form a cycle, for example A → B → C → A.
              </li>
              <li>
                <b>Routes.</b> <b>Auto layout</b> draws each edge around the nodes, with right-angle bends and few crossings. When you drag a node, its edges
                become direct lines until you click <b>Auto layout</b> again.
              </li>
            </ul>
            <h3>Relationship types</h3>
            <p>Event edges show as long dashes. A depends-on edge shows as dots.</p>
            <TermTable terms={vocabulary.relationshipTypes} sample={(term) => <SampleEdge type={term.id} />} />
          </Section>

          <Section id="status" title="Lifecycle status">
            <p>
              The status is on nodes and edges. It shows the state of the design, so one graph can show what exists now and what is planned. Proposed and planned
              items show with a dashed border. Deprecated and retired items show faded.
            </p>
            <TermTable
              terms={vocabulary.statuses}
              sample={(term) => (
                <div className="guide-pair">
                  <SampleNode name="Node" type="service" status={term} />
                  <SampleEdge status={term.id} />
                </div>
              )}
            />
          </Section>

          <Section id="intent" title="Intent">
            <p>
              <b>Intent says why an element exists. Description says what it is.</b> A description can change when the code changes. The intent changes only when
              the goal changes.
            </p>
            <table className="guide-table">
              <thead>
                <tr>
                  <th>Element</th>
                  <th>Description (what)</th>
                  <th>Intent (why)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Payments service</td>
                  <td>Charges cards and keeps the payment state.</td>
                  <td>Keep payment state in one place.</td>
                </tr>
                <tr>
                  <td>Orders → Events queue</td>
                  <td>Publishes an event when an order is placed.</td>
                  <td>Let other services react to orders without a direct call to Orders.</td>
                </tr>
                <tr>
                  <td>Decision: "Is the claim small?"</td>
                  <td>Checks the amount against the limit.</td>
                  <td>Send small claims straight to payment, to make them faster.</td>
                </tr>
              </tbody>
            </table>
            <p>Use the intent to:</p>
            <ul>
              <li>Review a change. A proposal that breaks an intent needs a reason.</li>
              <li>Give Claude the design goals. Claude reads the intent through the API before it proposes a change.</li>
              <li>Find elements to remove. When no intent needs an element, it can be retired.</li>
            </ul>
            <p>Keep the intent to one sentence. Write the goal, not the method.</p>
          </Section>

          <Section id="shapes" title="Kinds of graph">
            <p>
              Diagram uses the labeled property graph model of ISO GQL. In graph theory terms, a graph is a <b>mixed pseudograph</b>: it allows directed and
              undirected edges, parallel edges, loops and cycles. So you can make all of these:
            </p>
            <table className="guide-table">
              <thead>
                <tr>
                  <th>Kind</th>
                  <th>How to make it</th>
                  <th>Example use</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Directed graph</td>
                  <td>All edges directed.</td>
                  <td>Service calls, data flow.</td>
                </tr>
                <tr>
                  <td>Undirected graph</td>
                  <td>All edges undirected.</td>
                  <td>Related modules, team contacts.</td>
                </tr>
                <tr>
                  <td>Mixed graph</td>
                  <td>Some edges directed, some not.</td>
                  <td>A system map with calls and loose links.</td>
                </tr>
                <tr>
                  <td>Directed acyclic graph (DAG)</td>
                  <td>Directed edges and no cycles.</td>
                  <td>Build or deploy order, dependencies.</td>
                </tr>
                <tr>
                  <td>Tree</td>
                  <td>One root. Each other node has one incoming edge.</td>
                  <td>A decision tree with decision nodes and labeled edges ("yes", "no").</td>
                </tr>
                <tr>
                  <td>State machine</td>
                  <td>Directed edges with cycles and loops.</td>
                  <td>Claim states, retries.</td>
                </tr>
                <tr>
                  <td>Multigraph</td>
                  <td>Two or more edges between the same nodes.</td>
                  <td>A service that calls another service and also reads its events.</td>
                </tr>
              </tbody>
            </table>
            <p>The app does not check the kind. It does not stop a cycle in a graph that you mean as a DAG.</p>
            <p>Not supported:</p>
            <ul>
              <li>Hyperedges: one edge that connects more than two nodes. Use a node in the middle.</li>
              <li>Nested nodes: a node inside a node. Use a separate graph, or a label.</li>
              <li>Schemas that limit which types can connect.</li>
            </ul>
          </Section>

          <Section id="versions" title="Versions">
            <p>
              <b>Publish</b> saves version n + 1: a copy of the graph, its nodes with positions, and its edges. A version does not change, and it stays after the
              graph is deleted.
            </p>
            <ul>
              <li>Apps that run a graph, for example a voice app that walks a decision tree, must run a published version. Each run records the graph id and version.</li>
              <li>A copy is necessary because nodes are shared: an edit for one graph can change other graphs.</li>
              <li>When nothing changed since the latest version, Publish returns that version. A change to positions only is not a change.</li>
              <li>
                In <b>View</b> mode, pick a version to show it. The graph list shows a <span className="pill draft">draft</span> mark when the draft has changes
                that are not published.
              </li>
            </ul>
          </Section>

          <Section id="proposals" title="Proposals">
            <p>A proposal is a changed copy of a graph that you review before it changes the graph. Claude or any API client can make one.</p>
            <ol>
              <li>The client reads the graph and sends the full proposed graph, with a title, a rationale and a work item.</li>
              <li>
                In <b>View</b> mode, open the proposal from <b>Proposals</b>.
              </li>
              <li>
                The <b>Ledger</b> tab lists each added, removed and changed node and edge. The <b>Graph</b> tab shows both graphs on one canvas in color.
              </li>
              <li>
                Click <b>Apply and publish</b> to change the graph and publish a version. Click <b>Apply to draft</b> to change only the draft. Or discard the
                proposal.
              </li>
            </ol>
            <p>
              Caution: apply replaces edits in the draft that are not published. A warning shows when a changed node is also in other graphs.
            </p>
          </Section>
        </article>
      </div>
    </div>
  );
};
