import type { ContentEdge, ContentNode, GraphContent, GraphVersionSummary, Properties, ProposalSummary } from "../model.ts";
import { termName } from "../vocabulary.ts";
import type { Selection } from "./canvas.tsx";
import { localTime } from "./graph-list.tsx";
import { Link } from "./router.tsx";
import { useVocabulary } from "./vocabulary.ts";

export type Shown = number | "draft";

const nameOf = (content: GraphContent, id: string) => content.nodes.find((node) => node.id === id)?.name ?? id;

const Facts = ({ facts }: { facts: [string, string | null][] }) => {
  const shown = facts.filter((fact): fact is [string, string] => fact[1] != null && fact[1] !== "");
  if (shown.length === 0) return null;
  return (
    <dl className="property-list">
      {shown.map(([term, value]) => [<dt key={`${term}-term`}>{term}</dt>, <dd key={`${term}-value`}>{value}</dd>])}
    </dl>
  );
};

const propertyFacts = (properties: Properties): [string, string][] =>
  Object.entries(properties).map(([key, value]) => [key, typeof value === "string" ? value : JSON.stringify(value)]);

const NodeView = ({ node, content, onSelect }: { node: ContentNode; content: GraphContent; onSelect: (selection: Selection) => void }) => {
  const vocabulary = useVocabulary();
  const outgoing = content.edges.filter((edge) => edge.source === node.id);
  const incoming = content.edges.filter((edge) => edge.target === node.id && edge.source !== node.id);
  const edgeName = (edge: ContentEdge) => (edge.label !== "" ? edge.label : (termName(vocabulary.relationshipTypes, edge.type) ?? ""));
  return (
    <section className="section">
      <h2>{termName(vocabulary.nodeTypes, node.type) ?? "Node"}</h2>
      <p className="endpoints">{node.name}</p>
      {node.description !== "" && <p className="hint">{node.description}</p>}
      <Facts
        facts={[
          ["Status", termName(vocabulary.statuses, node.status)],
          ["Intent", node.intent],
          ["Labels", node.labels.join(", ")],
          ...propertyFacts(node.properties),
        ]}
      />
      {outgoing.length > 0 && (
        <ul className="next-steps">
          {outgoing.map((edge) => (
            <li key={edge.id}>
              {edgeName(edge) !== "" && `${edgeName(edge)} `}→{" "}
              <button type="button" className="link" onClick={() => onSelect({ kind: "node", id: edge.target })}>
                {nameOf(content, edge.target)}
              </button>
            </li>
          ))}
        </ul>
      )}
      {incoming.length > 0 && (
        <ul className="next-steps">
          {incoming.map((edge) => (
            <li key={edge.id}>
              <button type="button" className="link" onClick={() => onSelect({ kind: "node", id: edge.source })}>
                {nameOf(content, edge.source)}
              </button>{" "}
              →{edgeName(edge) !== "" && ` ${edgeName(edge)}`}
            </li>
          ))}
        </ul>
      )}
      <p className="mono">{node.id}</p>
    </section>
  );
};

const EdgeView = ({ edge, content }: { edge: ContentEdge; content: GraphContent }) => {
  const vocabulary = useVocabulary();
  return (
    <section className="section">
      <h2>{termName(vocabulary.relationshipTypes, edge.type) ?? "Edge"}</h2>
      <p className="endpoints">
        {nameOf(content, edge.source)} {edge.directed ? "→" : "—"} {nameOf(content, edge.target)}
      </p>
      {edge.description !== "" && <p className="hint">{edge.description}</p>}
      <Facts
        facts={[
          ["Label", edge.label],
          ["Status", termName(vocabulary.statuses, edge.status)],
          ["Intent", edge.intent],
          ...propertyFacts(edge.properties),
        ]}
      />
      <p className="mono">{edge.id}</p>
    </section>
  );
};

export const ViewPanel = ({
  graphId,
  content,
  shown,
  published,
  versions,
  proposals,
  selection,
  onSelect,
  onShow,
}: {
  graphId: string;
  content: GraphContent;
  shown: Shown;
  published: number | null;
  versions: GraphVersionSummary[];
  proposals: ProposalSummary[];
  selection: Selection;
  onSelect: (selection: Selection) => void;
  onShow: (shown: Shown) => void;
}) => {
  const node = selection?.kind === "node" ? content.nodes.find(({ id }) => id === selection.id) : undefined;
  const edge = selection?.kind === "edge" ? content.edges.find(({ id }) => id === selection.id) : undefined;
  if (node != null) return <NodeView key={node.id} node={node} content={content} onSelect={onSelect} />;
  if (edge != null) return <EdgeView key={edge.id} edge={edge} content={content} />;
  return (
    <>
      <section className="section">
        <h2>Graph</h2>
        <p className="endpoints">{content.graph.name}</p>
        {content.graph.description !== "" && <p className="hint">{content.graph.description}</p>}
        <p className="hint">
          {content.nodes.length} nodes and {content.edges.length} edges. Select a node or an edge to see it. Click <b>Edit</b> to change the draft.
        </p>
        <p className="mono">{graphId}</p>
      </section>
      <section className="section">
        <h2>Proposals</h2>
        <p className="hint">A proposal is a changed copy of the graph, for example from Claude. Review it before you apply it.</p>
        {proposals.length === 0 ? (
          <p className="meta">No proposals.</p>
        ) : (
          <ul className="versions">
            {proposals.map((proposal) => (
              <li key={proposal.id}>
                <Link className="row-name" to={{ page: "proposal", graphId, proposalId: proposal.id }}>
                  {proposal.title}
                </Link>
                <span className={`pill ${proposal.status}`}>{proposal.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="section">
        <h2>Versions</h2>
        <p className="hint">Apps run a published version. Click a version to show it.</p>
        <ul className="versions">
          <li>
            <button type="button" className={`link${shown === "draft" ? " current" : ""}`} onClick={() => onShow("draft")}>
              Draft
            </button>
            <span className="meta">{published == null ? "not published" : "the editor changes it"}</span>
          </li>
          {versions.map((version) => (
            <li key={version.version}>
              <button type="button" className={`link${shown === version.version ? " current" : ""}`} onClick={() => onShow(version.version)}>
                Version {version.version}
                {version.version === published && " (latest)"}
              </button>
              <span className="meta">{localTime(version.publishedAt)}</span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
};
